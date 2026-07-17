/** Pure helpers for per-pipeline collection parameters — no I/O. SP3 reuses stageForOverdue. */

export type CollectionEntryMode = "create" | "move" | "create_if_not_exists" | "reopen";
export type WriteoffAction = "move_stage" | "custom_rule";

export const ENTRY_MODES: { mode: CollectionEntryMode; label: string; hint: string }[] = [
  { mode: "create", label: "Buat Kartu", hint: "Selalu buat kartu collection baru saat overdue lewat ambang." },
  { mode: "move", label: "Pindahkan Kartu", hint: "Pindahkan kartu yang sudah ada ke stage collection." },
  { mode: "create_if_not_exists", label: "Buat Jika Belum Ada", hint: "Buat kartu hanya jika belum ada kartu aktif (tanpa duplikat)." },
  { mode: "reopen", label: "Aktifkan Kembali", hint: "Aktifkan kembali kartu collection lama yang sudah selesai." },
];

export const WRITEOFF_ACTIONS: { action: WriteoffAction; label: string }[] = [
  { action: "move_stage", label: "Pindah ke stage Write-Off" },
  { action: "custom_rule", label: "Jalankan rule otomasi" },
];

const ENTRY_MODE_SET = new Set<string>(ENTRY_MODES.map((m) => m.mode));
const WRITEOFF_ACTION_SET = new Set<string>(WRITEOFF_ACTIONS.map((a) => a.action));

export interface StageMapRow {
  minOverdueDays: number;
  maxOverdueDays: number | null;
  stageId: number;
  position: number;
}

/** Validate the range→stage map. null = ok, else an Indonesian error string. */
export function validateStageMap(rows: StageMapRow[]): string | null {
  for (const r of rows) {
    if (!Number.isInteger(r.minOverdueDays) || r.minOverdueDays < 0) return "Hari overdue minimum harus bilangan bulat ≥ 0";
    if (r.maxOverdueDays != null && (!Number.isInteger(r.maxOverdueDays) || r.maxOverdueDays < r.minOverdueDays)) return "Hari overdue maksimum harus ≥ minimum";
    if (!Number.isInteger(r.stageId) || r.stageId <= 0) return "Setiap baris mapping harus memilih stage";
  }
  const sorted = [...rows].sort((a, b) => a.minOverdueDays - b.minOverdueDays);
  for (let i = 0; i < sorted.length - 1; i++) {
    const curMax = sorted[i].maxOverdueDays == null ? Infinity : (sorted[i].maxOverdueDays as number);
    if (curMax >= sorted[i + 1].minOverdueDays) return "Rentang hari overdue tidak boleh tumpang tindih";
  }
  return null;
}

/** SP3 resolver: stageId whose [min,max] (max null = open-ended) contains daysOverdue; most-specific
 *  (highest matching min). null if none match. */
export function stageForOverdue(rows: StageMapRow[], daysOverdue: number): number | null {
  let best: StageMapRow | null = null;
  for (const r of rows) {
    const max = r.maxOverdueDays == null ? Infinity : r.maxOverdueDays;
    if (daysOverdue >= r.minOverdueDays && daysOverdue <= max) {
      if (!best || r.minOverdueDays > best.minOverdueDays) best = r;
    }
  }
  return best ? best.stageId : null;
}

export interface CollectionConfigInput {
  enabled: boolean;
  entryThresholdDays: number;
  entryMode: string;
  entryStageId: number | null;
  paidStageId: number | null;
  writeoffThresholdDays: number | null;
  writeoffAction: string;
  writeoffStageId: number | null;
  writeoffRuleId: number | null;
}

/** Enum + numeric sanity (stage-id existence is checked at the route, which has DB access). */
export function validateCollectionConfig(cfg: CollectionConfigInput): string | null {
  if (!Number.isInteger(cfg.entryThresholdDays) || cfg.entryThresholdDays < 0) return "Ambang masuk collection harus bilangan bulat ≥ 0";
  if (!ENTRY_MODE_SET.has(cfg.entryMode)) return "Mode entry tidak valid";
  if (!WRITEOFF_ACTION_SET.has(cfg.writeoffAction)) return "Aksi write-off tidak valid";
  if (cfg.writeoffThresholdDays != null) {
    if (!Number.isInteger(cfg.writeoffThresholdDays) || cfg.writeoffThresholdDays < 0) return "Ambang write-off harus bilangan bulat ≥ 0";
    if (cfg.writeoffThresholdDays < cfg.entryThresholdDays) return "Ambang write-off harus >= ambang masuk collection";
    if (cfg.writeoffAction === "move_stage" && cfg.writeoffStageId == null) return "Pilih stage tujuan write-off";
    if (cfg.writeoffAction === "custom_rule" && cfg.writeoffRuleId == null) return "Pilih rule untuk write-off";
  }
  return null;
}
