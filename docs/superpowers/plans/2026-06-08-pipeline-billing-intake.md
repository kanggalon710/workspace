# Billing-sourced Auto-create for Custom Pipelines - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `billing_sync` pipeline-automation trigger that, after each billing sync, creates cards in a chosen custom pipeline for customers matching a billing filter (mapping customer/billing attributes → custom fields) and auto-resolves cards whose customer no longer matches.

**Architecture:** A shared pure module holds the attribute catalog + match/map/title helpers (testable, no DB). Schema adds `source_customer_id`/`source_rule_id` to `pipeline_cards` for dedup. A server runner (called from `billing-sync-worker` after sync) loads enabled `billing_sync` rules and reconciles cards. Routes validate the new `triggerConfig`; `PipelineRulesDialog` gets a billing_sync editor.

**Tech Stack:** TypeScript, Drizzle (MySQL), `node:test` via `npx tsx --test`, React + TanStack Query. `.js` import extensions. Migrations: info_schema guard + `ADD COLUMN` (the `p4cColAdds` array).

---

### Task 1: Shared pure module - catalog + match/map/title helpers

**Files:**
- Create: `shared/pipelineBillingIntake.ts`
- Test: `shared/pipelineBillingIntake.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/pipelineBillingIntake.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BILLING_ATTRS,
  FILTER_KEYS,
  attrCompatibleWithFieldType,
  customerMatchesFilter,
  customerToFieldValues,
  customerTitle,
  type IntakeCustomer,
  type BillingFilter,
} from "./pipelineBillingIntake.js";

const cust = (over: Partial<IntakeCustomer> = {}): IntakeCustomer => ({
  id: 42,
  name: "Budi",
  customerId: "052500015",
  phone: "0812",
  email: "b@x.id",
  package: "20Mbps",
  billingPrice: 150000,
  billingStatus: "belum_lunas",
  dueDate: "2026-05-01",
  isolirDate: null,
  address: "Jl. Mawar",
  district: "Cilawu",
  village: "Sukamaju",
  customerType: "rumahan",
  status: "active",
  installDate: "2023-01-01",
  pppoeUsername: "budi",
  ontSerialNumber: "SN1",
  isIsolir: 0,
  lat: -7.2,
  lng: 107.9,
  ...over,
});

test("matches when all set filter keys satisfied; unset keys ignored", () => {
  const f: BillingFilter = { isIsolir: 1, billingStatus: "belum_lunas" };
  assert.equal(customerMatchesFilter(cust({ isIsolir: 1 }), f), true);
  assert.equal(customerMatchesFilter(cust({ isIsolir: 0 }), f), false);
  assert.equal(customerMatchesFilter(cust({ isIsolir: 1, billingStatus: "lunas" }), f), false);
  assert.equal(customerMatchesFilter(cust({ isIsolir: 1 }), {}), true); // empty filter = match all
});

test("string filters are case-insensitive and trimmed", () => {
  assert.equal(customerMatchesFilter(cust({ customerType: "Rumahan" }), { customerType: "rumahan" }), true);
  assert.equal(customerMatchesFilter(cust({ status: "active" }), { status: "ACTIVE " }), true);
});

test("field values: omit empty, stringify numbers, coordinate from lat/lng", () => {
  const vals = customerToFieldValues(cust(), [
    { attr: "billingPrice", targetFieldId: 1 },
    { attr: "phone", targetFieldId: 2 },
    { attr: "coordinate", targetFieldId: 3 },
    { attr: "isolirDate", targetFieldId: 4 }, // null -> omitted
  ]);
  const map = Object.fromEntries(vals.map((v) => [v.fieldId, v.value]));
  assert.equal(map[1], "150000");
  assert.equal(map[2], "0812");
  assert.equal(map[3], JSON.stringify({ lat: -7.2, lng: 107.9 }));
  assert.equal(map[4], undefined);
});

test("coordinate omitted when lat/lng missing", () => {
  const vals = customerToFieldValues(cust({ lat: null, lng: null }), [{ attr: "coordinate", targetFieldId: 3 }]);
  assert.equal(vals.length, 0);
});

test("title falls back name -> customer_id -> placeholder", () => {
  assert.equal(customerTitle(cust(), "name"), "Budi");
  assert.equal(customerTitle(cust({ name: "" }), "name"), "052500015");
  assert.equal(customerTitle(cust({ name: "", customerId: "" }), "name"), "Pelanggan #42");
  assert.equal(customerTitle(cust(), "package"), "20Mbps");
});

test("attr/field-type compatibility", () => {
  assert.equal(attrCompatibleWithFieldType("billingPrice", "number"), true);
  assert.equal(attrCompatibleWithFieldType("billingPrice", "text"), false);
  assert.equal(attrCompatibleWithFieldType("coordinate", "coordinate"), true);
  assert.equal(attrCompatibleWithFieldType("phone", "phone"), true);
  assert.equal(attrCompatibleWithFieldType("name", "text"), true);
});

test("catalogs are exported and sane", () => {
  assert.ok(BILLING_ATTRS.some((a) => a.key === "coordinate"));
  assert.deepEqual([...FILTER_KEYS].sort(), ["billingStatus", "customerType", "isIsolir", "status"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/pipelineBillingIntake.test.ts`
Expected: FAIL - cannot find module `./pipelineBillingIntake.js`.

- [ ] **Step 3: Write the module**

Create `shared/pipelineBillingIntake.ts`:

```ts
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
}

export const FILTER_KEYS = ["customerType", "status", "isIsolir", "billingStatus"] as const;

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
  { key: "dueDate", label: "Jatuh Tempo", fieldTypes: TEXTISH },
  { key: "isolirDate", label: "Tgl Isolir", fieldTypes: TEXTISH },
  { key: "address", label: "Alamat", fieldTypes: TEXTISH },
  { key: "district", label: "Kecamatan", fieldTypes: TEXTISH },
  { key: "village", label: "Desa/Kelurahan", fieldTypes: TEXTISH },
  { key: "customerType", label: "Jenis Pelanggan", fieldTypes: TEXTISH },
  { key: "status", label: "Status Pelanggan", fieldTypes: TEXTISH },
  { key: "installDate", label: "Tgl Instalasi", fieldTypes: TEXTISH },
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

function ieq(a: string | null | undefined, b: string | null | undefined): boolean {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

export function customerMatchesFilter(c: IntakeCustomer, filter: BillingFilter): boolean {
  if (filter.customerType != null && filter.customerType !== "" && !ieq(c.customerType, filter.customerType)) return false;
  if (filter.status != null && filter.status !== "" && !ieq(c.status, filter.status)) return false;
  if (filter.billingStatus != null && filter.billingStatus !== "" && !ieq(c.billingStatus, filter.billingStatus)) return false;
  if (filter.isIsolir === 0 || filter.isIsolir === 1) {
    if (Number(c.isIsolir ?? 0) !== filter.isIsolir) return false;
  }
  return true;
}

export function customerToFieldValues(
  c: IntakeCustomer,
  fieldMap: { attr: string; targetFieldId: number }[],
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
    const value = String(raw).trim();
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/pipelineBillingIntake.test.ts`
Expected: PASS - all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/pipelineBillingIntake.ts shared/pipelineBillingIntake.test.ts
git commit -m "feat(pipelines): pure billing-intake catalog + match/map/title helpers"
```

---

### Task 2: Schema - card source columns + createCard passthrough

**Files:**
- Modify: `shared/schema.ts` (pipelineCards table)
- Modify: `server/storage.ts` (p4cColAdds migration + createCard)

- [ ] **Step 1: Add columns to the schema**

In `shared/schema.ts`, in the `pipelineCards` table definition, add after the `stageEnteredAt` (or any existing nullable) column - add these two lines among the column defs:

```ts
  sourceCustomerId: int("source_customer_id"),
  sourceRuleId: int("source_rule_id"),
```

(Place them before the closing `}, (t) => ({` of `pipelineCards`. If `pipelineCards` has no index callback, just before the closing `});`.)

- [ ] **Step 2: Add idempotent migration**

In `server/storage.ts`, find the `p4cColAdds` array and add two entries:

```ts
      { table: "pipeline_cards", column: "source_customer_id", ddl: "INT NULL" },
      { table: "pipeline_cards", column: "source_rule_id", ddl: "INT NULL" },
```

- [ ] **Step 3: Extend createCard to accept the source link**

In `server/storage.ts`, change the `createCard` signature + insert. Replace:

```ts
  async createCard(pipelineId: number, data: { stageId: number; title: string; description?: string; assigneeId?: number | null; priority?: string; dueDate?: string | null; tags?: string[] | null; }, userId: number): Promise<PipelineCard> {
```
with:
```ts
  async createCard(pipelineId: number, data: { stageId: number; title: string; description?: string; assigneeId?: number | null; priority?: string; dueDate?: string | null; tags?: string[] | null; sourceCustomerId?: number | null; sourceRuleId?: number | null; }, userId: number): Promise<PipelineCard> {
```
and in the `.values({ ... })` object inside it, add these two properties (after `tags: ...`):
```ts
      sourceCustomerId: data.sourceCustomerId ?? null,
      sourceRuleId: data.sourceRuleId ?? null,
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(pipelines): pipeline_cards source_customer_id/source_rule_id + createCard passthrough"
```

---

### Task 3: Storage - list billing_sync rules + source-linked cards

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Add two query methods**

In `server/storage.ts`, near `listRules` (around line 2250), add:

```ts
  /** Enabled billing_sync rules for the current tenant. */
  async listBillingSyncRules(): Promise<PipelineRule[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineRules)
      .where(and(eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.triggerType, "billing_sync"), eq(pipelineRules.enabled, 1)));
  }

  /** Cards previously created by a billing_sync rule (any stage), for dedup + resolve. */
  async getSourceCardsForRule(ruleId: number): Promise<PipelineCard[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineCards)
      .where(and(eq(pipelineCards.mitraId, mitraId), eq(pipelineCards.sourceRuleId, ruleId)));
  }
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors (PipelineRule/PipelineCard already imported in storage.ts).

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): storage queries for billing_sync rules + source cards"
```

---

### Task 4: Runner + wire into billing-sync-worker

**Files:**
- Create: `server/pipeline-billing-intake.ts`
- Modify: `server/billing-sync-worker.ts`

- [ ] **Step 1: Write the runner**

Create `server/pipeline-billing-intake.ts`:

```ts
import { storage } from "./storage.js";
import {
  customerMatchesFilter,
  customerToFieldValues,
  customerTitle,
  type IntakeCustomer,
  type BillingFilter,
} from "../shared/pipelineBillingIntake.js";

interface IntakeConfig {
  filter: BillingFilter;
  resolveStageId: number | null;
  titleSource: string;
  fieldMap: { attr: string; targetFieldId: number }[];
}

function parseConfig(raw: string | null): IntakeConfig | null {
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    if (!c || typeof c !== "object") return null;
    return {
      filter: (c.filter ?? {}) as BillingFilter,
      resolveStageId: c.resolveStageId != null ? Number(c.resolveStageId) : null,
      titleSource: typeof c.titleSource === "string" && c.titleSource ? c.titleSource : "name",
      fieldMap: Array.isArray(c.fieldMap)
        ? c.fieldMap.filter((m: any) => m && m.attr && m.targetFieldId).map((m: any) => ({ attr: String(m.attr), targetFieldId: Number(m.targetFieldId) }))
        : [],
    };
  } catch { return null; }
}

function toIntakeCustomer(c: any): IntakeCustomer {
  return {
    id: c.id, name: c.name, customerId: c.customerId, phone: c.phone, email: c.email,
    package: c.package, billingPrice: c.billingPrice, billingStatus: c.billingStatus,
    dueDate: c.dueDate, isolirDate: c.isolirDate, address: c.address, district: c.district,
    village: c.village, customerType: c.customerType, status: c.status, installDate: c.installDate,
    pppoeUsername: c.pppoeUsername, ontSerialNumber: c.ontSerialNumber, isIsolir: c.isIsolir,
    lat: c.lat, lng: c.lng,
  };
}

/** Reconcile billing_sync rules for the CURRENT tenant (call inside withMitra).
 * Create a card for each matching customer without an active card; move an active card
 * whose customer no longer matches to the rule's resolve stage. */
export async function runBillingIntakeRules(): Promise<{ created: number; resolved: number }> {
  const result = { created: 0, resolved: 0 };
  const rules = await storage.listBillingSyncRules();
  if (rules.length === 0) return result;

  const users = await storage.getAllUsers();
  const systemUserId = users.length ? users[0].id : 1;
  const customers = (await storage.getCustomers()).map(toIntakeCustomer);

  for (const rule of rules) {
    const cfg = parseConfig((rule as any).triggerConfig);
    if (!cfg) continue;
    const entryStageId = (rule as any).targetStageId as number | null;
    if (!entryStageId) continue;

    const sourceCards = await storage.getSourceCardsForRule(rule.id);
    // Active = not yet in the resolve stage.
    const activeByCustomer = new Map<number, { id: number; stageId: number }>();
    for (const card of sourceCards) {
      const cid = (card as any).sourceCustomerId as number | null;
      if (cid == null) continue;
      if (cfg.resolveStageId != null && card.stageId === cfg.resolveStageId) continue;
      activeByCustomer.set(cid, { id: card.id, stageId: card.stageId });
    }

    for (const c of customers) {
      const matches = customerMatchesFilter(c, cfg.filter);
      const active = activeByCustomer.get(c.id);
      if (matches && !active) {
        const card = await storage.createCard((rule as any).pipelineId, {
          stageId: entryStageId,
          title: customerTitle(c, cfg.titleSource),
          sourceCustomerId: c.id,
          sourceRuleId: rule.id,
        }, systemUserId);
        const values = customerToFieldValues(c, cfg.fieldMap);
        if (values.length) await storage.setCardValues(card.id, values);
        result.created++;
      } else if (!matches && active && cfg.resolveStageId != null) {
        await storage.moveCard(active.id, cfg.resolveStageId, undefined, systemUserId);
        result.resolved++;
      }
    }
  }
  return result;
}
```

- [ ] **Step 2: Wire it into the worker**

In `server/billing-sync-worker.ts`, add the import near the other imports at the top:

```ts
import { runBillingIntakeRules } from "./pipeline-billing-intake.js";
```

Then in `_runOnceInner`, right AFTER the `reconcileCollectionState()` call block (around line 311), add:

```ts
        try {
          const intake = await runBillingIntakeRules();
          (stats.transitions as any).pipeline_intake_created = intake.created;
          (stats.transitions as any).pipeline_intake_resolved = intake.resolved;
          if (intake.created || intake.resolved) {
            console.log(`[BillingSyncWorker] → pipeline billing-intake: ${intake.created} created, ${intake.resolved} resolved`);
          }
        } catch (e: any) {
          console.error(`[BillingSyncWorker] billing-intake error:`, e.message);
        }
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add server/pipeline-billing-intake.ts server/billing-sync-worker.ts
git commit -m "feat(pipelines): billing-intake runner (create + auto-resolve) wired into sync worker"
```

---

### Task 5: Routes - validate billing_sync triggerConfig

**Files:**
- Modify: `server/routes.ts` (`validateTriggerConfig`)

- [ ] **Step 1: Add the billing_sync branch**

In `server/routes.ts`, inside `validateTriggerConfig`, the current code returns `"triggerType tidak dikenal"` for anything other than `stage_enter`/`time`. Add a `billing_sync` branch BEFORE the `if (triggerType !== "time")` line. Insert:

```ts
  if (triggerType === "billing_sync") {
    const c = triggerConfig;
    if (!c || typeof c !== "object") return "triggerConfig wajib untuk trigger billing";
    const filter = c.filter ?? {};
    const allowed = new Set(["customerType", "status", "isIsolir", "billingStatus"]);
    for (const k of Object.keys(filter)) {
      if (!allowed.has(k)) return `filter key tidak dikenal: ${k}`;
    }
    if (filter.isIsolir != null && filter.isIsolir !== 0 && filter.isIsolir !== 1) return "filter.isIsolir harus 0/1";
    if (c.resolveStageId != null && !stageIds.has(Number(c.resolveStageId))) return "resolveStageId bukan stage pipeline ini";
    const fields = await storage.listFields(pipelineId);
    const fieldById = new Map(fields.map((f) => [f.id, f]));
    const titleAllowed = new Set(BILLING_ATTRS.filter((a) => a.key !== "coordinate").map((a) => a.key));
    if (c.titleSource != null && !titleAllowed.has(String(c.titleSource))) return "titleSource tidak valid";
    if (c.fieldMap != null) {
      if (!Array.isArray(c.fieldMap)) return "fieldMap harus array";
      for (const m of c.fieldMap) {
        const f = fieldById.get(Number(m?.targetFieldId));
        if (!f) return "fieldMap.targetFieldId tidak ditemukan di pipeline ini";
        if (!attrCompatibleWithFieldType(String(m?.attr), f.type)) return `atribut '${m?.attr}' tak cocok dengan tipe field '${f.type}'`;
      }
    }
    if (triggerStageId != null && !stageIds.has(Number(triggerStageId))) return "batasan stage tidak valid";
    return null;
  }
```

- [ ] **Step 2: Add the import**

At the top of `server/routes.ts`, add to the imports:

```ts
import { BILLING_ATTRS, attrCompatibleWithFieldType } from "../shared/pipelineBillingIntake.js";
```

(If routes.ts imports from `@shared/...` alias elsewhere, match that style; otherwise the relative `../shared/...` path is correct for the esbuild bundle.)

- [ ] **Step 3: Allow billing_sync in the rule trigger type**

In `server/routes.ts`, find where rule create/update reads `triggerType` (the rule POST/PATCH handlers near the rules routes). They already pass `triggerType` through to `storage.createRule`/`updateRule` and call `validateTriggerConfig`. Confirm no enum whitelist blocks `billing_sync`; if there is a hardcoded check like `["stage_enter","time"].includes(...)`, add `"billing_sync"`. (Search: `grep -n "stage_enter" server/routes.ts`.) If `RuleTriggerType` in `shared/schema.ts` is a union, add `"billing_sync"` to it.

- [ ] **Step 4: Verify typecheck + build**

Run: `grep -n "RuleTriggerType" shared/schema.ts` then ensure `"billing_sync"` is in the union if one exists.
Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts shared/schema.ts
git commit -m "feat(pipelines): validate billing_sync triggerConfig"
```

---

### Task 6: Frontend - billing_sync editor in PipelineRulesDialog

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`
- (Maybe) Modify: `client/components/pipelines/ruleFormState.ts`

**Context:** The dialog already supports trigger types `stage_enter` and `time` with conditional sub-forms. Add a third option **"Saat sync billing"** (`billing_sync`). Read the existing file first to mirror its form-state + payload patterns. The billing_sync rule payload sent to `POST/PATCH /api/pipelines/:id/rules` must be:

```ts
{
  name,
  triggerType: "billing_sync",
  actionType: "create_card",
  targetStageId: <entry stage id>,
  triggerConfig: {
    filter: { customerType?, status?, isIsolir?: 0|1, billingStatus? },  // omit empty keys
    resolveStageId: <stage id | null>,
    titleSource: "name",
    fieldMap: [ { attr, targetFieldId }, ... ],
  },
}
```

- [ ] **Step 1: Add the trigger option + state**

In `PipelineRulesDialog.tsx`, add `"billing_sync"` to the trigger-type selector options (label "Saat sync billing"). Add component state for the billing config:

```tsx
const [biFilter, setBiFilter] = useState<{ customerType: string; status: string; isIsolir: string; billingStatus: string }>(
  { customerType: "", status: "", isIsolir: "", billingStatus: "" },
);
const [biEntryStageId, setBiEntryStageId] = useState<number | null>(null);
const [biResolveStageId, setBiResolveStageId] = useState<number | null>(null);
const [biTitleSource, setBiTitleSource] = useState<string>("name");
const [biFieldMap, setBiFieldMap] = useState<{ attr: string; targetFieldId: number }[]>([]);
```

- [ ] **Step 2: Render the billing_sync sub-form when selected**

Import the catalog: `import { BILLING_ATTRS, attrCompatibleWithFieldType } from "@shared/pipelineBillingIntake";`
Render (only when `triggerType === "billing_sync"`):

```tsx
{triggerType === "billing_sync" && (
  <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs">Jenis Pelanggan
        <input className="..." value={biFilter.customerType} placeholder="rumahan (kosong=abaikan)"
          onChange={(e) => setBiFilter({ ...biFilter, customerType: e.target.value })} />
      </label>
      <label className="text-xs">Status Pelanggan
        <input className="..." value={biFilter.status} placeholder="aktif (kosong=abaikan)"
          onChange={(e) => setBiFilter({ ...biFilter, status: e.target.value })} />
      </label>
      <label className="text-xs">Isolir
        <select className="..." value={biFilter.isIsolir} onChange={(e) => setBiFilter({ ...biFilter, isIsolir: e.target.value })}>
          <option value="">Abaikan</option><option value="1">Ya</option><option value="0">Tidak</option>
        </select>
      </label>
      <label className="text-xs">Status Billing
        <input className="..." value={biFilter.billingStatus} placeholder="belum_lunas (kosong=abaikan)"
          onChange={(e) => setBiFilter({ ...biFilter, billingStatus: e.target.value })} />
      </label>
    </div>
    {/* entry stage */}
    <StageSelect label="Stage masuk" value={biEntryStageId} onChange={setBiEntryStageId} stages={stages} />
    {/* resolve stage */}
    <StageSelect label="Stage saat selesai (resolve)" value={biResolveStageId} onChange={setBiResolveStageId} stages={stages} allowNone />
    {/* title source */}
    <label className="text-xs">Judul kartu dari
      <select value={biTitleSource} onChange={(e) => setBiTitleSource(e.target.value)}>
        {BILLING_ATTRS.filter((a) => a.key !== "coordinate").map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
      </select>
    </label>
    {/* field map editor */}
    <FieldMapEditor map={biFieldMap} onChange={setBiFieldMap} fields={fields} />
  </div>
)}
```

Use the dialog's existing styling classes (copy from the time/stage_enter sub-forms). `StageSelect` / `FieldMapEditor` here are illustrative - implement them inline using the same select markup already used in the dialog for stage pickers and the existing field-map rows. `FieldMapEditor` renders rows of: a **billing attribute** select (`BILLING_ATTRS`) + a **target field** select (only fields where `attrCompatibleWithFieldType(attr, field.type)`), plus add/remove-row buttons - mirror the existing create_card field-map editor in this dialog.

- [ ] **Step 3: Build the payload on save**

When `triggerType === "billing_sync"`, construct the rule payload:

```tsx
const filter: any = {};
if (biFilter.customerType.trim()) filter.customerType = biFilter.customerType.trim();
if (biFilter.status.trim()) filter.status = biFilter.status.trim();
if (biFilter.billingStatus.trim()) filter.billingStatus = biFilter.billingStatus.trim();
if (biFilter.isIsolir === "0" || biFilter.isIsolir === "1") filter.isIsolir = Number(biFilter.isIsolir);

const payload = {
  name,
  triggerType: "billing_sync",
  actionType: "create_card",
  targetStageId: biEntryStageId,
  triggerConfig: {
    filter,
    resolveStageId: biResolveStageId,
    titleSource: biTitleSource,
    fieldMap: biFieldMap.filter((m) => m.attr && m.targetFieldId),
  },
};
```

Send via the existing rule create/update mutation. When loading an existing billing_sync rule for edit, hydrate the state from `rule.triggerConfig` + `rule.targetStageId`.

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: success (the new bundle includes the dialog changes).

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx client/components/pipelines/ruleFormState.ts
git commit -m "feat(pipelines): billing_sync rule editor in PipelineRulesDialog"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the pure tests**

Run: `npx tsx --test shared/pipelineBillingIntake.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 3: Confirm no stray references**

Run: `grep -rn "billing_sync" server/ shared/ client/ | wc -l`
Expected: > 0 (trigger type wired across schema/routes/runner/frontend).

---

## Self-Review

- **Spec coverage:** trigger filter (customerType/status/isIsolir/billingStatus) → Task 1 helper + Task 5 validation + Task 6 UI. Schema source columns → Task 2. Dedup/active-card → Task 4 runner (`activeByCustomer`, skip resolve stage). Create + auto-resolve → Task 4. Fixed mapping catalog + type-compat → Task 1 (`BILLING_ATTRS`, `attrCompatibleWithFieldType`), enforced Task 5, edited Task 6. Execution after sync (incl. manual Sync Now) → Task 4 worker hook in `_runOnceInner`. Routes validation → Task 5. UI → Task 6. Testing → Task 1 + Task 7. All spec sections covered.
- **Placeholders:** Tasks 1-5 + 7 contain complete code. Task 6 (a 548-line existing component) gives concrete state/JSX/payload code and instructs mirroring existing sub-form patterns by reading the file - appropriate for integrating into a large existing component rather than reproducing it wholesale.
- **Type consistency:** `IntakeCustomer`, `BillingFilter`, `BILLING_ATTRS`, `customerMatchesFilter`, `customerToFieldValues`, `customerTitle`, `attrCompatibleWithFieldType` defined in Task 1 and consumed identically in Tasks 4-6. `createCard` gains `sourceCustomerId`/`sourceRuleId` in Task 2 and is called with them in Task 4. `listBillingSyncRules`/`getSourceCardsForRule` defined in Task 3 and used in Task 4. `triggerConfig` shape `{filter, resolveStageId, titleSource, fieldMap}` consistent across Tasks 4 (parse), 5 (validate), 6 (build).

## Deploy note
Schema migration (`source_customer_id`/`source_rule_id`) runs automatically on startup via `p4cColAdds` - no manual SQL. On prod, `WORKERS_ENABLED=false`, so intake runs on each manual **"Sync Now"** (same as collections auto-open today).
