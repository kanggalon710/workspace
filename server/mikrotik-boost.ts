/**
 * MikroTik Boost Integration (v4.2.3)
 * ──────────────────────────────────
 * Auto-apply / auto-revert PPP profile saat customer redeem Speed-on-Demand boost.
 *
 * Flow:
 *  1. Customer redeem boost di portal → redeemPoints()
 *  2. applyBoost() dipanggil otomatis:
 *     a. Iterate routers aktif → cari PPP secret by pppoeUsername
 *     b. Ambil current profile (= original)
 *     c. Resolve boost profile name via pattern setting / mapping
 *     d. Validate boost profile exists di MikroTik
 *     e. Update secret → set new profile
 *     f. Disconnect active session → force re-connect dengan profile baru
 *     g. Return { originalProfile, boostedProfile, routerId, secretId }
 *  3. Saat duration habis, expire worker panggil revertBoost():
 *     a. Update secret → kembalikan ke originalProfile
 *     b. Disconnect session lagi
 *
 * Settings:
 *  - mikrotik_boost_auto_activate ("true"|"false") — default true
 *  - mikrotik_boost_profile_pattern — default "{base}-boost-{multiplier}x"
 *    Pattern variables:
 *      {base} = current profile name (e.g. "MOON-30M")
 *      {multiplier} = numeric multiplier (2 or 3)
 *  - mikrotik_boost_profile_map (JSON, optional override) — explicit mapping
 *    Format: { "MOON": { "2": "MOON-BOOST-2X", "3": "MOON-BOOST-3X" } }
 *
 * Fallback:
 *  - Kalau MikroTik fail (router offline, profile not found) → status pending,
 *    admin bisa verify manual lewat WinBox + tombol Verify.
 */

import { storage } from "./storage.js";
import {
  getPppSecrets,
  updatePppSecret,
  getPppActive,
  disconnectPppSession,
  getPppProfiles,
} from "./mikrotik.js";
import type { MikrotikRouter } from "../shared/schema.js";

export interface BoostApplyResult {
  success: boolean;
  routerId?: number;
  routerName?: string;
  secretId?: string;
  originalProfile?: string;
  boostedProfile?: string;
  sessionDisconnected?: boolean;
  error?: string;
  reason?: string;
}

export interface BoostRevertResult {
  success: boolean;
  reverted?: boolean;
  sessionDisconnected?: boolean;
  error?: string;
}

/** Default pattern untuk boost profile naming */
const DEFAULT_PATTERN = "{base}-boost-{multiplier}x";

/** Get boost auto-activate flag (default true) */
export async function isBoostAutoActivateEnabled(): Promise<boolean> {
  const v = await storage.getSetting("mikrotik_boost_auto_activate");
  if (v === "false") return false;
  return true; // default ON
}

/**
 * Resolve boost profile name dari current profile + multiplier.
 * Cek explicit map dulu, fallback ke pattern.
 */
async function resolveBoostProfileName(currentProfile: string, multiplier: number): Promise<string> {
  // Try explicit map
  const mapRaw = await storage.getSetting("mikrotik_boost_profile_map");
  if (mapRaw) {
    try {
      const map = JSON.parse(mapRaw);
      // Map can be keyed by full profile name OR by base prefix
      // Try full match first
      if (map[currentProfile]?.[String(multiplier)]) return map[currentProfile][String(multiplier)];
      // Fallback to prefix match (first segment)
      const prefix = currentProfile.split(/[-_]/)[0];
      if (map[prefix]?.[String(multiplier)]) return map[prefix][String(multiplier)];
    } catch { /* fall through to pattern */ }
  }
  // Pattern-based fallback
  const pattern = (await storage.getSetting("mikrotik_boost_profile_pattern")) || DEFAULT_PATTERN;
  return pattern
    .replace(/\{base\}/g, currentProfile)
    .replace(/\{multiplier\}/g, String(multiplier));
}

/**
 * Find router yang punya PPP secret dengan username tertentu.
 * Iterasi semua router aktif, return router pertama yang match.
 */
async function findRouterForSecret(pppoeUsername: string): Promise<{
  router: MikrotikRouter;
  secret: any;
} | null> {
  const routers = await storage.getMikrotikRouters();
  const activeRouters = routers.filter(r => r.isActive === 1);
  for (const router of activeRouters) {
    try {
      const creds = {
        host: router.host, port: router.port ?? undefined,
        username: router.username, password: router.password,
        useSsl: router.useSsl === 1,
      } as any;
      const secrets: any[] = await getPppSecrets(creds);
      const secret = secrets.find((s: any) =>
        String(s.name).toLowerCase() === pppoeUsername.toLowerCase()
      );
      if (secret) return { router, secret };
    } catch (e: any) {
      console.warn(`[Boost] router ${router.name} unreachable: ${e.message}`);
    }
  }
  return null;
}

/** Get MikroTik credentials helper */
function credsFor(router: MikrotikRouter): any {
  return {
    host: router.host, port: router.port ?? undefined,
    username: router.username, password: router.password,
    useSsl: router.useSsl === 1,
  };
}

/**
 * Apply boost: ubah PPP profile customer ke boosted profile.
 * Return detail yang akan disimpan di redemption row.
 */
export async function applyBoost(
  customerId: number,
  multiplier: number,
): Promise<BoostApplyResult> {
  try {
    const customer = await storage.getCustomer(customerId);
    if (!customer) return { success: false, error: "Customer tidak ditemukan" };
    if (!customer.pppoeUsername) return { success: false, reason: "no_pppoe_username", error: "Customer tidak punya PPPoE username" };

    const found = await findRouterForSecret(customer.pppoeUsername);
    if (!found) return { success: false, reason: "secret_not_found", error: `PPP secret untuk ${customer.pppoeUsername} tidak ditemukan di router manapun` };

    const { router, secret } = found;
    const creds = credsFor(router);
    const currentProfile = String(secret.profile ?? "default");
    const boostProfile = await resolveBoostProfileName(currentProfile, multiplier);

    // Validate boost profile exists di MikroTik
    let allProfiles: any[] = [];
    try {
      allProfiles = await getPppProfiles(creds);
    } catch (e: any) {
      return { success: false, reason: "profile_query_failed", error: `Gagal query profile di router: ${e.message}` };
    }
    const boostProfileExists = allProfiles.some((p: any) => String(p.name) === boostProfile);
    if (!boostProfileExists) {
      return {
        success: false,
        reason: "boost_profile_not_found",
        error: `Profile "${boostProfile}" tidak ada di router ${router.name}. Buat dulu profile-nya di MikroTik dengan rate-limit ${multiplier}× speed normal.`,
        originalProfile: currentProfile,
        boostedProfile: boostProfile,
      };
    }

    // Update secret → ganti profile
    try {
      await updatePppSecret(creds, secret[".id"] ?? secret.id, { profile: boostProfile });
    } catch (e: any) {
      return { success: false, reason: "update_failed", error: `Gagal update PPP secret: ${e.message}`, originalProfile: currentProfile, boostedProfile: boostProfile };
    }

    // Force disconnect active session supaya re-connect dengan profile baru
    let sessionDisconnected = false;
    try {
      const active: any[] = await getPppActive(creds);
      const session = active.find((s: any) => String(s.name).toLowerCase() === customer.pppoeUsername!.toLowerCase());
      if (session) {
        await disconnectPppSession(creds, session[".id"] ?? session.id);
        sessionDisconnected = true;
      }
    } catch (e: any) {
      console.warn(`[Boost] disconnect session error: ${e.message}`);
      // Tidak fail — secret sudah ke-update, customer akan dapat profile baru saat re-connect natural
    }

    return {
      success: true,
      routerId: router.id,
      routerName: router.name,
      secretId: String(secret[".id"] ?? secret.id),
      originalProfile: currentProfile,
      boostedProfile: boostProfile,
      sessionDisconnected,
    };
  } catch (e: any) {
    console.error("[Boost] applyBoost error:", e);
    return { success: false, reason: "internal", error: e.message };
  }
}

/**
 * Revert boost: kembalikan PPP profile customer ke originalProfile.
 * Pakai data dari redemption row.
 */
export async function revertBoost(
  customerId: number,
  originalProfile: string,
  preferredRouterId?: number,
): Promise<BoostRevertResult> {
  try {
    const customer = await storage.getCustomer(customerId);
    if (!customer?.pppoeUsername) {
      return { success: false, error: "Customer tidak punya PPPoE username" };
    }

    // Try preferred router first
    let target: { router: MikrotikRouter; secret: any } | null = null;
    if (preferredRouterId) {
      const router = await storage.getMikrotikRouter(preferredRouterId);
      if (router && router.isActive === 1) {
        try {
          const secrets: any[] = await getPppSecrets(credsFor(router));
          const secret = secrets.find((s: any) =>
            String(s.name).toLowerCase() === customer.pppoeUsername!.toLowerCase()
          );
          if (secret) target = { router, secret };
        } catch { /* fall through to broad search */ }
      }
    }
    if (!target) {
      target = await findRouterForSecret(customer.pppoeUsername);
    }
    if (!target) {
      return { success: false, error: "Router/secret tidak ditemukan saat revert" };
    }

    const { router, secret } = target;
    const creds = credsFor(router);

    try {
      await updatePppSecret(creds, secret[".id"] ?? secret.id, { profile: originalProfile });
    } catch (e: any) {
      return { success: false, error: `Gagal revert profile: ${e.message}` };
    }

    let sessionDisconnected = false;
    try {
      const active: any[] = await getPppActive(creds);
      const session = active.find((s: any) => String(s.name).toLowerCase() === customer.pppoeUsername!.toLowerCase());
      if (session) {
        await disconnectPppSession(creds, session[".id"] ?? session.id);
        sessionDisconnected = true;
      }
    } catch (e: any) {
      console.warn(`[Boost] revert disconnect error: ${e.message}`);
    }

    return { success: true, reverted: true, sessionDisconnected };
  } catch (e: any) {
    console.error("[Boost] revertBoost error:", e);
    return { success: false, error: e.message };
  }
}
