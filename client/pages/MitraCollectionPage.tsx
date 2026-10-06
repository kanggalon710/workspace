import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { waLink } from "@/lib/wa";
import type { MitraCollection, MitraCollectionActivity } from "@shared/schema";
import {
  MITRA_COLLECTION_STAGES, currentPeriod, listRecentPeriods, formatPeriodLabel,
  mitraStageCloses, type MitraCollectionStageKey,
} from "@shared/mitraCollection";
import { formatRupiah } from "@shared/currency";
import { StatTile } from "@/components/ui/stat-tile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Landmark, Loader2, RefreshCw, Move, ChevronDown, Search, X,
  Wallet, CheckCircle2, AlertTriangle, Clock, MessageCircle, Phone, StickyNote, Footprints,
} from "lucide-react";
import { matchesSearch } from "@/lib/search";

/** Kartu + kontak live hasil join server (lihat storage.getMitraCollections). */
type MitraCollectionRow = MitraCollection & {
  phone: string | null;
  contactName: string | null;
  contactPhone: string | null;
};

/** Warna kolom per stage - design token classnames (bukan hex). */
const STAGE_DOT: Record<string, string> = {
  belum_bayar: "bg-destructive",
  dihubungi: "bg-info",
  janji_bayar: "bg-warning",
  lunas: "bg-success",
  menunggak: "bg-muted-foreground",
};

const ACTIVITY_TYPES = [
  { key: "note", label: "Catatan", icon: StickyNote },
  { key: "call", label: "Telepon", icon: Phone },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "visit", label: "Kunjungan", icon: Footprints },
] as const;

const ACTIVITY_LABELS: Record<string, string> = {
  note: "Catatan", call: "Telepon", whatsapp: "WhatsApp", visit: "Kunjungan",
  stage_change: "Pindah tahap", amount_set: "Nominal diubah", auto_opened: "Kartu dibuat otomatis",
};

const STAGE_LABEL = Object.fromEntries(MITRA_COLLECTION_STAGES.map((s) => [s.key, s.label]));

function fmtDateTime(s?: string | null): string {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Isi aktivitas: stage_change/amount_set menyimpan JSON {from,to} - render manusiawi. */
function activityText(a: MitraCollectionActivity): string {
  if (a.type === "stage_change" || a.type === "amount_set") {
    try {
      const j = JSON.parse(a.content ?? "{}");
      if (a.type === "stage_change") {
        const base = `${STAGE_LABEL[j.from] ?? j.from} → ${STAGE_LABEL[j.to] ?? j.to}`;
        return j.note ? `${base} - ${j.note}` : base;
      }
      return `${formatRupiah(j.from, "kosong")} → ${formatRupiah(j.to, "kosong")}`;
    } catch { /* fallthrough: tampilkan raw */ }
  }
  if (a.type === "auto_opened") return "Kartu tagihan periode ini dibuat otomatis";
  return a.content ?? "";
}

export default function MitraCollectionPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const canEdit = canWrite("collections_mitra");

  const [period, setPeriod] = useState(currentPeriod());
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [stageDialogFor, setStageDialogFor] = useState<{ id: number; fromStage: string; targetStage: MitraCollectionStageKey; subjectName: string } | null>(null);
  const [stageNote, setStageNote] = useState("");
  const [stagePromiseDate, setStagePromiseDate] = useState("");
  // Drag-drop state (pola CollectionPipelinePage)
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  // -- Queries --
  const { data: cards, isLoading, refetch, isFetching } = useQuery<MitraCollectionRow[]>({
    queryKey: ["/api/mitra-collections", period],
    queryFn: () => api.get<MitraCollectionRow[]>(`/mitra-collections?period=${period}`),
    refetchInterval: (query) => (query.state.error ? false : 60_000),
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const { data: stats } = useQuery<{
    totalCards: number; totalAmount: number; paidCount: number; paidAmount: number;
    outstandingAmount: number; byStage: Record<string, number>;
  }>({
    queryKey: ["/api/mitra-collections/stats", period],
    queryFn: () => api.get(`/mitra-collections/stats?period=${period}`),
    refetchInterval: (query) => (query.state.error ? false : 60_000),
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const { data: knownPeriods } = useQuery<string[]>({
    queryKey: ["/api/mitra-collections/periods"],
    queryFn: () => api.get<string[]>("/mitra-collections/periods"),
    staleTime: 5 * 60_000,
  });

  // Dropdown periode: gabungan periode ber-data + 12 bulan terakhir, terbaru dulu.
  const periodOptions = useMemo(() => {
    const set = new Set([...(knownPeriods ?? []), ...listRecentPeriods(12)]);
    return Array.from(set).sort().reverse();
  }, [knownPeriods]);

  const searchFiltered = useMemo(() => {
    if (!search.trim()) return cards ?? [];
    return (cards ?? []).filter((c) =>
      matchesSearch(search, [c.subjectName, c.phone, c.contactName, c.contactPhone], c.phone),
    );
  }, [cards, search]);

  const byStage = useMemo(() => {
    const map: Record<string, MitraCollectionRow[]> = {};
    for (const s of MITRA_COLLECTION_STAGES) map[s.key] = [];
    for (const c of searchFiltered) (map[c.stage] ?? (map[c.stage] = [])).push(c);
    return map;
  }, [searchFiltered]);

  const detail = useMemo(() => (cards ?? []).find((c) => c.id === detailId) ?? null, [cards, detailId]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/mitra-collections", period] });
    qc.invalidateQueries({ queryKey: ["/api/mitra-collections/stats", period] });
  };

  // -- Mutations --
  const stageMut = useMutation({
    mutationFn: (data: { id: number; stage: string; note?: string; promiseDate?: string }) =>
      api.patch(`/mitra-collections/${data.id}/stage`, data),
    onSuccess: () => {
      invalidate();
      toast.success("Tahap berhasil dipindah");
      setStageDialogFor(null);
      setStageNote("");
      setStagePromiseDate("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleMoveStage = (id: number, targetStage: MitraCollectionStageKey) => {
    if (!canEdit) return toast.error("Tidak punya akses write Collection Mitra");
    const card = (cards ?? []).find((c) => c.id === id);
    if (!card || card.stage === targetStage) return;
    setStageDialogFor({ id, fromStage: card.stage, targetStage, subjectName: card.subjectName });
    setStageNote("");
    setStagePromiseDate(card.promiseDate?.slice(0, 10) ?? "");
  };

  // -- Drag-and-drop handlers (pola CollectionPipelinePage) --
  const handleDragStart = (id: number) => (e: React.DragEvent) => {
    if (!canEdit) { e.preventDefault(); return; }
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
  };
  const handleDragEnd = () => { setDraggingId(null); setDragOverStage(null); };
  const handleColumnDragOver = (stage: string) => (e: React.DragEvent) => {
    if (!canEdit) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverStage !== stage) setDragOverStage(stage);
  };
  const handleColumnDrop = (stage: MitraCollectionStageKey) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverStage(null);
    const id = Number(e.dataTransfer.getData("text/plain")) || draggingId;
    setDraggingId(null);
    if (id) handleMoveStage(id, stage);
  };

  return (
    <div data-section="mitra-collections-page" className="flex flex-col h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)] overflow-hidden">
      {/* ==== Header (non-scroll): judul + periode + stats + pencarian ==== */}
      <div className="px-3 md:px-6 pt-3 md:pt-6 space-y-3 shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2">
              <Landmark className="h-5 w-5 md:h-6 md:w-6 text-success shrink-0" />
              Collection Mitra
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5 line-clamp-1 md:line-clamp-none">
              Tagihan bulanan mitra ke JABNET - kartu dibuat otomatis tiap periode, nominal diisi Finance.
            </p>
          </div>
          <div className="flex gap-1.5 items-center shrink-0">
            {/* Pemilih periode bulanan */}
            <div className="relative">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                aria-label="Pilih periode"
                className="h-8 pl-3 pr-8 rounded-lg border border-border bg-card text-xs font-semibold text-foreground appearance-none cursor-pointer hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {periodOptions.map((p) => (
                  <option key={p} value={p}>{formatPeriodLabel(p)}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} aria-label="Muat ulang" className="h-8 w-8 p-0">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* KPI periode terpilih */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
          <StatTile label="Total Tagihan" value={formatRupiah(stats?.totalAmount ?? 0)} icon={Wallet} accent="primary" description={`${stats?.totalCards ?? 0} mitra`} />
          <StatTile label="Sudah Lunas" value={formatRupiah(stats?.paidAmount ?? 0)} icon={CheckCircle2} accent="success" description={`${stats?.paidCount ?? 0} mitra lunas`} />
          <StatTile label="Belum Lunas" value={formatRupiah(stats?.outstandingAmount ?? 0)} icon={Clock} accent="warning" description="Piutang berjalan" />
          <StatTile label="Menunggak" value={String(stats?.byStage?.menunggak ?? 0)} icon={AlertTriangle} accent="danger" description="Mitra menunggak" />
        </div>

        {/* Pencarian nama mitra / no. HP */}
        <div className="flex items-center gap-2 pb-2">
          <div className="relative min-w-[200px] flex-1 sm:flex-none sm:w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama mitra / no. HP"
              aria-label="Cari mitra"
              className="h-8 w-full pl-8 pr-8 rounded-lg border border-border bg-card text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} aria-label="Bersihkan pencarian" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {search.trim() ? `${searchFiltered.length} / ${(cards ?? []).length}` : (cards ?? []).length} kartu
          </span>
        </div>
      </div>

      {/* ==== Kanban board - horizontal scroll outer, vertical scroll per-kolom ==== */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div data-section="mitra-kanban-board" className="flex-1 overflow-x-auto overflow-y-hidden px-4 md:px-6 pb-4 kanban-scrollbar snap-x snap-mandatory md:snap-none">
          <div className="flex gap-3 h-full items-stretch w-max">
            {MITRA_COLLECTION_STAGES.map((s) => {
              const isDropTarget = dragOverStage === s.key;
              const list = byStage[s.key] ?? [];
              return (
                <div
                  key={s.key}
                  data-stage={s.key}
                  onDragOver={handleColumnDragOver(s.key)}
                  onDragLeave={() => setDragOverStage((prev) => (prev === s.key ? null : prev))}
                  onDrop={handleColumnDrop(s.key)}
                  className={`w-[82vw] max-w-[19rem] sm:w-72 shrink-0 snap-start flex flex-col h-full rounded-xl p-3 transition-colors ${isDropTarget ? "bg-primary/10 ring-2 ring-primary/40" : "bg-muted/40"}`}
                >
                  <div className="flex items-center justify-between mb-3 px-1 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${STAGE_DOT[s.key] ?? "bg-muted-foreground"}`} />
                      <span className="text-sm font-semibold uppercase tracking-wide">{s.label}</span>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">{list.length}</Badge>
                  </div>
                  <div className="flex-1 overflow-y-auto column-scrollbar space-y-2 pr-1 pb-2 min-h-0">
                    {list.map((c) => (
                      <div
                        key={c.id}
                        draggable={canEdit}
                        onDragStart={handleDragStart(c.id)}
                        onDragEnd={handleDragEnd}
                        className={draggingId === c.id ? "opacity-40" : ""}
                      >
                        {/* Kartu mitra: nama + nominal + janji bayar */}
                        <button
                          type="button"
                          onClick={() => setDetailId(c.id)}
                          className="w-full text-left rounded-lg border border-border bg-card p-3 shadow-elev-sm hover:shadow-elev-md transition-shadow cursor-pointer min-h-[44px]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-sm font-semibold truncate">{c.subjectName}</span>
                            {c.stage === "lunas" && <CheckCircle2 className="h-4 w-4 text-success shrink-0" aria-hidden="true" />}
                          </div>
                          <div className="mt-1 text-xs tabular-nums font-semibold">
                            {c.amount != null
                              ? <span className="text-foreground">{formatRupiah(c.amount)}</span>
                              : <span className="text-warning">Nominal belum diisi</span>}
                          </div>
                          {c.promiseDate && !mitraStageCloses(c.stage) && (
                            <div className="mt-1 text-2xs text-muted-foreground">Janji bayar: {c.promiseDate.slice(0, 10)}</div>
                          )}
                          {c.paidAt && <div className="mt-1 text-2xs text-success">Lunas {fmtDateTime(c.paidAt)}</div>}
                        </button>
                      </div>
                    ))}
                    {list.length === 0 && (
                      <div className={`text-xs text-center py-6 border border-dashed rounded-lg transition-colors ${isDropTarget ? "border-primary/60 text-primary bg-primary/5" : "text-muted-foreground"}`}>
                        {isDropTarget ? <><Move className="h-4 w-4 inline mr-1" />Drop di sini</> : "Kosong"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dialog konfirmasi pindah tahap */}
      <Dialog open={!!stageDialogFor} onOpenChange={(o) => !o && setStageDialogFor(null)}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          {stageDialogFor && (
            <>
              <DialogHeader>
                <DialogTitle>Pindah ke {STAGE_LABEL[stageDialogFor.targetStage]}</DialogTitle>
                <DialogDescription>
                  {stageDialogFor.subjectName}: {STAGE_LABEL[stageDialogFor.fromStage] ?? stageDialogFor.fromStage} → {STAGE_LABEL[stageDialogFor.targetStage]}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {stageDialogFor.targetStage === "janji_bayar" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="mitra-promise-date">Tanggal janji bayar</Label>
                    <Input id="mitra-promise-date" type="date" value={stagePromiseDate} onChange={(e) => setStagePromiseDate(e.target.value)} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="mitra-stage-note">Catatan (opsional)</Label>
                  <Textarea id="mitra-stage-note" value={stageNote} onChange={(e) => setStageNote(e.target.value)} placeholder="Hasil follow-up, kesepakatan, dll." rows={3} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setStageDialogFor(null)}>Batal</Button>
                  <Button
                    loading={stageMut.isPending}
                    onClick={() => stageMut.mutate({
                      id: stageDialogFor.id,
                      stage: stageDialogFor.targetStage,
                      note: stageNote.trim() || undefined,
                      promiseDate: stageDialogFor.targetStage === "janji_bayar" ? stagePromiseDate : undefined,
                    })}
                  >
                    Pindahkan
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail kartu - key memaksa instance baru per kartu (state form tidak bocor antar-kartu) */}
      <MitraCollectionDetail
        key={detailId ?? "none"}
        card={detail}
        period={period}
        canEdit={canEdit}
        onClose={() => setDetailId(null)}
        onMoveStage={handleMoveStage}
        onChanged={invalidate}
      />
    </div>
  );
}

/** Dialog detail kartu: nominal (input Rp), catatan, kontak WA, log aktivitas + tambah follow-up. */
function MitraCollectionDetail({ card, period, canEdit, onClose, onMoveStage, onChanged }: {
  card: MitraCollectionRow | null;
  period: string;
  canEdit: boolean;
  onClose: () => void;
  onMoveStage: (id: number, stage: MitraCollectionStageKey) => void;
  onChanged: () => void;
}) {
  const [amountInput, setAmountInput] = useState(() => (card?.amount != null ? String(card.amount) : ""));
  const [notesInput, setNotesInput] = useState(card?.notes ?? "");
  const [activityType, setActivityType] = useState<string>("note");
  const [activityContent, setActivityContent] = useState("");

  const { data: activities, refetch: refetchActivities } = useQuery<MitraCollectionActivity[]>({
    queryKey: ["/api/mitra-collections", card?.id, "activities"],
    queryFn: () => api.get<MitraCollectionActivity[]>(`/mitra-collections/${card!.id}/activities`),
    enabled: card != null,
    staleTime: 15_000,
  });

  const saveMut = useMutation({
    mutationFn: (patch: { amount?: number | null; notes?: string }) =>
      api.patch(`/mitra-collections/${card!.id}`, patch),
    onSuccess: () => {
      onChanged();
      refetchActivities();
      toast.success("Perubahan disimpan");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const activityMut = useMutation({
    mutationFn: () => api.post(`/mitra-collections/${card!.id}/activities`, { type: activityType, content: activityContent.trim() }),
    onSuccess: () => {
      setActivityContent("");
      refetchActivities();
      toast.success("Aktivitas dicatat");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!card) return null;
  const phone = card.contactPhone || card.phone;

  const saveAmountAndNotes = () => {
    const parsed = amountInput.trim() === "" ? null : Number(amountInput.replace(/[^0-9]/g, ""));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) return toast.error("Nominal tidak valid");
    saveMut.mutate({ amount: parsed, notes: notesInput });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5 text-success" aria-hidden="true" />
            {card.subjectName}
          </DialogTitle>
          <DialogDescription>
            Tagihan {formatPeriodLabel(period)} · Tahap: {STAGE_LABEL[card.stage] ?? card.stage}
            {card.paidAt ? ` · Lunas ${fmtDateTime(card.paidAt)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {/* Kontak */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {card.contactName && <span className="text-muted-foreground">PIC: <span className="text-foreground font-medium">{card.contactName}</span></span>}
            {phone && (
              <a
                href={waLink(phone, `Halo ${card.contactName || card.subjectName}, kami dari JABNET ingin konfirmasi tagihan periode ${formatPeriodLabel(period)}.`)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-success/10 text-success font-semibold hover:bg-success/20 transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                WhatsApp {phone}
              </a>
            )}
          </div>

          {/* Nominal + catatan */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="mitra-amount">Nominal tagihan (Rp)</Label>
              <Input
                id="mitra-amount"
                type="text"
                inputMode="numeric"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="cth. 1500000"
                disabled={!canEdit}
              />
              <p className="text-2xs text-muted-foreground">
                {amountInput ? `= ${formatRupiah(Number(amountInput))}` : "Nominal belum diisi - otomatis terisi dari periode sebelumnya bila ada."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mitra-notes">Catatan kartu</Label>
              <Textarea id="mitra-notes" value={notesInput} onChange={(e) => setNotesInput(e.target.value)} rows={2} disabled={!canEdit} placeholder="Catatan umum tagihan mitra ini" />
            </div>
            {canEdit && (
              <Button size="sm" loading={saveMut.isPending} onClick={saveAmountAndNotes}>Simpan Perubahan</Button>
            )}
          </div>

          {/* Pindah tahap cepat */}
          {canEdit && (
            <div className="space-y-1.5">
              <Label>Pindah tahap</Label>
              <div className="flex gap-1.5 flex-wrap">
                {MITRA_COLLECTION_STAGES.filter((s) => s.key !== card.stage).map((s) => (
                  <Button key={s.key} size="sm" variant="outline" onClick={() => onMoveStage(card.id, s.key)}>
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Tambah aktivitas follow-up */}
          {canEdit && (
            <div className="space-y-1.5">
              <Label>Catat follow-up</Label>
              <div className="flex gap-1.5 flex-wrap">
                {ACTIVITY_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActivityType(t.key)}
                    aria-pressed={activityType === t.key}
                    className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border text-xs font-medium transition-colors ${activityType === t.key ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}
                  >
                    <t.icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={activityContent} onChange={(e) => setActivityContent(e.target.value)} placeholder="Hasil follow-up..." onKeyDown={(e) => { if (e.key === "Enter" && activityContent.trim()) activityMut.mutate(); }} />
                <Button size="sm" disabled={!activityContent.trim()} loading={activityMut.isPending} onClick={() => activityMut.mutate()}>Catat</Button>
              </div>
            </div>
          )}

          {/* Riwayat aktivitas */}
          <div className="space-y-1.5">
            <Label>Riwayat</Label>
            <ul className="space-y-2">
              {(activities ?? []).map((a) => (
                <li key={a.id} className="text-xs rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{ACTIVITY_LABELS[a.type] ?? a.type}</span>
                    <span className="text-muted-foreground tabular-nums">{fmtDateTime(a.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground break-words">{activityText(a)}</p>
                </li>
              ))}
              {(activities ?? []).length === 0 && (
                <li className="text-xs text-muted-foreground py-3 text-center border border-dashed rounded-lg">Belum ada aktivitas.</li>
              )}
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
