# Pipelines & Users — UX + Isolation Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 7 user-reported issues: role label bug (OPERATOR), stage-name truncation, board stuck "Memuat…" on denied access, easier card moving (quick-move + auto-scroll), Admin/System-Admin locked full pipeline access, JABNET-only cross-mitra toggle on /users, and user-endpoint tenant-isolation hardening.

**Architecture:** All changes follow established patterns: pure logic in small testable modules (`node:test` via `tsx --test`), shared role-lock helper in `shared/pipelineCapabilities.ts` used by both server and client, `?scope=cross` honored only for `isSystemAdmin(req)` (mirrors `/api/pipelines/assignable-users`), and 404-on-foreign-id to hide existence.

**Tech Stack:** React 18 + TanStack Query 5 + shadcn/ui (client), Express 5 + Drizzle MySQL (server). Tests: `npx tsx --test`.

**Branch:** work directly on `dev`. User pushes themselves. Commit per task with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Verification commands used throughout:**
- Typecheck: `npm run typecheck` → expect `0 errors`
- Tests: `npx tsx --test shared/*.test.ts client/lib/*.test.ts client/components/pipelines/*.test.ts` → all pass
- Build (only before final handoff): `npm run build`

---

## Background facts (verified in code — do not re-derive)

- `isSystemAdmin(req)` — `server/routes.ts:399`: true for System-Admin role at mitra 1 (+ legacy JABNET admin). Top-level function, hoisted, usable anywhere in routes.ts.
- `isPipelineAdmin(req)` — `server/routes.ts:4424`: already grants full pipeline control to roleName `"Admin" | "Administrator" | "System-Admin"`; `resolvePipelineCapabilities` (`shared/pipelineCapabilities.ts:56`) returns ALL capabilities when `isAdmin` — so restricted grants **already cannot reduce** an admin server-side. Requirement #4 only needs: (a) UI lock in PipelineAccessDialog, (b) server strips stored grants for those roles, (c) `canUserAccessPipeline` alignment.
- `canUserAccessPipeline` — `server/storage.ts:2510`: special-cases only `"System-Admin"` / `"admin (legacy)"`, NOT `"Admin"` → mitra Admin can't be assign-target on restricted pipelines (inconsistent).
- Per-mitra Admin role: `seedAdminRoleForMitra` (`server/storage.ts:7983`) creates `name: "Admin"`, `isSystem: 1`.
- Board denial: `GET /api/pipelines/:id` → `requirePipelineView` sends 403 `"Akses ditolak untuk pipeline ini"`; cross-tenant id → `getPipeline` mitra-scoped → 404 `"Pipeline tidak ditemukan"`. `apiFetch` (`client/lib/api.ts:38`) throws → query goes to `error` after 1 retry (`client/lib/queryClient.ts:11`). `PipelineBoardPage` ignores `error` → title stuck `"Memuat…"` (line 166) while `BoardFilters` (line 222) renders unconditionally → the reported partial UI.
- `GET /api/users` (`server/routes.ts:1623`): sysadmin sees ALL users unconditionally today; non-sysadmin filtered via `getUserIdsInMitra`. Response already includes `mitraNames[]` per user; `UserRow` already renders mitra chips (UsersPage.tsx:422).
- Isolation gaps (verified, only `requireAdmin`-guarded, no target-user mitra check): `PUT /api/users/:id` (1766), `DELETE /api/users/:id` (1861), `GET /api/users/:id/activity` (1875), `GET /api/users/:id/stats` (1890), `POST /api/users/bulk-action` (1900), `GET /api/roles/:id/users` (1978). Also `PUT /api/users/:id` accepts any `roleId` with NO mitra check (POST create has one), and bulk `set_role` likewise.
- Role label bug: `TopBar.tsx:338,347` render `{user.role}` (legacy `users.role` text, default `"operator"`); `ProfilePage.tsx:389` keys `ROLE_CONFIG` by `me?.role || user?.role || "operator"`. Both `/api/auth/login` and `/api/auth/me` already return `roleName` (routes.ts:753); `AuthContext` already has `roleName?: string`. `ProfilePage`'s `MeResponse` interface (line 20) lacks `roleName`.
- CardDetailModal ALREADY has click-based "Pindah Stage" chips (CardDetailModal.tsx:~153-174) — requirement 1's "pindah dari detail kartu" is done; remaining: per-card quick action + auto-scroll.
- `BoardCard` is `React.memo` with stable id-based callbacks — new props must keep stable identities (use a ref for the mutations object; `pipeline.stages` is reference-stable from the query cache once loaded).
- shadcn primitives available: `dropdown-menu.tsx` (DropdownMenu/Trigger/Content/Item/Label), `switch.tsx`, `empty-state.tsx` (`action?: { label: string; onClick: () => void }`).

---

### Task 1: Role label fix — navbar + profile (#5)

**Files:**
- Create: `client/lib/roleLabel.ts`
- Create: `client/lib/roleLabel.test.ts`
- Modify: `client/components/layout/TopBar.tsx:338,347`
- Modify: `client/pages/ProfilePage.tsx` (MeResponse interface ~line 20-40; role resolution ~line 389-391; desc render ~line 527)

- [ ] **Step 1: Write the failing test**

```ts
// client/lib/roleLabel.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { roleLabel } from "./roleLabel.js";

test("roleLabel prefers dynamic roleName over legacy role text", () => {
  assert.equal(roleLabel({ roleName: "Marketing", role: "operator" }), "Marketing");
  assert.equal(roleLabel({ roleName: "System-Admin", role: "admin" }), "System-Admin");
});

test("roleLabel falls back to legacy role when roleName absent/blank", () => {
  assert.equal(roleLabel({ role: "operator" }), "operator");
  assert.equal(roleLabel({ roleName: "", role: "viewer" }), "viewer");
  assert.equal(roleLabel({ roleName: "   ", role: "viewer" }), "viewer");
});

test("roleLabel returns empty string when nothing available (never invents a default)", () => {
  assert.equal(roleLabel({}), "");
  assert.equal(roleLabel(null), "");
  assert.equal(roleLabel(undefined), "");
  assert.equal(roleLabel({ roleName: null, role: null }), "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test client/lib/roleLabel.test.ts`
Expected: FAIL (Cannot find module './roleLabel.js')

- [ ] **Step 3: Write the implementation**

```ts
// client/lib/roleLabel.ts
/** Display label for a user's role: prefer the dynamic role name (roles.name via
 *  roleName from /auth/me|login), fall back to the legacy users.role text.
 *  Never invents a default — callers decide their own fallback. */
export function roleLabel(
  u: { roleName?: string | null; role?: string | null } | null | undefined,
): string {
  if (!u) return "";
  const dyn = u.roleName?.trim();
  if (dyn) return dyn;
  return u.role?.trim() ?? "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test client/lib/roleLabel.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Fix TopBar (2 spots)**

In `client/components/layout/TopBar.tsx`, add import:

```ts
import { roleLabel } from "@/lib/roleLabel";
```

Line 338, replace:
```tsx
<span className="text-2xs text-muted-foreground capitalize">{user.role}</span>
```
with:
```tsx
<span className="text-2xs text-muted-foreground capitalize">{roleLabel(user)}</span>
```

Line 347, replace:
```tsx
@{user.username} · {user.role}
```
with:
```tsx
@{user.username} · {roleLabel(user)}
```

- [ ] **Step 6: Fix ProfilePage**

In `client/pages/ProfilePage.tsx`:

(a) Add `roleName` to `MeResponse` (after the `role` field, ~line 24):
```ts
  role: string | null;
  roleName?: string | null;
```

(b) Add import:
```ts
import { roleLabel } from "@/lib/roleLabel";
```

(c) Replace lines 389-390:
```ts
  const role = (me?.role || user?.role || "operator") as keyof typeof ROLE_CONFIG;
  const roleInfo = ROLE_CONFIG[role] || ROLE_CONFIG.operator;
```
with:
```ts
  // Prefer the dynamic role name (covers custom per-mitra roles); ROLE_CONFIG is keyed by
  // both roleName ("Admin", "System-Admin") and legacy users.role ("operator", "marketing").
  const roleKey = roleLabel(me ?? user) || "operator";
  const roleInfo = ROLE_CONFIG[roleKey as keyof typeof ROLE_CONFIG]
    ?? { label: roleKey, color: "text-blue-600 dark:text-blue-400", icon: Shield, desc: "" };
```
(`Shield` is already imported in this file — verify; if not, add to the lucide import.)

(d) Line ~527, guard the desc paragraph so an empty desc doesn't render an empty italic line. Replace:
```tsx
              <p className="text-[11px] text-muted-foreground/80 mt-2 italic">
                {roleInfo.desc}
              </p>
```
with:
```tsx
              {roleInfo.desc && (
                <p className="text-[11px] text-muted-foreground/80 mt-2 italic">
                  {roleInfo.desc}
                </p>
              )}
```

Note: lines 486, 504, 687 already render `{roleInfo.label}` — they're now correct via the new `roleInfo`. Do NOT touch `BottomNav.tsx:59` — that's navigation-grouping logic on the legacy field, not a display label (changing it changes which tabs show).

- [ ] **Step 7: Verify + commit**

Run: `npm run typecheck` → 0 errors. `npx tsx --test client/lib/*.test.ts` → pass.

```bash
git add client/lib/roleLabel.ts client/lib/roleLabel.test.ts client/components/layout/TopBar.tsx client/pages/ProfilePage.tsx
git commit -m "fix(ui): tampilkan nama role asli (roleName) di navbar + profile, bukan legacy 'operator'

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Stage name display — no aggressive truncation (#2)

**Files:**
- Modify: `client/components/pipelines/StageColumn.tsx:136`

- [ ] **Step 1: Change the stage header label**

Replace line 136:
```tsx
        <span className="text-sm font-semibold uppercase tracking-wide truncate flex-1">{stage.label}</span>
```
with:
```tsx
        <span
          className="text-sm font-semibold uppercase tracking-wide flex-1 min-w-0 line-clamp-2 break-words leading-tight"
          title={stage.label}
        >
          {stage.label}
        </span>
```

Rationale: `line-clamp-2` keeps long names readable ("FOLLOW UP TELEPON KE-2" fits 2 lines) instead of `FOLLOW UP TELEP…`; `title` gives the full name on hover (desktop). Mobile sees the same 2-line clamp — consistent. `min-w-0` keeps the flex row from overflowing; header icons all have `shrink-0` already.

- [ ] **Step 2: Verify + commit**

Run: `npm run typecheck` → 0 errors.

```bash
git add client/components/pipelines/StageColumn.tsx
git commit -m "fix(pipelines): nama stage panjang clamp 2 baris + tooltip, tidak truncate agresif

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Board access-denied / loading state (#3)

**Files:**
- Modify: `client/pages/PipelineBoardPage.tsx` (hook destructure line 30; new early-return before main `return` at line 156; gate MetricsStrip line 221 + BoardFilters line 222 on `pipeline`)

- [ ] **Step 1: Destructure query status**

Replace line 30:
```ts
  const { data: pipeline } = usePipeline(pid);
```
with:
```ts
  const { data: pipeline, isLoading: pipelineLoading, error: pipelineError } = usePipeline(pid);
```

- [ ] **Step 2: Add the denied/error early return**

Add imports at the top of the file:
```ts
import { EmptyState } from "@/components/ui/empty-state";
import { ShieldAlert } from "lucide-react";
```
(Add `ShieldAlert` to the existing lucide-react import on line 21.)

Immediately BEFORE the main `return (` (line 156) — after all hooks, so hook order is safe — insert:
```tsx
  // Akses ditolak / pipeline tidak ditemukan (403/404 dari server) — jangan render
  // board parsial atau menggantung di "Memuat…". Data inti tetap tersembunyi.
  if (pipelineError) {
    return (
      <section
        aria-label="Akses pipeline ditolak"
        className="flex flex-col h-full -m-4 md:-m-6 -mt-16 md:-mt-6 pb-20 md:pb-0"
      >
        <div className="flex-1 flex items-center justify-center px-4 pt-16 md:pt-6">
          <EmptyState
            icon={ShieldAlert}
            title="Tidak dapat membuka pipeline"
            description={(pipelineError as Error).message || "Anda tidak memiliki akses ke pipeline ini."}
            action={{ label: "Kembali ke Pipelines", onClick: () => navigate("/pipelines") }}
          />
        </div>
      </section>
    );
  }
```

Server messages surfaced verbatim: 403 → "Akses ditolak untuk pipeline ini", cross-tenant/unknown id → "Pipeline tidak ditemukan". Both are correct user-facing copy.

- [ ] **Step 3: Stop rendering partial UI while loading**

Line 166, replace:
```tsx
            <h1 className="text-base sm:text-lg font-bold leading-tight truncate">{pipeline?.name ?? "Memuat…"}</h1>
```
with:
```tsx
            <h1 className="text-base sm:text-lg font-bold leading-tight truncate">
              {pipeline?.name ?? (pipelineLoading ? "Memuat…" : "Pipeline")}
            </h1>
```

Line 221, replace:
```tsx
        {pid != null && <MetricsStrip pipelineId={pid} canManage={can("manage")} onManage={() => setShowMetricsCfg(true)} />}
```
with:
```tsx
        {pipeline && pid != null && <MetricsStrip pipelineId={pid} canManage={can("manage")} onManage={() => setShowMetricsCfg(true)} />}
```

Line 222, wrap BoardFilters so search/filter/assignee never imply data is accessible. Replace the opening of that line:
```tsx
        <div className="mt-2"><BoardFilters
```
with:
```tsx
        {pipeline && <div className="mt-2"><BoardFilters
```
and close it at the end of the same line: change the trailing `/></div>` to `/></div>}`.

(The header action buttons on lines 170-218 are already gated by `pipeline &&` or `can(...)` which is empty while unloaded.)

- [ ] **Step 4: Verify + commit**

Run: `npm run typecheck` → 0 errors. Manual sanity: `npm run dev`, open `/pipelines/99999` as any user → EmptyState "Pipeline tidak ditemukan" with CTA, no filters, no stuck "Memuat…".

```bash
git add client/pages/PipelineBoardPage.tsx
git commit -m "fix(pipelines): board tampilkan state akses-ditolak/404 yang jelas, bukan stuck 'Memuat…' + UI parsial

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: DnD UX — per-card quick move + edge auto-scroll (#1)

**Files:**
- Create: `client/components/pipelines/dragScroll.ts`
- Create: `client/components/pipelines/dragScroll.test.ts`
- Modify: `client/components/pipelines/BoardCard.tsx` (new props `stages`, `onMoveCard`; keyboard guard)
- Modify: `client/components/pipelines/StageColumn.tsx` (pass-through props; vertical auto-scroll on the card list)
- Modify: `client/pages/PipelineBoardPage.tsx` (stable `moveCardTo` callback; horizontal auto-scroll on the board container)

- [ ] **Step 1: Write the failing test for the pure scroll helper**

```ts
// client/components/pipelines/dragScroll.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { edgeScrollDelta } from "./dragScroll.js";

test("edgeScrollDelta scrolls negative near the start edge", () => {
  assert.equal(edgeScrollDelta(10, 0, 1000), -24);
  assert.equal(edgeScrollDelta(79, 0, 1000), -24);
});

test("edgeScrollDelta scrolls positive near the end edge", () => {
  assert.equal(edgeScrollDelta(990, 0, 1000), 24);
  assert.equal(edgeScrollDelta(921, 0, 1000), 24);
});

test("edgeScrollDelta is 0 in the middle", () => {
  assert.equal(edgeScrollDelta(500, 0, 1000), 0);
  assert.equal(edgeScrollDelta(80, 0, 1000), 0);
  assert.equal(edgeScrollDelta(920, 0, 1000), 0);
});

test("edgeScrollDelta is 0 when the container is too small for two edge zones", () => {
  assert.equal(edgeScrollDelta(10, 0, 150), 0);
});

test("edgeScrollDelta honors custom edge/step", () => {
  assert.equal(edgeScrollDelta(30, 0, 1000, 40, 12), -12);
  assert.equal(edgeScrollDelta(975, 0, 1000, 40, 12), 12);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test client/components/pipelines/dragScroll.test.ts`
Expected: FAIL (Cannot find module './dragScroll.js')

- [ ] **Step 3: Implement the helper**

```ts
// client/components/pipelines/dragScroll.ts
/** Pure edge-proximity auto-scroll math for HTML5 drag-and-drop.
 *  pos = pointer coordinate (clientX/clientY), [start,end] = container bounds on that axis.
 *  Returns a scroll delta: negative near the start edge, positive near the end edge, else 0.
 *  Containers smaller than two edge zones never scroll (both zones would overlap). */
export function edgeScrollDelta(
  pos: number,
  start: number,
  end: number,
  edge = 80,
  step = 24,
): number {
  if (end - start <= edge * 2) return 0;
  if (pos < start + edge) return -step;
  if (pos > end - edge) return step;
  return 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test client/components/pipelines/dragScroll.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: BoardCard — quick "Pindah ke stage" dropdown + keyboard guard**

In `client/components/pipelines/BoardCard.tsx`:

(a) Add imports:
```ts
import { ArrowRightLeft } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
```

(b) Extend the props (both the destructure and the type) — after `onToggleCard`:
```ts
  onToggleCard,
  stages,
  onMoveCard,
}: {
  ...
  onToggleCard?: (id: number) => void;
  /** Quick-move alternatif drag: daftar stage pipeline (referensi stabil dari query cache). */
  stages?: { id: number; label: string; color: string | null }[];
  /** Stable callback (ref-backed di page) — memo BoardCard tetap berlaku. */
  onMoveCard?: (cardId: number, stageId: number) => void;
}
```

(c) Keyboard guard — inner dropdown trigger must not also open the card. Replace the Card's `onKeyDown`:
```tsx
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          if (e.key === " ") e.preventDefault();
          handleOpen();
        }
      }}
```
with:
```tsx
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return; // Enter on inner controls (quick-move) stays theirs
        if (e.key === "Enter" || e.key === " ") {
          if (e.key === " ") e.preventDefault();
          handleOpen();
        }
      }}
```

(d) Quick-move trigger in the title row. Replace the title-row block:
```tsx
      {/* Title row with update-tone dot */}
      <div className="flex items-start gap-2">
        <span
          className={`mt-1 size-2 rounded-full shrink-0 ${TONE_DOT[tone]}`}
          title="Update terakhir"
        />
        <div className="text-sm font-medium flex-1 min-w-0 line-clamp-2">{card.title}</div>
      </div>
```
with:
```tsx
      {/* Title row with update-tone dot + quick-move (alternatif drag, ramah mobile) */}
      <div className="flex items-start gap-2">
        <span
          className={`mt-1 size-2 rounded-full shrink-0 ${TONE_DOT[tone]}`}
          title="Update terakhir"
        />
        <div className="text-sm font-medium flex-1 min-w-0 line-clamp-2">{card.title}</div>
        {writable && !selectMode && onMoveCard && (stages?.length ?? 0) > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Pindah kartu ${card.title} ke stage lain`}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 -mr-1 -mt-0.5 rounded p-1 min-w-[24px] min-h-[24px] text-muted-foreground/50 hover:text-foreground hover:bg-muted focus-visible:opacity-100"
              >
                <ArrowRightLeft className="size-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuLabel>Pindah ke stage</DropdownMenuLabel>
              {stages!
                .filter((s) => s.id !== card.stageId)
                .map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => onMoveCard(card.id, s.id)}>
                    <span
                      className="size-2 rounded-full mr-2 shrink-0"
                      style={{ backgroundColor: s.color ?? "#6B7280" }}
                      aria-hidden="true"
                    />
                    {s.label}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
```

Memo note: `stages` (query-cache object, stable post-load) and `onMoveCard` (ref-backed useCallback, Step 7) keep `React.memo(BoardCard)` effective.

- [ ] **Step 6: StageColumn — pass-through + vertical auto-scroll**

In `client/components/pipelines/StageColumn.tsx`:

(a) Add to imports: `import { useRef } from "react";` (merge into the existing react import: `import { useRef, useState } from "react";`) and `import { edgeScrollDelta } from "./dragScroll";`.

(b) Add the two props (destructure + type), after `onToggleStage`:
```ts
  onToggleStage,
  stages: stageOptions,
  onMoveCard,
}: {
  ...
  onToggleStage?: (ids: number[], on: boolean) => void;
  /** Untuk quick-move BoardCard — daftar stage + callback stabil (diteruskan apa adanya). */
  stages?: { id: number; label: string; color: string | null }[];
  onMoveCard?: (cardId: number, stageId: number) => void;
}
```

(c) Inside the component add a ref:
```ts
  const listRef = useRef<HTMLDivElement>(null);
```

(d) The cards scroller (line ~266) — add ref + vertical auto-scroll while a CARD is dragged over a tall column. Replace:
```tsx
      <div className="flex-1 overflow-y-auto column-scrollbar space-y-2 pr-1 min-h-0">
```
with:
```tsx
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto column-scrollbar space-y-2 pr-1 min-h-0"
        onDragOver={(e) => {
          if (dragId == null || !listRef.current) return;
          const r = listRef.current.getBoundingClientRect();
          listRef.current.scrollTop += edgeScrollDelta(e.clientY, r.top, r.bottom, 56, 16);
        }}
      >
```

(e) Pass the new props to `<BoardCard>` (after `onToggleCard={onToggleCard}`):
```tsx
              onToggleCard={onToggleCard}
              stages={stageOptions}
              onMoveCard={onMoveCard}
```

- [ ] **Step 7: PipelineBoardPage — stable moveCardTo + horizontal auto-scroll**

In `client/pages/PipelineBoardPage.tsx`:

(a) Add `useRef` to the react import (line 1):
```ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```
Add: `import { edgeScrollDelta } from "@/components/pipelines/dragScroll";`

(b) After `const m = usePipelineMutations(pid ?? undefined);` (line 35) add:
```ts
  // Ref-backed move callback: identity stays stable across renders (m is a fresh object
  // every render) so React.memo(BoardCard) holds for the quick-move dropdown.
  const mRef = useRef(m);
  useEffect(() => { mRef.current = m; });
  const moveCardTo = useCallback((cardId: number, stageId: number) => {
    mRef.current.moveCard
      .mutateAsync({ cardId, toStageId: stageId })
      .catch(() => toast.error("Gagal memindahkan kartu"));
  }, []);
```

(c) Board container ref + dragover auto-scroll. Replace line 224:
```tsx
      <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 md:px-6 pb-4 kanban-scrollbar" onDragEnd={() => { setStageDragId(null); setDragId(null); }}>
```
with:
```tsx
      <div
        ref={boardScrollRef}
        className="flex-1 overflow-x-auto overflow-y-hidden px-4 md:px-6 pb-4 kanban-scrollbar"
        onDragOver={(e) => {
          if ((dragId == null && stageDragId == null) || !boardScrollRef.current) return;
          const r = boardScrollRef.current.getBoundingClientRect();
          boardScrollRef.current.scrollLeft += edgeScrollDelta(e.clientX, r.left, r.right);
        }}
        onDragEnd={() => { setStageDragId(null); setDragId(null); }}
      >
```
and declare the ref with the other state (near line 50):
```ts
  const boardScrollRef = useRef<HTMLDivElement>(null);
```

(d) Pass new props to `<StageColumn>` (after `onToggleStage={toggleMany}` at line 259):
```tsx
              onToggleStage={toggleMany}
              stages={stages}
              onMoveCard={moveCardTo}
```
(`stages` here is `pipeline?.stages ?? []` — already reference-stable from the query cache once loaded; the `?? []` only churns pre-load when there are no cards anyway.)

- [ ] **Step 8: Verify + commit**

Run: `npm run typecheck` → 0 errors. `npx tsx --test client/components/pipelines/*.test.ts` → pass.
Manual: `npm run dev` → board: hover a card → arrow icon → dropdown lists other stages → click → card moves (same `/move` endpoint as drag, so automation/timeline/audit identical). Drag a card toward the right edge → board scrolls; drag inside a tall column near its bottom → column scrolls.

```bash
git add client/components/pipelines/dragScroll.ts client/components/pipelines/dragScroll.test.ts client/components/pipelines/BoardCard.tsx client/components/pipelines/StageColumn.tsx client/pages/PipelineBoardPage.tsx
git commit -m "feat(pipelines): quick-move per kartu (dropdown stage) + auto-scroll tepi saat drag

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Admin & System-Admin — fixed full pipeline access (#4)

**Files:**
- Modify: `shared/pipelineCapabilities.ts` (new `isAdminLockedRole`)
- Modify: `shared/pipelineCapabilities.test.ts` (test for it)
- Modify: `server/storage.ts:2510` (`canUserAccessPipeline` — include "Admin")
- Modify: `server/routes.ts:5596` (PUT access — strip locked-role grants)
- Modify: `client/components/pipelines/PipelineAccessDialog.tsx` (locked rows UI)

- [ ] **Step 1: Write the failing test**

Append to `shared/pipelineCapabilities.test.ts` (it already imports from `./pipelineCapabilities.js` — add `isAdminLockedRole` to that import):

```ts
test("isAdminLockedRole: system Admin/System-Admin locked, others not", () => {
  assert.equal(isAdminLockedRole({ name: "Admin", isSystem: 1 }), true);
  assert.equal(isAdminLockedRole({ name: "System-Admin", isSystem: 1 }), true);
  assert.equal(isAdminLockedRole({ name: "Admin", isSystem: 0 }), false);   // custom role bernama Admin tidak terkunci
  assert.equal(isAdminLockedRole({ name: "Marketing", isSystem: 1 }), false);
  assert.equal(isAdminLockedRole({ name: "Read Only", isSystem: 1 }), false);
  assert.equal(isAdminLockedRole({}), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/pipelineCapabilities.test.ts`
Expected: FAIL (isAdminLockedRole is not exported)

- [ ] **Step 3: Implement the shared helper**

Append to `shared/pipelineCapabilities.ts`:

```ts
/** Roles whose pipeline access is FIXED at full and cannot be granted/reduced per-pipeline:
 *  the seeded per-mitra "Admin" and JABNET "System-Admin" (both isSystem). Mirrors the
 *  server-side isPipelineAdmin(req) short-circuit — grants for these roles are meaningless. */
export function isAdminLockedRole(role: { name?: string | null; isSystem?: number | null }): boolean {
  return (role.isSystem ?? 0) === 1 && (role.name === "Admin" || role.name === "System-Admin");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/pipelineCapabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Align `canUserAccessPipeline` (mitra Admin = always access)**

In `server/storage.ts` (~line 2516), replace:
```ts
    if ((eff.roleName === "System-Admin" || eff.roleName === "admin (legacy)") && eff.isSystem) return true;
```
with:
```ts
    // "Admin" (per-mitra, isSystem) ikut full-access — mirror isPipelineAdmin di routes.
    if ((eff.roleName === "System-Admin" || eff.roleName === "Admin" || eff.roleName === "admin (legacy)") && eff.isSystem) return true;
```

- [ ] **Step 6: Server — strip grants for locked roles on save**

In `server/routes.ts`, the `PUT /api/pipelines/:id/access` handler (line 5596). After the `restricted/grants` validation and before `setPipelineAccess`, add the filter — replace:
```ts
    await storage.setPipelineAccess(Number(req.params.id), restricted, grants.map((g: any) => ({
```
with:
```ts
    // Admin/System-Admin akses-nya fixed full (isPipelineAdmin) — grant untuk mereka
    // tidak pernah dibaca dan hanya menyesatkan UI. Buang sebelum simpan.
    const mitraRoles = await storage.getRoles(req.authUser!.activeMitraId ?? 1);
    const lockedRoleIds = new Set(mitraRoles.filter((r: any) => isAdminLockedRole(r)).map((r: any) => r.id));
    const cleanGrants = grants.filter((g: any) => !lockedRoleIds.has(Number(g.roleId)));
    await storage.setPipelineAccess(Number(req.params.id), restricted, cleanGrants.map((g: any) => ({
```
Add to the imports at the top of `server/routes.ts` (find the existing import from `../shared/pipelineCapabilities.js` — it already imports `PIPELINE_CAPABILITY_LABELS` etc. — and add `isAdminLockedRole`).

- [ ] **Step 7: Client — locked rows in PipelineAccessDialog**

In `client/components/pipelines/PipelineAccessDialog.tsx`:

(a) Extend the shared import (line 10):
```ts
import { ALL_PIPELINE_CAPABILITIES, PIPELINE_CAPABILITY_LABELS, isAdminLockedRole, type PipelineCapability } from "@shared/pipelineCapabilities";
```

(b) In the role-list map (line ~149), render locked roles as a fixed full-access card. Replace:
```tsx
                    {(roles ?? []).map((r) => {
                      const roleCaps = caps[r.id] ?? [];
```
with:
```tsx
                    {(roles ?? []).map((r) => {
                      if (isAdminLockedRole(r)) {
                        return (
                          <div key={r.id} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium">{r.name}</div>
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success font-medium">
                                <ShieldCheck className="size-3" aria-hidden="true" />
                                Akses penuh (terkunci)
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              Role bawaan — selalu punya semua izin pipeline dan tidak bisa dikurangi.
                            </p>
                          </div>
                        );
                      }
                      const roleCaps = caps[r.id] ?? [];
```
(`ShieldCheck` is already imported in this file.)

(c) Exclude locked roles from the save payload as defense-in-depth. In `save()` (line ~63), replace:
```ts
    const grants = Object.entries(caps)
      .filter(([, c]) => c.length > 0)
```
with:
```ts
    const lockedIds = new Set((roles ?? []).filter((r: any) => isAdminLockedRole(r)).map((r: any) => r.id));
    const grants = Object.entries(caps)
      .filter(([roleId, c]) => c.length > 0 && !lockedIds.has(Number(roleId)))
```

(d) The `grantedCount` badge (line 83) should not count locked roles (they were never in `caps` from the server after Step 6, and stale rows get dropped) — leave as is.

- [ ] **Step 8: Verify + commit**

Run: `npm run typecheck` → 0. `npx tsx --test shared/*.test.ts` → pass.
Manual: board → Akses → Admin & System-Admin rows show "Akses penuh (terkunci)" with no checkboxes; saving never persists grants for them; a restricted pipeline still fully opens for a mitra Admin.

```bash
git add shared/pipelineCapabilities.ts shared/pipelineCapabilities.test.ts server/storage.ts server/routes.ts client/components/pipelines/PipelineAccessDialog.tsx
git commit -m "feat(pipelines): Admin & System-Admin akses pipeline fixed full — terkunci di UI + server

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: /users — JABNET cross-mitra toggle (#6)

**Files:**
- Modify: `server/routes.ts:1623` (`GET /api/users` — `?scope=cross` gate)
- Modify: `client/pages/UsersPage.tsx` (toggle + scoped query)

- [ ] **Step 1: Server — default mitra-scoped, opt-in cross for sysadmin**

Replace the scoping block in `GET /api/users` (routes.ts:1626-1631):
```ts
    let allUsers = await storage.getAllUsers();
    // Tenant isolation: non-system-admin hanya lihat user member dari mitra aktif
    if (!req.authUser!.isSystemAdmin && req.authUser!.activeMitraId) {
      const memberIds = await storage.getUserIdsInMitra(req.authUser!.activeMitraId);
      allUsers = allUsers.filter(u => memberIds.has(u.id));
    }
```
with:
```ts
    let allUsers = await storage.getAllUsers();
    // Tenant isolation: DEFAULT semua admin (termasuk JABNET System-Admin) hanya lihat
    // user member mitra aktif. JABNET System-Admin boleh opt-in lintas mitra via
    // ?scope=cross — di-honor server-side hanya untuk isSystemAdmin (mirror assignable-users).
    const wantCross = req.query.scope === "cross" && isSystemAdmin(req);
    if (!wantCross && req.authUser!.activeMitraId) {
      const memberIds = await storage.getUserIdsInMitra(req.authUser!.activeMitraId);
      allUsers = allUsers.filter(u => memberIds.has(u.id));
    }
```

- [ ] **Step 2: Client — toggle (JABNET sysadmin only) + scoped queryKey**

In `client/pages/UsersPage.tsx`:

(a) Add import: `import { Switch } from "@/components/ui/switch";`

(b) Near the other state (line ~95) add:
```ts
  // Toggle lintas mitra — hanya JABNET System-Admin di mitra aktif 1. Default: JABNET saja.
  const canCrossScope = !!currentUser?.isSystemAdmin && currentUser?.activeMitraId === 1;
  const [crossScope, setCrossScope] = useState(() => localStorage.getItem("users:crossScope") === "1");
  const scope = canCrossScope && crossScope ? "cross" : "own";
```
(`currentUser` already exists via `useAuth()` in this component — it is referenced at line 175. If its declaration sits below line 95, move this block to just after that declaration.)

(c) Replace the users query (lines 106-109):
```ts
  const { data: users = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
    queryFn: () => api.get<SafeUser[]>("/users"),
  });
```
with:
```ts
  const { data: users = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/users", scope],
    queryFn: () => api.get<SafeUser[]>(`/users${scope === "cross" ? "?scope=cross" : ""}`),
  });
```
(All existing `invalidateQueries({ queryKey: ["/api/users"] })` calls prefix-match both scopes — no change needed.)

(d) Add the toggle into the filter bar. In the `flex gap-2 overflow-x-auto...` Select group (line ~238), insert BEFORE the role `<Select>`:
```tsx
            {canCrossScope && (
              <label className="flex items-center gap-2 h-9 px-3 rounded-md border border-border text-xs text-muted-foreground select-none cursor-pointer shrink-0 whitespace-nowrap">
                <Switch
                  checked={crossScope}
                  onCheckedChange={(v) => {
                    setCrossScope(v);
                    localStorage.setItem("users:crossScope", v ? "1" : "0");
                  }}
                  aria-label="Tampilkan user semua mitra"
                />
                Semua mitra
              </label>
            )}
```
(`UserRow` already renders per-user `mitraNames` chips — cross mode is self-explanatory. Mitra lain never sees the toggle: `canCrossScope` is false AND the server ignores `scope=cross` from non-sysadmins.)

- [ ] **Step 3: Verify + commit**

Run: `npm run typecheck` → 0 errors.
Manual: JABNET sysadmin → /users defaults to JABNET-only; flip "Semua mitra" → users of all mitras appear with mitra chips; non-JABNET admin → no toggle, own users only; `curl -H "Authorization: Bearer <mitra-admin-token>" "https://…/api/users?scope=cross"` → still mitra-scoped.

```bash
git add server/routes.ts client/pages/UsersPage.tsx
git commit -m "feat(users): toggle lintas-mitra khusus JABNET System-Admin (?scope=cross), default JABNET saja

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: User-endpoint tenant-isolation hardening (#7)

**Files:**
- Modify: `server/routes.ts` — new `requireUserInScope` helper (after `requireAdmin`, ~line 1605), applied to: `PUT /api/users/:id` (1766), `DELETE /api/users/:id` (1861), `GET /api/users/:id/activity` (1875), `GET /api/users/:id/stats` (1890), `POST /api/users/bulk-action` (1900), plus role-tenant checks in PUT + bulk `set_role`, plus `GET /api/roles/:id/users` (1978).

- [ ] **Step 1: Add the scope helper**

After the closing brace of `requireAdmin` (routes.ts ~line 1605), add:
```ts
/** Tenant isolation untuk endpoint user-by-id: non-sysadmin hanya boleh menyentuh user
 *  yang member mitra aktifnya. 404 (bukan 403) supaya keberadaan user mitra lain tidak bocor. */
async function requireUserInScope(req: Request, res: Response, targetUserId: number): Promise<boolean> {
  if (req.authUser!.isSystemAdmin) return true;
  const memberIds = await storage.getUserIdsInMitra(req.authUser!.activeMitraId ?? 1);
  if (!memberIds.has(targetUserId)) { sendError(res, "User tidak ditemukan", 404); return false; }
  return true;
}
```

- [ ] **Step 2: Apply to the four user-by-id endpoints**

In each handler, right after `const id = parseInt(req.params.id as string);` (or `const userId = …`), add the guard:

`PUT /api/users/:id` (line ~1769):
```ts
    const id = parseInt(req.params.id as string);
    if (!(await requireUserInScope(req, res, id))) return;
```

`DELETE /api/users/:id` (line ~1864):
```ts
    const id = parseInt(req.params.id as string);
    if (!(await requireUserInScope(req, res, id))) return;
```

`GET /api/users/:id/activity` (line ~1878):
```ts
    const userId = parseInt(req.params.id as string);
    if (!(await requireUserInScope(req, res, userId))) return;
```

`GET /api/users/:id/stats` (line ~1893):
```ts
    const userId = parseInt(req.params.id as string);
    if (!(await requireUserInScope(req, res, userId))) return;
```

- [ ] **Step 3: PUT /api/users/:id — role tenant check (parity with POST create)**

In the `roleId` block (line ~1810), replace:
```ts
        const r = await storage.getRoleById(Number(roleId));
        if (!r) return sendError(res, "Role tidak ditemukan");
        updateData.roleId = r.id;
```
with:
```ts
        const r = await storage.getRoleById(Number(roleId));
        if (!r) return sendError(res, "Role tidak ditemukan");
        // Tenant isolation: hanya role milik mitra aktif (System-Admin boleh lintas) — parity dengan POST create.
        if (r.mitraId !== (req.authUser!.activeMitraId ?? 1) && !req.authUser!.isSystemAdmin) {
          return sendError(res, "Role bukan milik mitra Anda", 403);
        }
        updateData.roleId = r.id;
```

- [ ] **Step 4: bulk-action — scope the id list + set_role tenant check**

In `POST /api/users/bulk-action` (line ~1900), after the self-exclusion filter:
```ts
    const filteredIds = userIds.filter((id: number) => id !== req.authUser!.id);
    if (filteredIds.length === 0) return sendError(res, "Tidak bisa apply action ke akun sendiri");
```
add:
```ts
    // Tenant isolation: non-sysadmin hanya boleh bulk-action ke user mitra aktifnya.
    let scopedIds = filteredIds;
    if (!req.authUser!.isSystemAdmin) {
      const memberIds = await storage.getUserIdsInMitra(req.authUser!.activeMitraId ?? 1);
      scopedIds = filteredIds.filter((id: number) => memberIds.has(id));
      if (scopedIds.length === 0) return sendError(res, "Tidak ada user yang valid di mitra Anda", 404);
    }
    // set_role: role target wajib milik mitra aktif (System-Admin boleh lintas)
    if (action === "set_role") {
      const r = await storage.getRoleById(Number(payload?.roleId));
      if (!r) return sendError(res, "Role tidak ditemukan");
      if (!req.authUser!.isSystemAdmin && r.mitraId !== (req.authUser!.activeMitraId ?? 1)) {
        return sendError(res, "Role bukan milik mitra Anda", 403);
      }
    }
```
then change the loop + audit to use `scopedIds` instead of `filteredIds`:
```ts
    for (const id of scopedIds) {
```
and in the audit call: `{ userIds: scopedIds, errors }`.
(The per-item `if (!payload?.roleId) { errors.push(...) }` inside the loop can stay — the pre-check above already 400s before the loop when roleId is absent, keep both for safety.)

- [ ] **Step 5: GET /api/roles/:id/users — role must belong to the active mitra**

In the handler (line ~1978), after `const roleId = parseInt(req.params.id as string);` add:
```ts
    const role = await storage.getRoleById(roleId);
    if (!role) return sendError(res, "Role tidak ditemukan", 404);
    if (!req.authUser!.isSystemAdmin && role.mitraId !== (req.authUser!.activeMitraId ?? 1)) {
      return sendError(res, "Role tidak ditemukan", 404); // sembunyikan keberadaan role mitra lain
    }
```
(Users holding a tenant's role are by construction members of that tenant, so the existing `getAllUsers().filter(roleId)` body is safe once the role itself is scope-checked.)

- [ ] **Step 6: Verify + commit**

Run: `npm run typecheck` → 0 errors. `npx tsx --test shared/*.test.ts client/lib/*.test.ts client/components/pipelines/*.test.ts` → all pass.
Manual (staging, after deploy): login as a non-JABNET mitra admin → `PUT/DELETE/GET activity/stats` against a JABNET user id → 404; bulk-action including foreign ids → they're silently dropped/404; `set_role` with a JABNET roleId → 403; `GET /api/roles/<jabnet-role-id>/users` → 404. JABNET sysadmin unaffected.

```bash
git add server/routes.ts
git commit -m "fix(users): tenant isolation — guard semua endpoint user-by-id, bulk-action, role assignment, roles/:id/users

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Final verification

- [ ] **Step 1: Full check**

Run: `npm run typecheck` → 0 errors.
Run: `npx tsx --test shared/*.test.ts client/lib/*.test.ts client/components/pipelines/*.test.ts` → all pass (existing 84 + new roleLabel/dragScroll/isAdminLockedRole tests).
Run: `npm run build` → success.

- [ ] **Step 2: Acceptance criteria sweep** (map to user's list)

1. ✅ Quick-move dropdown + edge auto-scroll (Task 4); drop indicator already existed (ring + "Drop di sini").
2. ✅ Alternatif pindah stage: dropdown per kartu (Task 4) + chips di detail modal (sudah ada) + bulk move (sudah ada).
3. ✅ Stage name clamp-2 + tooltip (Task 2).
4. ✅ Board access-denied state, no stuck "Memuat…", no partial filters (Task 3).
5. ✅ 403/404 server-side sudah ada (audit B); FE kini tidak merender data apa pun saat ditolak (Task 3).
6. ✅ Admin/System-Admin fixed full access — server strip + UI lock + canUserAccessPipeline aligned (Task 5).
7. ✅ Role asli tampil di navbar + profile (Task 1).
8. ✅ Toggle JABNET-only ↔ semua mitra, default JABNET (Task 6).
9. ✅ Mitra lain: tanpa toggle, server ignores `scope=cross` (Task 6).
10. ✅ User-by-id/bulk/roles endpoints kini tenant-guarded (Task 7).

No DB schema changes in this plan — deploy is plain build + restart.
