# Collections → Pipeline Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-off, idempotent snapshot importer that copies JABNET's `/collections` data (stages, cards, custom-field values, multi-assignee, comments incl. photos, audit activity) into the generic pipelines engine as a "Penagihan (Collections)" board.

**Architecture:** Mirror the existing leads→pipeline import. One pure, unit-tested mapping module (`tools/collectionsToPipeline.ts`) + one I/O runner (`tools/import-collections-to-pipeline.ts`) + one additive whitelist change in `server/uploads.ts` so collection photos can be written to the filesystem.

**Tech Stack:** TypeScript, `mysql2/promise`, `node:test` (run via `npx tsx --test`), esbuild (for bundling to run on the cPanel box). `.js` import extensions throughout (matches repo convention).

---

### Task 1: Whitelist a `collections` photo feature

**Files:**
- Modify: `server/uploads.ts:15`

- [ ] **Step 1: Add `"collections"` to the FEATURES tuple**

In `server/uploads.ts`, change:

```ts
const FEATURES = ["canvassing", "odps", "leads", "bugs"] as const;
```

to:

```ts
const FEATURES = ["canvassing", "odps", "leads", "bugs", "collections"] as const;
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/uploads.ts
git commit -m "feat(uploads): whitelist collections photo feature"
```

---

### Task 2: Pure mapping module + tests

**Files:**
- Create: `tools/collectionsToPipeline.ts`
- Test: `tools/collectionsToPipeline.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tools/collectionsToPipeline.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COLLECTION_PIPELINE_STAGES,
  DEFAULT_COLLECTION_STAGES,
  COLLECTION_PIPELINE_FIELDS,
  collectionToCard,
  collectionToFieldValues,
  resolveMultiAssignees,
  classifyCollectionActivity,
  collectionActivityToComment,
  type CollectionRow,
  type CustomerLite,
} from "./collectionsToPipeline.js";

const col = (over: Partial<CollectionRow> = {}): CollectionRow => ({
  id: 7,
  customer_id: 42,
  stage: "contacted",
  issue_type: "no_answer",
  promise_date: null,
  opened_amount: 150000,
  opened_due_date: "2026-05-01",
  opened_billing_status: "overdue",
  opened_isolir_date: null,
  close_reason: null,
  priority: "high",
  notes: "telpon besok",
  assigned_to: 3,
  assigned_at: "2026-05-02T00:00:00.000Z",
  created_by: 1,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-03T00:00:00.000Z",
  ...over,
});

const cust = (over: Partial<CustomerLite> = {}): CustomerLite => ({
  name: "Budi",
  customer_id: "052500015",
  phone: "081234",
  package: "20Mbps",
  address: "Jl. Mawar",
  district: "Cilawu",
  village: "Sukamaju",
  lat: -7.2,
  lng: 107.9,
  ...over,
});

test("stages replicate rows ordered by position", () => {
  const out = COLLECTION_PIPELINE_STAGES([
    { key: "b", label: "B", color: "#111", position: 1, role: "none" },
    { key: "a", label: "A", color: "#222", position: 0, role: "entry" },
  ]);
  assert.deepEqual(out.map((s) => s.key), ["a", "b"]);
  assert.equal(out[0].position, 0);
});

test("stages fall back to defaults when rows empty", () => {
  const out = COLLECTION_PIPELINE_STAGES([]);
  assert.deepEqual(out, DEFAULT_COLLECTION_STAGES);
  assert.equal(out[0].key, "new");
  assert.equal(out.length, 6);
});

test("field values omit null/empty and emit coordinate", () => {
  const vals = collectionToFieldValues(col({ notes: "", close_reason: null }), cust());
  const map = Object.fromEntries(vals.map((v) => [v.fieldKey, v.value]));
  assert.equal(map.customer_id, "052500015");
  assert.equal(map.opened_amount, "150000");
  assert.equal(map.source_collection_id, "7");
  assert.equal(map.notes, undefined); // empty dropped
  assert.equal(map.close_reason, undefined); // null dropped
  assert.equal(map.coordinate, JSON.stringify({ lat: -7.2, lng: 107.9 }));
});

test("coordinate omitted when lat/lng missing", () => {
  const vals = collectionToFieldValues(col(), cust({ lat: null, lng: null }));
  assert.ok(!vals.some((v) => v.fieldKey === "coordinate"));
});

test("card title falls back through name -> billing id -> placeholder", () => {
  const ids = { new: 10, contacted: 11 };
  assert.equal(collectionToCard(col(), cust(), ids, "new", 3).title, "Budi");
  assert.equal(collectionToCard(col(), cust({ name: "" }), ids, "new", 3).title, "052500015");
  assert.equal(
    collectionToCard(col(), cust({ name: "", customer_id: "" }), ids, "new", 3).title,
    "Pelanggan #42",
  );
});

test("card uses known stage, else first stage", () => {
  const ids = { new: 10, contacted: 11 };
  assert.equal(collectionToCard(col({ stage: "contacted" }), cust(), ids, "new", 3).stageId, 11);
  assert.equal(collectionToCard(col({ stage: "ghost" }), cust(), ids, "new", 3).stageId, 10);
  assert.equal(collectionToCard(col(), cust(), ids, "new", null).assigneeId, null);
});

test("resolveMultiAssignees dedups and keeps only valid", () => {
  const valid = new Set([3, 5]);
  const out = resolveMultiAssignees(
    [{ user_id: 3 }, { user_id: 3 }, { user_id: 9 }, { user_id: 5 }],
    valid,
  );
  assert.deepEqual(out, [3, 5]);
});

test("activity classify + comment body", () => {
  assert.equal(classifyCollectionActivity("call"), "comment");
  assert.equal(classifyCollectionActivity("stage_change"), "activity");
  const cm = collectionActivityToComment({
    id: 1, collection_id: 7, user_id: 3, type: "visit", content: "ketemu", photo_data: null, created_at: "x",
  });
  assert.equal(cm.body, "[Kunjungan] ketemu");
  assert.equal(cm.authorId, 3);
});

test("assignees field is type user with multiple config", () => {
  const f = COLLECTION_PIPELINE_FIELDS.find((x) => x.key === "assignees");
  assert.equal(f?.type, "user");
  assert.deepEqual(f?.config, { multiple: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tools/collectionsToPipeline.test.ts`
Expected: FAIL — cannot find module `./collectionsToPipeline.js`.

- [ ] **Step 3: Write the module**

Create `tools/collectionsToPipeline.ts`:

```ts
import { resolveAssignee } from "./leadsToPipeline.js";

export { resolveAssignee };

/** DB-shape (snake_case) collection row — only fields we read. */
export interface CollectionRow {
  id: number;
  customer_id: number; // FK -> customers.id
  stage?: string | null;
  issue_type?: string | null;
  promise_date?: string | null;
  opened_amount?: number | null;
  opened_due_date?: string | null;
  opened_billing_status?: string | null;
  opened_isolir_date?: string | null;
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
  type: "text" | "textarea" | "number" | "phone" | "dropdown" | "coordinate" | "user";
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
  { key: "opened_due_date", label: "Jatuh Tempo", type: "text", showOnCard: true, position: 4 },
  { key: "promise_date", label: "Janji Bayar", type: "text", showOnCard: true, position: 5 },
  { key: "issue_type", label: "Jenis Masalah", type: "dropdown", options: ISSUE_TYPES, showOnCard: false, position: 6 },
  { key: "opened_billing_status", label: "Status Billing", type: "text", showOnCard: false, position: 7 },
  { key: "opened_isolir_date", label: "Tgl Isolir", type: "text", showOnCard: false, position: 8 },
  { key: "district", label: "Kecamatan", type: "text", showOnCard: false, position: 9 },
  { key: "village", label: "Desa/Kelurahan", type: "text", showOnCard: false, position: 10 },
  { key: "address", label: "Alamat", type: "textarea", showOnCard: false, position: 11 },
  { key: "notes", label: "Catatan", type: "textarea", showOnCard: false, position: 12 },
  { key: "close_reason", label: "Alasan Tutup", type: "text", showOnCard: false, position: 13 },
  { key: "assignees", label: "Tim Penagih", type: "user", config: { multiple: true }, showOnCard: true, position: 14 },
  { key: "coordinate", label: "Koordinat", type: "coordinate", showOnCard: false, position: 15 },
  { key: "source_collection_id", label: "Sumber Collection ID", type: "number", showOnCard: false, position: 16 },
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

/** Map a collection (+ customer) to custom-field {fieldKey,value} pairs. Omits null/empty. */
export function collectionToFieldValues(
  col: CollectionRow,
  customer: CustomerLite | null,
): { fieldKey: string; value: string }[] {
  const raw: [string, string | number | null | undefined][] = [
    ["customer_id", customer?.customer_id],
    ["phone", customer?.phone],
    ["package", customer?.package],
    ["opened_amount", col.opened_amount],
    ["opened_due_date", col.opened_due_date],
    ["promise_date", col.promise_date],
    ["issue_type", col.issue_type],
    ["opened_billing_status", col.opened_billing_status],
    ["opened_isolir_date", col.opened_isolir_date],
    ["district", customer?.district],
    ["village", customer?.village],
    ["address", customer?.address],
    ["notes", col.notes],
    ["close_reason", col.close_reason],
    ["source_collection_id", col.id],
  ];
  const out: { fieldKey: string; value: string }[] = [];
  for (const [fieldKey, v] of raw) {
    if (v === null || v === undefined) continue;
    const value = String(v).trim();
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test tools/collectionsToPipeline.test.ts`
Expected: PASS — all tests (tests 1-9) pass.

- [ ] **Step 5: Commit**

```bash
git add tools/collectionsToPipeline.ts tools/collectionsToPipeline.test.ts
git commit -m "feat(pipelines): pure collections->pipeline mapping module + tests"
```

---

### Task 3: Import runner

**Files:**
- Create: `tools/import-collections-to-pipeline.ts`

- [ ] **Step 1: Write the runner**

Create `tools/import-collections-to-pipeline.ts`:

```ts
import mysql from "mysql2/promise";
import { saveBase64Photo } from "../server/uploads.js";
import {
  COLLECTION_PIPELINE_STAGES,
  COLLECTION_PIPELINE_FIELDS,
  collectionToCard,
  collectionToFieldValues,
  resolveAssignee,
  resolveMultiAssignees,
  classifyCollectionActivity,
  collectionActivityToComment,
  collectionActivityToActivity,
  type CollectionRow,
  type CustomerLite,
  type CollectionStageRow,
  type CollectionActivityRow,
} from "./collectionsToPipeline.js";

const MITRA_ID = 1; // JABNET only
const PIPELINE_NAME = "Penagihan (Collections)";
const SENTINEL = "[collections-import]";
const PIPELINE_DESC = `Diimpor dari /collections (snapshot). ${SENTINEL}`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "Usage: node import-collections.mjs [--reset] [--default-assignee <userId>]",
      "",
      "  Snapshot-import JABNET (mitra 1) collections into a 'Penagihan (Collections)' pipeline",
      "  on the DB given by DB_* env vars (use DB_NAME=jabnet_fiber for prod).",
      "",
      "  --reset   delete a previously-imported pipeline (matched by sentinel) then re-import.",
      "  --default-assignee <userId>   fallback assignee when a collection's assignee isn't a JABNET user.",
      "",
      "  Photos: collection_activities.photo_data (base64) are written to the filesystem via",
      "  saveBase64Photo — set JABNET_PRIVATE_ROOT (or JABNET_UPLOAD_ROOT) so they land in the",
      "  private uploads dir, not ./uploads.",
    ].join("\n"),
  );
  process.exit(0);
}
const RESET = args.includes("--reset");
const daIdx = args.indexOf("--default-assignee");
const defaultAssignee = daIdx >= 0 ? Number(args[daIdx + 1]) : null;
if (daIdx >= 0 && (!Number.isInteger(defaultAssignee as number) || (defaultAssignee as number) <= 0)) {
  console.error("ERROR: --default-assignee harus userId integer > 0.");
  process.exit(1);
}

if (!process.env.DB_USER || !process.env.DB_NAME) {
  console.error("ERROR: DB_USER + DB_NAME wajib di-set (env). Prod: DB_NAME=jabnet_fiber.");
  process.exit(1);
}

const pool = await mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
});

const nowIso = () => new Date().toISOString();
async function q(sql: string, params: any[] = []): Promise<any[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as any[];
}

async function main() {
  const existing = await q(
    `SELECT id FROM pipelines WHERE mitra_id = ? AND name = ? AND description LIKE ?`,
    [MITRA_ID, PIPELINE_NAME, `%${SENTINEL}%`],
  );
  if (existing.length) {
    if (!RESET) {
      console.error(`Pipeline "${PIPELINE_NAME}" sudah ada (id ${existing[0].id}). Pakai --reset untuk re-import.`);
      process.exit(1);
    }
    const pid = existing[0].id as number;
    const cards = await q(`SELECT id FROM pipeline_cards WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    const cardIds = cards.map((c: any) => c.id);
    if (cardIds.length) {
      const ph = cardIds.map(() => "?").join(",");
      for (const t of ["pipeline_card_comments", "pipeline_card_activity", "pipeline_card_values", "pipeline_card_followers"]) {
        await q(`DELETE FROM ${t} WHERE mitra_id = ? AND card_id IN (${ph})`, [MITRA_ID, ...cardIds]);
      }
    }
    await q(`DELETE FROM pipeline_cards WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    const rules = await q(`SELECT id FROM pipeline_rules WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    const ruleIds = rules.map((r: any) => r.id);
    if (ruleIds.length) {
      const rph = ruleIds.map(() => "?").join(",");
      for (const t of ["pipeline_rule_field_maps", "pipeline_rule_fires", "pipeline_rule_actions"]) {
        await q(`DELETE FROM ${t} WHERE mitra_id = ? AND rule_id IN (${rph})`, [MITRA_ID, ...ruleIds]);
      }
    }
    await q(`DELETE FROM pipeline_rules WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    await q(`DELETE FROM pipeline_fields WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    await q(`DELETE FROM pipeline_access WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    await q(`DELETE FROM pipeline_stages WHERE mitra_id = ? AND pipeline_id = ?`, [MITRA_ID, pid]);
    await q(`DELETE FROM pipelines WHERE mitra_id = ? AND id = ?`, [MITRA_ID, pid]);
    console.log(`[reset] deleted prior pipeline id ${pid} + children`);
  }

  // Resolve mitra slug for photo paths.
  const mitraRows = await q(`SELECT slug FROM mitras WHERE id = ?`, [MITRA_ID]);
  const slug: string = (mitraRows[0]?.slug as string) || "jabnet";

  const us = await q(`SELECT id FROM users ORDER BY id ASC LIMIT 1`);
  const SYSTEM_USER: number = us.length ? us[0].id : 1;

  const userRows = await q(`SELECT DISTINCT user_id FROM user_mitras WHERE mitra_id = ?`, [MITRA_ID]);
  const validUserIds = new Set<number>(userRows.map((r: any) => Number(r.user_id)));

  const pr = await q(
    `INSERT INTO pipelines (mitra_id, name, description, color, icon, position, is_archived, restricted, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`,
    [MITRA_ID, PIPELINE_NAME, PIPELINE_DESC, "#F59E0B", "banknote", SYSTEM_USER, nowIso()],
  );
  const pipelineId = (pr as any).insertId as number;

  const stageRows = (await q(
    `SELECT \`key\`, label, color, position, role FROM collection_stages WHERE mitra_id = ? ORDER BY position ASC`,
    [MITRA_ID],
  )) as CollectionStageRow[];
  const stages = COLLECTION_PIPELINE_STAGES(stageRows);
  const firstStageKey = stages[0].key;
  const stageIdByKey: Record<string, number> = {};
  for (const s of stages) {
    const r = await q(
      `INSERT INTO pipeline_stages (mitra_id, pipeline_id, label, color, position, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [MITRA_ID, pipelineId, s.label, s.color, s.position, nowIso()],
    );
    stageIdByKey[s.key] = (r as any).insertId;
  }

  const fieldIdByKey: Record<string, number> = {};
  for (const f of COLLECTION_PIPELINE_FIELDS) {
    const r = await q(
      `INSERT INTO pipeline_fields (mitra_id, pipeline_id, \`key\`, label, type, options, config, required, show_on_card, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        MITRA_ID, pipelineId, f.key, f.label, f.type,
        f.options ? JSON.stringify(f.options) : null,
        f.config ? JSON.stringify(f.config) : null,
        f.showOnCard ? 1 : 0, f.position, nowIso(),
      ],
    );
    fieldIdByKey[f.key] = (r as any).insertId;
  }

  const rows = await q(
    `SELECT c.*, cu.name AS cust_name, cu.customer_id AS cust_billing_id, cu.phone AS cust_phone,
            cu.package AS cust_package, cu.address AS cust_address, cu.district AS cust_district,
            cu.village AS cust_village, cu.lat AS cust_lat, cu.lng AS cust_lng
     FROM collections c LEFT JOIN customers cu ON cu.id = c.customer_id
     WHERE c.mitra_id = ? ORDER BY c.id ASC`,
    [MITRA_ID],
  );

  let nCards = 0, nValues = 0, nComments = 0, nActivity = 0, nPhotos = 0, nPhotoFailed = 0, nCoord = 0;
  let nAssignMatched = 0, nAssignDefault = 0, nAssignSkipped = 0, nMulti = 0;

  for (const r of rows) {
    const col = r as CollectionRow;
    const customer: CustomerLite = {
      name: r.cust_name, customer_id: r.cust_billing_id, phone: r.cust_phone,
      package: r.cust_package, address: r.cust_address, district: r.cust_district,
      village: r.cust_village, lat: r.cust_lat, lng: r.cust_lng,
    };

    const assigneeId = resolveAssignee(col.assigned_to ?? null, validUserIds, defaultAssignee);
    if (assigneeId != null && assigneeId === (col.assigned_to ?? null)) nAssignMatched++;
    else if (assigneeId != null) nAssignDefault++;
    else nAssignSkipped++;

    const c = collectionToCard(col, customer, stageIdByKey, firstStageKey, assigneeId);
    const cr = await q(
      `INSERT INTO pipeline_cards (mitra_id, pipeline_id, stage_id, title, assignee_id, priority, position, created_by, created_at, stage_entered_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [MITRA_ID, pipelineId, c.stageId, c.title, c.assigneeId, c.priority, c.createdBy ?? SYSTEM_USER, c.createdAt, c.stageEnteredAt],
    );
    const cardId = (cr as any).insertId as number;
    nCards++;

    for (const v of collectionToFieldValues(col, customer)) {
      const fid = fieldIdByKey[v.fieldKey];
      if (!fid) continue;
      await q(
        `INSERT INTO pipeline_card_values (mitra_id, card_id, field_id, value, created_at) VALUES (?, ?, ?, ?, ?)`,
        [MITRA_ID, cardId, fid, v.value, nowIso()],
      );
      nValues++;
      if (v.fieldKey === "coordinate") nCoord++;
    }

    // Multi-assignee field value (JSON array of valid user ids).
    const assigneeRows = await q(
      `SELECT user_id FROM collection_assignees WHERE mitra_id = ? AND collection_id = ?`,
      [MITRA_ID, col.id],
    );
    const multiIds = resolveMultiAssignees(assigneeRows as { user_id: number }[], validUserIds);
    if (multiIds.length) {
      await q(
        `INSERT INTO pipeline_card_values (mitra_id, card_id, field_id, value, created_at) VALUES (?, ?, ?, ?, ?)`,
        [MITRA_ID, cardId, fieldIdByKey["assignees"], JSON.stringify(multiIds), nowIso()],
      );
      nValues++; nMulti++;
    }

    const acts = (await q(
      `SELECT * FROM collection_activities WHERE collection_id = ? ORDER BY id ASC`,
      [col.id],
    )) as CollectionActivityRow[];
    for (const a of acts) {
      if (classifyCollectionActivity(a.type) === "comment") {
        const cm = collectionActivityToComment(a);
        let photoPath: string | null = null;
        if (a.photo_data) {
          try {
            photoPath = await saveBase64Photo(slug, "collections", a.id, a.photo_data);
            nPhotos++;
          } catch {
            nPhotoFailed++;
          }
        }
        await q(
          `INSERT INTO pipeline_card_comments (mitra_id, card_id, author_id, body, photo_path, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [MITRA_ID, cardId, cm.authorId ?? SYSTEM_USER, cm.body, photoPath, cm.createdAt],
        );
        nComments++;
      } else {
        const av = collectionActivityToActivity(a);
        await q(
          `INSERT INTO pipeline_card_activity (mitra_id, card_id, actor_id, type, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [MITRA_ID, cardId, av.actorId ?? SYSTEM_USER, av.type, av.detail, av.createdAt],
        );
        nActivity++;
      }
    }
  }

  console.log(
    `[done] pipeline ${pipelineId} "${PIPELINE_NAME}": ` +
      `${nCards} cards, ${nValues} field-values (${nMulti} multi-assignee, ${nCoord} coordinates), ` +
      `${nComments} comments (${nPhotos} photos written, ${nPhotoFailed} failed), ${nActivity} activity rows; ` +
      `assignees: ${nAssignMatched} matched, ${nAssignDefault} default, ${nAssignSkipped} unassigned.`,
  );
}

main()
  .then(() => pool.end())
  .catch(async (e) => {
    console.error("[error]", e);
    await pool.end();
    process.exit(1);
  });
```

- [ ] **Step 2: Verify it parses via the bundle step (no DB needed)**

Run: `npx esbuild tools/import-collections-to-pipeline.ts --bundle --platform=node --format=esm --target=node22 --external:mysql2 --outfile=/tmp/import-collections.mjs`
Expected: bundle succeeds, prints output size, no type/parse errors.

- [ ] **Step 3: Verify --help works on the bundle**

Run: `node /tmp/import-collections.mjs --help`
Expected: prints usage text and exits 0 (no DB connection attempted because `--help` short-circuits before pool creation).

- [ ] **Step 4: Commit**

```bash
git add tools/import-collections-to-pipeline.ts
git commit -m "feat(pipelines): collections->pipeline import runner (--reset/--default-assignee)"
```

---

### Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the module tests**

Run: `npx tsx --test tools/collectionsToPipeline.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck the app (tools/ is outside tsconfig but uploads.ts change is in-scope)**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Confirm the bundle still compiles end-to-end**

Run: `npx esbuild tools/import-collections-to-pipeline.ts --bundle --platform=node --format=esm --target=node22 --external:mysql2 --outfile=/tmp/import-collections.mjs && node /tmp/import-collections.mjs --help`
Expected: bundle OK + usage prints.

---

## Self-Review

- **Spec coverage:** uploads `collections` feature → Task 1. Pure module (stages+fallback, fields incl. user-multiple, card, field-values, multi-assignee, classify, comment/activity) → Task 2. Runner (replicate stages, JOIN customers, fields with config, cards, multi-assignee value, comments+photos, activity, tallies, --reset/--default-assignee/--help) → Task 3. All spec sections covered.
- **Placeholders:** none — full code in every code step.
- **Type consistency:** `CollectionRow`/`CustomerLite`/`CollectionStageRow`/`CollectionActivityRow`/`StageDef`/`FieldDef`/`CardDraft` defined in Task 2 and consumed with matching shapes in Task 3. `collectionToCard(col, customer, stageIdByKey, firstStageKey, assigneeId)` signature matches both test (Task 2) and runner (Task 3). `saveBase64Photo(slug, feature, idHint, dataUrl)` matches `server/uploads.ts`. `resolveAssignee` re-exported from `leadsToPipeline.js`.

## Run on prod (after merge + user push + deploy)

Bundle locally → scp → run with node on the box (deploy branch strips `tools/*.ts`; tsx esbuild binary missing; remote MySQL denied):

```bash
# LOCAL
npx esbuild tools/import-collections-to-pipeline.ts --bundle --platform=node --format=esm \
  --target=node22 --external:mysql2 --outfile=/tmp/import-collections.mjs
sshpass -P passphrase -p 'Zero1902!' scp -i ~/.ssh/access-jabnet-cpanel \
  /tmp/import-collections.mjs jabnet@103.194.47.165:~/repositories/fiber-jabnet/import-collections.mjs
# ON BOX
source ~/nodevenv/repositories/fiber-jabnet/22/bin/activate && cd ~/repositories/fiber-jabnet
DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=jabnet_crm_user DB_PASSWORD='Galon@12345' DB_NAME=jabnet_fiber \
  JABNET_PRIVATE_ROOT=/home/jabnet/private/fiber-jabnet node import-collections.mjs
rm ~/repositories/fiber-jabnet/import-collections.mjs
```
