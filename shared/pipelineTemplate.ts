/** Pure transforms for pipeline templates. No DB, no I/O.
 *  Stage/field references are stored in templates by stable key (stage_<i>/field_<i>) and remapped
 *  to fresh DB ids on instantiation. The same rewrite runs in both directions (snapshot vs apply),
 *  so they are inverses. */

export interface TemplateDefinition {
  pipeline: { name: string; description: string | null; color: string; icon: string | null };
  stages: { key: string; label: string; color: string; position: number; description: string | null }[];
  fields: { key: string; label: string; type: string; options: string | null; required: number; showOnCard: number; position: number; config: string | null }[];
  rules: TemplateRule[];
}
export interface TemplateRule {
  name: string | null; triggerType: string; triggerStageKey: string | null;
  triggerConfig: any | null; conditions: any | null; enabled: number;
  actions: { actionType: string; actionConfig: any | null; targetStageKey: string | null; titleTemplate: string | null; copyAssignee: number; fieldMaps: { sourceFieldKey: string; targetFieldKey: string }[] }[];
}

type Mapper = (v: any) => any; // field/stage id<->key in one direction

/** Rewrite the field/stage refs inside a config JSON string (visibleWhen/requiredWhen condition groups).
 *  mapField/mapStage map a single ref value in the desired direction; other config keys are untouched. */
function rewriteConfigRefs(config: string | null, mapField: Mapper, mapStage: Mapper): string | null {
  if (!config) return config;
  let obj: any;
  try { obj = JSON.parse(config); } catch { return config; }
  for (const key of ["visibleWhen", "requiredWhen"]) {
    if (!Array.isArray(obj[key])) continue;
    obj[key] = obj[key].map((group: any[]) => (Array.isArray(group) ? group.map((c: any) => {
      if (c?.source === "stage") return { ...c, value: String(mapStage(c.value)) };
      return { ...c, fieldId: mapField(c.fieldId) };
    }) : group));
  }
  return JSON.stringify(obj);
}

/** Rewrite a triggerConfig blob's field/stage refs in place (returns a new object). */
function rewriteTriggerConfig(tc: any, triggerType: string, mapField: Mapper, mapStage: Mapper): any {
  if (tc == null || typeof tc !== "object") return tc;
  const out = { ...tc };
  if (triggerType === "field_updated" && out.fieldId != null) out.fieldId = mapField(out.fieldId);
  if (triggerType === "time" && out.anchor === "field_date" && out.fieldId != null) out.fieldId = mapField(out.fieldId);
  if (triggerType === "billing_sync") {
    if (out.resolveStageId != null) out.resolveStageId = mapStage(out.resolveStageId);
    if (Array.isArray(out.fieldMap)) out.fieldMap = out.fieldMap.map((m: any) => ({ ...m, targetFieldId: mapField(m.targetFieldId) }));
  }
  return out;
}

export function pipelineToTemplate(input: {
  pipeline: { name: string; description: string | null; color: string; icon: string | null };
  stages: { id: number; label: string; color: string; position: number; description: string | null }[];
  fields: { id: number; label: string; type: string; options: string | null; required: number; showOnCard: number; position: number; config: string | null }[];
  rules: any[];
}): TemplateDefinition {
  const stageIdToKey = new Map<number, string>();
  input.stages.forEach((s, i) => stageIdToKey.set(s.id, `stage_${i}`));
  const fieldIdToKey = new Map<number, string>();
  input.fields.forEach((f, i) => fieldIdToKey.set(f.id, `field_${i}`));
  const mf = (v: any) => fieldIdToKey.get(Number(v)) ?? v;
  const ms = (v: any) => stageIdToKey.get(Number(v)) ?? String(v);
  return {
    pipeline: { name: input.pipeline.name, description: input.pipeline.description ?? null, color: input.pipeline.color, icon: input.pipeline.icon ?? null },
    stages: input.stages.map((s, i) => ({ key: `stage_${i}`, label: s.label, color: s.color, position: i, description: s.description ?? null })),
    fields: input.fields.map((f, i) => ({ key: `field_${i}`, label: f.label, type: f.type, options: f.options ?? null, required: f.required ?? 0, showOnCard: f.showOnCard ?? 0, position: i, config: rewriteConfigRefs(f.config ?? null, mf, ms) })),
    rules: input.rules.map((r) => ({
      name: r.name ?? null, triggerType: r.triggerType, enabled: r.enabled ?? 1,
      triggerStageKey: r.triggerStageId != null ? (stageIdToKey.get(Number(r.triggerStageId)) ?? null) : null,
      triggerConfig: rewriteTriggerConfig(r.triggerConfig ?? null, r.triggerType, mf, ms),
      conditions: Array.isArray(r.conditions) ? r.conditions.map((g: any[]) => g.map((c: any) => ({ ...c, fieldId: mf(c.fieldId) }))) : (r.conditions ?? null),
      actions: (r.actions ?? []).filter((a: any) => !(a.targetPipelineId != null && a.targetPipelineId !== 0)).map((a: any) => {
        const ac = a.actionConfig && typeof a.actionConfig === "object" ? { ...a.actionConfig } : a.actionConfig;
        if (ac && typeof ac === "object") { if (ac.fieldId != null) ac.fieldId = mf(ac.fieldId); if (ac.stageId != null) ac.stageId = ms(ac.stageId); }
        return { actionType: a.actionType, actionConfig: ac, targetStageKey: a.targetStageId != null ? (stageIdToKey.get(Number(a.targetStageId)) ?? null) : null, titleTemplate: a.titleTemplate ?? null, copyAssignee: a.copyAssignee ?? 0, fieldMaps: (a.fieldMaps ?? []).map((m: any) => ({ sourceFieldKey: fieldIdToKey.get(Number(m.sourceFieldId)) ?? String(m.sourceFieldId), targetFieldKey: fieldIdToKey.get(Number(m.targetFieldId)) ?? String(m.targetFieldId) })) };
      }),
    })),
  };
}

export function remapFieldConfig(config: string | null, fieldKeyToId: Map<string, number>, stageKeyToId: Map<string, number>): string | null {
  return rewriteConfigRefs(config, (k) => fieldKeyToId.get(String(k)) ?? k, (k) => stageKeyToId.get(String(k)) ?? k);
}

/** Returns a `storage.createRule` data object (ids), built from a TemplateRule (keys). */
export function remapTemplateRule(rule: TemplateRule, fieldKeyToId: Map<string, number>, stageKeyToId: Map<string, number>) {
  const mf = (k: any) => fieldKeyToId.get(String(k)) ?? null;
  const ms = (k: any) => stageKeyToId.get(String(k)) ?? null;
  return {
    name: rule.name, triggerType: rule.triggerType as any, enabled: rule.enabled === 1,
    triggerStageId: rule.triggerStageKey != null ? ms(rule.triggerStageKey) : null,
    triggerConfig: rewriteTriggerConfig(rule.triggerConfig ?? null, rule.triggerType, mf, ms),
    conditions: Array.isArray(rule.conditions) ? rule.conditions.map((g: any[]) => g.map((c: any) => ({ ...c, fieldId: mf(c.fieldId) }))) : (rule.conditions ?? null),
    actions: rule.actions.map((a) => {
      const ac = a.actionConfig && typeof a.actionConfig === "object" ? { ...a.actionConfig } : a.actionConfig;
      if (ac && typeof ac === "object") { if (ac.fieldId != null) ac.fieldId = mf(ac.fieldId); if (ac.stageId != null) ac.stageId = ms(ac.stageId); }
      return { actionType: a.actionType, actionConfig: ac, targetStageId: a.targetStageKey != null ? ms(a.targetStageKey) : null, targetPipelineId: null, titleTemplate: a.titleTemplate, copyAssignee: a.copyAssignee, fieldMaps: a.fieldMaps.map((m) => ({ sourceFieldId: mf(m.sourceFieldKey)!, targetFieldId: mf(m.targetFieldKey)! })) };
    }),
  };
}

const nowKeyStages = (labels: { label: string; color: string }[]) =>
  labels.map((l, i) => ({ key: `stage_${i}`, label: l.label, color: l.color, position: i, description: null }));

export const BUILTIN_TEMPLATES: TemplateDefinition[] = [
  { pipeline: { name: "Sales Pipeline", description: "CRM penjualan", color: "#0EA5E9", icon: "trending-up" },
    stages: nowKeyStages([{ label: "Prospek", color: "#6B7280" }, { label: "Kualifikasi", color: "#3B82F6" }, { label: "Negosiasi", color: "#F59E0B" }, { label: "Menang", color: "#22C55E" }, { label: "Kalah", color: "#EF4444" }]),
    fields: [
      { key: "field_0", label: "Telepon", type: "phone", options: null, required: 0, showOnCard: 1, position: 0, config: null },
      { key: "field_1", label: "Nilai Deal", type: "number", options: null, required: 0, showOnCard: 1, position: 1, config: null },
      { key: "field_2", label: "Sumber", type: "dropdown", options: JSON.stringify(["inbound", "referral", "canvassing"]), required: 0, showOnCard: 0, position: 2, config: null },
    ], rules: [] },
  { pipeline: { name: "Collection Pipeline", description: "Penagihan", color: "#F59E0B", icon: "banknote" },
    stages: nowKeyStages([{ label: "Baru", color: "#6B7280" }, { label: "Dihubungi", color: "#3B82F6" }, { label: "Janji Bayar", color: "#8B5CF6" }, { label: "Lunas", color: "#22C55E" }, { label: "Hapus Buku", color: "#EF4444" }]),
    fields: [
      { key: "field_0", label: "Telepon", type: "phone", options: null, required: 0, showOnCard: 1, position: 0, config: null },
      { key: "field_1", label: "Tagihan (Rp)", type: "number", options: null, required: 0, showOnCard: 1, position: 1, config: null },
      { key: "field_2", label: "Jatuh Tempo", type: "text", options: null, required: 0, showOnCard: 1, position: 2, config: null },
    ], rules: [] },
  { pipeline: { name: "Project Pipeline", description: "Manajemen proyek", color: "#8B5CF6", icon: "folder-kanban" },
    stages: nowKeyStages([{ label: "Backlog", color: "#6B7280" }, { label: "Dikerjakan", color: "#3B82F6" }, { label: "Review", color: "#F59E0B" }, { label: "Selesai", color: "#22C55E" }]),
    fields: [
      { key: "field_0", label: "Penanggung Jawab", type: "user", options: null, required: 0, showOnCard: 1, position: 0, config: null },
      { key: "field_1", label: "Estimasi (hari)", type: "number", options: null, required: 0, showOnCard: 0, position: 1, config: null },
    ], rules: [] },
  { pipeline: { name: "Customer Service", description: "Tiket layanan", color: "#22C55E", icon: "headphones" },
    stages: nowKeyStages([{ label: "Masuk", color: "#6B7280" }, { label: "Diproses", color: "#3B82F6" }, { label: "Menunggu Pelanggan", color: "#F59E0B" }, { label: "Selesai", color: "#22C55E" }]),
    fields: [
      { key: "field_0", label: "Telepon", type: "phone", options: null, required: 0, showOnCard: 1, position: 0, config: null },
      { key: "field_1", label: "Kategori", type: "dropdown", options: JSON.stringify(["teknis", "billing", "umum"]), required: 0, showOnCard: 1, position: 1, config: null },
    ], rules: [] },
  { pipeline: { name: "Pipeline Lead", description: "Pipeline prospek/lead pemasaran", color: "#0EA5E9", icon: "users" },
    stages: nowKeyStages([{ label: "Lead Baru", color: "#6B7280" }, { label: "Dihubungi", color: "#3B82F6" }, { label: "Survey", color: "#8B5CF6" }, { label: "Negosiasi", color: "#F59E0B" }, { label: "Won", color: "#22C55E" }, { label: "Lost", color: "#EF4444" }]),
    fields: [
      { key: "field_0", label: "Telepon", type: "phone", options: null, required: 0, showOnCard: 1, position: 0, config: null },
      { key: "field_1", label: "Koordinat", type: "coordinate", options: null, required: 0, showOnCard: 0, position: 1, config: null },
      { key: "field_2", label: "Sumber", type: "dropdown", options: JSON.stringify(["canvassing", "prospect_finder", "coverage_check", "meta_leads", "tiktok_leads", "referral"]), required: 0, showOnCard: 1, position: 2, config: null },
      { key: "field_3", label: "Campaign", type: "text", options: null, required: 0, showOnCard: 0, position: 3, config: null },
    ], rules: [] },
];
