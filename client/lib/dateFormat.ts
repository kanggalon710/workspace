/**
 * Date formatter utility — reject invalid dates gracefully.
 * Pattern: kalau tanggal invalid → return fallback "—" (tidak pernah render "Invalid Date").
 *
 * v4.2.18 (P1.1): hardened parser + central format functions.
 */

/** Cek apakah string ISO bisa di-parse jadi Date valid. Reject NaN, null, undefined, empty. */
export function isValidDate(iso: string | number | Date | null | undefined): boolean {
  if (iso === null || iso === undefined || iso === "") return false;
  const d = new Date(iso);
  return !isNaN(d.getTime()) && d.getTime() > 0;
}

/** Safe wrapper. Return null kalau ngga valid. */
export function safeDate(iso: string | number | Date | null | undefined): Date | null {
  if (!isValidDate(iso)) return null;
  return new Date(iso!);
}

/**
 * Format ke "dd MMM, HH:mm" (Indonesia locale). Return fallback "—" kalau invalid.
 * @example formatDate("2026-04-30T07:30:00Z") → "30 Apr, 14:30"
 * @example formatDate(null) → "—"
 * @example formatDate("invalid") → "—"
 */
export function formatDate(iso: string | number | Date | null | undefined, opts?: { fallback?: string }): string {
  const d = safeDate(iso);
  if (!d) return opts?.fallback ?? "—";
  return d.toLocaleString("id-ID", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

/** Date saja (tanpa jam). */
export function formatDateOnly(iso: string | number | Date | null | undefined, opts?: { fallback?: string }): string {
  const d = safeDate(iso);
  if (!d) return opts?.fallback ?? "—";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

/** Time saja. */
export function formatTimeOnly(iso: string | number | Date | null | undefined, opts?: { fallback?: string }): string {
  const d = safeDate(iso);
  if (!d) return opts?.fallback ?? "—";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/** Relative time ("5 menit lalu"). Fallback ke formatDateOnly kalau >7 hari atau invalid. */
export function formatRelative(iso: string | number | Date | null | undefined, opts?: { fallback?: string }): string {
  const d = safeDate(iso);
  if (!d) return opts?.fallback ?? "—";
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 0) return formatDate(iso); // future date
  if (s < 60) return "baru saja";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const dy = Math.floor(h / 24);
  if (dy < 7) return `${dy} hari lalu`;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

/** Duration in seconds → "1j 23m" or "45m" */
export function formatDuration(seconds: number | null | undefined, opts?: { fallback?: string }): string {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
    return opts?.fallback ?? "—";
  }
  if (seconds < 60) return `${Math.floor(seconds)}d`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const remainM = m % 60;
  return remainM > 0 ? `${h}j ${remainM}m` : `${h}j`;
}
