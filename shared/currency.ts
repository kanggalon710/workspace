/** Format mata uang Rupiah - satu sumber kebenaran (menggantikan 8 salinan `fmtRp`
 *  inline di client). Pure & unit-tested. */

/**
 * Format angka jadi Rupiah gaya Indonesia: `Rp 150.000` (pemisah ribuan `.`,
 * tanpa desimal, spasi biasa setelah `Rp`).
 *
 * @param n        nilai; `null`/`undefined` dianggap 0 kecuali `fallback` diberikan.
 * @param fallback jika diberikan, dikembalikan saat `n` falsy (0 / null / undefined) -
 *                 memuat perilaku call site lama yang menulis `n ? Rp : "-"`.
 *
 * @example formatRupiah(150000)        // "Rp 150.000"
 * @example formatRupiah(0)             // "Rp 0"
 * @example formatRupiah(0, "-")        // "-"
 * @example formatRupiah(null)          // "Rp 0"
 * @example formatRupiah(50000, "-")    // "Rp 50.000"
 */
export function formatRupiah(n?: number | null, fallback?: string): string {
  if (fallback !== undefined && !n) return fallback;
  if (n == null) return "Rp 0";
  return "Rp " + n.toLocaleString("id-ID");
}
