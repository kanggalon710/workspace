import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { waLink } from "@/lib/wa";
import { InfoRow } from "@/components/pipelines/InfoRow";
import { COLLECTION_ISSUE_LABELS, type CollectionIssueType, type Collection } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { AlertTriangle, Phone, MessageSquare, X, CheckCircle2, Loader2, FileText, Trash2, History, Info } from "lucide-react";
import { useStages, fmtRp, fmtDate, toDateInput, daysSince, ACTIVITY_CFG, type CollectionStage, type Assignee } from "./shared";
import { AssigneePicker } from "./AssigneePicker";

export function CollectionDetail({
  id, division, onClose, canEdit, users, onMoveStage, onAssign, onAddActivity, onDelete, isSystemAdmin, waLink, customerById,
}: {
  id: number | null;
  division?: "cs" | "marketing";
  onClose: () => void;
  canEdit: boolean;
  users: any[];
  onMoveStage: (id: number, stage: CollectionStage) => void;
  onAssign: (id: number, userIds: number[]) => void;
  onAddActivity: (id: number, type: string, content: string) => void;
  onDelete: (id: number) => void;
  isSystemAdmin: boolean;
  waLink: (phone: string, msg: string) => string;
  customerById: Map<number, any>;
}) {
  const { stages: allStages, label: stageLabel, color: stageColor } = useStages();
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState("note");
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<string | null>(null); // URL foto full-screen
  const divQ = division ? `?division=${division}` : "";

  // Tutup viewer foto full-screen dengan tombol ESC.
  useEffect(() => {
    if (!photoViewer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPhotoViewer(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [photoViewer]);

  const { data: detail } = useQuery<any>({
    queryKey: ["/api/collections", id, division ?? "all-div"],
    queryFn: () => id ? api.get(`/collections/${id}${divQ}`) : Promise.resolve(null),
    enabled: !!id,
  });

  // Riwayat lintas-collection untuk customer ini (termasuk collection lama & event billing)
  const { data: paymentHistory } = useQuery<any>({
    queryKey: ["/api/customers", detail?.customerId, "payment-history"],
    queryFn: () => detail?.customerId ? api.get(`/customers/${detail.customerId}/payment-history`) : Promise.resolve(null),
    enabled: !!detail?.customerId && showFullHistory,
  });

  // Editor tenggat (janji bayar) standalone - set/ubah tanpa harus pindah stage.
  const qc = useQueryClient();
  const [deadlineDraft, setDeadlineDraft] = useState("");
  useEffect(() => { setDeadlineDraft(toDateInput(detail?.promiseDate)); }, [detail?.promiseDate]);
  const deadlineMut = useMutation({
    mutationFn: (promiseDate: string | null) => api.patch(`/collections/${id}${divQ}`, { promiseDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/collections"] });
      toast.success("Tenggat disimpan");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!id || !detail) {
    return (
      <Dialog open={!!id} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const cust = customerById.get(detail.customerId);
  const stage = (detail.stage ?? "new") as CollectionStage;
  const ageDays = daysSince(detail.openedAt);

  const handleAddNote = () => {
    if (!noteText.trim()) return toast.error("Catatan kosong");
    onAddActivity(detail.id, noteType, noteText.trim());
    setNoteText("");
  };

  return (
    <>
    {/* ============ COLLECTION DETAIL DIALOG ============ */}
    <Dialog open={!!id} onOpenChange={() => onClose()}>
      <DialogContent data-section="collection-detail-dialog" data-collection-id={detail.id} className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <DialogTitle className="truncate">{cust?.name ?? `Customer #${detail.customerId}`}</DialogTitle>
              <DialogDescription className="flex items-center gap-2 flex-wrap mt-1">
                <Badge variant="secondary" className="text-[10px]" style={{ backgroundColor: stageColor(stage) + "20", color: stageColor(stage) }}>
                  {stageLabel(stage)}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  {cust?.customerId} • {cust?.pppoeUsername ?? "no pppoe"}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable body */}
        <div data-section="collection-detail-body" className="flex-1 overflow-y-auto -mx-6 px-6 space-y-4">
          {/* Info billing */}
          <div data-section="collection-info" className="grid grid-cols-2 gap-2 text-xs">
            <InfoRow label="Tagihan" value={fmtRp(detail.openedAmount)} />
            <InfoRow label="Jatuh Tempo" value={fmtDate(detail.openedDueDate)} />
            <InfoRow label="Isolir Sejak" value={fmtDate(detail.openedIsolirDate ?? detail.openedAt)} />
            <InfoRow label="Age" value={`${ageDays} hari`} />
            {detail.promiseDate && <InfoRow label="Janji Bayar" value={fmtDate(detail.promiseDate)} />}
            {detail.issueType && <InfoRow label="Kendala" value={COLLECTION_ISSUE_LABELS[detail.issueType as CollectionIssueType] ?? detail.issueType} />}
            {detail.closedAt && <InfoRow label="Lunas" value={fmtDate(detail.closedLastPaymentDate ?? detail.closedAt)} />}
          </div>

          {/* Editor Tenggat / Janji Bayar - set/ubah tanpa pindah stage; dipakai deteksi overdue. */}
          {canEdit && !detail.closedAt && (
            <div data-section="collection-deadline" className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs mb-1 block">Tenggat / Janji Bayar</Label>
                <Input type="date" value={deadlineDraft} onChange={(e) => setDeadlineDraft(e.target.value)} className="h-9" />
              </div>
              <Button size="sm" onClick={() => deadlineMut.mutate(deadlineDraft || null)} disabled={deadlineMut.isPending || deadlineDraft === toDateInput(detail.promiseDate)}>
                Simpan
              </Button>
              {detail.promiseDate && (
                <Button size="sm" variant="outline" onClick={() => { setDeadlineDraft(""); deadlineMut.mutate(null); }} disabled={deadlineMut.isPending} className="text-destructive border-destructive/30">
                  Hapus
                </Button>
              )}
            </div>
          )}

          {/* Kontak cepat (telepon / WhatsApp) */}
          {cust?.phone && (
            <div data-section="collection-contact" className="flex gap-2">
              <a href={`tel:${cust.phone}`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  <Phone className="h-4 w-4 mr-1.5" /> Telepon
                </Button>
              </a>
              <a href={waLink(cust.phone, `Halo ${cust.name}, mengingatkan bahwa tagihan internet Anda sebesar ${fmtRp(detail.openedAmount)} belum dibayar. Mohon segera dilunasi. Terima kasih.`)}
                 target="_blank" rel="noreferrer" className="flex-1">
                <Button variant="outline" size="sm" className="w-full text-success">
                  <MessageSquare className="h-4 w-4 mr-1.5" /> WhatsApp
                </Button>
              </a>
            </div>
          )}

          {/* Multi-assignee - semua assignee equal, siapa pun bisa edit */}
          {canEdit && (
            <AssigneePicker
              assignees={(detail.assignees ?? []) as Assignee[]}
              users={users}
              onChange={(userIds) => onAssign(detail.id, userIds)}
            />
          )}

          {/* Stage actions (tombol pindah stage cepat) */}
          {canEdit && !detail.closedAt && (
            <div data-section="collection-stage-actions">
              <Label className="text-xs mb-1.5 block">Pindah Stage</Label>
              <div className="flex gap-1.5 flex-wrap">
                {allStages.filter(s => s.key !== stage).map((s) => (
                  <button
                    key={s.key}
                    onClick={() => onMoveStage(detail.id, s.key)}
                    className="text-[10px] px-2.5 py-1 rounded-full border hover:bg-muted transition-colors"
                    style={{ color: s.color, borderColor: s.color + "60" }}
                  >
                    → {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tambah catatan / aktivitas manual */}
          {canEdit && (
            <div data-section="collection-add-note" className="border rounded-md p-3 space-y-2 bg-muted/30">
              <Label className="text-xs">Tambah Catatan / Aktivitas</Label>
              <div className="flex gap-2">
                <select value={noteType} onChange={(e) => setNoteType(e.target.value)}
                        className="h-9 rounded-md border border-input bg-transparent px-2 text-xs">
                  <option value="note">Catatan</option>
                  <option value="call">Telepon</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="visit">Kunjungan</option>
                </select>
                <Input placeholder="Isi catatan..." value={noteText} onChange={(e) => setNoteText(e.target.value)} className="text-xs" />
                <Button onClick={handleAddNote} size="sm">Kirim</Button>
              </div>
            </div>
          )}

          {/* ==== Riwayat Aktivitas (timeline aktivitas collection ini) ==== */}
          <div data-section="activity-timeline">
            <Label className="text-xs mb-2 block flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Riwayat Aktivitas (Collection #{detail.id})
            </Label>
            <div className="space-y-2">
              {(detail.activities ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-4">Belum ada aktivitas</div>
              )}
              {(detail.activities ?? []).map((a: any) => {
                const cfg = ACTIVITY_CFG[a.type] ?? ACTIVITY_CFG.note;
                const Icon = cfg.icon;
                const isSystem = a.userId === null;
                let content = a.content;
                try { const obj = JSON.parse(a.content ?? ""); if (typeof obj === "object") content = JSON.stringify(obj); } catch { /* plain */ }
                return (
                  /* One activity row (satu entri timeline) */
                  <div key={a.id} data-section="activity-item" data-activity-id={a.id} data-activity-type={a.type} className="flex gap-2 pb-2 border-b text-xs">
                    <Icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: cfg.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium">{cfg.label}</span>
                        {isSystem && <Badge variant="secondary" className="text-[9px] h-4">SISTEM</Badge>}
                      </div>
                      <div className="text-muted-foreground text-[11px] break-all">{content}</div>
                      {/* Thumbnail foto bukti (klik → viewer full-screen) */}
                      {(a.photoPath || a.photoData) && (
                        <img
                          data-section="activity-photo"
                          src={`/api/collections/activities/${a.id}/photo`}
                          alt="foto aktivitas"
                          className="mt-1.5 h-24 w-auto rounded border object-cover cursor-zoom-in"
                          loading="lazy"
                          onClick={() => setPhotoViewer(`/api/collections/activities/${a.id}/photo`)}
                        />
                      )}
                      <div className="text-[10px] text-muted-foreground/70 mt-0.5">{fmtDate(a.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ==== Riwayat lintas collection (customer history full) ==== */}
          <div data-section="collection-cross-history" className="border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" /> Riwayat Lengkap Pelanggan
              </Label>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowFullHistory((v) => !v)}>
                {showFullHistory ? "Sembunyikan" : "Tampilkan"}
              </Button>
            </div>

            {showFullHistory && (
              <div className="space-y-2">
                {/* Snapshot billing current */}
                {paymentHistory?.current && (
                  <div className="bg-blue-50 dark:bg-blue-950/30 rounded-md p-2 text-[11px] grid grid-cols-2 gap-1.5">
                    <div>
                      <div className="text-muted-foreground text-[10px]">Bayar Terakhir</div>
                      <div className="font-medium">{fmtDate(paymentHistory.current.lastPaymentDate)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Jatuh Tempo</div>
                      <div className="font-medium">{fmtDate(paymentHistory.current.dueDate)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Status Billing</div>
                      <div className="font-medium">
                        <Badge variant={paymentHistory.current.billingStatus === "lunas" ? "default" : "destructive"} className="text-[9px]">
                          {paymentHistory.current.billingStatus ?? "-"}
                        </Badge>
                        {paymentHistory.current.isIsolir && <Badge variant="destructive" className="text-[9px] ml-1">ISOLIR</Badge>}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-[10px]">Total Collection</div>
                      <div className="font-medium">{paymentHistory.collectionCount ?? 0}x (sudah/sedang ditagih)</div>
                    </div>
                  </div>
                )}

                {/* Timeline events lintas-collection */}
                {(!paymentHistory?.events || paymentHistory.events.length === 0) && (
                  <div className="text-xs text-muted-foreground text-center py-4">
                    Tidak ada riwayat lain.
                  </div>
                )}
                {paymentHistory?.events?.map((ev: any, idx: number) => {
                  const isOpened = ev.type === "collection_opened";
                  const isClosed = ev.type === "collection_closed";
                  const isMine = ev.collectionId === detail.id;
                  const cfg = isOpened
                    ? { label: "Collection Dibuka", color: "#EF4444", Icon: AlertTriangle }
                    : isClosed
                      ? { label: "Collection Ditutup", color: "#22C55E", Icon: CheckCircle2 }
                      : (() => { const a = ACTIVITY_CFG[ev.type] ?? ACTIVITY_CFG.note; return { label: a.label, color: a.color, Icon: a.icon }; })();
                  const Icon = cfg.Icon;
                  let content = ev.content;
                  try { const obj = JSON.parse(ev.content ?? ""); if (typeof obj === "object") content = JSON.stringify(obj); } catch { /* plain */ }
                  return (
                    <div key={`${ev.source}-${ev.collectionId ?? 'x'}-${ev.type}-${ev.timestamp}-${idx}`} className={`flex gap-2 text-[11px] pb-2 border-b ${isMine ? "bg-primary/5 -mx-1 px-1 rounded" : ""}`}>
                      <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: cfg.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium">{cfg.label}</span>
                          {ev.collectionId && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1">
                              col#{ev.collectionId}{isMine ? " (ini)" : ""}
                            </Badge>
                          )}
                          {ev.billingPeriod && <span className="text-muted-foreground text-[10px]">• {ev.billingPeriod}</span>}
                        </div>
                        {isOpened && (
                          <div className="text-muted-foreground text-[10px]">
                            Tagihan: {fmtRp(ev.amount)} - due {fmtDate(ev.dueDate)} - status {ev.billingStatus ?? "-"}
                          </div>
                        )}
                        {isClosed && (
                          <div className="text-muted-foreground text-[10px]">
                            Stage: {ev.stage} - reason: {ev.closeReason ?? "-"}
                            {ev.lastPaymentDate && ` - bayar ${fmtDate(ev.lastPaymentDate)}`}
                          </div>
                        )}
                        {!isOpened && !isClosed && content && (
                          <div className="text-muted-foreground break-all">{content}</div>
                        )}
                        <div className="text-[9px] text-muted-foreground/70 mt-0.5">{fmtDate(ev.timestamp)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!showFullHistory && (
              <div className="text-[11px] text-muted-foreground">
                Klik "Tampilkan" untuk lihat semua collection sebelumnya + event billing untuk pelanggan ini.
              </div>
            )}
          </div>

          {/* ==== Danger zone - hapus collection, terisolasi di bawah (jauh dari close X) ==== */}
          {canEdit && isSystemAdmin && (
            <div data-section="collection-danger-zone" className="mt-6 pt-4 border-t border-dashed border-destructive/30">
              <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-destructive/50 border border-destructive/30">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-destructive flex items-center gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" /> Zona Berbahaya
                  </div>
                  <p className="text-[11px] text-destructive/80 mt-0.5">
                    Hapus collection beserta riwayat aktivitas. Aksi ini tidak bisa dibatalkan.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { onClose(); setTimeout(() => onDelete(detail.id), 300); }}
                  className="text-destructive border-destructive/30 hover:bg-destructive/15 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Hapus Collection
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    {/* ==== Full-screen photo viewer (foto aktivitas) ==== */}
    {photoViewer && (
      <div
        data-section="photo-viewer"
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 cursor-zoom-out"
        onClick={() => setPhotoViewer(null)}
      >
        <button
          type="button"
          className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          onClick={(e) => { e.stopPropagation(); setPhotoViewer(null); }}
          aria-label="Tutup"
        >
          <X className="h-5 w-5" />
        </button>
        <img
          key={photoViewer}
          src={photoViewer}
          alt="foto aktivitas"
          className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )}
    </>
  );
}

