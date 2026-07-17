/**
 * Pilih warna teks (putih / gelap) yang kontras di atas sebuah warna background hex.
 *
 * Pure + testable (lihat contrastColor.test.ts). Dipakai untuk header stage di
 * board /pipelines yang background-nya = warna stage: teks otomatis menyesuaikan
 * supaya tetap terbaca tanpa admin harus pikir kontras saat memilih warna.
 *
 * Metode: perceived brightness (YIQ). Ambang 128 = pilihan pragmatis standar yang
 * cocok dengan ekspektasi visual (biru/ungu/merah → teks putih; kuning/hijau → teks gelap).
 */

const DARK_TEXT = "#111827"; // slate-900-ish, samakan dengan warna judul gelap
const LIGHT_TEXT = "#ffffff";
const BRIGHTNESS_THRESHOLD = 128;

/** Parse "#rgb" / "#rrggbb" (hash opsional) → {r,g,b}. null kalau invalid. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Perceived brightness 0..255 (YIQ). null untuk hex invalid. */
export function perceivedBrightness(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
}

/** True kalau background dianggap gelap (butuh teks terang). Fallback: false (teks gelap). */
export function isDarkBg(hex: string): boolean {
  const b = perceivedBrightness(hex);
  if (b == null) return false;
  return b < BRIGHTNESS_THRESHOLD;
}

/** Warna teks readable (#fff atau #111827) di atas hex. Fallback ke teks gelap. */
export function readableTextColor(hex: string): string {
  return isDarkBg(hex) ? LIGHT_TEXT : DARK_TEXT;
}

/**
 * Tint semi-transparan untuk chip/badge yang ditaruh di atas band berwarna.
 * Adaptif: di bg gelap pakai putih transparan, di bg terang pakai hitam transparan.
 */
export function overlayTint(hex: string): string {
  return isDarkBg(hex) ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.10)";
}
