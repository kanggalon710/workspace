# LP1 - Lead Event Bus + Lead Intake - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lead baru/berubah dari sumber mana pun otomatis membuat/memperbarui/membuka-lagi card di `/pipelines` lewat rule lead-trigger, event-driven & tenant-scoped, tanpa mengubah modul `/leads`.

**Architecture:** Klon pola `billing_sync` (intake service + pure helper + sub-form rule) tapi **event-driven**: 8 titik mutasi lead memanggil `emitLeadEvent()` → `runLeadIntake()` memuat rule lead-trigger tenant, memfilter source, mengecek dedup (`lead_card_links`/phone), lalu create/update/reopen card + field-map + catat link + audit. Engine tetap card-centric; lead hanya memicu.

**Tech Stack:** TypeScript, Express 5, Drizzle ORM (MySQL/mysql2), React 18 + TanStack Query + shadcn/ui, `node:test` via `npx tsx --test`. Spec: `docs/superpowers/specs/2026-06-14-leads-pipeline-integration-lp1-design.md`.

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `shared/leadSources.ts` (create) | Registry source kanonik (normalisasi alias + label/options). Pure. |
| `shared/leadSources.test.ts` (create) | Test registry. |
| `shared/leadIntake.ts` (create) | Pure helper intake lead: `IntakeLead`, `LEAD_ATTRS`, `leadTitle`, `leadToFieldValues`, `parseLeadTriggerConfig`, `resolveDuplicateAction`, `leadRuleMatchesSource`, `attrCompatibleWithFieldType`. |
| `shared/leadIntake.test.ts` (create) | Test helper. |
| `shared/schema.ts` (modify) | `RuleTriggerType` += 5 tipe lead; tabel `leadCardLinks` + tipe. |
| `server/storage.ts` (modify) | Startup CREATE TABLE `lead_card_links`; `listLeadRules`, `getLeadCardLinks`, `createLeadCardLink`, `findCardIdsByFieldValue`. |
| `server/lead-intake.ts` (create) | `runLeadIntake(eventType, lead, actorId)` - orchestrator. |
| `server/lead-events.ts` (create) | `emitLeadEvent(eventType, lead, actorId)` - wrap `withMitra` + best-effort. |
| `server/routes.ts` (modify) | 8 titik emit; `validateTriggerConfig` cabang lead; persist `triggerConfig` + exception "tanpa action" utk lead. |
| `client/components/pipelines/ruleFormState.ts` (modify) | Draft state + `ruleToDraft`/`draftToPayload` cabang lead. |
| `client/components/pipelines/PipelineRulesDialog.tsx` (modify) | Sub-form trigger "Lead masuk/berubah". |
| `client/pages/LeadPipelinePage.tsx` (modify) | DRY: `SOURCE_LABELS` → `shared/leadSources`. |

---

## Task 1: Registry source kanonik (`shared/leadSources.ts`)

**Files:**
- Create: `shared/leadSources.ts`
- Test: `shared/leadSources.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/leadSources.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalLeadSource, LEAD_SOURCE_LABELS, LEAD_SOURCE_OPTIONS } from "./leadSources.ts";

test("normalizes known aliases to canonical", () => {
  assert.equal(canonicalLeadSource("landing_page"), "coverage_check");
  assert.equal(canonicalLeadSource("meta_ads"), "meta_leads");
  assert.equal(canonicalLeadSource("tiktok_ads"), "tiktok_leads");
  assert.equal(canonicalLeadSource("canvassing"), "canvassing");
  assert.equal(canonicalLeadSource("prospect_finder"), "prospect_finder");
});

test("is case/space insensitive and falls back to 'other'", () => {
  assert.equal(canonicalLeadSource("  Meta_Ads "), "meta_leads");
  assert.equal(canonicalLeadSource("unknown_xyz"), "other");
  assert.equal(canonicalLeadSource(null), "other");
  assert.equal(canonicalLeadSource(undefined), "other");
});

test("every canonical source has a label and appears in options", () => {
  for (const opt of LEAD_SOURCE_OPTIONS) {
    assert.equal(typeof LEAD_SOURCE_LABELS[opt.value], "string");
    assert.ok(LEAD_SOURCE_LABELS[opt.value].length > 0);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/leadSources.test.ts`
Expected: FAIL - `Cannot find module './leadSources.ts'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// shared/leadSources.ts
/** Canonical lead-source registry. Single source of truth for normalisasi + label.
 * Tidak mengubah nilai `source` yang tersimpan - hanya dipakai saat matching rule + label UI. */

export type CanonicalLeadSource =
 | "canvassing" | "prospect_finder" | "coverage_check"
 | "meta_leads" | "tiktok_leads" | "referral" | "inbound" | "other";

/** Alias mentah (lowercased) → kanonik. Mencakup nilai yang BENAR-BENAR ditulis kode hari ini
 * (landing_page, meta_ads, tiktok_ads) plus variasi wajar. */
const ALIASES: Record<string, CanonicalLeadSource> = {
  canvassing: "canvassing",
  prospect_finder: "prospect_finder", finder: "prospect_finder",
  coverage_check: "coverage_check", landing_page: "coverage_check", landing: "coverage_check",
  meta_leads: "meta_leads", meta_ads: "meta_leads", meta: "meta_leads", facebook: "meta_leads",
  tiktok_leads: "tiktok_leads", tiktok_ads: "tiktok_leads", tiktok: "tiktok_leads",
  referral: "referral",
  inbound: "inbound",
};

export function canonicalLeadSource(raw: string | null | undefined): CanonicalLeadSource {
  return ALIASES[String(raw ?? "").trim().toLowerCase()] ?? "other";
}

export const LEAD_SOURCE_LABELS: Record<CanonicalLeadSource, string> = {
  canvassing: "Canvassing",
  prospect_finder: "Prospect Finder",
  coverage_check: "Coverage Check",
  meta_leads: "Meta Lead Ads",
  tiktok_leads: "TikTok Lead Ads",
  referral: "Referral",
  inbound: "Inbound",
  other: "Lainnya",
};

/** Opsi untuk filter source di sub-form rule. */
export const LEAD_SOURCE_OPTIONS: { value: CanonicalLeadSource; label: string }[] =
  (Object.keys(LEAD_SOURCE_LABELS) as CanonicalLeadSource[]).map((value) => ({ value, label: LEAD_SOURCE_LABELS[value] }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/leadSources.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/leadSources.ts shared/leadSources.test.ts
git commit -m "feat(leads): canonical lead-source registry (LP1 task 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pure intake helper (`shared/leadIntake.ts`)

**Files:**
- Create: `shared/leadIntake.ts`
- Test: `shared/leadIntake.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/leadIntake.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leadTitle, leadToFieldValues, parseLeadTriggerConfig,
  resolveDuplicateAction, leadRuleMatchesSource, type IntakeLead,
} from "./leadIntake.ts";

const lead: IntakeLead = {
  id: 7, mitraId: 1, name: "Budi", phone: "08123", address: "Jl. A", category: "rumahan",
  notes: "n", source: "meta_ads", lat: -7.1, lng: 107.9, distanceMeters: 120,
  district: "Cilawu", village: "Desa X", stage: "new", priority: "medium", assignedTo: 4, odpId: 9,
};

test("leadTitle uses titleSource, falls back to name then #id", () => {
  assert.equal(leadTitle(lead, "name"), "Budi");
  assert.equal(leadTitle({ ...lead, name: "" }, "name"), "Lead #7");
  assert.equal(leadTitle(lead, "phone"), "08123");
});

test("leadToFieldValues maps attrs, skips empty, handles coordinate + odp name", () => {
  const out = leadToFieldValues(
    lead,
    [
      { attr: "phone", targetFieldId: 30 },
      { attr: "coordinate", targetFieldId: 31 },
      { attr: "odpId", targetFieldId: 32 },
      { attr: "notes", targetFieldId: 33 },
    ],
    { 31: "coordinate" },
    { 9: "ODP-CLW-001" },
  );
  assert.deepEqual(out, [
    { fieldId: 30, value: "08123" },
    { fieldId: 31, value: JSON.stringify({ lat: -7.1, lng: 107.9 }) },
    { fieldId: 32, value: "ODP-CLW-001" },
    { fieldId: 33, value: "n" },
  ]);
});

test("resolveDuplicateAction maps mode + existence", () => {
  assert.equal(resolveDuplicateAction("create", true), "create");
  assert.equal(resolveDuplicateAction("ignore", true), "skip");
  assert.equal(resolveDuplicateAction("ignore", false), "create");
  assert.equal(resolveDuplicateAction("update", true), "update");
  assert.equal(resolveDuplicateAction("update", false), "create");
  assert.equal(resolveDuplicateAction("reopen", true), "reopen");
  assert.equal(resolveDuplicateAction("reopen", false), "create");
});

test("leadRuleMatchesSource: empty list = match all; else canonical match", () => {
  assert.equal(leadRuleMatchesSource([], "meta_ads"), true);
  assert.equal(leadRuleMatchesSource(["meta_leads"], "meta_ads"), true); // alias normalised
  assert.equal(leadRuleMatchesSource(["coverage_check"], "meta_ads"), false);
});

test("parseLeadTriggerConfig defaults + validation", () => {
  assert.equal(parseLeadTriggerConfig(null), null);
  const c = parseLeadTriggerConfig(JSON.stringify({ entryStageId: 5 }));
  assert.deepEqual(c, { sources: [], entryStageId: 5, titleSource: "name", fieldMap: [], onDuplicate: "ignore", dedupBy: "lead_id", reopenStageId: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/leadIntake.test.ts`
Expected: FAIL - module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// shared/leadIntake.ts
/** Pure helpers + catalog untuk lead-trigger pipeline intake. No DB, no I/O.
 * Paralel shared/pipelineBillingIntake.ts. */
import { normalizeDateValue } from "./pipelineBillingIntake.ts";
import { canonicalLeadSource } from "./leadSources.ts";

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
  sources: string[];           // canonical; kosong = semua
  entryStageId: number | null;
  titleSource: string;
  fieldMap: { attr: string; targetFieldId: number }[];
  onDuplicate: DuplicateMode;
  dedupBy: DedupBy;
  reopenStageId: number | null;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/leadIntake.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/leadIntake.ts shared/leadIntake.test.ts
git commit -m "feat(leads): pure lead intake helper (LP1 task 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Schema - lead trigger types + `lead_card_links` table

**Files:**
- Modify: `shared/schema.ts` (`RuleTriggerType` ~line 776; tambah tabel `leadCardLinks` dekat `pipelineRuleFires` ~line 720)

- [ ] **Step 1: Extend `RuleTriggerType`**

Cari (`shared/schema.ts:776`):
```ts
export type RuleTriggerType = "stage_enter" | "time" | "billing_sync" | "card_updated" | "assignee_changed" | "field_updated";
```
Ganti dengan:
```ts
export type RuleTriggerType = "stage_enter" | "time" | "billing_sync" | "card_updated" | "assignee_changed" | "field_updated"
 | "lead_created" | "lead_updated" | "lead_assigned" | "lead_stage_changed" | "lead_converted";
```

- [ ] **Step 2: Add `leadCardLinks` table + types**

Tambah setelah blok `pipelineRuleFires` (sekitar `shared/schema.ts:720-735`). Pastikan `index` & `int`/`text` sudah di-import (sudah dipakai di file ini):
```ts
/** Traceability lead → card. Satu lead bisa menurunkan banyak card (mis. conversion bundle). */
export const leadCardLinks = mysqlTable("lead_card_links", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  leadId: int("lead_id").notNull(),
  cardId: int("card_id").notNull(),
  ruleId: int("rule_id"),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byMitraLead: index("idx_lead_card_links_mitra_lead").on(t.mitraId, t.leadId),
  byCard: index("idx_lead_card_links_card").on(t.cardId),
}));

export type LeadCardLink = typeof leadCardLinks.$inferSelect;
export type InsertLeadCardLink = typeof leadCardLinks.$inferInsert;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors) - table def only, no consumers yet.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(leads): lead trigger types + lead_card_links schema (LP1 task 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Storage - create table + intake queries

**Files:**
- Modify: `server/storage.ts` (startup migration ~after line 700; schema imports ~line 127; methods near `listBillingSyncRules` ~line 2637)

- [ ] **Step 1: Import schema symbols**

Di blok import drizzle tables/types (cari `pipelineRuleFires` di import list), tambahkan `leadCardLinks, type LeadCardLink, type InsertLeadCardLink` ke daftar import dari `@shared/schema` (ikuti gaya import existing di file).

- [ ] **Step 2: Startup CREATE TABLE (mirror chatwoot_agent_links di ~line 689)**

Tambah blok berikut tepat setelah blok `chatwoot_agent_links` (setelah `console.log("[chatwoot-migration] chatwoot_agent_links table ensured");` dan `catch`-nya, sekitar line 703):
```ts
    try {
      await this.pool.execute(`CREATE TABLE IF NOT EXISTS lead_card_links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        mitra_id INT NOT NULL DEFAULT 1,
        lead_id INT NOT NULL,
        card_id INT NOT NULL,
        rule_id INT NULL,
        created_at TEXT NOT NULL,
        KEY idx_lead_card_links_mitra_lead (mitra_id, lead_id),
        KEY idx_lead_card_links_card (card_id)
      )`);
      console.log("[leads-migration] lead_card_links table ensured");
    } catch (err: any) {
      console.warn(`[leads-migration] lead_card_links: ${err.message}`);
    }
```

- [ ] **Step 3: Add intake query methods (after `getSourceCardsForRule`, ~line 2648)**

```ts
  /** Enabled rule dengan triggerType lead tertentu, tenant saat ini. */
  async listLeadRules(triggerType: string): Promise<PipelineRule[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineRules)
      .where(and(eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.triggerType, triggerType as any), eq(pipelineRules.enabled, 1)));
  }

  /** Link lead→card untuk satu lead (tenant-scoped). */
  async getLeadCardLinks(leadId: number): Promise<LeadCardLink[]> {
    const mitraId = getMitraId();
    return this.db.select().from(leadCardLinks)
      .where(and(eq(leadCardLinks.mitraId, mitraId), eq(leadCardLinks.leadId, leadId)));
  }

  async createLeadCardLink(data: { leadId: number; cardId: number; ruleId: number | null }): Promise<void> {
    const mitraId = getMitraId();
    await this.db.insert(leadCardLinks).values({
      mitraId, leadId: data.leadId, cardId: data.cardId, ruleId: data.ruleId,
      createdAt: new Date().toISOString(),
    });
  }

  /** Card id (di pipeline tsb) yang punya value tertentu pada field tertentu - untuk dedup by phone. */
  async findCardIdsByFieldValue(pipelineId: number, fieldId: number, value: string): Promise<number[]> {
    const mitraId = getMitraId();
    const rows: any = (await this.db.execute(sql`
      SELECT v.card_id AS cardId
      FROM pipeline_card_values v
      JOIN pipeline_cards c ON c.id = v.card_id
      WHERE c.mitra_id = ${mitraId} AND c.pipeline_id = ${pipelineId}
        AND v.field_id = ${fieldId} AND v.value = ${value}
    `))[0];
    return (rows as any[]).map((r) => Number(r.cardId));
  }
```

> Catatan: verifikasi nama tabel/kolom value store. Jalankan `grep -n "pipelineCardValues = mysqlTable" shared/schema.ts` lalu cek nama kolom (`card_id`, `field_id`, `value`). Sesuaikan SQL bila berbeda.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts
git commit -m "feat(leads): storage lead_card_links + intake queries (LP1 task 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Intake orchestrator (`server/lead-intake.ts`)

**Files:**
- Create: `server/lead-intake.ts`

> Dijalankan SUDAH di dalam `withMitra(lead.mitraId)` (lihat Task 6), jadi semua `storage.*` auto tenant-scoped.

- [ ] **Step 1: Write the module**

```ts
// server/lead-intake.ts
import { storage } from "./storage.js";
import {
  parseLeadTriggerConfig, leadRuleMatchesSource, resolveDuplicateAction,
  leadToFieldValues, leadTitle, type IntakeLead,
} from "../shared/leadIntake.js";

/** Map eventType lead → triggerType rule. */
const EVENT_TO_TRIGGER: Record<string, string> = {
  created: "lead_created",
  updated: "lead_updated",
  assigned: "lead_assigned",
  stage_changed: "lead_stage_changed",
  converted: "lead_converted",
};

/** Jalankan semua rule lead-trigger yang cocok untuk event ini. Best-effort. */
export async function runLeadIntake(eventType: string, lead: IntakeLead, actorId: number): Promise<void> {
  const triggerType = EVENT_TO_TRIGGER[eventType];
  if (!triggerType) return;
  const rules = await storage.listLeadRules(triggerType);
  if (!rules.length) return;

  for (const rule of rules) {
    try {
      const cfg = parseLeadTriggerConfig((rule as any).triggerConfig);
      if (!cfg || !cfg.entryStageId) continue;
      if (!leadRuleMatchesSource(cfg.sources, lead.source)) continue;

      const pipelineId = (rule as any).pipelineId as number;

      // Field type map (untuk normalisasi date/coordinate).
      const fields = await storage.listFields(pipelineId);
      const fieldTypeById: Record<number, string> = {};
      for (const f of fields) fieldTypeById[f.id] = (f as any).type;

      // ODP name lookup (hanya bila ada map odpId).
      let odpNameById: Record<number, string> | undefined;
      if (cfg.fieldMap.some((m) => m.attr === "odpId") && lead.odpId != null) {
        const odps = await storage.getOdps();
        odpNameById = {};
        for (const o of odps) odpNameById[o.id] = (o as any).name;
      }

      // Cari card existing (dedup).
      let existingCardId: number | null = null;
      if (cfg.dedupBy === "phone") {
        const phoneMap = cfg.fieldMap.find((m) => m.attr === "phone");
        const phone = (lead.phone ?? "").trim();
        if (phoneMap && phone) {
          const ids = await storage.findCardIdsByFieldValue(pipelineId, phoneMap.targetFieldId, phone);
          existingCardId = ids[0] ?? null;
        }
      } else {
        const links = await storage.getLeadCardLinks(lead.id);
        const link = links.find((l) => (l as any).ruleId === rule.id) ?? links[0];
        existingCardId = link ? (link as any).cardId : null;
      }

      const decision = resolveDuplicateAction(cfg.onDuplicate, existingCardId != null);
      const values = leadToFieldValues(lead, cfg.fieldMap, fieldTypeById, odpNameById);

      if (decision === "skip") continue;

      if (decision === "create") {
        const assigneeId = (lead.assignedTo != null && await storage.canUserAccessPipeline(lead.assignedTo, pipelineId))
          ? lead.assignedTo : null;
        const card = await storage.createCard(pipelineId, {
          stageId: cfg.entryStageId,
          title: leadTitle(lead, cfg.titleSource),
          description: `Dibuat otomatis dari lead #${lead.id}`,
          assigneeId,
          sourceRuleId: rule.id,
        }, actorId);
        if (values.length) await storage.setCardValues(card.id, values);
        await storage.createLeadCardLink({ leadId: lead.id, cardId: card.id, ruleId: rule.id });
        await storage.createAuditLog({
          userId: actorId, action: "AUTOMATION", entityType: "pipeline_card", entityId: card.id,
          entityName: card.title, details: JSON.stringify({ leadId: lead.id, ruleId: rule.id, event: triggerType, mode: "create" }),
        });
      } else if (decision === "update" && existingCardId != null) {
        if (values.length) await storage.setCardValues(existingCardId, values);
        await storage.createAuditLog({
          userId: actorId, action: "AUTOMATION", entityType: "pipeline_card", entityId: existingCardId,
          entityName: leadTitle(lead, cfg.titleSource), details: JSON.stringify({ leadId: lead.id, ruleId: rule.id, event: triggerType, mode: "update" }),
        });
      } else if (decision === "reopen" && existingCardId != null) {
        const stages = await storage.listStages(pipelineId);
        const reopenTo = cfg.reopenStageId ?? cfg.entryStageId;
        if (stages.some((s) => s.id === reopenTo)) {
          await storage.moveCard(existingCardId, reopenTo, undefined, actorId);
        }
        if (values.length) await storage.setCardValues(existingCardId, values);
        await storage.createAuditLog({
          userId: actorId, action: "AUTOMATION", entityType: "pipeline_card", entityId: existingCardId,
          entityName: leadTitle(lead, cfg.titleSource), details: JSON.stringify({ leadId: lead.id, ruleId: rule.id, event: triggerType, mode: "reopen" }),
        });
      }
    } catch (e: any) {
      console.warn(`[lead-intake] rule ${rule.id} (lead ${lead?.id}) failed: ${e?.message}`);
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors). Bila `o.name`/`f.type` mismatch, cek tipe Odp/PipelineField & sesuaikan.

- [ ] **Step 3: Commit**

```bash
git add server/lead-intake.ts
git commit -m "feat(leads): lead intake orchestrator (LP1 task 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Event emitter (`server/lead-events.ts`)

**Files:**
- Create: `server/lead-events.ts`

- [ ] **Step 1: Write the module**

```ts
// server/lead-events.ts
import { withMitra } from "./tenant-context.js";
import { runLeadIntake } from "./lead-intake.js";
import type { IntakeLead } from "../shared/leadIntake.js";

export type LeadEventType = "created" | "updated" | "assigned" | "stage_changed" | "converted";

/** Emit lead event → jalankan intake di tenant lead. Sinkron best-effort, NEVER throws.
 * Tenant diambil dari lead.mitraId (webhook publik tak punya req context). */
export async function emitLeadEvent(eventType: LeadEventType, lead: IntakeLead, actorId: number): Promise<void> {
  try {
    const mitraId = Number(lead.mitraId ?? 1) || 1;
    await withMitra(mitraId, () => runLeadIntake(eventType, lead, actorId));
  } catch (e: any) {
    console.warn(`[lead-events] emit ${eventType} (lead ${lead?.id}) failed: ${e?.message}`);
  }
}
```

> Verifikasi `withMitra` signature: `grep -n "export function withMitra\|export async function withMitra" server/tenant-context.ts`. Pola dipakai di `runTimeTriggers` (`withMitra(mitraId, async () => {...})`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 3: Commit**

```bash
git add server/lead-events.ts
git commit -m "feat(leads): lead event emitter (LP1 task 6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Wire emit into 8 lead mutation sites

**Files:**
- Modify: `server/routes.ts` (import; sites: `POST /marketing/leads` ~8905, `coverage-check/register` ~2360, `webhook/meta-leads` ~9445, `webhook/tiktok-leads` ~9469, `PUT /marketing/leads/:id` ~8943, `PATCH /:id/stage` ~8955, `PATCH /:id/assign` ~8975, `POST /:id/convert` ~9130)

> `lead`/`updated` object pada tiap handler adalah row `Lead` lengkap (punya `mitraId`). `emitLeadEvent` di-`await` (best-effort, never throws) setelah audit, sebelum/independen dari `sendSuccess`.

- [ ] **Step 1: Import emitter**

Di header import `server/routes.ts`, tambah:
```ts
import { emitLeadEvent } from "./lead-events.js";
```

- [ ] **Step 2: `POST /api/marketing/leads`** - setelah `await logAudit(req, "CREATE", "lead", lead.id, lead.name);` (~8905):
```ts
    await emitLeadEvent("created", lead as any, req.authUser!.id);
```

- [ ] **Step 3: `POST /api/coverage-check/register`** - setelah `const lead = await storage.createLead({...})` selesai (sebelum `sendSuccess`). Actor = sistem (1):
```ts
    await emitLeadEvent("created", lead as any, 1);
```

- [ ] **Step 4: `POST /api/webhook/meta-leads`** - ubah `await storage.createLead({...})` menjadi menangkap row lalu emit:
```ts
        const createdLead = await storage.createLead({ /* ...payload sama... */ } as any);
        await emitLeadEvent("created", createdLead as any, 1);
```
(Praktis: ganti `await storage.createLead(` → `const createdLead = await storage.createLead(` dan tambah baris emit setelahnya. Hapus `created++` TIDAK - biarkan; tambahkan emit sebelum `created++`.)

- [ ] **Step 5: `POST /api/webhook/tiktok-leads`** - sama pola:
```ts
      const createdLead = await storage.createLead({ /* ...payload sama... */ } as any);
      await emitLeadEvent("created", createdLead as any, 1);
```

- [ ] **Step 6: `PUT /api/marketing/leads/:id`** - setelah `await logAudit(req, "UPDATE", "lead", id, updated.name);`:
```ts
    await emitLeadEvent("updated", updated as any, req.authUser!.id);
```

- [ ] **Step 7: `PATCH /:id/stage`** - setelah `await logAudit(req, "UPDATE", "lead", lead.id, lead.name, { stage });`:
```ts
    await emitLeadEvent("stage_changed", lead as any, req.authUser!.id);
```

- [ ] **Step 8: `PATCH /:id/assign`** - setelah `const lead = await storage.assignLead(...)` (sebelum/independen dari respons):
```ts
    await emitLeadEvent("assigned", lead as any, req.authUser!.id);
```

- [ ] **Step 9: `POST /:id/convert`** - setelah lead dipindah ke "won" + activity dicatat (~9132), gunakan row lead terkini:
```ts
    await emitLeadEvent("converted", { ...lead, stage: "won" } as any, req.authUser!.id);
```

- [ ] **Step 10: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors). Perbaiki typo `created Lead`→`createdLead` bila ada.

- [ ] **Step 11: Commit**

```bash
git add server/routes.ts
git commit -m "feat(leads): emit lead events at 8 mutation sites (LP1 task 7)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Rule validation accepts lead triggers

**Files:**
- Modify: `server/routes.ts` (`validateTriggerConfig` ~4852; POST `/rules` ~5897; PATCH `/rules/:ruleId` ~5937)

- [ ] **Step 1: Add lead branch to `validateTriggerConfig`** - sebelum baris `if (triggerType !== "time") return "triggerType tidak dikenal";` (~4903):
```ts
  if (["lead_created", "lead_updated", "lead_assigned", "lead_stage_changed", "lead_converted"].includes(triggerType)) {
    const c = parseLeadTriggerConfig(typeof triggerConfig === "string" ? triggerConfig : JSON.stringify(triggerConfig ?? null));
    if (!c || c.entryStageId == null || !stageIds.has(Number(c.entryStageId))) return "Stage masuk wajib & harus stage di pipeline ini";
    if (c.reopenStageId != null && !stageIds.has(Number(c.reopenStageId))) return "reopenStageId bukan stage pipeline ini";
    const fields = await storage.listFields(pipelineId);
    const fieldById = new Map(fields.map((f) => [f.id, f]));
    const titleAllowed = new Set(LEAD_ATTRS.filter((a) => a.key !== "coordinate").map((a) => a.key));
    if (c.titleSource && c.titleSource !== "name" && !titleAllowed.has(String(c.titleSource))) return "titleSource tidak valid";
    for (const m of c.fieldMap) {
      const f = fieldById.get(Number(m.targetFieldId));
      if (!f) return "fieldMap.targetFieldId tidak ditemukan di pipeline ini";
      if (!leadAttrCompatible(String(m.attr), f.type)) return `atribut '${m.attr}' tak cocok dengan tipe field '${f.type}'`;
    }
    return null;
  }
```

- [ ] **Step 2: Import helpers** - di header `server/routes.ts` tambah:
```ts
import { parseLeadTriggerConfig, LEAD_ATTRS, attrCompatibleWithFieldType as leadAttrCompatible } from "../shared/leadIntake.js";
```
(Alias `leadAttrCompatible` agar tak bentrok dgn `attrCompatibleWithFieldType` billing yang sudah di-import.)

- [ ] **Step 3: POST `/rules` - izinkan lead tanpa action + persist triggerConfig**

Cari (~5912):
```ts
    if (triggerType !== "billing_sync") {
```
Ganti jadi (lead rules juga buat card langsung, tak perlu action):
```ts
    const noActionTriggers = ["billing_sync", "lead_created", "lead_updated", "lead_assigned", "lead_stage_changed", "lead_converted"];
    if (!noActionTriggers.includes(triggerType)) {
```

Cari (~5921):
```ts
      triggerConfig: (b.triggerType === "time" || b.triggerType === "billing_sync" || b.triggerType === "field_updated") ? (b.triggerConfig ?? null) : null,
```
Ganti jadi:
```ts
      triggerConfig: (b.triggerType === "time" || b.triggerType === "billing_sync" || b.triggerType === "field_updated" || String(b.triggerType ?? "").startsWith("lead_")) ? (b.triggerConfig ?? null) : null,
```

> Cek juga `entryStageId` di POST handler: lead pakai `triggerConfig.entryStageId` (bukan `targetStageId`). `validateTriggerConfig` dipanggil dgn `entryStageId` arg untuk billing; untuk lead, entryStage ada di dalam `triggerConfig`, jadi cabang lead memvalidasinya sendiri (Step 1) - tak perlu argumen `entryStageId`.

- [ ] **Step 4: PATCH `/rules/:ruleId`** - pastikan cabang validasi (~5953) memanggil `validateTriggerConfig` dgn triggerType baru; karena Step 1 sudah menambah cabang lead, tak ada perubahan lain. Verifikasi handler PATCH menyimpan `triggerConfig` untuk lead (ikuti pola yang sama dgn billing_sync di handler PATCH; bila ada whitelist serupa Step 3, tambahkan `startsWith("lead_")`).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 6: Commit**

```bash
git add server/routes.ts
git commit -m "feat(leads): rule validation + persistence for lead triggers (LP1 task 8)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Client rule form state - lead sub-form

**Files:**
- Modify: `client/components/pipelines/ruleFormState.ts`

> Pola: tiru blok `billing_sync` (draft fields `billingEntryStageId`/`billingFilter`/`billingFieldMap`, di `ruleToDraft` ~167 & `draftToPayload` ~225). Tambah cabang lead paralel.

- [ ] **Step 1: Extend draft type + empty draft**

Di interface draft (cari `triggerType: "stage_enter" | ... | "field_updated";` ~line 97) tambahkan union lead:
```ts
  triggerType: "stage_enter" | "time" | "billing_sync" | "card_updated" | "assignee_changed" | "field_updated"
 | "lead_created" | "lead_updated" | "lead_assigned" | "lead_stage_changed" | "lead_converted";
```
Tambah field draft lead (dekat field billing):
```ts
  leadSources: string[];                 // canonical; kosong = semua
  leadEntryStageId: string;
  leadTitleSource: string;
  leadFieldMap: { attr: string; targetFieldId: string }[];
  leadOnDuplicate: "create" | "update" | "ignore" | "reopen";
  leadDedupBy: "lead_id" | "phone";
  leadReopenStageId: string;
```
Di `emptyDraft()` (cari objek default ~125) tambah default:
```ts
    leadSources: [], leadEntryStageId: "", leadTitleSource: "name", leadFieldMap: [],
    leadOnDuplicate: "ignore", leadDedupBy: "lead_id", leadReopenStageId: "",
```

- [ ] **Step 2: `ruleToDraft` - hydrate lead branch**

Tambah cabang (setelah cabang `billing_sync`, ~line 186) sebelum fallback stage_enter/time:
```ts
  if (String(r.triggerType ?? "").startsWith("lead_")) {
    d.triggerType = r.triggerType as any;
    let c: any = {};
    try { c = r.triggerConfig ? (typeof r.triggerConfig === "string" ? JSON.parse(r.triggerConfig) : r.triggerConfig) : {}; } catch { c = {}; }
    d.leadSources = Array.isArray(c.sources) ? c.sources.map(String) : [];
    d.leadEntryStageId = c.entryStageId != null ? String(c.entryStageId) : "";
    d.leadTitleSource = c.titleSource || "name";
    d.leadFieldMap = Array.isArray(c.fieldMap) ? c.fieldMap.map((m: any) => ({ attr: String(m.attr), targetFieldId: String(m.targetFieldId) })) : [];
    d.leadOnDuplicate = ["create", "update", "ignore", "reopen"].includes(c.onDuplicate) ? c.onDuplicate : "ignore";
    d.leadDedupBy = c.dedupBy === "phone" ? "phone" : "lead_id";
    d.leadReopenStageId = c.reopenStageId != null ? String(c.reopenStageId) : "";
    return d;
  }
```

- [ ] **Step 3: `draftToPayload` - serialize lead branch**

Tambah cabang (setelah cabang `billing_sync`, ~line 241):
```ts
  } else if (String(d.triggerType).startsWith("lead_")) {
    if (!d.leadEntryStageId) return { ok: false, error: "Pilih stage masuk (entry) untuk trigger lead" };
    if (d.leadOnDuplicate === "reopen" && !d.leadReopenStageId) return { ok: false, error: "Pilih stage 'buka lagi' untuk mode reopen" };
    const triggerConfig = {
      sources: d.leadSources,
      entryStageId: Number(d.leadEntryStageId),
      titleSource: d.leadTitleSource || "name",
      fieldMap: d.leadFieldMap.filter((m) => m.attr && m.targetFieldId).map((m) => ({ attr: m.attr, targetFieldId: Number(m.targetFieldId) })),
      onDuplicate: d.leadOnDuplicate,
      dedupBy: d.leadDedupBy,
      reopenStageId: d.leadReopenStageId ? Number(d.leadReopenStageId) : null,
    };
    return { ok: true, payload: { triggerType: d.triggerType, triggerConfig } };
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/ruleFormState.ts
git commit -m "feat(leads): rule form state lead sub-form (LP1 task 9)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Client dialog - lead trigger sub-form UI

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`

> Tiru sub-form `billing_sync` (state ~line 64, render sub-form). Komponen reusable: Combobox, baris field-map billing (atribut → field), select stage. Mobile-first, `<fieldset>`/semantic.

- [ ] **Step 1: Import registry + attrs**
```ts
import { LEAD_SOURCE_OPTIONS } from "@shared/leadSources";
import { LEAD_ATTRS } from "@shared/leadIntake";
```

- [ ] **Step 2: Tambah opsi trigger type "Lead"**

Di selector trigger type (cari daftar `EVENT_TRIGGER_TYPES`/opsi billing_sync), tambah grup opsi:
```tsx
<optgroup label="Lead masuk / berubah">
  <option value="lead_created">Saat lead baru dibuat</option>
  <option value="lead_updated">Saat lead diperbarui</option>
  <option value="lead_assigned">Saat lead di-assign</option>
  <option value="lead_stage_changed">Saat stage lead berubah</option>
  <option value="lead_converted">Saat lead jadi pelanggan</option>
</optgroup>
```
(Bila trigger picker memakai komponen lain, sesuaikan; nilai value harus sama.)

- [ ] **Step 3: Render sub-form ketika `triggerType.startsWith("lead_")`**

Setelah blok render `billing_sync`, tambah blok kondisional (gunakan setter draft dari Task 9 via state dialog yang sudah ada). Contoh struktur (sesuaikan dengan state lokal dialog - dialog ini punya state per-field seperti `billingEntryStageId`; tambah padanan lead `leadEntryStageId` dst di `useState`, lalu sinkron ke draft):
```tsx
{draft.triggerType.startsWith("lead_") && (
  <fieldset className="space-y-3 border border-border/60 rounded-lg p-3">
    <legend className="text-xs font-semibold px-1">Konfigurasi trigger lead</legend>

    {/* Source filter (multi) */}
    <div>
      <label className="text-xs font-medium">Sumber lead (kosong = semua)</label>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {LEAD_SOURCE_OPTIONS.map((o) => {
          const on = draft.leadSources.includes(o.value);
          return (
            <button key={o.value} type="button"
              onClick={() => setDraft((d) => ({ ...d, leadSources: on ? d.leadSources.filter((s) => s !== o.value) : [...d.leadSources, o.value] }))}
              className={`px-2 py-1 rounded text-[11px] border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border/60"}`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </div>

    {/* Entry stage */}
    <div>
      <label className="text-xs font-medium">Stage masuk *</label>
      <select className="w-full mt-1 rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
        value={draft.leadEntryStageId} onChange={(e) => setDraft((d) => ({ ...d, leadEntryStageId: e.target.value }))}>
        <option value="">- pilih stage -</option>
        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>

    {/* Title source */}
    <div>
      <label className="text-xs font-medium">Sumber judul kartu</label>
      <select className="w-full mt-1 rounded-lg border border-input bg-background px-2 py-1.5 text-sm"
        value={draft.leadTitleSource} onChange={(e) => setDraft((d) => ({ ...d, leadTitleSource: e.target.value }))}>
        {LEAD_ATTRS.filter((a) => a.key !== "coordinate").map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
      </select>
    </div>

    {/* Field map lead → card */}
    <div>
      <label className="text-xs font-medium">Pemetaan field (lead → kartu)</label>
      <div className="space-y-1.5 mt-1">
        {draft.leadFieldMap.map((m, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <select className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs"
              value={m.attr} onChange={(e) => setDraft((d) => { const fm = [...d.leadFieldMap]; fm[i] = { ...fm[i], attr: e.target.value }; return { ...d, leadFieldMap: fm }; })}>
              <option value="">- atribut lead -</option>
              {LEAD_ATTRS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>
            <select className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs"
              value={m.targetFieldId} onChange={(e) => setDraft((d) => { const fm = [...d.leadFieldMap]; fm[i] = { ...fm[i], targetFieldId: e.target.value }; return { ...d, leadFieldMap: fm }; })}>
              <option value="">- field kartu -</option>
              {fields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <button type="button" aria-label="Hapus" onClick={() => setDraft((d) => ({ ...d, leadFieldMap: d.leadFieldMap.filter((_, j) => j !== i) }))} className="text-muted-foreground">×</button>
          </div>
        ))}
        <button type="button" className="text-xs text-primary" onClick={() => setDraft((d) => ({ ...d, leadFieldMap: [...d.leadFieldMap, { attr: "", targetFieldId: "" }] }))}>+ Tambah pemetaan</button>
      </div>
    </div>

    {/* Dedup */}
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="text-xs font-medium">Jika duplikat</label>
        <select className="w-full mt-1 rounded border border-input bg-background px-2 py-1.5 text-sm"
          value={draft.leadOnDuplicate} onChange={(e) => setDraft((d) => ({ ...d, leadOnDuplicate: e.target.value as any }))}>
          <option value="create">Buat baru</option>
          <option value="update">Perbarui</option>
          <option value="ignore">Abaikan</option>
          <option value="reopen">Buka lagi</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-medium">Dedup berdasarkan</label>
        <select className="w-full mt-1 rounded border border-input bg-background px-2 py-1.5 text-sm"
          value={draft.leadDedupBy} onChange={(e) => setDraft((d) => ({ ...d, leadDedupBy: e.target.value as any }))}>
          <option value="lead_id">Lead (1 lead = 1 kartu)</option>
          <option value="phone">Nomor telepon</option>
        </select>
      </div>
    </div>

    {draft.leadOnDuplicate === "reopen" && (
      <div>
        <label className="text-xs font-medium">Stage "buka lagi" *</label>
        <select className="w-full mt-1 rounded border border-input bg-background px-2 py-1.5 text-sm"
          value={draft.leadReopenStageId} onChange={(e) => setDraft((d) => ({ ...d, leadReopenStageId: e.target.value }))}>
          <option value="">- pilih stage -</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    )}
  </fieldset>
)}
```

> Catatan integrasi: dialog ini saat ini memegang state via banyak `useState` + membangun draft saat submit (lihat pola `billing*`). Worker boleh memilih: (a) konsolidasikan ke satu `draft` object via `ruleFormState` (lebih DRY), atau (b) tambah `useState` lead paralel (`leadSources`, dst) dan rakit `triggerConfig` di submit. Pilih pola yang konsisten dengan kode existing dialog. Validasi submit gunakan `draftToPayload` (Task 9).

- [ ] **Step 4: Render label trigger lead di panel detail rule**

Di tempat dialog menampilkan ringkasan trigger (cari penanganan `billing_sync` di list rule, ~line 5883 setara di komponen), tambahkan label untuk lead: gunakan `LEAD_SOURCE_LABELS` untuk sources & teks event. Minimal: tampilkan nama event + jumlah source.

- [ ] **Step 5: Build (frontend) + typecheck**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS (0 errors), build sukses.

- [ ] **Step 6: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(leads): lead trigger sub-form UI in rules dialog (LP1 task 10)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: DRY - `LeadPipelinePage` source labels → registry

**Files:**
- Modify: `client/pages/LeadPipelinePage.tsx:52` (`SOURCE_LABELS`)

- [ ] **Step 1: Replace local map with registry**

Hapus objek lokal:
```ts
const SOURCE_LABELS: Record<string, string> = {
  canvassing: "Canvassing", prospect_finder: "Finder",
  referral: "Referral", inbound: "Inbound",
};
```
Ganti dengan import + adapter (normalisasi alias agar `landing_page`/`meta_ads`/`tiktok_ads` ter-label benar):
```ts
import { canonicalLeadSource, LEAD_SOURCE_LABELS } from "@shared/leadSources";

const sourceLabel = (s: string | null | undefined) => LEAD_SOURCE_LABELS[canonicalLeadSource(s)];
```
Lalu ganti seluruh pemakaian `SOURCE_LABELS[lead.source] ?? lead.source` menjadi `sourceLabel(lead.source)` (lokasi: ~385, 518, 777, 1006). Cari semua: `grep -n "SOURCE_LABELS" client/pages/LeadPipelinePage.tsx`.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS, build sukses.

- [ ] **Step 3: Commit**

```bash
git add client/pages/LeadPipelinePage.tsx
git commit -m "refactor(leads): source labels via shared registry (LP1 task 11)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run all pure tests**

Run: `npx tsx --test shared/leadSources.test.ts shared/leadIntake.test.ts`
Expected: semua PASS.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sukses (Vite client + esbuild server).

- [ ] **Step 4: Smoke manual (opsional, lokal dengan DB)**

1. Buat pipeline + stage "Lead Baru" + field phone/koordinat.
2. `/pipelines` → board → "Otomasi" → rule baru trigger "Saat lead baru dibuat", source = Meta Lead Ads, entry stage = Lead Baru, map phone→field phone, onDuplicate=ignore.
3. `curl -X POST .../api/webhook/meta-leads -d '{...}'` → cek card muncul di "Lead Baru" + value phone + baris `lead_card_links`.
4. Kirim lagi lead yang sama → tak ada card duplikat (mode ignore).
5. Ganti mode=update + dedupBy=phone → kirim ulang → field card ter-update.

- [ ] **Step 5: Update memory**

Update `memory/project-pipelines-engine.md` (atau buat `project-leads-pipeline-integration.md`) + `MEMORY.md`: LP1 DONE on dev (belum push), arsitektur event-bus, exclusions LP2-LP6, file kunci.

---

## Self-Review (penulis plan - sudah dijalankan)

**Spec coverage:** §Arsitektur→T5/T6/T7; §Data model (lead_card_links/registry/trigger types)→T1/T3/T4; §Rule config→T8/T9/T10; §Field mapping→T2; §8 titik emit→T7; §UI→T10; §DRY source→T11; §Cross-cutting (tenant withMitra→T6; no-N+1 batched lookups→T5; audit→T5; loop-safe storage-direct→T5; testing→T1/T2/T12). Semua tercakup.

**Placeholder scan:** tak ada TBD/TODO; semua step berisi kode aktual. Dua titik "verifikasi nama kolom/ signature" (T4 card-values table, T6 withMitra) adalah pengecekan defensif, bukan placeholder - kode default sudah ditulis sesuai pola existing.

**Type consistency:** `IntakeLead`, `LeadTriggerConfig`, `parseLeadTriggerConfig`, `resolveDuplicateAction`, `leadRuleMatchesSource`, `leadToFieldValues`, `leadTitle`, `attrCompatibleWithFieldType` (alias `leadAttrCompatible` di routes) konsisten antar T2/T5/T8. Storage `listLeadRules`/`getLeadCardLinks`/`createLeadCardLink`/`findCardIdsByFieldValue` dipakai persis di T5. `emitLeadEvent(eventType, lead, actorId)` konsisten T6/T7.
