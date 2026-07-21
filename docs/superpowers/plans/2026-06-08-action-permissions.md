# Action-level Permissions (Phase 3b-ii) - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carve `comment / assign / export / import` out of the coarse `cards` capability as finer capabilities that `cards` supersets, so a role can be granted limited card actions without full card-edit.

**Architecture:** Add the four action keys to the pure capability model; bake the superset rule (`cards` ⇒ all actions) into `resolvePipelineCapabilities` so route gating stays a plain `set.has(action)`. Re-gate the export/import/comment routes + the assignee-only card PATCH; the access grid auto-renders the new keys; the board + card modal gate UI by the resolved caps.

**Tech Stack:** TypeScript, Drizzle (MySQL), `node:test` via `npx tsx --test`, React. `.js` imports. No schema change.

---

### Task 1: Capability model - action keys + superset rule

**Files:**
- Modify: `shared/pipelineCapabilities.ts`
- Modify: `shared/pipelineCapabilities.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `shared/pipelineCapabilities.test.ts`:

```ts
import { ACTION_CAPABILITIES } from "./pipelineCapabilities.js"; // add to the existing import if not present

test("cards supersets the action capabilities (resolver)", () => {
  const s = resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: true, keyLevel: "none", grantCapabilities: ["cards"] });
  for (const a of ACTION_CAPABILITIES) assert.ok(s.has(a), `expected ${a}`);
  assert.ok(s.has("view"));
});

test("legacy edit level includes the actions", () => {
  const caps = capabilitiesFromLevel("edit");
  for (const a of ACTION_CAPABILITIES) assert.ok(caps.includes(a));
});

test("action-only grant: has its action, not others, derives to view", () => {
  const s = resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: true, keyLevel: "none", grantCapabilities: ["view", "comment"] });
  assert.ok(s.has("comment"));
  assert.ok(!s.has("export"));
  assert.ok(!s.has("cards"));
  assert.equal(deriveLevel([...s]), "view");
});

test("non-restricted write grants all incl. actions", () => {
  const s = resolvePipelineCapabilities({ isAdmin: false, isCreator: false, restricted: false, keyLevel: "write", grantCapabilities: [] });
  assert.ok(s.has("export") && s.has("comment") && s.has("assign") && s.has("import"));
});
```
(Ensure `resolvePipelineCapabilities`, `capabilitiesFromLevel`, `deriveLevel`, `ACTION_CAPABILITIES` are all imported at the top of the test file - extend the existing import line.)

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx tsx --test shared/pipelineCapabilities.test.ts`
Expected: the new tests FAIL (ACTION_CAPABILITIES undefined / superset not applied); existing tests still pass.

- [ ] **Step 3: Extend the module**

In `shared/pipelineCapabilities.ts`:

(a) Extend the type + lists:
```ts
export type PipelineCapability = "view" | "cards" | "stages" | "fields" | "automation" | "manage" | "delete" | "comment" | "assign" | "export" | "import";

export const ALL_PIPELINE_CAPABILITIES: PipelineCapability[] = [
  "view", "cards", "stages", "fields", "automation", "manage", "delete", "comment", "assign", "export", "import",
];

export const PIPELINE_CAPABILITY_LABELS: Record<PipelineCapability, string> = {
  view: "Lihat",
  cards: "Kelola Kartu",
  stages: "Kelola Stage",
  fields: "Kelola Field",
  automation: "Kelola Otomasi",
  manage: "Kelola Pipeline",
  delete: "Hapus Pipeline",
  comment: "Komentar",
  assign: "Tugaskan",
  export: "Export",
  import: "Import",
};

/** Fine-grained card actions that the `cards` capability supersets. */
export const ACTION_CAPABILITIES: PipelineCapability[] = ["comment", "assign", "export", "import"];
```

(b) `EDIT_CLASS` stays exactly as is (do NOT add the action caps - an action-only grant must derive to
`view`). Verify `capabilitiesFromLevel("edit")` returns `[...ALL_PIPELINE_CAPABILITIES]` (it does - so it
now includes the actions automatically).

(c) In `resolvePipelineCapabilities`, the restricted branch currently is:
```ts
  const s = new Set<PipelineCapability>(grantCapabilities);
  if (s.size > 0) s.add("view");
  return s;
```
Replace with (add the superset expansion):
```ts
  const s = new Set<PipelineCapability>(grantCapabilities);
  if (s.size > 0) s.add("view");
  if (s.has("cards")) for (const a of ACTION_CAPABILITIES) s.add(a);
  return s;
```
(The admin/creator and non-restricted `write` branches already return `new Set(ALL_PIPELINE_CAPABILITIES)`, which now includes the actions - no change needed there.)

- [ ] **Step 4: Run tests to verify all pass**

Run: `npx tsx --test shared/pipelineCapabilities.test.ts`
Expected: ALL pass (existing + new).

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors (the union widening may surface a non-exhaustive switch somewhere - if so, fix it; report any).

- [ ] **Step 6: Commit**

```bash
git add shared/pipelineCapabilities.ts shared/pipelineCapabilities.test.ts
git commit -m "feat(pipelines): action capabilities (comment/assign/export/import) supersetted by cards"
```

---

### Task 2: Server - gate action routes

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Re-gate export / import / comment**

In `server/routes.ts`:
- `GET /api/pipelines/:id/cards/export` (~line 4632): change its capability gate from `"view"`/`"cards"`
  (read the current gate) to `"export"`. (Export currently uses `requirePipelineCapability(..., "view")`
  per the CSV feature - change to `"export"`. Since `cards` supersets `export`, full-card roles still pass;
  a view-only role now needs the `export` capability.)
- `POST /api/pipelines/:id/cards/import` (~line 4658): change `"cards"` → `"import"`.
- `POST /api/pipelines/cards/:cardId/comments` (~line 4853): change `"cards"` → `"comment"`.
- `DELETE /api/pipelines/cards/comments/:id` (~line 4865): change `"cards"` → `"comment"`. (Read the
  handler; it loads the comment → its card → pipelineId; keep that resolution, only change the cap arg.)

- [ ] **Step 2: Assign-only PATCH gating**

In `PATCH /api/pipelines/cards/:cardId` (~line 4728), the gate is currently
`if (!(await requirePipelineCapability(req, res, cardForGuard.pipelineId, "cards"))) return;`. Replace it with:
```ts
    const bodyKeys = Object.keys(req.body ?? {});
    const onlyAssignee = bodyKeys.length > 0 && bodyKeys.every((k) => k === "assigneeId");
    const neededCap = onlyAssignee ? "assign" : "cards";
    if (!(await requirePipelineCapability(req, res, cardForGuard.pipelineId, neededCap))) return;
```
(`cardForGuard` is already fetched above. A `cards` role passes both branches since `cards` supersets
`assign`; an assign-only role passes only assignee-only updates.)

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): gate export/import/comment/assign by action capabilities"
```

---

### Task 3: Frontend - board buttons, card modal, access-grid hint

**Files:**
- Modify: `client/pages/PipelineBoardPage.tsx`
- Modify: `client/components/pipelines/CardDetailModal.tsx`
- Modify: `client/components/pipelines/PipelineAccessDialog.tsx`

**Context:** READ all three. `PipelineBoardPage` has `const caps = new Set(pipeline?.capabilities ?? [])` and a `can(c)` helper (from the H1 capability gating). `CardDetailModal` is opened from the board and currently gets `writable`. `PipelineAccessDialog` renders a role × capability grid by iterating `ALL_PIPELINE_CAPABILITIES`.

- [ ] **Step 1: Board - gate export/import buttons by action caps**

In `PipelineBoardPage.tsx`, the CSV Export button should be gated `can("export")` and the Import button
`can("import")` (they were added in Phase 6 - Export was always-shown, Import was `can("cards")`). Update
both. Pass the resolved caps to the card modal: where `<CardDetailModal ... />` is rendered, add a prop
`caps={pipeline?.capabilities ?? []}`.

- [ ] **Step 2: CardDetailModal - accept caps; gate comment + assign**

In `CardDetailModal.tsx`:
- Add `caps?: string[]` to the component props (default `[]`).
- Derive `const canComment = caps.includes("comment"); const canAssign = caps.includes("assign");`
- The assignee `<Combobox>`/selector (around line 107, `onChange` sets assigneeId): set it `disabled`
  unless `writable && canAssign`.
- The comment composer (the input + "Kirim" button near line 160): hide or disable it unless
  `writable && canComment` (keep the comment LIST visible regardless).
(Server enforces these; this prevents dead UI. Because `cards` supersets the actions, the detail response's
`capabilities` for a full-card role already includes `comment`/`assign`, so nothing changes for them.)

- [ ] **Step 3: Access dialog - hint for action caps**

In `PipelineAccessDialog.tsx`, the grid already renders the 4 new capabilities (it iterates
`ALL_PIPELINE_CAPABILITIES`). Add a one-line muted hint below the grid: "Aksi (Komentar/Tugaskan/Export/Import)
otomatis tercakup oleh 'Kelola Kartu' - centang terpisah hanya untuk role tanpa Kelola Kartu penuh."

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add client/pages/PipelineBoardPage.tsx client/components/pipelines/CardDetailModal.tsx client/components/pipelines/PipelineAccessDialog.tsx
git commit -m "feat(pipelines): UI gating for action capabilities (export/import/comment/assign)"
```

---

### Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests** - Run: `npx tsx --test shared/pipelineCapabilities.test.ts` → all PASS.
- [ ] **Step 2: Typecheck** - Run: `npm run typecheck` → 0 errors.
- [ ] **Step 3: Build** - Run: `npm run build` → success.
- [ ] **Step 4: Wiring** - Run: `grep -rln "ACTION_CAPABILITIES\|\"export\")\|\"import\")\|\"comment\")\|\"assign\"" server/ shared/ client/ | sort` and confirm the resolver, routes (export/import/comment/assign gates), and grid reference the new caps.

---

## Self-Review

- **Spec coverage:** 4 action keys + labels + ACTION_CAPABILITIES + superset-in-resolver → Task 1. Back-compat via `capabilitiesFromLevel("edit")` (now includes actions) + EDIT_CLASS unchanged → Task 1 (b). Route gating export/import/comment + assign-only PATCH → Task 2. Grid auto-render + hint, board button gating, card modal comment/assign gating → Task 3. Tests → Task 1 + Task 4. All covered.
- **Placeholders:** Tasks 1-2 + 4 are full code. Task 3 gives concrete prop/derivation/gating instructions over the existing components (read-and-edit) - appropriate; the exact JSX lines (assignee selector ~107, comment composer ~160) are cited.
- **Type consistency:** `PipelineCapability` widened in Task 1; `ACTION_CAPABILITIES` defined there and used in Task 1 tests + referenced conceptually in Task 2 gates (gates pass the literal cap strings, which are now valid `PipelineCapability` values). `resolvePipelineCapabilities` signature unchanged (only its body adds the superset). The board's `can(c: string)` already accepts any string; `caps={pipeline.capabilities}` (string[]) flows to `CardDetailModal.caps: string[]`.

## Deploy note
No schema change. Purely additive + back-compat: existing `cards`/`edit` grants gain the action caps automatically (superset), so no role loses access. New finer grants are opt-in via the access dialog.
