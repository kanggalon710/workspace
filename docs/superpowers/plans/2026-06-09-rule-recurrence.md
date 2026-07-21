# Rule Re-trigger / Recurrence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a stage_enter rule's once-per-card dedup configurable (`once` | `on_reenter` | `always`) + a manual "re-run automation" action, so the Finance flow can re-fire when a customer re-isolirs.

**Architecture:** A pure mode module (`shared/ruleRecurrence.ts`) + a `recurrence` column on `pipeline_rules` + a per-rule branch in `runRulesForCard` + a clear-on-leave hook in the move endpoint + a manual-retrigger endpoint + rule-editor + card-button UI. Default `once` = today's behavior. Reuse-vs-fresh on re-fire is already SP3a's `reuseExisting`.

**Tech Stack:** TypeScript, Drizzle (MySQL), Express 5, React 18, `node:test` via `npx tsx --test`.

**Conventions:**
- Tests `npx tsx --test`. Import `.js`. Tenant-scoped via `getMitraId()`. Drizzle MySQL: no `.returning()`.
- `ADD COLUMN` → append to the `loyaltyColumnAdditions` array (storage.ts ~690, info_schema-guarded).
- Envelope `sendSuccess`/`sendError`. Route guards `requirePermission`/`requireWritePermission`/`requirePipelineCapability`/`requireCardAccess`.
- The rule editor (`PipelineRulesDialog`) holds form state in local `useState`, hydrated via `ruleToDraft` (`applyDraft`) and reassembled by `currentDraft()` for `draftToPayload`.

---

### Task 1: Pure module `shared/ruleRecurrence.ts`

**Files:** Create `shared/ruleRecurrence.ts`; Test `shared/ruleRecurrence.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { RECURRENCE_MODES, parseRecurrence, dedupBeforeFire, recordAfterFire } from "./ruleRecurrence.js";

test("parseRecurrence: valid modes, else once", () => {
  assert.equal(parseRecurrence("once"), "once");
  assert.equal(parseRecurrence("on_reenter"), "on_reenter");
  assert.equal(parseRecurrence("always"), "always");
  assert.equal(parseRecurrence(null), "once");
  assert.equal(parseRecurrence(undefined), "once");
  assert.equal(parseRecurrence("garbage"), "once");
});

test("dedupBeforeFire / recordAfterFire: false only for always", () => {
  assert.equal(dedupBeforeFire("once"), true);
  assert.equal(dedupBeforeFire("on_reenter"), true);
  assert.equal(dedupBeforeFire("always"), false);
  assert.equal(recordAfterFire("once"), true);
  assert.equal(recordAfterFire("on_reenter"), true);
  assert.equal(recordAfterFire("always"), false);
});

test("RECURRENCE_MODES has 3 entries", () => {
  assert.equal(RECURRENCE_MODES.length, 3);
});
```

- [ ] **Step 2: Run - expect FAIL**

Run: `npx tsx --test shared/ruleRecurrence.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

Create `shared/ruleRecurrence.ts`:

```ts
/** Pure helpers for per-rule recurrence - no I/O, unit-testable. */
export type RuleRecurrence = "once" | "on_reenter" | "always";

export const RECURRENCE_MODES: { mode: RuleRecurrence; label: string; hint: string }[] = [
  { mode: "once",       label: "Sekali",                 hint: "Fire sekali seumur kartu (default)." },
  { mode: "on_reenter", label: "Saat masuk ulang stage", hint: "Fire lagi tiap kartu masuk ulang ke stage pemicu." },
  { mode: "always",     label: "Setiap kali",            hint: "Fire tiap kali kartu masuk stage pemicu." },
];

const VALID = new Set<string>(RECURRENCE_MODES.map((m) => m.mode));
export function parseRecurrence(raw: string | null | undefined): RuleRecurrence {
  return typeof raw === "string" && VALID.has(raw) ? (raw as RuleRecurrence) : "once";
}
/** Check hasRuleFired (skip when already fired) before firing? False only for always. */
export function dedupBeforeFire(mode: RuleRecurrence): boolean { return mode !== "always"; }
/** Record a fire after a successful run? False only for always. */
export function recordAfterFire(mode: RuleRecurrence): boolean { return mode !== "always"; }
```

- [ ] **Step 4: Run - expect 3/3 PASS**

Run: `npx tsx --test shared/ruleRecurrence.test.ts`

- [ ] **Step 5: Commit**

```bash
git add shared/ruleRecurrence.ts shared/ruleRecurrence.test.ts
git commit -m "feat(recurrence): pure mode parser + dedup predicates"
```

---

### Task 2: Schema column

**Files:** Modify `shared/schema.ts` (`pipelineRules` ~626; type export ~696)

- [ ] **Step 1: Add the column + type**

In `pipelineRules`, after `triggerConfig: text("trigger_config"),` add:
```ts
  recurrence: varchar("recurrence", { length: 16 }).notNull().default("once"),
```
Near the other rule type exports (after `PipelineRuleActionType`), add:
```ts
export type RuleRecurrence = "once" | "on_reenter" | "always";
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck` → 0 errors.

- [ ] **Step 3: Commit**

```bash
git add shared/schema.ts
git commit -m "feat(recurrence): pipeline_rules.recurrence column"
```

---

### Task 3: Migration

**Files:** Modify `server/storage.ts` (the `loyaltyColumnAdditions` array ~690)

- [ ] **Step 1: Append the column add**

```ts
      { table: "pipeline_rules", column: "recurrence", ddl: "VARCHAR(16) NOT NULL DEFAULT 'once'" },
```

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck && npm run build` → 0 errors; OK.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(recurrence): migration - pipeline_rules.recurrence default once"
```

---

### Task 4: Storage - persist recurrence + clear-fires methods

**Files:** Modify `server/storage.ts` (`createRule` ~2461; `updateRule` ~2469; add two clear methods near `recordRuleFire` ~2582; ensure `inArray` imported)

- [ ] **Step 1: Persist recurrence in createRule + updateRule**

In `createRule`'s `data` param type add `recurrence?: string;`. In its `.values({...})` add (import `parseRecurrence` from `../shared/ruleRecurrence.js` at the top of storage.ts):
```ts
      recurrence: parseRecurrence(data.recurrence),
```
In `updateRule`'s `data` param type add `recurrence?: string;`. In the patch-building block add:
```ts
    if (data.recurrence !== undefined) patch.recurrence = parseRecurrence(data.recurrence);
```

- [ ] **Step 2: Add the two clear methods**

After `recordRuleFire`, add:
```ts
/** Clear on_reenter fires for stage_enter rules whose trigger stage == fromStageId, for this card. */
async clearReentryFires(cardId: number, fromStageId: number, pipelineId: number): Promise<number> {
  const mitraId = getMitraId();
  const rules = await this.db.select({ id: pipelineRules.id }).from(pipelineRules)
    .where(and(
      eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.pipelineId, pipelineId),
      eq(pipelineRules.triggerType, "stage_enter"), eq(pipelineRules.triggerStageId, fromStageId),
      eq(pipelineRules.recurrence, "on_reenter"),
    ));
  if (!rules.length) return 0;
  const result: any = await this.db.delete(pipelineRuleFires).where(and(
    eq(pipelineRuleFires.mitraId, mitraId), eq(pipelineRuleFires.sourceCardId, cardId),
    inArray(pipelineRuleFires.ruleId, rules.map((r) => r.id)),
  ));
  return Number(result?.[0]?.affectedRows ?? 0);
}

/** Clear fires for ALL stage_enter rules on `stageId` for this card (manual retrigger, any recurrence). */
async clearStageFires(cardId: number, stageId: number, pipelineId: number): Promise<number> {
  const mitraId = getMitraId();
  const rules = await this.db.select({ id: pipelineRules.id }).from(pipelineRules)
    .where(and(
      eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.pipelineId, pipelineId),
      eq(pipelineRules.triggerType, "stage_enter"), eq(pipelineRules.triggerStageId, stageId),
    ));
  if (!rules.length) return 0;
  const result: any = await this.db.delete(pipelineRuleFires).where(and(
    eq(pipelineRuleFires.mitraId, mitraId), eq(pipelineRuleFires.sourceCardId, cardId),
    inArray(pipelineRuleFires.ruleId, rules.map((r) => r.id)),
  ));
  return Number(result?.[0]?.affectedRows ?? 0);
}
```

`inArray` must be in the `drizzle-orm` import (used elsewhere in storage.ts - confirm; add if missing).

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat(recurrence): persist recurrence + clearReentryFires/clearStageFires"
```

---

### Task 5: Engine - per-rule recurrence branch

**Files:** Modify `server/pipeline-automation.ts` (`runRulesForCard` ~187-198; imports at top)

- [ ] **Step 1: Add import**

```ts
import { parseRecurrence, dedupBeforeFire, recordAfterFire } from "../shared/ruleRecurrence.js";
```

- [ ] **Step 2: Branch on recurrence**

Replace the dedup check + record lines in `runRulesForCard`:

```ts
  for (const rule of rules) {
    const mode = parseRecurrence((rule as any).recurrence);
    if (opts.dedup && dedupBeforeFire(mode) && await storage.hasRuleFired(rule.id, card.id)) continue;
    const groups = parseConditionGroups(rule.conditions);
    if (groups.length) {
      const rec = await storage.getCardValues(card.id);
      const vals = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
      if (!evaluateConditionGroups(groups, vals)) continue;
    }
    const acted = await applyRuleActions(rule, card, actorId);
    if (opts.dedup && recordAfterFire(mode) && acted) await storage.recordRuleFire(rule.id, card.id);
  }
```

(Behavior: `always` never skips/records → fires every dispatch; `once`/`on_reenter` check+record as before. Event triggers pass `opts.dedup=false` → unchanged.)

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 4: Commit**

```bash
git add server/pipeline-automation.ts
git commit -m "feat(recurrence): runRulesForCard honors per-rule recurrence mode"
```

---

### Task 6: Routes - clear-on-leave, recurrence passthrough, retrigger endpoint

**Files:** Modify `server/routes.ts` (move endpoint ~4846; rule POST ~5311 + PATCH ~5359; add retrigger route near other card routes; ensure `parseRecurrence` imported)

- [ ] **Step 1: Clear-on-leave in the move endpoint**

In `POST /api/pipelines/cards/:cardId/move`, replace the re-dispatch line:
```ts
      if (cardForGuard.stageId !== card.stageId) await runStageEnterAutomations(card, req.authUser!.id);
```
with:
```ts
      if (cardForGuard.stageId !== card.stageId) {
        await storage.clearReentryFires(card.id, cardForGuard.stageId, card.pipelineId);
        await runStageEnterAutomations(card, req.authUser!.id);
      }
```

- [ ] **Step 2: Pass recurrence through rule POST + PATCH**

Add `import { parseRecurrence } from "../shared/ruleRecurrence.js";` at the top of routes.ts.
In the rule **POST** `storage.createRule(pid, { ... })` object, add:
```ts
      recurrence: parseRecurrence(b.recurrence),
```
In the rule **PATCH** `storage.updateRule(..., { ... })` object, add:
```ts
        recurrence: b.recurrence !== undefined ? parseRecurrence(b.recurrence) : undefined,
```

- [ ] **Step 3: Add the manual-retrigger endpoint**

Near the other `/api/pipelines/cards/:cardId/...` routes, add:
```ts
router.post("/api/pipelines/cards/:cardId/retrigger", async (req, res) => {
  if (!requireWritePermission(req, res, "pipelines")) return;
  const card = await storage.getCard(Number(req.params.cardId));
  if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
  if (!(await requirePipelineCapability(req, res, card.pipelineId, "cards"))) return;
  if (!(await requireCardAccess(req, res, card))) return;
  await storage.clearStageFires(card.id, card.stageId, card.pipelineId);
  await runStageEnterAutomations(card, req.authUser!.id);
  sendSuccess(res, { retriggered: true });
});
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(recurrence): clear-on-leave + recurrence passthrough + retrigger endpoint"
```

---

### Task 7: Client - recurrence in the rule editor

**Files:** Modify `client/components/pipelines/ruleFormState.ts` (`RuleDraft` ~1; `emptyDraft` ~74; `ruleToDraft` ~173; `draftToPayload` ~265); `client/components/pipelines/PipelineRulesDialog.tsx` (state ~41; `applyDraft` ~140; `currentDraft` ~163; trigger UI ~427)

- [ ] **Step 1: ruleFormState - thread recurrence**

In `RuleDraft` type add `recurrence: import("@shared/ruleRecurrence").RuleRecurrence;` (or import the type at top: `import type { RuleRecurrence } from "@shared/ruleRecurrence";` then `recurrence: RuleRecurrence;`).
In `emptyDraft()` add `recurrence: "once",`.
In `ruleToDraft` (the stage_enter/time mapper that sets `d.triggerType`), add `d.recurrence = parseRecurrence((r as any).recurrence);` (import `parseRecurrence` from `@shared/ruleRecurrence`). Do this in the function that returns the full draft for all trigger types - set it unconditionally so every draft carries it.
In `draftToPayload`, include `recurrence: d.recurrence` in the returned `payload` object (alongside `triggerPart`/actions/conditions - add it to the top-level payload spread for all branches; simplest: add `recurrence: d.recurrence,` to the final `payload` object construction).

- [ ] **Step 2: PipelineRulesDialog - state + hydrate + assemble**

Add state near the other trigger state (~line 41):
```ts
  const [recurrence, setRecurrence] = useState<"once" | "on_reenter" | "always">("once");
```
In `applyDraft(d)` (~140) add: `setRecurrence(d.recurrence);`
In `currentDraft()` (~163) add `recurrence,` to the returned object.

- [ ] **Step 3: PipelineRulesDialog - the "Pengulangan" select**

Import `RECURRENCE_MODES` from `@shared/ruleRecurrence` at the top. In the trigger section, right after the trigger-type `Combobox` (the "Pemicu" FormField ~427), add - only for stage_enter:
```tsx
              {triggerType === "stage_enter" && (
                <FormField label="Pengulangan" htmlFor="rule-recurrence"
                  hint="Sekali = fire seumur kartu. Masuk ulang = fire lagi tiap kartu kembali ke stage ini.">
                  <Combobox
                    options={RECURRENCE_MODES.map((m) => ({ value: m.mode, label: m.label }))}
                    value={recurrence}
                    onChange={(v) => setRecurrence((v || "once") as "once" | "on_reenter" | "always")}
                    clearable={false}
                  />
                </FormField>
              )}
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/ruleFormState.ts client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(recurrence): recurrence select in rule editor"
```

---

### Task 8: Client - manual retrigger button

**Files:** Modify `client/hooks/usePipelines.ts` (add `useRetriggerCard`); `client/components/pipelines/CardDetailModal.tsx` (button)

- [ ] **Step 1: Add the hook**

In `usePipelines.ts`:
```ts
export function useRetriggerCard(cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post(`/pipelines/cards/${cardId}/retrigger`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["card", cardId] });
      qc.invalidateQueries({ queryKey: ["card-related", cardId] });
    },
  });
}
```
(Match the exact `api.post` signature + the card query key used by `useCard` in this file - verify and adjust the key if different.)

- [ ] **Step 2: Add the button to CardDetailModal**

Import `useRetriggerCard` + (if not present) `toast` from "sonner". Inside the component:
```ts
  const retrigger = useRetriggerCard(cardId);
```
Render a button where card actions live (near the top action row), only when `writable && (caps.length === 0 || caps.includes("cards"))`:
```tsx
        <Button type="button" variant="ghost" size="sm" loading={retrigger.isPending}
          onClick={() => retrigger.mutate(undefined, {
            onSuccess: () => toast.success("Otomasi dijalankan ulang"),
            onError: (e: any) => toast.error(e?.message || "Gagal menjalankan ulang"),
          })}>
          <RotateCw className="size-4 mr-1.5" /> Jalankan ulang otomasi
        </Button>
```
Import `RotateCw` from "lucide-react".

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 4: Commit**

```bash
git add client/hooks/usePipelines.ts client/components/pipelines/CardDetailModal.tsx
git commit -m "feat(recurrence): manual 'jalankan ulang otomasi' button"
```

---

### Task 9: Final verification

**Files:** none

- [ ] **Step 1: Pure tests**

Run: `npx tsx --test shared/ruleRecurrence.test.ts` → 3/3 PASS.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 3: Wiring grep**

```bash
grep -rn "recurrence\|clearReentryFires\|clearStageFires\|retrigger\|dedupBeforeFire" server/ client/ shared/ | grep -v node_modules | grep -v test
```
Expected: column (schema + migration), engine branch, move-hook, retrigger route+hook+button, rule passthrough, editor select.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "chore(recurrence): final verification fixes" || echo "nothing to commit"
```

---

## Manual acceptance (on dev)

1. Collections rule "Follow Up 1" → mirror to Delegation; set **Pengulangan = Saat masuk ulang stage**.
2. Move a card into Follow Up 1 → Delegation card spawned. Move it OUT (to New), then back into Follow Up 1 → the rule fires **again** (reuseExisting on → same Delegation card updated; off → fresh card).
3. A rule with **Sekali** → re-entry does NOT re-fire.
4. A rule with **Setiap kali** → fires on every entry, no fire record.
5. On a card, click **"Jalankan ulang otomasi"** → current stage's rules re-run immediately (toast confirms).
