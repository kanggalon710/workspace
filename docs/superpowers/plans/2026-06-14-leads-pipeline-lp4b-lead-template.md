# LP4b - Built-in "Lead" Pipeline Template - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah satu preset "Pipeline Lead" bawaan ke `BUILTIN_TEMPLATES` agar user dapat membuat pipeline lead siap pakai dari dialog "Buat dari Template" yang sudah ada.

**Architecture:** Pure data addition ke `shared/pipelineTemplate.ts` (`BUILTIN_TEMPLATES`). Auto-seed per-mitra via `seedBuiltinTemplates` (idempotent by name, dipanggil startup). Tak ada tabel/endpoint/UI baru.

**Tech Stack:** TypeScript, `node:test` via `npx tsx --test`.  Spec: `docs/superpowers/specs/2026-06-14-leads-pipeline-lp4b-lead-template-design.md`.

---

## Task 1: Add "Pipeline Lead" built-in template

**Files:**
- Modify: `shared/pipelineTemplate.ts` (`BUILTIN_TEMPLATES` array ~line 103)
- Modify: `shared/pipelineTemplate.test.ts` (`built-in templates are well-formed` test ~line 69)

- [ ] **Step 1: Update the test first**

In `shared/pipelineTemplate.test.ts`, find the `built-in templates are well-formed` test. Change `assert.ok(BUILTIN_TEMPLATES.length >= 4);` to `>= 5`, and add a Lead-specific assertion at the end of that test (before its closing `});`):
```ts
  const lead = BUILTIN_TEMPLATES.find((t) => t.pipeline.name === "Pipeline Lead");
  assert.ok(lead, "Pipeline Lead template exists");
  assert.equal(lead!.stages.length, 6);
  assert.equal(lead!.fields.length, 4);
  assert.deepEqual(lead!.stages.map((s) => s.label), ["Lead Baru", "Dihubungi", "Survey", "Negosiasi", "Won", "Lost"]);
  assert.ok(lead!.fields.some((f) => f.type === "phone"));
  assert.ok(lead!.fields.some((f) => f.type === "coordinate"));
```

- [ ] **Step 2: Run test - expect fail**

Run: `npx tsx --test shared/pipelineTemplate.test.ts`
Expected: FAIL (`Pipeline Lead` not found; length 4 < 5).

- [ ] **Step 3: Add the template entry**

In `shared/pipelineTemplate.ts`, add this entry to the `BUILTIN_TEMPLATES` array (append as the last element, before the closing `];`). Match the existing entries' style exactly (uses the `nowKeyStages` helper already defined at the top of the file):
```ts
  { pipeline: { name: "Pipeline Lead", description: "Pipeline prospek/lead pemasaran", color: "#0EA5E9", icon: "users" },
    stages: nowKeyStages([{ label: "Lead Baru", color: "#6B7280" }, { label: "Dihubungi", color: "#3B82F6" }, { label: "Survey", color: "#8B5CF6" }, { label: "Negosiasi", color: "#F59E0B" }, { label: "Won", color: "#22C55E" }, { label: "Lost", color: "#EF4444" }]),
    fields: [
      { key: "field_0", label: "Telepon", type: "phone", options: null, required: 0, showOnCard: 1, position: 0, config: null },
      { key: "field_1", label: "Koordinat", type: "coordinate", options: null, required: 0, showOnCard: 0, position: 1, config: null },
      { key: "field_2", label: "Sumber", type: "dropdown", options: JSON.stringify(["canvassing", "prospect_finder", "coverage_check", "meta_leads", "tiktok_leads", "referral"]), required: 0, showOnCard: 1, position: 2, config: null },
      { key: "field_3", label: "Campaign", type: "text", options: null, required: 0, showOnCard: 0, position: 3, config: null },
    ], rules: [] },
```

- [ ] **Step 4: Run test - expect pass**

Run: `npx tsx --test shared/pipelineTemplate.test.ts`
Expected: PASS (existing + new assertions). Then `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add shared/pipelineTemplate.ts shared/pipelineTemplate.test.ts
git commit -m "feat(leads): built-in Pipeline Lead template (LP4b)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Final verification + memory

- [ ] **Step 1: Tests + typecheck + build**

Run: `npx tsx --test shared/pipelineTemplate.test.ts` → pass.
Run: `npx tsc --noEmit` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 2: Full regression**

Run: `npx tsx --test shared/*.test.ts server/*.test.ts client/**/*.test.ts`
Expected: all PASS (≥ prior 373).

- [ ] **Step 3: Smoke (optional, local DB)**

Restart server → `seedBuiltinTemplates` inserts "Pipeline Lead" per mitra → `/pipelines` → "Buat dari Template" → "Pipeline Lead" listed → apply → new pipeline with 6 stages (Lead Baru…Lost) + 4 fields (phone/coordinate/dropdown/text). Re-restart → no duplicate (idempotent by name).

- [ ] **Step 4: Update memory**

Update `memory/project-leads-pipeline-integration.md`: LP4b DONE on dev (belum push) - 1 built-in "Pipeline Lead" template in BUILTIN_TEMPLATES (reuses existing template engine); mark LP4b done in slice list.

---

## Self-Review (penulis plan - sudah dijalankan)

**Spec coverage:** §entri BUILTIN_TEMPLATES (stages+fields+rules:[])→T1 Step 3; §test count+shape→T1 Step 1; §auto-seed (no code - existing seedBuiltinTemplates)→by construction; §verify→T2. AC1-4 covered.

**Placeholder scan:** no TBD/TODO; full literal code for both the entry and the test.

**Type consistency:** entry matches `TemplateDefinition` (pipeline/stages/fields/rules); `nowKeyStages([{label,color}])` → stages with key/position/description (existing helper). Field shape `{key,label,type,options,required,showOnCard,position,config}` matches existing entries. Test references `t.pipeline.name`/`stages`/`fields` - all present.
