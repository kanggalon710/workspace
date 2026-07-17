/** Pure helpers for card assignees (primary + secondary). No I/O, unit-testable. */

/** Distinct assignee ids, primary first then secondary, deduped, null primary dropped. */
export function allAssigneeIds(primaryId: number | null | undefined, secondaryIds: number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  if (primaryId != null) { out.push(primaryId); seen.add(primaryId); }
  for (const id of secondaryIds) { if (!seen.has(id)) { seen.add(id); out.push(id); } }
  return out;
}

/** Board assignee filter: null filter → all match; else match if filter == primary or in secondary. */
export function matchesAssigneeFilter(
  primaryId: number | null | undefined, secondaryIds: number[], filterId: number | null,
): boolean {
  if (filterId == null) return true;
  return primaryId === filterId || secondaryIds.includes(filterId);
}
