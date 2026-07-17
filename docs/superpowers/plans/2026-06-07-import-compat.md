# Leads→Pipeline Import Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the leads→pipeline import emit a single Coordinate field (instead of separate lat/lng) and resolve assignees against the JABNET tenant with a Skip(+optional default) fallback.

**Architecture:** Pure mapping changes in `tools/leadsToPipeline.ts` (coordinate field + `resolveAssignee` + `leadToCard` taking an explicit assignee), driven by the runner `tools/import-leads-to-pipeline.ts` (loads tenant user ids, parses `--default-assignee`, tallies). Tools-only — no app code, schema, or migration.

**Tech Stack:** TypeScript run via `npx tsx`, `node:test`. `tools/` is OUTSIDE tsconfig — gated by the tsx test + a `--help` smoke (NOT `npm run typecheck`/`build`). Spec: `docs/superpowers/specs/2026-06-07-import-compat-design.md`. The `coordinate` field type itself was added app-side in slice D.

**Coding standards:** pure testable mapping; DRY (one `resolveAssignee`; reuse the generic field/value loops); `.js` import extensions in tests.

---

## Task 1: Mapping module — coordinate field + assignee resolution (TDD)

**Files:**
- Modify: `tools/leadsToPipeline.ts`
- Modify: `tools/leadsToPipeline.test.ts`

- [ ] **Step 1: Update + add tests (they will fail)**

In `tools/leadsToPipeline.test.ts`:

(a) Add `resolveAssignee` to the destructured import from `./leadsToPipeline.js`.

(b) The two existing `leadToCard(...)` calls (≈ lines 44 and 56) now need a third `assigneeId` arg. Update them and the assignee assertion. Change the first test body so the `leadToCard` call passes an explicit assignee and asserts it, e.g.:

```ts
test("leadToCard: maps title/stage/assignee/priority/dates", () => {
  const stageIdByKey = { new: 10, contacted: 11 };
  const c = leadToCard(sampleLead, stageIdByKey, 5);
  assert.equal(c.title, sampleLead.name);
  assert.equal(c.stageId, stageIdByKey[sampleLead.stage]);
  assert.equal(c.assigneeId, 5);
  assert.equal(c.priority, sampleLead.priority || "medium");
});

test("leadToCard: unknown stage falls back to first stage", () => {
  const stageIdByKey = { new: 10, contacted: 11 };
  const c = leadToCard({ ...sampleLead, stage: "weird" }, stageIdByKey, null);
  assert.equal(c.stageId, 10); // LEAD_STAGES[0] === "new"
  assert.equal(c.assigneeId, null);
});
```

(Keep whatever the existing tests already assert that still holds; just adapt the `leadToCard` arity + the assignee line. If the existing first test referenced `sampleLead.assigned_to`, replace that with the explicit `5` above.)

(c) Update the `leadToFieldValues` test (≈ line 60) so it expects a `coordinate` value and NO `lat`/`lng` keys. Assuming `sampleLead` has numeric `lat`/`lng`, add to that test:

```ts
  assert.equal(vals.lat, undefined);
  assert.equal(vals.lng, undefined);
  assert.equal(vals.coordinate, JSON.stringify({ lat: sampleLead.lat, lng: sampleLead.lng }));
```

(d) Append these new tests at the end of the file:

```ts
test("LEAD_PIPELINE_FIELDS has a coordinate field and no lat/lng", () => {
  const keys = LEAD_PIPELINE_FIELDS.map((f) => f.key);
  assert.ok(keys.includes("coordinate"));
  assert.equal(keys.includes("lat"), false);
  assert.equal(keys.includes("lng"), false);
  assert.equal(LEAD_PIPELINE_FIELDS.find((f) => f.key === "coordinate")?.type, "coordinate");
});

test("leadToFieldValues: coordinate only when both lat & lng are finite", () => {
  const v1 = Object.fromEntries(leadToFieldValues({ ...sampleLead, lat: -7.2, lng: 107.9 }).map((v) => [v.fieldKey, v.value]));
  assert.equal(v1.coordinate, JSON.stringify({ lat: -7.2, lng: 107.9 }));
  const v2 = Object.fromEntries(leadToFieldValues({ ...sampleLead, lat: -7.2, lng: null }).map((v) => [v.fieldKey, v.value]));
  assert.equal(v2.coordinate, undefined);
  const v3 = Object.fromEntries(leadToFieldValues({ ...sampleLead, lat: null, lng: null }).map((v) => [v.fieldKey, v.value]));
  assert.equal(v3.coordinate, undefined);
});

test("resolveAssignee: in-tenant kept, else default, else null", () => {
  const valid = new Set([1, 2, 3]);
  assert.equal(resolveAssignee(2, valid, null), 2);
  assert.equal(resolveAssignee(9, valid, 1), 1);     // not in tenant → default
  assert.equal(resolveAssignee(9, valid, null), null); // not in tenant, no default → null
  assert.equal(resolveAssignee(null, valid, 1), 1);   // no lead assignee → default
  assert.equal(resolveAssignee(null, valid, null), null);
});
```

Also ensure `LEAD_PIPELINE_FIELDS` is in the test's import list (add it if absent).

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test tools/leadsToPipeline.test.ts`
Expected: FAIL — `resolveAssignee` not exported; `leadToCard` arity; coordinate assertions.

- [ ] **Step 3: Implement the module changes in `tools/leadsToPipeline.ts`**

(a) Extend the `FieldDef.type` union:

```ts
  type: "text" | "textarea" | "number" | "phone" | "dropdown" | "coordinate";
```

(b) In `LEAD_PIPELINE_FIELDS`, replace the `lat`(pos 10) + `lng`(pos 11) entries with one `coordinate` entry, and renumber `source_lead_id` to 11:

```ts
  { key: "distance_m", label: "Jarak ODP (m)", type: "number", showOnCard: false, position: 9 },
  { key: "coordinate", label: "Koordinat", type: "coordinate", showOnCard: false, position: 10 },
  { key: "source_lead_id", label: "Sumber Lead ID", type: "number", showOnCard: false, position: 11 },
```

(c) In `leadToFieldValues`, remove the `["lat", lead.lat]` and `["lng", lead.lng]` rows from the `raw` array, then append a combined coordinate value after the loop (before `return out;`):

```ts
  // Coordinate: one field combining lat+lng, only when both are finite numbers.
  if (typeof lead.lat === "number" && Number.isFinite(lead.lat) &&
      typeof lead.lng === "number" && Number.isFinite(lead.lng)) {
    out.push({ fieldKey: "coordinate", value: JSON.stringify({ lat: lead.lat, lng: lead.lng }) });
  }
  return out;
```

(d) Change `leadToCard` to take an explicit `assigneeId` (replacing the internal `lead.assigned_to ?? null`):

```ts
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
```

(e) Add the pure `resolveAssignee` helper (place it right after `leadToCard`):

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx --test tools/leadsToPipeline.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add tools/leadsToPipeline.ts tools/leadsToPipeline.test.ts
git commit -m "feat(pipelines): import maps coordinate field + tenant-resolved assignee (mapping)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Runner — tenant user ids, `--default-assignee`, tallies

**Files:**
- Modify: `tools/import-leads-to-pipeline.ts`

- [ ] **Step 1: Import `resolveAssignee`**

In `tools/import-leads-to-pipeline.ts`, add `resolveAssignee` to the existing import from `./leadsToPipeline.js` (which already imports `leadToCard`, `leadToFieldValues`, etc.).

- [ ] **Step 2: Parse `--default-assignee` + update `--help`**

After the `const RESET = args.includes("--reset");` line, add:

```ts
const daIdx = args.indexOf("--default-assignee");
const defaultAssignee = daIdx >= 0 ? Number(args[daIdx + 1]) : null;
if (daIdx >= 0 && (!Number.isInteger(defaultAssignee as number) || (defaultAssignee as number) <= 0)) {
  console.error("ERROR: --default-assignee harus userId integer > 0.");
  process.exit(1);
}
```

In the `--help` text array, add a line documenting the flag, e.g. after the `--reset` line:

```ts
      "  --default-assignee <userId>   assignee fallback when a lead's assignee isn't a JABNET user (else unassigned).",
```

- [ ] **Step 3: Load the tenant's valid user ids**

Before the leads loop (e.g. right after `const SYSTEM_USER` is resolved, ~line 98), add:

```ts
  const userRows = await q(`SELECT DISTINCT user_id FROM user_mitras WHERE mitra_id = ?`, [MITRA_ID]);
  const validUserIds = new Set<number>(userRows.map((r: any) => Number(r.user_id)));
```

- [ ] **Step 4: Resolve assignee per lead + tally**

Extend the counters line (~127) to add assignee + coordinate tallies:

```ts
  let nCards = 0, nValues = 0, nComments = 0, nActivity = 0, nPhotos = 0, nPhotoSkipped = 0;
  let nAssignMatched = 0, nAssignDefault = 0, nAssignSkipped = 0, nCoord = 0;
```

Replace the `const c = leadToCard(lead, stageIdByKey);` line (~129) with assignee resolution + tally:

```ts
    const assigneeId = resolveAssignee(lead.assigned_to ?? null, validUserIds, defaultAssignee);
    if (assigneeId != null && assigneeId === (lead.assigned_to ?? null)) nAssignMatched++;
    else if (assigneeId != null) nAssignDefault++;
    else nAssignSkipped++;
    const c = leadToCard(lead, stageIdByKey, assigneeId);
```

In the field-values insert loop, count coordinate writes — after `nValues++;` add:

```ts
      if (v.fieldKey === "coordinate") nCoord++;
```

- [ ] **Step 5: Update the summary line**

In the final `console.log(...)` summary (~171), add the coordinate + assignee tallies. For example, extend the summary string with:

```ts
      `, ${nCoord} coordinates` +
      `; assignees: ${nAssignMatched} matched, ${nAssignDefault} default, ${nAssignSkipped} unassigned.`
```

(Append these to the existing template so the line reads e.g. `[done] pipeline N "...": X cards, Y field-values, … , Z coordinates; assignees: …`.)

- [ ] **Step 6: Smoke-test `--help`**

Run: `npx tsx tools/import-leads-to-pipeline.ts --help`
Expected: exits 0 and the output mentions `--default-assignee`.

(Do NOT run the full import — it requires DB_* env + a live dev DB; that's a manual step the user runs.)

- [ ] **Step 7: Commit**

```bash
git add tools/import-leads-to-pipeline.ts
git commit -m "feat(pipelines): import runner resolves tenant assignees (--default-assignee) + tallies

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Verification

**Files:** none (verification only)

- [ ] **Step 1: Mapping tests**

Run: `npx tsx --test tools/leadsToPipeline.test.ts`
Expected: all PASS.

- [ ] **Step 2: `--help` smoke**

Run: `npx tsx tools/import-leads-to-pipeline.ts --help`
Expected: exit 0; mentions `--default-assignee`, `--reset`.

- [ ] **Step 3: App gates still green (unaffected, but confirm nothing leaked)**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npx tsx --test shared/pipelineFieldTypes.test.ts`
Expected: PASS (coordinate type unaffected).

- [ ] **Step 4: Record the manual dev re-run instruction (do NOT run it)**

The user re-runs on dev (per [[reference-run-oneoff-script-cpanel]]): bundle locally → scp → run on the box, e.g.:
```
DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=jabnet_crm_user DB_PASSWORD='Galon@12345' \
  DB_NAME=jabnet_fiber_dev node leads-import.mjs --reset [--default-assignee <userId>]
```
Then verify "Leads (Marketing)" has a **Koordinat** field (map + wilayah/ODP in the card modal) and validated assignees; check the summary tallies.

---

## Self-review notes (author)

- **Spec coverage:** coordinate field replaces lat/lng → Task 1 (b,c); phone unchanged (no edit); `resolveAssignee` + `leadToCard(assigneeId)` → Task 1 (d,e); runner tenant-id load + `--default-assignee` + tallies → Task 2; tests/smoke → Tasks 1/3. No app code/schema/migration (tools-only). `coordinate` type already exists app-side (slice D).
- **Type consistency:** `resolveAssignee(leadAssignedTo, validUserIds, defaultAssignee)`, `leadToCard(lead, stageIdByKey, assigneeId)` used identically in module, tests, and runner. `coordinate` value is `JSON.stringify({lat,lng})` everywhere.
- **Gating:** `tools/` is outside tsconfig — its gates are the tsx test + `--help` smoke; `npm run typecheck` is only a sanity check that nothing leaked into app code.
- **No placeholders.**
