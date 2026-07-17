/**
 * Generic in-memory response cache for read-heavy GET endpoints.
 * TTL-based, invalidated by route prefix when matching mutations succeed.
 *
 * Usage:
 *   const cached = getCached<DashStats>("dashboard");
 *   if (cached) return res.json(cached);
 *   const fresh = await storage.getDashboardStats();
 *   setCached("dashboard", fresh, 60_000);
 *
 * Invalidation: invalidateCached("dashboard") clears that single key.
 * Middleware at the router level wires this to mutation-route matches.
 */

type Entry = { data: unknown; expiresAt: number };
const cache = new Map<string, Entry>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidateCached(key: string): void {
  cache.delete(key);
}

export function invalidateCachedPrefix(prefix: string): void {
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

export function invalidateAllCached(): void {
  cache.clear();
}
