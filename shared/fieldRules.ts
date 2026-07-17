/** Pure evaluator + helpers for per-field visibility / required rules. No DB, no I/O.
 *  Conditions read other custom field values and the card's current stage. */

export type FieldRuleOp = "eq" | "neq" | "contains" | "gt" | "lt" | "empty" | "not_empty";
export interface FieldRuleCondition { source?: "field" | "stage"; fieldId?: number; op: FieldRuleOp; value?: string }
export interface FieldRuleCtx { values: Map<number, string>; stageId: number }

function operandFor(c: FieldRuleCondition, ctx: FieldRuleCtx): string {
  if (c.source === "stage") return String(ctx.stageId);
  return (c.fieldId != null ? ctx.values.get(c.fieldId) : "") ?? "";
}

function evalCondition(c: FieldRuleCondition, ctx: FieldRuleCtx): boolean {
  const stored = operandFor(c, ctx).trim();
  const target = (c.value ?? "").trim();
  switch (c.op) {
    case "eq": return stored.toLowerCase() === target.toLowerCase();
    case "neq": return stored.toLowerCase() !== target.toLowerCase();
    case "contains": return stored.toLowerCase().includes(target.toLowerCase());
    case "gt": { const a = Number(stored), b = Number(target); return !Number.isNaN(a) && !Number.isNaN(b) && a > b; }
    case "lt": { const a = Number(stored), b = Number(target); return !Number.isNaN(a) && !Number.isNaN(b) && a < b; }
    case "empty": return stored === "";
    case "not_empty": return stored !== "";
    default: return false;
  }
}

/** AND within a group, OR across groups. Empty groups → true. */
export function evaluateFieldConditionGroups(groups: FieldRuleCondition[][], ctx: FieldRuleCtx): boolean {
  if (!groups || groups.length === 0) return true;
  return groups.some((g) => g.length > 0 && g.every((c) => evalCondition(c, ctx)));
}

function sanitizeGroups(raw: any): FieldRuleCondition[][] {
  if (!Array.isArray(raw)) return [];
  const out: FieldRuleCondition[][] = [];
  for (const g of raw) {
    if (!Array.isArray(g)) continue;
    const grp = g.filter((c: any) => c && typeof c.op === "string") as FieldRuleCondition[];
    if (grp.length) out.push(grp);
  }
  return out;
}

export function parseFieldRules(config: string | null): { visibleWhen: FieldRuleCondition[][]; requiredWhen: FieldRuleCondition[][] } {
  if (!config) return { visibleWhen: [], requiredWhen: [] };
  try {
    const c = JSON.parse(config);
    return { visibleWhen: sanitizeGroups(c?.visibleWhen), requiredWhen: sanitizeGroups(c?.requiredWhen) };
  } catch { return { visibleWhen: [], requiredWhen: [] }; }
}

export function isFieldVisible(field: { config: string | null }, ctx: FieldRuleCtx): boolean {
  const { visibleWhen } = parseFieldRules(field.config);
  if (visibleWhen.length === 0) return true;
  return evaluateFieldConditionGroups(visibleWhen, ctx);
}

/** True when the field should be treated as required right now. Hidden fields are never required. */
export function isFieldRequired(field: { config: string | null; required: number }, ctx: FieldRuleCtx): boolean {
  if (!isFieldVisible(field, ctx)) return false;
  const { requiredWhen } = parseFieldRules(field.config);
  if (requiredWhen.length > 0) return evaluateFieldConditionGroups(requiredWhen, ctx);
  return field.required === 1;
}

/** True only for fields that OPT IN via a requiredWhen rule (used for save-blocking enforcement;
 *  static-required fields stay soft/non-blocking). */
export function hasRequiredWhen(field: { config: string | null }): boolean {
  return parseFieldRules(field.config).requiredWhen.length > 0;
}
