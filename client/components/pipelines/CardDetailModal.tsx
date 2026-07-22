import { useState, useEffect, useRef } from "react";
import { useCard, usePipeline, usePipelineMutations, useAssignableUsers, useRetriggerCard, useCardAssignees, useAddCardAssignee, useRemoveCardAssignee, useCardLeadLink, type CardDetail } from "@/hooks/usePipelines";
import type { PipelineField } from "@shared/schema";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { Maximize2, Minimize2, ExternalLink, RotateCw, Trash2, Save } from "lucide-react";
import { FieldValueInput } from "@/components/pipelines/FieldValueInput";
import { parseCoordinate } from "@shared/pipelineFieldTypes";
import { isFieldVisible, isFieldRequired, hasRequiredWhen } from "@shared/fieldRules";
import { CoordinateInfo } from "@/components/pipelines/CoordinateInfo";
import { CardRelations } from "@/components/pipelines/CardRelations";
import { CardRelatedCards } from "@/components/pipelines/CardRelatedCards";
import { CardAttachments } from "@/components/pipelines/CardAttachments";
import { CardComments } from "@/components/pipelines/CardComments";
import { AssigneePicker } from "./AssigneePicker";
import { MarkdownField } from "@/components/ui/markdown-field";
import { CardTeamExtras } from "./CardTeamExtras";
import { CreateLeadFromCardDialog } from "./CreateLeadFromCardDialog";
import { toast } from "sonner";

const ACTIVITY_LABELS: Record<string, string> = {
  created: "Kartu dibuat",
  moved: "Dipindah stage",
  commented: "Komentar ditambah",
  attachment_added: "Lampiran ditambah",
  attachment_removed: "Lampiran dihapus",
  assigned: "Assignee diubah",
  updated: "Kartu diperbarui",
  field_updated: "Field diperbarui",
};

const PRIORITIES = [
  { value: "low", label: "Rendah" },
  { value: "medium", label: "Sedang" },
  { value: "high", label: "Tinggi" },
  { value: "urgent", label: "Urgent" },
];
const WIDE_KEY = "pipeline_card_modal_wide";

/**
 * Custom-field editing state, lifted out of the JSX so the pinned footer (below)
 * can host "Simpan Field" next to "Hapus Kartu". Draft re-initialises whenever a
 * different card loads into the (reused) modal instance.
 */
function useCardFields(card: CardDetail | undefined, pipelineId: number, writable: boolean) {
  const m = usePipelineMutations(pipelineId);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const loadedId = useRef<number | null>(null);
  useEffect(() => {
    if (card && loadedId.current !== card.id) {
      loadedId.current = card.id;
      setDraft({ ...card.values });
    }
  }, [card]);

  const fields = card ? [...card.fields].sort((a, b) => a.position - b.position) : [];
  // Field-level access: when the server sends fieldAccess, fields absent from it are HIDDEN.
  // Older responses omit it → treat all as "edit" so nothing breaks.
  const hasAccessMap = card ? (card as any).fieldAccess != null : false;
  const access: Record<number, "view" | "edit"> = (card as any)?.fieldAccess ?? {};
  const lvlOf = (id: number): "hidden" | "view" | "edit" => (hasAccessMap ? access[id] ?? "hidden" : "edit");

  const ctx = { values: new Map<number, string>(fields.map((f) => [f.id, draft[f.id] ?? ""])), stageId: card?.stageId ?? 0 };
  const visibleFields = fields.filter((f) => lvlOf(f.id) !== "hidden" && isFieldVisible(f, ctx));
  const editableFields = visibleFields.filter((f) => lvlOf(f.id) === "edit");
  const missingRequired = editableFields.filter(
    (f) => hasRequiredWhen(f) && isFieldRequired(f, ctx) && (draft[f.id] ?? "").trim() === "",
  );
  const hasEditable = writable && editableFields.length > 0;

  const save = async () => {
    if (!card) return;
    const values = editableFields.map((f) => ({ fieldId: f.id, value: draft[f.id] ?? "" }));
    try {
      await m.setCardValues.mutateAsync({ cardId: card.id, values });
      toast.success("Field disimpan");
    } catch (e: any) {
      toast.error(e?.message || "Gagal menyimpan field");
    }
  };

  return { draft, setDraft, visibleFields, lvlOf, ctx, missingRequired, hasEditable, save, saving: m.setCardValues.isPending };
}

export function CardDetailModal({ cardId, pipelineId, onClose, writable, caps = [], newTabHref }: {
  cardId: number; pipelineId: number; onClose: () => void; writable: boolean; caps?: string[]; newTabHref: string;
}) {
  const { data: card, isLoading } = useCard(cardId);
  const { data: pipeline } = usePipeline(pipelineId);
  const { data: users } = useAssignableUsers();
  const m = usePipelineMutations(pipelineId);
  const retrigger = useRetriggerCard(cardId);
  const { data: secondary } = useCardAssignees(cardId);
  const addAssignee = useAddCardAssignee(cardId);
  const removeAssignee = useRemoveCardAssignee(cardId);
  const cf = useCardFields(card, pipelineId, writable);
  const { data: leadLink } = useCardLeadLink(cardId);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const canComment = caps.length === 0 || caps.includes("comment");
  const canAssign = caps.length === 0 || caps.includes("assign");
  const isCardAdmin = caps.length === 0 || caps.includes("manage");
  const canMoveStage = writable && (caps.length === 0 || caps.includes("cards"));
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Teamspace board (pipeline.teamId != null): sembunyikan radio JABNET/Lintas mitra (BUG-005)
  // & hard-delete (BUG-003 - pakai Arsipkan). Pipeline ops (lead/collection) tak berubah.
  const isTeamBoard = (pipeline as any)?.teamId != null;
  const [wide, setWide] = useState(() => { try { return localStorage.getItem(WIDE_KEY) === "1"; } catch { return false; } });

  const toggleWide = () =>
    setWide((w) => { const nv = !w; try { localStorage.setItem(WIDE_KEY, nv ? "1" : "0"); } catch { /* ignore */ } return nv; });

  const stages = pipeline?.stages ?? [];
  const stageName = stages.find((s) => s.id === card?.stageId)?.label ?? "";
  const nameOf = (id: number | null | undefined) => {
    if (id == null) return "-";
    const u = (users ?? []).find((x) => x.id === id);
    return u?.name || u?.username || `#${id}`;
  };
  const priorityLabel = PRIORITIES.find((p) => p.value === card?.priority)?.label ?? card?.priority ?? "";

  return (
    <>
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      {/* BUG-008: default lebih lebar agar layout 2 kolom lega; toggle wide = ekstra lebar */}
      <DialogContent className={`${wide ? "max-w-5xl" : "max-w-3xl"} w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0`}>
        <DialogTitle className="sr-only">{card?.title ?? "Detail Kartu"}</DialogTitle>
        {isLoading ? (
          <div className="p-6"><div className="h-40 animate-pulse rounded bg-muted" /></div>
        ) : !card ? (
          <div className="p-6 text-sm text-muted-foreground">Kartu tidak ditemukan.</div>
        ) : (
          <>
            {/* Header (pinned). pr-12 leaves room for DialogContent's built-in close button. */}
            <div className="shrink-0 border-b px-5 py-4 pr-12">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <Input
                    defaultValue={card.title}
                    disabled={!writable}
                    className="border-0 px-0 text-base font-semibold shadow-none focus-visible:ring-0"
                    onBlur={(e) => { if (writable && e.target.value !== card.title) m.updateCard.mutateAsync({ cardId, title: e.target.value }); }}
                  />
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {pipeline?.name ?? "Pipeline"} · {stageName} · {priorityLabel}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {writable && (caps.length === 0 || caps.includes("cards")) && (
                    <Button type="button" variant="ghost" size="sm" loading={retrigger.isPending}
                      onClick={() => retrigger.mutate(undefined, {
                        onSuccess: () => toast.success("Otomasi dijalankan ulang"),
                        onError: (e: any) => toast.error(e?.message || "Gagal menjalankan ulang"),
                      })}>
                      <RotateCw className="size-4 mr-1.5" /> Jalankan ulang otomasi
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={wide ? "Perkecil modal" : "Perlebar modal"} onClick={toggleWide}>
                    {wide ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                  </Button>
                  <a href={newTabHref} target="_blank" rel="noreferrer" aria-label="Buka di tab baru"
                     className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
                    <ExternalLink className="size-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Body (scrolls). BUG-008: md+ = 2 kolom - kiri konten (deskripsi/checklist/
                komentar), kanan panel aksi STICKY (stage/prioritas/assignee/label/aksi)
                supaya aksi sering dipakai tidak butuh scroll panjang (pola Cicle). */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="md:grid md:grid-cols-[minmax(0,1fr)_16.5rem] md:items-start md:gap-6">
              {/* Panel aksi diberi latar berbeda (bg-muted) supaya kontrol tidak samar
                  dengan latar konten - feedback user. */}
              <aside className="mt-4 space-y-4 rounded-xl border bg-muted/40 p-3 md:order-2 md:mt-0 md:sticky md:top-0 md:max-h-[calc(85vh-7rem)] md:overflow-y-auto">
              {/* Pindah Stage - click-based, mobile-friendly chips (no drag needed). The move
                  endpoint runs automation + timeline + audit server-side, same as drag. */}
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pindah Stage</span>
                <div className="mt-1 flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                  {stages.map((s) => {
                    const active = s.id === card.stageId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!canMoveStage || m.moveCard.isPending}
                        aria-current={active ? "true" : undefined}
                        onClick={() => { if (canMoveStage && s.id !== card.stageId) m.moveCard.mutateAsync({ cardId, toStageId: s.id }); }}
                        className={`shrink-0 rounded-full border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-default ${active ? "text-white" : "hover:bg-muted disabled:opacity-60"}`}
                        style={active ? { backgroundColor: s.color, borderColor: s.color } : { color: s.color, borderColor: `${s.color}60` }}
                      >
                        {active ? s.label : `→ ${s.label}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick-edit metadata */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Prioritas</span>
                  <Combobox size="sm" clearable={false} options={PRIORITIES}
                    value={card.priority}
                    onChange={(v) => { if (writable && v && v !== card.priority) m.updateCard.mutateAsync({ cardId, priority: v }); }}
                  />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{isTeamBoard ? "PJ Utama" : "Assignee"}</span>
                  <AssigneePicker
                    mode="single"
                    size="sm"
                    showSourceToggle={!isTeamBoard}
                    value={card.assigneeId == null ? "" : String(card.assigneeId)}
                    placeholder="Belum ada"
                    disabled={!(writable && canAssign)}
                    onChange={(v) => { if (writable && canAssign) m.updateCard.mutateAsync({ cardId, assigneeId: v ? Number(v) : null }); }}
                  />
                </div>
                <div className="col-span-2 self-end text-[10px] text-muted-foreground">
                  <div>Dibuat: {nameOf(card.createdBy)}</div>
                  <div>{new Date(card.createdAt).toLocaleString("id-ID")}</div>
                </div>
                {card.collectionCycle != null && (
                  <div className="col-span-2 text-[10px] text-muted-foreground">Siklus collection: #{card.collectionCycle}</div>
                )}
              </div>

              {canAssign && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Penanggung Jawab Tambahan</span>
                  <AssigneePicker
                    mode="multi"
                    showSourceToggle={false}
                    value={(secondary ?? []).map((a) => String(a.userId))}
                    excludeIds={card?.assigneeId ? [card.assigneeId] : []}
                    onChange={(next) => {
                      const prev = (secondary ?? []).map((a) => String(a.userId));
                      next.filter((id) => !prev.includes(id)).forEach((id) => addAssignee.mutate(Number(id)));
                      prev.filter((id) => !next.includes(id)).forEach((id) => removeAssignee.mutate(Number(id)));
                    }}
                  />
                </div>
              )}

              {card.tags && (
                <div className="flex flex-wrap gap-1">
                  {card.tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                    <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{t}</span>
                  ))}
                </div>
              )}

              {/* Teamspace: cover + selesai/tenggat + ulangi + label + aksi - panel aksi */}
              <CardTeamExtras cardId={cardId} pipelineId={pipelineId} card={card} writable={writable} onClose={onClose} section="side" />

              {/* Lead link - show linked lead or "Buat Lead" button */}
              <div className="flex items-center gap-2 pt-1">
                {leadLink?.link ? (
                  <a href="/leads" className="inline-flex items-center gap-1 text-xs text-primary underline">
                    Tertaut ke Lead #{leadLink.link.leadId}
                  </a>
                ) : writable ? (
                  <Button type="button" variant="outline-primary" size="xs" onClick={() => setShowCreateLead(true)}>
                    Buat Lead
                  </Button>
                ) : null}
              </div>
              </aside>

              {/* -- Kolom konten (kiri di md+) -- */}
              <div className="mt-4 min-w-0 space-y-4 md:order-1 md:mt-0">
              {/* BUG-002: deskripsi mendukung markdown (bold/italic/list/heading/link) + preview */}
              <div>
                <span className="mb-1 block text-[10px] font-medium text-muted-foreground">Deskripsi / catatan</span>
                <MarkdownField
                  value={card.description ?? ""}
                  disabled={!writable}
                  onSave={(text) => { if (writable && text !== (card.description ?? "")) m.updateCard.mutateAsync({ cardId, description: text }); }}
                />
              </div>

              {/* Teamspace: checklist - konten utama */}
              <CardTeamExtras cardId={cardId} pipelineId={pipelineId} card={card} writable={writable} onClose={onClose} section="main" />

              {/* Custom fields - inputs here; the Simpan Field button lives in the pinned footer. */}
              {cf.visibleFields.length > 0 && (
                <section>
                  <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Field Kustom</h4>
                  <div className="space-y-3">
                    {cf.visibleFields.map((f) => {
                      const v = cf.draft[f.id] ?? "";
                      const editable = writable && cf.lvlOf(f.id) === "edit";
                      const required = isFieldRequired(f, cf.ctx);
                      const emptyRequired = required && (v === "" || v === "[]");
                      return (
                        <div key={f.id}>
                          <div className="mb-1 flex items-center gap-1">
                            <span className="text-xs font-medium">{f.label}</span>
                            {required && <span className="text-destructive text-xs leading-none" aria-hidden="true">*</span>}
                            {emptyRequired && !hasRequiredWhen(f) && <span className="text-[10px] text-amber-600">wajib diisi</span>}
                          </div>
                          <FieldValueInput field={f} value={v} disabled={!editable} onChange={(nv) => cf.setDraft((d) => ({ ...d, [f.id]: nv }))} />
                          {f.type === "coordinate" && (() => {
                            const c = parseCoordinate(v);
                            return c ? <CoordinateInfo lat={c.lat} lng={c.lng} /> : null;
                          })()}
                        </div>
                      );
                    })}
                  </div>
                  {cf.missingRequired.length > 0 && (
                    <p className="text-xs text-destructive mt-1">Wajib diisi: {cf.missingRequired.map((f) => f.label).join(", ")}</p>
                  )}
                </section>
              )}

              <CardRelations cardId={cardId} writable={writable} />
              <CardRelatedCards cardId={cardId} />

              <CardAttachments cardId={cardId} writable={writable} isAdmin={isCardAdmin} />

              <CardComments
                comments={card.comments}
                canComment={writable && canComment}
                sending={m.addComment.isPending}
                onSend={(args) => m.addComment.mutateAsync({ cardId, ...args })}
              />

              <section>
                <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Aktivitas (sistem)</h4>
                <ul className="space-y-1">
                  {card.activity.map((a) => (
                    <li key={a.id} className="text-[10px] text-muted-foreground">
                      <span className="font-medium">{ACTIVITY_LABELS[a.type] ?? a.type}</span> · {new Date(a.createdAt).toLocaleString("id-ID")}
                    </li>
                  ))}
                  {card.activity.length === 0 && <li className="text-[10px] text-muted-foreground">Belum ada aktivitas.</li>}
                </ul>
              </section>
              </div>
              </div>
            </div>

            {/* Pinned footer - primary actions grouped together, always reachable (mobile-first).
                BUG-003: di board tim, hard-delete DISEMBUNYIKAN - pakai "Arsipkan" (reversible,
                di bagian Aksi). Pipeline ops (lead/collection) tetap punya Hapus Kartu. */}
            {writable && (!isTeamBoard || cf.hasEditable) && (
              <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background px-5 py-3">
                {/* Two-step delete so the now-prominent button can't fire on a single mis-tap. */}
                {!isTeamBoard ? (
                <Button
                  type="button"
                  variant={confirmDelete ? "destructive" : "outline"}
                  size="lg"
                  className={confirmDelete ? "" : "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"}
                  loading={m.deleteCard.isPending}
                  onClick={async () => {
                    if (!confirmDelete) { setConfirmDelete(true); return; }
                    await m.deleteCard.mutateAsync(cardId);
                    onClose();
                  }}
                  onBlur={() => setConfirmDelete(false)}
                >
                  <Trash2 className="size-4 mr-1.5" /> {confirmDelete ? "Yakin? Hapus" : "Hapus Kartu"}
                </Button>
                ) : <span />}
                {cf.hasEditable && (
                  <Button
                    type="button"
                    size="lg"
                    className="min-w-[9rem]"
                    onClick={cf.save}
                    loading={cf.saving}
                    disabled={cf.missingRequired.length > 0}
                  >
                    <Save className="size-4 mr-1.5" /> Simpan Field
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
    {showCreateLead && card && (
      <CreateLeadFromCardDialog
        cardId={cardId}
        title={card.title}
        values={card.values}
        fields={card.fields.map((f) => ({ id: f.id, type: f.type }))}
        onClose={() => setShowCreateLead(false)}
      />
    )}
    </>
  );
}
