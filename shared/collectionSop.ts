/** SOP churn→reaktivasi: logika murni auto-delegasi antar-stage collection.
 *  Dipisah dari storage supaya bisa di-unit-test tanpa DB. Dipakai oleh
 *  `runCollectionSopAdvance()` (server) untuk memutuskan kartu mana yang
 *  otomatis di-delegasi ke divisi berikutnya saat SLA terlampaui. */

export type SopStageMeta = {
  key: string;
  label?: string | null;
  ownerDivision?: string | null;
  slaDays?: number | null;
  nextStageKey?: string | null;
  role?: string | null;
};

export type SopAdvanceDecision = {
  advance: boolean;
  fromStage: string;
  toStage: string | null;
  reason: string;
};

/**
 * Tentukan apakah 1 kartu collection harus di-delegasi ke stage berikutnya.
 *
 * @param currentStageKey stage kartu sekarang
 * @param daysInStage     lama (hari, boleh pecahan) kartu diam di stage sekarang
 * @param stagesByKey     map key→metadata stage (dari collection_stages)
 * @param terminalKeys    set stage terminal (role paid/writeoff) - tidak pernah di-advance
 */
export function decideSopAdvance(
  currentStageKey: string,
  daysInStage: number,
  stagesByKey: Map<string, SopStageMeta>,
  terminalKeys: Set<string>,
): SopAdvanceDecision {
  const base = { fromStage: currentStageKey, toStage: null as string | null };
  const stage = stagesByKey.get(currentStageKey);
  if (!stage) return { advance: false, ...base, reason: "stage_unknown" };
  if (terminalKeys.has(currentStageKey)) return { advance: false, ...base, reason: "terminal" };

  const sla = Number(stage.slaDays ?? 0);
  const next = stage.nextStageKey ?? null;
  if (!sla || sla <= 0) return { advance: false, ...base, reason: "no_sla" };
  if (!next) return { advance: false, ...base, reason: "no_next" };
  if (!stagesByKey.has(next)) return { advance: false, ...base, reason: "next_missing" };
  if (daysInStage < sla) return { advance: false, ...base, reason: "within_sla" };

  return { advance: true, fromStage: currentStageKey, toStage: next, reason: `sla_${sla}d_elapsed` };
}

/** Role stage terminal - selalu shared (tampil di semua view divisi). Dipakai untuk
 *  skip auto-advance/overdue + visibility board. CATATAN: "terminal" di sini = "outcome
 *  akhir yang tidak ikut alur otomatis"; TIDAK sama dengan "menutup kartu" (lihat
 *  CLOSING_ROLES). dismantel termasuk terminal (tak di-advance) tapi TIDAK menutup kartu. */
const TERMINAL_ROLES = new Set(["paid", "writeoff", "dismantel"]);

/** Role stage yang MENUTUP kartu (set closedAt) saat kartu dipindah ke sana: hanya paid
 *  (reaktivasi/lunas) & writeoff (loss/churn) - kasus selesai dari sisi isolir. dismantel
 *  TIDAK menutup: kartu tetap terbuka & terlihat di kolom Dismantel (invarian: pelanggan
 *  isolir = 1 kartu terbuka, jadi reconcile tidak mint kartu baru). */
export const CLOSING_ROLES = new Set(["paid", "writeoff"]);
export function roleClosesCard(role?: string | null): boolean {
  return CLOSING_ROLES.has(String(role ?? "").toLowerCase());
}

/** Parse `owner_division` (kini SET divisi, CSV) → daftar divisi spesifik.
 *  `null`/kosong/mengandung "all" → [] (penanda SHARED = tampil ke semua divisi).
 *  Contoh: "cs,marketing" → ["cs","marketing"]; "cs" → ["cs"]; "all"/"" / null → []. */
export function parseOwnerDivisions(ownerDivision?: string | null): string[] {
  const parts = String(ownerDivision ?? "")
    .split(",")
    .map((p) => p.toLowerCase().trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.includes("all")) return [];
  // Dedupe, urutan pertama-menang.
  return parts.filter((p, i) => parts.indexOf(p) === i);
}

/** Apakah stage ini "shared": set divisi kosong/"all", ATAU role terminal (paid/writeoff/dismantel).
 *  Stage shared tampil di board semua divisi (mis. Lunas, Tidak Bisa Dihubungi, Blacklist). */
export function isSharedStage(stage: SopStageMeta): boolean {
  if (parseOwnerDivisions(stage.ownerDivision).length === 0) return true;
  return TERMINAL_ROLES.has(String(stage.role ?? "").toLowerCase());
}

/** Stage-stage yang tampil untuk 1 divisi (untuk view pipeline ter-scope):
 *  stage yang set divisinya memuat divisi itu + semua stage shared. */
export function stageKeysForDivision(stages: SopStageMeta[], division: string): string[] {
  const div = division.toLowerCase().trim();
  return stages
    .filter((s) => parseOwnerDivisions(s.ownerDivision).includes(div) || isSharedStage(s))
    .map((s) => s.key);
}

export type OverdueReason = "promise" | "sla" | null;
export type OverdueDecision = { overdue: boolean; reason: OverdueReason };

/**
 * Apakah 1 kartu collection sudah lewat tenggat (overdue). Logika murni (bisa di-unit-test).
 * Dua pemicu:
 *  - "promise": tanggal Janji Bayar (promiseDate) sudah lewat (dihitung sampai akhir hari).
 *  - "sla": stage punya SLA (slaDays > 0) DAN kartu sudah diam >= slaDays hari di stage.
 * Stage tanpa SLA (0/null) tidak memicu "sla" - hanya "promise" yang berlaku.
 * `promise` menang kalau keduanya terpenuhi. Caller wajib skip kartu closed / stage terminal / overdue.
 */
export function computeOverdue(opts: {
  promiseDate?: string | null;
  slaDays?: number | null;
  daysInStage?: number | null;
  todayMs: number;
}): OverdueDecision {
  const { promiseDate, slaDays, daysInStage, todayMs } = opts;
  // promise: bandingkan sampai AKHIR hari tanggal janji supaya "hari-H" belum overdue.
  const pd = String(promiseDate ?? "").trim();
  if (pd) {
    const t = Date.parse(pd.length <= 10 ? `${pd}T23:59:59` : pd);
    if (!Number.isNaN(t) && t < todayMs) return { overdue: true, reason: "promise" };
  }
  const sla = Number(slaDays ?? 0);
  if (sla > 0 && daysInStage != null && Number(daysInStage) >= sla) {
    return { overdue: true, reason: "sla" };
  }
  return { overdue: false, reason: null };
}
