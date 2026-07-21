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
 * @param terminalKeys    set stage terminal (role paid/writeoff) — tidak pernah di-advance
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

/** Stage-stage yang dimiliki 1 divisi tertentu (untuk view pipeline ter-scope). */
export function stageKeysForDivision(stages: SopStageMeta[], division: string): string[] {
  return stages.filter((s) => (s.ownerDivision ?? "").toLowerCase() === division.toLowerCase()).map((s) => s.key);
}
