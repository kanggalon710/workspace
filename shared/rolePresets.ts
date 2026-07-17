import type { PermissionLevel } from "./schema.js";

export type PresetScope = "global" | "tenant";

/** Minimal shape needed for default resolution (server rows + client both satisfy it). */
export interface RolePresetLike {
  id: number;
  scope: PresetScope;
  mitraId: number;
  isActive: number;
  isDefault: number;
  permissions: Record<string, PermissionLevel>;
}

/**
 * Resolve which preset should pre-fill a NEW role form for a tenant.
 * Order: this tenant's active default → global active default → null.
 */
export function resolveDefaultPreset<T extends RolePresetLike>(
  presets: T[],
  mitraId: number,
): T | null {
  const tenant = presets.find(
    (p) => p.scope === "tenant" && p.mitraId === mitraId && p.isDefault === 1 && p.isActive === 1,
  );
  if (tenant) return tenant;
  const global = presets.find((p) => p.scope === "global" && p.isDefault === 1 && p.isActive === 1);
  return global ?? null;
}
