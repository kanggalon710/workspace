// Pure board-card meta helpers — no React. Mirrors /leads recency thresholds.
export const STALLED_DAYS = 14;
export type UpdateTone = "fresh" | "recent" | "warn" | "old";
export type DateRange = "all" | "7d" | "30d" | { from: string; to: string };

const DAY = 86400000;
function daysBetween(iso: string, now: Date): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / DAY);
}

export function cardAgeLabel(createdAt: string | null, now: Date): string {
  if (!createdAt) return "—";
  const d = daysBetween(createdAt, now);
  if (d == null) return "—";
  return d <= 0 ? "Hari ini" : `${d}h lalu`;
}

export function lastUpdateTone(updatedAt: string | null, createdAt: string | null, now: Date): UpdateTone {
  const ref = updatedAt || createdAt;
  const d = ref ? daysBetween(ref, now) : null;
  if (d == null) return "old";
  if (d <= 1) return "fresh";
  if (d <= 7) return "recent";
  if (d <= 14) return "warn";
  return "old";
}

export function isStalled(updatedAt: string | null, createdAt: string | null, now: Date): boolean {
  const ref = updatedAt || createdAt;
  if (!ref) return false;
  const d = daysBetween(ref, now);
  return d != null && d > STALLED_DAYS;
}

/** Timestamp ms dari ISO; 0 (paling lama) untuk kosong/invalid → sort tetap stabil. */
function dateValue(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Bandingkan dua kartu berdasarkan tanggal (Dibuat / Update terakhir) untuk sort per-stage.
 *
 * Arah SENGAJA dibalik dari makna leksikal: `"asc"` = TERBARU dulu (default board —
 * aktivitas terbaru di atas), `"desc"` = terlama dulu. Ini supaya state default
 * `sortDir="asc"` menghasilkan "Baru → Lama" tanpa mengubah default sort field kustom
 * yang tetap A–Z. `updated` jatuh balik ke `createdAt` bila `updatedAt` kosong.
 */
export function compareByDate(
  a: { createdAt: string | null; updatedAt?: string | null },
  b: { createdAt: string | null; updatedAt?: string | null },
  field: "created" | "updated",
  dir: "asc" | "desc",
): number {
  const ta = dateValue(field === "created" ? a.createdAt : (a.updatedAt ?? a.createdAt));
  const tb = dateValue(field === "created" ? b.createdAt : (b.updatedAt ?? b.createdAt));
  return dir === "asc" ? tb - ta : ta - tb;
}

export function inDateRange(dateStr: string | null, range: DateRange, now: Date): boolean {
  if (range === "all") return true;
  if (!dateStr) return false;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return false;
  if (range === "7d") return t >= now.getTime() - 7 * DAY;
  if (range === "30d") return t >= now.getTime() - 30 * DAY;
  const fromOk = !range.from || t >= Date.parse(range.from + "T00:00:00Z");
  const toOk = !range.to || t <= Date.parse(range.to + "T23:59:59Z");
  return fromOk && toOk;
}
