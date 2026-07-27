/** Pencarian kartu pipeline (client-side): cocokkan query ke gabungan field teks.
 *  Query digit-only juga dicocokkan ke no. HP digit-only, jadi "0812" ketemu "0812-3456".
 *  Dipakai board /collections + /leads (pencarian nama, pppoe, id_pelanggan, no. HP). */
export function matchesSearch(
  query: string,
  fields: Array<string | null | undefined>,
  phone?: string | null,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = fields.filter(Boolean).join(" ").toLowerCase();
  if (hay.includes(q)) return true;
  const qDigits = q.replace(/\D/g, "");
  if (qDigits && String(phone ?? "").replace(/\D/g, "").includes(qDigits)) return true;
  return false;
}
