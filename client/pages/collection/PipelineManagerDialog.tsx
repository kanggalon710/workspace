import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { COLLECTION_OWNER_DIVISIONS, type Collection, type CollectionStageRow } from "@shared/schema";
import { isSharedStage, parseOwnerDivisions } from "@shared/collectionSop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Trash2, GripVertical, Plus, ListTree } from "lucide-react";
import { isStageActive, SELECTABLE_OWNER_DIVISIONS } from "./shared";

export const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "none", label: "- (biasa)" },
  { value: "entry", label: "Awal / Masuk" },
  { value: "paid", label: "Lunas / Reaktivasi" },
  { value: "dismantel", label: "Dismantel (Bongkar)" },
  { value: "writeoff", label: "Write-off / Loss" },
  { value: "overdue", label: "Overdue / Lewat Tenggat" },
];

// Aksi saat kartu di stage ini overdue (lewat tenggat).
export const OVERDUE_ACTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "badge", label: "Tandai (badge)" },
  { value: "move", label: "Pindah ke Overdue" },
  { value: "off", label: "Nonaktif" },
];

// Urutan grup owner untuk view penuh (/collections). Shared selalu terakhir.
export const OWNER_GROUP_ORDER = ["collections", "finance", "cs", "marketing", "legal"];
// Stage multi-divisi dikelompokkan di bawah divisi PERTAMA di set-nya (biar tak duplikat baris);
// checkbox di baris menampilkan set lengkapnya. Shared → grup "__shared".
export const groupKeyOf = (s: CollectionStageRow): string =>
  isSharedStage(s as any) ? "__shared" : (parseOwnerDivisions((s as any).ownerDivision)[0] ?? "__shared");
export const groupRank = (k: string): number => k === "__shared" ? 999 : (OWNER_GROUP_ORDER.indexOf(k) >= 0 ? OWNER_GROUP_ORDER.indexOf(k) : 500);
export const groupLabelOf = (k: string): string =>
  k === "__shared" ? "Shared (Semua Divisi)" : (COLLECTION_OWNER_DIVISIONS.find((o) => o.value === k)?.label ?? k.toUpperCase());

export function PipelineManagerDialog({ open, onClose, stages, cardCounts, division, canManage }: {
  open: boolean;
  onClose: () => void;
  stages: CollectionStageRow[];
  cardCounts: Record<string, number>;
  division?: "cs" | "marketing";
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["/api/collections/stages"] });
    qc.invalidateQueries({ queryKey: ["/api/collections"] });
    qc.invalidateQueries({ queryKey: ["/api/collections/stats"] });
  };

  // Urutan lokal untuk drag-drop; SELALU daftar penuh (semua stage) - supaya reorder
  // mengirim posisi lengkap & tidak bentrok dgn stage tersembunyi. Display di-scope/grup.
  const [order, setOrder] = useState<CollectionStageRow[]>(stages);
  useEffect(() => { setOrder(stages); }, [stages]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CollectionStageRow | null>(null);

  const createMut = useMutation({
    // Stage baru mewarisi divisi view (cs/marketing); dari view penuh default "collections".
    mutationFn: () => api.post("/collections/stages", { label: "Stage Baru", color: "#94A3B8", role: "none", ownerDivision: division ?? "collections" }),
    onSuccess: () => { invalidate(); toast.success("Stage ditambahkan"); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.patch(`/collections/stages/${id}`, data),
    onSuccess: () => invalidate(),
    onError: (e: any) => { toast.error(e.message); invalidate(); },
  });
  const reorderMut = useMutation({
    mutationFn: (orderedIds: number[]) => api.patch("/collections/stages/reorder", { orderedIds }),
    onSuccess: () => invalidate(),
    onError: (e: any) => { toast.error(e.message); invalidate(); },
  });

  // Reorder hanya dalam grup yang sama (owner sama) - agar owner tak berubah karena drag.
  const onDragOver = (overId: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragId === null || dragId === overId) return;
    const dragged = order.find((s) => s.id === dragId);
    const over = order.find((s) => s.id === overId);
    if (!dragged || !over || groupKeyOf(dragged) !== groupKeyOf(over)) return;
    setOrder((prev) => {
      const from = prev.findIndex((s) => s.id === dragId);
      const to = prev.findIndex((s) => s.id === overId);
      if (from < 0 || to < 0) return prev;
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  };
  const commitOrder = () => {
    setDragId(null);
    reorderMut.mutate(order.map((s) => s.id)); // kirim urutan PENUH
  };

  // Scope display ke divisi (view CS/Marketing = stage divisi + shared), lalu grup per owner.
  const visible = division
    ? order.filter((s) => parseOwnerDivisions((s as any).ownerDivision).includes(division) || isSharedStage(s as any))
    : order;
  const groups = (() => {
    const map = new Map<string, CollectionStageRow[]>();
    for (const s of visible) {
      const k = groupKeyOf(s);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items })).sort((a, b) => groupRank(a.key) - groupRank(b.key));
  })();

  const renderStageCard = (s: CollectionStageRow) => {
    const count = cardCounts[s.key] ?? 0;
    const active = isStageActive(s);
    const roleLocked = s.role === "entry" || s.role === "paid"; // tak boleh dinonaktifkan
    // SET divisi terpilih; kosong = Shared (tampil ke semua divisi).
    const ownerSet = parseOwnerDivisions((s as any).ownerDivision);
    const isShared = ownerSet.length === 0;
    // Toggle 1 divisi on/off → hitung set baru → CSV (atau null kalau jadi kosong = shared).
    const toggleDivision = (value: string, checked: boolean) => {
      const next = checked ? [...ownerSet, value] : ownerSet.filter((d) => d !== value);
      const csv = SELECTABLE_OWNER_DIVISIONS.filter((o) => next.includes(o.value)).map((o) => o.value).join(",");
      updateMut.mutate({ id: s.id, data: { ownerDivision: csv || null } });
    };
    return (
      /* One editable stage row in the pipeline manager */
      <div
        key={s.id}
        data-section="pipeline-stage-row"
        data-stage-key={s.key}
        onDragOver={onDragOver(s.id)}
        onDrop={commitOrder}
        className={`group rounded-xl border bg-card p-3 shadow-elev-sm transition-all ${dragId === s.id ? "opacity-60 ring-2 ring-primary/40" : "hover:border-primary/30"} ${active ? "" : "opacity-60"}`}
      >
        {/* Baris 1: seret + warna + nama + jumlah kartu + hapus */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            draggable={canManage}
            onDragStart={() => setDragId(s.id)}
            onDragEnd={() => setDragId(null)}
            className="shrink-0 cursor-grab rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
            title="Seret untuk mengurutkan (dalam grup divisi)"
            aria-label="Seret untuk mengurutkan"
            disabled={!canManage}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <label className="relative shrink-0" title="Warna stage">
            <input
              type="color"
              defaultValue={s.color}
              key={`color-${s.id}-${s.color}`}
              disabled={!canManage}
              onBlur={(e) => { if (e.target.value !== s.color) updateMut.mutate({ id: s.id, data: { color: e.target.value } }); }}
              className="size-8 cursor-pointer rounded-lg border border-border bg-transparent p-0.5 disabled:cursor-not-allowed"
            />
          </label>
          <Input
            defaultValue={s.label}
            key={`label-${s.id}-${s.label}`}
            disabled={!canManage}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.label) updateMut.mutate({ id: s.id, data: { label: v } }); }}
            className="h-9 flex-1 min-w-0 text-sm font-medium"
            placeholder="Nama stage"
          />
          {!active && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Nonaktif</span>
          )}
          <span
            className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground"
            title="Jumlah kartu aktif di stage ini"
          >
            {count} <span className="font-normal">kartu</span>
          </span>
          {canManage && (
            <button
              type="button"
              onClick={() => setDeleteTarget(s)}
              className="shrink-0 rounded-lg p-1.5 text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Hapus stage"
              aria-label="Hapus stage"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Baris 2: peran + SLA + divisi penanggung jawab + aktif */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 pl-8">
          <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            Peran
            <select
              value={s.role}
              disabled={!canManage}
              onChange={(e) => updateMut.mutate({ id: s.id, data: { role: e.target.value } })}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-normal text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
              title="Peran sistem stage ini"
            >
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            SLA
            <input
              type="number" min="0" max="365"
              defaultValue={(s as any).slaDays ?? ""}
              key={`sla-${s.id}-${(s as any).slaDays}`}
              disabled={!canManage}
              onBlur={(e) => { const raw = e.target.value.trim(); const v = raw === "" ? null : Number(raw); const cur = (s as any).slaDays ?? null; if (v !== cur) updateMut.mutate({ id: s.id, data: { slaDays: v } }); }}
              className="h-8 w-14 rounded-md border border-input bg-background px-2 text-center text-xs font-normal tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
              title="SLA (hari) -> auto-delegasi ke stage berikutnya. Kosong = tidak auto."
              placeholder="-"
            />
            <span className="font-normal text-muted-foreground/70">hari</span>
          </label>
          <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground" title="Aksi saat kartu di stage ini lewat tenggat (janji bayar / SLA)">
            Saat Overdue
            <select
              value={String((s as any).overdueAction ?? "badge")}
              disabled={!canManage}
              onChange={(e) => updateMut.mutate({ id: s.id, data: { overdueAction: e.target.value } })}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-normal text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
            >
              {OVERDUE_ACTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label
            className={`ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium ${roleLocked ? "text-muted-foreground/50" : "text-muted-foreground"}`}
            title={roleLocked ? "Stage peran sistem (Awal/Lunas) wajib aktif" : "Aktif / nonaktifkan stage"}
          >
            <input
              type="checkbox"
              checked={active}
              disabled={!canManage || roleLocked}
              onChange={(e) => updateMut.mutate({ id: s.id, data: { active: e.target.checked } })}
              className="size-3.5 rounded border-input accent-primary disabled:cursor-not-allowed"
            />
            Aktif
          </label>
        </div>

        {/* Baris 3: Divisi yang boleh akses stage ini (multi-pilih). "Semua Divisi" = shared. */}
        <div data-section="pipeline-stage-divisions" className="mt-2.5 pl-8">
          <div className="text-[11px] font-medium text-muted-foreground mb-1.5">Divisi yang boleh akses</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {/* Toggle Shared: centang = tampil ke semua divisi (owner=null); pilihan spesifik nonaktif. */}
            <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-foreground" title="Tampil & bisa diakses semua divisi">
              <input
                type="checkbox"
                checked={isShared}
                disabled={!canManage}
                onChange={(e) => { if (e.target.checked) updateMut.mutate({ id: s.id, data: { ownerDivision: null } }); }}
                className="size-3.5 rounded border-input accent-primary disabled:cursor-not-allowed"
              />
              Semua Divisi (Shared)
            </label>
            <span className="text-[10px] text-muted-foreground/60">— atau pilih —</span>
            {SELECTABLE_OWNER_DIVISIONS.map((o) => (
              <label key={o.value} className={`inline-flex items-center gap-1.5 text-[11px] ${isShared ? "text-muted-foreground/40" : "text-muted-foreground"}`}>
                <input
                  type="checkbox"
                  checked={ownerSet.includes(o.value)}
                  disabled={!canManage || isShared}
                  onChange={(e) => toggleDivision(o.value, e.target.checked)}
                  className="size-3.5 rounded border-input accent-primary disabled:cursor-not-allowed"
                />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* ============ PIPELINE MANAGER DIALOG (CRUD stage) ============ */}
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent data-section="pipeline-manager-dialog" className="max-w-xl dialog-w max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-5 pb-3 border-b space-y-1.5">
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ListTree className="h-4 w-4" />
              </span>
              Kelola Pipeline Collection{division ? ` — ${division === "cs" ? "Layanan Pelanggan" : "Marketing"}` : ""}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {division
                ? <>Stage divisi <strong>{division === "cs" ? "Layanan Pelanggan" : "Marketing"}</strong> + stage <strong>Shared</strong> (dipakai semua divisi). Ubah nama/warna, atur peran, SLA, divisi penanggung jawab, dan aktif/nonaktif. Menyunting stage shared berdampak ke semua divisi.</>
                : <>Semua stage dikelompokkan per <strong>divisi penanggung jawab</strong>. Seret <span className="inline-flex align-middle"><GripVertical className="h-3 w-3" /></span> untuk mengurutkan dalam grup, atur peran + SLA auto-delegasi + aktif/nonaktif.</>}
            </DialogDescription>
          </DialogHeader>

          {/* Body: stage dikelompokkan per divisi penanggung jawab */}
          <div data-section="pipeline-stage-groups" className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {groups.map((g) => (
              <div key={g.key} data-section="pipeline-stage-group" data-group={g.key} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${g.key === "__shared" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
                    {groupLabelOf(g.key)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70">{g.items.length} stage</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                {g.items.map(renderStageCard)}
              </div>
            ))}
            <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Divisi penanggung jawab</strong> menentukan di board divisi mana stage tampil. <strong>Shared</strong> = tampil di semua divisi (owner "Semua Divisi" atau peran Lunas/Write-off/Dismantel).
              <br />
              <strong className="text-foreground">Peran:</strong> Awal = tujuan auto-open saat isolir · Lunas = auto-close saat bayar · Write-off = target auto write-off. Stage peran Awal/Lunas tidak bisa dihapus / dinonaktifkan sebelum perannya dipindah.
              <br />
              <strong className="text-foreground">SLA</strong> = jumlah hari sebelum kartu otomatis di-delegasi ke stage berikutnya. Kosongkan agar tidak otomatis.
            </p>
          </div>

          <div className="border-t px-5 py-3 flex gap-2">
            {canManage && (
              <Button variant="outline" onClick={() => createMut.mutate()} disabled={createMut.isPending} className="flex-1" leftIcon={createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}>
                Tambah Stage{division ? ` (${division === "cs" ? "CS" : "Marketing"})` : ""}
              </Button>
            )}
            <Button onClick={onClose} className="flex-1">Selesai</Button>
          </div>
        </DialogContent>
      </Dialog>

      <StageDeleteDialog
        target={deleteTarget}
        stages={order}
        cardCount={deleteTarget ? (cardCounts[deleteTarget.key] ?? 0) : 0}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => { setDeleteTarget(null); invalidate(); }}
      />
    </>
  );
}

export function StageDeleteDialog({ target, stages, cardCount, onClose, onDeleted }: {
  target: CollectionStageRow | null;
  stages: CollectionStageRow[];
  cardCount: number;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [mode, setMode] = useState<"migrate" | "purge">("migrate");
  const [targetKey, setTargetKey] = useState("");
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (target) {
      setMode("migrate");
      setConfirmText("");
      const other = stages.find((s) => s.key !== target.key);
      setTargetKey(other?.key ?? "");
    }
  }, [target, stages]);

  const isProtected = target?.role === "entry" || target?.role === "paid";

  const delMut = useMutation({
    mutationFn: () => api.delete(`/collections/stages/${target!.id}`, {
      mode,
      targetKey: mode === "migrate" ? targetKey : undefined,
    }),
    onSuccess: (r: any) => {
      const n = r?.affectedCards ?? 0;
      toast.success(mode === "migrate"
        ? `Stage dihapus${n > 0 ? `, ${n} kartu dipindahkan` : ""}`
        : `Stage dihapus${n > 0 ? ` beserta ${n} kartu` : ""}`);
      onDeleted();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const otherStages = stages.filter((s) => s.key !== target?.key);
  const purgeReady = mode !== "purge" || confirmText.trim().toUpperCase() === "HAPUS";
  const migrateReady = mode !== "migrate" || !!targetKey;

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-500" /> Hapus Stage "{target?.label}"
          </DialogTitle>
          <DialogDescription className="text-xs">
            {cardCount > 0
              ? `Stage ini punya ${cardCount} kartu aktif. Pilih tindakan untuk kartu tersebut.`
              : "Stage ini tidak punya kartu aktif."}
          </DialogDescription>
        </DialogHeader>

        {isProtected ? (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
            Stage ini memegang peran sistem <strong>{target?.role === "entry" ? "Awal/Masuk" : "Lunas"}</strong> yang
            wajib ada. Pindahkan dulu perannya ke stage lain (lewat dropdown peran) sebelum menghapus.
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex items-start gap-2 p-2.5 rounded-md border cursor-pointer hover:bg-muted/40">
              <input type="radio" checked={mode === "migrate"} onChange={() => setMode("migrate")} className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium">Pindahkan kartu ke stage lain</div>
                <div className="text-[11px] text-muted-foreground">Kartu di stage ini dipindah, tidak ada data hilang.</div>
                {mode === "migrate" && (
                  <select
                    value={targetKey}
                    onChange={(e) => setTargetKey(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm mt-2"
                  >
                    {otherStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                )}
              </div>
            </label>

            <label className="flex items-start gap-2 p-2.5 rounded-md border cursor-pointer hover:bg-muted/40 border-red-200 dark:border-red-900">
              <input type="radio" checked={mode === "purge"} onChange={() => setMode("purge")} className="mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium text-red-600 dark:text-red-400">Hapus permanen semua kartu</div>
                <div className="text-[11px] text-muted-foreground">
                   Semua kartu di stage ini beserta riwayat aktivitasnya akan dihapus permanen. Tidak bisa dibatalkan.
                </div>
                {mode === "purge" && cardCount > 0 && (
                  <div className="mt-2">
                    <p className="text-[11px] text-red-600 dark:text-red-400 mb-1">Ketik <strong>HAPUS</strong> untuk konfirmasi:</p>
                    <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="HAPUS" className="h-8 text-sm" />
                  </div>
                )}
              </div>
            </label>
          </div>
        )}

        <div className="flex gap-2 pt-3 border-t">
          <Button variant="outline" onClick={onClose} className="flex-1" disabled={delMut.isPending}>Batal</Button>
          {!isProtected && (
            <Button
              onClick={() => delMut.mutate()}
              disabled={delMut.isPending || !purgeReady || !migrateReady}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white"
            >
              {delMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {mode === "purge" ? "Hapus Permanen" : "Hapus & Pindahkan"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// AssigneePicker body (dipisah supaya hooks tetap top-level di komponen utama).
