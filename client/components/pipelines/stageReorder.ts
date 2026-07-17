/**
 * Move `fromId` so it sits at the current index of `toId` (insert-before semantics).
 * Returns a NEW array. No-op (returns an equal new array) if fromId === toId, or if
 * either id is absent.
 */
export function reorderByDrag(ids: number[], fromId: number, toId: number): number[] {
  if (fromId === toId) return [...ids];
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from === -1 || to === -1) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  const insertAt = next.indexOf(toId);
  next.splice(insertAt, 0, fromId);
  return next;
}

/**
 * Shift `id` by `dir` (-1 left / +1 right). Clamped: a no-op at the boundary or when
 * `id` is absent. Returns a NEW array.
 */
export function moveByOffset(ids: number[], id: number, dir: -1 | 1): number[] {
  const i = ids.indexOf(id);
  if (i === -1) return [...ids];
  const j = i + dir;
  if (j < 0 || j >= ids.length) return [...ids];
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
