/** Pure helpers for pipeline automation - no DB. */
import type { PipelineRule, RuleCondition, TimeTriggerConfig, NotifyConfig } from "../shared/schema.js";
import { compareAttr, type CollectionSnapshot, type CollectionAttrKey } from "../shared/collectionMetrics.js";
import { applyConditionOp } from "../shared/leadConditions.js";

export function matchStageEnterRules(rules: PipelineRule[], stageId: number): PipelineRule[] {
  return rules.filter((r) => r.enabled === 1 && r.triggerStageId === stageId);
}

export function buildTargetTitle(template: string | null, sourceTitle: string): string {
  const out = !template ? sourceTitle : template.replace(/\{title\}/g, sourceTitle);
  return out.slice(0, 255);
}

/** Given field maps + the source card's values, produce the writes for the target card. */
export function pickMappedValues(
  maps: { sourceFieldId: number; targetFieldId: number }[],
  sourceValues: Record<number, string>,
): { fieldId: number; value: string }[] {
  const out: { fieldId: number; value: string }[] = [];
  for (const m of maps) {
    const v = sourceValues[m.sourceFieldId];
    if (v !== undefined && v !== "") out.push({ fieldId: m.targetFieldId, value: v });
  }
  return out;
}

/** Enriches raw rule field maps with human-readable labels + types from source/target field catalogues.
 *  If a field has been deleted (not found in the map), falls back to "Field #N (dihapus)" and null type. */
export function shapeRuleFieldMaps(
  maps: { id: number; sourceFieldId: number; targetFieldId: number }[],
  srcFields: Map<number, { label: string; type: string }>,
  tgtFields: Map<number, { label: string; type: string }>,
): {
  id: number; sourceFieldId: number; targetFieldId: number;
  sourceFieldLabel: string; sourceFieldType: string | null;
  targetFieldLabel: string; targetFieldType: string | null;
}[] {
  return maps.map((m) => {
    const sf = srcFields.get(m.sourceFieldId);
    const tf = tgtFields.get(m.targetFieldId);
    return {
      id: m.id, sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId,
      sourceFieldLabel: sf?.label ?? `Field #${m.sourceFieldId} (dihapus)`,
      sourceFieldType: sf?.type ?? null,
      targetFieldLabel: tf?.label ?? `Field #${m.targetFieldId} (dihapus)`,
      targetFieldType: tf?.type ?? null,
    };
  });
}

/** AND-evaluate field conditions against a card's values. null/empty → always true. */
export function evaluateConditions(
  conditions: RuleCondition[] | null,
  values: Map<number, string>,
  snapshot?: CollectionSnapshot | null,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((c) => {
    if (c.source === "billing") {
      return snapshot ? compareAttr(snapshot, c.attr as CollectionAttrKey, c.op, c.value) : false;
    }
    const stored = values.get(c.fieldId as number) ?? "";
    return applyConditionOp(stored, c.op, c.value ?? "");
  });
}

/** Safe-parse + shape-guard an action_config JSON string for a given action type.
 *  Returns null on malformed / missing-key / create_card (which uses legacy columns). */
export function parseActionConfig(
  type: string,
  raw: string | null,
): { fieldId: number; value: string } | { stageId: number } | { assigneeId: number | null } | NotifyConfig | null {
  if (type === "create_card" || !raw) return null;
  let obj: any;
  try { obj = JSON.parse(raw); } catch { return null; }
  if (!obj || typeof obj !== "object") return null;
  if (type === "set_field") {
    return (typeof obj.fieldId === "number" && typeof obj.value === "string") ? { fieldId: obj.fieldId, value: obj.value } : null;
  }
  if (type === "move_stage") {
    return (typeof obj.stageId === "number") ? { stageId: obj.stageId } : null;
  }
  if (type === "assign") {
    return (obj.assigneeId === null || typeof obj.assigneeId === "number") ? { assigneeId: obj.assigneeId } : null;
  }
  if (type === "notify") {
    const channels = Array.isArray(obj.channels) ? obj.channels.filter((c: any) => c === "bell" || c === "webhook") : [];
    if (channels.length === 0) return null;
    const out: NotifyConfig = { channels };
    if (channels.includes("bell")) {
      if (!["assignee", "user", "creator"].includes(obj.bellTarget)) return null;
      out.bellTarget = obj.bellTarget;
      if (obj.bellTarget === "user") {
        if (typeof obj.bellUserId !== "number") return null;
        out.bellUserId = obj.bellUserId;
      }
      if (typeof obj.bellTitle === "string") out.bellTitle = obj.bellTitle;
      if (typeof obj.bellMessage === "string") out.bellMessage = obj.bellMessage;
    }
    if (channels.includes("webhook")) {
      if (typeof obj.webhookUrl !== "string" || !obj.webhookUrl) return null;
      out.webhookUrl = obj.webhookUrl;
    }
    return out;
  }
  return null;
}

/** Safe-parse a conditions JSON string. Malformed → []. Filters entries missing fieldId/op. */
export function parseConditions(raw: string | null): RuleCondition[] {
  if (!raw) return [];
  let arr: any;
  try { arr = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  return arr.filter((c) => c && typeof c.op === "string" && (typeof c.fieldId === "number" || (c.source === "billing" && typeof c.attr === "string"))) as RuleCondition[];
}

function unitMs(unit: "hours" | "days"): number {
  return unit === "hours" ? 3_600_000 : 86_400_000;
}

/** Safe-parse + shape-guard a trigger_config JSON string for a time trigger. Malformed → null. */
export function parseTimeTriggerConfig(raw: string | null): TimeTriggerConfig | null {
  if (!raw) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== "object") return null;
  if (!["stage_entered", "card_created", "field_date"].includes(o.anchor)) return null;
  if (!Number.isFinite(o.offsetN) || o.offsetN < 0) return null;
  if (o.offsetUnit !== "hours" && o.offsetUnit !== "days") return null;
  if (o.direction !== "after" && o.direction !== "before") return null;
  if (o.repeat !== "once" && o.repeat !== "every") return null;
  if (o.anchor === "field_date" && typeof o.fieldId !== "number") return null;
  if (o.repeat === "every" && !(Number.isFinite(o.repeatEveryN) && o.repeatEveryN > 0)) return null;
  return {
    anchor: o.anchor,
    fieldId: typeof o.fieldId === "number" ? o.fieldId : undefined,
    offsetN: o.offsetN, offsetUnit: o.offsetUnit, direction: o.direction,
    repeat: o.repeat,
    repeatEveryN: typeof o.repeatEveryN === "number" ? o.repeatEveryN : undefined,
  };
}

type Lk = {
  fields: Map<number, { label: string; type: string }>;
  stages: Map<number, string>;
  users: Map<number, string>;
  pipes: Map<number, string>;
  tgtStages: Map<number, Map<number, string>>;
  tgtFields: Map<number, Map<number, { label: string; type: string }>>;
  mapsByAction: Map<number, { id: number; sourceFieldId: number; targetFieldId: number }[]>;
};

/** Shape raw rule actions into the GET response view with resolved labels. Pure. */
export function shapeRuleActions(
  actions: { id: number; position: number; actionType: string; actionConfig: string | null; targetPipelineId: number | null; targetStageId: number | null; titleTemplate: string | null; copyAssignee: number }[],
  lk: Lk,
): any[] {
  return actions.map((a) => {
    const base: any = { ...a, actionConfig: null as any };
    if (a.actionType === "set_field") {
      const cfg = parseActionConfig("set_field", a.actionConfig) as { fieldId: number; value: string } | null;
      if (cfg) {
        base.actionConfig = cfg;
        base.setFieldLabel = lk.fields.get(cfg.fieldId)?.label ?? `Field #${cfg.fieldId} (dihapus)`;
        base.setFieldType = lk.fields.get(cfg.fieldId)?.type ?? null;
      }
    } else if (a.actionType === "move_stage") {
      const cfg = parseActionConfig("move_stage", a.actionConfig) as { stageId: number } | null;
      if (cfg) { base.actionConfig = cfg; base.moveStageName = lk.stages.get(cfg.stageId) ?? `Stage #${cfg.stageId} (dihapus)`; }
    } else if (a.actionType === "assign") {
      const cfg = parseActionConfig("assign", a.actionConfig) as { assigneeId: number | null } | null;
      if (cfg) { base.actionConfig = cfg; base.assigneeName = cfg.assigneeId == null ? undefined : (lk.users.get(cfg.assigneeId) ?? `User #${cfg.assigneeId} (dihapus)`); }
    } else if (a.actionType === "create_card") {
      base.targetPipelineName = a.targetPipelineId != null ? (lk.pipes.get(a.targetPipelineId) ?? `Pipeline #${a.targetPipelineId} (dihapus)`) : undefined;
      base.targetStageName = (a.targetPipelineId != null && a.targetStageId != null)
        ? (lk.tgtStages.get(a.targetPipelineId)?.get(a.targetStageId) ?? `Stage #${a.targetStageId} (dihapus)`) : undefined;
      const tgt = (a.targetPipelineId != null && lk.tgtFields.get(a.targetPipelineId)) || new Map<number, { label: string; type: string }>();
      base.fieldMaps = shapeRuleFieldMaps(lk.mapsByAction.get(a.id) ?? [], lk.fields, tgt);
    } else if (a.actionType === "notify") {
      const cfg = parseActionConfig("notify", a.actionConfig) as NotifyConfig | null;
      if (cfg) {
        base.actionConfig = cfg;
        const parts: string[] = [];
        if (cfg.channels.includes("bell")) parts.push(`bell→${cfg.bellTarget ?? "?"}`);
        if (cfg.channels.includes("webhook")) parts.push("webhook");
        base.notifyLabel = parts.join(", ");
      }
    }
    if (a.actionType !== "create_card") base.fieldMaps = [];
    return base;
  });
}

/** Parse stored conditions into AND-groups. Accepts a legacy flat array (→ one group)
 *  or { groups: [...] }. Drops malformed entries + empty groups. Malformed → []. */
export function parseConditionGroups(raw: string | null): RuleCondition[][] {
  if (!raw) return [];
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const rawGroups: any[] = Array.isArray(parsed) ? [parsed]
    : (parsed && Array.isArray(parsed.groups)) ? parsed.groups : [];
  const groups: RuleCondition[][] = [];
  for (const g of rawGroups) {
    if (!Array.isArray(g)) continue;
    const conds = g.filter((c) => c && typeof c.op === "string" && (typeof c.fieldId === "number" || ((c.source === "billing" || c.source === "lead") && typeof c.attr === "string"))) as RuleCondition[];
    if (conds.length) groups.push(conds);
  }
  return groups;
}

/** ANY-of-groups: true if no groups; else some group passes (all its conditions, AND). */
export function evaluateConditionGroups(
  groups: RuleCondition[][],
  values: Map<number, string>,
  snapshot?: CollectionSnapshot | null,
): boolean {
  if (groups.length === 0) return true;
  return groups.some((g) => evaluateConditions(g, values, snapshot));
}

/** True if any condition group references a billing attr - gate the snapshot lookup. */
export function conditionsUseBilling(groups: RuleCondition[][]): boolean {
  return groups.some((g) => g.some((c) => c.source === "billing"));
}

/** Decide whether a time-triggered rule is due to fire now. Never throws → false on any malformed input. */
export function isTimeRuleDue(
  cfg: TimeTriggerConfig,
  card: { createdAt: string; stageEnteredAt: string | null },
  values: Map<number, string>,
  now: Date,
  lastFiredAt: string | null,
): boolean {
  // 1. anchor timestamp
  let anchorMs: number;
  if (cfg.anchor === "stage_entered") anchorMs = Date.parse(card.stageEnteredAt ?? card.createdAt);
  else if (cfg.anchor === "card_created") anchorMs = Date.parse(card.createdAt);
  else {
    if (cfg.fieldId == null) return false;
    const raw = (values.get(cfg.fieldId) ?? "").trim();
    if (!raw) return false;
    anchorMs = Date.parse(raw);
  }
  if (Number.isNaN(anchorMs)) return false;

  // 2. threshold = anchor ± offset
  const delta = cfg.offsetN * unitMs(cfg.offsetUnit);
  const thresholdMs = cfg.direction === "before" ? anchorMs - delta : anchorMs + delta;
  const nowMs = now.getTime();
  if (nowMs < thresholdMs) return false;

  // 3. repeat / dedup
  if (cfg.repeat === "once") return lastFiredAt == null;
  if (lastFiredAt == null) return true;
  const lastMs = Date.parse(lastFiredAt);
  if (Number.isNaN(lastMs)) return true;
  const everyN = cfg.repeatEveryN && cfg.repeatEveryN > 0 ? cfg.repeatEveryN : 1;
  return nowMs - lastMs >= everyN * unitMs(cfg.offsetUnit);
}
