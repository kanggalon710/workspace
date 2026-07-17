# Field-level Permissions (Phase 3b-i) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per (custom field × role) access — hidden / view / edit — overriding the default pipeline capability, enforced server-side and reflected in the card UI + export.

**Architecture:** A pure resolver reads `config.fieldPerms` and resolves access for a role (admin bypass; default inherits the pipeline `cards` capability). The server strips hidden field values from card/board responses, sends a `fieldAccess` map on card detail, rejects non-edit value writes, and drops hidden columns on export. The card form hides/disables fields accordingly; the field editor adds a role × level grid.

**Tech Stack:** TypeScript, Drizzle (MySQL), `node:test` via `npx tsx --test`, React. `.js` imports. No schema change (`config` column exists).

---

### Task 1: Pure module — field-permission resolver

**Files:**
- Create: `shared/fieldPermissions.ts`
- Test: `shared/fieldPermissions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/fieldPermissions.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFieldPerms, resolveFieldAccess, isFieldHiddenForRole, canEditField } from "./fieldPermissions.js";

const cfg = (perms: any) => JSON.stringify({ multiple: true, fieldPerms: perms });

test("parseFieldPerms: valid map, malformed dropped", () => {
  assert.deepEqual(parseFieldPerms(cfg({ 3: "view", 5: "hidden" })), { 3: "view", 5: "hidden" });
  assert.deepEqual(parseFieldPerms(null), {});
  assert.deepEqual(parseFieldPerms("not json"), {});
  assert.deepEqual(parseFieldPerms(cfg({ 3: "bogus", 4: "edit" })), { 4: "edit" }); // unknown level dropped
});

test("resolveFieldAccess: admin always edit", () => {
  const f = { config: cfg({ 3: "hidden" }) };
  assert.equal(resolveFieldAccess(f, 3, { isAdmin: true, baseEditable: false }), "edit");
});

test("resolveFieldAccess: explicit override per role", () => {
  const f = { config: cfg({ 3: "hidden", 4: "view" }) };
  assert.equal(resolveFieldAccess(f, 3, { isAdmin: false, baseEditable: true }), "hidden");
  assert.equal(resolveFieldAccess(f, 4, { isAdmin: false, baseEditable: true }), "view");
});

test("resolveFieldAccess: default inherits baseEditable", () => {
  const f = { config: cfg({ 3: "hidden" }) };
  assert.equal(resolveFieldAccess(f, 9, { isAdmin: false, baseEditable: true }), "edit");   // no override + cards cap
  assert.equal(resolveFieldAccess(f, 9, { isAdmin: false, baseEditable: false }), "view");  // no override + view only
  assert.equal(resolveFieldAccess({ config: null }, null, { isAdmin: false, baseEditable: true }), "edit");
});

test("isFieldHiddenForRole + canEditField", () => {
  const f = { config: cfg({ 3: "hidden", 4: "view" }) };
  assert.equal(isFieldHiddenForRole(f, 3, { isAdmin: false, baseEditable: true }), true);
  assert.equal(canEditField(f, 4, { isAdmin: false, baseEditable: true }), false);
  assert.equal(canEditField(f, 9, { isAdmin: false, baseEditable: true }), true);
  assert.equal(canEditField(f, 3, { isAdmin: true, baseEditable: false }), true); // admin
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/fieldPermissions.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the module**

Create `shared/fieldPermissions.ts`:

```ts
/** Pure resolver for per-(field × role) access. No DB, no I/O.
 *  Stored in pipeline_fields.config as { fieldPerms: { [roleId]: "hidden"|"view"|"edit" } }. */

export type FieldAccessLevel = "hidden" | "view" | "edit";
const LEVELS = new Set<FieldAccessLevel>(["hidden", "view", "edit"]);

export function parseFieldPerms(config: string | null): Record<number, FieldAccessLevel> {
  if (!config) return {};
  try {
    const c = JSON.parse(config);
    const fp = c?.fieldPerms;
    if (!fp || typeof fp !== "object") return {};
    const out: Record<number, FieldAccessLevel> = {};
    for (const [k, v] of Object.entries(fp)) {
      const id = Number(k);
      if (Number.isInteger(id) && LEVELS.has(v as FieldAccessLevel)) out[id] = v as FieldAccessLevel;
    }
    return out;
  } catch { return {}; }
}

/** Admin → edit; explicit per-role override if present; else inherit (baseEditable ? edit : view). */
export function resolveFieldAccess(
  field: { config: string | null },
  roleId: number | null,
  ctx: { isAdmin: boolean; baseEditable: boolean },
): FieldAccessLevel {
  if (ctx.isAdmin) return "edit";
  const perms = parseFieldPerms(field.config);
  if (roleId != null && perms[roleId]) return perms[roleId];
  return ctx.baseEditable ? "edit" : "view";
}

export function isFieldHiddenForRole(field: { config: string | null }, roleId: number | null, ctx: { isAdmin: boolean; baseEditable: boolean }): boolean {
  return resolveFieldAccess(field, roleId, ctx) === "hidden";
}
export function canEditField(field: { config: string | null }, roleId: number | null, ctx: { isAdmin: boolean; baseEditable: boolean }): boolean {
  return resolveFieldAccess(field, roleId, ctx) === "edit";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/fieldPermissions.test.ts`
Expected: PASS — all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/fieldPermissions.ts shared/fieldPermissions.test.ts
git commit -m "feat(pipelines): pure field-permission resolver"
```

---

### Task 2: Server enforcement — strip hidden, fieldAccess map, reject writes, export

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Add the import + a per-request helper**

At the top of `server/routes.ts`, add:
```ts
import { resolveFieldAccess, type FieldAccessLevel } from "../shared/fieldPermissions.js";
```
Add a helper near `getPipelineCapabilities` (it can call it):
```ts
/** Resolve each field's access level for the requesting user on a pipeline. */
async function fieldAccessForRequest(req: Request, pipelineId: number, fields: { id: number; config: string | null }[]): Promise<Map<number, FieldAccessLevel>> {
  const caps = await getPipelineCapabilities(req, pipelineId);
  const ctx = { isAdmin: isPipelineAdmin(req), baseEditable: caps.has("cards") };
  const roleId = req.authUser!.effectiveRoleId ?? null;
  const m = new Map<number, FieldAccessLevel>();
  for (const f of fields) m.set(f.id, resolveFieldAccess(f, roleId, ctx));
  return m;
}
```

- [ ] **Step 2: Card detail GET — strip hidden + attach fieldAccess**

In `GET /api/pipelines/cards/:cardId` (~line 4680), the handler ends with
`sendSuccess(res, { ...card, comments, activity, followers, fields, values });`. Replace that line with:
```ts
    const access = await fieldAccessForRequest(req, card.pipelineId, fields);
    const visibleValues: Record<number, string> = {};
    const fieldAccess: Record<number, FieldAccessLevel> = {};
    for (const f of fields) {
      const lvl = access.get(f.id) ?? "view";
      if (lvl === "hidden") continue;
      fieldAccess[f.id] = lvl;
      if (values[f.id] !== undefined) visibleValues[f.id] = values[f.id];
    }
    sendSuccess(res, { ...card, comments, activity, followers, fields, values: visibleValues, fieldAccess });
```

- [ ] **Step 3: Board cards GET — strip hidden values**

In `GET /api/pipelines/:id/cards` (~line 4591), it does
`sendSuccess(res, cards.map((c) => ({ ...c, values: valuesByCard[c.id] ?? {} })));`. The board is
display-only, so just strip hidden field values. Replace with:
```ts
    const fieldsForAccess = await storage.listFields(Number(req.params.id));
    const access = await fieldAccessForRequest(req, Number(req.params.id), fieldsForAccess);
    const hidden = new Set([...access.entries()].filter(([, lvl]) => lvl === "hidden").map(([id]) => id));
    sendSuccess(res, cards.map((c) => {
      const v = valuesByCard[c.id] ?? {};
      if (hidden.size === 0) return { ...c, values: v };
      const fv: Record<number, string> = {};
      for (const [fid, val] of Object.entries(v)) if (!hidden.has(Number(fid))) fv[Number(fid)] = val as string;
      return { ...c, values: fv };
    }));
```

- [ ] **Step 4: PUT /values — reject non-edit writes**

In `PUT /api/pipelines/cards/:cardId/values`, after the existing field-format validation loop and the
conditional-required enforcement, BEFORE `setCardValues`, add:
```ts
    const access = await fieldAccessForRequest(req, card.pipelineId, fields);
    for (const v of values) {
      if ((access.get(Number(v.fieldId)) ?? "view") !== "edit") {
        const f = byId.get(Number(v.fieldId));
        return sendError(res, `${f?.label ?? "Field"}: tidak boleh diubah oleh role Anda`, 403);
      }
    }
```
(`fields`/`byId`/`card` are already in scope in this handler — confirm by reading.)

- [ ] **Step 5: Export — drop hidden columns**

In `GET /api/pipelines/:id/cards/export`, after `fields` is loaded and before building `csvFields`, filter
out fields hidden for the requester:
```ts
    const access = await fieldAccessForRequest(req, pid, fields);
    const exportableFields = fields.filter((f) => (access.get(f.id) ?? "view") !== "hidden");
```
Then build `csvFields` from `exportableFields` (not `fields`) and likewise only export those field
columns. (The base columns title/stage/assignee/priority/created are unaffected.)

- [ ] **Step 6: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 7: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): enforce field-level permissions (strip/reject/export)"
```

---

### Task 3: Client — card form gating by fieldAccess

**Files:**
- Modify: `client/components/pipelines/CardDetailModal.tsx`

**Context:** the card detail response now includes `fieldAccess: { [fieldId]: "view"|"edit" }` (hidden
fields omitted from both `fieldAccess` and `values`). `FieldCustomSection` already filters by
`isFieldVisible` (Phase 4) and renders `FieldValueInput`.

- [ ] **Step 1: Gate fields by access**

In `FieldCustomSection` (reading `card.fields`, `card.fieldAccess`, `draft`, `card.stageId`):
- Build the access lookup: `const access: Record<number, "view"|"edit"> = (card as any).fieldAccess ?? {};`
- A field is shown only when present in `access` (i.e. not hidden) AND `isFieldVisible(f, ctx)`:
  ```tsx
  const visibleFields = fields.filter((f) => access[f.id] != null && isFieldVisible(f, ctx));
  ```
- Per field, the input is disabled when not editable:
  ```tsx
  const editable = writable && access[f.id] === "edit";
  // ...
  <FieldValueInput field={f} value={v} disabled={!editable} onChange={...} />
  ```
- `save()` submits only `visibleFields` that are editable:
  ```tsx
  const values = visibleFields.filter((f) => access[f.id] === "edit").map((f) => ({ fieldId: f.id, value: draft[f.id] ?? "" }));
  ```
- `missingRequired` should only consider editable fields (a `view` field can't block save):
  ```tsx
  const missingRequired = visibleFields.filter((f) => access[f.id] === "edit" && hasRequiredWhen(f) && isFieldRequired(f, ctx) && (draft[f.id] ?? "").trim() === "");
  ```
Keep the asterisk on required (visible) fields. When `fieldAccess` is absent (older server), default to
showing all (treat `access[f.id]` as `"edit"` fallback) so nothing breaks: use
`const lvl = access[f.id] ?? "edit";` and gate on `lvl !== undefined`/`=== "edit"` accordingly — i.e.
if the response has no `fieldAccess` key at all, fall back to the prior behavior (show all, editable when
`writable`). Implement the fallback explicitly: `const hasAccessMap = (card as any).fieldAccess != null;`
and when `!hasAccessMap`, treat every field as `"edit"`.

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/CardDetailModal.tsx
git commit -m "feat(pipelines): card form respects field-level access (hide/disable)"
```

---

### Task 4: Editor — role × level grid in ManageFieldsDialog

**Files:**
- Modify: `client/components/pipelines/ManageFieldsDialog.tsx`
- (maybe) Modify: `client/hooks/usePipelines.ts` (a roles query if none exists)

**Context:** READ `ManageFieldsDialog.tsx` (the create/edit form + how it builds `config` via `buildConfig`
— from the field-rules work it merges `visibleWhen`/`requiredWhen`; add `fieldPerms` the same way) and how
the app fetches roles (grep `useRoles` / `/api/roles`). The dialog already has per-field edit state.

- [ ] **Step 1: Add a "Akses per Role" section + persist fieldPerms**

- Fetch the mitra's roles (reuse an existing roles hook/endpoint; if none, add `useRoles()` calling
  `GET /api/roles`). Exclude nothing (show all roles); System-Admin/Admin are bypassed at runtime anyway.
- Add state `fieldPerms: Record<number, "hidden"|"view"|"edit">` (roleId → level); hydrate from the field's
  config on edit via `parseFieldPerms(field.config)`.
- Render a collapsible **"Akses per Role"** section: for each role a `<select>` with options
  `Default` (value "") / `Hidden` / `View` / `Edit`, bound to `fieldPerms[role.id]`.
- In `buildConfig`, after merging `visibleWhen`/`requiredWhen`, set `base.fieldPerms = fieldPerms` when it
  has at least one non-default entry, else `delete base.fieldPerms`. (Same omit-empty pattern; keep
  returning `null` when the whole config object is empty, per the existing fix.)

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/ManageFieldsDialog.tsx client/hooks/usePipelines.ts
git commit -m "feat(pipelines): per-role field access editor in ManageFieldsDialog"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests** — Run: `npx tsx --test shared/fieldPermissions.test.ts` → all PASS.
- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` → 0 errors.
- [ ] **Step 3: Build** — Run: `npm run build` → success.
- [ ] **Step 4: Wiring** — Run: `grep -rln "fieldPermissions\|fieldAccess\|fieldPerms\|resolveFieldAccess" server/ shared/ client/ | sort` → expect shared module + test, routes, card modal, manage-fields dialog.

---

## Self-Review

- **Spec coverage:** `fieldPerms` in config + resolver (admin bypass, default inherit) → Task 1. Server: strip hidden from card detail (+ `fieldAccess` map) and board, reject non-edit writes, export drops hidden → Task 2 (steps 2–5). Client hide/disable composed with Phase 4 `isFieldVisible` → Task 3. Editor role×level grid persisting to config → Task 4. Testing → Task 1 + Task 5. All covered. (Refinement: board strips only — no `fieldAccess` map needed there since it's display-only; documented in Task 2 Step 3.)
- **Placeholders:** Tasks 1–3 + 5 are full code. Tasks 2/4 flag real in-scope variables (`fields`/`byId`/`card` in the values handler; the roles hook) and instruct reading. The client fallback for an older server (no `fieldAccess` key) is specified explicitly.
- **Type consistency:** `FieldAccessLevel` + `resolveFieldAccess`/`parseFieldPerms`/`isFieldHiddenForRole`/`canEditField` (Task 1) consumed in Task 2 (`fieldAccessForRequest`) and the editor's `parseFieldPerms` hydrate (Task 4). `fieldAccessForRequest(req, pipelineId, fields)` returns `Map<number, FieldAccessLevel>` used consistently across card detail / board / values / export. `ctx { isAdmin, baseEditable }` matches the resolver signature; `baseEditable = getPipelineCapabilities(...).has("cards")`.

## Deploy note
No schema change (`config` column exists). Purely additive: fields without `fieldPerms` behave exactly as today (inherit capability); admins bypass. Composes with the Phase 4 visibility rules already in `config`.
