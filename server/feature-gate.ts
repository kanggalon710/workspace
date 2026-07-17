import { FEATURE_PERMISSIONS } from "../shared/schema.js";

type Level = "none" | "read" | "write";

/**
 * Strip the permissions of any disabled feature for a mitra.
 * Pure — no I/O. JABNET (mitra 1) is the owner and is never gated.
 * A feature absent from `featuresJson` is treated as enabled; only explicit `false` disables.
 * Malformed/empty JSON leaves perms unchanged (fail-open to avoid lockout).
 */
export function gatePermissionsByFeatures(
  perms: Record<string, Level>,
  featuresJson: string | null | undefined,
  mitraId: number,
): Record<string, Level> {
  const out: Record<string, Level> = { ...perms };
  if (mitraId === 1) return out;
  if (!featuresJson) return out;
  let features: Record<string, unknown>;
  try { features = JSON.parse(featuresJson) ?? {}; } catch { return out; }
  for (const [feature, permKeys] of Object.entries(FEATURE_PERMISSIONS)) {
    if (features[feature] === false) {
      for (const pk of permKeys) out[pk] = "none";
    }
  }
  return out;
}
