# Automation: Assignee Guard + Field Mapping (Phase 4a-ext) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Only copy a rule's assignee to the auto-created card if that user can see the target pipeline; (2) let a rule copy custom-field values from source→target card via explicit same-type field mappings (with config-time "create field in target").

**Architecture:** New `pipeline_rule_field_maps` table (created on startup). A `canUserAccessPipeline` storage check mirroring P3 powers the assignee guard. Rule CRUD gains `fieldMaps` (same-type validated at save); the automation service applies mapped values after creating the target card, defensively. Field creation in the target reuses the existing P2 field endpoint (no new backend).

**Tech Stack:** Node 20 · Express 5 · Drizzle (MySQL) · React 18 · TS · TanStack Query 5 · Tailwind/shadcn. Tests: `node:test` (`npx tsx --test`).

**Spec:** `docs/superpowers/specs/2026-06-04-pipelines-automation-fieldmap-design.md`

**CRITICAL conventions:** `sendSuccess` on every endpoint (never raw res.json); new TABLE via startup `CREATE TABLE IF NOT EXISTS` (never `ADD COLUMN IF NOT EXISTS`); all storage filters `mitraId = getMitraId()`; automation service must never throw to the caller (it's already wrapped in try/catch).

**Verified current state:**
- `server/pipeline-automation.ts` `runStageEnterAutomations`: loops matched rules; per rule checks `hasRuleFired`, validates target stage exists, then `await storage.createCard(rule.targetPipelineId, {stageId, title, description, assigneeId: rule.copyAssignee ? card.assigneeId : null}, actorId)` (return NOT captured today), then `recordRuleFire`. All inside one try/catch.
- Storage: `createRule(pipelineId, data, userId)`, `updateRule(id, data)`, `deleteRule(id)` (data has name/triggerStageId/targetPipelineId/targetStageId/titleTemplate/copyAssignee/enabled). `getCardValues(cardId)→Record<fieldId,value>`, `setCardValues(cardId, [{fieldId,value}])`, `listFields(pipelineId)→PipelineField[]` (each has `.id`,`.type`). `getGrantLevelForRole(pipelineId, roleId)` + `getUserEffectivePermissionsAtMitra(userId, mitraId)→{perms, roleId, roleName, isSystem}` (P3/P2/P4a). `getPipeline(id)`.
- Rule endpoints: `server/routes.ts` `POST/GET/PATCH/DELETE /api/pipelines/:id/rules[...]`, gated `requirePipelineEdit`.
- Rule dialog: `client/components/pipelines/PipelineRulesDialog.tsx`; hooks `useRules`, `usePipeline`, `usePipelines`, `usePipelineMutations` in `client/hooks/usePipelines.ts`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `shared/schema.ts` | `pipeline_rule_field_maps` table + type | Modify |
| `server/storage.ts` | startup migration; `canUserAccessPipeline`; `get/setRuleFieldMaps`; wire fieldMaps into createRule/updateRule/deleteRule | Modify |
| `server/pipeline-automation-helpers.ts` (+test) | `pickMappedValues` | Modify |
| `server/pipeline-automation.ts` | assignee guard + apply mapped values | Modify |
| `server/routes.ts` | rule endpoints: fieldMaps + same-type validation; GET returns fieldMaps | Modify |
| `client/hooks/usePipelines.ts` | rule types/mutations carry fieldMaps | Modify |
| `client/components/pipelines/PipelineRulesDialog.tsx` | "Pemetaan field" section + create-in-target | Modify |

---

## Task 1: Schema - `pipeline_rule_field_maps` + startup migration

**Files:** Modify `shared/schema.ts`, `server/storage.ts`.

- [ ] **Step 1: schema.ts** - after the Phase-4a `pipelineRuleFires` block, add:
```ts
export const pipelineRuleFieldMaps = mysqlTable("pipeline_rule_field_maps", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ruleId: int("rule_id").notNull(),
  sourceFieldId: int("source_field_id").notNull(),
  targetFieldId: int("target_field_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  uniqRuleSource: uniqueIndex("uniq_rule_field_map_source").on(t.ruleId, t.sourceFieldId),
  byRule: index("idx_rule_field_maps_mitra_rule").on(t.mitraId, t.ruleId),
}));

export type PipelineRuleFieldMap = typeof pipelineRuleFieldMaps.$inferSelect;
```

- [ ] **Step 2: storage.ts startup migration** - after the Phase-4a `pipeline_rule_fires` CREATE TABLE try/catch (search `pipeline_rule_fires setup failed`), add:
```ts
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_rule_field_maps (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          rule_id INT NOT NULL,
          source_field_id INT NOT NULL,
          target_field_id INT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE KEY uniq_rule_field_map_source (rule_id, source_field_id),
          KEY idx_rule_field_maps_mitra_rule (mitra_id, rule_id)
        )
      `);
    } catch (e: any) { console.warn(`[migration] pipeline_rule_field_maps setup failed: ${e.message}`); }
```

- [ ] **Step 3:** `npm run typecheck` → 0 errors.
- [ ] **Step 4:** commit
```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(pipelines): rule field-map schema + startup migration"
```

---

## Task 2: Pure helper `pickMappedValues` + test

**Files:** Modify `server/pipeline-automation-helpers.ts`, `server/pipeline-automation-helpers.test.ts`.

- [ ] **Step 1: add failing tests** (append to the existing test file):
```ts
import { pickMappedValues } from "./pipeline-automation-helpers.js"; // add to the existing import line

test("pickMappedValues copies non-empty source values to target field ids", () => {
  const maps = [{ sourceFieldId: 1, targetFieldId: 10 }, { sourceFieldId: 2, targetFieldId: 20 }];
  const srcVals = { 1: "169999", 2: "" };
  assert.deepEqual(pickMappedValues(maps, srcVals), [{ fieldId: 10, value: "169999" }]);
});

test("pickMappedValues skips source fields with no value entry", () => {
  const maps = [{ sourceFieldId: 5, targetFieldId: 50 }];
  assert.deepEqual(pickMappedValues(maps, {}), []);
});

test("pickMappedValues empty maps → []", () => {
  assert.deepEqual(pickMappedValues([], { 1: "x" }), []);
});
```
(Merge the `pickMappedValues` import into the existing top import from `./pipeline-automation-helpers.js`.)

- [ ] **Step 2:** run → FAIL. `npx tsx --test server/pipeline-automation-helpers.test.ts`

- [ ] **Step 3: implement** (append to `server/pipeline-automation-helpers.ts`):
```ts
/** Given field maps + the source card's values, produce the writes for the target card. */
export function pickMappedValues(
  maps: { sourceFieldId: number; targetFieldId: number }[],
  sourceValues: Record<number, string>,
): { fieldId: number; value: string }[] {
  const out: { fieldId: number; value: string }[] = [];
  for (const m of maps) {
    const v = sourceValues[m.sourceFieldId];
    if (v !== undefined && v !== "") out.push({ fieldId: m.targetFieldId, value: v });
  }
  return out;
}
```

- [ ] **Step 4:** run → PASS (8 tests total in this file). 
- [ ] **Step 5:** commit
```bash
git add server/pipeline-automation-helpers.ts server/pipeline-automation-helpers.test.ts
git commit -m "feat(pipelines): pickMappedValues helper with tests"
```

---

## Task 3: Storage - access check + field-map CRUD + wire into rule CRUD

**Files:** Modify `server/storage.ts` (extend schema import with `pipelineRuleFieldMaps, type PipelineRuleFieldMap`).

- [ ] **Step 1: add `canUserAccessPipeline`** (in the pipelines section):
```ts
  /** Can a user (by id) see (>= view) a pipeline? Mirrors the P3 resolver, non-request-scoped. */
  async canUserAccessPipeline(userId: number, pipelineId: number): Promise<boolean> {
    const mitraId = getMitraId();
    const pipe = await this.getPipeline(pipelineId);
    if (!pipe) return false;
    const eff = await this.getUserEffectivePermissionsAtMitra(userId, mitraId);
    if ((eff.roleName === "System-Admin" || eff.roleName === "admin (legacy)") && eff.isSystem) return true;
    const restricted = (pipe as any).restricted === 1;
    if (!restricted) return ((eff.perms as any)["pipelines"] ?? "none") !== "none";
    if (!eff.roleId) return false;
    return (await this.getGrantLevelForRole(pipelineId, eff.roleId)) !== "none";
  }
```

- [ ] **Step 2: add field-map storage**
```ts
  async getRuleFieldMaps(ruleId: number): Promise<PipelineRuleFieldMap[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineRuleFieldMaps)
      .where(and(eq(pipelineRuleFieldMaps.mitraId, mitraId), eq(pipelineRuleFieldMaps.ruleId, ruleId)));
  }

  async setRuleFieldMaps(ruleId: number, maps: { sourceFieldId: number; targetFieldId: number }[]): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(pipelineRuleFieldMaps).where(and(eq(pipelineRuleFieldMaps.mitraId, mitraId), eq(pipelineRuleFieldMaps.ruleId, ruleId)));
    const now = new Date().toISOString();
    for (const m of maps) {
      await this.db.insert(pipelineRuleFieldMaps).values({ mitraId, ruleId, sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId, createdAt: now } as any);
    }
  }
```

- [ ] **Step 3: wire into `createRule`/`updateRule`/`deleteRule`.**
  - `createRule`: add `fieldMaps?: { sourceFieldId: number; targetFieldId: number }[]` to the `data` param type. After the insert-reselect produces `row`, before `return row!`, add: `if (data.fieldMaps) await this.setRuleFieldMaps(row.id, data.fieldMaps);`
  - `updateRule`: add `fieldMaps?: {...}[]` to `data`. After the reselect produces `row` and before `return row`, add: `if (data.fieldMaps !== undefined) await this.setRuleFieldMaps(id, data.fieldMaps);`
  - `deleteRule`: add `await this.db.delete(pipelineRuleFieldMaps).where(and(eq(pipelineRuleFieldMaps.ruleId, id), eq(pipelineRuleFieldMaps.mitraId, mitraId)));` alongside the existing `pipelineRuleFires` delete.

- [ ] **Step 4:** `npm run typecheck` → 0 errors.
- [ ] **Step 5:** commit
```bash
git add server/storage.ts
git commit -m "feat(pipelines): canUserAccessPipeline + rule field-map storage"
```

---

## Task 4: Service - assignee guard + apply mapped values

**Files:** Modify `server/pipeline-automation.ts`.

- [ ] **Step 1: import the helper** - add `pickMappedValues` to the existing import from `./pipeline-automation-helpers.js`.

- [ ] **Step 2: replace the create-card block** inside the loop (the part from `await storage.createCard(...)` through `await storage.recordRuleFire(...)`) with:
```ts
      const assigneeId = (rule.copyAssignee && card.assigneeId && await storage.canUserAccessPipeline(card.assigneeId, rule.targetPipelineId))
        ? card.assigneeId : null;
      if (rule.copyAssignee && card.assigneeId && assigneeId === null) {
        console.warn(`[automation] rule ${rule.id}: assignee ${card.assigneeId} lacks access to pipeline ${rule.targetPipelineId} - created unassigned`);
      }
      const newCard = await storage.createCard(rule.targetPipelineId, {
        stageId: rule.targetStageId,
        title: buildTargetTitle(rule.titleTemplate, card.title),
        description: `Dibuat otomatis dari kartu #${card.id}`,
        assigneeId,
      }, actorId);
      const maps = await storage.getRuleFieldMaps(rule.id);
      if (maps.length) {
        const srcVals = await storage.getCardValues(card.id);
        const targetFieldIds = new Set((await storage.listFields(rule.targetPipelineId)).map((f) => f.id));
        const validMaps = maps.filter((m) => targetFieldIds.has(m.targetFieldId));
        const writes = pickMappedValues(validMaps, srcVals);
        if (writes.length) await storage.setCardValues(newCard.id, writes);
      }
      await storage.recordRuleFire(rule.id, card.id);
```
(The whole loop stays inside the existing outer try/catch - mapping/guard failures still never break the card action.)

- [ ] **Step 3:** `npm run typecheck && npm run build` → 0 errors, build OK.
- [ ] **Step 4:** commit
```bash
git add server/pipeline-automation.ts
git commit -m "feat(pipelines): assignee-access guard + apply mapped field values on automation"
```

---

## Task 5: Endpoints - fieldMaps payload + same-type validation + GET returns maps

**Files:** Modify `server/routes.ts` (the rule endpoints).

- [ ] **Step 1: add a validation helper** near the rule routes (module scope):
```ts
  // Validate field maps for a rule: each source field belongs to sourcePipelineId, each target to
  // targetPipelineId, and the two fields share the same type. Returns an error string or null.
  async function validateRuleFieldMaps(sourcePipelineId: number, targetPipelineId: number, maps: any): Promise<string | null> {
    if (maps === undefined) return null;
    if (!Array.isArray(maps)) return "fieldMaps harus array";
    if (maps.length === 0) return null;
    const srcFields = new Map((await storage.listFields(sourcePipelineId)).map((f) => [f.id, f]));
    const tgtFields = new Map((await storage.listFields(targetPipelineId)).map((f) => [f.id, f]));
    for (const m of maps) {
      const sf = srcFields.get(Number(m.sourceFieldId));
      const tf = tgtFields.get(Number(m.targetFieldId));
      if (!sf) return `Field sumber ${m.sourceFieldId} tidak ada di pipeline ini`;
      if (!tf) return `Field target ${m.targetFieldId} tidak ada di pipeline target`;
      if (sf.type !== tf.type) return `Tipe field tidak cocok: "${sf.label}" (${sf.type}) → "${tf.label}" (${tf.type})`;
    }
    return null;
  }
```

- [ ] **Step 2: GET /api/pipelines/:id/rules** - include each rule's fieldMaps. Replace the body:
```ts
  router.get("/api/pipelines/:id/rules", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineEdit(req, res, Number(req.params.id)))) return;
    const rules = await storage.listRules(Number(req.params.id));
    const withMaps = await Promise.all(rules.map(async (r) => ({ ...r, fieldMaps: await storage.getRuleFieldMaps(r.id) })));
    sendSuccess(res, withMaps);
  });
```

- [ ] **Step 3: POST** - accept + validate `fieldMaps`. In the create handler, after the existing target-access check and before `createRule`, add:
```ts
    const mapErr = await validateRuleFieldMaps(Number(req.params.id), Number(targetPipelineId), req.body?.fieldMaps);
    if (mapErr) return sendError(res, mapErr, 400);
```
and pass `fieldMaps: req.body?.fieldMaps` into the `storage.createRule(..., { ..., fieldMaps: req.body?.fieldMaps }, ...)` data object.

- [ ] **Step 4: PATCH** - validate when fieldMaps present. The rule's target pipeline may come from the body (`targetPipelineId`) or the existing rule. Resolve it: load the rule's current target if not in body. In the patch handler, after the existing target-access check, add:
```ts
    if (req.body?.fieldMaps !== undefined) {
      const current = (await storage.listRules(Number(req.params.id))).find((r) => r.id === Number(req.params.ruleId));
      const tgt = req.body.targetPipelineId !== undefined ? Number(req.body.targetPipelineId) : current?.targetPipelineId;
      if (!tgt) return sendError(res, "Tidak bisa resolve pipeline target untuk fieldMaps", 400);
      const mapErr = await validateRuleFieldMaps(Number(req.params.id), tgt, req.body.fieldMaps);
      if (mapErr) return sendError(res, mapErr, 400);
    }
```
and add `fieldMaps: b.fieldMaps` to the `storage.updateRule(...)` data object (it's `undefined` when not provided → storage leaves maps untouched).

- [ ] **Step 5:** `npm run typecheck && npm run build` → 0 errors, build OK.
- [ ] **Step 6:** commit
```bash
git add server/routes.ts
git commit -m "feat(pipelines): rule endpoints accept+validate fieldMaps (same-type), GET returns maps"
```

---

## Task 6: Frontend hooks - carry fieldMaps

**Files:** Modify `client/hooks/usePipelines.ts`.

- [ ] **Step 1: a rule-with-maps type + reuse mutations.** The `createRule`/`updateRule` mutations already pass the whole body object through (`(b: any) => api.post(...)` / `({ruleId, ...b}) => api.patch(...)`), so `fieldMaps` flows automatically - NO mutation change needed. Only add a type for consumption:
```ts
export type RuleWithMaps = PipelineRule & { fieldMaps?: { id: number; sourceFieldId: number; targetFieldId: number }[] };
```
and change `useRules` generic from `PipelineRule[]` to `RuleWithMaps[]`:
```ts
export function useRules(pipelineId: number | null) {
  return useQuery({
    queryKey: [KEY, "rules", pipelineId],
    queryFn: () => api.get<RuleWithMaps[]>(`/pipelines/${pipelineId}/rules`),
    enabled: !!pipelineId,
  });
}
```

- [ ] **Step 2:** `npm run typecheck` → 0 errors.
- [ ] **Step 3:** commit
```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(pipelines): useRules returns fieldMaps"
```

---

## Task 7: Frontend - "Pemetaan field" section in the rule dialog

**Files:** Modify `client/components/pipelines/PipelineRulesDialog.tsx`.

- [ ] **Step 1: load source + target fields and manage mapping rows.** The dialog already has `self = usePipeline(pipelineId)` (source) and `targetPipe = usePipeline(targetPipelineId)` (target). Add field access + mapping state:
```tsx
  const sourceFields = self?.fields ?? [];
  const targetFields = targetPipe?.fields ?? [];
  const [maps, setMaps] = useState<{ sourceFieldId: number | ""; targetFieldId: number | "" }[]>([]);
  const targetMutations = usePipelineMutations(targetPipelineId ? Number(targetPipelineId) : undefined);
```
Add a row helper + the create-in-target action:
```tsx
  const addMapRow = () => setMaps((m) => [...m, { sourceFieldId: "", targetFieldId: "" }]);
  const setMap = (i: number, patch: Partial<{ sourceFieldId: number | ""; targetFieldId: number | "" }>) =>
    setMaps((m) => m.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const removeMap = (i: number) => setMaps((m) => m.filter((_, idx) => idx !== i));

  const createInTarget = async (i: number, sourceFieldId: number) => {
    const sf = sourceFields.find((f) => f.id === sourceFieldId);
    if (!sf || !targetPipelineId) return;
    try {
      const created: any = await targetMutations.createField.mutateAsync({
        label: sf.label, type: sf.type,
        options: sf.options ? JSON.parse(sf.options) : undefined,
      });
      if (created?.id) setMap(i, { targetFieldId: created.id });
      toast.success(`Field "${sf.label}" dibuat di target`);
    } catch (e: any) { toast.error(e?.message || "Gagal membuat field di target"); }
  };
```
> `usePipelineMutations(targetId).createField` posts to `/pipelines/:targetId/fields` (P2). `created` is the new field (has `.id`). Verify the create-field mutation returns the row (it does - P2 createField reselects).

- [ ] **Step 2: include maps in create + reset; load maps when editing.** In the `add()` submit, pass `fieldMaps`:
```tsx
      await m.createRule.mutateAsync({
        triggerStageId: Number(triggerStageId), targetPipelineId: Number(targetPipelineId),
        targetStageId: Number(targetStageId), titleTemplate: titleTemplate || null, copyAssignee,
        fieldMaps: maps.filter((r) => r.sourceFieldId !== "" && r.targetFieldId !== "")
          .map((r) => ({ sourceFieldId: Number(r.sourceFieldId), targetFieldId: Number(r.targetFieldId) })),
      });
```
and reset `setMaps([])` alongside the other resets on success.

- [ ] **Step 3: render the mapping section** in the add-rule form, after the title-template field, only when a target pipeline is chosen:
```tsx
          {targetPipelineId && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Pemetaan field (opsional)</div>
              {maps.map((row, i) => {
                const sf = sourceFields.find((f) => f.id === Number(row.sourceFieldId));
                const compatTargets = sf ? targetFields.filter((f) => f.type === sf.type) : [];
                return (
                  <div key={i} className="flex items-center gap-1">
                    <div className="flex-1">
                      <Combobox options={sourceFields.map((f) => ({ value: String(f.id), label: f.label }))}
                        value={row.sourceFieldId === "" ? "" : String(row.sourceFieldId)}
                        onChange={(v) => setMap(i, { sourceFieldId: v ? Number(v) : "", targetFieldId: "" })} placeholder="Field sumber…" />
                    </div>
                    <span className="text-muted-foreground">→</span>
                    <div className="flex-1">
                      <Combobox options={compatTargets.map((f) => ({ value: String(f.id), label: f.label }))}
                        value={row.targetFieldId === "" ? "" : String(row.targetFieldId)}
                        onChange={(v) => setMap(i, { targetFieldId: v ? Number(v) : "" })} placeholder="Field target…" />
                    </div>
                    {sf && compatTargets.length === 0 && (
                      <Button variant="ghost" size="sm" onClick={() => createInTarget(i, sf.id)}>+ Buat di target</Button>
                    )}
                    <Button variant="ghost" size="icon-sm" onClick={() => removeMap(i)}><Trash2 className="size-4" /></Button>
                  </div>
                );
              })}
              <Button variant="ghost" size="sm" onClick={addMapRow}>+ Tambah pemetaan</Button>
            </div>
          )}
```

- [ ] **Step 4: rule-list summary** - append a mapped-field note. In the rule list row, after the trigger→target sentence, add:
```tsx
                {r.fieldMaps && r.fieldMaps.length > 0 && <span className="text-[10px] text-muted-foreground ml-1">· +{r.fieldMaps.length} field</span>}
```

- [ ] **Step 5:** `npm run typecheck && npm run build` → 0 errors, build OK. Verify `Combobox`/`Button` props as used in the existing dialog; adapt if needed.
- [ ] **Step 6:** commit
```bash
git add client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(pipelines): field-mapping section in rule dialog (+ create-in-target)"
```

---

## Task 8: Final verification + manual checklist + review

**Files:** none.

- [ ] **Step 1:** `npx tsx --test server/pipeline-automation-helpers.test.ts` (pass, incl. new pickMappedValues tests) + other pipeline helper tests still pass.
- [ ] **Step 2:** `npm run typecheck && npm run build` → 0 errors, build OK.
- [ ] **Step 3: manual e2e on dev** (`jabnet_fiber_dev`, restart for the new table):
  - Pipeline A has number field "harga"; pipeline B has number field "harga". Rule A(enter Stage X)→B(Stage Y), copy-assignee on, mapping harga→harga.
  - Move a card (harga=169999, assignee=X) into Stage X → B card created with harga=169999; assignee=X if X can see B, else unassigned (+ server warn).
  - Remove B's "harga", reconfigure mapping, click "+ Buat di target" → field created in B, save rule, move a card → value copied into the new field.
  - Try mapping number→text (create a text field in B, map A.harga→B.text) → save rejected with 400 (type mismatch).
  - Map to a B field, then delete that B field, then fire → value skipped, card still created, move succeeds.
  - Restricted target + assignee with no grant → unassigned. Cross-mitra isolation. Delete rule → field maps gone.
- [ ] **Step 4: whole-implementation review.** MUST verify: (a) assignee guard `canUserAccessPipeline` mirrors P3 (admin/unrestricted/restricted) + tenant-scoped; (b) field-map same-type validation enforced server-side on POST+PATCH; (c) fire-time mapping is defensive (skips deleted target fields) and inside the never-throw try/catch; (d) sendSuccess on all endpoints; (e) startup CREATE TABLE present; (f) tenant isolation on map storage; (g) deleteRule clears maps; (h) create-in-target uses the P2 endpoint against the TARGET pipeline (not source). Then STOP - user merges to dev, pushes, restarts, tests; prod only on explicit OK.

---

## Self-Review Notes (author)
- **Spec coverage:** schema+migration (T1); pickMappedValues (T2); canUserAccessPipeline + map storage + rule-CRUD wiring (T3); assignee guard + apply maps in service (T4); endpoints fieldMaps + same-type validation + GET maps (T5); hooks (T6); dialog mapping UI + create-in-target (T7); verification (T8). Soft-required untouched (correct). Out-of-scope (built-in fields, runtime create, type conversion) absent.
- **Lessons enforced:** sendSuccess (T5); startup CREATE TABLE only (T1); service stays in never-throw try/catch (T4); tenant scoping on all new storage (T3).
- **Type consistency:** `pickMappedValues` (T2) used in service (T4). Storage `canUserAccessPipeline`/`getRuleFieldMaps`/`setRuleFieldMaps` (T3) ↔ service (T4) ↔ endpoints (T5). `createRule`/`updateRule` `fieldMaps` param (T3) ↔ route payload (T5) ↔ dialog (T7). `RuleWithMaps` (T6) consumed in dialog (T7). `getUserEffectivePermissionsAtMitra` returns `roleId` (added in P3) - relied on by `canUserAccessPipeline`.
- **Flagged adaptation points:** dialog `Combobox`/`Button` props (T7) verify-before-finalize; the P2 `createField` mutation returns the created field row (confirm `.id`); the create-in-target must use `usePipelineMutations(targetPipelineId).createField` so it hits the target pipeline.
