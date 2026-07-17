/** Pure catalog + predicate for card-event automation triggers. No DB, no I/O. */

export type EventTriggerType = "card_updated" | "assignee_changed" | "field_updated";

export interface EventTriggerDef { type: EventTriggerType; label: string }

export const EVENT_TRIGGER_TYPES: EventTriggerDef[] = [
  { type: "card_updated", label: "Saat kartu diperbarui" },
  { type: "assignee_changed", label: "Saat assignee berubah" },
  { type: "field_updated", label: "Saat field berubah" },
];

const VALID = new Set(EVENT_TRIGGER_TYPES.map((t) => t.type));

export function isEventTriggerType(t: string): t is EventTriggerType {
  return VALID.has(t as EventTriggerType);
}

/** Does a rule fire for this card event?
 *  - type mismatch → false
 *  - field_updated: no configured fieldId → any field; else only when changedFieldIds includes it
 *  - card_updated / assignee_changed → always (the route decides when to dispatch) */
export function eventRuleMatches(
  rule: { triggerType: string; triggerConfig: string | null },
  eventType: string,
  ctx?: { changedFieldIds?: number[] },
): boolean {
  if (rule.triggerType !== eventType) return false;
  if (eventType === "field_updated") {
    let fieldId: number | null = null;
    if (rule.triggerConfig) {
      try { const c = JSON.parse(rule.triggerConfig); if (c && c.fieldId != null) fieldId = Number(c.fieldId); } catch { /* ignore */ }
    }
    if (fieldId == null) return true;
    return (ctx?.changedFieldIds ?? []).includes(fieldId);
  }
  return true;
}
