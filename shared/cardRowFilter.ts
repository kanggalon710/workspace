/** Pure row-level (card) access filter. No DB, no I/O. Reuses the Phase-4 field-condition engine. */
import { evaluateFieldConditionGroups, type FieldRuleCondition, type FieldRuleCtx } from "./fieldRules.js";

/** Returns the active filter for a request, or null when no filtering applies (see-all). */
export function resolveCardFilter(args: {
  isAdmin: boolean; isCreator: boolean; restricted: boolean;
  grantFilter: FieldRuleCondition[][] | null;
}): FieldRuleCondition[][] | null {
  if (args.isAdmin || args.isCreator || !args.restricted) return null;
  if (!args.grantFilter || args.grantFilter.length === 0) return null;
  return args.grantFilter;
}

/** null filter → always true; else AND-within-group / OR-across-groups via the shared evaluator. */
export function cardPassesFilter(filter: FieldRuleCondition[][] | null, ctx: FieldRuleCtx): boolean {
  if (!filter || filter.length === 0) return true;
  return evaluateFieldConditionGroups(filter, ctx);
}
