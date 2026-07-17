/** Pure resolver for per-(field × role) access. No DB, no I/O.
 *  Stored in pipeline_fields.config as { fieldPerms: { [roleId]: "hidden"|"view"|"edit" } }. */

export type FieldAccessLevel = "hidden" | "view" | "edit";
const LEVELS = new Set<FieldAccessLevel>(["hidden", "view", "edit"]);

export function parseFieldPerms(config: string | null): Record<number, FieldAccessLevel> {
  if (!config) return {};
  try {
    const c = JSON.parse(config);
    const fp = c?.fieldPerms;
    if (!fp || typeof fp !== "object") return {};
    const out: Record<number, FieldAccessLevel> = {};
    for (const [k, v] of Object.entries(fp)) {
      const id = Number(k);
      if (Number.isInteger(id) && LEVELS.has(v as FieldAccessLevel)) out[id] = v as FieldAccessLevel;
    }
    return out;
  } catch { return {}; }
}

/** Admin → edit; explicit per-role override if present; else inherit (baseEditable ? edit : view). */
export function resolveFieldAccess(
  field: { config: string | null },
  roleId: number | null,
  ctx: { isAdmin: boolean; baseEditable: boolean },
): FieldAccessLevel {
  if (ctx.isAdmin) return "edit";
  const perms = parseFieldPerms(field.config);
  if (roleId != null && perms[roleId]) return perms[roleId];
  return ctx.baseEditable ? "edit" : "view";
}

export function isFieldHiddenForRole(field: { config: string | null }, roleId: number | null, ctx: { isAdmin: boolean; baseEditable: boolean }): boolean {
  return resolveFieldAccess(field, roleId, ctx) === "hidden";
}
export function canEditField(field: { config: string | null }, roleId: number | null, ctx: { isAdmin: boolean; baseEditable: boolean }): boolean {
  return resolveFieldAccess(field, roleId, ctx) === "edit";
}
