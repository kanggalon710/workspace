/** Pure helpers for bulk card actions - no I/O, unit-testable. */
export type BulkOp = "assign" | "move" | "set_field" | "add_tag" | "remove_tag" | "delete";
export const BULK_OPS: BulkOp[] = ["assign", "move", "set_field", "add_tag", "remove_tag", "delete"];
export const BULK_MAX_CARDS = 200;

export type BulkValidation = { ok: true } | { ok: false; error: string };

const isPosInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0;

export function validateBulkRequest(op: string, cardIds: unknown, payload: any): BulkValidation {
  if (!BULK_OPS.includes(op as BulkOp)) return { ok: false, error: "Aksi tidak dikenal" };
  if (!Array.isArray(cardIds) || cardIds.length === 0) return { ok: false, error: "Pilih minimal satu kartu" };
  if (cardIds.length > BULK_MAX_CARDS) return { ok: false, error: `Maks ${BULK_MAX_CARDS} kartu per aksi` };
  if (!cardIds.every(isPosInt)) return { ok: false, error: "ID kartu tidak valid" };
  switch (op) {
    case "assign":
      if (!payload || !("assigneeId" in payload)) return { ok: false, error: "assigneeId wajib" };
      if (payload.assigneeId !== null && !isPosInt(payload.assigneeId)) return { ok: false, error: "assigneeId tidak valid" };
      return { ok: true };
    case "move":
      return isPosInt(payload?.stageId) ? { ok: true } : { ok: false, error: "stageId wajib" };
    case "set_field":
      if (!isPosInt(payload?.fieldId)) return { ok: false, error: "fieldId wajib" };
      if (typeof payload?.value !== "string") return { ok: false, error: "value wajib (string)" };
      return { ok: true };
    case "add_tag":
    case "remove_tag": {
      const t = typeof payload?.tag === "string" ? payload.tag.trim() : "";
      if (!t || t.length > 64) return { ok: false, error: "tag wajib (≤64 char)" };
      return { ok: true };
    }
    case "delete":
      return { ok: true };
    default:
      return { ok: false, error: "Aksi tidak dikenal" };
  }
}

/** Parse pipeline_cards.tags (JSON array text) into a string[]; [] on null/garbage. */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.map(String) : []; } catch { return []; }
}

export function applyTagChange(existing: string[], op: "add_tag" | "remove_tag", tag: string): string[] {
  const t = tag.trim();
  if (op === "add_tag") return existing.includes(t) ? existing : [...existing, t];
  return existing.filter((x) => x !== t);
}
