# Pipelines Condition Groups (P4d-3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rule conditions go from a flat AND-list to **ANY-of-groups** (`(A∧B) ∨ (C∧D)`): the rule fires if any group matches, a group matches when all its conditions match.

**Architecture:** `pipeline_rules.conditions` (opaque JSON) now holds `{ groups: RuleCondition[][] }`; a legacy flat `RuleCondition[]` is auto-treated as one AND group by the parser, so NO DB migration. The pure `evaluateConditionGroups` reuses the existing per-group `evaluateConditions` (the OR is `.some()`). GET always returns the grouped+labelled shape; the dialog gets a grouped builder. Conditions stay rule-level.

**Tech Stack:** Node/Express + Drizzle MySQL + tsx; React 18 + TS + Vite; tests via `node:test` (`npx tsx --test`).

**Base branch:** `feat/pipelines-condition-groups` (off `dev`). Spec: `docs/superpowers/specs/2026-06-06-pipelines-condition-groups-design.md`.

**Canonical shapes (keep identical across tasks):**
- Stored `conditions` JSON: `null` | legacy `RuleCondition[]` | `{ groups: RuleCondition[][] }`.
- GET-enriched `conditions`: `{ groups: RuleConditionWithLabel[][] }` (always grouped; legacy → one group).
- Client `RuleDraft.conditions`: `DraftCondition[][]` (groups). `draftToPayload` emits `conditions: groups.length ? { groups } : null`.

**Verification (whole-repo):** `npm run typecheck` (0) · `npx tsx --test server/pipeline-automation-helpers.test.ts` (all pass) · `npm run build`.

---

### Task 1: Schema type + pure helpers + tests (TDD)

**Files:**
- Modify: `shared/schema.ts`, `server/pipeline-automation-helpers.ts`, `server/pipeline-automation-helpers.test.ts`

- [ ] **Step 1: Add the group type**

In `shared/schema.ts`, after `export type RuleCondition = ...` (~line 673) add:
```ts
export type RuleConditionGroup = RuleCondition[]; // AND within a group; rule passes if ANY group passes
```

- [ ] **Step 2: Write failing tests**

In `server/pipeline-automation-helpers.test.ts`, add `parseConditionGroups, evaluateConditionGroups` to the import from `"./pipeline-automation-helpers.js"`. Append:
```ts
test("parseConditionGroups: legacy flat array → one AND group", () => {
  assert.deepEqual(parseConditionGroups(JSON.stringify([{ fieldId: 1, op: "eq", value: "x" }])), [[{ fieldId: 1, op: "eq", value: "x" }]]);
});

test("parseConditionGroups: {groups} shape parsed; empty groups dropped; null → []", () => {
  const raw = JSON.stringify({ groups: [[{ fieldId: 1, op: "eq", value: "a" }], [], [{ fieldId: 2, op: "not_empty" }]] });
  assert.deepEqual(parseConditionGroups(raw), [[{ fieldId: 1, op: "eq", value: "a" }], [{ fieldId: 2, op: "not_empty" }]]);
  assert.deepEqual(parseConditionGroups(null), []);
  assert.deepEqual(parseConditionGroups("{bad"), []);
  assert.deepEqual(parseConditionGroups(JSON.stringify({ groups: [[{ nope: true }]] })), []); // bad entries filtered → group empty → dropped
});

test("evaluateConditionGroups: no groups → true (always run)", () => {
  assert.equal(evaluateConditionGroups([], new Map()), true);
});

test("evaluateConditionGroups: ANY group passing → true; none → false", () => {
  const vals = new Map([[1, "Tinggi"], [2, "rendah"]]);
  // (1 eq Tinggi AND 2 eq tinggi) OR (1 eq Sedang)  → group1 fails (2≠tinggi), group2 fails → false
  assert.equal(evaluateConditionGroups([[{ fieldId: 1, op: "eq", value: "Tinggi" }, { fieldId: 2, op: "eq", value: "tinggi" }], [{ fieldId: 1, op: "eq", value: "Sedang" }]], vals), false);
  // (1 eq Tinggi) OR (1 eq Sedang) → group1 passes → true
  assert.equal(evaluateConditionGroups([[{ fieldId: 1, op: "eq", value: "Tinggi" }], [{ fieldId: 1, op: "eq", value: "Sedang" }]], vals), true);
  // single group AND: 1 eq Tinggi AND 2 not_empty → true
  assert.equal(evaluateConditionGroups([[{ fieldId: 1, op: "eq", value: "Tinggi" }, { fieldId: 2, op: "not_empty" }]], vals), true);
});
```

- [ ] **Step 3: Run tests, verify FAIL**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: FAIL — `parseConditionGroups`/`evaluateConditionGroups` not exported.

- [ ] **Step 4: Implement**

Append to `server/pipeline-automation-helpers.ts` (it already has `parseConditions` + `evaluateConditions` + imports `RuleCondition`):
```ts
/** Parse stored conditions into AND-groups. Accepts a legacy flat array (→ one group)
 *  or { groups: [...] }. Drops malformed entries + empty groups. Malformed → []. */
export function parseConditionGroups(raw: string | null): RuleCondition[][] {
  if (!raw) return [];
  let parsed: any;
  try { parsed = JSON.parse(raw); } catch { return []; }
  const rawGroups: any[] = Array.isArray(parsed) ? [parsed]
    : (parsed && Array.isArray(parsed.groups)) ? parsed.groups : [];
  const groups: RuleCondition[][] = [];
  for (const g of rawGroups) {
    if (!Array.isArray(g)) continue;
    const conds = g.filter((c) => c && typeof c.fieldId === "number" && typeof c.op === "string") as RuleCondition[];
    if (conds.length) groups.push(conds);
  }
  return groups;
}

/** ANY-of-groups: true if no groups; else some group passes (all its conditions, AND). */
export function evaluateConditionGroups(groups: RuleCondition[][], values: Map<number, string>): boolean {
  if (groups.length === 0) return true;
  return groups.some((g) => evaluateConditions(g, values));
}
```

- [ ] **Step 5: Run tests, verify PASS**

Run: `npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: all pass (prior + 4 new). Run `npm run typecheck` → 0.

- [ ] **Step 6: Commit**

```bash
git add shared/schema.ts server/pipeline-automation-helpers.ts server/pipeline-automation-helpers.test.ts
git commit -m "feat(pipelines): condition groups — RuleConditionGroup type + parseConditionGroups/evaluateConditionGroups (P4d-3)"
```

---

### Task 2: Engine — swap to group evaluation

**Files:**
- Modify: `server/pipeline-automation.ts`

- [ ] **Step 1: Update imports + both runners**

In the import from `"./pipeline-automation-helpers.js"`, replace `parseConditions` with `parseConditionGroups` and `evaluateConditions` with `evaluateConditionGroups` (if `parseConditions`/`evaluateConditions` are not used elsewhere in this file — grep to confirm; they are only used in the two condition gates).

In `runStageEnterAutomations`, the condition gate currently:
```ts
      const conds = parseConditions(rule.conditions);
      if (conds.length) {
        const rec = await storage.getCardValues(card.id);
        const valsMap = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
        if (!evaluateConditions(conds, valsMap)) continue;
      }
```
becomes:
```ts
      const groups = parseConditionGroups(rule.conditions);
      if (groups.length) {
        const rec = await storage.getCardValues(card.id);
        const valsMap = new Map<number, string>(Object.entries(rec).map(([k, v]) => [Number(k), String(v)]));
        if (!evaluateConditionGroups(groups, valsMap)) continue;
      }
```

In `runTimeTriggers`, the gate currently:
```ts
          const conds = parseConditions(rule.conditions);
          ...
              if (conds.length && !evaluateConditions(conds, values)) continue;
```
becomes:
```ts
          const groups = parseConditionGroups(rule.conditions);
          ...
              if (groups.length && !evaluateConditionGroups(groups, values)) continue;
```
(The `conds.length || cfg.anchor === "field_date"` value-loading condition becomes `groups.length || cfg.anchor === "field_date"`. Update that reference too.)

- [ ] **Step 2: Typecheck + build + tests**

Run: `npm run typecheck && npm run build && npx tsx --test server/pipeline-automation-helpers.test.ts`
Expected: `pipeline-automation.ts` = 0 errors; build green; tests pass. Residuals (if any) only in `routes.ts`/client (later tasks). Report.

- [ ] **Step 3: Commit**

```bash
git add server/pipeline-automation.ts
git commit -m "feat(pipelines): engine evaluates condition groups (ANY-of-groups) (P4d-3)"
```

---

### Task 3: Routes — validateConditions (both shapes) + GET grouped enrichment

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Import swap**

In the import from `"./pipeline-automation-helpers.js"` (currently `{ shapeRuleActions, parseConditions, parseTimeTriggerConfig }`), replace `parseConditions` with `parseConditionGroups`.

- [ ] **Step 2: `validateConditions` accepts both shapes**

Replace the body of `validateConditions` (~line 4258) with:
```ts
async function validateConditions(pipelineId: number, conditions: any): Promise<string | null> {
  if (conditions == null) return null;
  const groups: any[] = Array.isArray(conditions) ? [conditions]
    : (conditions && Array.isArray(conditions.groups)) ? conditions.groups
    : null as any;
  if (groups == null) return "conditions harus array atau {groups:[...]}";
  const ops = new Set(["eq", "neq", "contains", "gt", "lt", "empty", "not_empty"]);
  const ids = new Set((await storage.listFields(pipelineId)).map((f) => f.id));
  for (const g of groups) {
    if (!Array.isArray(g)) return "Setiap grup syarat harus array";
    for (const c of g) {
      if (!c || typeof c.fieldId !== "number" || !ids.has(c.fieldId)) return "Kondisi merujuk field yang tidak ada di pipeline ini";
      if (typeof c.op !== "string" || !ops.has(c.op)) return "Operator kondisi tidak valid";
    }
  }
  return null;
}
```

- [ ] **Step 3: GET enrichment → grouped + labelled**

In the GET handler, the per-rule enrichment currently (~line 4712):
```ts
      const conds = parseConditions(r.conditions);
      const conditions = conds.map((c) => ({
        ...c, fieldLabel: srcFields.get(c.fieldId)?.label ?? `Field #${c.fieldId} (dihapus)`,
      }));
```
becomes:
```ts
      const conditionGroups = parseConditionGroups(r.conditions);
      const conditions = {
        groups: conditionGroups.map((g) => g.map((c) => ({
          ...c, fieldLabel: srcFields.get(c.fieldId)?.label ?? `Field #${c.fieldId} (dihapus)`,
        }))),
      };
```
(The returned object's `conditions` key now holds `{ groups }`. POST/PATCH `conditions: b.conditions ?? null` / `conditions: b.conditions` lines are unchanged — they pass through whatever the client sends, which is now `{ groups }` or null.)

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: routes.ts = 0 errors. Residuals appear in client (`usePipelines.ts`/`ruleFormState.ts`/`PipelineRulesDialog.tsx`) only after Task 4 changes the hook type — at THIS point client still compiles (it reads `r.conditions` as an array, and the server type isn't statically linked to the client). Report whatever residuals (likely none yet). If `parseConditions` is now an unused import in routes.ts, remove it from the import.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): rule routes — validateConditions accepts groups + GET grouped enrichment (P4d-3)"
```

---

### Task 4: Client hook type + ruleFormState

**Files:**
- Modify: `client/hooks/usePipelines.ts`, `client/components/pipelines/ruleFormState.ts`

- [ ] **Step 1: Hook type**

In `client/hooks/usePipelines.ts`, change `RuleWithMaps.conditions` from `RuleConditionWithLabel[]` to:
```ts
  conditions?: { groups: RuleConditionWithLabel[][] };
```
(`RuleConditionWithLabel` stays as-is.)

- [ ] **Step 2: ruleFormState — `RuleDraft.conditions` → groups**

In `client/components/pipelines/ruleFormState.ts`:
- Change `RuleDraft.conditions` from `DraftCondition[]` to `DraftCondition[][]`.
- `emptyDraft()`: `conditions: []` stays valid (empty = no groups).
- `ruleToDraft`: replace the conditions mapping
  ```ts
  d.conditions = (r.conditions ?? []).map((c) => ({ fieldId: c.fieldId, op: c.op, value: c.value ?? "" }));
  ```
  with:
  ```ts
  d.conditions = (r.conditions?.groups ?? []).map((g) =>
    g.map((c) => ({ fieldId: c.fieldId, op: c.op, value: c.value ?? "" })),
  );
  ```
- `draftToPayload`: replace the flat conditions build
  ```ts
  const conditions = d.conditions
    .filter((c) => c.fieldId !== "")
    .map((c) => ({ fieldId: Number(c.fieldId), op: c.op, ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }) }));
  ```
  with a grouped build:
  ```ts
  const conditionGroups = d.conditions
    .map((g) => g
      .filter((c) => c.fieldId !== "")
      .map((c) => ({ fieldId: Number(c.fieldId), op: c.op, ...(c.op === "empty" || c.op === "not_empty" ? {} : { value: c.value }) })))
    .filter((g) => g.length > 0);
  ```
  Then in the final returned payload, change `conditions` to:
  ```ts
  conditions: conditionGroups.length ? { groups: conditionGroups } : null,
  ```
  (The payload object is `{ ...triggerPart, conditions: ..., actions }` — keep `actions` as-is from P4d-1.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: ruleFormState.ts = 0 errors. NEW residuals now in `PipelineRulesDialog.tsx` (its `conditions` state is `DraftCondition[]`, the `<ConditionsBuilder>` value type mismatch, and the read-side reads `r.conditions.length`/`.map`) — fixed in Tasks 5-6. Report the residual list (should be confined to PipelineRulesDialog.tsx + possibly ConditionsBuilder.tsx usage).

- [ ] **Step 4: Commit**

```bash
git add client/hooks/usePipelines.ts client/components/pipelines/ruleFormState.ts
git commit -m "feat(pipelines): RuleWithMaps.conditions grouped + ruleFormState over condition groups (P4d-3)"
```

---

### Task 5: `ConditionsBuilder` — grouped UI

**Files:**
- Modify: `client/components/pipelines/ConditionsBuilder.tsx`

- [ ] **Step 1: Rewrite the builder over groups**

Replace the component (keep the imports, `DraftCondition` type, `OPS`, `NEEDS_VALUE` unchanged) so `value`/`onChange` are `DraftCondition[][]`:
```tsx
export function ConditionsBuilder({
  fields,
  value,
  onChange,
}: {
  fields: PipelineField[];
  value: DraftCondition[][];
  onChange: (next: DraftCondition[][]) => void;
}) {
  const setGroup = (gi: number, next: DraftCondition[]) =>
    onChange(value.map((g, idx) => (idx === gi ? next : g)));
  const setRow = (gi: number, ri: number, patch: Partial<DraftCondition>) =>
    setGroup(gi, value[gi].map((row, idx) => (idx === ri ? { ...row, ...patch } : row)));
  const addRow = (gi: number) => setGroup(gi, [...value[gi], { fieldId: "", op: "eq", value: "" }]);
  const removeRow = (gi: number, ri: number) => {
    const next = value[gi].filter((_, idx) => idx !== ri);
    if (next.length === 0) onChange(value.filter((_, idx) => idx !== gi)); // drop now-empty group
    else setGroup(gi, next);
  };
  const addGroup = () => onChange([...value, [{ fieldId: "", op: "eq", value: "" }]]);
  const removeGroup = (gi: number) => onChange(value.filter((_, idx) => idx !== gi));

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">
        Syarat (opsional) — cocok jika SALAH SATU grup terpenuhi
      </div>
      {value.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="text-[10px] font-semibold text-muted-foreground/70 my-1 text-center">ATAU</div>}
          <fieldset className="rounded-lg border border-border/60 p-2 space-y-1.5 m-0">
            <legend className="text-[10px] uppercase tracking-wide text-muted-foreground/70 px-1">
              Grup #{gi + 1} — semua harus terpenuhi (DAN)
            </legend>
            {group.map((row, ri) => (
              <div key={ri} className="flex items-center gap-1">
                <div className="flex-1 min-w-0">
                  <Combobox
                    options={fields.map((f) => ({ value: String(f.id), label: f.label }))}
                    value={row.fieldId === "" ? "" : String(row.fieldId)}
                    onChange={(v) => setRow(gi, ri, { fieldId: v ? Number(v) : "" })}
                    placeholder="Field…" searchPlaceholder="Cari field…"
                  />
                </div>
                <div className="w-36 shrink-0">
                  <Combobox
                    options={OPS.map((o) => ({ value: o.value, label: o.label }))}
                    value={row.op}
                    onChange={(v) => setRow(gi, ri, { op: (v || "eq") as RuleConditionOp })}
                    placeholder="Operator…" clearable={false}
                  />
                </div>
                {NEEDS_VALUE(row.op) && (
                  <div className="flex-1 min-w-0">
                    <Input value={row.value} onChange={(e) => setRow(gi, ri, { value: e.target.value })} placeholder="Nilai…" />
                  </div>
                )}
                <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label="Hapus syarat" onClick={() => removeRow(gi, ri)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => addRow(gi)}>+ Tambah syarat</Button>
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" aria-label="Hapus grup" onClick={() => removeGroup(gi)}>Hapus grup</Button>
            </div>
          </fieldset>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={addGroup}>+ Tambah grup (ATAU)</Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: ConditionsBuilder.tsx compiles. Residuals remain ONLY in `PipelineRulesDialog.tsx` (its `conditions` state is still `DraftCondition[]` + read-side). Report.

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/ConditionsBuilder.tsx
git commit -m "feat(pipelines): ConditionsBuilder grouped UI (AND within, OR between groups) (P4d-3)"
```

---

### Task 6: Dialog — grouped state + read-side

**Files:**
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`

- [ ] **Step 1: Conditions state type**

Change the conditions state from `const [conditions, setConditions] = useState<DraftCondition[]>([]);` to:
```ts
  const [conditions, setConditions] = useState<DraftCondition[][]>([]);
```
`applyDraft`'s `setConditions(d.conditions)` and `currentDraft`'s `conditions` reference need no change (the type now flows as `DraftCondition[][]`). The `<ConditionsBuilder fields={sourceFields} value={conditions} onChange={setConditions} />` call is unchanged (types now align with Task 5). Verify those compile.

- [ ] **Step 2: Read-side — collapsed badge**

The collapsed-row badge (~line 244):
```tsx
                            {r.conditions && r.conditions.length > 0 && (
                              <span className="text-[10px] text-muted-foreground ml-1">· {r.conditions.length} syarat</span>
                            )}
```
becomes:
```tsx
                            {(r.conditions?.groups?.length ?? 0) > 0 && (
                              <span className="text-[10px] text-muted-foreground ml-1">· {r.conditions!.groups.length} grup syarat</span>
                            )}
```

- [ ] **Step 3: Read-side — detail panel groups**

The detail "Syarat" block (~lines 295-307):
```tsx
                          {r.conditions && r.conditions.length > 0 && (
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Syarat (semua harus terpenuhi)</div>
                              <div className="space-y-1">
                                {r.conditions.map((c, i) => ( ... ))}
                              </div>
                            </div>
                          )}
```
becomes (groups: DAN within, ATAU between):
```tsx
                          {(r.conditions?.groups?.length ?? 0) > 0 && (
                            <div>
                              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">Syarat — cocok jika salah satu grup terpenuhi</div>
                              <div className="space-y-1.5">
                                {r.conditions!.groups.map((group, gi) => (
                                  <div key={gi}>
                                    {gi > 0 && <div className="text-[10px] font-semibold text-muted-foreground/60 my-0.5">ATAU</div>}
                                    <div className="rounded border border-border/40 px-2 py-1 space-y-0.5">
                                      {group.map((c, ci) => (
                                        <div key={ci}>
                                          {ci > 0 && <span className="text-[10px] text-muted-foreground/60 mr-1">DAN</span>}
                                          <span className="font-medium">{c.fieldLabel ?? `Field #${c.fieldId}`}</span>{" "}
                                          <span className="text-muted-foreground">{c.op}</span>{" "}
                                          {c.op !== "empty" && c.op !== "not_empty" && <span className="font-medium">{c.value}</span>}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: **0 typecheck errors** (all residuals cleared), build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(pipelines): rule dialog grouped conditions state + read-side (DAN/ATAU) (P4d-3)"
```

- [ ] **Step 6: Manual checklist (relay to user; run on dev)**

- Build a rule with two groups: Group1 = [A eq x AND B eq y], Group2 = [C not_empty]. Trigger a card matching only C → fires. Matching A&B → fires. Matching neither → doesn't.
- A legacy AND-only rule (created before this change) still fires correctly (parser treats it as one group); editing it shows one group; add a 2nd group; save → GET returns `{groups:[...]}`; re-edit round-trips.
- Remove a group's last condition → group disappears. Remove all groups → no conditions (rule always runs).
- Detail panel renders DAN within a group, ATAU between groups; collapsed badge shows "N grup syarat".
- Existing single-group create/edit + actions (P4d-1) + triggers (P4c) unaffected.

---

## Self-Review notes (addressed)

- **Spec coverage:** §1 schema type → T1; §2 helpers → T1; §3 engine → T2; §4 routes (validate + GET) → T3; §5 frontend (hook → T4, ruleFormState → T4, ConditionsBuilder → T5, dialog read-side → T6); §6 edge cases (legacy flat → one group in parser/ruleToDraft/validate; empty group dropped in parser + draftToPayload + builder removeRow; no groups → always run) covered across T1/T4/T5; §7 testing → T1 unit + T6 manual.
- **Type consistency:** stored `{groups: RuleCondition[][]}`; GET + hook `{groups: RuleConditionWithLabel[][]}`; client `RuleDraft.conditions: DraftCondition[][]`; `parseConditionGroups`/`evaluateConditionGroups` signatures consistent T1→T2→T3. `DraftCondition` unchanged.
- **DRY/SoC:** `evaluateConditionGroups` reuses `evaluateConditions`; pure helpers TDD'd; `<fieldset>/<legend>` per group + aria-labels (standards).
- **No migration:** conditions is opaque JSON; legacy flat arrays auto-handled by `parseConditionGroups` (server) — confirmed, no DB step.
- **Residual tracking:** T4 (hook type) breaks the dialog; T5 fixes the builder; T6 clears the dialog → typecheck 0.
