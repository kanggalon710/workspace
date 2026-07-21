/**
 * Pure helpers for the JABNET-root billing admin panel + per-mitra manual sync.
 * No I/O - unit-tested in billing-admin-helpers.test.ts.
 */

export interface CooldownResult {
  canSync: boolean;
  remainingSec: number;
  nextAvailableAt: string | null;
}

/** Manual-sync cooldown: blocked until `windowMs` after the last sync timestamp. */
export function computeManualSyncCooldown(
  lastIso: string | null | undefined,
  nowMs: number,
  windowMs: number,
): CooldownResult {
  if (!lastIso) return { canSync: true, remainingSec: 0, nextAvailableAt: null };
  const last = new Date(lastIso).getTime();
  if (!Number.isFinite(last)) return { canSync: true, remainingSec: 0, nextAvailableAt: null };
  const elapsed = nowMs - last;
  if (elapsed >= windowMs) return { canSync: true, remainingSec: 0, nextAvailableAt: null };
  return {
    canSync: false,
    remainingSec: Math.ceil((windowMs - elapsed) / 1000),
    nextAvailableAt: new Date(last + windowMs).toISOString(),
  };
}

/** Authorization for writing a single mitra_integrations key. */
export function canWriteMitraIntegration(args: {
  isJabnetRoot: boolean;
  activeMitraId: number;
  targetMitraId: number;
  key: string;
}): { allowed: boolean; reason?: string } {
  const { isJabnetRoot, activeMitraId, targetMitraId, key } = args;
  if (key.startsWith("billing_reseller") && !isJabnetRoot) {
    return { allowed: false, reason: "Konfigurasi billing hanya bisa diatur oleh JABNET" };
  }
  if (targetMitraId !== activeMitraId && !isJabnetRoot) {
    return { allowed: false, reason: "Tidak boleh mengubah integrasi mitra lain" };
  }
  return { allowed: true };
}

/** Map raw billing rows to a compact preview sample (capped). */
export function mapBillingSample(rows: any[], limit = 10): Array<{
  customer_id: any; nama: any; alamat: any; paket: any; status: any; is_isolir: any;
}> {
  return (rows ?? []).slice(0, limit).map((c) => ({
    customer_id: c.customer_id,
    nama: c.nama_lengkap ?? c.nama_panggilan,
    alamat: c.alamat_pelanggan,
    paket: c.paket_layanan,
    status: c.status_pelanggan,
    is_isolir: c.is_isolir,
  }));
}
