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

/** Role stage terminal - selalu shared (tampil di semua view divisi). */
const TERMINAL_ROLES = new Set(["paid", "writeoff", "dismantel"]);

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
