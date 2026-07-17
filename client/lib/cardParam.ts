/** Read a positive-integer `card` id from a URL query string (e.g. "?card=42"). Null if absent/invalid. */
export function parseCardParam(search: string): number | null {
  try {
    const raw = new URLSearchParams(search).get("card");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
