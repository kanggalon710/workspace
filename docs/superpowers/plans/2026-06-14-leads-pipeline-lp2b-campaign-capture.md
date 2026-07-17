# LP2b — Campaign Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tangkap `campaign`/`adSet`/`adName` dari lead iklan (Meta/TikTok webhook) ke tabel `leads`, resolve nama campaign via registry `ad_campaigns` existing (tanpa Graph API), dan ekspos sebagai atribut field-map (LP1) + kondisi (LP2) + tampil di /leads.

**Architecture:** Pure `extractAdRefs(payload)` menarik identifier campaign/adset/ad dari key umum; server `resolveAdFields(platform, payload)` me-resolve nama campaign via `getAdCampaignByExternalId` (fallback payload-name → id → null); webhook menyimpannya di 3 kolom baru `leads`. Atribut campaign masuk katalog LEAD_ATTRS/LEAD_CONDITION_ATTRS (penanganan nilai otomatis via `(lead as any)[attr]`).

**Tech Stack:** TypeScript, Express 5, Drizzle (MySQL), React 18, `node:test` via `npx tsx --test`. Spec: `docs/superpowers/specs/2026-06-14-leads-pipeline-lp2b-campaign-capture-design.md`. Sibling imports `.js`.

---

## File Structure

| File | Responsibility |
|---|---|
| `shared/adCampaignFields.ts` (create) + test | Pure `extractAdRefs(payload)`. |
| `shared/schema.ts` (modify) | `leads` += `campaign`/`adSet`/`adName` cols. |
| `server/storage.ts` (modify) | 3 entries di `loyaltyColumnAdditions` (startup migration). |
| `shared/leadIntake.ts` (modify) + test | `IntakeLead` += 3 fields; `LEAD_ATTRS` += 3. |
| `shared/leadConditions.ts` (modify) + test | `LEAD_CONDITION_ATTRS` += 3. |
| `server/lead-campaign.ts` (create) | `resolveAdFields(platform, payload)`. |
| `server/routes.ts` (modify) | Wire resolve into meta + tiktok webhooks. |
| `client/pages/LeadPipelinePage.tsx` (modify) | Tampilkan campaign di detail lead. |

---

## Task 1: Pure `extractAdRefs` (`shared/adCampaignFields.ts`)

**Files:**
- Create: `shared/adCampaignFields.ts`
- Test: `shared/adCampaignFields.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/adCampaignFields.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractAdRefs } from "./adCampaignFields.js";

test("extracts campaign/adset/ad from snake_case keys", () => {
  assert.deepEqual(extractAdRefs({
    campaign_id: "120", campaign_name: "Promo Fiber",
    adset_id: "55", adset_name: "Cilawu Set",
    ad_id: "9", ad_name: "Video A",
  }), {
    campaign: { externalId: "120", name: "Promo Fiber" },
    adSet: { externalId: "55", name: "Cilawu Set" },
    adName: { externalId: "9", name: "Video A" },
  });
});

test("supports camelCase + adgroup alias; trims; omits empty refs", () => {
  assert.deepEqual(extractAdRefs({ campaignName: "X", adgroup_id: "  7  ", adName: "" }), {
    campaign: { name: "X" },
    adSet: { externalId: "7" },
  });
});

test("no ad keys → empty object", () => {
  assert.deepEqual(extractAdRefs({ foo: "bar" }), {});
  assert.deepEqual(extractAdRefs(null), {});
  assert.deepEqual(extractAdRefs(undefined), {});
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npx tsx --test shared/adCampaignFields.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// shared/adCampaignFields.ts
/** Pure: ekstrak referensi campaign/ad set/ad dari payload webhook lead iklan. No I/O.
 *  Best-effort: ambil dari key umum (snake_case + camelCase + alias adgroup). */

export interface AdRef { externalId?: string; name?: string }
export interface AdRefs { campaign?: AdRef; adSet?: AdRef; adName?: AdRef }

function str(v: any): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

/** Pilih nilai pertama yang non-empty dari beberapa key kandidat. */
function pick(obj: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const s = str(obj?.[k]);
    if (s) return s;
  }
  return undefined;
}

function ref(externalId?: string, name?: string): AdRef | undefined {
  if (!externalId && !name) return undefined;
  const r: AdRef = {};
  if (externalId) r.externalId = externalId;
  if (name) r.name = name;
  return r;
}

export function extractAdRefs(payload: any): AdRefs {
  if (!payload || typeof payload !== "object") return {};
  const out: AdRefs = {};
  const campaign = ref(pick(payload, ["campaign_id", "campaignId"]), pick(payload, ["campaign_name", "campaignName"]));
  const adSet = ref(pick(payload, ["adset_id", "adSetId", "adgroup_id", "adGroupId"]), pick(payload, ["adset_name", "adSetName", "adgroup_name", "adGroupName"]));
  const adName = ref(pick(payload, ["ad_id", "adId"]), pick(payload, ["ad_name", "adName"]));
  if (campaign) out.campaign = campaign;
  if (adSet) out.adSet = adSet;
  if (adName) out.adName = adName;
  return out;
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npx tsx --test shared/adCampaignFields.test.ts`
Expected: PASS (3 tests). `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add shared/adCampaignFields.ts shared/adCampaignFields.test.ts
git commit -m "feat(leads): pure extractAdRefs campaign fields (LP2b task 1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Schema + migration — 3 lead columns

**Files:**
- Modify: `shared/schema.ts` (`leads` table, before the closing `});`)
- Modify: `server/storage.ts` (`loyaltyColumnAdditions` array ~line 753)

- [ ] **Step 1: Add columns to `leads` in schema.ts**

In `shared/schema.ts`, find the end of the `leads` table (the `// Meta` block with `createdBy`/`createdAt`/`updatedAt`/`closedAt`). Add BEFORE the closing `});`:
```ts
  // Ads attribution (LP2b)
  campaign: text("campaign"),
  adSet: text("ad_set"),
  adName: text("ad_name"),
```

- [ ] **Step 2: Add migration entries in storage.ts**

In the `loyaltyColumnAdditions` array (server/storage.ts ~line 753), add three entries (anywhere in the array):
```ts
      { table: "leads", column: "campaign", ddl: "TEXT NULL" },
      { table: "leads", column: "ad_set",   ddl: "TEXT NULL" },
      { table: "leads", column: "ad_name",  ddl: "TEXT NULL" },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(leads): campaign/adSet/adName columns + migration (LP2b task 2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Catalogs — IntakeLead + field-map + condition attrs

**Files:**
- Modify: `shared/leadIntake.ts` (`IntakeLead` interface ~line 10-25; `LEAD_ATTRS` ~line 30-44) + `shared/leadIntake.test.ts`
- Modify: `shared/leadConditions.ts` (`LEAD_CONDITION_ATTRS` ~line 30-38) + `shared/leadConditions.test.ts`

- [ ] **Step 1: Extend leadIntake test**

In `shared/leadIntake.test.ts`, add a test (campaign maps through the generic text path):
```ts
test("leadToFieldValues maps campaign attr (LP2b)", () => {
  const out = leadToFieldValues(
    { id: 1, mitraId: 1, campaign: "Promo Fiber" } as any,
    [{ attr: "campaign", targetFieldId: 40 }],
    {},
  );
  assert.deepEqual(out, [{ fieldId: 40, value: "Promo Fiber" }]);
});
```

- [ ] **Step 2: Implement leadIntake changes**

In `shared/leadIntake.ts`:
- Add to `IntakeLead` interface (after `odpId?`):
```ts
  campaign?: string | null;
  adSet?: string | null;
  adName?: string | null;
```
- Add to `LEAD_ATTRS` (after the `odpId` entry, before `coordinate`):
```ts
  { key: "campaign", label: "Campaign", fieldTypes: TEXTISH },
  { key: "adSet", label: "Ad Set", fieldTypes: TEXTISH },
  { key: "adName", label: "Ad Name", fieldTypes: TEXTISH },
```
(`attrRaw`/`leadToFieldValues` already handle arbitrary string attrs via `(l as any)[attr]` default branch — no logic change needed.)

- [ ] **Step 3: Run leadIntake test**

Run: `npx tsx --test shared/leadIntake.test.ts`
Expected: all PASS (existing + new).

- [ ] **Step 4: Extend leadConditions test**

In `shared/leadConditions.test.ts`, add to the `catalog validators` test (or a new test):
```ts
test("campaign condition attr (LP2b)", () => {
  assert.equal(leadConditionAttrValid("campaign"), true);
  assert.equal(opValidForAttr("campaign", "contains"), true);
  assert.equal(compareLeadAttr({ id: 1, mitraId: 1, campaign: "Promo Fiber" } as any, "campaign", "contains", "promo"), true);
});
```
(`compareLeadAttr` is already imported in that test file.)

- [ ] **Step 5: Implement leadConditions changes**

In `shared/leadConditions.ts`, add to `LEAD_CONDITION_ATTRS` (after `odpId` or wherever fits):
```ts
  { key: "campaign", label: "Campaign", ops: TEXT },
  { key: "adSet", label: "Ad Set", ops: TEXT },
  { key: "adName", label: "Ad Name", ops: TEXT },
```
(`TEXT` const = `["eq","neq","contains"]` already defined in the file. `leadConditionRaw` default branch `(lead as any)[attr]` already handles campaign — no change.)

- [ ] **Step 6: Run leadConditions test + typecheck**

Run: `npx tsx --test shared/leadConditions.test.ts` → all PASS.
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 7: Commit**

```bash
git add shared/leadIntake.ts shared/leadIntake.test.ts shared/leadConditions.ts shared/leadConditions.test.ts
git commit -m "feat(leads): campaign/adSet/adName as field-map + condition attrs (LP2b task 3)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Server resolve + webhook wiring

**Files:**
- Create: `server/lead-campaign.ts`
- Modify: `server/routes.ts` (meta webhook ~line 9530, tiktok webhook ~line 9556)

Background: `storage.getAdCampaignByExternalId(platform, externalId)` → `AdCampaign|undefined` (tenant-scoped via `getMitraId()`). `withMitra(mitraId, fn)` from `./tenant-context.js`. Webhooks run WITHOUT tenant context and create leads as mitra 1 (DB default), so the registry lookup must run inside `withMitra(1, ...)`.

- [ ] **Step 1: Create resolve helper**

```ts
// server/lead-campaign.ts
import { storage } from "./storage.js";
import { extractAdRefs } from "../shared/adCampaignFields.js";

export interface ResolvedAdFields { campaign: string | null; adSet: string | null; adName: string | null }

/** Resolve campaign/adSet/adName dari payload webhook. campaign di-resolve ke nama ramah via
 *  registry ad_campaigns (externalId match); fallback nama payload → id → null. adSet/adName:
 *  nama payload → id → null (registry hanya level-campaign). Best-effort: NEVER throws.
 *  MUST dipanggil di dalam withMitra(...) agar getAdCampaignByExternalId ter-scope tenant. */
export async function resolveAdFields(platform: string, payload: any): Promise<ResolvedAdFields> {
  const refs = extractAdRefs(payload);
  let campaign: string | null = null;
  if (refs.campaign) {
    let resolvedName: string | undefined;
    if (refs.campaign.externalId) {
      try {
        const row = await storage.getAdCampaignByExternalId(platform, refs.campaign.externalId);
        resolvedName = row?.campaignName;
      } catch { /* best-effort */ }
    }
    campaign = resolvedName ?? refs.campaign.name ?? refs.campaign.externalId ?? null;
  }
  const adSet = refs.adSet ? (refs.adSet.name ?? refs.adSet.externalId ?? null) : null;
  const adName = refs.adName ? (refs.adName.name ?? refs.adName.externalId ?? null) : null;
  return { campaign, adSet, adName };
}
```

- [ ] **Step 2: Wire into meta webhook**

In `server/routes.ts`, find the meta webhook createLead block (~line 9530: `const createdLead = await storage.createLead({ name, phone, ... source: "meta_ads" ... })`). 
- Add import at top of routes.ts (with other server imports):
```ts
import { resolveAdFields } from "./lead-campaign.js";
import { withMitra } from "./tenant-context.js";
```
(If `withMitra` is already imported in routes.ts, don't duplicate — check first.)
- Immediately BEFORE the `const createdLead = await storage.createLead({` line in the meta handler, add:
```ts
        const ad = await withMitra(1, () => resolveAdFields("meta_ads", v));
```
- Add `campaign`, `adSet`, `adName` to the createLead object (inside the `{ ... }`):
```ts
          campaign: ad.campaign, adSet: ad.adSet, adName: ad.adName,
```
(Place alongside the other fields, e.g. after `category: "rumahan", odpId,`.)

- [ ] **Step 3: Wire into tiktok webhook**

In the tiktok handler (~line 9556), before `const createdLead = await storage.createLead({`, add:
```ts
      const ad = await withMitra(1, () => resolveAdFields("tiktok_ads", lead));
```
And add to its createLead object:
```ts
        campaign: ad.campaign, adSet: ad.adSet, adName: ad.adName,
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` → 0 errors. (Confirm `withMitra(1, () => ...)` signature: it returns `Promise<T>|T`; awaiting it is fine.)

- [ ] **Step 5: Commit**

```bash
git add server/lead-campaign.ts server/routes.ts
git commit -m "feat(leads): resolve + capture campaign in meta/tiktok webhooks (LP2b task 4)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Client — show campaign in lead detail

**Files:**
- Modify: `client/pages/LeadPipelinePage.tsx` (lead detail section — near the existing `<InfoRow label="Sumber" .../>` ~line 516)

- [ ] **Step 1: Add campaign InfoRow(s)**

Find the lead-detail `InfoRow` block that includes `<InfoRow label="Sumber" value={sourceLabel(lead.source)} />`. Immediately after it, add conditional campaign rows (the `Lead`/`LeadDetail` type the page uses will include `campaign`/`adSet`/`adName` once the shared/api types flow through; if the page's local `Lead` type is hand-declared, add `campaign?`, `adSet?`, `adName?` to it):
```tsx
                {lead.campaign && <InfoRow label="Campaign" value={lead.campaign} />}
                {lead.adSet && <InfoRow label="Ad Set" value={lead.adSet} />}
                {lead.adName && <InfoRow label="Ad Name" value={lead.adName} />}
```

> If `lead` is typed by a local interface in this file (not the shared `Lead` type), add the three optional string fields to that interface so tsc passes. Grep the file for `interface Lead` / `type Lead` to locate it.

- [ ] **Step 2: Build + typecheck**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errors, build success.

- [ ] **Step 3: Commit**

```bash
git add client/pages/LeadPipelinePage.tsx
git commit -m "feat(leads): show campaign/adSet/adName in lead detail (LP2b task 5)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Final verification + memory

- [ ] **Step 1: Lead tests**

Run: `npx tsx --test shared/adCampaignFields.test.ts shared/leadIntake.test.ts shared/leadConditions.test.ts shared/leadSources.test.ts shared/cardToLead.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit` → 0 errors. `npm run build` → success.

- [ ] **Step 3: Full regression**

Run: `npx tsx --test shared/*.test.ts server/*.test.ts client/**/*.test.ts`
Expected: all PASS (≥ prior count).

- [ ] **Step 4: Smoke (optional, local DB)**

1. Push a campaign to `ad_campaigns` (platform `meta_ads`, externalId "120", campaignName "Promo Fiber") via existing ads API/registry.
2. POST `/api/webhook/meta-leads` with a leadgen change whose `value` includes `campaign_id: "120"` → new lead has `campaign = "Promo Fiber"` (resolved).
3. POST with `campaign_name` but no matching registry → `campaign` = that name. With only `campaign_id` unmatched → raw id.
4. Create a lead rule with condition `campaign contains "Promo"` → only matching leads create cards. Field-map `campaign` → a card field → value populated.

- [ ] **Step 5: Update memory**

Update `memory/project-leads-pipeline-integration.md`: LP2b DONE on dev (belum push) — campaign/adSet/adName cols, extractAdRefs, resolve via ad_campaigns registry (no Graph API), field-map+condition attrs, lead detail display. Add commit range. Mark LP2b done in the slice list.

---

## Self-Review (penulis plan — sudah dijalankan)

**Spec coverage:** §extractAdRefs→T1; §3 cols + migration→T2; §IntakeLead+catalogs→T3; §resolveAdFields + webhook capture (withMitra)→T4; §client display→T5; §best-effort/tenant→T4 (try/catch + withMitra(1)); §testing→T1/T3/T6. AC1-6 covered.

**Placeholder scan:** no TBD/TODO; full code each step. "Verify/grep" notes are defensive (local-type check in T5) with the concrete action stated.

**Type consistency:** `extractAdRefs(payload)`→`AdRefs{campaign?,adSet?,adName?: {externalId?,name?}}` T1 used by `resolveAdFields(platform,payload)`→`{campaign,adSet,adName: string|null}` T4. `IntakeLead.campaign/adSet/adName` (string|null) T3 consumed by leadToFieldValues/compareLeadAttr default branches (no special-case needed). Columns `campaign`/`ad_set`/`ad_name` (schema T2) ↔ camel `campaign`/`adSet`/`adName` (Drizzle) consistent T2/T3/T4/T5. `withMitra(1, () => resolveAdFields(...))` consistent.
