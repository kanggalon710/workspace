/** Pure edge-proximity auto-scroll math for HTML5 drag-and-drop.
 *  pos = pointer coordinate (clientX/clientY), [start,end] = container bounds on that axis.
 *  Returns a scroll delta: negative near the start edge, positive near the end edge, else 0.
 *  Containers smaller than two edge zones never scroll (both zones would overlap). */
export function edgeScrollDelta(
  pos: number,
  start: number,
  end: number,
  edge = 80,
  step = 24,
): number {
  if (end - start <= edge * 2) return 0;
  if (pos < start + edge) return -step;
  if (pos > end - edge) return step;
  return 0;
}
