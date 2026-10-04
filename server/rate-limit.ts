// Generic in-memory rate limiter - dipindah dari routes.ts (2026-10-04) supaya bisa
// dipakai juga oleh customer-portal-routes (throttle OTP pre-lookup). Perilaku identik.
// Buckets are isolated per name so verify abuse doesn't lock save abuse.
import type { Request, Response } from "express";

interface RateBucketEntry { count: number; firstAttempt: number; lastAttempt: number; lockedUntil: number; }
const rateBuckets = new Map<string, Map<string, RateBucketEntry>>();

export interface RateLimiterOpts {
  bucket: string;
  maxAttempts: number;
  windowMs: number;
  lockoutMs: number;
  /** Custom key extractor - default `${userId}:${activeMitraId}:${ip}` */
  keyOf?: (req: Request) => string;
}

function clientIp(req: Request): string {
  // req.ip menghormati "trust proxy" (index.ts) - jangan baca X-Forwarded-For mentah.
  return req.ip || "unknown";
}

export function createRateLimiter(opts: RateLimiterOpts) {
  if (!rateBuckets.has(opts.bucket)) rateBuckets.set(opts.bucket, new Map());
  const bucket = rateBuckets.get(opts.bucket)!;

  return function rateLimiterMiddleware(req: Request, res: Response, next: () => void) {
    const key = opts.keyOf
      ? opts.keyOf(req)
      : `${req.authUser?.id ?? "anon"}:${req.authUser?.activeMitraId ?? "-"}:${clientIp(req)}`;
    const now = Date.now();
    const entry = bucket.get(key);
    if (entry) {
      if (entry.lockedUntil > now) {
        const retryAfterSec = Math.ceil((entry.lockedUntil - now) / 1000);
        res.setHeader("Retry-After", String(retryAfterSec));
        return res.status(429).json({
          success: false,
          error: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(retryAfterSec / 60)} menit.`,
          retryAfterSec,
          bucket: opts.bucket,
        });
      }
      if (now - entry.firstAttempt > opts.windowMs) {
        // Window expired - reset
        bucket.delete(key);
      }
    }
    next();
  };
}

export function recordRateAttempt(bucket: string, key: string, opts: { maxAttempts: number; windowMs: number; lockoutMs: number }) {
  const b = rateBuckets.get(bucket);
  if (!b) return;
  const now = Date.now();
  const entry = b.get(key);
  if (!entry || now - entry.firstAttempt > opts.windowMs) {
    b.set(key, { count: 1, firstAttempt: now, lastAttempt: now, lockedUntil: 0 });
    return;
  }
  entry.count++;
  entry.lastAttempt = now;
  if (entry.count >= opts.maxAttempts) {
    entry.lockedUntil = now + opts.lockoutMs;
  }
}

export function clearRateAttempts(bucket: string, key: string) {
  rateBuckets.get(bucket)?.delete(key);
}

export function rateLimitKey(req: Request): string {
  return `${req.authUser?.id ?? "anon"}:${req.authUser?.activeMitraId ?? "-"}:${clientIp(req)}`;
}
