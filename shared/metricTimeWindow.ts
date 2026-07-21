/** Pure time-window helpers for pipeline metrics - no I/O. nowMs is injected for testability. */

export type TimePreset =
  | "all" | "today" | "yesterday" | "7d" | "30d"
  | "this_month" | "last_month" | "this_year" | "custom";

export const TIME_PRESETS: { preset: TimePreset; label: string }[] = [
  { preset: "all", label: "Semua waktu" },
  { preset: "today", label: "Hari ini" },
  { preset: "yesterday", label: "Kemarin" },
  { preset: "7d", label: "7 Hari" },
  { preset: "30d", label: "30 Hari" },
  { preset: "this_month", label: "Bulan Ini" },
  { preset: "last_month", label: "Bulan Lalu" },
  { preset: "this_year", label: "Tahun Ini" },
  { preset: "custom", label: "Kustom" },
];

export interface TimeWindow { fromMs: number; toMs: number; }

const DAY = 86_400_000;

/** Local-day start (00:00:00.000) for the day containing `ms`. */
function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}
/** Local-day end (23:59:59.999) for the day containing `ms`. */
function endOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/**
 * Resolve a preset to a window, or null = all-time (no filtering).
 * Relative presets (7d/30d) are TZ-independent offsets ending at nowMs.
 * Day/month/year presets snap to the runtime's LOCAL calendar boundaries.
 * `custom` needs both from & to (YYYY-MM-DD); a missing bound → null (defensive).
 */
export function resolveTimeWindow(
  preset: string,
  nowMs: number,
  customFrom?: string | null,
  customTo?: string | null,
): TimeWindow | null {
  const now = new Date(nowMs);
  switch (preset) {
    case "today":
      return { fromMs: startOfDay(nowMs), toMs: endOfDay(nowMs) };
    case "yesterday": {
      const y = nowMs - DAY;
      return { fromMs: startOfDay(y), toMs: endOfDay(y) };
    }
    case "7d":
      return { fromMs: nowMs - 7 * DAY, toMs: nowMs };
    case "30d":
      return { fromMs: nowMs - 30 * DAY, toMs: nowMs };
    case "this_month":
      return { fromMs: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime(), toMs: nowMs };
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
      const end = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime() - 1; // last ms of prev month
      return { fromMs: start, toMs: end };
    }
    case "this_year":
      return { fromMs: new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0).getTime(), toMs: nowMs };
    case "custom": {
      if (!customFrom || !customTo) return null;
      const f = Date.parse(customFrom);
      const t = Date.parse(customTo);
      if (!Number.isFinite(f) || !Number.isFinite(t)) return null;
      return { fromMs: startOfDay(f), toMs: endOfDay(t) };
    }
    default:
      return null; // "all", "", unknown → all-time
  }
}

/** Is an ISO/date string inside [fromMs, toMs] inclusive? Unparseable/empty → false. */
export function dateInWindow(dateStr: string | null | undefined, win: TimeWindow): boolean {
  if (!dateStr) return false;
  const ms = Date.parse(dateStr);
  if (!Number.isFinite(ms)) return false;
  return ms >= win.fromMs && ms <= win.toMs;
}
