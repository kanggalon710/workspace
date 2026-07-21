/**
 * v4.2.19: Broadcast Audience Filter Engine
 *
 * Convert filter JSON ke SQL WHERE clause untuk evaluate audience pelanggan.
 * Filter shape:
 * {
 *   combine: "all" | "any",   // AND | OR
 *   rules: [
 *     { field: "isIsolir", op: "eq", value: 0 },
 *     { field: "package", op: "in", value: ["10M", "20M"] },
 *     { field: "district", op: "in", value: ["Cilawu"] },
 *     { field: "dueDate", op: "lte_days", value: 3 },   // due in <=3 days
 *     { field: "phone", op: "not_empty" },
 *     { field: "installDate", op: "gte_days_ago", value: 30 },
 *     { field: "billingPrice", op: "gte", value: 200000 },
 *   ]
 * }
 *
 * Allowed fields (whitelist) → mapped ke kolom DB tables:
 */

export type AudienceOp =
  | "eq" | "ne" | "gt" | "gte" | "lt" | "lte"
  | "in" | "not_in"
  | "contains" | "starts_with"
  | "is_empty" | "not_empty"
  | "lte_days" | "gte_days" | "lte_days_ago" | "gte_days_ago";

export interface AudienceRule {
  field: string;
  op: AudienceOp;
  value?: any;
}

export interface AudienceFilter {
  combine: "all" | "any";
  rules: AudienceRule[];
}

// Whitelist field → kolom DB. Hanya field di sini yang boleh di-filter.
const FIELD_MAP: Record<string, { col: string; type: "string" | "number" | "date" }> = {
  // Identity
  name: { col: "name", type: "string" },
  phone: { col: "phone", type: "string" },
  email: { col: "email", type: "string" },
  customerId: { col: "customer_id", type: "string" },
  // Geo
  district: { col: "district", type: "string" },
  village: { col: "village", type: "string" },
  // Network
  odpId: { col: "odp_id", type: "number" },
  package: { col: "package", type: "string" },
  pppoeProfile: { col: "pppoe_profile", type: "string" },
  customerType: { col: "customer_type", type: "string" },
  // Status
  status: { col: "status", type: "string" },
  isIsolir: { col: "is_isolir", type: "number" },
  billingStatus: { col: "billing_status", type: "string" },
  // Billing
  billingPrice: { col: "billing_price", type: "number" },
  // Dates
  installDate: { col: "install_date", type: "date" },
  dueDate: { col: "due_date", type: "date" },
  lastPaymentDate: { col: "last_payment_date", type: "date" },
  isolirDate: { col: "isolir_date", type: "date" },
};

/** Hint untuk UI - apa saja field yang boleh dipakai + operator yang valid */
export const AUDIENCE_FIELD_OPTIONS = Object.keys(FIELD_MAP).map(k => ({
  field: k,
  column: FIELD_MAP[k].col,
  type: FIELD_MAP[k].type,
}));

// Lit-safe - return SQL fragment + params array (parameterized)
export function buildAudienceWhere(filter: AudienceFilter): { sql: string; params: any[] } | null {
  if (!filter || !Array.isArray(filter.rules) || filter.rules.length === 0) {
    return null;
  }
  const combine = filter.combine === "any" ? " OR " : " AND ";
  const parts: string[] = [];
  const params: any[] = [];

  for (const rule of filter.rules) {
    const fm = FIELD_MAP[rule.field];
    if (!fm) continue;
    const col = fm.col;
    switch (rule.op) {
      case "eq":  parts.push(`${col} = ?`); params.push(rule.value); break;
      case "ne":  parts.push(`(${col} IS NULL OR ${col} != ?)`); params.push(rule.value); break;
      case "gt":  parts.push(`${col} > ?`); params.push(rule.value); break;
      case "gte": parts.push(`${col} >= ?`); params.push(rule.value); break;
      case "lt":  parts.push(`${col} < ?`); params.push(rule.value); break;
      case "lte": parts.push(`${col} <= ?`); params.push(rule.value); break;
      case "in": {
        const arr = Array.isArray(rule.value) ? rule.value : [rule.value];
        if (arr.length === 0) { parts.push("0=1"); break; }
        parts.push(`${col} IN (${arr.map(() => "?").join(",")})`);
        params.push(...arr);
        break;
      }
      case "not_in": {
        const arr = Array.isArray(rule.value) ? rule.value : [rule.value];
        if (arr.length === 0) { parts.push("1=1"); break; }
        parts.push(`(${col} IS NULL OR ${col} NOT IN (${arr.map(() => "?").join(",")}))`);
        params.push(...arr);
        break;
      }
      case "contains":     parts.push(`${col} LIKE ?`); params.push(`%${rule.value}%`); break;
      case "starts_with":  parts.push(`${col} LIKE ?`); params.push(`${rule.value}%`); break;
      case "is_empty":     parts.push(`(${col} IS NULL OR ${col} = '')`); break;
      case "not_empty":    parts.push(`(${col} IS NOT NULL AND ${col} != '')`); break;
      case "lte_days": {
        // dueDate <= NOW + N days  (mendekati jatuh tempo)
        const days = Number(rule.value) || 0;
        parts.push(`(${col} IS NOT NULL AND date(${col}) <= date('now', '+${days} days'))`);
        break;
      }
      case "gte_days": {
        const days = Number(rule.value) || 0;
        parts.push(`(${col} IS NOT NULL AND date(${col}) >= date('now', '+${days} days'))`);
        break;
      }
      case "lte_days_ago": {
        // installDate <= N days ago (lebih lama dari N hari)
        const days = Number(rule.value) || 0;
        parts.push(`(${col} IS NOT NULL AND date(${col}) <= date('now', '-${days} days'))`);
        break;
      }
      case "gte_days_ago": {
        // installDate >= N days ago (lebih baru dari N hari) - pelanggan baru
        const days = Number(rule.value) || 0;
        parts.push(`(${col} IS NOT NULL AND date(${col}) >= date('now', '-${days} days'))`);
        break;
      }
      default:
        continue;
    }
  }

  if (parts.length === 0) return null;
  return { sql: parts.join(combine), params };
}

/** Validate filter dari frontend - minimal check shape */
export function validateAudienceFilter(filter: any): filter is AudienceFilter {
  if (!filter || typeof filter !== "object") return false;
  if (filter.combine !== "all" && filter.combine !== "any") return false;
  if (!Array.isArray(filter.rules)) return false;
  for (const r of filter.rules) {
    if (!r || typeof r.field !== "string" || typeof r.op !== "string") return false;
    if (!FIELD_MAP[r.field]) return false;
  }
  return true;
}

// System segments - pre-defined, langsung pakai
export const SYSTEM_SEGMENTS: Array<{ name: string; description: string; filter: AudienceFilter }> = [
  {
    name: "Semua Pelanggan Aktif",
    description: "Customer status aktif & punya phone",
    filter: { combine: "all", rules: [
      { field: "isIsolir", op: "eq", value: 0 },
      { field: "phone", op: "not_empty" },
    ]},
  },
  {
    name: "Pelanggan Isolir",
    description: "Customer yang sedang diisolir",
    filter: { combine: "all", rules: [
      { field: "isIsolir", op: "eq", value: 1 },
      { field: "phone", op: "not_empty" },
    ]},
  },
  {
    name: "Tagihan Jatuh Tempo 3 Hari",
    description: "Customer dengan dueDate dalam 3 hari ke depan",
    filter: { combine: "all", rules: [
      { field: "isIsolir", op: "eq", value: 0 },
      { field: "dueDate", op: "lte_days", value: 3 },
      { field: "phone", op: "not_empty" },
    ]},
  },
  {
    name: "Tagihan Jatuh Tempo 1 Hari",
    description: "Customer dengan dueDate H-1",
    filter: { combine: "all", rules: [
      { field: "isIsolir", op: "eq", value: 0 },
      { field: "dueDate", op: "lte_days", value: 1 },
      { field: "phone", op: "not_empty" },
    ]},
  },
  {
    name: "Pelanggan Baru (30 hari)",
    description: "Customer install dalam 30 hari terakhir",
    filter: { combine: "all", rules: [
      { field: "installDate", op: "gte_days_ago", value: 30 },
      { field: "phone", op: "not_empty" },
    ]},
  },
  {
    name: "Pelanggan VIP",
    description: "Customer dengan paket premium (billing >= 300K)",
    filter: { combine: "all", rules: [
      { field: "isIsolir", op: "eq", value: 0 },
      { field: "billingPrice", op: "gte", value: 300000 },
      { field: "phone", op: "not_empty" },
    ]},
  },
];
