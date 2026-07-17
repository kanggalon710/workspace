import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { usePipeline, useMetricDefs, useSaveMetricDef } from "@/hooks/usePipelines";
import { ConditionsBuilder, type DraftCondition } from "./ConditionsBuilder";
import { METRIC_SOURCES, METRIC_AGGREGATIONS, METRIC_TYPES, METRIC_ICONS, METRIC_COLORS } from "@shared/pipelineMetrics";
import { TIME_PRESETS } from "@shared/metricTimeWindow";
import { METRIC_ICON_MAP } from "./metricIcons";
import { FORMULA_TERM_KEYS, parseFormula } from "@shared/metricFormula";

const COLOR_BG: Record<string, string> = {
  primary: "bg-primary/15", success: "bg-success/15", warning: "bg-warning/15",
  danger: "bg-destructive/15", info: "bg-info/15", violet: "bg-violet-500/15", neutral: "bg-muted",
};

type TermDraft = {
  key: string; source: string; aggregation: string; fieldId: string;
  stageIds: number[]; conditions: DraftCondition[][];
};

type Draft = {
  id?: number; name: string; description: string; icon: string; color: string; type: string;
  source: string; aggregation: string; fieldId: string; stageIds: number[];
  conditions: DraftCondition[][]; prefix: string; suffix: string; decimals: string; visible: boolean;
  timeField: string; timePreset: string; timeFrom: string; timeTo: string;
  terms: TermDraft[]; formula: string;
};
const empty: Draft = { name: "", description: "", icon: "Database", color: "primary", type: "number", source: "card_count", aggregation: "count", fieldId: "", stageIds: [], conditions: [], prefix: "", suffix: "", decimals: "", visible: true, timeField: "none", timePreset: "all", timeFrom: "", timeTo: "", terms: [], formula: "" };

export function MetricsConfigDialog({ pipelineId, open, onClose }: { pipelineId: number; open: boolean; onClose: () => void }) {
  const { data: pipeline } = usePipeline(pipelineId);
  const { data: defs } = useMetricDefs(pipelineId, open);
  const save = useSaveMetricDef(pipelineId);
  const [draft, setDraft] = useState<Draft | null>(null);
  const fields = pipeline?.fields ?? [];
  const stages = pipeline?.stages ?? [];

  const startEdit = (d: any) => setDraft({
    id: d.id, name: d.name, description: d.description ?? "", icon: d.icon ?? "Database", color: d.color ?? "primary",
    type: d.type, source: d.source, aggregation: d.aggregation, fieldId: d.fieldId != null ? String(d.fieldId) : "",
    stageIds: d.stageIds ? JSON.parse(d.stageIds) : [],
    conditions: (() => {
      // d.conditions is a JSON string from the API: `{groups:[...]}` (current) or a legacy flat array.
      const p = d.conditions ? JSON.parse(d.conditions) : null;
      if (!p) return [];
      const gs: any[][] = Array.isArray(p.groups) ? p.groups : Array.isArray(p) ? [p] : [];
      return gs.map((g) => g.map((c: any) => ({ source: c.source ?? "field", fieldId: typeof c.fieldId === "number" ? c.fieldId : "", attr: c.attr, op: c.op, value: c.value ?? "" })));
    })(),
    prefix: d.prefix ?? "", suffix: d.suffix ?? "", decimals: d.decimals != null ? String(d.decimals) : "",
    timeField: d.timeField ?? "none", timePreset: d.timePreset ?? "all", timeFrom: d.timeFrom ?? "", timeTo: d.timeTo ?? "",
    terms: (() => {
      const arr: any[] = d.terms ? JSON.parse(d.terms) : [];
      return arr.map((t) => ({
        key: t.key, source: t.source ?? "card_count", aggregation: t.aggregation ?? "count",
        fieldId: t.fieldId != null ? String(t.fieldId) : "", stageIds: Array.isArray(t.stageIds) ? t.stageIds : [],
        conditions: (() => {
          const p = t.conditions ?? null;
          const gs: any[][] = p && Array.isArray(p.groups) ? p.groups : Array.isArray(p) ? [p] : [];
          return gs.map((g) => g.map((c: any) => ({ source: c.source ?? "field", fieldId: typeof c.fieldId === "number" ? c.fieldId : "", attr: c.attr, op: c.op, value: c.value ?? "" })));
        })(),
      }));
    })(),
    formula: d.formula ?? "",
    visible: d.visible === 1,
  });

  const toPayload = (d: Draft) => ({
    name: d.name, description: d.description || null, icon: d.icon, color: d.color, type: d.type, source: d.source,
    aggregation: d.aggregation, fieldId: d.source === "field_agg" && d.fieldId ? Number(d.fieldId) : null,
    stageIds: d.stageIds, prefix: d.prefix || null, suffix: d.suffix || null,
    decimals: d.decimals.trim() === "" ? null : Number(d.decimals), visible: d.visible,
    timeField: d.timeField && d.timeField !== "none" ? d.timeField : null,
    timePreset: d.timeField && d.timeField !== "none" && d.timePreset && d.timePreset !== "all" ? d.timePreset : null,
    timeFrom: d.timeField !== "none" && d.timePreset === "custom" && d.timeFrom ? d.timeFrom : null,
    timeTo: d.timeField !== "none" && d.timePreset === "custom" && d.timeTo ? d.timeTo : null,
    conditions: d.conditions.length ? { groups: d.conditions.map((g) => g.filter((c) => c.source === "billing" ? !!c.attr : c.fieldId !== "").map((c) => c.source === "billing" ? { source: "billing", attr: c.attr, op: c.op, value: c.value } : { fieldId: Number(c.fieldId), op: c.op, ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }) })).filter((g) => g.length) } : null,
    terms: d.source === "formula"
      ? d.terms.map((t) => ({
          key: t.key, source: t.source, aggregation: t.aggregation,
          fieldId: t.source === "field_agg" && t.fieldId ? Number(t.fieldId) : null,
          stageIds: t.stageIds,
          conditions: t.conditions.length
            ? { groups: t.conditions.map((g) => g.filter((c) => c.source === "billing" ? !!c.attr : c.fieldId !== "").map((c) => c.source === "billing" ? { source: "billing", attr: c.attr, op: c.op, value: c.value } : { fieldId: Number(c.fieldId), op: c.op, ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }) })).filter((g) => g.length) }
            : null,
        })).filter((t) => t.source !== "field_agg" || t.fieldId != null)
      : null,
    formula: d.source === "formula" ? d.formula : null,
  });

  const onSave = () => {
    if (!draft) return;
    if (!draft.name.trim()) { toast.error("Nama metric wajib diisi"); return; }
    const body = toPayload(draft);
    const opts = { onSuccess: () => { toast.success("Metric disimpan"); setDraft(null); }, onError: (e: any) => toast.error(e?.message || "Gagal menyimpan") };
    if (draft.id) save.update.mutate({ id: draft.id, body }, opts); else save.create.mutate(body, opts);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b shrink-0"><DialogTitle>{draft ? (draft.id ? "Edit Metric" : "Metric Baru") : "Kelola Metrik"}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!draft ? (
            <>
              <Button size="sm" onClick={() => setDraft({ ...empty })}><Plus className="size-3.5 mr-1" /> Metric baru</Button>
              <ul className="space-y-1.5">
                {(defs ?? []).map((d: any) => (
                  <li key={d.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                    <span className="text-sm font-medium truncate">{d.name} <span className="text-[10px] text-muted-foreground">· {d.source}{d.visible ? "" : " · hidden"}</span></span>
                    <span className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => startEdit(d)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Hapus" onClick={() => save.remove.mutate(d.id, { onSuccess: () => toast.success("Metric dihapus") })}><Trash2 className="size-4" /></Button>
                    </span>
                  </li>
                ))}
                {(defs ?? []).length === 0 && <li className="text-xs text-muted-foreground">Belum ada metric.</li>}
              </ul>
            </>
          ) : (
            <div className="space-y-3">
              <Input inputSize="sm" aria-label="Nama metric" placeholder="Nama metric" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <Input inputSize="sm" aria-label="Deskripsi (opsional)" placeholder="Deskripsi (opsional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Combobox size="sm" options={METRIC_TYPES.map((t) => ({ value: t.type, label: t.label }))} value={draft.type} onChange={(v) => setDraft({ ...draft, type: v || "number" })} clearable={false} />
                <Combobox size="sm" options={METRIC_SOURCES.map((s) => ({ value: s.source, label: s.label }))} value={draft.source} onChange={(v) => setDraft({ ...draft, source: v || "card_count" })} clearable={false} />
              </div>
              {draft.source === "field_agg" && (
                <div className="grid grid-cols-2 gap-2">
                  <Combobox size="sm" options={METRIC_AGGREGATIONS.map((a) => ({ value: a.aggregation, label: a.label }))} value={draft.aggregation} onChange={(v) => setDraft({ ...draft, aggregation: v || "count" })} clearable={false} />
                  <Combobox size="sm" options={fields.map((f) => ({ value: String(f.id), label: f.label }))} value={draft.fieldId} onChange={(v) => setDraft({ ...draft, fieldId: v })} placeholder="Field…" />
                </div>
              )}
              {draft.source === "formula" && (
                <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">Term (a, b, c…)</span>
                    {draft.terms.length < FORMULA_TERM_KEYS.length && (
                      <Button type="button" variant="ghost" size="xs" onClick={() => setDraft({ ...draft, terms: [...draft.terms, { key: FORMULA_TERM_KEYS[draft.terms.length], source: "card_count", aggregation: "count", fieldId: "", stageIds: [], conditions: [] }] })}>+ Term</Button>
                    )}
                  </div>
                  {draft.terms.map((t, ti) => (
                    <div key={t.key} className="space-y-1.5 rounded-md border border-border/50 p-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tight text-xs font-bold w-5 text-center">{t.key}</span>
                        <Combobox size="sm" className="flex-1" options={[{ value: "card_count", label: "Jumlah Kartu" }, { value: "field_agg", label: "Agregasi Field" }]} value={t.source} onChange={(v) => { const terms = [...draft.terms]; terms[ti] = { ...t, source: v || "card_count" }; setDraft({ ...draft, terms }); }} clearable={false} />
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Hapus term" onClick={() => setDraft({ ...draft, terms: draft.terms.filter((_, x) => x !== ti).map((tt, x) => ({ ...tt, key: FORMULA_TERM_KEYS[x] })) })}><Trash2 className="size-4" /></Button>
                      </div>
                      {t.source === "field_agg" && (
                        <div className="grid grid-cols-2 gap-2">
                          <Combobox size="sm" options={METRIC_AGGREGATIONS.map((a) => ({ value: a.aggregation, label: a.label }))} value={t.aggregation} onChange={(v) => { const terms = [...draft.terms]; terms[ti] = { ...t, aggregation: v || "count" }; setDraft({ ...draft, terms }); }} clearable={false} />
                          <Combobox size="sm" options={fields.map((f) => ({ value: String(f.id), label: f.label }))} value={t.fieldId} onChange={(v) => { const terms = [...draft.terms]; terms[ti] = { ...t, fieldId: v }; setDraft({ ...draft, terms }); }} placeholder="Field…" />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {stages.map((s) => {
                          const on = t.stageIds.includes(s.id);
                          return <button key={s.id} type="button" aria-pressed={on} onClick={() => { const terms = [...draft.terms]; terms[ti] = { ...t, stageIds: on ? t.stageIds.filter((x) => x !== s.id) : [...t.stageIds, s.id] }; setDraft({ ...draft, terms }); }} className={`text-2xs px-1.5 py-0.5 rounded-full border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{s.label}</button>;
                        })}
                      </div>
                      <ConditionsBuilder fields={fields} value={t.conditions} onChange={(c) => { const terms = [...draft.terms]; terms[ti] = { ...t, conditions: c }; setDraft({ ...draft, terms }); }} />
                    </div>
                  ))}
                  {draft.terms.length === 0 && <p className="text-2xs text-muted-foreground">Tambah minimal satu term.</p>}
                  <div>
                    <Input inputSize="sm" aria-label="Ekspresi mis. (a/b)*100" placeholder="Ekspresi mis. (a/b)*100" value={draft.formula} onChange={(e) => setDraft({ ...draft, formula: e.target.value })} />
                    {draft.formula.trim() !== "" && (() => {
                      const fr = parseFormula(draft.formula, draft.terms.map((t) => t.key));
                      return <p className={`text-2xs mt-1 ${fr.ok ? "text-success" : "text-destructive"}`}>{fr.ok ? "Formula valid" : fr.error}</p>;
                    })()}
                  </div>
                </div>
              )}
              {/* Stage scope */}
              <div>
                <span className="text-[10px] text-muted-foreground">Stage (kosong = semua)</span>
                <div className="flex flex-wrap gap-1.5">
                  {stages.map((s) => {
                    const on = draft.stageIds.includes(s.id);
                    return <button key={s.id} type="button" aria-pressed={on} onClick={() => setDraft({ ...draft, stageIds: on ? draft.stageIds.filter((x) => x !== s.id) : [...draft.stageIds, s.id] })} className={`text-xs px-2 py-1 rounded-full border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>{s.label}</button>;
                  })}
                </div>
              </div>
              {/* WHERE rules */}
              <ConditionsBuilder fields={fields} value={draft.conditions} onChange={(c) => setDraft({ ...draft, conditions: c })} />
              {/* Icon + color */}
              <div className="flex flex-wrap gap-1.5">
                {METRIC_ICONS.map((ic) => { const I = METRIC_ICON_MAP[ic]; return <button key={ic} type="button" aria-label={ic} onClick={() => setDraft({ ...draft, icon: ic })} className={`size-8 rounded-md border flex items-center justify-center ${draft.icon === ic ? "border-primary bg-primary/10" : "border-border hover:bg-muted"}`}>{I && <I className="size-4" />}</button>; })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {METRIC_COLORS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => setDraft({ ...draft, color: c })} className={`text-xs px-2 py-1 rounded-full border ${draft.color === c ? "border-foreground" : "border-border"} ${COLOR_BG[c] ?? "bg-muted"}`}>{c}</button>)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input inputSize="sm" aria-label="Prefix" placeholder="Prefix" value={draft.prefix} onChange={(e) => setDraft({ ...draft, prefix: e.target.value })} />
                <Input inputSize="sm" aria-label="Suffix" placeholder="Suffix" value={draft.suffix} onChange={(e) => setDraft({ ...draft, suffix: e.target.value })} />
                <Input inputSize="sm" type="number" aria-label="Desimal" placeholder="Desimal" value={draft.decimals} onChange={(e) => setDraft({ ...draft, decimals: e.target.value })} />
              </div>
              {/* Time basis (MP2) */}
              <div className="space-y-2 rounded-lg border border-border/60 p-2.5">
                <span className="text-[10px] text-muted-foreground">Basis waktu (opsional)</span>
                <div className="grid grid-cols-2 gap-2">
                  <Combobox
                    size="sm"
                    options={[
                      { value: "none", label: "Tidak ada (semua waktu)" },
                      { value: "created", label: "Tanggal dibuat" },
                      { value: "updated", label: "Tanggal update" },
                      ...fields.filter((f) => f.type === "date").map((f) => ({ value: `field:${f.id}`, label: `Field: ${f.label}` })),
                    ]}
                    value={draft.timeField}
                    onChange={(v) => setDraft({ ...draft, timeField: v || "none" })}
                    clearable={false}
                  />
                  {draft.timeField !== "none" && (
                    <Combobox
                      size="sm"
                      options={TIME_PRESETS.map((p) => ({ value: p.preset, label: p.label }))}
                      value={draft.timePreset}
                      onChange={(v) => setDraft({ ...draft, timePreset: v || "all" })}
                      clearable={false}
                    />
                  )}
                </div>
                {draft.timeField !== "none" && draft.timePreset === "custom" && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input inputSize="sm" type="date" aria-label="Dari" value={draft.timeFrom} onChange={(e) => setDraft({ ...draft, timeFrom: e.target.value })} />
                    <Input inputSize="sm" type="date" aria-label="Sampai" value={draft.timeTo} onChange={(e) => setDraft({ ...draft, timeTo: e.target.value })} />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm"><Switch checked={draft.visible} onCheckedChange={(v) => setDraft({ ...draft, visible: v })} /> Tampilkan di board</label>
            </div>
          )}
        </div>
        <DialogFooter className="px-5 py-3 border-t shrink-0">
          {draft ? (
            <>
              <Button variant="ghost" onClick={() => setDraft(null)}>Batal</Button>
              <Button onClick={onSave} loading={save.create.isPending || save.update.isPending}>Simpan</Button>
            </>
          ) : (
            <Button variant="ghost" onClick={onClose}>Tutup</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
