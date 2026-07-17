/** Single source of truth for pipeline custom field-type metadata + pure decision helpers.
 *  No React, no DB — imported by client (picker, board) and server (validation, singleton guard). */
import type { PipelineFieldType, PipelineField } from "./schema.js";

export interface FieldTypeMeta {
  type: PipelineFieldType;
  label: string;        // Indonesian label shown in UI
  description: string;  // one-line helper text in the type picker
  group: "basic" | "choice" | "people" | "special";
  hasOptions: boolean;  // dropdown/multiselect need an options[] list
  singleton: boolean;   // max 1 field of this type per pipeline (#7)
  searchable: boolean;  // value participates in board search
  filterable: boolean;  // can be selected as a board filter
  sortable: boolean;    // can be selected as a board sort key
}

export const PIPELINE_FIELD_TYPE_REGISTRY: Record<PipelineFieldType, FieldTypeMeta> = {
  text:        { type: "text",        label: "Teks",           description: "Teks satu baris",            group: "basic",   hasOptions: false, singleton: false, searchable: true,  filterable: false, sortable: true  },
  textarea:    { type: "textarea",    label: "Teks Panjang",   description: "Teks beberapa baris",        group: "basic",   hasOptions: false, singleton: false, searchable: true,  filterable: false, sortable: false },
  number:      { type: "number",      label: "Angka",          description: "Nilai numerik",              group: "basic",   hasOptions: false, singleton: false, searchable: true,  filterable: false, sortable: true  },
  currency:    { type: "currency",    label: "Mata Uang (Rp)", description: "Nominal rupiah",             group: "basic",   hasOptions: false, singleton: false, searchable: true,  filterable: false, sortable: true  },
  date:        { type: "date",        label: "Tanggal",        description: "Tanggal kalender",           group: "basic",   hasOptions: false, singleton: false, searchable: false, filterable: false, sortable: true  },
  dropdown:    { type: "dropdown",    label: "Dropdown",       description: "Pilih satu dari daftar",     group: "choice",  hasOptions: true,  singleton: false, searchable: true,  filterable: true,  sortable: true  },
  multiselect: { type: "multiselect", label: "Multi-pilih",    description: "Pilih beberapa dari daftar", group: "choice",  hasOptions: true,  singleton: false, searchable: true,  filterable: true,  sortable: false },
  checkbox:    { type: "checkbox",    label: "Checkbox",       description: "Ya / Tidak",                 group: "choice",  hasOptions: false, singleton: false, searchable: false, filterable: true,  sortable: true  },
  user:        { type: "user",        label: "Assignee",       description: "Tugaskan ke pengguna",       group: "people",  hasOptions: false, singleton: false, searchable: true,  filterable: true,  sortable: false },
  phone:       { type: "phone",       label: "Telepon",        description: "Nomor telepon",              group: "special", hasOptions: false, singleton: false, searchable: true,  filterable: false, sortable: false },
  url:         { type: "url",         label: "URL",            description: "Tautan web",                 group: "special", hasOptions: false, singleton: false, searchable: true,  filterable: false, sortable: false },
  coordinate:  { type: "coordinate",  label: "Koordinat",      description: "Lokasi (lat/lng) + peta",    group: "special", hasOptions: false, singleton: true,  searchable: false, filterable: false, sortable: false },
};
// NOTE: date.filterable=false on purpose — the board's existing date-range control covers date filtering,
// so date is not offered again in the generic field filter. Slice D's Coordinate will be the first singleton:true.

export function getFieldTypeMeta(type: string): FieldTypeMeta | undefined {
  return (PIPELINE_FIELD_TYPE_REGISTRY as Record<string, FieldTypeMeta>)[type];
}

/** Parse a coordinate field value (`{"lat":n,"lng":n}`). Returns null if missing/garbage/out-of-range. */
export function parseCoordinate(value: string | null | undefined): { lat: number; lng: number } | null {
  if (!value) return null;
  try {
    const o = JSON.parse(value);
    if (!o || typeof o !== "object") return null;
    const lat = Number((o as any).lat);
    const lng = Number((o as any).lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

/** Parse a field's `config` JSON ({ multiple?: boolean }, etc.). Safe on null/garbage. */
export function parseFieldConfig(field: Pick<PipelineField, "config">): { multiple?: boolean } {
  if (!field.config) return {};
  try {
    const o = JSON.parse(field.config);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

/** True for an Assignee field configured as multi-user. */
export function isMultiUser(field: Pick<PipelineField, "type" | "config">): boolean {
  return field.type === "user" && parseFieldConfig(field).multiple === true;
}

/** PRD redundancy collapsed: allowMultiple is just the inverse of singleton. */
export function allowMultiple(type: PipelineFieldType): boolean {
  return !PIPELINE_FIELD_TYPE_REGISTRY[type].singleton;
}

/** False when `type` is unknown, or is singleton and a field of that type already exists. */
export function canAddType(existingFields: Pick<PipelineField, "type">[], type: string): boolean {
  const meta = getFieldTypeMeta(type);
  if (!meta) return false;
  if (!meta.singleton) return true;
  return !existingFields.some((field) => field.type === type);
}

export function searchableFieldIds(fields: PipelineField[]): number[] {
  return fields.filter((field) => getFieldTypeMeta(field.type)?.searchable).map((field) => field.id);
}

export function filterableFields(fields: PipelineField[]): PipelineField[] {
  return fields.filter((field) => getFieldTypeMeta(field.type)?.filterable);
}

export function sortableFields(fields: PipelineField[]): PipelineField[] {
  return fields.filter((field) => getFieldTypeMeta(field.type)?.sortable);
}

/** Does a card's stored values satisfy a single field filter? Empty filterValue = no constraint. */
export function cardMatchesFilter(
  values: Record<number, string> | undefined,
  field: PipelineField,
  filterValue: string,
): boolean {
  if (filterValue === "") return true;
  const raw = values?.[field.id] ?? "";
  if (raw === "") return false; // explicit: no stored value can't match a non-empty filter
  if (field.type === "multiselect" || isMultiUser(field)) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.map(String).includes(filterValue);
    } catch {
      return false;
    }
  }
  return raw === filterValue;
}

/** Type-aware comparator for sorting cards by a field value. Empty values always sort last. */
export function compareCardsByField(
  a: Record<number, string> | undefined,
  b: Record<number, string> | undefined,
  field: PipelineField,
  dir: "asc" | "desc",
): number {
  const av = a?.[field.id] ?? "";
  const bv = b?.[field.id] ?? "";
  if (av === "" && bv === "") return 0;
  if (av === "") return 1;
  if (bv === "") return -1;
  let cmp: number;
  if (field.type === "number" || field.type === "currency") {
    cmp = (Number(av) || 0) - (Number(bv) || 0); // NaN-safe for malformed numeric data
  } else if (field.type === "date") {
    cmp = (Date.parse(av) || 0) - (Date.parse(bv) || 0); // NaN-safe for malformed dates
  } else {
    cmp = av.localeCompare(bv, "id", { numeric: true });
  }
  return dir === "desc" ? -cmp : cmp;
}
