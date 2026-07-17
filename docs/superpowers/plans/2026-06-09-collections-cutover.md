# Collections → Pipeline Cutover (Phase 7) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reversible per-mitra toggle that moves collections onto the pipeline engine — pipeline-mode skips the legacy collection auto-open/reconcile (the `billing_sync` rule handles it) and redirects `/collections` to the pipeline board; default `legacy` keeps current behavior.

**Architecture:** A pure mode parser + two `app_settings` keys. The billing worker gates its legacy collection blocks on the mode. A small GET/PUT endpoint reads/sets the toggle. `/integrations` exposes the switch; the `/collections` page redirects in pipeline-mode. Old code stays dormant (flip back = full restore).

**Tech Stack:** TypeScript, Drizzle (MySQL), `node:test` via `npx tsx --test`, React + wouter. `.js` imports. No schema change.

---

### Task 1: Pure mode helper

**Files:**
- Create: `shared/collectionsMode.ts`
- Test: `shared/collectionsMode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/collectionsMode.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCollectionsMode, legacyCollectionsActive } from "./collectionsMode.js";

test("parseCollectionsMode: default + garbage → legacy", () => {
  assert.equal(parseCollectionsMode(null), "legacy");
  assert.equal(parseCollectionsMode(undefined), "legacy");
  assert.equal(parseCollectionsMode(""), "legacy");
  assert.equal(parseCollectionsMode("LEGACY"), "legacy");
  assert.equal(parseCollectionsMode("weird"), "legacy");
});

test("parseCollectionsMode: pipeline", () => {
  assert.equal(parseCollectionsMode("pipeline"), "pipeline");
});

test("legacyCollectionsActive", () => {
  assert.equal(legacyCollectionsActive("legacy"), true);
  assert.equal(legacyCollectionsActive("pipeline"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/collectionsMode.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the module**

Create `shared/collectionsMode.ts`:

```ts
/** Pure helper for the collections engine-mode toggle. No DB, no I/O. */
export type CollectionsEngineMode = "legacy" | "pipeline";

/** Anything other than the exact string "pipeline" → "legacy" (safe default). */
export function parseCollectionsMode(raw: string | null | undefined): CollectionsEngineMode {
  return raw === "pipeline" ? "pipeline" : "legacy";
}

export function legacyCollectionsActive(mode: CollectionsEngineMode): boolean {
  return mode === "legacy";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/collectionsMode.test.ts`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/collectionsMode.ts shared/collectionsMode.test.ts
git commit -m "feat(collections): pure engine-mode helper"
```

---

### Task 2: Worker gate — skip legacy collection logic in pipeline-mode

**Files:**
- Modify: `server/billing-sync-worker.ts`

- [ ] **Step 1: Add the import**

At the top of `server/billing-sync-worker.ts`, add:
```ts
import { parseCollectionsMode, legacyCollectionsActive } from "../shared/collectionsMode.js";
```

- [ ] **Step 2: Gate the Phase-2 + Phase-3 collection blocks**

In `_runOnceInner`, the two consecutive blocks (Phase 2 "Collection threshold triggers" starting at the
`const collectionEnabled = ...` line, and Phase 3 "Reconciliation pass" `try { const reconcile = ... }`)
must only run in legacy mode. Read the mode once just before the Phase-2 block and wrap BOTH blocks:
```ts
      // Collections cutover: in pipeline-mode the billing_sync rule handles auto-open; skip legacy.
      const collectionsMode = parseCollectionsMode(await storage.getMitraSetting("collections_engine_mode"));
      if (legacyCollectionsActive(collectionsMode)) {
        // ── Phase 2: Collection threshold triggers (overdue days + auto-writeoff) ──
        const collectionEnabled = (await storage.getSetting("collection_enabled")) !== "false";
        if (collectionEnabled) {
          const triggerDays = Number(await storage.getSetting("collection_trigger_days") ?? "3");
          const writeoffDays = Number(await storage.getSetting("collection_writeoff_days") ?? "0");
          const collectionResults = await this.runCollectionThresholds(triggerDays, writeoffDays);
          (stats.transitions as any).auto_opened_overdue = collectionResults.opened;
          (stats.transitions as any).auto_writeoff = collectionResults.writtenOff;
          await storage.setSetting("collection_trigger_last_run_at", new Date().toISOString(), "collection");
          await storage.setSetting("collection_trigger_last_opened", String(collectionResults.opened), "collection");
        }
        // ── Phase 3: Reconciliation pass — auto-fix customer<->collection drift ──
        try {
          const reconcile = await storage.reconcileCollectionState();
          if (reconcile.fixesApplied > 0) {
            (stats.transitions as any).reconciled_fixes = reconcile.fixesApplied;
            console.log(`[BillingSync] Reconciliation: ${reconcile.fixesApplied} drift fixed (${reconcile.mismatchesFound} mismatches detected)`);
          }
          // ...keep ALL existing lines inside the Phase-3 try/catch exactly as they are...
        } catch (e: any) {
          // ...keep the existing catch body...
        }
      } else {
        console.log(`[BillingSyncWorker] collections pipeline-mode: legacy auto-open/reconcile dilewati`);
      }
```
IMPORTANT: this is a wrap, not a rewrite — READ the current Phase-2 + Phase-3 blocks (around lines 296–325)
and move them verbatim inside the `if (legacyCollectionsActive(...))` branch, preserving every existing
line (including the full Phase-3 try/catch body and any code between the two blocks). Do NOT alter
`runBillingIntakeRules` (the `billing_sync` intake) — it stays AFTER this gated section and runs in both
modes.

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add server/billing-sync-worker.ts
git commit -m "feat(collections): skip legacy auto-open/reconcile in pipeline-mode"
```

---

### Task 3: Routes — engine-mode GET/PUT

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Add the routes**

Near the existing `/api/collections/settings` routes (~line 4166), add (import `parseCollectionsMode` at
top of routes.ts: `import { parseCollectionsMode } from "../shared/collectionsMode.js";`):
```ts
  router.get("/api/collections/engine-mode", async (req, res) => {
    if (!requirePermission(req, res, "collections")) return;
    const mode = parseCollectionsMode(await storage.getMitraSetting("collections_engine_mode"));
    const pidRaw = await storage.getMitraSetting("collections_pipeline_id");
    const pipelineId = pidRaw && /^\d+$/.test(pidRaw) ? Number(pidRaw) : null;
    sendSuccess(res, { mode, pipelineId });
  });

  router.put("/api/collections/engine-mode", async (req, res) => {
    if (!requireWritePermission(req, res, "collections")) return;
    const { mode, pipelineId } = req.body ?? {};
    if (mode !== "legacy" && mode !== "pipeline") return sendError(res, "mode harus legacy/pipeline", 400);
    if (mode === "pipeline") {
      const pid = Number(pipelineId);
      if (!Number.isInteger(pid) || pid <= 0) return sendError(res, "pipelineId wajib untuk mode pipeline", 400);
      const pipe = await storage.getPipeline(pid);
      if (!pipe) return sendError(res, "Pipeline tidak ditemukan", 404);
      await storage.setMitraSetting("collections_pipeline_id", String(pid));
    }
    await storage.setMitraSetting("collections_engine_mode", mode);
    sendSuccess(res, { ok: true, mode });
  });
```
(`getPipeline` is mitra-scoped, so the pipeline-existence check enforces same-tenant.)

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git commit -m "feat(collections): engine-mode GET/PUT endpoint"
```

---

### Task 4: Frontend — /integrations toggle + /collections redirect

**Files:**
- Modify: `client/hooks/usePipelines.ts` (or wherever a small shared hook fits) — add the engine-mode hooks
- Modify: `client/pages/IntegrationPage.tsx`
- Modify: `client/pages/CollectionPipelinePage.tsx`

**Context:** READ `client/pages/IntegrationPage.tsx` (its section pattern + the `api` usage), `client/pages/CollectionPipelinePage.tsx` (the `/collections` page; how it uses wouter), and `client/hooks/usePipelines.ts` (the `api` import + query/mutation patterns + `usePipelines()` to list pipelines for the picker).

- [ ] **Step 1: Hooks**

Add (matching the file's `api` + query patterns):
```ts
export function useCollectionsEngineMode() {
  return useQuery({ queryKey: ["collections-engine-mode"], queryFn: () => api.get(`/collections/engine-mode`) });
}
export function useSetCollectionsEngineMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { mode: "legacy" | "pipeline"; pipelineId?: number | null }) => api.put(`/collections/engine-mode`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["collections-engine-mode"] }),
  });
}
```

- [ ] **Step 2: /integrations section**

In `IntegrationPage.tsx`, add a section **"Migrasi Collections ke Pipeline"** following the page's existing
section/card pattern: a mode `<select>` (Legacy / Pipeline), a pipeline picker (from `usePipelines()`),
a note ("Prasyarat: pipeline tujuan punya rule billing_sync. Rollback: pilih Legacy."), and a Save button
calling `useSetCollectionsEngineMode().mutateAsync({ mode, pipelineId })` + a success/error toast. Hydrate
from `useCollectionsEngineMode()`. Disable Save (or require pipeline) when mode=pipeline without a pipeline.

- [ ] **Step 3: /collections redirect in pipeline-mode**

In `CollectionPipelinePage.tsx`, at the top of the component: call `useCollectionsEngineMode()`. Track a
`const [stayLegacy, setStayLegacy] = useState(false)`. When the query returns `mode === "pipeline"` &&
`pipelineId` && `!stayLegacy`, render a small banner ("Penagihan kini dikelola di pipeline.") with two
actions: a button that `navigate(`/pipelines/${pipelineId}`)` (and an effect that auto-navigates once on
load) and a "Lihat data lama (read-only)" link that sets `stayLegacy = true` (dismiss → the legacy board
renders as before). In `legacy` mode (or while loading) render the page unchanged. Use wouter's
`useLocation()` for `navigate`.

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add client/hooks/usePipelines.ts client/pages/IntegrationPage.tsx client/pages/CollectionPipelinePage.tsx
git commit -m "feat(collections): engine-mode toggle UI + /collections redirect"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests** — Run: `npx tsx --test shared/collectionsMode.test.ts` → all PASS.
- [ ] **Step 2: Typecheck** — Run: `npm run typecheck` → 0 errors.
- [ ] **Step 3: Build** — Run: `npm run build` → success.
- [ ] **Step 4: Wiring** — Run: `grep -rln "collectionsMode\|collections_engine_mode\|engine-mode" server/ shared/ client/ | sort` → expect shared module + test, worker, routes, hooks, integrations + collections pages.
- [ ] **Step 5: Default-safe check** — Confirm with `grep -n "collections_engine_mode" server/billing-sync-worker.ts` that the worker reads the per-mitra setting and that absence → `legacy` (via `parseCollectionsMode`), i.e. no behavior change until an admin flips the toggle.

---

## Self-Review

- **Spec coverage:** pure mode helper → Task 1. Worker gate (skip Phase-2+3 in pipeline-mode, keep billing_sync intake) → Task 2. GET/PUT engine-mode endpoint with validation → Task 3. /integrations toggle + /collections redirect → Task 4. Runbook is docs-only (in the spec) — no code task. Testing → Task 1 + Task 5. All covered.
- **Placeholders:** Tasks 1–3 + 5 are full code. Task 2 is an explicit wrap-don't-rewrite of existing blocks (the engineer moves verbatim lines inside the `if`). Task 4 integrates into existing pages with concrete hooks + behavior described and instructs reading them.
- **Type consistency:** `parseCollectionsMode`/`legacyCollectionsActive`/`CollectionsEngineMode` (Task 1) consumed in Task 2 (worker) + Task 3 (route). The endpoint shape `{ mode, pipelineId }` matches the hooks (Task 4) and the page's redirect logic. `setMitraSetting`/`getMitraSetting` signatures match the calls.

## Deploy note
No schema change. **Default-safe:** the toggle defaults to `legacy` (absent setting → legacy via `parseCollectionsMode`), so deploying changes nothing until an admin sets pipeline-mode in /integrations. Fully reversible (flip back to legacy → worker resumes, redirect off). The one-time data seed + billing_sync-rule setup are the manual runbook in the spec, not part of this deploy.
