import { resolveAssignee } from "./leadsToPipeline.js";
import { normalizeDateValue } from "../shared/pipelineBillingIntake.js";

export { resolveAssignee };

/** DB-shape (snake_case) collection row — only fields we read. */
export interface CollectionRow {
  id: number;
  customer_id: number; // FK -> customers.id
  stage?: string | null;
  issue_type?: string | null;
  promise_date?: string | null;
  opened_at?: string | null;
  opened_amount?: number | null;
  opened_due_date?: string | null;
  opened_billing_status?: string | null;
  opened_isolir_date?: string | null;
  closed_at?: string | null;
  closed_last_payment_date?: string | null;
  close_reason?: string | null;
  priority?: string | null;
  notes?: string | null;
  assigned_to?: number | null;
  assigned_at?: string | null;
  created_by?: number | null;
  created_at: string;
  updated_at?: string | null;
}

/** Customer columns joined onto a collection. */
export interface CustomerLite {
  name?: string | null;
  customer_id?: string | null; // billing text id
  phone?: string | null;
  pppoe_username?: string | null;
  package?: string | null;
  address?: string | null;
  district?: string | null;
  village?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export interface CollectionStageRow {
  key: string;
  label: string;
  color: string;
  position: number;
  role?: string | null;
}

export interface CollectionActivityRow {
  id: number;
  collection_id: number;
  user_id?: number | null;
  type: string;
  content?: string | null;
  photo_data?: string | null;
  created_at: string;
}

export interface StageDef {
  key: string;
  label: string;
  color: string;
  position: number;
}

/** The 6 built-in collection stages, used only when collection_stages is empty. */
export const DEFAULT_COLLECTION_STAGES: StageDef[] = [
  { key: "new", label: "Baru", color: "#6B7280", position: 0 },
  { key: "contacted", label: "Dihubungi", color: "#3B82F6", position: 1 },
  { key: "promised", label: "Janji Bayar", color: "#8B5CF6", position: 2 },
  { key: "issue", label: "Bermasalah", color: "#F59E0B", position: 3 },
  { key: "paid", label: "Lunas", color: "#22C55E", position: 4 },
  { key: "written_off", label: "Hapus Buku", color: "#EF4444", position: 5 },
];

/** Replicate collection_stages (ordered by position); fall back to defaults if empty. */
export function COLLECTION_PIPELINE_STAGES(rows: CollectionStageRow[]): StageDef[] {
  if (!rows.length) return DEFAULT_COLLECTION_STAGES;
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((r, i) => ({ key: r.key, label: r.label, color: r.color, position: i }));
}

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "phone" | "dropdown" | "coordinate" | "user" | "date";
  options?: string[];
  config?: { multiple?: boolean };
  showOnCard: boolean;
  position: number;
}

const ISSUE_TYPES = [
  "no_contact", "no_answer", "promise_broken", "financial_difficulty",
  "moved_out", "service_complaint", "billing_dispute", "lainnya",
];

export const COLLECTION_PIPELINE_FIELDS: FieldDef[] = [
  { key: "customer_id", label: "ID Pelanggan", type: "text", showOnCard: true, position: 0 },
  { key: "phone", label: "Telepon", type: "phone", showOnCard: true, position: 1 },
  { key: "package", label: "Paket", type: "text", showOnCard: true, position: 2 },
  { key: "opened_amount", label: "Tagihan (Rp)", type: "number", showOnCard: true, position: 3 },
  { key: "opened_due_date", label: "Jatuh Tempo", type: "date", showOnCard: true, position: 4 },
  { key: "promise_date", label: "Janji Bayar", type: "date", showOnCard: true, position: 5 },
  { key: "issue_type", label: "Jenis Masalah", type: "dropdown", options: ISSUE_TYPES, showOnCard: false, position: 6 },
  { key: "opened_billing_status", label: "Status Billing", type: "text", showOnCard: false, position: 7 },
  { key: "opened_isolir_date", label: "Tgl Isolir", type: "date", showOnCard: false, position: 8 },
  { key: "closed_payment_date", label: "Tgl Lunas", type: "date", showOnCard: false, position: 9 },
  { key: "pppoe_username", label: "Username PPPoE", type: "text", showOnCard: false, position: 10 },
  { key: "district", label: "Kecamatan", type: "text", showOnCard: false, position: 11 },
  { key: "village", label: "Desa/Kelurahan", type: "text", showOnCard: false, position: 12 },
  { key: "address", label: "Alamat", type: "textarea", showOnCard: false, position: 13 },
  { key: "notes", label: "Catatan", type: "textarea", showOnCard: false, position: 14 },
  { key: "close_reason", label: "Alasan Tutup", type: "text", showOnCard: false, position: 15 },
  { key: "assignees", label: "Tim Penagih", type: "user", config: { multiple: true }, showOnCard: true, position: 16 },
  { key: "coordinate", label: "Koordinat", type: "coordinate", showOnCard: false, position: 17 },
  { key: "source_collection_id", label: "Sumber Collection ID", type: "number", showOnCard: false, position: 18 },
];

export interface CardDraft {
  title: string;
  stageId: number;
  assigneeId: number | null;
  priority: string;
  createdBy: number | null;
  createdAt: string;
  stageEnteredAt: string;
}

/** Map a collection (+ its customer) to pipeline_cards columns. Unknown stage → first stage. */
export function collectionToCard(
  col: CollectionRow,
  customer: CustomerLite | null,
  stageIdByKey: Record<string, number>,
  firstStageKey: string,
  assigneeId: number | null,
): CardDraft {
  const stageKey = col.stage && stageIdByKey[col.stage] != null ? col.stage : firstStageKey;
  const title =
    (customer?.name && customer.name.trim()) ||
    (customer?.customer_id && String(customer.customer_id).trim()) ||
    `Pelanggan #${col.customer_id}`;
  return {
    title,
    stageId: stageIdByKey[stageKey],
    assigneeId,
    priority: col.priority || "medium",
    createdBy: col.created_by ?? null,
    createdAt: col.created_at,
    stageEnteredAt: col.assigned_at || col.updated_at || col.created_at,
  };
}

/** Dedup + keep only tenant-valid user ids, preserving first-seen order. */
export function resolveMultiAssignees(
  rows: { user_id: number }[],
  validUserIds: Set<number>,
): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const r of rows) {
    const id = Number(r.user_id);
    if (!validUserIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Map a collection (+ customer) to custom-field {fieldKey,value} pairs. Omits null/empty.
 *  Date-typed values are normalized to YYYY-MM-DD so <input type="date"> can render them.
 *  Mirrors what /collections displays: "Isolir Sejak" falls back to opened_at, "Lunas"
 *  uses the recorded payment date (else closed_at). */
export function collectionToFieldValues(
  col: CollectionRow,
  customer: CustomerLite | null,
): { fieldKey: string; value: string }[] {
  // /collections shows openedIsolirDate ?? openedAt for "Isolir Sejak".
  const isolirSince = col.opened_isolir_date ?? col.opened_at ?? null;
  // "Lunas" only exists once the collection is closed.
  const paidOn = col.closed_at ? (col.closed_last_payment_date ?? col.closed_at) : null;

  // tuple: [fieldKey, value, isDate?]
  const raw: [string, string | number | null | undefined, boolean?][] = [
    ["customer_id", customer?.customer_id],
    ["phone", customer?.phone],
    ["pppoe_username", customer?.pppoe_username],
    ["package", customer?.package],
    ["opened_amount", col.opened_amount],
    ["opened_due_date", col.opened_due_date, true],
    ["promise_date", col.promise_date, true],
    ["issue_type", col.issue_type],
    ["opened_billing_status", col.opened_billing_status],
    ["opened_isolir_date", isolirSince, true],
    ["closed_payment_date", paidOn, true],
    ["district", customer?.district],
    ["village", customer?.village],
    ["address", customer?.address],
    ["notes", col.notes],
    ["close_reason", col.close_reason],
    ["source_collection_id", col.id],
  ];
  const out: { fieldKey: string; value: string }[] = [];
  for (const [fieldKey, v, isDate] of raw) {
    if (v === null || v === undefined) continue;
    let value = String(v).trim();
    if (isDate) value = normalizeDateValue(value);
    if (value === "") continue;
    out.push({ fieldKey, value });
  }
  const lat = customer?.lat, lng = customer?.lng;
  if (typeof lat === "number" && Number.isFinite(lat) &&
      typeof lng === "number" && Number.isFinite(lng)) {
    out.push({ fieldKey: "coordinate", value: JSON.stringify({ lat, lng }) });
  }
  return out;
}

const COMMENT_TYPES = new Set(["note", "call", "whatsapp", "visit"]);
const ACTIVITY_LABELS: Record<string, string> = {
  note: "Catatan", call: "Telepon", whatsapp: "WhatsApp", visit: "Kunjungan",
};

/** Bucket a collection activity: user-thread "comment" vs audit "activity". */
export function classifyCollectionActivity(type: string): "comment" | "activity" {
  return COMMENT_TYPES.has(type) ? "comment" : "activity";
}

/** Map a comment-type activity to a pipeline_card_comments draft (photo handled by the runner). */
export function collectionActivityToComment(
  act: CollectionActivityRow,
): { body: string; authorId: number | null; createdAt: string } {
  const label = ACTIVITY_LABELS[act.type] ?? act.type;
  const content = (act.content ?? "").trim();
  return {
    body: content ? `[${label}] ${content}` : `[${label}]`,
    authorId: act.user_id ?? null,
    createdAt: act.created_at,
  };
}

/** Map an audit-type activity to a pipeline_card_activity draft. */
export function collectionActivityToActivity(
  act: CollectionActivityRow,
): { type: string; detail: string | null; actorId: number | null; createdAt: string } {
  return {
    type: act.type,
    detail: act.content ?? null,
    actorId: act.user_id ?? null,
    createdAt: act.created_at,
  };
}
