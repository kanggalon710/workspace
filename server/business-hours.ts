/**
 * v4.2.18 (C.3): Business Hours Calendar
 *
 * Helper untuk compute SLA deadline yang respect jam kerja.
 * - Default: Senin-Sabtu 08:00-17:00 WIB (UTC+7), Minggu off, no holidays
 * - Storage: settings JSON di app_settings key "business_hours"
 * - SLA jam kerja: deadline = walk forward dari startMs sebanyak slaHours of business-time
 * - Out-of-hours pause: kalau ticket created di luar jam, deadline mulai dari business-day berikutnya
 */

export interface BusinessHoursConfig {
  enabled: boolean;
  // Per day-of-week (0=Sunday, 1=Monday, ..., 6=Saturday)
  // Tiap hari: array of working windows {start, end} dengan format "HH:MM" 24h WIB.
  // Empty array = closed day.
  schedule: Record<number, Array<{ start: string; end: string }>>;
  // Tanggal libur (YYYY-MM-DD), inclusive
  holidays: string[];
  // Timezone offset jam (default +7 untuk WIB)
  tzOffsetHours: number;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  enabled: false, // OFF by default — opt-in
  schedule: {
    0: [],                                                // Sunday off
    1: [{ start: "08:00", end: "17:00" }],
    2: [{ start: "08:00", end: "17:00" }],
    3: [{ start: "08:00", end: "17:00" }],
    4: [{ start: "08:00", end: "17:00" }],
    5: [{ start: "08:00", end: "17:00" }],
    6: [{ start: "08:00", end: "12:00" }],                // Saturday half-day
  },
  holidays: [],
  tzOffsetHours: 7,
};

// ── Internal helpers ──

function dateInTz(ms: number, tzOffsetHours: number): Date {
  return new Date(ms + tzOffsetHours * 3600_000);
}

function ymdInTz(ms: number, tzOffsetHours: number): string {
  const d = dateInTz(ms, tzOffsetHours);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function dowInTz(ms: number, tzOffsetHours: number): number {
  return dateInTz(ms, tzOffsetHours).getUTCDay();
}

function minutesOfDayInTz(ms: number, tzOffsetHours: number): number {
  const d = dateInTz(ms, tzOffsetHours);
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
}

function startOfDayMs(ms: number, tzOffsetHours: number): number {
  const d = dateInTz(ms, tzOffsetHours);
  d.setUTCHours(0, 0, 0, 0);
  // d is in tz frame; convert back
  return d.getTime() - tzOffsetHours * 3600_000;
}

/** Cek apakah `ms` jatuh di dalam business hours (sesuai schedule + holidays) */
export function isBusinessHour(ms: number, cfg: BusinessHoursConfig): boolean {
  if (!cfg.enabled) return true;
  const ymd = ymdInTz(ms, cfg.tzOffsetHours);
  if (cfg.holidays.includes(ymd)) return false;
  const dow = dowInTz(ms, cfg.tzOffsetHours);
  const windows = cfg.schedule[dow] ?? [];
  if (windows.length === 0) return false;
  const minOfDay = minutesOfDayInTz(ms, cfg.tzOffsetHours);
  for (const w of windows) {
    if (minOfDay >= hmToMinutes(w.start) && minOfDay < hmToMinutes(w.end)) {
      return true;
    }
  }
  return false;
}

/** Compute jumlah "out-of-hours" milliseconds antara fromMs dan toMs.
 *  Dipakai utk SLA pause-aware: total pause = manual pauses + out-of-hours.
 */
export function getOutOfHoursMs(fromMs: number, toMs: number, cfg: BusinessHoursConfig): number {
  if (!cfg.enabled) return 0;
  if (toMs <= fromMs) return 0;
  let oohMs = 0;
  // Iterate hour-by-hour (good enough for ~30-day windows).
  // Untuk efisiensi, iterate per 15-minute chunks dan akumulasi.
  const STEP = 15 * 60_000; // 15 menit
  let cursor = fromMs;
  while (cursor < toMs) {
    const next = Math.min(cursor + STEP, toMs);
    const mid = (cursor + next) / 2;
    if (!isBusinessHour(mid, cfg)) {
      oohMs += (next - cursor);
    }
    cursor = next;
  }
  return oohMs;
}

/** Compute deadline berdasarkan slaHours business-time, mulai dari startMs.
 *  Walk forward sampai akumulasi business-ms = slaHours * 3600_000.
 */
export function addBusinessHours(startMs: number, slaHours: number, cfg: BusinessHoursConfig): number {
  if (!cfg.enabled) return startMs + slaHours * 3600_000;
  let target = slaHours * 3600_000;
  let cursor = startMs;
  const STEP = 15 * 60_000;
  // Safety: max 90 days walk
  const limit = startMs + 90 * 24 * 3600_000;
  while (target > 0 && cursor < limit) {
    const mid = cursor + STEP / 2;
    if (isBusinessHour(mid, cfg)) {
      const consume = Math.min(STEP, target);
      target -= consume;
      cursor += consume;
    } else {
      cursor += STEP;
    }
  }
  return cursor;
}

/** Validation untuk config dari frontend */
export function validateBusinessHoursConfig(cfg: any): cfg is BusinessHoursConfig {
  if (!cfg || typeof cfg !== "object") return false;
  if (typeof cfg.enabled !== "boolean") return false;
  if (typeof cfg.schedule !== "object") return false;
  if (!Array.isArray(cfg.holidays)) return false;
  if (typeof cfg.tzOffsetHours !== "number") return false;
  for (const k of Object.keys(cfg.schedule)) {
    const dow = Number(k);
    if (Number.isNaN(dow) || dow < 0 || dow > 6) return false;
    const wins = cfg.schedule[k];
    if (!Array.isArray(wins)) return false;
    for (const w of wins) {
      if (!w?.start || !w?.end) return false;
      if (!/^\d{2}:\d{2}$/.test(w.start) || !/^\d{2}:\d{2}$/.test(w.end)) return false;
      if (hmToMinutes(w.start) >= hmToMinutes(w.end)) return false;
    }
  }
  return true;
}
