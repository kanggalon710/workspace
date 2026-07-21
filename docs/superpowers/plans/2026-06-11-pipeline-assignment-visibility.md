# Cross-Tenant Assignment Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a JABNET sysadmin optionally see and assign users from other mitras in pipeline assignment pickers, while keeping the default JABNET-only and non-JABNET tenants fully isolated (cross-tenant assignment is record-only - no access granted).

**Architecture:** All pickers funnel through one hook (`useAssignableUsers`) → one endpoint (`GET /api/pipelines/assignable-users`) → one storage method (`getAssignableUsers`). We add an opt-in `?scope=cross` param gated by the existing `isSystemAdmin(req)` helper, harden the two assignee write paths server-side, and replace five duplicated inline pickers with one reusable `<AssigneePicker>` that owns the cross-tenant toggle + tenant labels.

**Tech Stack:** Express 5 + Drizzle (MySQL) backend; React 18 + TanStack Query + shadcn `Combobox` frontend. Spec: `docs/superpowers/specs/2026-06-11-pipeline-assignment-visibility-design.md`.

**Verification note:** This feature is wiring + UI, not pure algorithm - there is little unit-testable pure logic. Per the project's established convention (pure logic in `shared/*` is unit-tested via `tsx --test`; DB/route/UI code is verified via `npx tsc --noEmit` + `npm run build` + manual on dev), tasks here verify with typecheck/build and a manual acceptance pass (Task 7). Do not invent low-value unit tests for DB/UI glue.

---

### Task 1: Storage - cross-tenant `getAssignableUsers` + tenant labels

**Files:**
- Modify: `server/storage.ts:6547-6557` (the `getAssignableUsers` method)

- [ ] **Step 1: Replace the method**

Replace the whole method (lines 6547-6557) with:

```ts
  async getAssignableUsers(
    activeMitraId: number | null | undefined,
    allowCrossTenant: boolean,
  ): Promise<Array<{ id: number; name: string | null; username: string; role: string; mitraId: number | null; mitraName: string | null }>> {
    let all = await this.getAllUsers();
    if (!allowCrossTenant && activeMitraId) {
      const memberIds = await this.getUserIdsInMitra(activeMitraId);
      all = all.filter((u) => memberIds.has(u.id));
    }
    // Resolve a "primary" mitra label per user (lowest user_mitras.id wins). One query, no N+1.
    const labels = new Map<number, { mitraId: number; mitraName: string | null }>();
    const rows: any = ((await this.db.execute(sql`
      SELECT um.user_id AS userId, um.mitra_id AS mitraId, m.name AS mitraName
      FROM user_mitras um LEFT JOIN mitras m ON m.id = um.mitra_id
      ORDER BY um.user_id, um.id
    `))[0] as any);
    for (const r of rows ?? []) {
      const uid = Number(r.userId);
      if (!labels.has(uid)) labels.set(uid, { mitraId: Number(r.mitraId), mitraName: r.mitraName ?? null });
    }
    return all.map((u) => {
      const lbl = labels.get(u.id);
      return { id: u.id, name: u.name ?? null, username: u.username, role: u.role ?? "", mitraId: lbl?.mitraId ?? null, mitraName: lbl?.mitraName ?? null };
    });
  }
```

Notes: the second param's *meaning* changes from `isSystemAdmin` to `allowCrossTenant` (the route, Task 2, decides the gate). `sql` and `mitras`/`users` are already imported in this file.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors). The only caller is updated in Task 2; until then tsc may flag the boolean arg meaning - that's fine, it's still a boolean, so it stays green. If tsc errors on `mitras` not imported, add it to the existing schema import.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): getAssignableUsers cross-tenant flag + mitra labels"
```

---

### Task 2: Endpoint - `?scope=cross` gated by `isSystemAdmin`

**Files:**
- Modify: `server/routes.ts:4771-4775` (the `GET /api/pipelines/assignable-users` handler)

- [ ] **Step 1: Replace the handler body**

The current handler:
```ts
    if (!requirePermission(req, res, "pipelines")) return;
    const list = await storage.getAssignableUsers(req.authUser!.activeMitraId, req.authUser!.isSystemAdmin);
    sendSuccess(res, list);
```

Replace the middle line so it reads:
```ts
    if (!requirePermission(req, res, "pipelines")) return;
    const allowCross = req.query.scope === "cross" && isSystemAdmin(req);
    const list = await storage.getAssignableUsers(req.authUser!.activeMitraId, allowCross);
    sendSuccess(res, list);
```

`isSystemAdmin(req)` is the function defined at `server/routes.ts:398` (JABNET System-Admin role OR legacy JABNET admin) - NOT the `req.authUser.isSystemAdmin` boolean. A non-sysadmin passing `?scope=cross` gets `allowCross=false` (silent safe default, no 403).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 3: Manual smoke (optional, if a dev server is running)**

As a JABNET sysadmin token: `GET /api/pipelines/assignable-users` → JABNET users only. `GET /api/pipelines/assignable-users?scope=cross` → users across mitras with `mitraName`. As a non-sysadmin token, both return JABNET-only.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): assignable-users ?scope=cross gated by isSystemAdmin"
```

---

### Task 3: Server - shared assignee validation on the two write paths

**Files:**
- Modify: `server/routes.ts` - add helper near line 403 (after `isSystemAdmin`); apply in PATCH card (`:4929`) and POST secondary assignee (`:5345`)

- [ ] **Step 1: Add the validation helper**

Insert immediately after the `isSystemAdmin` function (after line 403):

```ts
/** Validate a user may be assigned to a card in this pipeline, in the current request context.
 *  Returns null if OK, else an Indonesian error string.
 *  - Always: target user must exist and be active.
 *  - JABNET sysadmin: any existing+active user (cross-tenant, record-only - grants no access).
 *  - Everyone else: target must already have access to the pipeline (existing rule preserved). */
async function validateAssignTarget(req: Request, userId: number, pipelineId: number): Promise<string | null> {
  const u = await storage.getUser(userId);
  if (!u || (u as any).isActive === 0) return "User tidak ditemukan atau nonaktif";
  if (isSystemAdmin(req)) return null;
  if (!(await storage.canUserAccessPipeline(userId, pipelineId))) return "User tidak punya akses ke pipeline ini";
  return null;
}
```

- [ ] **Step 2: Apply to the primary-assignee PATCH**

In `router.patch("/api/pipelines/cards/:cardId", ...)` (starts line 4929), AFTER the `requireCardAccess` guard (line 4937) and BEFORE the `try {` (line 4938), insert:

```ts
    if (req.body && req.body.assigneeId != null) {
      const aerr = await validateAssignTarget(req, Number(req.body.assigneeId), cardForGuard.pipelineId);
      if (aerr) return sendError(res, aerr, 400);
    }
```

This adds previously-absent server-side validation to the primary assignee (defense-in-depth: don't trust the frontend) while allowing JABNET-sysadmin cross-tenant.

- [ ] **Step 3: Apply to the secondary-assignee POST**

In `router.post("/api/pipelines/cards/:cardId/assignees", ...)` (starts line 5345), REPLACE the existing block (lines 5353-5355):

```ts
    if (!(await storage.canUserAccessPipeline(Number(userId), card.pipelineId))) {
      return sendError(res, "User tidak punya akses ke pipeline ini", 400);
    }
```

with:

```ts
    const aerr = await validateAssignTarget(req, Number(userId), card.pipelineId);
    if (aerr) return sendError(res, aerr, 400);
```

Behavior is identical for non-sysadmins (still `canUserAccessPipeline`), and relaxed to exists+active for JABNET sysadmins (cross-tenant record-only).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (0 errors).

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): validate assignee on primary+secondary paths (sysadmin cross-tenant relax)"
```

---

### Task 4: Client - `useAssignableUsers(crossTenant?)` + type

**Files:**
- Modify: `client/hooks/usePipelines.ts:44` (type) and `:84-89` (hook)

- [ ] **Step 1: Extend the `AssignableUser` type**

Replace line 44:
```ts
export type AssignableUser = { id: number; name: string | null; username: string; role: string };
```
with:
```ts
export type AssignableUser = { id: number; name: string | null; username: string; role: string; mitraId: number | null; mitraName: string | null };
```

- [ ] **Step 2: Add the `crossTenant` param to the hook**

Replace the hook (lines 84-89):
```ts
export function useAssignableUsers() {
  return useQuery({
    queryKey: [KEY, "assignable-users"],
    queryFn: () => api.get<AssignableUser[]>("/pipelines/assignable-users"),
  });
}
```
with:
```ts
export function useAssignableUsers(crossTenant?: boolean) {
  return useQuery({
    queryKey: [KEY, "assignable-users", crossTenant ? "cross" : "own"],
    queryFn: () => api.get<AssignableUser[]>(`/pipelines/assignable-users${crossTenant ? "?scope=cross" : ""}`),
  });
}
```

The two lists cache separately via the query key.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS - existing callers pass no arg (param is optional). New `mitraId`/`mitraName` are additive.

- [ ] **Step 4: Commit**

```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(pipelines): useAssignableUsers(crossTenant) + mitra label fields"
```

---

### Task 5: Client - reusable `<AssigneePicker>` component

**Files:**
- Create: `client/components/pipelines/AssigneePicker.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useSyncExternalStore } from "react";
import { Combobox } from "@/components/ui/combobox";
import { useAuth } from "@/context/AuthContext";
import { useAssignableUsers, type AssignableUser } from "@/hooks/usePipelines";

const JABNET_MITRA_ID = 1;
const LS_KEY = "pipeline_assignee_cross_tenant";

// -- Shared cross-tenant source toggle (module-level so every picker on screen stays in sync) --
let crossSource = (() => { try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; } })();
const listeners = new Set<() => void>();
function setCrossSource(v: boolean) {
  crossSource = v;
  try { localStorage.setItem(LS_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
function useCrossSource() { return useSyncExternalStore(subscribe, () => crossSource, () => crossSource); }

function labelFor(u: AssignableUser, cross: boolean): string {
  const base = u.name || u.username || `#${u.id}`;
  return cross && u.mitraName ? `${base} (${u.mitraName})` : base;
}

interface BaseProps {
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  placeholder?: string;
  excludeIds?: number[];
  /** Render the JABNET-only/cross-tenant toggle (only ever shows for a JABNET sysadmin). Default true. */
  showSourceToggle?: boolean;
}
type SingleProps = BaseProps & { mode: "single"; value: string; onChange: (v: string) => void; includeUnassign?: boolean };
type MultiProps = BaseProps & { mode: "multi"; value: string[]; onChange: (next: string[]) => void };

export function AssigneePicker(props: SingleProps | MultiProps) {
  const { user } = useAuth();
  const canToggle = !!user?.isSystemAdmin && user?.activeMitraId === JABNET_MITRA_ID;
  const cross = useCrossSource();
  const effectiveCross = canToggle && cross;
  const { data: users } = useAssignableUsers(effectiveCross);
  const list = users ?? [];
  const showToggle = (props.showSourceToggle ?? true) && canToggle;

  const toggle = showToggle ? (
    <fieldset className="flex items-center gap-3 text-[10px] text-muted-foreground border-0 p-0 m-0">
      <legend className="sr-only">Sumber user</legend>
      <label className="inline-flex items-center gap-1 cursor-pointer">
        <input type="radio" checked={!cross} onChange={() => setCrossSource(false)} /> JABNET
      </label>
      <label className="inline-flex items-center gap-1 cursor-pointer">
        <input type="radio" checked={cross} onChange={() => setCrossSource(true)} /> Lintas mitra
      </label>
    </fieldset>
  ) : null;

  if (props.mode === "single") {
    const excl = new Set(props.excludeIds ?? []);
    const options = [
      ...(props.includeUnassign ? [{ value: "__unassign__", label: "- Kosongkan (unassign) -" }] : []),
      ...list.filter((u) => !excl.has(u.id)).map((u) => ({ value: String(u.id), label: labelFor(u, effectiveCross), description: u.role || undefined })),
    ];
    return (
      <div className="space-y-1.5">
        {toggle}
        <Combobox
          size={props.size ?? "md"}
          options={options}
          value={props.value}
          onChange={(v) => props.onChange(v)}
          placeholder={props.placeholder ?? "Pilih user…"}
          searchPlaceholder="Cari user…"
          disabled={props.disabled}
        />
      </div>
    );
  }

  const selected = props.value;
  const excl = new Set(props.excludeIds ?? []);
  const nameOf = (id: string) => { const u = list.find((x) => String(x.id) === id); return u ? labelFor(u, effectiveCross) : `#${id}`; };
  const addOptions = list
    .filter((u) => !selected.includes(String(u.id)) && !excl.has(u.id))
    .map((u) => ({ value: String(u.id), label: labelFor(u, effectiveCross) }));

  return (
    <div className="space-y-1.5">
      {toggle}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
              {nameOf(id)}
              {!props.disabled && (
                <button type="button" aria-label={`Hapus ${nameOf(id)}`} onClick={() => props.onChange(selected.filter((s) => s !== id))} className="hover:text-destructive">×</button>
              )}
            </span>
          ))}
        </div>
      )}
      {!props.disabled && (
        <Combobox
          size={props.size ?? "md"}
          options={addOptions}
          value=""
          onChange={(v) => { if (v && !selected.includes(v)) props.onChange([...selected, v]); }}
          placeholder={props.placeholder ?? "Tambah user…"}
          searchPlaceholder="Cari user…"
        />
      )}
    </div>
  );
}
```

Verify `useAuth()` returns `{ user }` with `isSystemAdmin?: boolean` and `activeMitraId?: number` (it does - `client/context/AuthContext.tsx:239`, AuthUser fields at `:27`/`:36`).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS. (Component is not yet imported anywhere; this just confirms it compiles.)

- [ ] **Step 3: Commit**

```bash
git add client/components/pipelines/AssigneePicker.tsx
git commit -m "feat(pipelines): reusable AssigneePicker (single+multi, cross-tenant toggle)"
```

---

### Task 6: Client - refactor the five consumers onto `<AssigneePicker>`

**Files:**
- Modify: `client/components/pipelines/CardDetailModal.tsx` (primary `:187-193`, secondary `:204-228`)
- Modify: `client/components/pipelines/BulkActionBar.tsx` (`BulkOpForm` assign `:68-91`; remove `users` prop `:30`,`:40`,`:46`)
- Modify: `client/components/pipelines/FieldValueInput.tsx` (`UserSelect` `:259-284`, `UserMultiSelect` `:200-257`)
- Modify: `client/components/pipelines/RuleActionEditor.tsx` (assign `:382-399`)
- Modify: `client/components/pipelines/PipelineRulesDialog.tsx` (stop threading `staffUsers` to the assign action)
- Modify: the parent that renders `<BulkActionBar>` (grep `users={` near `BulkActionBar`) - drop the now-removed `users` prop

- [ ] **Step 1: CardDetailModal - primary assignee**

Add import: `import { AssigneePicker } from "./AssigneePicker";`
Replace the primary Combobox (lines 187-193) with:
```tsx
                  <AssigneePicker
                    mode="single"
                    size="sm"
                    value={card.assigneeId == null ? "" : String(card.assigneeId)}
                    placeholder="Belum ada"
                    disabled={!(writable && canAssign)}
                    onChange={(v) => { if (writable && canAssign) m.updateCard.mutateAsync({ cardId, assigneeId: v ? Number(v) : null }); }}
                  />
```

- [ ] **Step 2: CardDetailModal - secondary assignees**

Replace the secondary block's chip-list + Combobox (lines 207-226, i.e. everything inside the `<div className="space-y-1.5">` after the `<label>`) with a single multi picker that diffs against the current secondary list and fires the existing mutations:
```tsx
                  <AssigneePicker
                    mode="multi"
                    showSourceToggle={false}
                    value={(secondary ?? []).map((a) => String(a.userId))}
                    excludeIds={card?.assigneeId ? [card.assigneeId] : []}
                    onChange={(next) => {
                      const prev = (secondary ?? []).map((a) => String(a.userId));
                      next.filter((id) => !prev.includes(id)).forEach((id) => addAssignee.mutate(Number(id)));
                      prev.filter((id) => !next.includes(id)).forEach((id) => removeAssignee.mutate(Number(id)));
                    }}
                  />
```
Keep the surrounding `{canAssign && (<div className="space-y-1.5"><label …>Penanggung jawab tambahan</label> … </div>)}` wrapper and the `<label>`. `showSourceToggle={false}` so only the primary picker shows the toggle (both share the module store, so flipping the primary's toggle updates this one too). Leave the `const { data: users } = useAssignableUsers();` at line 77 in place - it is still used for `nameOf(card.createdBy)` at line 196.

- [ ] **Step 3: BulkActionBar - assign sheet + drop `users` prop**

Add import `import { AssigneePicker } from "./AssigneePicker";`. Replace the assign-sheet Combobox + the `userOptions` array (remove `userOptions` at lines 54-61; replace the `<Combobox …>` at 71-77) so the `if (sheet === "assign")` block is:
```tsx
  if (sheet === "assign") {
    return (
      <div className="space-y-4">
        <AssigneePicker mode="single" includeUnassign value={assigneeVal} onChange={setAssigneeVal} placeholder="Pilih penugasan..." />
        <Button
          className="w-full"
          disabled={pending || assigneeVal === ""}
          onClick={() => onRun("assign", { assigneeId: assigneeVal === "__unassign__" ? null : Number(assigneeVal) })}
        >
          {pending ? "Memproses..." : "Assign"}
        </Button>
      </div>
    );
  }
```
Then remove the now-unused `users` prop: delete `users: AssignableUser[];` from both `BulkActionBarProps` (line 30) and `BulkOpFormProps` (line 40), remove `users` from the `BulkOpForm({ … })` destructure (line 46) and from where `<BulkOpForm … users={users} />` is rendered. Remove the now-unused `AssignableUser` import if nothing else uses it. Finally, in the parent that renders `<BulkActionBar … users={…} />`, delete the `users={…}` prop (grep for `BulkActionBar` to find it; likely `PipelineBoardPage.tsx`). If that parent fetched `useAssignableUsers()` ONLY to feed BulkActionBar, remove that call too.

- [ ] **Step 4: FieldValueInput - UserSelect + UserMultiSelect**

Add import `import { AssigneePicker } from "./AssigneePicker";`. Replace the entire `UserSelect` function (lines 259-284) with:
```tsx
function UserSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return <AssigneePicker mode="single" value={value} onChange={onChange} disabled={disabled} placeholder="Pilih user…" />;
}
```
Replace the entire `UserMultiSelect` function (lines 200-257) with:
```tsx
function UserMultiSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  let selected: string[] = [];
  try { const a = JSON.parse(value || "[]"); selected = Array.isArray(a) ? a.map(String) : []; } catch { selected = []; }
  return (
    <AssigneePicker
      mode="multi"
      disabled={disabled}
      value={selected}
      onChange={(next) => onChange(next.length ? JSON.stringify(next) : "")}
    />
  );
}
```
Remove the now-unused `useAssignableUsers` import from this file if nothing else references it.

- [ ] **Step 5: RuleActionEditor - assign action**

Add import `import { AssigneePicker } from "./AssigneePicker";`. Replace the assign `<Combobox …>` (lines 388-397) with:
```tsx
          <AssigneePicker
            mode="single"
            value={value.assignUserId}
            onChange={(v) => patch({ assignUserId: v })}
            placeholder="Pilih user (atau kosongkan)…"
          />
```
The `staffUsers` prop is no longer used by the assign branch. If `staffUsers` is unused elsewhere in this component, remove it from the props type and destructure; otherwise leave it. In `PipelineRulesDialog.tsx`, stop passing `staffUsers={…}` to `<RuleActionEditor>` if you removed the prop, and remove its `useAssignableUsers()` call (line ~74) if it was used only for that.

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS (0 errors, build succeeds). Fix any leftover unused-import or prop-type errors surfaced by the removals above.

- [ ] **Step 7: Commit**

```bash
git add client/components/pipelines/
git commit -m "refactor(pipelines): all assignment pickers use shared AssigneePicker"
```

---

### Task 7: Manual acceptance + final verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + build (authoritative gate)**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errors, build succeeds.

- [ ] **Step 2: Manual acceptance on dev** (per spec §8)

1. **Non-sysadmin JABNET user:** open a card → assignee picker shows **no** source toggle and only JABNET users. Bulk assign, user custom field, multi-assignee field, automation assign - all JABNET-only, no toggle.
2. **JABNET sysadmin:** toggle visible, default **JABNET**. Flip to **Lintas mitra** → other tenants' users appear as `Name (MitraName)`. Flipping the toggle in one picker updates the others (shared store).
3. **Assign cross-tenant** (primary, secondary, multi field, bulk, and an automation rule) → saved and the name renders on the card.
4. **Isolation check:** log in as that cross-tenant user under their own tenant → the JABNET card is NOT visible anywhere (board, search, assigned-to-me).
5. **Sysadmin on a non-JABNET active mitra:** no toggle (gate is JABNET-only); picker shows that mitra's users.
6. **Tamper check:** as a non-sysadmin, hit `GET /api/pipelines/assignable-users?scope=cross` directly → still JABNET-only. Try `POST …/assignees` with a cross-tenant `userId` → 400 "User tidak punya akses…".

- [ ] **Step 3: Final commit (if any doc/verification notes)**

```bash
git add -A
git commit -m "chore(pipelines): assignment visibility verified on dev" --allow-empty
```

---

## Self-Review notes (author)

- **Spec coverage:** §1 endpoint → Task 2; §2 storage labels → Task 1; §3 write-path validation → Task 3; §4 hook → Task 4; §4 component → Task 5; §5 five consumers → Task 6; §6 semantic toggle (`fieldset`/`legend`/radio) → Task 5; §8 testing → Task 7. Acceptance criteria 1-4 → Task 7 manual pass.
- **Conscious YAGNI:** server validation is enforced on the two dedicated assignee endpoints (the assignment-policy surface). The user-type **custom field** value path (`PUT /cards/:cardId/values`) gets no new server validation - values grant no access and a non-sysadmin's picker can't surface cross-tenant users. Documented in spec §3 scope.
- **Automation execution path** assigns via storage methods (`addCardAssignee`/`updateCard`) which carry no `canUserAccessPipeline` guard (the guard lived only in the HTTP route), so sysadmin-authored cross-tenant rule assignments fire correctly with no extra change.
- **Type consistency:** `AssignableUser` gains `mitraId`/`mitraName` (Task 4) consumed by `labelFor` (Task 5). `getAssignableUsers(activeMitraId, allowCrossTenant)` signature (Task 1) matches its sole caller (Task 2). `validateAssignTarget(req, userId, pipelineId)` defined once (Task 3) used twice.
