# SP2 - Collection Parameters Config + Stage Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **Subagents: work DIRECTLY in this repo on branch `dev`. NO git worktrees, NO branch switches. Verify `git branch --show-current` is `dev` before committing.**

**Goal:** Store + edit per-pipeline collection parameters (entry threshold/mode, write-off threshold/action, entry/paid/write-off stage refs) and a configurable overdue-range → stage mapping table. Config + UI only - no automation runs yet (SP3).

**Architecture:** Two dedicated mitra-scoped tables (`collection_config` 1-row/pipeline + `collection_stage_map` N-rows). A pure module validates the config + map and resolves overdue→stage (SP3 reuses it). Storage upsert (replace-all map in a transaction). Admin-gated GET/PUT endpoints. A new `CollectionParametersDialog` opened from the board settings menu.

**Tech Stack:** Drizzle/mysql2, Express, React 18 + TanStack Query + Tailwind/shadcn. Pure tests via `npx tsx --test`. Local imports use `.js`.

---

## File Structure
- **Modify** `shared/schema.ts` - `collectionConfig` + `collectionStageMap` tables + inferred types.
- **Create** `shared/collectionConfig.ts` (+ `.test.ts`) - entry-mode/write-off enums, `validateStageMap`, `stageForOverdue`, `validateCollectionConfig`.
- **Modify** `server/storage.ts` - startup migrations (CREATE TABLE) + `getCollectionConfig` + `upsertCollectionConfig`.
- **Modify** `server/routes.ts` - `GET`/`PUT /api/pipelines/:id/collection-config`.
- **Modify** `client/hooks/usePipelines.ts` - `useCollectionConfig` + `useSaveCollectionConfig`.
- **Create** `client/components/pipelines/CollectionParametersDialog.tsx`.
- **Modify** `client/pages/PipelineBoardPage.tsx` - menu button + dialog mount.

---

## Task 1: Schema + startup migrations

**Files:** Modify `shared/schema.ts`, `server/storage.ts`.

- [ ] **Step 1: Add the tables to `shared/schema.ts`**

Add immediately AFTER the `collectionStages` table block (search for `export const collectionStages = mysqlTable`) - or anywhere among the pipeline tables:
```ts
export const collectionConfig = mysqlTable("collection_config", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  enabled: int("enabled").notNull().default(0),
  entryThresholdDays: int("entry_threshold_days").notNull().default(7),
  entryMode: varchar("entry_mode", { length: 24 }).notNull().default("create_if_not_exists"),
  entryStageId: int("entry_stage_id"),
  paidStageId: int("paid_stage_id"),
  writeoffThresholdDays: int("writeoff_threshold_days"),
  writeoffAction: varchar("writeoff_action", { length: 16 }).notNull().default("move_stage"),
  writeoffStageId: int("writeoff_stage_id"),
  writeoffRuleId: int("writeoff_rule_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({ uniqPipeline: uniqueIndex("uniq_collection_config_pipeline").on(t.pipelineId) }));

export const collectionStageMap = mysqlTable("collection_stage_map", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  minOverdueDays: int("min_overdue_days").notNull(),
  maxOverdueDays: int("max_overdue_days"),
  stageId: int("stage_id").notNull(),
  position: int("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, (t) => ({ byPipeline: index("idx_collection_stage_map_pipeline").on(t.mitraId, t.pipelineId, t.position) }));

export type CollectionConfig = typeof collectionConfig.$inferSelect;
export type CollectionStageMapRow = typeof collectionStageMap.$inferSelect;
```
(`mysqlTable`, `int`, `varchar`, `text`, `index`, `uniqueIndex` are already imported in schema.ts.)

- [ ] **Step 2: Add startup migrations in `server/storage.ts`**

Find an existing pipeline-table migration block (search `CREATE TABLE IF NOT EXISTS pipeline_rule_fires`). Add these TWO blocks right after it (same `try { await this.db.execute(sql\`...\`) } catch` shape):
```ts
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS collection_config (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          enabled INT NOT NULL DEFAULT 0,
          entry_threshold_days INT NOT NULL DEFAULT 7,
          entry_mode VARCHAR(24) NOT NULL DEFAULT 'create_if_not_exists',
          entry_stage_id INT,
          paid_stage_id INT,
          writeoff_threshold_days INT,
          writeoff_action VARCHAR(16) NOT NULL DEFAULT 'move_stage',
          writeoff_stage_id INT,
          writeoff_rule_id INT,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          UNIQUE KEY uniq_collection_config_pipeline (pipeline_id)
        )
      `);
    } catch (e: any) { console.warn(`[migration] collection_config setup failed: ${e.message}`); }

    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS collection_stage_map (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          min_overdue_days INT NOT NULL,
          max_overdue_days INT,
          stage_id INT NOT NULL,
          position INT NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          KEY idx_collection_stage_map_pipeline (mitra_id, pipeline_id, position)
        )
      `);
    } catch (e: any) { console.warn(`[migration] collection_stage_map setup failed: ${e.message}`); }
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(collection): collection_config + collection_stage_map tables + migrations"
```

---

## Task 2: Pure module `shared/collectionConfig.ts`

**Files:** Create `shared/collectionConfig.ts`, `shared/collectionConfig.test.ts`.

- [ ] **Step 1: Write the failing test**

Create `shared/collectionConfig.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENTRY_MODES, WRITEOFF_ACTIONS, validateStageMap, stageForOverdue, validateCollectionConfig,
} from "./collectionConfig.js";

const map = [
  { minOverdueDays: 1, maxOverdueDays: 7, stageId: 10, position: 0 },
  { minOverdueDays: 8, maxOverdueDays: 14, stageId: 11, position: 1 },
  { minOverdueDays: 181, maxOverdueDays: null, stageId: 99, position: 2 },
];

test("registries expose the expected keys", () => {
  assert.deepEqual(ENTRY_MODES.map((m) => m.mode), ["create", "move", "create_if_not_exists", "reopen"]);
  assert.deepEqual(WRITEOFF_ACTIONS.map((a) => a.action), ["move_stage", "custom_rule"]);
});

test("validateStageMap: ok / overlap / bad range / open-ended not last", () => {
  assert.equal(validateStageMap(map), null);
  assert.match(validateStageMap([{ minOverdueDays: 1, maxOverdueDays: 7, stageId: 10, position: 0 }, { minOverdueDays: 5, maxOverdueDays: 10, stageId: 11, position: 1 }]) ?? "", /tumpang tindih/);
  assert.match(validateStageMap([{ minOverdueDays: 10, maxOverdueDays: 5, stageId: 10, position: 0 }]) ?? "", /maksimum/);
  assert.match(validateStageMap([{ minOverdueDays: 1, maxOverdueDays: null, stageId: 10, position: 0 }, { minOverdueDays: 8, maxOverdueDays: 14, stageId: 11, position: 1 }]) ?? "", /tumpang tindih/);
  assert.match(validateStageMap([{ minOverdueDays: 0, maxOverdueDays: 7, stageId: 0, position: 0 }]) ?? "", /stage/);
});

test("stageForOverdue: in-range, open-ended, none", () => {
  assert.equal(stageForOverdue(map, 3), 10);
  assert.equal(stageForOverdue(map, 8), 11);
  assert.equal(stageForOverdue(map, 200), 99);
  assert.equal(stageForOverdue(map, 0), null);   // below first range
  assert.equal(stageForOverdue(map, 100), null);  // gap (15..180 unmapped)
});

test("validateCollectionConfig: good + each failure", () => {
  const base = { enabled: true, entryThresholdDays: 7, entryMode: "create_if_not_exists", entryStageId: 10, paidStageId: 11, writeoffThresholdDays: 180, writeoffAction: "move_stage", writeoffStageId: 99, writeoffRuleId: null };
  assert.equal(validateCollectionConfig(base as any), null);
  assert.match(validateCollectionConfig({ ...base, entryThresholdDays: -1 } as any) ?? "", /ambang masuk/i);
  assert.match(validateCollectionConfig({ ...base, entryMode: "nope" } as any) ?? "", /mode entry/i);
  assert.match(validateCollectionConfig({ ...base, writeoffAction: "nope" } as any) ?? "", /aksi write-off/i);
  assert.match(validateCollectionConfig({ ...base, writeoffThresholdDays: 3 } as any) ?? "", />= ambang masuk/i);
  assert.match(validateCollectionConfig({ ...base, writeoffStageId: null } as any) ?? "", /stage tujuan write-off/i);
  assert.match(validateCollectionConfig({ ...base, writeoffAction: "custom_rule", writeoffRuleId: null } as any) ?? "", /rule/i);
  assert.equal(validateCollectionConfig({ ...base, writeoffThresholdDays: null, writeoffStageId: null } as any), null); // no write-off → no stage needed
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test shared/collectionConfig.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the module**

Create `shared/collectionConfig.ts`:
```ts
/** Pure helpers for per-pipeline collection parameters - no I/O. SP3 reuses stageForOverdue. */

export type CollectionEntryMode = "create" | "move" | "create_if_not_exists" | "reopen";
export type WriteoffAction = "move_stage" | "custom_rule";

export const ENTRY_MODES: { mode: CollectionEntryMode; label: string; hint: string }[] = [
  { mode: "create", label: "Buat Kartu", hint: "Selalu buat kartu collection baru saat overdue lewat ambang." },
  { mode: "move", label: "Pindahkan Kartu", hint: "Pindahkan kartu yang sudah ada ke stage collection." },
  { mode: "create_if_not_exists", label: "Buat Jika Belum Ada", hint: "Buat kartu hanya jika belum ada kartu aktif (tanpa duplikat)." },
  { mode: "reopen", label: "Aktifkan Kembali", hint: "Aktifkan kembali kartu collection lama yang sudah selesai." },
];

export const WRITEOFF_ACTIONS: { action: WriteoffAction; label: string }[] = [
  { action: "move_stage", label: "Pindah ke stage Write-Off" },
  { action: "custom_rule", label: "Jalankan rule otomasi" },
];

const ENTRY_MODE_SET = new Set<string>(ENTRY_MODES.map((m) => m.mode));
const WRITEOFF_ACTION_SET = new Set<string>(WRITEOFF_ACTIONS.map((a) => a.action));

export interface StageMapRow {
  minOverdueDays: number;
  maxOverdueDays: number | null;
  stageId: number;
  position: number;
}

/** Validate the range→stage map. null = ok, else an Indonesian error string. */
export function validateStageMap(rows: StageMapRow[]): string | null {
  for (const r of rows) {
    if (!Number.isInteger(r.minOverdueDays) || r.minOverdueDays < 0) return "Hari overdue minimum harus bilangan bulat ≥ 0";
    if (r.maxOverdueDays != null && (!Number.isInteger(r.maxOverdueDays) || r.maxOverdueDays < r.minOverdueDays)) return "Hari overdue maksimum harus ≥ minimum";
    if (!Number.isInteger(r.stageId) || r.stageId <= 0) return "Setiap baris mapping harus memilih stage";
  }
  const sorted = [...rows].sort((a, b) => a.minOverdueDays - b.minOverdueDays);
  for (let i = 0; i < sorted.length - 1; i++) {
    const curMax = sorted[i].maxOverdueDays == null ? Infinity : sorted[i].maxOverdueDays;
    if (curMax >= sorted[i + 1].minOverdueDays) return "Rentang hari overdue tidak boleh tumpang tindih";
  }
  return null;
}

/** SP3 resolver: stageId whose [min,max] (max null = open-ended) contains daysOverdue; most-specific
 * (highest matching min). null if none match. */
export function stageForOverdue(rows: StageMapRow[], daysOverdue: number): number | null {
  let best: StageMapRow | null = null;
  for (const r of rows) {
    const max = r.maxOverdueDays == null ? Infinity : r.maxOverdueDays;
    if (daysOverdue >= r.minOverdueDays && daysOverdue <= max) {
      if (!best || r.minOverdueDays > best.minOverdueDays) best = r;
    }
  }
  return best ? best.stageId : null;
}

export interface CollectionConfigInput {
  enabled: boolean;
  entryThresholdDays: number;
  entryMode: string;
  entryStageId: number | null;
  paidStageId: number | null;
  writeoffThresholdDays: number | null;
  writeoffAction: string;
  writeoffStageId: number | null;
  writeoffRuleId: number | null;
}

/** Enum + numeric sanity (stage-id existence is checked at the route, which has DB access). */
export function validateCollectionConfig(cfg: CollectionConfigInput): string | null {
  if (!Number.isInteger(cfg.entryThresholdDays) || cfg.entryThresholdDays < 0) return "Ambang masuk collection harus bilangan bulat ≥ 0";
  if (!ENTRY_MODE_SET.has(cfg.entryMode)) return "Mode entry tidak valid";
  if (!WRITEOFF_ACTION_SET.has(cfg.writeoffAction)) return "Aksi write-off tidak valid";
  if (cfg.writeoffThresholdDays != null) {
    if (!Number.isInteger(cfg.writeoffThresholdDays) || cfg.writeoffThresholdDays < 0) return "Ambang write-off harus bilangan bulat ≥ 0";
    if (cfg.writeoffThresholdDays < cfg.entryThresholdDays) return "Ambang write-off harus ≥ ambang masuk collection";
    if (cfg.writeoffAction === "move_stage" && cfg.writeoffStageId == null) return "Pilih stage tujuan write-off";
    if (cfg.writeoffAction === "custom_rule" && cfg.writeoffRuleId == null) return "Pilih rule untuk write-off";
  }
  return null;
}
```

- [ ] **Step 4: Run to verify passes**

Run: `npx tsx --test shared/collectionConfig.test.ts` → PASS (4 tests). `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add shared/collectionConfig.ts shared/collectionConfig.test.ts
git commit -m "feat(collection): pure config helpers (validate map/config, stageForOverdue)"
```

---

## Task 3: Storage - get + upsert

**Files:** Modify `server/storage.ts`.

- [ ] **Step 1: Add imports**

With the other `../shared/*.js` imports at the top, add:
```ts
import { collectionConfig, collectionStageMap, type CollectionConfig, type CollectionStageMapRow } from "../shared/schema.js";
import { type CollectionConfigInput, type StageMapRow } from "../shared/collectionConfig.js";
```
NOTE: `collectionConfig`/`collectionStageMap` are NEW exports from schema - if schema is imported via a big destructured `import { ... } from "../shared/schema.js"` already, ADD the two table names + the two types to that existing import instead of a duplicate line. Grep for the existing schema import first.

- [ ] **Step 2: Add the two methods to the `DatabaseStorage` class**

```ts
  async getCollectionConfig(pipelineId: number): Promise<{ config: CollectionConfig | null; stageMap: CollectionStageMapRow[] }> {
    const mid = getMitraId();
    const cfgRows = await this.db.select().from(collectionConfig)
      .where(and(eq(collectionConfig.pipelineId, pipelineId), eq(collectionConfig.mitraId, mid)));
    const mapRows = await this.db.select().from(collectionStageMap)
      .where(and(eq(collectionStageMap.pipelineId, pipelineId), eq(collectionStageMap.mitraId, mid)))
      .orderBy(collectionStageMap.position);
    return { config: (cfgRows as any[])[0] ?? null, stageMap: mapRows as CollectionStageMapRow[] };
  }

  /** Upsert config + replace the stage map for a pipeline, in one transaction. Mitra-scoped. */
  async upsertCollectionConfig(pipelineId: number, cfg: CollectionConfigInput, mapRows: StageMapRow[]): Promise<void> {
    const mid = getMitraId();
    const now = new Date().toISOString();
    const conn = await this.pool.getConnection();
    await conn.beginTransaction();
    try {
      const [existing]: any = await conn.query("SELECT id FROM collection_config WHERE pipeline_id = ? AND mitra_id = ?", [pipelineId, mid]);
      const vals = [cfg.enabled ? 1 : 0, cfg.entryThresholdDays, cfg.entryMode, cfg.entryStageId, cfg.paidStageId, cfg.writeoffThresholdDays, cfg.writeoffAction, cfg.writeoffStageId, cfg.writeoffRuleId];
      if ((existing as any[]).length) {
        await conn.query(
          "UPDATE collection_config SET enabled=?, entry_threshold_days=?, entry_mode=?, entry_stage_id=?, paid_stage_id=?, writeoff_threshold_days=?, writeoff_action=?, writeoff_stage_id=?, writeoff_rule_id=?, updated_at=? WHERE pipeline_id=? AND mitra_id=?",
          [...vals, now, pipelineId, mid]);
      } else {
        await conn.query(
          "INSERT INTO collection_config (mitra_id, pipeline_id, enabled, entry_threshold_days, entry_mode, entry_stage_id, paid_stage_id, writeoff_threshold_days, writeoff_action, writeoff_stage_id, writeoff_rule_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          [mid, pipelineId, ...vals, now]);
      }
      await conn.query("DELETE FROM collection_stage_map WHERE pipeline_id = ? AND mitra_id = ?", [pipelineId, mid]);
      for (let i = 0; i < mapRows.length; i++) {
        const r = mapRows[i];
        await conn.query(
          "INSERT INTO collection_stage_map (mitra_id, pipeline_id, min_overdue_days, max_overdue_days, stage_id, position, created_at) VALUES (?,?,?,?,?,?,?)",
          [mid, pipelineId, r.minOverdueDays, r.maxOverdueDays, r.stageId, i, now]);
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; }
    finally { conn.release(); }
  }
```
(`getMitraId`, `and`, `eq`, `this.pool`, `this.db` are already available in this class.)

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/storage.ts
git commit -m "feat(collection): storage get/upsert collection config + stage map"
```

---

## Task 4: API endpoints

**Files:** Modify `server/routes.ts`.

- [ ] **Step 1: Add imports**

With the other `../shared/*.js` imports, add:
```ts
import { validateCollectionConfig, validateStageMap, type CollectionConfigInput, type StageMapRow } from "../shared/collectionConfig.js";
```

- [ ] **Step 2: Add the endpoints**

Place right BEFORE the `router.get("/api/pipelines/:id/rules", ...)` handler (search for it). Add:
```ts
  router.get("/api/pipelines/:id/collection-config", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineCapability(req, res, pid, "manage"))) return;
    const data = await storage.getCollectionConfig(pid);
    return sendSuccess(res, data);
  });

  router.put("/api/pipelines/:id/collection-config", async (req: Request, res: Response) => {
    const pid = Number(req.params.id);
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineCapability(req, res, pid, "manage"))) return;
    const config = req.body?.config as CollectionConfigInput;
    const stageMap = (req.body?.stageMap ?? []) as StageMapRow[];
    if (!config || typeof config !== "object") return sendError(res, "config wajib diisi", 400);
    if (!Array.isArray(stageMap)) return sendError(res, "stageMap harus array", 400);
    const cfgErr = validateCollectionConfig(config);
    if (cfgErr) return sendError(res, cfgErr, 400);
    const mapErr = validateStageMap(stageMap);
    if (mapErr) return sendError(res, mapErr, 400);
    // stage-id ownership: every referenced stage must belong to this pipeline
    const stageIds = new Set((await storage.listStages(pid)).map((s) => s.id));
    const refStages = [config.entryStageId, config.paidStageId, config.writeoffStageId, ...stageMap.map((r) => r.stageId)]
      .filter((v): v is number => typeof v === "number");
    for (const sid of refStages) {
      if (!stageIds.has(sid)) return sendError(res, "Stage yang dirujuk tidak ada di pipeline ini", 400);
    }
    if (config.writeoffAction === "custom_rule" && config.writeoffRuleId != null) {
      const ruleIds = new Set((await storage.listRules(pid)).map((r) => r.id));
      if (!ruleIds.has(config.writeoffRuleId)) return sendError(res, "Rule write-off tidak ada di pipeline ini", 400);
    }
    await storage.upsertCollectionConfig(pid, config, stageMap);
    return sendSuccess(res, { ok: true });
  });
```
(`requireWritePermission`, `requirePipelineCapability`, `sendSuccess`, `sendError`, `storage` are all in scope here; `Request`/`Response` imported.)

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(collection): GET/PUT /api/pipelines/:id/collection-config (validated, gated)"
```

---

## Task 5: Client hook + dialog + board wiring

**Files:** Modify `client/hooks/usePipelines.ts`, `client/pages/PipelineBoardPage.tsx`; Create `client/components/pipelines/CollectionParametersDialog.tsx`.

- [ ] **Step 1: Add hooks in `client/hooks/usePipelines.ts`**

At the end of the file add (the file already imports `useQuery`, `useMutation`, `useQueryClient`, `api`):
```ts
export interface CollectionConfigData {
  config: {
    enabled: number; entryThresholdDays: number; entryMode: string;
    entryStageId: number | null; paidStageId: number | null;
    writeoffThresholdDays: number | null; writeoffAction: string;
    writeoffStageId: number | null; writeoffRuleId: number | null;
  } | null;
  stageMap: { minOverdueDays: number; maxOverdueDays: number | null; stageId: number; position: number }[];
}

export function useCollectionConfig(pipelineId: number) {
  return useQuery({
    queryKey: ["/api/pipelines", pipelineId, "collection-config"],
    queryFn: () => api.get<CollectionConfigData>(`/pipelines/${pipelineId}/collection-config`),
  });
}

export function useSaveCollectionConfig(pipelineId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { config: any; stageMap: any[] }) => api.put(`/pipelines/${pipelineId}/collection-config`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/pipelines", pipelineId, "collection-config"] }); },
  });
}
```

- [ ] **Step 2: Create `client/components/pipelines/CollectionParametersDialog.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { api } from "@/lib/api";
import { usePipeline, useCollectionConfig, useSaveCollectionConfig } from "@/hooks/usePipelines";
import { ENTRY_MODES, WRITEOFF_ACTIONS, validateStageMap, validateCollectionConfig } from "@shared/collectionConfig";

type MapRow = { minOverdueDays: number; maxOverdueDays: number | null; stageId: number | ""; position: number };

export function CollectionParametersDialog({ pipelineId, open, onClose }: { pipelineId: number; open: boolean; onClose: () => void }) {
  const { data: pipeline } = usePipeline(pipelineId);
  const { data, isLoading } = useCollectionConfig(pipelineId);
  const save = useSaveCollectionConfig(pipelineId);
  const stages = pipeline?.stages ?? [];
  const stageOpts = stages.map((s) => ({ value: String(s.id), label: s.label }));
  const { data: rules } = useQuery({
    queryKey: ["/api/pipelines", pipelineId, "rules"],
    queryFn: () => api.get<{ id: number; name?: string | null }[]>(`/pipelines/${pipelineId}/rules`),
    enabled: open,
  });
  const ruleOpts = (rules ?? []).map((r) => ({ value: String(r.id), label: r.name || `Rule #${r.id}` }));

  const [enabled, setEnabled] = useState(false);
  const [entryThreshold, setEntryThreshold] = useState("7");
  const [entryMode, setEntryMode] = useState("create_if_not_exists");
  const [entryStageId, setEntryStageId] = useState<string>("");
  const [paidStageId, setPaidStageId] = useState<string>("");
  const [writeoffThreshold, setWriteoffThreshold] = useState("");
  const [writeoffAction, setWriteoffAction] = useState("move_stage");
  const [writeoffStageId, setWriteoffStageId] = useState<string>("");
  const [writeoffRuleId, setWriteoffRuleId] = useState<string>("");
  const [rows, setRows] = useState<MapRow[]>([]);

  useEffect(() => {
    if (!data) return;
    const c = data.config;
    setEnabled(!!c?.enabled);
    setEntryThreshold(String(c?.entryThresholdDays ?? 7));
    setEntryMode(c?.entryMode ?? "create_if_not_exists");
    setEntryStageId(c?.entryStageId != null ? String(c.entryStageId) : "");
    setPaidStageId(c?.paidStageId != null ? String(c.paidStageId) : "");
    setWriteoffThreshold(c?.writeoffThresholdDays != null ? String(c.writeoffThresholdDays) : "");
    setWriteoffAction(c?.writeoffAction ?? "move_stage");
    setWriteoffStageId(c?.writeoffStageId != null ? String(c.writeoffStageId) : "");
    setWriteoffRuleId(c?.writeoffRuleId != null ? String(c.writeoffRuleId) : "");
    setRows((data.stageMap ?? []).map((r, i) => ({ minOverdueDays: r.minOverdueDays, maxOverdueDays: r.maxOverdueDays, stageId: r.stageId, position: i })));
  }, [data]);

  const setRow = (i: number, patch: Partial<MapRow>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { minOverdueDays: 0, maxOverdueDays: null, stageId: "", position: rs.length }]);
  const delRow = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));
  const moveRow = (i: number, dir: -1 | 1) => setRows((rs) => {
    const j = i + dir; if (j < 0 || j >= rs.length) return rs;
    const next = [...rs]; [next[i], next[j]] = [next[j], next[i]]; return next;
  });

  const onSave = () => {
    const config = {
      enabled, entryThresholdDays: Number(entryThreshold) || 0, entryMode,
      entryStageId: entryStageId ? Number(entryStageId) : null,
      paidStageId: paidStageId ? Number(paidStageId) : null,
      writeoffThresholdDays: writeoffThreshold.trim() === "" ? null : Number(writeoffThreshold),
      writeoffAction,
      writeoffStageId: writeoffAction === "move_stage" && writeoffStageId ? Number(writeoffStageId) : null,
      writeoffRuleId: writeoffAction === "custom_rule" && writeoffRuleId ? Number(writeoffRuleId) : null,
    };
    const mapRows = rows.map((r, i) => ({ minOverdueDays: Number(r.minOverdueDays) || 0, maxOverdueDays: r.maxOverdueDays, stageId: Number(r.stageId), position: i }));
    if (enabled) {
      const cfgErr = validateCollectionConfig(config as any);
      if (cfgErr) { toast.error(cfgErr); return; }
      const mapErr = validateStageMap(mapRows as any);
      if (mapErr) { toast.error(mapErr); return; }
    }
    save.mutate({ config, stageMap: mapRows }, {
      onSuccess: () => { toast.success("Parameter collection disimpan"); onClose(); },
      onError: (e: any) => toast.error(e?.message || "Gagal menyimpan"),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b shrink-0"><DialogTitle>Parameter Collection</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isLoading ? <div className="h-32 animate-pulse rounded bg-muted" /> : (
            <>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Switch checked={enabled} onCheckedChange={setEnabled} />
                Pipeline ini adalah pipeline Penagihan (Collections)
              </label>

              {enabled && (
                <>
                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground">Masuk Collection</h4>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="text-sm">Masuk collection setelah</span>
                      <Input type="number" inputSize="sm" className="w-24" value={entryThreshold} onChange={(e) => setEntryThreshold(e.target.value)} />
                      <span className="text-sm">hari overdue</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ENTRY_MODES.map((m) => (
                        <button key={m.mode} type="button" onClick={() => setEntryMode(m.mode)} title={m.hint}
                          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${entryMode === m.mode ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted border-border"}`}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div><label className="text-[10px] text-muted-foreground">Stage masuk</label><Combobox size="sm" options={stageOpts} value={entryStageId} onChange={setEntryStageId} placeholder="Pilih stage…" /></div>
                      <div><label className="text-[10px] text-muted-foreground">Stage lunas</label><Combobox size="sm" options={stageOpts} value={paidStageId} onChange={setPaidStageId} placeholder="Pilih stage…" /></div>
                    </div>
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground">Auto Write-Off</h4>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="text-sm">Write-off setelah</span>
                      <Input type="number" inputSize="sm" className="w-24" value={writeoffThreshold} onChange={(e) => setWriteoffThreshold(e.target.value)} placeholder="-" />
                      <span className="text-sm">hari overdue (kosong = nonaktif)</span>
                    </div>
                    {writeoffThreshold.trim() !== "" && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <Combobox size="sm" options={WRITEOFF_ACTIONS.map((a) => ({ value: a.action, label: a.label }))} value={writeoffAction} onChange={setWriteoffAction} clearable={false} />
                        {writeoffAction === "move_stage" && <Combobox size="sm" options={stageOpts} value={writeoffStageId} onChange={setWriteoffStageId} placeholder="Stage write-off…" />}
                        {writeoffAction === "custom_rule" && <Combobox size="sm" options={ruleOpts} value={writeoffRuleId} onChange={setWriteoffRuleId} placeholder="Pilih rule…" searchPlaceholder="Cari rule…" />}
                      </div>
                    )}
                  </section>

                  <section className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground">Mapping Overdue → Stage</h4>
                    <div className="space-y-1.5">
                      {rows.map((r, i) => (
                        <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-1.5 rounded-lg border border-border/60 p-2">
                          <div className="flex items-center gap-1.5">
                            <Input type="number" inputSize="sm" className="w-16" value={String(r.minOverdueDays)} onChange={(e) => setRow(i, { minOverdueDays: Number(e.target.value) || 0 })} />
                            <span className="text-xs">-</span>
                            <Input type="number" inputSize="sm" className="w-16" value={r.maxOverdueDays == null ? "" : String(r.maxOverdueDays)} placeholder="∞" onChange={(e) => setRow(i, { maxOverdueDays: e.target.value.trim() === "" ? null : Number(e.target.value) })} />
                            <span className="text-xs whitespace-nowrap">hari →</span>
                          </div>
                          <div className="flex-1 min-w-[8rem]"><Combobox size="sm" options={stageOpts} value={r.stageId === "" ? "" : String(r.stageId)} onChange={(v) => setRow(i, { stageId: v ? Number(v) : "" })} placeholder="Stage…" /></div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button type="button" variant="ghost" size="icon-sm" aria-label="Naik" onClick={() => moveRow(i, -1)}><ArrowUp className="size-4" /></Button>
                            <Button type="button" variant="ghost" size="icon-sm" aria-label="Turun" onClick={() => moveRow(i, 1)}><ArrowDown className="size-4" /></Button>
                            <Button type="button" variant="ghost" size="icon-sm" aria-label="Hapus" onClick={() => delRow(i)}><Trash2 className="size-4" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={addRow}><Plus className="size-4 mr-1" /> Tambah baris</Button>
                  </section>
                </>
              )}
            </>
          )}
        </div>
        <DialogFooter className="px-5 py-3 border-t shrink-0">
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>Batal</Button>
          <Button onClick={onSave} loading={save.isPending}>Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```
NOTE: confirm `usePipeline` returns `{ stages }` (it returns `PipelineWithStages`) and `Combobox` supports `size="sm"` (it does). The write-off `custom_rule` rule-picker is populated from the pipeline's rules (`/pipelines/:id/rules`); when `custom_rule` is selected the rule Combobox appears and its id is sent as `writeoffRuleId`. Selecting `custom_rule` without picking a rule is rejected by `validateCollectionConfig` with a clear toast before the request is sent.

- [ ] **Step 3: Wire into the board (`client/pages/PipelineBoardPage.tsx`)**

(a) Import: `import { CollectionParametersDialog } from "@/components/pipelines/CollectionParametersDialog";`
(b) State: near `const [showRules, setShowRules] = useState(false);` add `const [showCollection, setShowCollection] = useState(false);`
(c) Menu button: after the `{can("automation") && <Button ... onClick={() => setShowRules(true)}>Otomasi</Button>}` line add:
```tsx
            {can("manage") && <Button variant="outline" size="sm" onClick={() => setShowCollection(true)}>Collection</Button>}
```
(d) Dialog mount: after the `{showRules && pid != null && (<PipelineRulesDialog .../>)}` block add:
```tsx
      {showCollection && pid != null && (
        <CollectionParametersDialog pipelineId={pid} open={showCollection} onClose={() => setShowCollection(false)} />
      )}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build` → 0 type errors; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/hooks/usePipelines.ts client/components/pipelines/CollectionParametersDialog.tsx client/pages/PipelineBoardPage.tsx
git commit -m "feat(collection): Collection Parameters dialog + board menu entry"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run everything**

```
npx tsc --noEmit
npm run build
npx tsx --test shared/collectionConfig.test.ts
```
Expected: 0 type errors; build OK; 4 tests pass.

- [ ] **Step 2: Commit (if any stray fixes)**

```bash
git add -A && git commit -m "chore(collection): SP2 final verification" || echo "nothing to commit"
```

---

## Manual acceptance (on dev, pipeline 7 / JABNET)
1. Pipeline 7 → header → **Collection** button → dialog opens.
2. Enable; set entry 7 days, mode Create-if-not-exists, entry stage + paid stage; write-off 180 days → move to Write Off stage.
3. Build the mapping (1-7→FU1, 8-14→FU2, 15-30→FU3, 31-60→Visit, 61-90→Isolir, 181-∞→Write Off). Save → reopen shows the same.
4. Overlapping ranges → toast error, save blocked.
5. Non-`manage` role: no Collection button; PUT returns 403.

## Notes
- No automation runs yet - this only stores config (verify in SP3 that the engine reads it).
- Tenant isolation: storage scopes every query to `getMitraId()`; the endpoint checks stage/rule ownership against the pipeline.
