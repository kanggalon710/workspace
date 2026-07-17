/** Pure phone helpers for tel:/wa.me links. No React, no DB. Mirrors server normalizePhone (08->62). */

/** Indonesian-aware international digits for wa.me. Returns "" if there are no usable digits. */
export function toWhatsappNumber(raw: string): string {
  if (!raw) return "";
  let p = String(raw).trim().replace(/[\s\-()+]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  else if (/^8\d+/.test(p)) p = "62" + p;
  return /^\d+$/.test(p) ? p : "";
}

/** tel: href — keeps a leading + and digits, strips spacing/dashes/parens. "" if no dialable chars. */
export function telHref(raw: string): string {
  const cleaned = String(raw ?? "").replace(/[\s\-()]/g, "");
  return /[+\d]/.test(cleaned) ? `tel:${cleaned}` : "";
}

/** wa.me link with a prefilled greeting. "" if the number can't be normalized. */
export function whatsappHref(raw: string, text = "Halo"): string {
  const n = toWhatsappNumber(raw);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : "";
}
