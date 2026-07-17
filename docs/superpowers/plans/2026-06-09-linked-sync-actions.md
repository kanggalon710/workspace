# Linked-Card Sync Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two new automation actions — `set_field_linked` (push mapped fields to the linked sibling) and `assign_linked` (copy primary assignee to the sibling) — so field/assignee sync can be built as event-triggered rules.

**Architecture:** Mirror SP3a's `move_linked`. Both actions resolve the master sibling (`getSiblingCardInPipeline`) and write via storage directly (no re-dispatch → loop-safe). Reuses field maps + `pickMappedValues`. Widen `action_type` to `varchar(32)` so the names fit. No new pure module — logic reuses already-tested helpers.

**Tech Stack:** TypeScript, Drizzle (MySQL), Express 5, React 18, `node:test`.

**Conventions / references (mirror these exactly):**
- `move_linked` automation branch: `server/pipeline-automation.ts:86` (uses `masterForSpawn` + `getSiblingCardInPipeline`, storage-direct, no dispatch).
- `create_card` field-map block (same file) for `pickMappedValues` usage; `pickMappedValues` + `masterForSpawn` are already imported there.
- `validateActions` `move_linked` + `create_card` branches: `server/routes.ts:4447-4457` (`validateRuleFieldMaps`, `getPipelineCapabilities`).
- `ruleFormState.ts` `move_linked`/`create_card` hydrate (~116-130, ~199-216) + payload (~299-320).
- Column-MODIFY precedent: `server/storage.ts:744-749` (read `information_schema.columns`, then `ALTER … MODIFY`).
- Loop-safety invariant: automation writes go through storage directly and never call `dispatchCardEvent`/`runStageEnterAutomations`.

---

### Task 1: Widen `action_type` + extend the action-type union

**Files:** Modify `shared/schema.ts` (pipeline_rules ~667, pipeline_rule_actions ~716, `PipelineRuleActionType` ~696)

- [ ] **Step 1: Widen both columns + extend the union**

Change both occurrences of `actionType: varchar("action_type", { length: 16 })` to `{ length: 32 }` (one in `pipelineRules`, one in `pipelineRuleActions`).
Extend the union:
```ts
export type PipelineRuleActionType = "create_card" | "set_field" | "move_stage" | "assign" | "notify" | "move_linked" | "set_field_linked" | "assign_linked";
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck` → 0 errors.

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(linked-sync): widen action_type to 32 + register set_field_linked/assign_linked"
```

---

### Task 2: Migration — widen `action_type` on both tables

**Files:** Modify `server/storage.ts` (add near the other guarded migrations, e.g. after the `loyaltyColumnAdditions` loop)

- [ ] **Step 1: Add the guarded MODIFY**

```ts
// Widen action_type so longer action names (set_field_linked = 16, etc.) fit. Idempotent.
for (const table of ["pipeline_rules", "pipeline_rule_actions"]) {
  try {
    const [rows]: any = await this.pool.execute(
      `SELECT CHARACTER_MAXIMUM_LENGTH AS len FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'action_type'`,
      [table],
    );
    const len = Number((rows as any[])[0]?.len ?? 0);
    if (len > 0 && len < 32) {
      const def = table === "pipeline_rules" ? "VARCHAR(32) NOT NULL DEFAULT 'create_card'" : "VARCHAR(32) NOT NULL";
      await this.pool.execute(`ALTER TABLE \`${table}\` MODIFY action_type ${def}`);
      console.log(`[migration] widened ${table}.action_type to VARCHAR(32)`);
    }
  } catch (err: any) {
    if (err.errno !== 1146) console.warn(`[migration] ${table}.action_type widen: ${err.message}`);
  }
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(linked-sync): migration — widen action_type to VARCHAR(32)"
```

---

### Task 3: Automation — `set_field_linked` + `assign_linked` branches

**Files:** Modify `server/pipeline-automation.ts` (add after the `move_linked` branch ~line 102)

- [ ] **Step 1: Add the two branches**

Immediately AFTER the `move_linked` branch (before `set_field`), add:

```ts
  if (action.actionType === "set_field_linked") {
    if (!action.targetPipelineId) {
      console.warn(`[automation] action ${action.id}: set_field_linked needs target pipeline — skipped`);
      return false;
    }
    const masterId = masterForSpawn(card.masterCardId, card.id);
    const sibling = await storage.getSiblingCardInPipeline(masterId, action.targetPipelineId, card.id);
    if (!sibling) {
      console.warn(`[automation] action ${action.id}: no linked card in pipeline ${action.targetPipelineId} — skipped`);
      return false;
    }
    const maps = await storage.getActionFieldMaps(action.id);
    if (!maps.length) return false;
    const srcVals = await storage.getCardValues(card.id);
    const targetFieldIds = new Set((await storage.listFields(action.targetPipelineId)).map((f) => f.id));
    const writes = pickMappedValues(maps.filter((m) => targetFieldIds.has(m.targetFieldId)), srcVals);
    if (!writes.length) return false;
    await storage.setCardValues(sibling.id, writes); // storage-direct → no field_updated dispatch → loop-safe
    return true;
  }

  if (action.actionType === "assign_linked") {
    if (!action.targetPipelineId) {
      console.warn(`[automation] action ${action.id}: assign_linked needs target pipeline — skipped`);
      return false;
    }
    const masterId = masterForSpawn(card.masterCardId, card.id);
    const sibling = await storage.getSiblingCardInPipeline(masterId, action.targetPipelineId, card.id);
    if (!sibling) {
      console.warn(`[automation] action ${action.id}: no linked card in pipeline ${action.targetPipelineId} — skipped`);
      return false;
    }
    const newAssignee = card.assigneeId ?? null;
    if (newAssignee != null && !(await storage.canUserAccessPipeline(newAssignee, action.targetPipelineId))) {
      console.warn(`[automation] action ${action.id}: assignee ${newAssignee} lacks access to pipeline ${action.targetPipelineId} — skipped`);
      return false;
    }
    if (sibling.assigneeId === newAssignee) return false; // no-op
    await storage.updateCard(sibling.id, { assigneeId: newAssignee }, actorId); // storage-direct → no re-dispatch
    return true;
  }
```

(`masterForSpawn`, `pickMappedValues`, and `storage` are already imported/used in this file by `move_linked`/`create_card`.)

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 3: Commit**

```bash
git add server/pipeline-automation.ts
git commit -m "feat(linked-sync): set_field_linked + assign_linked automation branches"
```

---

### Task 4: Server validation

**Files:** Modify `server/routes.ts` (`validateActions` ~4455)

- [ ] **Step 1: Add the two branches**

Insert BEFORE the `else if (t === "set_field" || t === "move_stage" ...)` branch:

```ts
    } else if (t === "set_field_linked") {
      if (!a.targetPipelineId) return { error: "set_field_linked: targetPipelineId wajib", status: 400 };
      if ((await getPipelineCapabilities(req, Number(a.targetPipelineId))).size === 0) return { error: "Tidak punya akses ke pipeline target", status: 403 };
      const mapErr = await validateRuleFieldMaps(pipelineId, Number(a.targetPipelineId), a.fieldMaps);
      if (mapErr) return { error: mapErr, status: 400 };
    } else if (t === "assign_linked") {
      if (!a.targetPipelineId) return { error: "assign_linked: targetPipelineId wajib", status: 400 };
      if ((await getPipelineCapabilities(req, Number(a.targetPipelineId))).size === 0) return { error: "Tidak punya akses ke pipeline target", status: 403 };
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git commit -m "feat(linked-sync): validateActions accepts set_field_linked/assign_linked"
```

---

### Task 5: Client form state — `ruleFormState.ts`

**Files:** Modify `client/components/pipelines/ruleFormState.ts` (BOTH hydrate mappers ~116/199; `draftToPayload` ~299)

- [ ] **Step 1: Hydrate in BOTH mappers**

In EACH `ruleToDraft`-style mapper, add two `else if` branches alongside the existing `move_linked` one:
```ts
      } else if (a.actionType === "set_field_linked") {
        act.targetPipelineId = a.targetPipelineId != null ? String(a.targetPipelineId) : "";
        act.maps = (a.fieldMaps ?? []).map((m) => ({ sourceFieldId: m.sourceFieldId, targetFieldId: m.targetFieldId }));
      } else if (a.actionType === "assign_linked") {
        act.targetPipelineId = a.targetPipelineId != null ? String(a.targetPipelineId) : "";
```

- [ ] **Step 2: Serialize in `draftToPayload`**

Add two branches alongside the `move_linked` payload branch:
```ts
    } else if (a.actionType === "set_field_linked") {
      if (!a.targetPipelineId) return { ok: false, error: "Lengkapi pipeline target (set field tertaut)" };
      actions.push({
        actionType: "set_field_linked",
        targetPipelineId: Number(a.targetPipelineId),
        fieldMaps: a.maps
          .filter((r) => r.sourceFieldId !== "" && r.targetFieldId !== "")
          .map((r) => ({ sourceFieldId: Number(r.sourceFieldId), targetFieldId: Number(r.targetFieldId) })),
      });
    } else if (a.actionType === "assign_linked") {
      if (!a.targetPipelineId) return { ok: false, error: "Lengkapi pipeline target (sinkron assignee)" };
      actions.push({ actionType: "assign_linked", targetPipelineId: Number(a.targetPipelineId) });
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/ruleFormState.ts
git commit -m "feat(linked-sync): ruleFormState hydrate/serialize for linked-sync actions"
```

---

### Task 6: Client editor — `RuleActionEditor.tsx`

**Files:** Modify `client/components/pipelines/RuleActionEditor.tsx` (action-type Combobox + new sections)

Read first: the `move_linked` section (target-pipeline + target-stage pickers) and the `create_card` field-map section (the `value.maps` editor + the per-action `targetPipe` fetch).

- [ ] **Step 1: Add to the action-type dropdown**

In the action-type Combobox `options`, after the `move_linked` entry:
```ts
            { value: "set_field_linked", label: "Set field di kartu tertaut (pipeline lain)" },
            { value: "assign_linked", label: "Sinkron assignee ke kartu tertaut" },
```

- [ ] **Step 2: `set_field_linked` editor section**

After the `move_linked` section, add:
```tsx
      {value.actionType === "set_field_linked" && (
        <>
          <FormField label="Set field di kartu tertaut di pipeline" htmlFor="rule-sfl-pipeline" required>
            <Combobox
              options={allPipelines.map((p) => ({ value: String(p.id), label: p.name }))}
              value={value.targetPipelineId}
              onChange={(v) => patch({ targetPipelineId: v })}
              placeholder="Pilih pipeline tujuan…"
              searchPlaceholder="Cari pipeline…"
              clearable={false}
            />
          </FormField>
          {value.targetPipelineId && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Pemetaan field (sumber → kartu tertaut)</div>
              {value.maps.map((row, i) => {
                const sf = sourceFields.find((f) => f.id === Number(row.sourceFieldId));
                const compatTargets = sf ? targetFields.filter((f) => f.type === sf.type) : [];
                return (
                  <div key={`sfl-${i}-${row.sourceFieldId}-${row.targetFieldId}`} className="flex items-center gap-1">
                    <div className="flex-1 min-w-0">
                      <Combobox
                        options={sourceFields.map((f) => ({ value: String(f.id), label: f.label }))}
                        value={row.sourceFieldId === "" ? "" : String(row.sourceFieldId)}
                        onChange={(v) => setMapRow(i, { sourceFieldId: v ? Number(v) : "", targetFieldId: "" })}
                        placeholder="Field sumber…"
                      />
                    </div>
                    <span className="text-muted-foreground shrink-0">→</span>
                    <div className="flex-1 min-w-0">
                      <Combobox
                        options={compatTargets.map((f) => ({ value: String(f.id), label: f.label }))}
                        value={row.targetFieldId === "" ? "" : String(row.targetFieldId)}
                        onChange={(v) => setMapRow(i, { targetFieldId: v ? Number(v) : "" })}
                        placeholder="Field tertaut…"
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" onClick={() => removeMapRow(i)} aria-label="Hapus pemetaan">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              <Button type="button" variant="ghost" size="sm" onClick={addMapRow}>+ Tambah pemetaan</Button>
            </div>
          )}
        </>
      )}
```
(`targetFields`, `setMapRow`, `addMapRow`, `removeMapRow`, `sourceFields`, `targetPipe` are the same helpers/values the `create_card` section already uses in this component — reuse them; `targetPipe` is keyed off `value.targetPipelineId`, so `targetFields = targetPipe?.fields ?? []` already resolves for this pipeline.)

- [ ] **Step 3: `assign_linked` editor section**

After the `set_field_linked` section:
```tsx
      {value.actionType === "assign_linked" && (
        <>
          <FormField label="Sinkron assignee ke kartu tertaut di pipeline" htmlFor="rule-al-pipeline" required>
            <Combobox
              options={allPipelines.map((p) => ({ value: String(p.id), label: p.name }))}
              value={value.targetPipelineId}
              onChange={(v) => patch({ targetPipelineId: v })}
              placeholder="Pilih pipeline tujuan…"
              searchPlaceholder="Cari pipeline…"
              clearable={false}
            />
          </FormField>
          <p className="text-2xs text-muted-foreground">
            Assignee utama kartu ini disalin ke kartu tertaut (master sama) di pipeline tsb. Dijalankan via trigger "Saat assignee berubah".
          </p>
        </>
      )}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/RuleActionEditor.tsx
git commit -m "feat(linked-sync): RuleActionEditor set_field_linked + assign_linked controls"
```

---

### Task 7: Final verification

**Files:** none

- [ ] **Step 1: Existing pure tests still green**

Run: `npx tsx --test shared/linkedCardActions.test.ts shared/cardIdentity.test.ts` → all PASS.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 3: Wiring grep**

```bash
grep -rn "set_field_linked\|assign_linked" server/ client/ shared/ | grep -v node_modules
```
Expected: union (schema), migration widen, two automation branches, validateActions, ruleFormState hydrate+payload, RuleActionEditor dropdown+sections.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "chore(linked-sync): final verification fixes" || echo "nothing to commit"
```

---

## Manual acceptance (on dev)

1. Collections rule: trigger **"Saat field berubah"** → action **"Set field di kartu tertaut"** (target Delegation, map a field → its Delegation counterpart). Edit that field on a Collections card that has a linked Delegation card → the Delegation card's mapped field updates. No loop.
2. Collections rule: trigger **"Saat assignee berubah"** → action **"Sinkron assignee ke kartu tertaut"** (target Delegation). Reassign the Collections card → the linked Delegation card's primary assignee follows (if that user can access Delegation; otherwise skipped, logged).
3. Put the mirror rules on BOTH pipelines (bidirectional) → editing either side propagates once; no loop, no runaway.
4. Edit a card that has NO linked sibling → action no-ops (logged), nothing breaks.
