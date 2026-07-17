/** Pure helpers + catalog for the billing_sync pipeline trigger. No DB, no I/O. */

/** Customer fields the intake reads (camelCase, as stored in the local customers table). */
export interface IntakeCustomer {
  id: number;
  name?: string | null;
  customerId?: string | null;
  phone?: string | null;
  email?: string | null;
  package?: string | null;
  billingPrice?: number | null;
  billingStatus?: string | null;
  dueDate?: string | null;
  isolirDate?: string | null;
  address?: string | null;
  district?: string | null;
  village?: string | null;
  customerType?: string | null;
  status?: string | null;
  installDate?: string | null;
  pppoeUsername?: string | null;
  ontSerialNumber?: string | null;
  isIsolir?: number | null;
  lat?: number | null;
  lng?: number | null;
}

/** Filter dimensions (mirror billing API list_pelanggan params). */
export interface BillingFilter {
  customerType?: string | null;
  status?: string | null;
  isIsolir?: 0 | 1 | null;
  billingStatus?: string | null;
  /** Minimal hari overdue sebelum customer masuk pipeline.
   *  null/0/undefined = abaikan (langsung cocok). >0 = butuh tanggal referensi minimal N hari lewat. */
  minDaysOverdue?: number | null;
  /** Tanggal billing yang jadi basis hitung overdue. Default "dueDate". Lihat OVERDUE_DATE_ATTRS. */
  overdueFromAttr?: string | null;
}

/** Atribut tanggal billing yang boleh jadi basis "hari overdue" (harus ada di data customer
 *  saat keputusan buat-kartu — custom field kartu tidak bisa karena kartunya belum ada). */
export const OVERDUE_DATE_ATTRS: { value: string; label: string }[] = [
  { value: "dueDate", label: "Jatuh Tempo" },
  { value: "isolirDate", label: "Tgl Isolir" },
  { value: "installDate", label: "Tgl Instalasi" },
];

export const FILTER_KEYS = ["customerType", "status", "isIsolir", "billingStatus"] as const;

/** Selectable values for the billing_sync filter dropdowns. These are the values stored in the
 *  local (synced) `customers` table — note `status` is English ("active"/"suspended"), NOT the
 *  billing API's "aktif". Filtering compares case-insensitively against these stored values. */
export const BILLING_FILTER_OPTIONS: {
  customerType: { value: string; label: string }[];
  status: { value: string; label: string }[];
  billingStatus: { value: string; label: string }[];
} = {
  customerType: [
    { value: "rumahan", label: "Rumahan" },
    { value: "bisnis", label: "Bisnis" },
    { value: "vip", label: "VIP" },
  ],
  status: [
    { value: "active", label: "Aktif (active)" },
    { value: "suspended", label: "Isolir / Suspended" },
  ],
  billingStatus: [
    { value: "belum_lunas", label: "Belum Lunas" },
    { value: "lunas", label: "Lunas" },
  ],
};

/** Field types each attribute may map onto. */
const TEXTISH = ["text", "textarea", "dropdown"];
export interface BillingAttr { key: string; label: string; fieldTypes: string[] }

export const BILLING_ATTRS: BillingAttr[] = [
  { key: "name", label: "Nama", fieldTypes: TEXTISH },
  { key: "customer_id", label: "ID Pelanggan", fieldTypes: TEXTISH },
  { key: "phone", label: "Telepon", fieldTypes: ["phone", ...TEXTISH] },
  { key: "email", label: "Email", fieldTypes: TEXTISH },
  { key: "package", label: "Paket", fieldTypes: TEXTISH },
  { key: "billingPrice", label: "Harga Layanan", fieldTypes: ["number", "currency"] },
  { key: "billingStatus", label: "Status Billing", fieldTypes: TEXTISH },
  { key: "dueDate", label: "Jatuh Tempo", fieldTypes: ["date", ...TEXTISH] },
  { key: "isolirDate", label: "Tgl Isolir", fieldTypes: ["date", ...TEXTISH] },
  { key: "address", label: "Alamat", fieldTypes: TEXTISH },
  { key: "district", label: "Kecamatan", fieldTypes: TEXTISH },
  { key: "village", label: "Desa/Kelurahan", fieldTypes: TEXTISH },
  { key: "customerType", label: "Jenis Pelanggan", fieldTypes: TEXTISH },
  { key: "status", label: "Status Pelanggan", fieldTypes: TEXTISH },
  { key: "installDate", label: "Tgl Instalasi", fieldTypes: ["date", ...TEXTISH] },
  { key: "pppoeUsername", label: "Username PPPoE", fieldTypes: TEXTISH },
  { key: "ontSerialNumber", label: "Serial ONT", fieldTypes: TEXTISH },
  { key: "coordinate", label: "Koordinat", fieldTypes: ["coordinate"] },
];

/** Attribute key -> property accessor on IntakeCustomer (handles customer_id alias). */
function attrRaw(c: IntakeCustomer, attr: string): string | number | null | undefined {
  if (attr === "customer_id") return c.customerId;
  return (c as any)[attr];
}

export function attrCompatibleWithFieldType(attr: string, fieldType: string): boolean {
  const a = BILLING_ATTRS.find((x) => x.key === attr);
  return !!a && a.fieldTypes.includes(fieldType);
}

/** The natural field type to CREATE for a billing attr (first of its compatible
 *  types, so date-ish attrs build a date field, billingPrice a number, etc.).
 *  Unknown attrs fall back to "text". */
export function preferredFieldTypeForAttr(attr: string): string {
  const a = BILLING_ATTRS.find((x) => x.key === attr);
  return a?.fieldTypes[0] ?? "text";
}

/** Normalize a billing date string to strict YYYY-MM-DD (what <input type="date">
 *  needs). Timezone-safe: pulls the date parts directly instead of round-tripping
 *  through toISOString() (which would shift "2026-06-09 00:00:00" back a day in
 *  UTC+7). Returns "" when unparseable. */
export function normalizeDateValue(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // YYYY-MM-DD[ T...] — already date-first
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

function ieq(a: string | null | undefined, b: string | null | undefined): boolean {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

/** Hari overdue dihitung dari dueDate relatif `nowMs` (floor). null kalau dueDate kosong/tak valid.
 *  Bisa negatif (belum jatuh tempo). Sejalan dgn billing-sync-worker (new Date(dueDate).getTime()). */
export function daysOverdue(dueDate: string | number | null | undefined, nowMs: number): number | null {
  const s = String(dueDate ?? "").trim();
  if (!s) return null;
  const dueMs = new Date(s).getTime();
  if (Number.isNaN(dueMs)) return null;
  return Math.floor((nowMs - dueMs) / 86400_000);
}

export function customerMatchesFilter(c: IntakeCustomer, filter: BillingFilter, nowMs?: number): boolean {
  if (filter.customerType != null && filter.customerType !== "" && !ieq(c.customerType, filter.customerType)) return false;
  if (filter.status != null && filter.status !== "" && !ieq(c.status, filter.status)) return false;
  if (filter.billingStatus != null && filter.billingStatus !== "" && !ieq(c.billingStatus, filter.billingStatus)) return false;
  if (filter.isIsolir === 0 || filter.isIsolir === 1) {
    if (Number(c.isIsolir ?? 0) !== filter.isIsolir) return false;
  }
  const minOd = Number(filter.minDaysOverdue ?? 0);
  if (Number.isFinite(minOd) && minOd > 0) {
    const refAttr = filter.overdueFromAttr || "dueDate";
    const od = daysOverdue(attrRaw(c, refAttr), nowMs ?? Date.now());
    if (od == null || od < minOd) return false;
  }
  return true;
}

export function customerToFieldValues(
  c: IntakeCustomer,
  fieldMap: { attr: string; targetFieldId: number }[],
  fieldTypeById?: Record<number, string>,
): { fieldId: number; value: string }[] {
  const out: { fieldId: number; value: string }[] = [];
  for (const { attr, targetFieldId } of fieldMap) {
    if (!targetFieldId) continue;
    if (attr === "coordinate") {
      const lat = c.lat, lng = c.lng;
      if (typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)) {
        out.push({ fieldId: targetFieldId, value: JSON.stringify({ lat, lng }) });
      }
      continue;
    }
    const raw = attrRaw(c, attr);
    if (raw === null || raw === undefined) continue;
    let value = String(raw).trim();
    // Normalize when the target is a date field so <input type="date"> can render it.
    if (fieldTypeById?.[targetFieldId] === "date") value = normalizeDateValue(value);
    if (value === "") continue;
    out.push({ fieldId: targetFieldId, value });
  }
  return out;
}

export function customerTitle(c: IntakeCustomer, titleSource: string): string {
  const raw = attrRaw(c, titleSource);
  const v = raw == null ? "" : String(raw).trim();
  if (v) return v;
  const name = (c.name ?? "").trim();
  if (name) return name;
  const cid = (c.customerId ?? "").trim();
  if (cid) return cid;
  return `Pelanggan #${c.id}`;
}
