/** Pure helper for the collections engine-mode toggle. No DB, no I/O. */
export type CollectionsEngineMode = "legacy" | "pipeline";

/** Anything other than the exact string "pipeline" → "legacy" (safe default). */
export function parseCollectionsMode(raw: string | null | undefined): CollectionsEngineMode {
  return raw === "pipeline" ? "pipeline" : "legacy";
}

export function legacyCollectionsActive(mode: CollectionsEngineMode): boolean {
  return mode === "legacy";
}
