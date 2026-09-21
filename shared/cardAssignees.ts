/** Pure helpers for card assignees (primary + secondary). No I/O, unit-testable. */

/** Distinct assignee ids, primary first then secondary, deduped, null primary dropped. */
export function allAssigneeIds(primaryId: number | null | undefined, secondaryIds: number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  if (primaryId != null) { out.push(primaryId); seen.add(primaryId); }
  for (const id of secondaryIds) { if (!seen.has(id)) { seen.add(id); out.push(id); } }
  return out;
}

/** Board assignee filter (OR/ANY): empty filterIds → all match; else match if any filterId equals primary or is present in secondaryIds. */
export function matchesAssigneeFilter(
  primaryId: number | null | undefined, secondaryIds: number[], filterIds: number[],
): boolean {
  if (filterIds.length === 0) return true;
  const set = new Set(filterIds);
  return (primaryId != null && set.has(primaryId)) || secondaryIds.some((id) => set.has(id));
}
