/** Pure: derive a lead prefill from a pipeline card (title + custom field values). No I/O.
 *  Auto-detect by field type: first phone-type → phone; first coordinate-type → lat/lng. */
import { parseCoordinate } from "./pipelineFieldTypes.js";

export interface CardFieldMeta { id: number; type: string }
export interface LeadPrefill { name: string; phone?: string; lat?: number; lng?: number }

export function detectLeadPrefill(
  title: string,
  values: Record<number, string>,
  fields: CardFieldMeta[],
): LeadPrefill {
  const out: LeadPrefill = { name: String(title ?? "").trim() };

  const phoneField = fields.find((f) => f.type === "phone");
  if (phoneField) {
    const v = String(values[phoneField.id] ?? "").trim();
    if (v) out.phone = v;
  }

  const coordField = fields.find((f) => f.type === "coordinate");
  if (coordField) {
    const c = parseCoordinate(values[coordField.id]);
    if (c) { out.lat = c.lat; out.lng = c.lng; }
  }

  return out;
}
