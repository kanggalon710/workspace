/** Pure helpers for cross-pipeline card lineage - no I/O, unit-testable. */

export type CardRelationType = "mirror" | "duplicate" | "linked" | "child";

export const CARD_RELATION_TYPES: { type: CardRelationType; label: string }[] = [
  { type: "mirror",    label: "Mirror" },
  { type: "duplicate", label: "Duplikat" },
  { type: "linked",    label: "Tertaut" },
  { type: "child",     label: "Turunan" },
];

const VALID = new Set<string>(CARD_RELATION_TYPES.map((t) => t.type));

export function isValidRelationType(v: unknown): v is CardRelationType {
  return typeof v === "string" && VALID.has(v);
}

export function relationTypeLabel(v: string | null | undefined): string {
  return CARD_RELATION_TYPES.find((t) => t.type === v)?.label ?? "";
}

/** Master for a new card: inherit the origin's master, else (root) the card's own id. */
export function resolveMasterCardId(originMasterId: number | null | undefined, ownId: number): number {
  return originMasterId && originMasterId > 0 ? originMasterId : ownId;
}
