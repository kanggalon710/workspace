# Pipelines Automation: Cross-Pipeline Card Creation (Phase 4a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a card enters a trigger stage, auto-create a card in a target pipeline/stage — once per source card — configured by no-code rules per pipeline.

**Architecture:** Two new tables (`pipeline_rules`, `pipeline_rule_fires`) created on startup. A pure rule-matcher + a `runStageEnterAutomations` service invoked from the card create/move routes after the mutation (Approach A — loop-safe: engine-created cards don't re-trigger). Rule CRUD endpoints gated by P3 edit-access (+ target-pipeline access check). React rule-builder dialog.

**Tech Stack:** Node 20 · Express 5 · Drizzle ORM (MySQL) · React 18 · TS · TanStack Query 5 · Tailwind/shadcn. Tests: `node:test` (`npx tsx --test`).

**Spec:** `docs/superpowers/specs/2026-06-04-pipelines-automation-design.md`

**CRITICAL conventions (prior-phase lessons):**
- Every endpoint responds via `sendSuccess(res, data)` — never raw `res.json`.
- New TABLES via startup `CREATE TABLE IF NOT EXISTS` in `server/storage.ts` (NOT db:push). (No new columns here, so the `ADD COLUMN IF NOT EXISTS` gotcha doesn't apply — but never use that syntax.)
- Every storage query filters `mitraId = getMitraId()`.
- Automation must NEVER break the user's card action — wrap the service in try/catch, log, swallow.
- Loop-safety: the service is called ONLY from the user-facing create/move routes, never from the engine's own `createCard` → engine-created cards don't cascade.

**Verified anchor points:**
- Create card route: `server/routes.ts` `router.post("/api/pipelines/:id/cards", ...)` — returns `card`, after `storage.createCard(...)` + `notifyPipelineCardWatchers(...)`, before `sendSuccess(res, card)`.
- Move card route: `router.post("/api/pipelines/cards/:cardId/move", ...)` — has `cardForGuard` (pre-move) and `card` (post-move) inside a try; stage changed iff `cardForGuard.stageId !== Number(toStageId)`.
- `storage.createCard(pipelineId, { stageId, title, description?, assigneeId?, priority?, dueDate?, tags? }, userId)` returns the new card.
- P3 resolver `getPipelineLevel(req, pipelineId)` + guard `requirePipelineEdit(req, res, pipelineId)` exist (module scope in routes.ts).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `shared/schema.ts` | `pipeline_rules` + `pipeline_rule_fires` tables + types | Modify |
| `server/storage.ts` | startup migration; rule CRUD + dedup methods | Modify |
| `server/pipeline-automation-helpers.ts` (+test) | pure `matchStageEnterRules`, `buildTargetTitle` | Create |
| `server/pipeline-automation.ts` | `runStageEnterAutomations` service | Create |
| `server/routes.ts` | rule CRUD endpoints; wire service into create/move routes | Modify |
| `client/hooks/usePipelines.ts` | `useRules` + rule mutations | Modify |
| `client/components/pipelines/PipelineRulesDialog.tsx` | rule-builder dialog | Create |
| `client/pages/PipelineBoardPage.tsx` | "Otomasi" button | Modify |

---

## Task 1: Schema — rule tables + types + startup migration

**Files:** Modify `shared/schema.ts`, `server/storage.ts`.

- [ ] **Step 1: schema.ts** — after the Phase-3 `pipelineAccess` block, add:
```ts
export const pipelineRules = mysqlTable("pipeline_rules", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  pipelineId: int("pipeline_id").notNull(),
  name: varchar("name", { length: 255 }),
  triggerStageId: int("trigger_stage_id").notNull(),
  actionType: varchar("action_type", { length: 16 }).notNull().default("create_card"),
  targetPipelineId: int("target_pipeline_id").notNull(),
  targetStageId: int("target_stage_id").notNull(),
  titleTemplate: varchar("title_template", { length: 255 }),
  copyAssignee: int("copy_assignee").notNull().default(0),
  enabled: int("enabled").notNull().default(1),
  createdBy: int("created_by").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at"),
}, (t) => ({
  byPipeline: index("idx_pipeline_rules_mitra_pipeline").on(t.mitraId, t.pipelineId),
}));

export const pipelineRuleFires = mysqlTable("pipeline_rule_fires", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  ruleId: int("rule_id").notNull(),
  sourceCardId: int("source_card_id").notNull(),
  firedAt: text("fired_at").notNull(),
}, (t) => ({
  uniqRuleCard: uniqueIndex("uniq_rule_fire_card").on(t.ruleId, t.sourceCardId),
  byRule: index("idx_rule_fires_mitra_rule").on(t.mitraId, t.ruleId),
}));

export type PipelineRule = typeof pipelineRules.$inferSelect;
export type PipelineRuleFire = typeof pipelineRuleFires.$inferSelect;
export type PipelineRuleActionType = "create_card";
```

- [ ] **Step 2: storage.ts startup migration** — after the Phase-3 `pipeline_access` CREATE TABLE try/catch (search `pipelines RBAC setup failed` — note the Phase-3 hotfix split it into TWO try/catch blocks; add after the `pipeline_access` one), add:
```ts
    // Pipelines Phase 4a — automation rules. Additive, idempotent.
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_rules (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          pipeline_id INT NOT NULL,
          name VARCHAR(255),
          trigger_stage_id INT NOT NULL,
          action_type VARCHAR(16) NOT NULL DEFAULT 'create_card',
          target_pipeline_id INT NOT NULL,
          target_stage_id INT NOT NULL,
          title_template VARCHAR(255),
          copy_assignee INT NOT NULL DEFAULT 0,
          enabled INT NOT NULL DEFAULT 1,
          created_by INT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT,
          KEY idx_pipeline_rules_mitra_pipeline (mitra_id, pipeline_id)
        )
      `);
    } catch (e: any) { console.warn(`[migration] pipeline_rules setup failed: ${e.message}`); }
    try {
      await this.db.execute(sql`
        CREATE TABLE IF NOT EXISTS pipeline_rule_fires (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          rule_id INT NOT NULL,
          source_card_id INT NOT NULL,
          fired_at TEXT NOT NULL,
          UNIQUE KEY uniq_rule_fire_card (rule_id, source_card_id),
          KEY idx_rule_fires_mitra_rule (mitra_id, rule_id)
        )
      `);
    } catch (e: any) { console.warn(`[migration] pipeline_rule_fires setup failed: ${e.message}`); }
```

- [ ] **Step 3:** `npm run typecheck` → 0 errors.
- [ ] **Step 4:** commit
```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(pipelines): automation rule schema + startup migration"
```

---

## Task 2: Pure helpers + tests

**Files:** Create `server/pipeline-automation-helpers.ts`, `server/pipeline-automation-helpers.test.ts`.

- [ ] **Step 1: failing test:**
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchStageEnterRules, buildTargetTitle } from "./pipeline-automation-helpers.js";

const rule = (over: any = {}) => ({
  id: 1, mitraId: 1, pipelineId: 1, name: null, triggerStageId: 10,
  actionType: "create_card", targetPipelineId: 2, targetStageId: 20,
  titleTemplate: null, copyAssignee: 0, enabled: 1, createdBy: 1, createdAt: "", updatedAt: null, ...over,
});

test("matchStageEnterRules returns enabled create_card rules whose triggerStageId matches", () => {
  const rules = [rule(), rule({ id: 2, triggerStageId: 99 }), rule({ id: 3, enabled: 0 }), rule({ id: 4, actionType: "other" })];
  const matched = matchStageEnterRules(rules as any, 10);
  assert.deepEqual(matched.map((r) => r.id), [1]);
});

test("matchStageEnterRules empty when no stage match", () => {
  assert.deepEqual(matchStageEnterRules([rule()] as any, 11), []);
});

test("buildTargetTitle copies source title when template is empty", () => {
  assert.equal(buildTargetTitle(null, "Pelanggan A"), "Pelanggan A");
  assert.equal(buildTargetTitle("", "Pelanggan A"), "Pelanggan A");
});

test("buildTargetTitle substitutes {title}", () => {
  assert.equal(buildTargetTitle("Survei: {title}", "Pelanggan A"), "Survei: Pelanggan A");
  assert.equal(buildTargetTitle("{title} / {title}", "X"), "X / X");
});

test("buildTargetTitle caps at 255 chars", () => {
  assert.equal(buildTargetTitle("{title}", "a".repeat(300)).length, 255);
});
```

- [ ] **Step 2:** run → FAIL. `npx tsx --test server/pipeline-automation-helpers.test.ts`

- [ ] **Step 3: implement** (`server/pipeline-automation-helpers.ts`):
```ts
/** Pure helpers for pipeline automation — no DB. */
import type { PipelineRule } from "../shared/schema.js";

export function matchStageEnterRules(rules: PipelineRule[], stageId: number): PipelineRule[] {
  return rules.filter((r) => r.enabled === 1 && r.actionType === "create_card" && r.triggerStageId === stageId);
}

export function buildTargetTitle(template: string | null, sourceTitle: string): string {
  const out = !template ? sourceTitle : template.replace(/\{title\}/g, sourceTitle);
  return out.slice(0, 255);
}
```

- [ ] **Step 4:** run → PASS. `npx tsx --test server/pipeline-automation-helpers.test.ts`
- [ ] **Step 5:** commit
```bash
git add server/pipeline-automation-helpers.ts server/pipeline-automation-helpers.test.ts
git commit -m "feat(pipelines): automation pure helpers with tests"
```

---

## Task 3: Storage — rule CRUD + dedup

**Files:** Modify `server/storage.ts` (extend schema import with `pipelineRules, pipelineRuleFires, type PipelineRule, type PipelineRuleFire`; append methods to the pipelines section).

- [ ] **Step 1: add methods**
```ts
  async listRules(pipelineId: number): Promise<PipelineRule[]> {
    const mitraId = getMitraId();
    return this.db.select().from(pipelineRules)
      .where(and(eq(pipelineRules.mitraId, mitraId), eq(pipelineRules.pipelineId, pipelineId)))
      .orderBy(asc(pipelineRules.id));
  }

  async createRule(pipelineId: number, data: { name?: string | null; triggerStageId: number; targetPipelineId: number; targetStageId: number; titleTemplate?: string | null; copyAssignee?: boolean; enabled?: boolean; }, userId: number): Promise<PipelineRule> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(pipelineRules).values({
      mitraId, pipelineId, name: data.name ?? null, triggerStageId: data.triggerStageId,
      actionType: "create_card", targetPipelineId: data.targetPipelineId, targetStageId: data.targetStageId,
      titleTemplate: data.titleTemplate ?? null, copyAssignee: data.copyAssignee ? 1 : 0,
      enabled: data.enabled === false ? 0 : 1, createdBy: userId, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(pipelineRules).where(and(eq(pipelineRules.id, insertId), eq(pipelineRules.mitraId, mitraId)));
    return row!;
  }

  async updateRule(id: number, data: { name?: string | null; triggerStageId?: number; targetPipelineId?: number; targetStageId?: number; titleTemplate?: string | null; copyAssignee?: boolean; enabled?: boolean; }): Promise<PipelineRule> {
    const mitraId = getMitraId();
    const patch: any = { updatedAt: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.triggerStageId !== undefined) patch.triggerStageId = data.triggerStageId;
    if (data.targetPipelineId !== undefined) patch.targetPipelineId = data.targetPipelineId;
    if (data.targetStageId !== undefined) patch.targetStageId = data.targetStageId;
    if (data.titleTemplate !== undefined) patch.titleTemplate = data.titleTemplate;
    if (data.copyAssignee !== undefined) patch.copyAssignee = data.copyAssignee ? 1 : 0;
    if (data.enabled !== undefined) patch.enabled = data.enabled ? 1 : 0;
    await this.db.update(pipelineRules).set(patch).where(and(eq(pipelineRules.id, id), eq(pipelineRules.mitraId, mitraId)));
    const [row] = await this.db.select().from(pipelineRules).where(and(eq(pipelineRules.id, id), eq(pipelineRules.mitraId, mitraId)));
    if (!row) throw new Error("Rule tidak ditemukan");
    return row;
  }

  async deleteRule(id: number): Promise<void> {
    const mitraId = getMitraId();
    await this.db.delete(pipelineRuleFires).where(and(eq(pipelineRuleFires.ruleId, id), eq(pipelineRuleFires.mitraId, mitraId)));
    await this.db.delete(pipelineRules).where(and(eq(pipelineRules.id, id), eq(pipelineRules.mitraId, mitraId)));
  }

  async hasRuleFired(ruleId: number, sourceCardId: number): Promise<boolean> {
    const mitraId = getMitraId();
    const rows = await this.db.select().from(pipelineRuleFires)
      .where(and(eq(pipelineRuleFires.mitraId, mitraId), eq(pipelineRuleFires.ruleId, ruleId), eq(pipelineRuleFires.sourceCardId, sourceCardId)));
    return rows.length > 0;
  }

  async recordRuleFire(ruleId: number, sourceCardId: number): Promise<void> {
    const mitraId = getMitraId();
    try {
      await this.db.insert(pipelineRuleFires).values({ mitraId, ruleId, sourceCardId, firedAt: new Date().toISOString() } as any);
    } catch { /* unique constraint race — already recorded, ignore */ }
  }
```

- [ ] **Step 2:** `npm run typecheck` → 0 errors.
- [ ] **Step 3:** commit
```bash
git add server/storage.ts
git commit -m "feat(pipelines): storage rule CRUD + fire dedup"
```

---

## Task 4: Automation service + wire into routes

**Files:** Create `server/pipeline-automation.ts`; modify `server/routes.ts`.

- [ ] **Step 1: create the service** (`server/pipeline-automation.ts`):
```ts
import { storage } from "./storage.js";
import { matchStageEnterRules, buildTargetTitle } from "./pipeline-automation-helpers.js";
import type { PipelineCard } from "../shared/schema.js";

/**
 * Run "card entered stage" automations for a card. Best-effort: never throws to the caller.
 * Loop-safe: target cards are created via storage directly and do NOT re-invoke this service.
 */
export async function runStageEnterAutomations(card: PipelineCard, actorId: number): Promise<void> {
  try {
    const rules = matchStageEnterRules(await storage.listRules(card.pipelineId), card.stageId);
    for (const rule of rules) {
      if (await storage.hasRuleFired(rule.id, card.id)) continue;
      await storage.createCard(rule.targetPipelineId, {
        stageId: rule.targetStageId,
        title: buildTargetTitle(rule.titleTemplate, card.title),
        description: `Dibuat otomatis dari kartu #${card.id}`,
        assigneeId: rule.copyAssignee ? card.assigneeId : null,
      }, actorId);
      await storage.recordRuleFire(rule.id, card.id);
    }
  } catch (e: any) {
    console.warn(`[automation] runStageEnterAutomations failed for card ${card?.id}: ${e?.message}`);
  }
}
```
> Note: `storage.createCard` runs in the same request tenant context (`getMitraId`), so the target card lands in the same mitra. Target pipeline/stage validity was enforced at rule-creation time (Task 5).

- [ ] **Step 2: import in routes.ts** (top, with other `./` imports): `import { runStageEnterAutomations } from "./pipeline-automation.js";`

- [ ] **Step 3: wire create-card route.** In `router.post("/api/pipelines/:id/cards", ...)`, after the `notifyPipelineCardWatchers(...)` line and before `sendSuccess(res, card)`, add:
```ts
    await runStageEnterAutomations(card, req.authUser!.id);
```

- [ ] **Step 4: wire move-card route.** In `router.post("/api/pipelines/cards/:cardId/move", ...)`, inside the try, after `notifyPipelineCardWatchers(...)` and before `sendSuccess(res, card)`, add (only fire when the stage actually changed):
```ts
      if (cardForGuard.stageId !== card.stageId) await runStageEnterAutomations(card, req.authUser!.id);
```
(`cardForGuard` is the pre-move card already loaded above; `card` is the post-move result.)

- [ ] **Step 5:** `npm run typecheck && npm run build` → 0 errors, build OK.
- [ ] **Step 6:** commit
```bash
git add server/pipeline-automation.ts server/routes.ts
git commit -m "feat(pipelines): stage-enter automation service wired into create/move"
```

---

## Task 5: Rule CRUD endpoints (with target-access validation)

**Files:** Modify `server/routes.ts` (register among `/api/pipelines/:id/...` routes, ABOVE `GET /api/pipelines/:id`).

- [ ] **Step 1: add endpoints**
```ts
  router.get("/api/pipelines/:id/rules", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineEdit(req, res, Number(req.params.id)))) return;
    sendSuccess(res, await storage.listRules(Number(req.params.id)));
  });

  router.post("/api/pipelines/:id/rules", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineEdit(req, res, Number(req.params.id)))) return;
    const { name, triggerStageId, targetPipelineId, targetStageId, titleTemplate, copyAssignee, enabled } = req.body ?? {};
    if (!triggerStageId || !targetPipelineId || !targetStageId) return sendError(res, "triggerStageId, targetPipelineId, targetStageId wajib", 400);
    // Can't automate into a pipeline you can't access.
    if ((await getPipelineLevel(req, Number(targetPipelineId))) === "none") return sendError(res, "Tidak punya akses ke pipeline target", 403);
    sendSuccess(res, await storage.createRule(Number(req.params.id), {
      name, triggerStageId: Number(triggerStageId), targetPipelineId: Number(targetPipelineId),
      targetStageId: Number(targetStageId), titleTemplate, copyAssignee, enabled,
    }, req.authUser!.id));
  });

  router.patch("/api/pipelines/:id/rules/:ruleId", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineEdit(req, res, Number(req.params.id)))) return;
    const b = req.body ?? {};
    if (b.targetPipelineId !== undefined && (await getPipelineLevel(req, Number(b.targetPipelineId))) === "none") {
      return sendError(res, "Tidak punya akses ke pipeline target", 403);
    }
    try {
      sendSuccess(res, await storage.updateRule(Number(req.params.ruleId), {
        name: b.name, triggerStageId: b.triggerStageId !== undefined ? Number(b.triggerStageId) : undefined,
        targetPipelineId: b.targetPipelineId !== undefined ? Number(b.targetPipelineId) : undefined,
        targetStageId: b.targetStageId !== undefined ? Number(b.targetStageId) : undefined,
        titleTemplate: b.titleTemplate, copyAssignee: b.copyAssignee, enabled: b.enabled,
      }));
    } catch (e: any) {
      if (String(e?.message).includes("tidak ditemukan")) return sendError(res, e.message, 404);
      throw e;
    }
  });

  router.delete("/api/pipelines/:id/rules/:ruleId", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    if (!(await requirePipelineEdit(req, res, Number(req.params.id)))) return;
    await storage.deleteRule(Number(req.params.ruleId));
    sendSuccess(res, { ok: true });
  });
```

- [ ] **Step 2:** `npm run typecheck && npm run build` → 0 errors, build OK.
- [ ] **Step 3: manual API smoke on dev** (restart for new tables): create a rule, list it, move a card into the trigger stage → confirm a target card appears (`{success:true,...}` shapes).
- [ ] **Step 4:** commit
```bash
git add server/routes.ts
git commit -m "feat(pipelines): rule CRUD endpoints with target-pipeline access validation"
```

---

## Task 6: Frontend hooks

**Files:** Modify `client/hooks/usePipelines.ts`.

- [ ] **Step 1: add type + hook + mutations.** Import `PipelineRule` from `@shared/schema` (add to the existing type import). Add:
```ts
export function useRules(pipelineId: number | null) {
  return useQuery({
    queryKey: [KEY, "rules", pipelineId],
    queryFn: () => api.get<PipelineRule[]>(`/pipelines/${pipelineId}/rules`),
    enabled: !!pipelineId,
  });
}
```
Add to `usePipelineMutations`:
```ts
    createRule: useMutation({ mutationFn: (b: any) => api.post(`/pipelines/${pipelineId}/rules`, b), onSuccess: invalidate }),
    updateRule: useMutation({ mutationFn: ({ ruleId, ...b }: any) => api.patch(`/pipelines/${pipelineId}/rules/${ruleId}`, b), onSuccess: invalidate }),
    deleteRule: useMutation({ mutationFn: (ruleId: number) => api.delete(`/pipelines/${pipelineId}/rules/${ruleId}`), onSuccess: invalidate }),
```

- [ ] **Step 2:** `npm run typecheck` → 0 errors.
- [ ] **Step 3:** commit
```bash
git add client/hooks/usePipelines.ts
git commit -m "feat(pipelines): client hooks for automation rules"
```

---

## Task 7: Frontend — PipelineRulesDialog + board button

**Files:** Create `client/components/pipelines/PipelineRulesDialog.tsx`; modify `client/pages/PipelineBoardPage.tsx`.

- [ ] **Step 1: build the dialog.** Verify design-system props as in prior dialogs (`Dialog`, `Combobox`, `Switch`, `Input`, `Button`). It uses `usePipeline(pipelineId)` for this pipeline's stages, `usePipelines()` for the target-pipeline options, `usePipeline(targetId)` for target stages, `useRules` + mutations.
```tsx
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { useRules, usePipeline, usePipelines, usePipelineMutations } from "@/hooks/usePipelines";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export function PipelineRulesDialog({ pipelineId, open, onClose }: { pipelineId: number; open: boolean; onClose: () => void }) {
  const { data: rules } = useRules(open ? pipelineId : null);
  const { data: self } = usePipeline(open ? pipelineId : null);
  const { data: allPipelines } = usePipelines();
  const m = usePipelineMutations(pipelineId);

  const [triggerStageId, setTriggerStageId] = useState("");
  const [targetPipelineId, setTargetPipelineId] = useState("");
  const [targetStageId, setTargetStageId] = useState("");
  const [titleTemplate, setTitleTemplate] = useState("");
  const [copyAssignee, setCopyAssignee] = useState(false);
  const { data: targetPipe } = usePipeline(targetPipelineId ? Number(targetPipelineId) : null);

  const stages = self?.stages ?? [];
  const stageName = (id: number) => stages.find((s) => s.id === id)?.label ?? `#${id}`;
  const pipeName = (id: number) => (allPipelines ?? []).find((p) => p.id === id)?.name ?? `#${id}`;

  const add = async () => {
    if (!triggerStageId || !targetPipelineId || !targetStageId) { toast.error("Lengkapi trigger & target"); return; }
    try {
      await m.createRule.mutateAsync({
        triggerStageId: Number(triggerStageId), targetPipelineId: Number(targetPipelineId),
        targetStageId: Number(targetStageId), titleTemplate: titleTemplate || null, copyAssignee,
      });
      toast.success("Otomasi ditambah");
      setTriggerStageId(""); setTargetPipelineId(""); setTargetStageId(""); setTitleTemplate(""); setCopyAssignee(false);
    } catch (e: any) { toast.error(e?.message || "Gagal menambah otomasi"); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Otomasi Pipeline</DialogTitle></DialogHeader>

        <div className="space-y-2">
          {(rules ?? []).map((r) => (
            <div key={r.id} className="flex items-center gap-2 border rounded-lg p-2 text-sm">
              <div className="flex-1">
                Saat kartu masuk <b>{stageName(r.triggerStageId)}</b> → buat kartu di <b>{pipeName(r.targetPipelineId)}</b>
                <span className="text-[10px] text-muted-foreground ml-1">{r.enabled ? "" : "(nonaktif)"}</span>
              </div>
              <Switch checked={r.enabled === 1} onCheckedChange={(c) => m.updateRule.mutateAsync({ ruleId: r.id, enabled: c })} />
              <Button variant="ghost" size="icon-sm" onClick={async () => { if (confirm("Hapus otomasi ini?")) await m.deleteRule.mutateAsync(r.id); }}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
          {!rules?.length && <p className="text-xs text-muted-foreground">Belum ada otomasi.</p>}
        </div>

        <div className="border-t pt-3 space-y-3">
          <div className="text-xs font-semibold text-muted-foreground">Tambah otomasi</div>
          <div>
            <label className="text-xs">Saat kartu masuk stage</label>
            <Combobox options={stages.map((s) => ({ value: String(s.id), label: s.label }))} value={triggerStageId} onChange={setTriggerStageId} placeholder="Pilih stage…" />
          </div>
          <div>
            <label className="text-xs">Buat kartu di pipeline</label>
            <Combobox options={(allPipelines ?? []).map((p) => ({ value: String(p.id), label: p.name }))} value={targetPipelineId} onChange={(v) => { setTargetPipelineId(v); setTargetStageId(""); }} placeholder="Pilih pipeline…" />
          </div>
          <div>
            <label className="text-xs">Di stage</label>
            <Combobox options={(targetPipe?.stages ?? []).map((s) => ({ value: String(s.id), label: s.label }))} value={targetStageId} onChange={setTargetStageId} placeholder="Pilih stage target…" />
          </div>
          <div>
            <label className="text-xs">Judul kartu baru (opsional, {"{title}"} = judul sumber)</label>
            <Input value={titleTemplate} onChange={(e) => setTitleTemplate(e.target.value)} placeholder="(kosong = salin judul)" />
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={copyAssignee} onCheckedChange={setCopyAssignee} /> Salin assignee</label>
          <Button leftIcon={<Plus className="size-4" />} onClick={add} loading={m.createRule.isPending}>Tambah Otomasi</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```
> Verify `Combobox.onChange` arity (Phase 2/3 used `(v) => ...`), `Switch`, `Button.leftIcon/loading`, `Dialog` exports — adapt to the real props if needed.

- [ ] **Step 2: board button.** In `client/pages/PipelineBoardPage.tsx`:
  - import: `import { PipelineRulesDialog } from "@/components/pipelines/PipelineRulesDialog";`
  - state: `const [showRules, setShowRules] = useState(false);`
  - In the header, next to "Akses"/"Kelola Field" (both `writable`-gated), add: `<Button variant="outline" size="sm" onClick={() => setShowRules(true)}>Otomasi</Button>`
  - Near the other dialog mounts: `{showRules && pid != null && <PipelineRulesDialog pipelineId={pid} open={showRules} onClose={() => setShowRules(false)} />}`

- [ ] **Step 3:** `npm run typecheck && npm run build` → 0 errors, build OK.
- [ ] **Step 4:** commit
```bash
git add client/components/pipelines/PipelineRulesDialog.tsx client/pages/PipelineBoardPage.tsx
git commit -m "feat(pipelines): automation rule-builder dialog + board button"
```

---

## Task 8: Final verification + manual checklist + review

**Files:** none.

- [ ] **Step 1:** `npx tsx --test server/pipeline-automation-helpers.test.ts` (pass) + prior helper tests still pass.
- [ ] **Step 2:** `npm run typecheck && npm run build` → 0 errors, build OK.
- [ ] **Step 3: manual e2e on dev** (`jabnet_fiber_dev`, restart for new tables):
  - On pipeline A, open "Otomasi" → add rule: enter "Negotiation" → create in pipeline B "Survei", title `Survei: {title}`, copy assignee on.
  - Move a card into Negotiation → exactly one card appears in B/Survei titled `Survei: <name>`, assignee copied, description "Dibuat otomatis dari kartu #N".
  - Move the card out and back into Negotiation → NO duplicate (dedup).
  - Create a card directly into Negotiation → fires once.
  - Disable the rule → no new fires; re-enable works.
  - Delete the rule → its fires cleared (re-creating the rule fires fresh).
  - Try to add a rule targeting a pipeline you can't access (as a restricted non-admin) → 403.
  - Force an automation failure (e.g. rule whose target stage was deleted) → the card move STILL succeeds (automation swallowed, logged).
  - Cross-mitra: another mitra never sees/fires these rules.
- [ ] **Step 4: whole-implementation review** (final reviewer). MUST verify: (a) automation service is called ONLY from create/move routes, never from storage (no cascade); (b) try/catch makes automation never break the card action; (c) once-per-card dedup works (unique index + hasRuleFired); (d) sendSuccess on all rule endpoints; (e) startup CREATE TABLE present for both tables; (f) tenant isolation on all rule/fire queries; (g) target-pipeline access validated at rule create/update; (h) move only fires on actual stage change. Then STOP — user merges to dev, pushes, restarts dev app, tests; prod only on explicit OK.

---

## Self-Review Notes (author)
- **Spec coverage:** schema+migration (T1), pure helpers (T2), storage CRUD+dedup (T3), service+wiring (T4), endpoints+target-access (T5), hooks (T6), dialog+button (T7), verification (T8). Trigger=enter stage (move+create wired, T4). Once-per-card dedup (T3 unique + service check). Loop-safe: service only from routes (T4 note). No conditions/chaining (out of scope, absent).
- **Phase-lessons:** sendSuccess on all endpoints (T5); startup CREATE TABLE, no ADD COLUMN IF NOT EXISTS (T1); automation never throws to caller (T4 try/catch).
- **Type consistency:** `matchStageEnterRules`/`buildTargetTitle` (T2) used by service (T4). Storage `listRules/createRule/updateRule/deleteRule/hasRuleFired/recordRuleFire` (T3) ↔ service (T4) ↔ endpoints (T5) ↔ hooks `useRules/createRule/updateRule/deleteRule` (T6). `getPipelineLevel`/`requirePipelineEdit` (P3) reused in T5.
- **Flagged adaptation points:** dialog component props (T7) verify-before-finalize; the move route's post-move `card.stageId` equals `toStageId` so the `cardForGuard.stageId !== card.stageId` change-detection is correct.
- **Security:** rule endpoints gated by `requirePipelineEdit` on the SOURCE pipeline; target validated via `getPipelineLevel`. The automation `createCard` runs in the actor's request context (same mitra). T8 review item (a)/(f)/(g).
