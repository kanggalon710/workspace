/** Per-user "izin khusus" (special permission) - ADD-ONLY grants layered on top of
 *  the user's role. Effective permission = max(roleLevel, grantLevel) per key; a grant
 *  can only RAISE access, never lower it. Stored as JSON in users.permissions (repurposed
 *  from the deprecated per-user override). Pure logic - unit-tested, no DB. */
import { ALL_PERMISSION_KEYS, type PermissionLevel } from "./schema";

export type GrantLevel = "read" | "write" | "delete";
export type GrantMap = Record<string, GrantLevel>;

const RANK: Record<PermissionLevel, number> = { none: 0, read: 1, write: 2, delete: 3 };

const KEYSET = new Set<string>(ALL_PERMISSION_KEYS as readonly string[]);

/** Sanitize an arbitrary object into a valid add-only grant map:
 *  keep only known permission keys with level "read"/"write"/"delete" (drop "none"/unknown/invalid). */
export function sanitizeGrants(input: unknown): GrantMap {
  const out: GrantMap = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!KEYSET.has(k)) continue;
    if (v === "read" || v === "write" || v === "delete") out[k] = v;
  }
  return out;
}

/** Parse a stored grants JSON string into a valid grant map (never throws). */
export function parseGrants(raw: string | null | undefined): GrantMap {
  if (!raw) return {};
  try { return sanitizeGrants(JSON.parse(raw)); } catch { return {}; }
}

/** Merge add-only grants over role perms: effective = max(role, grant) per key. */
export function mergeAdditiveGrants(
  rolePerms: Record<string, PermissionLevel>,
  grants: GrantMap,
): Record<string, PermissionLevel> {
  const merged: Record<string, PermissionLevel> = { ...rolePerms };
  for (const [k, g] of Object.entries(grants)) {
    const cur = merged[k] ?? "none";
    if (RANK[g] > RANK[cur]) merged[k] = g;
  }
  return merged;
}
