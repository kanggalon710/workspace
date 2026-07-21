/**
 * Phase B multi-tenant - AsyncLocalStorage context propagation.
 *
 * Routes wrap requests with `tenantContext.run({ mitraId, userId, isSuperAdmin }, next)`.
 * Storage methods call `getMitraId()` to scope queries - no need to thread `mitraId`
 * through 170+ method signatures.
 *
 * Workers / cross-tenant jobs use `withMitra(id, fn)` wrapper.
 *
 * Throwing in getMitraId() acts as a fail-safe: any storage code path that forgets
 * to set context will crash loudly rather than silently leak data across tenants.
 */
import { AsyncLocalStorage } from "async_hooks";

export interface TenantCtx {
  mitraId: number | null;     // null = no active tenant (super-admin global view)
  userId: number;             // 0 for worker/system context
  isSuperAdmin: boolean;      // bypass tenant filtering in storage helpers
}

export const tenantContext = new AsyncLocalStorage<TenantCtx>();

/**
 * Get current active mitra id. Throws if no context or no active mitra.
 * Use this in storage methods scoped to a tenant.
 */
export function getMitraId(): number {
  const ctx = tenantContext.getStore();
  if (!ctx) {
    throw new Error("[tenant-context] Missing context - request not wrapped in tenantContext.run()");
  }
  if (ctx.mitraId == null) {
    throw new Error("[tenant-context] No active tenant - user has not selected a mitra");
  }
  return ctx.mitraId;
}

/**
 * Get current active mitra id, or null if no tenant context active.
 * Use this in storage methods that handle both scoped and cross-tenant queries.
 */
export function getMitraIdOrNull(): number | null {
  return tenantContext.getStore()?.mitraId ?? null;
}

/** Check if current request is by a super-admin (system-wide owner). */
export function isSuperAdmin(): boolean {
  return tenantContext.getStore()?.isSuperAdmin === true;
}

/** Get full tenant context (or undefined if not in scope). */
export function getTenantCtx(): TenantCtx | undefined {
  return tenantContext.getStore();
}

/**
 * Run a function within a specific mitra context (super-admin escape hatch).
 * Used by workers iterating over all mitras, and by cross-tenant admin operations.
 *
 * @example
 * for (const m of mitras) await withMitra(m.id, () => syncBillingForActiveMitra());
 */
export function withMitra<T>(mitraId: number, fn: () => Promise<T> | T): Promise<T> | T {
  return tenantContext.run({ mitraId, userId: 0, isSuperAdmin: true }, fn) as Promise<T> | T;
}

/**
 * Run a function with NO active mitra (global view). Throws if any tenant-scoped
 * storage method is called. Use for `/api/admin/*` cross-tenant queries.
 */
export function withSuperAdmin<T>(fn: () => Promise<T> | T): Promise<T> | T {
  return tenantContext.run({ mitraId: null, userId: 0, isSuperAdmin: true }, fn) as Promise<T> | T;
}
