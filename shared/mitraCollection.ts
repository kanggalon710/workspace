/** Collection Mitra: logika murni pelacakan tagihan bulanan JABNET → mitra (partner ISP).
 *  Berbeda dari collection retail (pelanggan): subjeknya adalah baris `mitras`,
 *  kartu dibuat per periode bulanan ("YYYY-MM"), dan stage-nya FIXED (bukan
 *  per-tenant configurable seperti `collection_stages`) - keputusan sadar YAGNI.
 *  Dipisah dari storage supaya bisa di-unit-test tanpa DB (pola collectionSop.ts). */

export type MitraCollectionStageRole = "entry" | "none" | "paid" | "writeoff";

export type MitraCollectionStageMeta = {
  key: string;
  label: string;
  role: MitraCollectionStageRole;
};

/** Stage ladder fixed. `paid` (Lunas) & `writeoff` (Menunggak) menutup kartu. */
export const MITRA_COLLECTION_STAGES = [
  { key: "belum_bayar", label: "Belum Bayar", role: "entry" },
  { key: "dihubungi", label: "Dihubungi", role: "none" },
  { key: "janji_bayar", label: "Janji Bayar", role: "none" },
  { key: "lunas", label: "Lunas", role: "paid" },
  { key: "menunggak", label: "Menunggak", role: "writeoff" },
] as const satisfies readonly MitraCollectionStageMeta[];

export type MitraCollectionStageKey = (typeof MITRA_COLLECTION_STAGES)[number]["key"];

const STAGE_BY_KEY = new Map<string, MitraCollectionStageMeta>(
  MITRA_COLLECTION_STAGES.map((s) => [s.key, s]),
);

export function isMitraCollectionStage(key: string): key is MitraCollectionStageKey {
  return STAGE_BY_KEY.has(key);
}

export function getMitraCollectionStage(key: string): MitraCollectionStageMeta | undefined {
  return STAGE_BY_KEY.get(key);
}

/** Apakah pindah ke stage ini menutup kartu (set closedAt): lunas & menunggak. */
export function mitraStageCloses(key: string): boolean {
  const role = STAGE_BY_KEY.get(key)?.role;
  return role === "paid" || role === "writeoff";
}

// ==== Helper periode bulanan ("YYYY-MM", waktu lokal server) ====

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidPeriod(s: string): boolean {
  return PERIOD_RE.test(s);
}

export function currentPeriod(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** "2026-01" → "2025-12". Asumsi input sudah valid (cek isValidPeriod di boundary). */
export function prevPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // bulan JS 0-based; -1 utk index, -1 lagi utk mundur
  return currentPeriod(d);
}

const MONTH_LABELS_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "2026-10" → "Oktober 2026". Input tidak valid dikembalikan apa adanya (aman utk UI). */
export function formatPeriodLabel(period: string): string {
  if (!isValidPeriod(period)) return period;
  const [y, m] = period.split("-").map(Number);
  return `${MONTH_LABELS_ID[m - 1]} ${y}`;
}

/** Daftar `count` periode terakhir, terbaru dulu, mulai bulan berjalan (utk dropdown). */
export function listRecentPeriods(count: number, now: Date = new Date()): string[] {
  const out: string[] = [];
  let p = currentPeriod(now);
  for (let i = 0; i < count; i++) {
    out.push(p);
    p = prevPeriod(p);
  }
  return out;
}
