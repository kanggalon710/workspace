/** Pure scoring Laporan Kinerja (FR-1002, PRD §14.3) - deterministik, AI hanya merangkum.
 *  Komponen bernilai null = tidak berlaku untuk user tsb (mis. tidak pernah jadi penerima
 *  check-in) → bobotnya diredistribusi proporsional ke komponen yang ada. */

export interface ScoreInputs {
  /** selesai tepat waktu ÷ selesai ber-tenggat (0..1), null bila tidak ada */
  onTimeRate: number | null;
  /** tugas selesai ÷ total tugas aktif miliknya (0..1) */
  completionRate: number | null;
  /** jawaban check-in ÷ instance yang ditujukan padanya (0..1) */
  checkinRate: number | null;
  /** output ops ternormalisasi thd tertinggi di scope (0..1) */
  opsNorm: number | null;
}

export interface ScoreWeights { onTime: number; completion: number; checkin: number; ops: number }

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = { onTime: 40, completion: 25, checkin: 15, ops: 20 };

/** Parse bobot dari appSettings JSON - invalid/parsial → default (kalibrasi tanpa deploy). */
export function parseScoreWeights(raw: string | null | undefined): ScoreWeights {
  if (!raw) return { ...DEFAULT_SCORE_WEIGHTS };
  try {
    const o = JSON.parse(raw);
    const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d);
    const w = {
      onTime: num(o?.onTime, DEFAULT_SCORE_WEIGHTS.onTime),
      completion: num(o?.completion, DEFAULT_SCORE_WEIGHTS.completion),
      checkin: num(o?.checkin, DEFAULT_SCORE_WEIGHTS.checkin),
      ops: num(o?.ops, DEFAULT_SCORE_WEIGHTS.ops),
    };
    return w.onTime + w.completion + w.checkin + w.ops > 0 ? w : { ...DEFAULT_SCORE_WEIGHTS };
  } catch {
    return { ...DEFAULT_SCORE_WEIGHTS };
  }
}

export type ScoreLabel = "Kurang" | "Cukup" | "Baik" | "Sangat Baik";

export function labelForScore(score: number): ScoreLabel {
  if (score >= 80) return "Sangat Baik";
  if (score >= 60) return "Baik";
  if (score >= 40) return "Cukup";
  return "Kurang";
}

export interface ScoreResult { score: number; stars: number; label: ScoreLabel }

/** Hitung skor 0..100. Semua komponen null → null (tidak bisa dinilai). */
export function computeScore(inputs: ScoreInputs, weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS): ScoreResult | null {
  const parts: Array<{ v: number; w: number }> = [];
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  if (inputs.onTimeRate != null) parts.push({ v: clamp01(inputs.onTimeRate), w: weights.onTime });
  if (inputs.completionRate != null) parts.push({ v: clamp01(inputs.completionRate), w: weights.completion });
  if (inputs.checkinRate != null) parts.push({ v: clamp01(inputs.checkinRate), w: weights.checkin });
  if (inputs.opsNorm != null) parts.push({ v: clamp01(inputs.opsNorm), w: weights.ops });
  const totalW = parts.reduce((s, p) => s + p.w, 0);
  if (totalW <= 0) return null;
  const score = Math.round(parts.reduce((s, p) => s + p.v * (p.w / totalW) * 100, 0));
  const stars = Math.max(1, Math.min(5, Math.ceil(score / 20)));
  return { score, stars, label: labelForScore(score) };
}
