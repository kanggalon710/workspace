# Cross-Pipeline Linked-Card Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let automation spawn a card in another pipeline linked via SP2 lineage (`create_card` + relation), and move a linked card in another pipeline (`move_linked`) - running the Finance Collections↔Delegation flow.

**Architecture:** A pure config parser (`shared/linkedCardActions.ts`) + a sibling-finder in storage + two automation branches in `pipeline-automation.ts` (extend `create_card`, add `move_linked`) + server/client action plumbing (`validateActions`, `ruleFormState`, `RuleActionEditor`). No new tables. All cross-pipeline mutations are storage-direct (no re-dispatch) → loop-safe.

**Tech Stack:** TypeScript, Drizzle (MySQL), Express 5, React 18, `node:test` via `npx tsx --test`.

**Conventions:**
- Tests: `npx tsx --test <file>` (NO `npm test`). Import extensions `.js`.
- Tenant-scoped via `getMitraId()`. Drizzle MySQL: no `.returning()`.
- `createCard(pipelineId, data, userId)` already accepts `masterCardId?/originCardId?/relationType?` (SP2).
- Loop-safety invariant (pipeline-automation.ts:166): automation mutations call storage **directly** and never re-dispatch. Preserve this - `move_linked` uses `storage.moveCard`, which does NOT run automation.

---

### Task 1: Pure module `shared/linkedCardActions.ts`

**Files:**
- Create: `shared/linkedCardActions.ts`
- Test: `shared/linkedCardActions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/linkedCardActions.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSpawnLineageConfig, masterForSpawn } from "./linkedCardActions.js";

test("parseSpawnLineageConfig: valid relation + reuse flag", () => {
  assert.deepEqual(parseSpawnLineageConfig(JSON.stringify({ relationType: "mirror", reuseExisting: true })),
    { relationType: "mirror", reuseExisting: true });
  assert.deepEqual(parseSpawnLineageConfig(JSON.stringify({ relationType: "duplicate" })),
    { relationType: "duplicate", reuseExisting: false }); // reuse defaults false
});

test("parseSpawnLineageConfig: null on missing/invalid/bad-json", () => {
  assert.equal(parseSpawnLineageConfig(null), null);
  assert.equal(parseSpawnLineageConfig(undefined), null);
  assert.equal(parseSpawnLineageConfig(""), null);
  assert.equal(parseSpawnLineageConfig("{not json"), null);
  assert.equal(parseSpawnLineageConfig(JSON.stringify({ relationType: "bogus" })), null);
  assert.equal(parseSpawnLineageConfig(JSON.stringify({ reuseExisting: true })), null); // no relationType
});

test("masterForSpawn: root → own id, spawned → source master", () => {
  assert.equal(masterForSpawn(null, 10), 10);
  assert.equal(masterForSpawn(0, 10), 10);
  assert.equal(masterForSpawn(undefined, 7), 7);
  assert.equal(masterForSpawn(5, 10), 5);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/linkedCardActions.test.ts`
Expected: FAIL - `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write minimal implementation**

Create `shared/linkedCardActions.ts`:

```ts
/** Pure helpers for cross-pipeline linked-card actions - no I/O, unit-testable. */
import { isValidRelationType, type CardRelationType } from "./cardIdentity.js";

export interface SpawnLineageConfig { relationType: CardRelationType; reuseExisting: boolean }

/** Parse create_card's action_config for opt-in lineage. null = legacy (independent card). */
export function parseSpawnLineageConfig(raw: string | null | undefined): SpawnLineageConfig | null {
  if (!raw) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  if (!o || typeof o !== "object" || !isValidRelationType(o.relationType)) return null;
  return { relationType: o.relationType, reuseExisting: o.reuseExisting === true };
}

/** master id for a spawned card: the source's master (or the source's own id if it had none). */
export function masterForSpawn(sourceMasterId: number | null | undefined, sourceId: number): number {
  return sourceMasterId && sourceMasterId > 0 ? sourceMasterId : sourceId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/linkedCardActions.test.ts`
Expected: PASS - 3/3.

- [ ] **Step 5: Commit**

```bash
git add shared/linkedCardActions.ts shared/linkedCardActions.test.ts
git commit -m "feat(cross-pipeline): pure spawn-lineage config parser"
```

---

### Task 2: Register the `move_linked` action type

**Files:**
- Modify: `shared/schema.ts` (the `PipelineRuleActionType` union ~line 695)

- [ ] **Step 1: Extend the union**

Find `export type PipelineRuleActionType = "create_card" | "set_field" | "move_stage" | "assign" | "notify";` and change it to:

```ts
export type PipelineRuleActionType = "create_card" | "set_field" | "move_stage" | "assign" | "notify" | "move_linked";
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(cross-pipeline): add move_linked to action-type union"
```

---

### Task 3: Storage - `getSiblingCardInPipeline`

**Files:**
- Modify: `server/storage.ts` (add near `getRelatedCards` ~line 1958)

- [ ] **Step 1: Add the method**

After `getRelatedCards`, add:

```ts
/** Most-recent card in `pipelineId` sharing `masterId` (excluding `excludeCardId`). Mitra-scoped. */
async getSiblingCardInPipeline(masterId: number, pipelineId: number, excludeCardId?: number): Promise<PipelineCard | undefined> {
  const mitraId = getMitraId();
  const conds = [
    eq(pipelineCards.mitraId, mitraId),
    eq(pipelineCards.masterCardId, masterId),
    eq(pipelineCards.pipelineId, pipelineId),
  ];
  if (excludeCardId != null) conds.push(ne(pipelineCards.id, excludeCardId));
  const [row] = await this.db.select().from(pipelineCards)
    .where(and(...conds)).orderBy(desc(pipelineCards.id)).limit(1);
  return row;
}
```

(`ne`, `desc`, `and`, `eq` are already imported - added in SP2 / pre-existing.)

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(cross-pipeline): getSiblingCardInPipeline finder"
```

---

### Task 4: Automation - extend `create_card`, add `move_linked`

**Files:**
- Modify: `server/pipeline-automation.ts` (the `create_card` branch ~40-66; add a `move_linked` branch; extend the imports at the top)

Read first: the full `create_card` branch (lines 40-66) and the import block (line ~1-10).

- [ ] **Step 1: Add imports**

At the top of `server/pipeline-automation.ts`, add:

```ts
import { parseSpawnLineageConfig, masterForSpawn } from "../shared/linkedCardActions.js";
```

- [ ] **Step 2: Replace the `create_card` branch with the lineage-aware version**

Replace the entire `if (action.actionType === "create_card") { ... }` block (lines 40-66) with:

```ts
  if (action.actionType === "create_card") {
    const targetStages = await storage.listStages(action.targetPipelineId!);
    if (!targetStages.some((s) => s.id === action.targetStageId)) {
      console.warn(`[automation] action ${action.id}: target stage ${action.targetStageId} no longer exists - skipped`);
      return false;
    }
    const assigneeId = (action.copyAssignee && card.assigneeId && await storage.canUserAccessPipeline(card.assigneeId, action.targetPipelineId!))
      ? card.assigneeId : null;
    if (action.copyAssignee && card.assigneeId && assigneeId === null) {
      console.warn(`[automation] action ${action.id}: assignee ${card.assigneeId} lacks access to pipeline ${action.targetPipelineId} - created unassigned`);
    }

    // SP3a: opt-in lineage. With reuseExisting, bind to an existing sibling instead of duplicating.
    const lineage = parseSpawnLineageConfig(action.actionConfig);
    let targetCard;
    if (lineage?.reuseExisting) {
      const masterId = masterForSpawn(card.masterCardId, card.id);
      const existing = await storage.getSiblingCardInPipeline(masterId, action.targetPipelineId!);
      if (existing) targetCard = existing;
    }
    if (!targetCard) {
      targetCard = await storage.createCard(action.targetPipelineId!, {
        stageId: action.targetStageId!,
        title: buildTargetTitle(action.titleTemplate, card.title),
        description: `Dibuat otomatis dari kartu #${card.id}`,
        assigneeId,
        ...(lineage ? {
          masterCardId: masterForSpawn(card.masterCardId, card.id),
          originCardId: card.id,
          relationType: lineage.relationType,
        } : {}),
      }, actorId);
    }

    const maps = await storage.getActionFieldMaps(action.id);
    if (maps.length) {
      const srcVals = await storage.getCardValues(card.id);
      const targetFieldIds = new Set((await storage.listFields(action.targetPipelineId!)).map((f) => f.id));
      const validMaps = maps.filter((m) => targetFieldIds.has(m.targetFieldId));
      const writes = pickMappedValues(validMaps, srcVals);
      if (writes.length) await storage.setCardValues(targetCard.id, writes);
    }
    return true;
  }
```

(Behavior: no `action_config` → `lineage` is null → independent card, exactly as before. With a relation set → lineage on the new card. With `reuseExisting` → reuse a sibling if one exists.)

- [ ] **Step 3: Add the `move_linked` branch**

Immediately AFTER the `create_card` branch (before the `set_field` branch), add:

```ts
  if (action.actionType === "move_linked") {
    if (!action.targetPipelineId || !action.targetStageId) {
      console.warn(`[automation] action ${action.id}: move_linked needs target pipeline + stage - skipped`);
      return false;
    }
    const masterId = masterForSpawn(card.masterCardId, card.id);
    const sibling = await storage.getSiblingCardInPipeline(masterId, action.targetPipelineId, card.id);
    if (!sibling) {
      console.warn(`[automation] action ${action.id}: no linked card in pipeline ${action.targetPipelineId} - skipped`);
      return false;
    }
    const stages = await storage.listStages(action.targetPipelineId);
    if (!stages.some((s) => s.id === action.targetStageId)) {
      console.warn(`[automation] action ${action.id}: move_linked target stage missing - skipped`);
      return false;
    }
    if (sibling.stageId === action.targetStageId) return false; // already there → no-op
    await storage.moveCard(sibling.id, action.targetStageId, undefined, actorId); // storage-direct → no re-dispatch (loop-safe)
    return true;
  }
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 5: Commit**

```bash
git add server/pipeline-automation.ts
git commit -m "feat(cross-pipeline): create_card lineage + reuse, move_linked action"
```

---

### Task 5: Server validation - accept `move_linked`

**Files:**
- Modify: `server/routes.ts` (`validateActions` ~line 4443)

- [ ] **Step 1: Add the `move_linked` branch**

In `validateActions`, change the `else if (t === "set_field" || ...)` chain to add a `move_linked` branch BEFORE the final `else`:

```ts
    } else if (t === "move_linked") {
      if (!a.targetPipelineId || !a.targetStageId) return { error: "move_linked: targetPipelineId & targetStageId wajib", status: 400 };
      if ((await getPipelineCapabilities(req, Number(a.targetPipelineId))).size === 0) return { error: "Tidak punya akses ke pipeline target", status: 403 };
    } else if (t === "set_field" || t === "move_stage" || t === "assign" || t === "notify") {
      const cfgErr = await validateActionConfig(pipelineId, t, a.actionConfig);
      if (cfgErr) return { error: cfgErr, status: 400 };
    } else {
      return { error: `Tipe aksi tidak dikenal: ${t}`, status: 400 };
    }
```

(create_card already carries `action_config` for lineage; it's validated leniently at runtime by `parseSpawnLineageConfig`, so no extra server check is needed for the relation config.)

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git commit -m "feat(cross-pipeline): validateActions accepts move_linked"
```

---

### Task 6: Client form state - `ruleFormState.ts`

**Files:**
- Modify: `client/components/pipelines/ruleFormState.ts` (`ActionDraft` type ~20; `emptyAction` ~42; BOTH `create_card` hydrate blocks ~110 and ~185; `draftToPayload` `create_card` block ~278; add `move_linked` to hydrate + payload)

- [ ] **Step 1: Add fields to `ActionDraft` + `emptyAction`**

In the `ActionDraft` type, add after `copyAssignee: boolean;`:

```ts
  relationType: string;   // "" | mirror | duplicate | linked | child  (create_card lineage)
  reuseExisting: boolean; // create_card: bind to an existing linked card
```

In `emptyAction()`, add `relationType: "", reuseExisting: false,` to the returned object.

- [ ] **Step 2: Hydrate lineage in BOTH `create_card` blocks**

In EACH of the two `if (a.actionType === "create_card") { ... }` hydrate blocks (lines ~110 and ~185), add after the `act.maps = ...` line:

```ts
        const lc = (a.actionConfig ?? null) as { relationType?: string; reuseExisting?: boolean } | null;
        act.relationType = lc?.relationType ?? "";
        act.reuseExisting = lc?.reuseExisting === true;
```

In EACH mapper, add a `move_linked` hydrate branch (place it alongside the other `else if` branches):

```ts
      } else if (a.actionType === "move_linked") {
        act.targetPipelineId = a.targetPipelineId != null ? String(a.targetPipelineId) : "";
        act.targetStageId = a.targetStageId != null ? String(a.targetStageId) : "";
```

- [ ] **Step 3: Serialize in `draftToPayload`**

In the `create_card` payload block (~278), add `actionConfig` when a relation is set. Replace that block with:

```ts
    if (a.actionType === "create_card") {
      if (!a.targetPipelineId || !a.targetStageId) return { ok: false, error: "Lengkapi target create_card sebelum menyimpan" };
      actions.push({
        actionType: "create_card",
        targetPipelineId: Number(a.targetPipelineId),
        targetStageId: Number(a.targetStageId),
        titleTemplate: a.titleTemplate.trim() || null,
        copyAssignee: a.copyAssignee ? 1 : 0,
        actionConfig: a.relationType ? { relationType: a.relationType, reuseExisting: a.reuseExisting } : null,
        fieldMaps: a.maps
          .filter((r) => r.sourceFieldId !== "" && r.targetFieldId !== "")
          .map((r) => ({ sourceFieldId: Number(r.sourceFieldId), targetFieldId: Number(r.targetFieldId) })),
      });
    } else if (a.actionType === "move_linked") {
      if (!a.targetPipelineId || !a.targetStageId) return { ok: false, error: "Lengkapi target pindah-tertaut sebelum menyimpan" };
      actions.push({
        actionType: "move_linked",
        targetPipelineId: Number(a.targetPipelineId),
        targetStageId: Number(a.targetStageId),
      });
    } else if (a.actionType === "set_field") {
```

(Keep the rest of the chain - `set_field`/`move_stage`/`assign`/`notify` - unchanged; the snippet above just inserts the `move_linked` branch before `set_field`.)

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/ruleFormState.ts
git commit -m "feat(cross-pipeline): ruleFormState lineage + move_linked serialization"
```

---

### Task 7: Client editor - `RuleActionEditor.tsx`

**Files:**
- Modify: `client/components/pipelines/RuleActionEditor.tsx` (action-type Combobox ~70; the `create_card` editor section; add a `move_linked` section)

Read first: the action-type Combobox (lines 70-84) + the `create_card` section that renders target pipeline/stage + the field-map UI.

- [ ] **Step 1: Add `move_linked` to the action dropdown**

In the action-type `Combobox` `options` array, add after the `create_card` entry:

```ts
            { value: "move_linked", label: "Pindahkan kartu tertaut (pipeline lain)" },
```

- [ ] **Step 2: Add relation controls to the `create_card` section**

In the `create_card` block (where `value.actionType === "create_card"`), after the target-stage `FormField` and before the field-map section, add:

```tsx
          <FormField label="Tautkan sebagai (opsional)" htmlFor="rule-relation-type"
            hint="Kosong = kartu independen. Pilih relasi agar kartu baru tertaut ke entitas yang sama (muncul di 'Kartu Terkait').">
            <Combobox
              options={[
                { value: "", label: "- Tidak tertaut -" },
                { value: "mirror", label: "Mirror" },
                { value: "duplicate", label: "Duplikat" },
                { value: "linked", label: "Tertaut" },
                { value: "child", label: "Turunan" },
              ]}
              value={value.relationType}
              onChange={(v) => patch({ relationType: v })}
              placeholder="- Tidak tertaut -"
            />
          </FormField>
          {value.relationType && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={value.reuseExisting} onCheckedChange={(c) => patch({ reuseExisting: c })} />
              Gunakan kartu tertaut yang sudah ada (jangan buat duplikat)
            </label>
          )}
```

(`Switch` and `Combobox` and `FormField` are already imported in this file; `patch` is the existing updater.)

- [ ] **Step 3: Add the `move_linked` editor section**

After the `create_card` block closes, add:

```tsx
      {value.actionType === "move_linked" && (
        <>
          <FormField label="Pindahkan kartu tertaut di pipeline" htmlFor="rule-ml-pipeline" required>
            <Combobox
              options={allPipelines.map((p) => ({ value: String(p.id), label: p.name }))}
              value={value.targetPipelineId}
              onChange={(v) => patch({ targetPipelineId: v, targetStageId: "" })}
              placeholder="Pilih pipeline tujuan…"
              searchPlaceholder="Cari pipeline…"
              clearable={false}
            />
          </FormField>
          <FormField label="Ke stage" htmlFor="rule-ml-stage" required>
            <Combobox
              options={(targetPipe?.stages ?? []).map((s) => ({ value: String(s.id), label: s.label }))}
              value={value.targetStageId}
              onChange={(v) => patch({ targetStageId: v })}
              placeholder={value.targetPipelineId ? "Pilih stage target…" : "Pilih pipeline dulu…"}
              searchPlaceholder="Cari stage…"
              clearable={false}
              disabled={!value.targetPipelineId}
            />
          </FormField>
          <p className="text-2xs text-muted-foreground">
            Mencari kartu di pipeline tujuan yang berbagi entitas (master) dengan kartu ini, lalu memindahkannya ke stage tsb.
          </p>
        </>
      )}
```

(`targetPipe` is the per-action target-pipeline fetch already declared at the top of this component - reused from the `create_card` machinery. `allPipelines` is a prop.)

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/RuleActionEditor.tsx
git commit -m "feat(cross-pipeline): RuleActionEditor relation + move_linked controls"
```

---

### Task 8: Final verification

**Files:** none

- [ ] **Step 1: Pure tests**

Run: `npx tsx --test shared/linkedCardActions.test.ts shared/cardIdentity.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: 0 errors; build OK.

- [ ] **Step 3: Wiring grep**

Run:
```bash
grep -rn "move_linked\|getSiblingCardInPipeline\|parseSpawnLineageConfig\|relationType" server/ client/ shared/ | grep -v node_modules | grep -v test
```
Expected: action type registered (schema + validateActions + automation + ruleFormState + editor); finder in storage + automation.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "chore(cross-pipeline): final verification fixes" || echo "nothing to commit"
```

---

## Manual acceptance (the Finance flow, on dev)

1. **Collections** pipeline → Rules → new rule: trigger `stage_enter` "Follow Up 1"; action `Buat kartu di pipeline lain` → target Delegation / "Delegasi Isolir", **Tautkan sebagai = Mirror**, **reuse = on**, optional field maps.
2. **Delegation** pipeline → Rules → new rule: trigger `stage_enter` "WON"; action `Pindahkan kartu tertaut (pipeline lain)` → target Collections / "LUNAS".
3. Move a Collections card to "Follow Up 1" → a Delegation card appears at "Delegasi Isolir"; open either card → SP2's "Kartu Terkait" panel shows the other (Mirror badge).
4. Move the Delegation card to "WON" → the Collections card auto-moves to "LUNAS". No loop, no duplicate card.
5. Move the Collections card out of and back into "Follow Up 1" → no second Delegation card (reuseExisting). (Note: a `stage_enter` rule fires once per card via dedup anyway; reuse is the belt-and-suspenders guard + matters for SP4.)
