# Multi-Assignee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional secondary assignees to a card (primary stays `assigneeId`, watchers stay followers), surfaced in the card detail + board filter + notifications.

**Architecture:** A pure helper (`shared/cardAssignees.ts`) + a `pipeline_card_assignees` join table mirroring `pipeline_card_followers` + storage/endpoints mirroring followers + a notify extension + a board-filter update. No data migration (primary = existing `assigneeId`).

**Tech Stack:** TypeScript, Drizzle (MySQL), Express 5, React 18 + TanStack Query 5, `node:test` via `npx tsx --test`.

**Conventions:**
- Tests `npx tsx --test`. Import `.js`. Tenant-scoped via `getMitraId()`. No `.returning()`.
- New table → `CREATE TABLE IF NOT EXISTS` in the startup migration block (alongside other `pipeline_card_*` tables, ~storage.ts:6900).
- Mirror the **followers** implementation exactly: storage `listFollowers`/`addFollower`/`removeFollower` (storage.ts:2184), endpoints (routes.ts:5086-5125), `notifyPipelineCardWatchers` (routes.ts:4241).
- Envelope `sendSuccess`/`sendError`; route guards `requirePermission`/`requireWritePermission`/`requirePipelineView`/`requirePipelineCapability(cards)`/`requireCardAccess`; `canUserAccessPipeline` for assign target.

---

### Task 1: Pure module `shared/cardAssignees.ts`

**Files:** Create `shared/cardAssignees.ts`; Test `shared/cardAssignees.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { allAssigneeIds, matchesAssigneeFilter } from "./cardAssignees.js";

test("allAssigneeIds: primary first, dedupe, drop null primary", () => {
  assert.deepEqual(allAssigneeIds(5, [7, 9]), [5, 7, 9]);
  assert.deepEqual(allAssigneeIds(5, [5, 7]), [5, 7]);   // dedupe primary in secondary
  assert.deepEqual(allAssigneeIds(null, [7, 9]), [7, 9]);
  assert.deepEqual(allAssigneeIds(undefined, []), []);
  assert.deepEqual(allAssigneeIds(7, [9, 9]), [7, 9]);   // dedupe within secondary
});

test("matchesAssigneeFilter: null filter true; primary or secondary match", () => {
  assert.equal(matchesAssigneeFilter(5, [7], null), true);
  assert.equal(matchesAssigneeFilter(5, [7], 5), true);   // primary
  assert.equal(matchesAssigneeFilter(5, [7], 7), true);   // secondary
  assert.equal(matchesAssigneeFilter(5, [7], 9), false);
  assert.equal(matchesAssigneeFilter(null, [], 9), false);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx tsx --test shared/cardAssignees.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

Create `shared/cardAssignees.ts`:

```ts
/** Pure helpers for card assignees (primary + secondary). No I/O, unit-testable. */

/** Distinct assignee ids, primary first then secondary, deduped, null primary dropped. */
export function allAssigneeIds(primaryId: number | null | undefined, secondaryIds: number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  if (primaryId != null) { out.push(primaryId); seen.add(primaryId); }
  for (const id of secondaryIds) { if (!seen.has(id)) { seen.add(id); out.push(id); } }
  return out;
}

/** Board assignee filter: null filter → all match; else match if filter == primary or in secondary. */
export function matchesAssigneeFilter(
  primaryId: number | null | undefined, secondaryIds: number[], filterId: number | null,
): boolean {
  if (filterId == null) return true;
  return primaryId === filterId || secondaryIds.includes(filterId);
}
```

- [ ] **Step 4: Run — expect 2/2 PASS**

Run: `npx tsx --test shared/cardAssignees.test.ts`

- [ ] **Step 5: Commit**

```bash
git add shared/cardAssignees.ts shared/cardAssignees.test.ts
git commit -m "feat(multi-assignee): pure helpers (allAssigneeIds, matchesAssigneeFilter)"
```

---

### Task 2: Schema + migration

**Files:** Modify `shared/schema.ts` (after `pipelineCardFollowers`); `server/storage.ts` (migration block ~6900)

- [ ] **Step 1: Drizzle table in `shared/schema.ts`**

After `pipelineCardFollowers`:
```ts
export const pipelineCardAssignees = mysqlTable("pipeline_card_assignees", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  userId: int("user_id").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  uniqCardUser: uniqueIndex("uniq_card_assignee").on(t.cardId, t.userId),
  byMitraCard: index("idx_card_assignees_mitra_card").on(t.mitraId, t.cardId),
}));

export type PipelineCardAssignee = typeof pipelineCardAssignees.$inferSelect;
```

- [ ] **Step 2: CREATE TABLE in `server/storage.ts`**

After the `CREATE TABLE IF NOT EXISTS pipeline_card_attachments (...)` block, add:
```ts
await this.db.execute(sql`
  CREATE TABLE IF NOT EXISTS pipeline_card_assignees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mitra_id INT NOT NULL DEFAULT 1,
    card_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE KEY uniq_card_assignee (card_id, user_id),
    KEY idx_card_assignees_mitra_card (mitra_id, card_id)
  )
`);
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(multi-assignee): pipeline_card_assignees table + migration"
```

---

### Task 3: Storage methods

**Files:** Modify `server/storage.ts` (add after `removeFollower` ~2210; add `pipelineCardAssignees`/`PipelineCardAssignee` to the schema import)

- [ ] **Step 1: Add the methods**

```ts
async listCardAssignees(cardId: number): Promise<PipelineCardAssignee[]> {
  const mitraId = getMitraId();
  return this.db.select().from(pipelineCardAssignees)
    .where(and(eq(pipelineCardAssignees.mitraId, mitraId), eq(pipelineCardAssignees.cardId, cardId)));
}

async addCardAssignee(cardId: number, userId: number, actorId: number): Promise<void> {
  const mitraId = getMitraId();
  const existing = await this.db.select().from(pipelineCardAssignees)
    .where(and(eq(pipelineCardAssignees.mitraId, mitraId), eq(pipelineCardAssignees.cardId, cardId), eq(pipelineCardAssignees.userId, userId)));
  if (existing.length > 0) return;
  await this.db.insert(pipelineCardAssignees).values({ mitraId, cardId, userId, createdAt: new Date().toISOString() } as any);
  await this.logCardActivity(cardId, actorId, "assignee_added", { userId });
}

async removeCardAssignee(cardId: number, userId: number, actorId: number): Promise<void> {
  const mitraId = getMitraId();
  const existing = await this.db.select().from(pipelineCardAssignees)
    .where(and(eq(pipelineCardAssignees.mitraId, mitraId), eq(pipelineCardAssignees.cardId, cardId), eq(pipelineCardAssignees.userId, userId)));
  if (existing.length === 0) return;
  await this.db.delete(pipelineCardAssignees)
    .where(and(eq(pipelineCardAssignees.mitraId, mitraId), eq(pipelineCardAssignees.cardId, cardId), eq(pipelineCardAssignees.userId, userId)));
  await this.logCardActivity(cardId, actorId, "assignee_removed", { userId });
}

/** cardId -> secondary userIds[], batched for the board (anti-N+1). Mitra-scoped. */
async getSecondaryAssigneesForCards(cardIds: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (cardIds.length === 0) return map;
  const mitraId = getMitraId();
  const rows = await this.db.select().from(pipelineCardAssignees)
    .where(and(eq(pipelineCardAssignees.mitraId, mitraId), inArray(pipelineCardAssignees.cardId, cardIds)));
  for (const r of rows) {
    const arr = map.get(r.cardId) ?? [];
    arr.push(r.userId);
    map.set(r.cardId, arr);
  }
  return map;
}
```

(`inArray` already imported. Add `pipelineCardAssignees` + `PipelineCardAssignee` to the `@shared/schema` import.)

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(multi-assignee): storage CRUD + batched board fetch"
```

---

### Task 4: Endpoints + notify extension + cards-list field

**Files:** Modify `server/routes.ts` (add assignee routes near followers ~5125; extend `notifyPipelineCardWatchers` ~4241; cards list ~4684)

- [ ] **Step 1: Extend `notifyPipelineCardWatchers` to include secondary assignees**

In `notifyPipelineCardWatchers` (routes.ts:4241), after the `for (const f of followers) targets.add(f.userId);` line, add:
```ts
    const secondary = await storage.listCardAssignees(cardId);
    for (const s of secondary) targets.add(s.userId);
```

- [ ] **Step 2: Add the three assignee endpoints**

Near the follower routes (after the `DELETE .../followers/:userId` route ~5125), add:
```ts
router.get("/api/pipelines/cards/:cardId/assignees", async (req, res) => {
  if (!requirePermission(req, res, "pipelines")) return;
  const card = await storage.getCard(Number(req.params.cardId));
  if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
  if (!(await requirePipelineView(req, res, card.pipelineId))) return;
  if (!(await requireCardAccess(req, res, card))) return;
  sendSuccess(res, await storage.listCardAssignees(card.id));
});

router.post("/api/pipelines/cards/:cardId/assignees", async (req, res) => {
  if (!requireWritePermission(req, res, "pipelines")) return;
  const card = await storage.getCard(Number(req.params.cardId));
  if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
  if (!(await requirePipelineCapability(req, res, card.pipelineId, "cards"))) return;
  if (!(await requireCardAccess(req, res, card))) return;
  const { userId } = req.body ?? {};
  if (!userId) return sendError(res, "userId wajib diisi", 400);
  if (!(await storage.canUserAccessPipeline(Number(userId), card.pipelineId))) {
    return sendError(res, "User tidak punya akses ke pipeline ini", 400);
  }
  await storage.addCardAssignee(card.id, Number(userId), req.authUser!.id);
  if (Number(userId) !== req.authUser!.id) {
    await storage.createNotification({
      userId: Number(userId), type: "pipeline_card",
      title: "Ditugaskan ke kartu", message: `Anda ditambahkan sebagai penanggung jawab "${card.title}"`,
      link: `/pipelines/${card.pipelineId}`, entityType: "pipeline_card", entityId: card.id, fromUserId: req.authUser!.id,
    });
  }
  sendSuccess(res, { ok: true });
});

router.delete("/api/pipelines/cards/:cardId/assignees/:userId", async (req, res) => {
  if (!requireWritePermission(req, res, "pipelines")) return;
  const card = await storage.getCard(Number(req.params.cardId));
  if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
  if (!(await requirePipelineCapability(req, res, card.pipelineId, "cards"))) return;
  if (!(await requireCardAccess(req, res, card))) return;
  await storage.removeCardAssignee(card.id, Number(req.params.userId), req.authUser!.id);
  sendSuccess(res, { ok: true });
});
```

- [ ] **Step 3: Add `secondaryAssigneeIds` to the cards list response**

In `GET /api/pipelines/:id/cards` (routes.ts:4664), after computing `visibleCards` and before the `sendSuccess(...map...)`, fetch the batch:
```ts
    const secondaryByCard = await storage.getSecondaryAssigneesForCards(visibleCards.map((c) => c.id));
```
Then in the `.map((c) => {...})`, include it in BOTH return branches — change `return { ...c, values: v };` to `return { ...c, values: v, secondaryAssigneeIds: secondaryByCard.get(c.id) ?? [] };` and the hidden-fields branch's `return { ...c, values: fv };` to `return { ...c, values: fv, secondaryAssigneeIds: secondaryByCard.get(c.id) ?? [] };`.

- [ ] **Step 4: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 5: Commit**

```bash
git add server/routes.ts
git commit -m "feat(multi-assignee): assignee endpoints + notify + cards-list secondaryAssigneeIds"
```

---

### Task 5: Client hooks + card detail UI

**Files:** Modify `client/hooks/usePipelines.ts` (3 hooks); `client/components/pipelines/CardDetailModal.tsx` (secondary section)

Read first: the attachment hooks (`useCardAttachments`/`useDeleteAttachment`) for the `api`/query-key/invalidate pattern, and the existing primary-assignee picker in `CardDetailModal` (gated by `canAssign`) + `useAssignableUsers`.

- [ ] **Step 1: Add the hooks**

In `usePipelines.ts`:
```ts
export interface CardAssignee { id: number; cardId: number; userId: number; createdAt: string }

export function useCardAssignees(cardId: number | null) {
  return useQuery({
    queryKey: ["card-assignees", cardId],
    queryFn: () => api.get<CardAssignee[]>(`/pipelines/cards/${cardId}/assignees`),
    enabled: cardId != null,
  });
}
export function useAddCardAssignee(cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => api.post(`/pipelines/cards/${cardId}/assignees`, { userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-assignees", cardId] }),
  });
}
export function useRemoveCardAssignee(cardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => api.delete(`/pipelines/cards/${cardId}/assignees/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["card-assignees", cardId] }),
  });
}
```
(Confirm the delete helper name — `api.delete` per usePipelines; match the existing primary-assignee mutation's user-list source `useAssignableUsers`.)

- [ ] **Step 2: Add the secondary section to `CardDetailModal`**

Near the existing primary-assignee control, gated by the same `canAssign`, render a "Penanggung jawab tambahan" block:
```tsx
{canAssign && (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-muted-foreground">Penanggung jawab tambahan</label>
    <div className="flex flex-wrap gap-1.5">
      {(secondary ?? []).map((a) => {
        const u = users.find((x) => x.id === a.userId);
        return (
          <span key={a.userId} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            {u?.name ?? u?.username ?? `User #${a.userId}`}
            <button type="button" aria-label="Hapus" onClick={() => removeAssignee.mutate(a.userId)} className="text-muted-foreground hover:text-destructive">×</button>
          </span>
        );
      })}
    </div>
    <Combobox
      options={users
        .filter((u) => u.id !== detail?.assigneeId && !(secondary ?? []).some((a) => a.userId === u.id))
        .map((u) => ({ value: String(u.id), label: u.name ?? u.username ?? `User #${u.id}` }))}
      value=""
      onChange={(v) => v && addAssignee.mutate(Number(v))}
      placeholder="+ Tambah penanggung jawab…"
      searchPlaceholder="Cari user…"
    />
  </div>
)}
```
Wire at the top of the component: `const { data: secondary } = useCardAssignees(cardId); const addAssignee = useAddCardAssignee(cardId); const removeAssignee = useRemoveCardAssignee(cardId);` and ensure `users` is the assignable-users list already used by the primary picker (`useAssignableUsers`). `detail` is the loaded card (already present via `useCard`).

- [ ] **Step 3: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 4: Commit**

```bash
git add client/hooks/usePipelines.ts client/components/pipelines/CardDetailModal.tsx
git commit -m "feat(multi-assignee): secondary assignee UI in card detail"
```

---

### Task 6: Board filter matches secondary

**Files:** Modify `client/pages/PipelineBoardPage.tsx` (filter predicate ~84; card type if typed)

- [ ] **Step 1: Use the pure matcher**

Add the import: `import { matchesAssigneeFilter } from "@shared/cardAssignees";`
Replace line ~84:
```ts
    const matchesAssignee = assigneeId == null || c.assigneeId === assigneeId;
```
with:
```ts
    const matchesAssignee = matchesAssigneeFilter(c.assigneeId, (c as any).secondaryAssigneeIds ?? [], assigneeId);
```
(If the card type is explicitly declared in this file, add `secondaryAssigneeIds?: number[]` to it instead of the `as any`.)

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 3: Commit**

```bash
git add client/pages/PipelineBoardPage.tsx
git commit -m "feat(multi-assignee): board assignee filter matches primary or secondary"
```

---

### Task 7: Final verification

**Files:** none

- [ ] **Step 1: Pure tests**

Run: `npx tsx --test shared/cardAssignees.test.ts` → 2/2 PASS.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build` → 0; OK.

- [ ] **Step 3: Wiring grep**

```bash
grep -rn "pipeline_card_assignees\|card-assignees\|getSecondaryAssigneesForCards\|matchesAssigneeFilter\|listCardAssignees" server/ client/ shared/ | grep -v node_modules | grep -v "\.test\."
```
Expected: table (schema+migration), storage CRUD+batch, endpoints+notify, cards-list field, hooks+UI, board filter.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "chore(multi-assignee): final verification fixes" || echo "nothing to commit"
```

---

## Manual acceptance (on dev)

1. Open a Collections card (primary = Agus) → "Penanggung jawab tambahan" → add **Tomi** → Tomi chip appears + Tomi gets a bell notification.
2. Comment/move the card → Agus + Tomi + watchers all notified.
3. Board filter "Assignee = Tomi" → the card appears (matched via secondary), primary still Agus.
4. Remove Tomi → chip gone; filter no longer matches; no more notifications.
5. Existing single-assignee cards unchanged (primary-only, no secondary section entries).
