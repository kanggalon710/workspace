/** Display label for a user's role: prefer the dynamic role name (roles.name via
 *  roleName from /auth/me|login), fall back to the legacy users.role text.
 *  Never invents a default — callers decide their own fallback. */
export function roleLabel(
  u: { roleName?: string | null; role?: string | null } | null | undefined,
): string {
  if (!u) return "";
  const dyn = u.roleName?.trim();
  if (dyn) return dyn;
  return u.role?.trim() ?? "";
}
