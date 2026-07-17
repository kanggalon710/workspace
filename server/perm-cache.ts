/**
 * In-memory LRU permission cache for getUserEffectivePermissions().
 * TTL: 60s. Invalidated on user/role mutations.
 *
 * Why: Auth middleware calls getUserEffectivePermissions() on every
 * authenticated request — same result for same user during a session.
 */

import type { PermissionLevel } from "@shared/schema";

type EffectivePerms = {
  perms: Record<string, PermissionLevel>;
  canSeeAllData: boolean;
  roleName: string | null;
  isSystem: boolean;
  roleId?: number | null;
};

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 1000;

const cache = new Map<number, { value: EffectivePerms; expires: number }>();

export function getCachedPerms(userId: number): EffectivePerms | null {
  const hit = cache.get(userId);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    cache.delete(userId);
    return null;
  }
  return hit.value;
}

export function setCachedPerms(userId: number, value: EffectivePerms): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // LRU-ish: drop oldest insertion
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(userId, { value, expires: Date.now() + CACHE_TTL_MS });
}

export function invalidatePermCache(userId?: number): void {
  if (userId !== undefined) {
    cache.delete(userId);
  } else {
    cache.clear();
  }
}

export function permCacheStats(): { size: number; maxEntries: number; ttlMs: number } {
  return { size: cache.size, maxEntries: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS };
}

// ── Per-(userId, mitraId) cache ──────────────────────────────────────────────
// Same TTL as global cache for consistency. Key: `${userId}:${mitraId}`.

const PERM_CACHE_AT_MITRA_MAX_ENTRIES = 2000;

const mitraCache = new Map<string, { value: EffectivePerms; expires: number }>();

export function getCachedPermsAtMitra(key: string): EffectivePerms | null {
  const hit = mitraCache.get(key);
  if (!hit) return null;
  if (hit.expires <= Date.now()) {
    mitraCache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCachedPermsAtMitra(key: string, value: EffectivePerms): void {
  if (mitraCache.size >= PERM_CACHE_AT_MITRA_MAX_ENTRIES) {
    // LRU-ish: drop oldest insertion
    const firstKey = mitraCache.keys().next().value;
    if (firstKey !== undefined) mitraCache.delete(firstKey);
  }
  mitraCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

export function invalidatePermCacheAtMitra(userId?: number, mitraId?: number): void {
  if (userId == null) {
    mitraCache.clear();
    return;
  }
  if (mitraId == null) {
    // Invalidate all keys for this user across all mitras
    const prefix = `${userId}:`;
    for (const k of Array.from(mitraCache.keys())) {
      if (k.startsWith(prefix)) mitraCache.delete(k);
    }
    return;
  }
  mitraCache.delete(`${userId}:${mitraId}`);
}

export function permCacheAtMitraStats(): { size: number; maxEntries: number; ttlMs: number } {
  return { size: mitraCache.size, maxEntries: PERM_CACHE_AT_MITRA_MAX_ENTRIES, ttlMs: CACHE_TTL_MS };
}
