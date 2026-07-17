# Dev DB Sync From Production — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Subagents: work DIRECTLY in this repo on branch `dev`. NO git worktrees, NO branch switches. Verify `git branch --show-current` is `dev` before committing.**

**Goal:** A prominent, dev-only button that copies the live production DB (`jabnet_fiber`) into the dev DB (`jabnet_fiber_dev`) on demand, so testers can reset dev to match production. Strictly prod→dev; production is read-only in this flow.

**Architecture:** Cross-database `INSERT … SELECT` through the existing mysql2 pool (the same MySQL user already has both schemas). A pure helper module computes the env-gate, the table/column intersections, and the SQL; a storage runner executes it; an env-gated admin endpoint drives it; an env-gated client card triggers it.

**Tech Stack:** Node/Express 5, mysql2 pool, Drizzle (unused here — raw `conn.query`), React 18 + TanStack Query, Tailwind/shadcn UI. Pure-module tests run with `npx tsx --test`.

---

## File Structure

- **Create** `server/dev-db-sync.ts` — pure helpers: `devDbSyncAvailable`, `tablesToMirror`, `copyColumns`, `buildCopySql`. No I/O.
- **Create** `server/dev-db-sync.test.ts` — unit tests for the pure helpers.
- **Modify** `server/storage.ts` — add `runDevDbSyncFromProd(prodDb)` (uses the pool + the pure helpers).
- **Modify** `server/routes.ts` — add `POST /api/dev/db-sync`; add `devDbSync` flag to `GET /api/public-config`.
- **Create** `client/hooks/useDevDbSync.ts` — mutation hook + result type.
- **Create** `client/components/integrations/DevDbSyncCard.tsx` — the prominent dev-only card + confirm dialog.
- **Modify** `client/pages/IntegrationPage.tsx` — render `<DevDbSyncCard />` at the top of the page.
- **Modify** `.env.example` — document `DEV_DB_SYNC_ENABLED` + `PROD_DB_NAME`.

---

## Task 1: Pure helper module `server/dev-db-sync.ts`

**Files:**
- Create: `server/dev-db-sync.ts`
- Test: `server/dev-db-sync.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/dev-db-sync.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { devDbSyncAvailable, tablesToMirror, copyColumns, buildCopySql } from "./dev-db-sync.js";

test("devDbSyncAvailable: only when flag on + prod≠current + current ends _dev", () => {
  const base = { DEV_DB_SYNC_ENABLED: "true", PROD_DB_NAME: "jabnet_fiber", DB_NAME: "jabnet_fiber_dev" };
  assert.equal(devDbSyncAvailable(base as any), true);
  assert.equal(devDbSyncAvailable({ ...base, DEV_DB_SYNC_ENABLED: "false" } as any), false); // flag off
  assert.equal(devDbSyncAvailable({ ...base, DB_NAME: "jabnet_fiber" } as any), false);       // prod === current
  assert.equal(devDbSyncAvailable({ ...base, DB_NAME: "jabnet_fiber" , PROD_DB_NAME: "jabnet_fiber" } as any), false);
  assert.equal(devDbSyncAvailable({ ...base, DB_NAME: "jabnet_fiber_prod" } as any), false);  // current not *_dev
  assert.equal(devDbSyncAvailable({ ...base, PROD_DB_NAME: "" } as any), false);              // prod empty
});

test("tablesToMirror: intersection, prod order preserved", () => {
  assert.deepEqual(tablesToMirror(["a", "b", "c"], ["c", "a"]), ["a", "c"]);
  assert.deepEqual(tablesToMirror(["a"], []), []);
});

test("copyColumns: intersection, prod order preserved", () => {
  assert.deepEqual(copyColumns(["id", "name", "extra"], ["id", "name"]), ["id", "name"]);
  assert.deepEqual(copyColumns(["x"], ["y"]), []);
});

test("buildCopySql: TRUNCATE + INSERT…SELECT with backtick-quoted identifiers", () => {
  const sql = buildCopySql("devdb", "proddb", "customers", ["id", "name"]);
  assert.deepEqual(sql, [
    "TRUNCATE TABLE `devdb`.`customers`",
    "INSERT INTO `devdb`.`customers` (`id`, `name`) SELECT `id`, `name` FROM `proddb`.`customers`",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test server/dev-db-sync.test.ts`
Expected: FAIL — cannot find module `./dev-db-sync.js` / functions not defined.

- [ ] **Step 3: Write the module**

Create `server/dev-db-sync.ts`:
```ts
/**
 * Pure helpers for the dev-only "tarik data dari production" feature (prod → dev DB copy).
 * No I/O — unit-tested. The runner lives in storage.ts; the endpoint in routes.ts.
 */

/** Backtick-quote a MySQL identifier (schema/table/column). */
function q(id: string): string {
  return "`" + id.replace(/`/g, "``") + "`";
}

/**
 * The feature may run ONLY when all hold:
 *  1. DEV_DB_SYNC_ENABLED === "true"  (set only in dev's .env)
 *  2. PROD_DB_NAME is set and differs from the current DB_NAME (never copy a DB onto itself)
 *  3. current DB_NAME ends with "_dev" (defence in depth — prod's DB is `jabnet_fiber`)
 * On production these env vars are absent, so this returns false there.
 */
export function devDbSyncAvailable(env: NodeJS.ProcessEnv): boolean {
  if (env.DEV_DB_SYNC_ENABLED !== "true") return false;
  const prod = (env.PROD_DB_NAME ?? "").trim();
  const cur = (env.DB_NAME ?? "").trim();
  if (!prod || !cur) return false;
  if (prod === cur) return false;
  if (!cur.endsWith("_dev")) return false;
  return true;
}

/** Tables present in BOTH schemas (only these can be mirrored). Prod order preserved. */
export function tablesToMirror(prodTables: string[], devTables: string[]): string[] {
  const dev = new Set(devTables);
  return prodTables.filter((t) => dev.has(t));
}

/**
 * Columns present in BOTH schemas for a table. Dev schema is usually NEWER (extra columns),
 * so copying only shared columns avoids "column count mismatch". Empty → caller skips the table.
 */
export function copyColumns(prodCols: string[], devCols: string[]): string[] {
  const dev = new Set(devCols);
  return prodCols.filter((c) => dev.has(c));
}

/** Per-table statements: TRUNCATE the dev table, then copy shared columns from prod. */
export function buildCopySql(devDb: string, prodDb: string, table: string, cols: string[]): string[] {
  const dst = `${q(devDb)}.${q(table)}`;
  const src = `${q(prodDb)}.${q(table)}`;
  const colList = cols.map(q).join(", ");
  return [
    `TRUNCATE TABLE ${dst}`,
    `INSERT INTO ${dst} (${colList}) SELECT ${colList} FROM ${src}`,
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test server/dev-db-sync.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/dev-db-sync.ts server/dev-db-sync.test.ts
git commit -m "feat(dev-sync): pure helpers for prod->dev DB copy (gate, intersections, SQL)"
```

---

## Task 2: Storage runner `runDevDbSyncFromProd`

**Files:**
- Modify: `server/storage.ts` (import the helpers near the top; add the method on the `DatabaseStorage` class)

- [ ] **Step 1: Add the import**

Near the other local `./*.js` imports at the top of `server/storage.ts`, add:
```ts
import { tablesToMirror, copyColumns, buildCopySql } from "./dev-db-sync.js";
```

- [ ] **Step 2: Add the runner method**

Add this method inside the `DatabaseStorage` class (anywhere among its methods; place it near the end before the closing brace). It uses the class's `this.pool`:
```ts
  /**
   * DEV-ONLY: copy every shared table from the production schema into the current (dev) DB.
   * Reads prod (SELECT only), TRUNCATE+INSERT into dev. Partial success: one bad table is
   * reported and the rest continue. Caller (route) must env-gate via devDbSyncAvailable().
   */
  async runDevDbSyncFromProd(prodDb: string): Promise<{
    tables: { table: string; rows: number; ok: boolean; error?: string }[];
    totalRows: number;
    durationMs: number;
  }> {
    const started = Date.now();
    const devDb = process.env.DB_NAME ?? "";
    const results: { table: string; rows: number; ok: boolean; error?: string }[] = [];
    const conn = await this.pool.getConnection();
    try {
      await conn.query("SET FOREIGN_KEY_CHECKS=0");
      const [prodT]: any = await conn.query(
        "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
        [prodDb],
      );
      const [devT]: any = await conn.query(
        "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
        [devDb],
      );
      const tables = tablesToMirror(prodT.map((r: any) => r.t), devT.map((r: any) => r.t));
      for (const table of tables) {
        try {
          const [pc]: any = await conn.query(
            "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = ? AND table_name = ?",
            [prodDb, table],
          );
          const [dc]: any = await conn.query(
            "SELECT column_name AS c FROM information_schema.columns WHERE table_schema = ? AND table_name = ?",
            [devDb, table],
          );
          const cols = copyColumns(pc.map((r: any) => r.c), dc.map((r: any) => r.c));
          if (cols.length === 0) {
            results.push({ table, rows: 0, ok: false, error: "no shared columns" });
            continue;
          }
          const [truncSql, insertSql] = buildCopySql(devDb, prodDb, table, cols);
          await conn.query(truncSql);
          const [ins]: any = await conn.query(insertSql);
          results.push({ table, rows: Number(ins.affectedRows ?? 0), ok: true });
        } catch (e: any) {
          results.push({ table, rows: 0, ok: false, error: e?.message ?? "error" });
        }
      }
    } finally {
      try { await conn.query("SET FOREIGN_KEY_CHECKS=1"); } catch { /* ignore */ }
      conn.release();
    }
    const totalRows = results.filter((r) => r.ok).reduce((a, r) => a + r.rows, 0);
    return { tables: results, totalRows, durationMs: Date.now() - started };
  }
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat(dev-sync): storage runner runDevDbSyncFromProd (cross-DB copy, partial success)"
```

---

## Task 3: Endpoint + public-config flag

**Files:**
- Modify: `server/routes.ts` (add import; add endpoint; extend `/api/public-config`)

- [ ] **Step 1: Add imports**

Near the top of `server/routes.ts` (with the other `./*.js` imports), add:
```ts
import { devDbSyncAvailable } from "./dev-db-sync.js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
```
(If `path` is already imported, skip that line.)

- [ ] **Step 2: Extend `/api/public-config` with the dev flag**

In `server/routes.ts`, the `/api/public-config` handler builds `const data = { googleMapsApiKey };` (~line 146) and a catch fallback `{ googleMapsApiKey: "" }` (~line 150). Change both to include the flag:
```ts
    const data = { googleMapsApiKey, devDbSync: devDbSyncAvailable(process.env) };
```
and the catch fallback:
```ts
    res.json({ success: true, data: { googleMapsApiKey: "", devDbSync: false } });
```

- [ ] **Step 3: Add the endpoint**

Add near the other `/api/*` routes (e.g. just after the `/api/public-config` handler). It is env-gated first (404 when unavailable — hides existence on prod), then admin-gated:
```ts
router.post("/api/dev/db-sync", async (req: Request, res: Response) => {
  // Env gate FIRST — on production these vars are absent, so the route 404s (looks like it doesn't exist).
  if (!devDbSyncAvailable(process.env)) return sendError(res, "Not found", 404);
  if (!requireWritePermission(req, res, "integrations")) return;
  try {
    const result = await storage.runDevDbSyncFromProd(process.env.PROD_DB_NAME!);
    const failed = result.tables.filter((t) => !t.ok);
    sendSuccess(res, {
      tablesCopied: result.tables.filter((t) => t.ok).length,
      totalRows: result.totalRows,
      durationMs: result.durationMs,
      perTable: result.tables,
      failed,
    });
    // Best-effort: trigger a Passenger reload so in-memory caches (route-cache, perm cache,
    // public-config) are rebuilt against the freshly-copied data. Reloads on next HTTP request.
    try {
      const tmpDir = path.join(process.cwd(), "tmp");
      await mkdir(tmpDir, { recursive: true });
      await writeFile(path.join(tmpDir, "restart.txt"), new Date().toISOString());
    } catch { /* ignore — not fatal */ }
  } catch (e: any) {
    sendError(res, e?.message || "Sinkronisasi gagal", 500);
  }
});
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(dev-sync): POST /api/dev/db-sync (env+admin gated) + devDbSync in /api/public-config"
```

---

## Task 4: Client hook + prominent card + mount

**Files:**
- Create: `client/hooks/useDevDbSync.ts`
- Create: `client/components/integrations/DevDbSyncCard.tsx`
- Modify: `client/pages/IntegrationPage.tsx`

- [ ] **Step 1: Create the hook**

Create `client/hooks/useDevDbSync.ts`:
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface DevDbSyncTable { table: string; rows: number; ok: boolean; error?: string }
export interface DevDbSyncResult {
  tablesCopied: number;
  totalRows: number;
  durationMs: number;
  perTable: DevDbSyncTable[];
  failed: DevDbSyncTable[];
}

/** DEV-ONLY: trigger prod → dev DB copy. On success, refetch everything (UI now shows prod data). */
export function useDevDbSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<DevDbSyncResult>("/dev/db-sync", {}),
    onSuccess: () => { qc.invalidateQueries(); },
  });
}
```

- [ ] **Step 2: Create the card component**

Create `client/components/integrations/DevDbSyncCard.tsx`:
```tsx
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Database, AlertTriangle, DownloadCloud } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useDevDbSync, type DevDbSyncResult } from "@/hooks/useDevDbSync";

/**
 * Prominent dev-only card: "Tarik Data dari Production".
 * Renders ONLY when /api/public-config reports devDbSync === true (i.e. on the dev environment).
 * Production users never see it. Clicking copies prod data INTO this dev DB (overwrites dev).
 */
export function DevDbSyncCard() {
  const [available, setAvailable] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [result, setResult] = useState<DevDbSyncResult | null>(null);
  const sync = useDevDbSync();

  useEffect(() => {
    let alive = true;
    api.get<{ devDbSync?: boolean }>("/public-config")
      .then((cfg) => { if (alive) setAvailable(cfg?.devDbSync === true); })
      .catch(() => { /* not available */ });
    return () => { alive = false; };
  }, []);

  if (!available) return null;

  const run = () => {
    sync.mutate(undefined, {
      onSuccess: (r) => {
        setResult(r);
        setConfirmOpen(false);
        setPhrase("");
        const msg = `${r.tablesCopied} tabel · ${r.totalRows.toLocaleString("id-ID")} baris · ${(r.durationMs / 1000).toFixed(1)}s`;
        if (r.failed.length) toast.warning(`${msg} · ${r.failed.length} tabel gagal`);
        else toast.success(`Data production tersalin: ${msg}`);
      },
      onError: (e: any) => toast.error(e?.message || "Sinkronisasi gagal"),
    });
  };

  return (
    <div className="rounded-xl border-2 border-amber-400/70 bg-amber-50 dark:bg-amber-950/20 p-4 sm:p-5 shadow-elev-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-amber-400/20 flex items-center justify-center">
            <Database className="h-5 w-5 text-amber-700 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-0.5">
                <AlertTriangle className="h-3 w-3" /> Lingkungan: Development
              </span>
            </div>
            <h3 className="mt-1 text-base font-bold text-amber-900 dark:text-amber-200">Tarik Data dari Production</h3>
            <p className="mt-0.5 text-sm text-amber-800/90 dark:text-amber-200/80">
              Menyalin SEMUA data production ke database dev ini. Data testing di dev akan ditimpa.
              Production tidak diubah.
            </p>
          </div>
        </div>
        <Button
          size="lg"
          className="w-full sm:w-auto shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={() => setConfirmOpen(true)}
          loading={sync.isPending}
        >
          <DownloadCloud className="size-4 mr-1.5" /> Salin data prod → dev
        </Button>
      </div>

      {result && (
        <div className="mt-3 text-xs text-amber-900/80 dark:text-amber-200/70">
          Terakhir: {result.tablesCopied} tabel · {result.totalRows.toLocaleString("id-ID")} baris
          {result.failed.length > 0 && (
            <span className="text-destructive"> · gagal: {result.failed.map((f) => f.table).join(", ")}</span>
          )}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!o) { setConfirmOpen(false); setPhrase(""); } }}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Salin data production ke dev?</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Seluruh isi database dev ini akan <strong>ditimpa</strong> dengan data production terkini
              (pelanggan, pipelines, mitra, user, dll). Semua perubahan testing di dev akan hilang.</p>
            <p className="text-muted-foreground">Ketik <strong>SALIN</strong> untuk melanjutkan.</p>
            <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder="SALIN" autoFocus />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => { setConfirmOpen(false); setPhrase(""); }} disabled={sync.isPending}>
              Batal
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={phrase.trim().toUpperCase() !== "SALIN" || sync.isPending}
              loading={sync.isPending}
              onClick={run}
            >
              Ya, salin sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Mount it at the top of IntegrationPage**

In `client/pages/IntegrationPage.tsx`, add the import with the other component imports:
```tsx
import { DevDbSyncCard } from "@/components/integrations/DevDbSyncCard";
```
Then in the main `IntegrationPage` component's return (the `<div className="space-y-6">` at ~line 887), insert `<DevDbSyncCard />` immediately AFTER the header block (the `<div className="flex items-center gap-3">…</div>` that ends ~line 902) and BEFORE the "Card 1 — Google Maps Platform" comment:
```tsx
      </div>

      <DevDbSyncCard />

      {/* ================================================================= */}
      {/* Card 1 — Google Maps Platform                                     */}
```

- [ ] **Step 4: Verify it compiles + builds**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 type errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/hooks/useDevDbSync.ts client/components/integrations/DevDbSyncCard.tsx client/pages/IntegrationPage.tsx
git commit -m "feat(dev-sync): prominent dev-only DevDbSyncCard + useDevDbSync hook on /integrations"
```

---

## Task 5: Document env vars + final verify

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document the env vars**

In `.env.example`, add a new section (near the MySQL section):
```bash
# ── Dev-only: "Tarik Data dari Production" button (prod → dev DB copy) ──
# Set these ONLY in the dev/staging .env. On production leave them UNSET so the feature
# (button + POST /api/dev/db-sync) stays disabled. Guard also requires DB_NAME to end with "_dev"
# and to differ from PROD_DB_NAME, so production can never copy onto itself.
# DEV_DB_SYNC_ENABLED=true
# PROD_DB_NAME=jabnet_fiber
```

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit && npm run build && npx tsx --test server/dev-db-sync.test.ts`
Expected: 0 type errors, build OK, 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs(dev-sync): document DEV_DB_SYNC_ENABLED + PROD_DB_NAME (dev-only)"
```

---

## Deployment notes (for the human, after merge)

Set in **dev** `.env` only (`/home/jabnet/private/fiber-jabnet-dev/config/.env`):
```
DEV_DB_SYNC_ENABLED=true
PROD_DB_NAME=jabnet_fiber
```
Then `touch /home/jabnet/dev-fiber-jabnet/tmp/restart.txt`. The MySQL user (`jabnet_crm_user`) must have SELECT on `jabnet_fiber` and full DML on `jabnet_fiber_dev` (it already does — the mirror cron relies on the same access). Do **not** set these vars on production.

## Manual acceptance (on dev)
1. `workspace-dev.jabnet.id` → `/integrations`: amber "Tarik Data dari Production" card at top with DEVELOPMENT badge.
2. Change some dev data → click → type `SALIN` → confirm → toast summary; dev change is gone, prod data shown.
3. `workspace.jabnet.id` (prod) `/integrations`: card NOT shown; `POST /api/dev/db-sync` → 404.
4. A production row is unchanged before/after.
