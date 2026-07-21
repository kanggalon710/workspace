import { useState, useRef, type FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogSizeToggle, useDialogSize } from "@/components/ui/dialog-size-toggle";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { FormField, FormSection } from "@/components/ui/form-field";
import { useRules, usePipeline, usePipelines, usePipelineMutations, useAssignableUsers } from "@/hooks/usePipelines";
import { Trash2, Plus, Zap, ChevronDown, ChevronUp, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import { ConditionsBuilder, type DraftCondition } from "./ConditionsBuilder";
import type { RuleWithMaps, RuleActionView } from "@/hooks/usePipelines";
import { emptyDraft, emptyAction, emptyBillingRow, emptyLeadRow, ruleToDraft, draftToPayload, type RuleDraft, type ActionDraft, type BillingFieldMapRow, type LeadFieldMapRow } from "./ruleFormState";
import { emptyNotifyDraft, type NotifyDraft } from "@shared/notifyConfig";
import { RuleActionEditor } from "./RuleActionEditor";
import { NotifyConfigFields } from "./NotifyConfigFields";
import { BILLING_ATTRS, attrCompatibleWithFieldType, preferredFieldTypeForAttr, BILLING_FILTER_OPTIONS, OVERDUE_DATE_ATTRS } from "@shared/pipelineBillingIntake";
import { EVENT_TRIGGER_TYPES } from "@shared/pipelineEventTriggers";
import { RECURRENCE_MODES } from "@shared/ruleRecurrence";
import { LEAD_SOURCE_OPTIONS, LEAD_SOURCE_LABELS, canonicalLeadSource } from "@shared/leadSources";
import { LEAD_ATTRS } from "@shared/leadIntake";

// -- lead trigger labels (module-scope - shared by trigger Combobox + summary fn) -
const LEAD_TRIGGER_LABELS: Record<string, string> = {
  lead_created: "Saat lead baru dibuat",
  lead_updated: "Saat lead diperbarui",
  lead_assigned: "Saat lead di-assign",
  lead_stage_changed: "Saat stage lead berubah",
  lead_converted: "Saat lead jadi pelanggan",
};

const LEAD_TRIGGER_OPTIONS = Object.entries(LEAD_TRIGGER_LABELS).map(([value, label]) => ({ value, label }));

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr;
  const copy = [...arr];
  const [it] = copy.splice(from, 1);
  copy.splice(to, 0, it);
  return copy;
}

export function PipelineRulesDialog({
  pipelineId,
  open,
  onClose,
}: {
  pipelineId: number;
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useDialogSize("dialogSize:rules");
  const { data: rules } = useRules(open ? pipelineId : null);
  const { data: self } = usePipeline(open ? pipelineId : null);
  const { data: allPipelines } = usePipelines();
  const m = usePipelineMutations(pipelineId);

  const [triggerStageId, setTriggerStageId] = useState("");
  const [triggerType, setTriggerType] = useState<RuleDraft["triggerType"]>("stage_enter");
  const [recurrence, setRecurrence] = useState<"once" | "on_reenter" | "always">("once");
  const [anchor, setAnchor] = useState<"stage_entered" | "card_created" | "field_date">("stage_entered");
  const [anchorFieldId, setAnchorFieldId] = useState("");
  const [offsetN, setOffsetN] = useState("3");
  const [offsetUnit, setOffsetUnit] = useState<"hours" | "days">("days");
  const [direction, setDirection] = useState<"after" | "before">("after");
  const [repeat, setRepeat] = useState<"once" | "every">("once");
  const [repeatEveryN, setRepeatEveryN] = useState("1");
  const [scopeStageId, setScopeStageId] = useState("");
  const [actions, setActions] = useState<ActionDraft[]>([emptyAction()]);
  const [conditions, setConditions] = useState<DraftCondition[][]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // field_updated sub-form state
  const [fieldUpdatedFieldId, setFieldUpdatedFieldId] = useState("");

  // billing_sync sub-form state
  const [billingFilterCustomerType, setBillingFilterCustomerType] = useState("");
  const [billingFilterStatus, setBillingFilterStatus] = useState("");
  const [billingFilterIsIsolir, setBillingFilterIsIsolir] = useState<"" | "0" | "1">("");
  const [billingFilterBillingStatus, setBillingFilterBillingStatus] = useState("");
  const [billingFilterMinOverdueDays, setBillingFilterMinOverdueDays] = useState("");
  const [billingOverdueFromAttr, setBillingOverdueFromAttr] = useState("dueDate");
  const [billingEntryStageId, setBillingEntryStageId] = useState("");
  const [billingResolveStageId, setBillingResolveStageId] = useState("");
  const [billingTitleSource, setBillingTitleSource] = useState("name");
  const [billingFieldMap, setBillingFieldMap] = useState<BillingFieldMapRow[]>([]);

  // lead_* sub-form state
  const [leadSources, setLeadSources] = useState<string[]>([]);
  const [leadEntryStageId, setLeadEntryStageId] = useState("");
  const [leadTitleSource, setLeadTitleSource] = useState("name");
  const [leadFieldMap, setLeadFieldMap] = useState<LeadFieldMapRow[]>([]);
  const [leadOnDuplicate, setLeadOnDuplicate] = useState<RuleDraft["leadOnDuplicate"]>("ignore");
  const [leadDedupBy, setLeadDedupBy] = useState<RuleDraft["leadDedupBy"]>("lead_id");
  const [leadReopenStageId, setLeadReopenStageId] = useState("");
  const [leadNotify, setLeadNotify] = useState<NotifyDraft>(emptyNotifyDraft());

  const { data: staffUsers } = useAssignableUsers();

  const sourceFields = self?.fields ?? [];
  const selfStages = self?.stages ?? [];

  // Create a card field in THIS pipeline for a billing attr, then bind the map row
  // to it. Field type derives from the attr (date-ish → date, price → number, …).
  const createBillingTargetField = async (i: number, attr: string) => {
    const meta = BILLING_ATTRS.find((a) => a.key === attr);
    if (!meta) return;
    try {
      const created: any = await m.createField.mutateAsync({
        label: meta.label,
        type: preferredFieldTypeForAttr(attr),
      });
      if (created?.id) {
        setBillingFieldMap((arr) =>
          arr.map((x, idx) => (idx === i ? { ...x, targetFieldId: String(created.id) } : x)),
        );
      }
      toast.success(`Field "${meta.label}" dibuat di pipeline`);
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat field");
    }
  };

  // -- helpers ------------------------------------------------------------------

  const stageName = (id: number | null) => {
    if (id == null) return "-";
    return selfStages.find((s) => s.id === id)?.label ?? `Stage #${id}`;
  };

  const pipeName = (id: number | null) =>
    (allPipelines ?? []).find((p) => p.id === id)?.name ?? `Pipeline #${id}`;

  const unitLabel = (u?: string) => (u === "hours" ? "jam" : "hari");

  function triggerSummary(r: RuleWithMaps): string {
    if (r.triggerType === "billing_sync") {
      return `Saat sync billing → ${stageName(r.targetStageId ?? null)}`;
    }
    if (String(r.triggerType ?? "").startsWith("lead_")) {
      const eventLabel = LEAD_TRIGGER_LABELS[r.triggerType] ?? r.triggerType;
      let c: any = {};
      try { c = r.triggerConfig ? (typeof r.triggerConfig === "string" ? JSON.parse(r.triggerConfig) : r.triggerConfig) : {}; } catch { c = {}; }
      const sources: string[] = Array.isArray(c.sources) ? c.sources : [];
      if (sources.length > 0) {
        const srcLabels = sources.map((s) => LEAD_SOURCE_LABELS[canonicalLeadSource(s)] ?? s).join(", ");
        return `${eventLabel} [${srcLabels}]`;
      }
      return eventLabel;
    }
    const eventDef = EVENT_TRIGGER_TYPES.find((t) => t.type === r.triggerType);
    if (eventDef) {
      if (r.triggerType === "field_updated") {
        const tc = r.triggerConfig as any;
        const fieldId: number | null = tc?.fieldId ?? null;
        if (fieldId != null) {
          const fieldLabel = sourceFields.find((f) => f.id === fieldId)?.label ?? `Field #${fieldId}`;
          return `${eventDef.label}: ${fieldLabel}`;
        }
        return `${eventDef.label} (semua field)`;
      }
      return eventDef.label;
    }
    if (r.triggerType !== "time" || !r.triggerConfig) {
      return `Saat masuk ${stageName(r.triggerStageId)}`;
    }
    const c = r.triggerConfig;
    const anchorLabel =
      c.anchor === "stage_entered" ? "masuk stage" :
      c.anchor === "card_created" ? "kartu dibuat" :
      `[${r.triggerFieldLabel ?? "tanggal"}]`;
    const dir = c.direction === "before" ? "sebelum" : "setelah";
    const base = `⏱ ${c.offsetN} ${unitLabel(c.offsetUnit)} ${dir} ${anchorLabel}`;
    const rep = c.repeat === "every" ? `, ulang tiap ${c.repeatEveryN} ${unitLabel(c.offsetUnit)}` : "";
    const scope = r.triggerStageScopeName ? ` (di ${r.triggerStageScopeName})` : "";
    return base + rep + scope;
  }

  const applyDraft = (d: RuleDraft) => {
    setTriggerType(d.triggerType);
    setTriggerStageId(d.triggerStageId);
    setAnchor(d.anchor);
    setAnchorFieldId(d.anchorFieldId);
    setOffsetN(d.offsetN);
    setOffsetUnit(d.offsetUnit);
    setDirection(d.direction);
    setRepeat(d.repeat);
    setRepeatEveryN(d.repeatEveryN);
    setScopeStageId(d.scopeStageId);
    setActions(d.actions);
    setConditions(d.conditions);
    setBillingFilterCustomerType(d.billingFilterCustomerType);
    setBillingFilterStatus(d.billingFilterStatus);
    setBillingFilterIsIsolir(d.billingFilterIsIsolir);
    setBillingFilterBillingStatus(d.billingFilterBillingStatus);
    setBillingFilterMinOverdueDays(d.billingFilterMinOverdueDays);
    setBillingOverdueFromAttr(d.billingOverdueFromAttr);
    setBillingEntryStageId(d.billingEntryStageId);
    setBillingResolveStageId(d.billingResolveStageId);
    setBillingTitleSource(d.billingTitleSource);
    setBillingFieldMap(d.billingFieldMap);
    setFieldUpdatedFieldId(d.fieldUpdatedFieldId);
    setLeadSources(d.leadSources);
    setLeadEntryStageId(d.leadEntryStageId);
    setLeadTitleSource(d.leadTitleSource);
    setLeadFieldMap(d.leadFieldMap);
    setLeadOnDuplicate(d.leadOnDuplicate);
    setLeadDedupBy(d.leadDedupBy);
    setLeadReopenStageId(d.leadReopenStageId);
    setLeadNotify(d.leadNotify);
    setRecurrence(d.recurrence);
  };

  const currentDraft = (): RuleDraft => ({
    triggerType, triggerStageId, anchor, anchorFieldId, offsetN, offsetUnit,
    direction, repeat, repeatEveryN, scopeStageId, actions, conditions,
    billingFilterCustomerType, billingFilterStatus, billingFilterIsIsolir, billingFilterBillingStatus,
    billingFilterMinOverdueDays, billingOverdueFromAttr,
    billingEntryStageId, billingResolveStageId, billingTitleSource, billingFieldMap,
    fieldUpdatedFieldId,
    leadSources, leadEntryStageId, leadTitleSource, leadFieldMap,
    leadOnDuplicate, leadDedupBy, leadReopenStageId, leadNotify,
    recurrence,
  });

  const resetForm = () => {
    applyDraft(emptyDraft());
    setEditingId(null);
  };

  const startEdit = (r: RuleWithMaps) => {
    applyDraft(ruleToDraft(r));
    setEditingId(r.id);
    setExpandedId(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cancelEdit = () => resetForm();

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (m.createRule.isPending || m.updateRule.isPending) return;
    const res = draftToPayload(currentDraft());
    if (!res.ok) { toast.error(res.error); return; }
    try {
      if (editingId != null) {
        await m.updateRule.mutateAsync({ ruleId: editingId, ...res.payload });
        toast.success("Otomasi diperbarui");
      } else {
        await m.createRule.mutateAsync(res.payload);
        toast.success("Otomasi ditambahkan");
      }
      resetForm();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyimpan otomasi");
    }
  };

  const toggleEnabled = async (ruleId: number, checked: boolean) => {
    try {
      await m.updateRule.mutateAsync({ ruleId, enabled: checked ? 1 : 0 });
    } catch {
      toast.error("Gagal memperbarui otomasi");
    }
  };

  const handleDelete = async (ruleId: number) => {
    if (!confirm("Hapus otomasi ini? Tindakan tidak dapat dibatalkan.")) return;
    try {
      await m.deleteRule.mutateAsync(ruleId);
      if (editingId === ruleId) resetForm();
      toast.success("Otomasi dihapus");
    } catch {
      toast.error("Gagal menghapus otomasi");
    }
  };

  const ruleList = rules ?? [];
  const editingRule = editingId != null ? ruleList.find((r) => r.id === editingId) : null;

  // -- read-side helpers --------------------------------------------------------

  const actionSummary = (r: RuleWithMaps) => {
    const acts = r.actions ?? [];
    if (acts.length === 0) return <span className="italic text-muted-foreground">tanpa aksi</span>;
    const label = (a: any) =>
      a.actionType === "set_field" ? `set ${a.setFieldLabel ?? "?"}` :
      a.actionType === "move_stage" ? `pindah ke ${a.moveStageName ?? "?"}` :
      a.actionType === "assign" ? `tugaskan ${a.assigneeName ?? "kosong"}` :
      a.actionType === "notify" ? `kirim notif (${a.notifyLabel ?? "?"})` :
      `buat kartu di ${a.targetPipelineName ?? pipeName(a.targetPipelineId)}`;
    return <span>{acts.length === 1 ? label(acts[0]) : `${acts.length} aksi: ${acts.map(label).join(" → ")}`}</span>;
  };

  const typeChip = (t?: string | null) =>
    t ? <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono align-middle">{t}</span> : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetForm(); onClose(); } }}>
      <DialogContent className={cn(dialog.sizeClass, "overflow-hidden flex flex-col p-0")}>
        <DialogSizeToggle size={dialog.size} onCycle={dialog.cycle} />
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <Zap className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <DialogTitle className="text-base">Otomasi Pipeline</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Otomatiskan aksi pada kartu berdasarkan stage atau waktu
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Existing rules */}
          <div className="px-6 py-4">
            <FormSection
              title="Otomasi Aktif"
              description={
                ruleList.length
                  ? `${ruleList.length} otomasi terdaftar`
                  : undefined
              }
            >
              {ruleList.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 py-6 text-center">
                  <Zap className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Belum ada otomasi</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    Tambahkan otomasi di bawah untuk mulai mengotomatiskan alur kerja.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {ruleList.map((r) => {
                    const expanded = expandedId === r.id;
                    return (
                    <div
                      key={r.id}
                      className={`group rounded-lg border bg-card shadow-elev-sm transition-shadow hover:shadow-elev-md ${editingId === r.id ? "border-primary/50 ring-1 ring-primary/40" : "border-border/60"}`}
                    >
                      <div className="flex items-start gap-3 px-3 py-2.5">
                        {/* Rule description - click to expand */}
                        <button
                          type="button"
                          onClick={() => setExpandedId(expanded ? null : r.id)}
                          className="flex flex-1 min-w-0 items-start gap-2 text-left"
                        >
                          <ChevronDown
                            className={`h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                          />
                          <span className="flex-1 min-w-0 text-sm leading-snug">
                            <span className="font-semibold">{triggerSummary(r)}</span>
                            <span className="text-muted-foreground text-xs"> → </span>
                            {actionSummary(r)}
                            {(r.conditions?.groups?.length ?? 0) > 0 && (
                              <span className="text-[10px] text-muted-foreground ml-1">· {r.conditions!.groups.length} grup syarat</span>
                            )}
                            {r.enabled !== 1 && (
                              <span className="ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/60 align-middle">
                                nonaktif
                              </span>
                            )}
                          </span>
                        </button>

                        {/* Enable toggle + edit + delete - must not trigger expand */}
                        <div
                          className="flex items-center gap-1.5 shrink-0 mt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary hover:bg-primary/10"
                            onClick={(e) => { e.stopPropagation(); startEdit(r); }}
                            aria-label="Edit otomasi"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Switch
                            checked={r.enabled === 1}
                            onCheckedChange={(c) => toggleEnabled(r.id, c)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                            aria-label="Hapus otomasi"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Detail panel */}
                      {expanded && (
                        <div className="border-t border-border/60 bg-muted/20 px-3 py-3 text-xs space-y-2.5">
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-0.5">Trigger</div>
                            <div>{triggerSummary(r)}</div>
                          </div>

                          {(r.conditions?.groups?.length ?? 0) > 0 && (
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Syarat - cocok jika salah satu grup terpenuhi</div>
                              <div className="space-y-1.5">
                                {r.conditions!.groups.map((group, gi) => (
                                  <div key={gi}>
                                    {gi > 0 && <div className="text-[10px] font-semibold text-muted-foreground/60 my-0.5">ATAU</div>}
                                    <div className="rounded border border-border/40 px-2 py-1 space-y-0.5">
                                      {group.map((c, ci) => (
                                        <div key={ci}>
                                          {ci > 0 && <span className="text-[10px] text-muted-foreground/60 mr-1">DAN</span>}
                                          <span className="font-medium">{c.fieldLabel ?? `Field #${c.fieldId}`}</span>{" "}
                                          <span className="text-muted-foreground">{c.op}</span>{" "}
                                          {c.op !== "empty" && c.op !== "not_empty" && <span className="font-medium">{c.value}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {r.triggerType !== "billing_sync" && !String(r.triggerType ?? "").startsWith("lead_") && (
                          <div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Aksi (urut)</div>
                            <div className="space-y-1.5">
                              {(r.actions ?? []).map((a, i) => (
                                <div key={a.id ?? i} className="rounded border border-border/40 px-2 py-1.5">
                                  <div className="font-medium">#{i + 1} · {actionSummary({ actions: [a] } as any)}</div>
                                  {a.actionType === "create_card" && (
                                    <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                                      <div>Judul: {a.titleTemplate ? <span className="font-mono">{a.titleTemplate}</span> : <span className="italic">salin judul sumber</span>}</div>
                                      {a.copyAssignee === 1 && <div>Salin assignee: ya</div>}
                                      {(a.fieldMaps ?? []).length > 0 && (
                                        <div>
                                          {(a.fieldMaps ?? []).map((fm: any) => (
                                            <div key={fm.id} className="flex items-center gap-1.5">
                                              <span className="font-medium">{fm.sourceFieldLabel}</span>{typeChip(fm.sourceFieldType)}
                                              <span>→</span>
                                              <span className="font-medium">{fm.targetFieldLabel}</span>{typeChip(fm.targetFieldType)}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </FormSection>
          </div>

          {/* Add / edit rule form */}
          <div className="px-6 pb-6 border-t pt-5">
            <FormSection
              title={editingId != null ? "Edit Otomasi" : "Tambah Otomasi"}
              description={
                editingId != null && editingRule
                  ? `Mengedit: ${triggerSummary(editingRule)}`
                  : "Konfigurasikan pemicu dan aksi otomasi"
              }
            >
              <form ref={formRef} onSubmit={submit}>
              <FormField label="Pemicu" htmlFor="rule-trigger-type" required>
                <Combobox
                  options={[
                    { value: "stage_enter", label: "Saat masuk stage" },
                    { value: "time", label: "Berbasis waktu" },
                    { value: "billing_sync", label: "Saat sync billing" },
                    ...EVENT_TRIGGER_TYPES.map((t) => ({ value: t.type, label: t.label })),
                    ...LEAD_TRIGGER_OPTIONS,
                  ]}
                  value={triggerType}
                  onChange={(v) => {
                    const next = (v || "stage_enter") as RuleDraft["triggerType"];
                    if (triggerType.startsWith("lead_") !== next.startsWith("lead_")) setConditions([]);
                    setTriggerType(next);
                  }}
                  clearable={false}
                />
              </FormField>

              {triggerType === "stage_enter" && (
                <FormField
                  label="Saat kartu masuk stage"
                  htmlFor="rule-trigger-stage"
                  required
                >
                  <Combobox
                    options={selfStages.map((s) => ({ value: String(s.id), label: s.label }))}
                    value={triggerStageId}
                    onChange={(v) => setTriggerStageId(v)}
                    placeholder="Pilih stage trigger…"
                    searchPlaceholder="Cari stage…"
                    clearable={false}
                  />
                </FormField>
              )}

              {triggerType === "stage_enter" && (
                <FormField label="Pengulangan" htmlFor="rule-recurrence"
                  hint="Sekali = fire seumur kartu. Masuk ulang = fire lagi tiap kartu kembali ke stage ini.">
                  <Combobox
                    options={RECURRENCE_MODES.map((m) => ({ value: m.mode, label: m.label }))}
                    value={recurrence}
                    onChange={(v) => setRecurrence((v || "once") as "once" | "on_reenter" | "always")}
                    clearable={false}
                  />
                </FormField>
              )}

              {triggerType === "time" && (
                <>
                  <FormField label="Anchor waktu" htmlFor="rule-time-anchor" required>
                    <Combobox
                      options={[
                        { value: "stage_entered", label: "Saat masuk stage" },
                        { value: "card_created", label: "Saat kartu dibuat" },
                        { value: "field_date", label: "Tanggal di field" },
                      ]}
                      value={anchor}
                      onChange={(v) => setAnchor((v || "stage_entered") as "stage_entered" | "card_created" | "field_date")}
                      clearable={false}
                    />
                  </FormField>

                  {anchor === "field_date" && (
                    <FormField label="Field tanggal (anchor)" htmlFor="rule-anchor-field" required>
                      <Combobox
                        options={sourceFields
                          .filter((f) => f.type === "date")
                          .map((f) => ({ value: String(f.id), label: f.label }))}
                        value={anchorFieldId}
                        onChange={(v) => setAnchorFieldId(v)}
                        placeholder="Pilih field tanggal…"
                        searchPlaceholder="Cari field…"
                        clearable={false}
                      />
                    </FormField>
                  )}

                  <FormField label={`Offset (${offsetUnit})`} htmlFor="rule-offset-n" required>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        id="rule-offset-n"
                        type="number"
                        min={0}
                        value={offsetN}
                        onChange={(e) => setOffsetN(e.target.value)}
                        className="w-24"
                      />
                      <Combobox
                        options={[
                          { value: "hours", label: "jam" },
                          { value: "days", label: "hari" },
                        ]}
                        value={offsetUnit}
                        onChange={(v) => setOffsetUnit((v || "days") as "hours" | "days")}
                        clearable={false}
                      />
                      <Combobox
                        options={[
                          { value: "after", label: "sesudah" },
                          { value: "before", label: "sebelum" },
                        ]}
                        value={direction}
                        onChange={(v) => setDirection((v || "after") as "after" | "before")}
                        clearable={false}
                      />
                    </div>
                  </FormField>

                  <FormField label="Pengulangan" htmlFor="rule-repeat">
                    <Combobox
                      options={[
                        { value: "once", label: "sekali" },
                        { value: "every", label: "berulang tiap" },
                      ]}
                      value={repeat}
                      onChange={(v) => setRepeat((v || "once") as "once" | "every")}
                      clearable={false}
                    />
                  </FormField>

                  {repeat === "every" && (
                    <FormField label={`Ulang tiap (N ${offsetUnit})`} htmlFor="rule-repeat-every-n" required>
                      <Input
                        id="rule-repeat-every-n"
                        type="number"
                        min={1}
                        value={repeatEveryN}
                        onChange={(e) => setRepeatEveryN(e.target.value)}
                        className="w-24"
                      />
                    </FormField>
                  )}

                  <FormField label="Batasan stage (opsional)" htmlFor="rule-scope-stage" hint="Kosongkan untuk berlaku di semua stage.">
                    <Combobox
                      options={[
                        { value: "", label: "- semua stage -" },
                        ...selfStages.map((s) => ({ value: String(s.id), label: s.label })),
                      ]}
                      value={scopeStageId}
                      onChange={(v) => setScopeStageId(v)}
                      placeholder="- semua stage -"
                      searchPlaceholder="Cari stage…"
                    />
                  </FormField>
                </>
              )}

              {triggerType === "billing_sync" && (
                <>
                  <FormField label="Jenis Pelanggan (filter)" htmlFor="rule-billing-ctype" hint="Abaikan = semua jenis.">
                    <Combobox
                      options={[{ value: "", label: "Abaikan (semua)" }, ...BILLING_FILTER_OPTIONS.customerType]}
                      value={billingFilterCustomerType}
                      onChange={(v) => setBillingFilterCustomerType(v ?? "")}
                      clearable={false}
                    />
                  </FormField>

                  <FormField label="Status Pelanggan (filter)" htmlFor="rule-billing-status" hint="Abaikan = semua status.">
                    <Combobox
                      options={[{ value: "", label: "Abaikan (semua)" }, ...BILLING_FILTER_OPTIONS.status]}
                      value={billingFilterStatus}
                      onChange={(v) => setBillingFilterStatus(v ?? "")}
                      clearable={false}
                    />
                  </FormField>

                  <FormField label="Isolir (filter)" htmlFor="rule-billing-isolir">
                    <Combobox
                      options={[
                        { value: "", label: "Abaikan" },
                        { value: "1", label: "Ya (terisolir)" },
                        { value: "0", label: "Tidak (aktif)" },
                      ]}
                      value={billingFilterIsIsolir}
                      onChange={(v) => setBillingFilterIsIsolir((v ?? "") as "" | "0" | "1")}
                      clearable={false}
                    />
                  </FormField>

                  <FormField label="Status Billing (filter)" htmlFor="rule-billing-bstatus" hint="Abaikan = semua status billing.">
                    <Combobox
                      options={[{ value: "", label: "Abaikan (semua)" }, ...BILLING_FILTER_OPTIONS.billingStatus]}
                      value={billingFilterBillingStatus}
                      onChange={(v) => setBillingFilterBillingStatus(v ?? "")}
                      clearable={false}
                    />
                  </FormField>

                  <FormField
                    label="Masuk pipeline setelah … hari overdue"
                    htmlFor="rule-billing-min-overdue"
                    hint="Hitung dari Jatuh Tempo (dueDate) billing. Kosong/0 = langsung saat cocok filter. Mis. 7 = kartu dibuat hanya setelah ≥ 7 hari lewat jatuh tempo."
                  >
                    <Input
                      id="rule-billing-min-overdue"
                      type="number"
                      min={0}
                      inputSize="sm"
                      className="w-28"
                      value={billingFilterMinOverdueDays}
                      onChange={(e) => setBillingFilterMinOverdueDays(e.target.value)}
                      placeholder="0"
                    />
                  </FormField>

                  {Number(billingFilterMinOverdueDays) > 0 && (
                    <FormField
                      label="Hitung overdue dari"
                      htmlFor="rule-billing-overdue-from"
                      hint="Tanggal billing yang jadi basis hitung hari overdue. Custom field kartu tak bisa dipakai (kartu belum ada saat dibuat)."
                    >
                      <Combobox
                        options={OVERDUE_DATE_ATTRS}
                        value={billingOverdueFromAttr}
                        onChange={(v) => setBillingOverdueFromAttr(v || "dueDate")}
                        clearable={false}
                      />
                    </FormField>
                  )}

                  <FormField label="Stage masuk (entry)" htmlFor="rule-billing-entry-stage" required>
                    <Combobox
                      options={selfStages.map((s) => ({ value: String(s.id), label: s.label }))}
                      value={billingEntryStageId}
                      onChange={(v) => setBillingEntryStageId(v)}
                      placeholder="Pilih stage entry…"
                      searchPlaceholder="Cari stage…"
                      clearable={false}
                    />
                  </FormField>

                  <FormField label="Stage saat selesai/resolve (opsional)" htmlFor="rule-billing-resolve-stage" hint="Stage yang dituju saat pelanggan sudah tidak cocok filter. Kosongkan untuk abaikan.">
                    <Combobox
                      options={[
                        { value: "", label: "- Abaikan / none -" },
                        ...selfStages.map((s) => ({ value: String(s.id), label: s.label })),
                      ]}
                      value={billingResolveStageId}
                      onChange={(v) => setBillingResolveStageId(v)}
                      placeholder="- Abaikan / none -"
                      searchPlaceholder="Cari stage…"
                    />
                  </FormField>

                  <FormField label="Judul kartu dari" htmlFor="rule-billing-title-source">
                    <Combobox
                      options={BILLING_ATTRS.filter((a) => a.key !== "coordinate").map((a) => ({ value: a.key, label: a.label }))}
                      value={billingTitleSource}
                      onChange={(v) => setBillingTitleSource(v || "name")}
                      clearable={false}
                    />
                  </FormField>

                  <fieldset className="space-y-2 border-0 p-0 m-0">
                    <legend className="text-xs font-semibold text-muted-foreground mb-1">
                      Peta field billing → field kartu
                    </legend>
                    {billingFieldMap.map((row, i) => {
                      const compatTargets = sourceFields.filter(
                        (f) => row.attr && attrCompatibleWithFieldType(row.attr, f.type ?? ""),
                      );
                      return (
                      <div key={row._key} className="flex items-center gap-2">
                        <Combobox
                          options={BILLING_ATTRS.map((a) => ({ value: a.key, label: a.label }))}
                          value={row.attr}
                          onChange={(v) =>
                            setBillingFieldMap((arr) =>
                              arr.map((x, idx) => idx === i ? { ...x, attr: v, targetFieldId: "" } : x)
                            )
                          }
                          placeholder="Atribut billing…"
                          searchPlaceholder="Cari atribut…"
                          clearable={false}
                        />
                        <span className="text-muted-foreground text-xs">→</span>
                        <Combobox
                          options={compatTargets.map((f) => ({ value: String(f.id), label: f.label }))}
                          value={row.targetFieldId}
                          onChange={(v) =>
                            setBillingFieldMap((arr) =>
                              arr.map((x, idx) => idx === i ? { ...x, targetFieldId: v } : x)
                            )
                          }
                          placeholder="Field kartu…"
                          searchPlaceholder="Cari field…"
                          clearable={false}
                        />
                        {row.attr && compatTargets.length === 0 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="shrink-0 whitespace-nowrap"
                            onClick={() => createBillingTargetField(i, row.attr)}
                            loading={m.createField.isPending}
                          >
                            + Buat di target
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Hapus baris"
                          onClick={() => setBillingFieldMap((arr) => arr.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      );
                    })}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setBillingFieldMap((arr) => [...arr, emptyBillingRow()])}
                    >
                      + Tambah peta field
                    </Button>
                  </fieldset>
                </>
              )}

              {/* field_updated: optional field picker */}
              {triggerType === "field_updated" && (
                <FormField
                  label="Field yang dimonitor (opsional)"
                  htmlFor="rule-field-updated-field"
                  hint="Kosongkan untuk berlaku di semua field."
                >
                  <Combobox
                    options={[
                      { value: "", label: "- Semua field -" },
                      ...sourceFields.map((f) => ({ value: String(f.id), label: f.label })),
                    ]}
                    value={fieldUpdatedFieldId}
                    onChange={(v) => setFieldUpdatedFieldId(v)}
                    placeholder="- Semua field -"
                    searchPlaceholder="Cari field…"
                  />
                </FormField>
              )}

              {/* lead_* sub-form */}
              {triggerType.startsWith("lead_") && (
                <>
                  <fieldset className="space-y-2 border-0 p-0 m-0">
                    <legend className="text-xs font-semibold text-muted-foreground mb-1">
                      Filter sumber lead
                    </legend>
                    <div className="flex flex-wrap gap-1.5">
                      {LEAD_SOURCE_OPTIONS.map((opt) => {
                        const active = leadSources.includes(opt.value);
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() =>
                              setLeadSources((prev) =>
                                active ? prev.filter((s) => s !== opt.value) : [...prev, opt.value],
                              )
                            }
                            className={cn(
                              "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                              active
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border/60 bg-muted/30 text-muted-foreground hover:border-primary/50 hover:bg-primary/5 hover:text-primary",
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground/70">
                      Tidak ada pilihan = cocok semua sumber.
                    </p>
                  </fieldset>

                  <FormField label="Stage masuk (entry)" htmlFor="rule-lead-entry-stage" required>
                    <Combobox
                      options={selfStages.map((s) => ({ value: String(s.id), label: s.label }))}
                      value={leadEntryStageId}
                      onChange={(v) => setLeadEntryStageId(v)}
                      placeholder="Pilih stage entry…"
                      searchPlaceholder="Cari stage…"
                      clearable={false}
                    />
                  </FormField>

                  <FormField label="Judul kartu dari" htmlFor="rule-lead-title-source">
                    <Combobox
                      options={LEAD_ATTRS.filter((a) => a.key !== "coordinate").map((a) => ({ value: a.key, label: a.label }))}
                      value={leadTitleSource}
                      onChange={(v) => setLeadTitleSource(v || "name")}
                      clearable={false}
                    />
                  </FormField>

                  <fieldset className="space-y-2 border-0 p-0 m-0">
                    <legend className="text-xs font-semibold text-muted-foreground mb-1">
                      Peta field lead → field kartu
                    </legend>
                    {leadFieldMap.map((row, i) => (
                      <div key={row._key} className="flex items-center gap-2">
                        <Combobox
                          options={LEAD_ATTRS.map((a) => ({ value: a.key, label: a.label }))}
                          value={row.attr}
                          onChange={(v) =>
                            setLeadFieldMap((arr) =>
                              arr.map((x, idx) => (idx === i ? { ...x, attr: v, targetFieldId: "" } : x)),
                            )
                          }
                          placeholder="Atribut lead…"
                          searchPlaceholder="Cari atribut…"
                          clearable={false}
                        />
                        <span className="text-muted-foreground text-xs">→</span>
                        <Combobox
                          options={sourceFields.map((f) => ({ value: String(f.id), label: f.label }))}
                          value={row.targetFieldId}
                          onChange={(v) =>
                            setLeadFieldMap((arr) =>
                              arr.map((x, idx) => (idx === i ? { ...x, targetFieldId: v } : x)),
                            )
                          }
                          placeholder="Field kartu…"
                          searchPlaceholder="Cari field…"
                          clearable={false}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Hapus baris"
                          onClick={() => setLeadFieldMap((arr) => arr.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setLeadFieldMap((arr) => [...arr, emptyLeadRow()])}
                    >
                      + Tambah pemetaan
                    </Button>
                  </fieldset>

                  <FormField label="Jika duplikat" htmlFor="rule-lead-on-duplicate">
                    <Combobox
                      options={[
                        { value: "create", label: "Buat baru" },
                        { value: "update", label: "Perbarui" },
                        { value: "ignore", label: "Abaikan" },
                        { value: "reopen", label: "Buka lagi" },
                      ]}
                      value={leadOnDuplicate ?? "ignore"}
                      onChange={(v) => setLeadOnDuplicate((v || "ignore") as RuleDraft["leadOnDuplicate"])}
                      clearable={false}
                    />
                  </FormField>

                  <FormField label="Dedup berdasarkan" htmlFor="rule-lead-dedup-by">
                    <Combobox
                      options={[
                        { value: "lead_id", label: "Lead (1 lead = 1 kartu)" },
                        { value: "phone", label: "Nomor telepon" },
                      ]}
                      value={leadDedupBy ?? "lead_id"}
                      onChange={(v) => setLeadDedupBy((v || "lead_id") as RuleDraft["leadDedupBy"])}
                      clearable={false}
                    />
                  </FormField>

                  {leadOnDuplicate === "reopen" && (
                    <FormField label="Stage 'buka lagi'" htmlFor="rule-lead-reopen-stage" required>
                      <Combobox
                        options={selfStages.map((s) => ({ value: String(s.id), label: s.label }))}
                        value={leadReopenStageId}
                        onChange={(v) => setLeadReopenStageId(v)}
                        placeholder="Pilih stage…"
                        searchPlaceholder="Cari stage…"
                        clearable={false}
                      />
                    </FormField>
                  )}

                  <div className="pt-1">
                    <ConditionsBuilder leadMode fields={[]} value={conditions} onChange={setConditions} />
                  </div>

                  <fieldset className="border border-border/60 rounded-lg p-3 space-y-2">
                    <legend className="text-xs font-semibold px-1">Notifikasi (opsional)</legend>
                    <NotifyConfigFields
                      value={leadNotify}
                      onChange={(patch) => setLeadNotify((n) => ({ ...n, ...patch }))}
                      users={staffUsers ?? []}
                      keyPrefix="lead"
                      assigneeLabel="Assignee lead"
                    />
                  </fieldset>
                </>
              )}

              {/* Actions list - hidden for billing_sync + lead triggers (backend handles card creation internally) */}
              {triggerType !== "billing_sync" && !triggerType.startsWith("lead_") && (
                <>
                  <fieldset className="space-y-3 border-0 p-0 m-0">
                    <legend className="text-xs font-semibold text-muted-foreground mb-1">Aksi (urut dijalankan dari atas)</legend>
                    {actions.map((a, i) => (
                      <div key={a._key} className="rounded-lg border border-border/60 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">Aksi #{i + 1}</span>
                          <div className="flex items-center gap-1">
                            <Button type="button" variant="ghost" size="icon-sm" aria-label="Naikkan aksi" disabled={i === 0}
                              onClick={() => setActions((arr) => moveItem(arr, i, i - 1))}><ChevronUp className="h-3.5 w-3.5" /></Button>
                            <Button type="button" variant="ghost" size="icon-sm" aria-label="Turunkan aksi" disabled={i === actions.length - 1}
                              onClick={() => setActions((arr) => moveItem(arr, i, i + 1))}><ChevronDown className="h-3.5 w-3.5" /></Button>
                            <Button type="button" variant="ghost" size="icon-sm" aria-label="Hapus aksi" disabled={actions.length === 1}
                              onClick={() => setActions((arr) => arr.filter((_, idx) => idx !== i))}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                        <RuleActionEditor
                          value={a}
                          onChange={(next) => setActions((arr) => arr.map((x, idx) => (idx === i ? next : x)))}
                          sourceFields={sourceFields}
                          selfStages={selfStages}
                          allPipelines={allPipelines ?? []}
                          staffUsers={staffUsers ?? []}
                        />
                      </div>
                    ))}
                    <Button type="button" variant="ghost" size="sm" onClick={() => setActions((arr) => [...arr, emptyAction()])}>+ Tambah aksi</Button>
                  </fieldset>

                  <ConditionsBuilder fields={sourceFields} value={conditions} onChange={setConditions} />
                </>
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  leftIcon={editingId != null ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  loading={editingId != null ? m.updateRule.isPending : m.createRule.isPending}
                  disabled={
                    (triggerType === "stage_enter" && !triggerStageId) ||
                    (triggerType === "time" && anchor === "field_date" && !anchorFieldId) ||
                    (triggerType === "billing_sync" && !billingEntryStageId) ||
                    (triggerType.startsWith("lead_") && !leadEntryStageId) ||
                    (triggerType.startsWith("lead_") && leadOnDuplicate === "reopen" && !leadReopenStageId)
                    // card_updated / assignee_changed / field_updated: no required sub-form fields
                  }
                  className="w-full sm:w-auto"
                >
                  {editingId != null ? "Simpan Perubahan" : "Tambah Otomasi"}
                </Button>
                {editingId != null && (
                  <Button type="button" variant="ghost" onClick={cancelEdit}>
                    Batal
                  </Button>
                )}
              </div>
              </form>
            </FormSection>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
