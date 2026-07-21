/** Pure helpers for the pipelines engine - no DB, fully unit-testable. */

/** Given an ordered list of ids, assign contiguous 0-based positions. */
export function reorderPositions(orderedIds: number[]): Array<{ id: number; position: number }> {
  return orderedIds.map((id, index) => ({ id, position: index }));
}

/**
 * Where to insert a card in a destination stage.
 * @param destCount how many cards currently in the destination stage (excluding the moved card)
 * @param toPosition requested index, or undefined to append
 */
export function computeInsertPosition(destCount: number, toPosition: number | undefined): number {
  if (toPosition === undefined || Number.isNaN(toPosition)) return destCount;
  return Math.max(0, Math.min(destCount, Math.floor(toPosition)));
}

/** A stage may only be deleted when it holds no cards. */
export function canDeleteStage(cardCount: number): boolean {
  return cardCount === 0;
}
