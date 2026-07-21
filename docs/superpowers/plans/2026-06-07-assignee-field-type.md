# Assignee Field Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class "Assignee" custom field type (the existing `user` type, relabeled) with a per-field Single/Multi choice, tenant-scoped/RBAC-correct user options available to non-admins, and name (not ID) display.

**Architecture:** A new nullable `config` JSON column on `pipeline_fields` stores `{multiple}` per field. The shared registry relabels `user`→"Assignee" and gains `parseFieldConfig`/`isMultiUser`; `cardMatchesFilter` treats a multi-assignee like multiselect. A new tenant-scoped `GET /api/pipelines/assignable-users` (non-admin, `pipelines`-gated) replaces the admin-only `/api/users` in the three pipeline consumers. Single stores one userId string (back-compatible); multi stores a JSON array of userId strings.

**Tech Stack:** TypeScript, React 18, TanStack Query, Drizzle ORM (MySQL), `node:test` via `npx tsx --test`. Spec: `docs/superpowers/specs/2026-06-07-assignee-field-type-design.md`. Builds on slice A's `shared/pipelineFieldTypes.ts`.

**Coding standards (every task):** semantic HTML5 (`<fieldset>`/`<legend>`/`<label htmlFor>`/`<input type="radio">`/`<button type>`), DRY (decision logic in the shared module), component/SoC (focused input components), pure testable helpers. Reuse `Combobox`/`Button`/`Input`.

**Import conventions:** client → `@shared/...` & `@/...`; server → `../shared/....js`; tests → `./....js`.

---

## Task 1: `config` column on `pipeline_fields` (schema + migration)

**Files:**
- Modify: `shared/schema.ts` (the `pipelineFields` table def)
- Modify: `server/storage.ts` (the `p4cColAdds` migration array, ~line 6709)

- [ ] **Step 1: Add the column to the Drizzle schema**

In `shared/schema.ts`, in the `pipelineFields = mysqlTable(...)` definition, add a `config` column after `options`:

```ts
  options: text("options"),
  config: text("config"),
```

(`PipelineField = typeof pipelineFields.$inferSelect` then automatically includes `config: string | null`.)

- [ ] **Step 2: Add the idempotent startup migration**

In `server/storage.ts`, find the `p4cColAdds` array (~line 6709) and add one entry for the new column (the existing loop applies it with an info_schema guard + plain `ALTER` - the DB rejects `ADD COLUMN IF NOT EXISTS`):

```ts
    const p4cColAdds: Array<{ table: string; column: string; ddl: string }> = [
      { table: "pipeline_rules", column: "trigger_type", ddl: "VARCHAR(16) NOT NULL DEFAULT 'stage_enter'" },
      { table: "pipeline_rules", column: "trigger_config", ddl: "TEXT NULL" },
      { table: "pipeline_cards", column: "stage_entered_at", ddl: "TEXT NULL" },
      { table: "pipeline_fields", column: "config", ddl: "TEXT NULL" },
    ];
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(pipelines): add nullable config JSON column to pipeline_fields

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Registry - relabel Assignee + config helpers + multi-aware filter (TDD)

**Files:**
- Modify: `shared/pipelineFieldTypes.ts`
- Modify: `shared/pipelineFieldTypes.test.ts`

- [ ] **Step 1: Write the failing tests**

In `shared/pipelineFieldTypes.test.ts`, add these imports to the existing import from `./pipelineFieldTypes.js` (add `parseFieldConfig`, `isMultiUser` to the destructured list), then append these tests at the end of the file:

```ts
test("user type is now labeled Assignee", () => {
  assert.equal(PIPELINE_FIELD_TYPE_REGISTRY.user.label, "Assignee");
});

test("parseFieldConfig: valid/missing/garbage", () => {
  assert.deepEqual(parseFieldConfig({ config: '{"multiple":true}' } as any), { multiple: true });
  assert.deepEqual(parseFieldConfig({ config: null } as any), {});
  assert.deepEqual(parseFieldConfig({ config: "not json" } as any), {});
});

test("isMultiUser: only user type with multiple=true", () => {
  assert.equal(isMultiUser(f({ id: 1, type: "user", config: '{"multiple":true}' } as any)), true);
  assert.equal(isMultiUser(f({ id: 1, type: "user", config: '{"multiple":false}' } as any)), false);
  assert.equal(isMultiUser(f({ id: 1, type: "user", config: null } as any)), false);
  assert.equal(isMultiUser(f({ id: 1, type: "dropdown", config: '{"multiple":true}' } as any)), false);
});

test("cardMatchesFilter: single assignee = equality, multi assignee = membership", () => {
  const single = f({ id: 5, type: "user" });
  assert.equal(cardMatchesFilter({ 5: "42" }, single, "42"), true);
  assert.equal(cardMatchesFilter({ 5: "42" }, single, "43"), false);
  const multi = f({ id: 6, type: "user", config: '{"multiple":true}' } as any);
  assert.equal(cardMatchesFilter({ 6: JSON.stringify(["42", "43"]) }, multi, "43"), true);
  assert.equal(cardMatchesFilter({ 6: JSON.stringify(["42"]) }, multi, "43"), false);
});
```

(The `f()` factory already exists in this test file; it spreads `over` so passing `config` works. The `as any` casts keep TS quiet about the partial shape.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx tsx --test shared/pipelineFieldTypes.test.ts`
Expected: FAIL - `parseFieldConfig`/`isMultiUser` are not exported; label assertion fails.

- [ ] **Step 3: Implement the registry changes**

In `shared/pipelineFieldTypes.ts`:

(a) Change the `user` registry entry's `label` and `description`:

```ts
  user:        { type: "user",        label: "Assignee",       description: "Tugaskan ke pengguna",       group: "people",  hasOptions: false, singleton: false, searchable: true,  filterable: true,  sortable: false },
```

(b) Add the two helpers (place them after `getFieldTypeMeta`):

```ts
/** Parse a field's `config` JSON ({ multiple?: boolean }, etc.). Safe on null/garbage. */
export function parseFieldConfig(field: Pick<PipelineField, "config">): { multiple?: boolean } {
  if (!field.config) return {};
  try {
    const o = JSON.parse(field.config);
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

/** True for an Assignee field configured as multi-user. */
export function isMultiUser(field: Pick<PipelineField, "type" | "config">): boolean {
  return field.type === "user" && parseFieldConfig(field).multiple === true;
}
```

(c) In `cardMatchesFilter`, change the membership condition so a multi-assignee matches like multiselect:

```ts
  if (field.type === "multiselect" || isMultiUser(field)) {
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.map(String).includes(filterValue);
    } catch {
      return false;
    }
  }
  return raw === filterValue;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test shared/pipelineFieldTypes.test.ts`
Expected: PASS (all tests, including the prior slice-A tests).

- [ ] **Step 5: Commit**

```bash
git add shared/pipelineFieldTypes.ts shared/pipelineFieldTypes.test.ts
git commit -m "feat(pipelines): relabel user->Assignee, add config helpers + multi-assignee filter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Validation - multi-assignee value (TDD)

**Files:**
- Modify: `server/pipeline-field-helpers.ts`
- Create: `server/pipeline-field-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/pipeline-field-helpers.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFieldValue } from "./pipeline-field-helpers.js";

test("user single: digits only", () => {
  assert.equal(validateFieldValue("user", "42").ok, true);
  assert.equal(validateFieldValue("user", "x").ok, false);
});

test("user multi: JSON array of digit strings", () => {
  assert.equal(validateFieldValue("user", JSON.stringify(["1", "2"]), undefined, { multiple: true }).ok, true);
  assert.equal(validateFieldValue("user", JSON.stringify(["1", "x"]), undefined, { multiple: true }).ok, false);
  assert.equal(validateFieldValue("user", "not json", undefined, { multiple: true }).ok, false);
  assert.equal(validateFieldValue("user", JSON.stringify({}), undefined, { multiple: true }).ok, false);
});

test("empty value always allowed (soft-required)", () => {
  assert.equal(validateFieldValue("user", "", undefined, { multiple: true }).ok, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test server/pipeline-field-helpers.test.ts`
Expected: FAIL - `validateFieldValue` doesn't accept a 4th arg / multi case returns wrong result.

- [ ] **Step 3: Implement the validation change**

In `server/pipeline-field-helpers.ts`, change the `validateFieldValue` signature and the `case "user":` branch:

```ts
export function validateFieldValue(
  type: string,
  value: string,
  options?: string[],
  opts?: { multiple?: boolean },
): Validation {
  if (value === "" || value == null) return { ok: true }; // soft-required: empty always allowed
  switch (type) {
```

Replace the existing `case "user":` line/return with:

```ts
    case "user": {
      if (opts?.multiple) {
        let arr: unknown;
        try { arr = JSON.parse(value); } catch { return { ok: false, error: "Format assignee tidak valid" }; }
        if (!Array.isArray(arr)) return { ok: false, error: "Format assignee tidak valid" };
        return arr.every((v) => /^\d+$/.test(String(v))) ? { ok: true } : { ok: false, error: "User tidak valid" };
      }
      return /^\d+$/.test(value) ? { ok: true } : { ok: false, error: "User tidak valid" };
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test server/pipeline-field-helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the `multiple` flag at the call site**

In `server/routes.ts`, the card-values validation loop (the `PUT /api/pipelines/cards/:cardId/values` handler, ~line 4690-4709) currently calls:

```ts
    const check = validateFieldValue(f.type, String(v.value ?? ""), opts);
```

Change it to pass the multi flag (import `isMultiUser` alongside the existing `canAddType, getFieldTypeMeta` import from `../shared/pipelineFieldTypes.js`):

```ts
    const check = validateFieldValue(f.type, String(v.value ?? ""), opts, { multiple: isMultiUser(f) });
```

Update the import line near the top:

```ts
import { canAddType, getFieldTypeMeta, isMultiUser } from "../shared/pipelineFieldTypes.js";
```

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add server/pipeline-field-helpers.ts server/pipeline-field-helpers.test.ts server/routes.ts
git commit -m "feat(pipelines): validate multi-assignee values (JSON array of user ids)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Assignable-users endpoint (storage + route)

**Files:**
- Modify: `server/storage.ts` (`IStorage` interface + `DatabaseStorage`)
- Modify: `server/routes.ts`

- [ ] **Step 1: Add `getAssignableUsers` to the `IStorage` interface**

In `server/storage.ts`, find the `IStorage` interface and, near the existing `getUserIdsInMitra(mitraId: number): Promise<Set<number>>;` declaration (~line 250), add:

```ts
  getAssignableUsers(activeMitraId: number | null | undefined, isSystemAdmin: boolean): Promise<Array<{ id: number; name: string | null; username: string; role: string }>>;
```

- [ ] **Step 2: Implement it on `DatabaseStorage`**

In `server/storage.ts`, add this method right after `getUserIdsInMitra` (~line 5940, mirroring the `/api/users` tenant filter, minus the admin gate and mitra-name enrichment):

```ts
  async getAssignableUsers(
    activeMitraId: number | null | undefined,
    isSystemAdmin: boolean,
  ): Promise<Array<{ id: number; name: string | null; username: string; role: string }>> {
    let all = await this.getAllUsers();
    if (!isSystemAdmin && activeMitraId) {
      const memberIds = await this.getUserIdsInMitra(activeMitraId);
      all = all.filter((u) => memberIds.has(u.id));
    }
    return all.map((u) => ({ id: u.id, name: u.name ?? null, username: u.username, role: u.role }));
  }
```

- [ ] **Step 3: Add the route**

In `server/routes.ts`, add this route next to the other `/api/pipelines/*` routes (e.g. just before `router.get("/api/pipelines/:id/cards", ...)` at ~line 4503). It is gated by the `pipelines` read permission - NOT admin:

```ts
  router.get("/api/pipelines/assignable-users", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    const list = await storage.getAssignableUsers(req.authUser!.activeMitraId, req.authUser!.isSystemAdmin);
    sendSuccess(res, list);
  });
```

IMPORTANT: register this BEFORE any `/api/pipelines/:id`-style param route that could swallow `assignable-users` as an `:id`. Verify by reading the surrounding routes - if a `GET /api/pipelines/:id` exists earlier and would match `/api/pipelines/assignable-users`, place this route ABOVE it. (Express matches in registration order.)

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add server/storage.ts server/routes.ts
git commit -m "feat(pipelines): tenant-scoped non-admin assignable-users endpoint

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `createField` stores `config`

**Files:**
- Modify: `server/storage.ts` (`createField`)
- Modify: `server/routes.ts` (create-field route)

- [ ] **Step 1: Accept + store `config` in `createField`**

In `server/storage.ts`, the `createField` method signature currently is:

```ts
  async createField(pipelineId: number, data: { label: string; type: string; options?: string[] | null; required?: boolean; showOnCard?: boolean; }): Promise<PipelineField> {
```

Change the `data` type to add `config`:

```ts
  async createField(pipelineId: number, data: { label: string; type: string; options?: string[] | null; required?: boolean; showOnCard?: boolean; config?: string | null; }): Promise<PipelineField> {
```

And in the `.values({...})` insert object (which currently sets `mitraId, pipelineId, key, label, type, options, required, showOnCard, position, createdAt`), add `config`:

```ts
      required: data.required ? 1 : 0, showOnCard: data.showOnCard ? 1 : 0,
      config: data.config ?? null,
      position: maxPos + 1, createdAt: now,
```

- [ ] **Step 2: Pass `config` through the create-field route**

In `server/routes.ts`, the `POST /api/pipelines/:id/fields` handler destructures `{ label, type, options, required, showOnCard }`. Add `config`:

```ts
    const { label, type, options, required, showOnCard, config } = req.body ?? {};
```

and pass it to `createField`:

```ts
    sendSuccess(res, await storage.createField(Number(req.params.id), { label, type, options, required, showOnCard, config }));
```

(Leave the singleton guard + `getFieldTypeMeta` checks from slice A unchanged.)

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts server/routes.ts
git commit -m "feat(pipelines): persist field config on create

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: `useAssignableUsers` hook + switch consumers off `/api/users`

**Files:**
- Modify: `client/hooks/usePipelines.ts`
- Modify: `client/components/pipelines/FieldValueInput.tsx`
- Modify: `client/pages/PipelineBoardPage.tsx`
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx`

- [ ] **Step 1: Add the hook + type**

In `client/hooks/usePipelines.ts`, add the type near the other exported types and the hook near the other query hooks (the file already imports `useQuery`, `api`, and defines `const KEY = "pipelines"`):

```ts
export type AssignableUser = { id: number; name: string | null; username: string; role: string };

export function useAssignableUsers() {
  return useQuery({
    queryKey: [KEY, "assignable-users"],
    queryFn: () => api.get<AssignableUser[]>("/pipelines/assignable-users"),
  });
}
```

- [ ] **Step 2: `FieldValueInput` UserSelect uses the hook**

In `client/components/pipelines/FieldValueInput.tsx`, the `UserSelect` component currently does:

```tsx
  const { data: users } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => api.get<any[]>("/users"),
  });
```

Replace that block with:

```tsx
  const { data: users } = useAssignableUsers();
```

Add the import at the top:

```tsx
import { useAssignableUsers } from "@/hooks/usePipelines";
```

(`useQuery`/`api` may still be used elsewhere in the file - leave their imports. If, after Task 8, neither is used, remove them then.)

- [ ] **Step 3: `PipelineBoardPage` uses the hook**

In `client/pages/PipelineBoardPage.tsx`, replace:

```tsx
  const { data: users } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => api.get<any[]>("/users"),
  });
```

with:

```tsx
  const { data: users } = useAssignableUsers();
```

Add `useAssignableUsers` to the existing import from `@/hooks/usePipelines` (the file already imports hooks/types from there). The downstream `usersById` and `assigneeOptions` derivations are unchanged (they read `u.id`, `u.name`, `u.username`).

- [ ] **Step 4: `PipelineRulesDialog` uses the hook**

In `client/components/pipelines/PipelineRulesDialog.tsx`, replace:

```tsx
    queryKey: ["/api/users"],
    queryFn: () => api.get<any[]>("/users"),
```

i.e. the whole `useQuery({...})` users block:

```tsx
  const { data: users } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => api.get<any[]>("/users"),
  });
```

with:

```tsx
  const { data: users } = useAssignableUsers();
```

Add the import:

```tsx
import { useAssignableUsers } from "@/hooks/usePipelines";
```

(If `useQuery`/`api` become unused in this file afterward, remove their imports.)

- [ ] **Step 5: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add client/hooks/usePipelines.ts client/components/pipelines/FieldValueInput.tsx client/pages/PipelineBoardPage.tsx client/components/pipelines/PipelineRulesDialog.tsx
git commit -m "feat(pipelines): pipeline user pickers use tenant-scoped assignable-users (non-admin)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: ManageFieldsDialog - Single/Multi radio for Assignee

**Files:**
- Modify: `client/components/pipelines/ManageFieldsDialog.tsx`

- [ ] **Step 1: Add state + reset**

In `client/components/pipelines/ManageFieldsDialog.tsx`, add a state hook next to the others (after `const [showOnCard, setShowOnCard] = useState(false);`):

```tsx
  const [assigneeMultiple, setAssigneeMultiple] = useState(false);
```

In `resetForm`, add:

```tsx
    setAssigneeMultiple(false);
```

- [ ] **Step 2: Send `config` on create**

In the `add` function, just before the `await m.createField.mutateAsync({...})` call, compute the config and include it:

```tsx
      const config = type === "user" ? JSON.stringify({ multiple: assigneeMultiple }) : undefined;
      await m.createField.mutateAsync({
        label: label.trim(),
        type,
        options,
        required,
        showOnCard,
        config,
      });
```

- [ ] **Step 3: Render the Single/Multi radio when type is Assignee**

Immediately AFTER the `<FormField label="Tipe Data">...<FieldTypePicker .../></FormField>` block, add a semantic radio group shown only for the Assignee (`user`) type:

```tsx
              {type === "user" && (
                <fieldset className="space-y-1.5 border-0 p-0 m-0">
                  <legend className="text-xs font-medium mb-1">Penugasan</legend>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                      <input
                        type="radio"
                        name="assignee-cardinality"
                        checked={!assigneeMultiple}
                        onChange={() => setAssigneeMultiple(false)}
                      />
                      Tunggal (1 orang)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                      <input
                        type="radio"
                        name="assignee-cardinality"
                        checked={assigneeMultiple}
                        onChange={() => setAssigneeMultiple(true)}
                      />
                      Banyak orang
                    </label>
                  </div>
                </fieldset>
              )}
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/components/pipelines/ManageFieldsDialog.tsx
git commit -m "feat(pipelines): Single/Multi choice when creating an Assignee field

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: FieldValueInput - single vs multi assignee input

**Files:**
- Modify: `client/components/pipelines/FieldValueInput.tsx`

- [ ] **Step 1: Branch the `user` case on `isMultiUser`**

In `client/components/pipelines/FieldValueInput.tsx`, add the import:

```tsx
import { isMultiUser } from "@shared/pipelineFieldTypes";
```

Replace the existing `case "user":` block:

```tsx
    case "user":
      return (
        <UserSelect value={value} disabled={disabled} onChange={onChange} />
      );
```

with:

```tsx
    case "user":
      return isMultiUser(field) ? (
        <UserMultiSelect value={value} disabled={disabled} onChange={onChange} />
      ) : (
        <UserSelect value={value} disabled={disabled} onChange={onChange} />
      );
```

(The switch already has `field` in scope - confirm the function signature destructures or receives `field`; the existing code references `field.options` via `parseOptions(field)`, so `field` is available.)

- [ ] **Step 2: Add the `UserMultiSelect` component**

At the bottom of `client/components/pipelines/FieldValueInput.tsx`, add (it reuses `useAssignableUsers` from the same hook the `UserSelect` now uses, and the design-system `Combobox`):

```tsx
function UserMultiSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const { data: users } = useAssignableUsers();
  let selected: string[] = [];
  try {
    const a = JSON.parse(value || "[]");
    selected = Array.isArray(a) ? a.map(String) : [];
  } catch {
    selected = [];
  }
  const nameOf = (id: string) => {
    const u = (users ?? []).find((x) => String(x.id) === id);
    return u?.name || u?.username || `#${id}`;
  };
  const addOptions = (users ?? [])
    .filter((u) => !selected.includes(String(u.id)))
    .map((u) => ({ value: String(u.id), label: u.name || u.username || `#${u.id}` }));
  const add = (id: string) => { if (id && !selected.includes(id)) onChange(JSON.stringify([...selected, id])); };
  const remove = (id: string) => onChange(JSON.stringify(selected.filter((s) => s !== id)));

  return (
    <div className="space-y-1.5">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
              {nameOf(id)}
              {!disabled && (
                <button type="button" aria-label={`Hapus ${nameOf(id)}`} onClick={() => remove(id)} className="hover:text-destructive">
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <Combobox
          options={addOptions}
          value=""
          onChange={(v) => add(v)}
          placeholder="Tambah user…"
          searchPlaceholder="Cari user…"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add client/components/pipelines/FieldValueInput.tsx
git commit -m "feat(pipelines): multi-assignee value input (chips + add picker)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: BoardCard - resolve assignee values to names in chips

**Files:**
- Modify: `client/components/pipelines/BoardCard.tsx`

- [ ] **Step 1: Add a name resolver and use it for `user` field chips**

In `client/components/pipelines/BoardCard.tsx`, add the import:

```tsx
import { isMultiUser } from "@shared/pipelineFieldTypes";
```

Add a helper near `fieldText` (after the `fieldText` function, ~line 31):

```tsx
function resolveUserNames(
  f: PipelineField,
  raw: string,
  usersById: Map<number, { name?: string | null; username?: string | null }>,
): string {
  let ids: string[];
  if (isMultiUser(f)) {
    try { ids = (JSON.parse(raw) as unknown[]).map(String); } catch { ids = []; }
  } else {
    ids = raw ? [raw] : [];
  }
  const names = ids.map((id) => {
    const u = usersById.get(Number(id));
    return u?.name || u?.username || `#${id}`;
  });
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}
```

Then, in the chip-rendering map (the `fields.filter((f) => f.showOnCard !== 0).map(...)` block, ~line 108-118), change the value expression from `fieldText(f, raw)` to a user-aware version. The current chip line reads:

```tsx
              {f.label}: {fieldText(f, raw)}
```

Replace with:

```tsx
              {f.label}: {f.type === "user" ? resolveUserNames(f, raw, usersById) : fieldText(f, raw)}
```

(`usersById` is already a prop of `BoardCard` - see its props at ~line 56.)

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/BoardCard.tsx
git commit -m "feat(pipelines): show assignee names (not ids) on board card chips

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests**

Run: `npx tsx --test shared/pipelineFieldTypes.test.ts server/pipeline-field-helpers.test.ts`
Expected: all PASS.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: success (Vite client + esbuild server bundle).

- [ ] **Step 4: Manual checklist (record results)**

On the dev "Leads (Marketing)" pipeline:
- ManageFields → add field, pick **Assignee** → the Tunggal/Banyak radio appears; for non-Assignee types it does not.
- Create one **Tunggal** + one **Banyak** Assignee field.
- As a **non-admin** pipeline user: open a card → both assignee inputs load users (only active-mitra members appear).  (#1 RBAC/tenant)
- Assign one user (single) and several (multi); reopen → values persist; card chip + drawer show **names**, not IDs.
- Board filter → pick the Assignee field → pick a user → only cards with that user remain (works for single and multi).
- (Singleton/other slice-A behavior unaffected.)

- [ ] **Step 5: Final commit (only if the manual pass required a fixup; otherwise skip)**

```bash
git add -A
git commit -m "chore(pipelines): assignee slice verification fixups

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (author)

- **Spec coverage:** config column → Task 1; registry relabel + helpers + multi filter → Task 2; validation → Task 3; tenant-scoped non-admin endpoint (#1 RBAC) → Task 4 + consumers in Task 6; create UX Single/Multi → Task 7; single/multi input → Task 8; name display (fixes ID-in-chip) → Task 9. Single=userId string (back-compat) / multi=JSON array consistent across Tasks 2/3/8/9. Immutability (no edit of config) honored - PATCH route untouched. No assignee notifications / no card.assigneeId sync (out of scope, not implemented). Multi-tenant: Task 4 mitra-scoped.
- **Type consistency:** `parseFieldConfig`/`isMultiUser`/`useAssignableUsers`/`AssignableUser`/`getAssignableUsers`/`UserMultiSelect`/`resolveUserNames` names used identically across tasks. `config: string | null` on `PipelineField` (Task 1) read by `parseFieldConfig` (Task 2) and stored by `createField` (Task 5).
- **Route ordering caveat** explicitly flagged in Task 4 Step 3 (register `assignable-users` before any `/api/pipelines/:id` param route).
- **No placeholders.**
