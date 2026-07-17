/** Pure helpers for cross-pipeline linked-card actions — no I/O, unit-testable. */
import { isValidRelationType, type CardRelationType } from "./cardIdentity.js";

export interface SpawnLineageConfig { relationType: CardRelationType; reuseExisting: boolean }

/** Parse create_card's action_config for opt-in lineage. null = legacy (independent card). */
export function parseSpawnLineageConfig(raw: string | null | undefined): SpawnLineageConfig | null {
  if (!raw) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== "object" || !isValidRelationType(o.relationType)) return null;
  return { relationType: o.relationType, reuseExisting: o.reuseExisting === true };
}

/** master id for a spawned card: the source's master (or the source's own id if it had none). */
export function masterForSpawn(sourceMasterId: number | null | undefined, sourceId: number): number {
  return sourceMasterId && sourceMasterId > 0 ? sourceMasterId : sourceId;
}
