/** Pure helpers + catalog untuk lead-trigger pipeline intake. No DB, no I/O.
 *  Paralel shared/pipelineBillingIntake.ts. */
import { normalizeDateValue } from "./pipelineBillingIntake.js";
import { canonicalLeadSource } from "./leadSources.js";
import type { NotifyConfig } from "./schema.js";

/** Field lead yang dibaca intake (camelCase, sesuai tabel leads). */
export interface IntakeLead {
  id: number;
  mitraId: number;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  category?: string | null;
  notes?: string | null;
  source?: string | null;
  lat?: number | null;
  lng?: number | null;
  distanceMeters?: number | null;
  district?: string | null;
  village?: string | null;
  stage?: string | null;
  priority?: string | null;
  assignedTo?: number | null;
  odpId?: number | null;
  campaign?: string | null;
  adSet?: string | null;
  adName?: string | null;
}

const TEXTISH = ["text", "textarea", "dropdown"];
export interface LeadAttr { key: string; label: string; fieldTypes: string[] }

export const LEAD_ATTRS: LeadAttr[] = [
  { key: "name", label: "Nama", fieldTypes: TEXTISH },
  { key: "phone", label: "Telepon", fieldTypes: ["phone", ...TEXTISH] },
  { key: "address", label: "Alamat", fieldTypes: TEXTISH },
  { key: "category", label: "Kategori", fieldTypes: TEXTISH },
  { key: "notes", label: "Catatan", fieldTypes: TEXTISH },
  { key: "source", label: "Sumber", fieldTypes: TEXTISH },
  { key: "distanceMeters", label: "Jarak ke ODP (m)", fieldTypes: ["number"] },
  { key: "district", label: "Kecamatan", fieldTypes: TEXTISH },
  { key: "village", label: "Desa/Kelurahan", fieldTypes: TEXTISH },
  { key: "stage", label: "Stage Lead", fieldTypes: TEXTISH },
  { key: "priority", label: "Prioritas Lead", fieldTypes: TEXTISH },
  { key: "odpId", label: "Nama ODP", fieldTypes: TEXTISH },
  { key: "campaign", label: "Campaign", fieldTypes: TEXTISH },
  { key: "adSet", label: "Ad Set", fieldTypes: TEXTISH },
  { key: "adName", label: "Ad Name", fieldTypes: TEXTISH },
  { key: "coordinate", label: "Koordinat", fieldTypes: ["coordinate"] },
];

export function attrCompatibleWithFieldType(attr: string, fieldType: string): boolean {
  const a = LEAD_ATTRS.find((x) => x.key === attr);
  return !!a && a.fieldTypes.includes(fieldType);
}

function attrRaw(l: IntakeLead, attr: string): string | number | null | undefined {
  if (attr === "source") return canonicalLeadSource(l.source);
  return (l as any)[attr];
}

/** odpNameById: map odpId→nama ODP (intake yang menyuplai; pure module tak query). */
export function leadToFieldValues(
  l: IntakeLead,
  fieldMap: { attr: string; targetFieldId: number }[],
  fieldTypeById?: Record<number, string>,
  odpNameById?: Record<number, string>,
): { fieldId: number; value: string }[] {
  const out: { fieldId: number; value: string }[] = [];
  for (const { attr, targetFieldId } of fieldMap) {
    if (!targetFieldId) continue;
    if (attr === "coordinate") {
      const { lat, lng } = l;
      if (typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)) {
        out.push({ fieldId: targetFieldId, value: JSON.stringify({ lat, lng }) });
      }
      continue;
    }
    if (attr === "odpId") {
      const id = l.odpId;
      const name = id != null ? odpNameById?.[id] : undefined;
      if (name) out.push({ fieldId: targetFieldId, value: name });
      continue;
    }
    const raw = attrRaw(l, attr);
    if (raw === null || raw === undefined) continue;
    let value = String(raw).trim();
    if (fieldTypeById?.[targetFieldId] === "date") value = normalizeDateValue(value);
    if (value === "") continue;
    out.push({ fieldId: targetFieldId, value });
  }
  return out;
}

export function leadTitle(l: IntakeLead, titleSource: string): string {
  const raw = attrRaw(l, titleSource);
  const v = raw == null ? "" : String(raw).trim();
  if (v) return v;
  const name = (l.name ?? "").trim();
  if (name) return name;
  return `Lead #${l.id}`;
}

export type DuplicateMode = "create" | "update" | "ignore" | "reopen";
export type DedupBy = "lead_id" | "phone";

export interface LeadTriggerConfig {
  sources: string[];
  entryStageId: number | null;
  titleSource: string;
  fieldMap: { attr: string; targetFieldId: number }[];
  onDuplicate: DuplicateMode;
  dedupBy: DedupBy;
  reopenStageId: number | null;
  notify?: NotifyConfig;
}

export function parseLeadTriggerConfig(raw: string | null): LeadTriggerConfig | null {
  if (!raw) return null;
  try {
    const c = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!c || typeof c !== "object") return null;
    return {
      sources: Array.isArray(c.sources) ? c.sources.map((s: any) => String(s)) : [],
      entryStageId: c.entryStageId != null ? Number(c.entryStageId) : null,
      titleSource: typeof c.titleSource === "string" && c.titleSource ? c.titleSource : "name",
      fieldMap: Array.isArray(c.fieldMap)
        ? c.fieldMap.filter((m: any) => m && m.attr && m.targetFieldId).map((m: any) => ({ attr: String(m.attr), targetFieldId: Number(m.targetFieldId) }))
        : [],
      onDuplicate: (["create", "update", "ignore", "reopen"].includes(c.onDuplicate) ? c.onDuplicate : "ignore") as DuplicateMode,
      dedupBy: (c.dedupBy === "phone" ? "phone" : "lead_id") as DedupBy,
      reopenStageId: c.reopenStageId != null ? Number(c.reopenStageId) : null,
      ...(c.notify && typeof c.notify === "object" && Array.isArray(c.notify.channels) ? { notify: c.notify as NotifyConfig } : {}),
    };
  } catch { return null; }
}

/** Apa yang harus dilakukan intake mengingat mode + apakah card existing ditemukan. */
export function resolveDuplicateAction(mode: DuplicateMode, hasExisting: boolean): "create" | "update" | "reopen" | "skip" {
  if (!hasExisting) return "create";
  if (mode === "create") return "create";
  if (mode === "ignore") return "skip";
  if (mode === "update") return "update";
  return "reopen";
}

/** Empty sources = match semua; selain itu samakan secara kanonik. */
export function leadRuleMatchesSource(sources: string[], leadSource: string | null | undefined): boolean {
  if (!sources.length) return true;
  const target = canonicalLeadSource(leadSource);
  return sources.some((s) => canonicalLeadSource(s) === target);
}
