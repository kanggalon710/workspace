import {
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_STAGE_COLORS,
  LEAD_CATEGORIES,
} from "../shared/schema.js";

/** DB-shape (snake_case) lead row, as returned by a raw mysql2 SELECT. Only fields we read. */
export interface LeadRow {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
  category?: string | null;
  source?: string | null;
  notes?: string | null;
  district?: string | null;
  village?: string | null;
  loss_reason?: string | null;
  odp_id?: number | null;
  distance_meters?: number | null;
  lat?: number | null;
  lng?: number | null;
  stage?: string | null;
  priority?: string | null;
  assigned_to?: number | null;
  created_by: number;
  created_at: string;
  updated_at?: string | null;
}

export interface ActivityRow {
  id: number;
  lead_id: number;
  user_id: number;
  type: string;
  content?: string | null;
  photo_path?: string | null;
  photo_data?: string | null;
  created_at: string;
}

const LEAD_SOURCES = ["prospect_finder", "canvassing", "referral", "inbound", "meta_ads", "tiktok_ads"];

/** The 6 lead stages as pipeline stage definitions (ordered). */
export function LEAD_PIPELINE_STAGES(): { key: string; label: string; color: string; position: number }[] {
  return LEAD_STAGES.map((key, i) => ({
    key,
    label: LEAD_STAGE_LABELS[key],
    color: LEAD_STAGE_COLORS[key],
    position: i,
  }));
}

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "phone" | "dropdown" | "coordinate";
  options?: string[];
  showOnCard: boolean;
  position: number;
}

/** Custom-field definitions for the typed lead columns. */
export const LEAD_PIPELINE_FIELDS: FieldDef[] = [
  { key: "phone", label: "Telepon", type: "phone", showOnCard: true, position: 0 },
  { key: "source", label: "Sumber", type: "dropdown", options: LEAD_SOURCES, showOnCard: true, position: 1 },
  { key: "category", label: "Kategori", type: "dropdown", options: [...LEAD_CATEGORIES], showOnCard: false, position: 2 },
  { key: "district", label: "Kecamatan", type: "text", showOnCard: true, position: 3 },
  { key: "village", label: "Desa/Kelurahan", type: "text", showOnCard: false, position: 4 },
  { key: "address", label: "Alamat", type: "textarea", showOnCard: false, position: 5 },
  { key: "notes", label: "Catatan", type: "textarea", showOnCard: false, position: 6 },
  { key: "loss_reason", label: "Alasan Gagal", type: "text", showOnCard: false, position: 7 },
  { key: "odp_id", label: "ODP ID", type: "number", showOnCard: false, position: 8 },
  { key: "distance_m", label: "Jarak ODP (m)", type: "number", showOnCard: false, position: 9 },
  { key: "coordinate", label: "Koordinat", type: "coordinate", showOnCard: false, position: 10 },
  { key: "source_lead_id", label: "Sumber Lead ID", type: "number", showOnCard: false, position: 11 },
];

export interface CardDraft {
  title: string;
  stageId: number;
  assigneeId: number | null;
  priority: string;
  createdBy: number;
  createdAt: string;
  stageEnteredAt: string;
}

/** Map a lead row to pipeline_cards columns. Unknown stage → first stage. */
export function leadToCard(lead: LeadRow, stageIdByKey: Record<string, number>, assigneeId: number | null): CardDraft {
  const stageKey = lead.stage && stageIdByKey[lead.stage] != null ? lead.stage : LEAD_STAGES[0];
  return {
    title: lead.name,
    stageId: stageIdByKey[stageKey],
    assigneeId,
    priority: lead.priority || "medium",
    createdBy: lead.created_by,
    createdAt: lead.created_at,
    stageEnteredAt: lead.updated_at || lead.created_at,
  };
}

/** Resolve a card assignee against the tenant's users: keep the lead's assignee if valid,
 *  else fall back to defaultAssignee, else null. */
export function resolveAssignee(
  leadAssignedTo: number | null,
  validUserIds: Set<number>,
  defaultAssignee: number | null,
): number | null {
  if (leadAssignedTo != null && validUserIds.has(leadAssignedTo)) return leadAssignedTo;
  if (defaultAssignee != null) return defaultAssignee;
  return null;
}

/** Map a lead row to custom-field {fieldKey,value} pairs. Omits null/empty; stringifies numbers. */
export function leadToFieldValues(lead: LeadRow): { fieldKey: string; value: string }[] {
  const raw: [string, string | number | null | undefined][] = [
    ["phone", lead.phone],
    ["source", lead.source],
    ["category", lead.category],
    ["district", lead.district],
    ["village", lead.village],
    ["address", lead.address],
    ["notes", lead.notes],
    ["loss_reason", lead.loss_reason],
    ["odp_id", lead.odp_id],
    ["distance_m", lead.distance_meters],
    ["source_lead_id", lead.id],
  ];
  const out: { fieldKey: string; value: string }[] = [];
  for (const [fieldKey, v] of raw) {
    if (v === null || v === undefined) continue;
    const value = String(v).trim();
    if (value === "") continue;
    out.push({ fieldKey, value });
  }
  // Coordinate: one field combining lat+lng, only when both are finite numbers.
  if (typeof lead.lat === "number" && Number.isFinite(lead.lat) &&
      typeof lead.lng === "number" && Number.isFinite(lead.lng)) {
    out.push({ fieldKey: "coordinate", value: JSON.stringify({ lat: lead.lat, lng: lead.lng }) });
  }
  return out;
}

const COMMENT_TYPES = new Set(["note", "call", "whatsapp", "visit", "photo"]);
const ACTIVITY_LABELS: Record<string, string> = {
  note: "Catatan", call: "Telepon", whatsapp: "WhatsApp", visit: "Kunjungan", photo: "Foto",
};

/** Bucket a lead activity: user-thread "comment" vs audit "activity". */
export function classifyActivity(type: string): "comment" | "activity" {
  return COMMENT_TYPES.has(type) ? "comment" : "activity";
}

/** Map a comment-type lead activity to a pipeline_card_comments draft (photo handled by the script via photo_path). */
export function activityToComment(act: ActivityRow): { body: string; authorId: number; createdAt: string } {
  const label = ACTIVITY_LABELS[act.type] ?? act.type;
  const content = (act.content ?? "").trim();
  return {
    body: content ? `[${label}] ${content}` : `[${label}]`,
    authorId: act.user_id,
    createdAt: act.created_at,
  };
}

/** Map an audit-type lead activity to a pipeline_card_activity draft. */
export function activityToActivity(act: ActivityRow): { type: string; detail: string | null; actorId: number; createdAt: string } {
  return {
    type: act.type,
    detail: act.content ?? null,
    actorId: act.user_id,
    createdAt: act.created_at,
  };
}
