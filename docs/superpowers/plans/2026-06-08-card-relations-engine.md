# Card Relations Engine (Pipelines Phase 1) - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a pipeline card hold typed relations to other entities (customer, lead, collection, ODP, card), shown and managed in the card detail, generalizing the existing `source_customer_id`.

**Architecture:** A shared pure module holds the entity-type catalog + href/validation helpers (testable). A polymorphic `card_relations` table stores explicit relations. Storage resolves labels with batched per-type lookups (anti-N+1) and surfaces `source_customer_id` as an implicit relation at read time. Four mitra-scoped routes back a "Relasi" section in `CardDetailModal`.

**Tech Stack:** TypeScript, Drizzle (MySQL), `node:test` via `npx tsx --test`, React + TanStack Query. `.js` import extensions. New table via `CREATE TABLE IF NOT EXISTS` at startup.

---

### Task 1: Shared pure module - catalog + href + validation

**Files:**
- Create: `shared/cardRelations.ts`
- Test: `shared/cardRelations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shared/cardRelations.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RELATION_ENTITY_TYPES,
  isValidEntityType,
  relationHref,
  dedupeRelations,
} from "./cardRelations.js";

test("catalog has the 5 phase-1 types", () => {
  assert.deepEqual(RELATION_ENTITY_TYPES.map((t) => t.type).sort(),
    ["card", "collection", "customer", "lead", "odp"]);
});

test("isValidEntityType", () => {
  assert.equal(isValidEntityType("customer"), true);
  assert.equal(isValidEntityType("ticket"), false);
  assert.equal(isValidEntityType(""), false);
});

test("relationHref maps each type to a route", () => {
  assert.equal(relationHref("customer", 5), "/customers");
  assert.equal(relationHref("lead", 5), "/leads");
  assert.equal(relationHref("collection", 5), "/collections");
  assert.equal(relationHref("odp", 5), "/odps");
  assert.equal(relationHref("card", 9, { pipelineId: 3 }), "/pipelines/3?card=9");
});

test("relationHref for card without pipelineId falls back to /pipelines", () => {
  assert.equal(relationHref("card", 9), "/pipelines");
});

test("dedupeRelations removes same type+id", () => {
  const out = dedupeRelations([
    { entityType: "customer", entityId: 1 },
    { entityType: "customer", entityId: 1 },
    { entityType: "lead", entityId: 1 },
  ]);
  assert.equal(out.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test shared/cardRelations.test.ts`
Expected: FAIL - module missing.

- [ ] **Step 3: Write the module**

Create `shared/cardRelations.ts`:

```ts
/** Pure catalog + helpers for card relations. No DB, no I/O. */

export type RelationEntityType = "customer" | "lead" | "collection" | "odp" | "card";

export interface RelationTypeDef { type: RelationEntityType; label: string }

export const RELATION_ENTITY_TYPES: RelationTypeDef[] = [
  { type: "customer", label: "Pelanggan" },
  { type: "lead", label: "Lead" },
  { type: "collection", label: "Penagihan" },
  { type: "odp", label: "ODP" },
  { type: "card", label: "Kartu" },
];

const VALID = new Set(RELATION_ENTITY_TYPES.map((t) => t.type));

export function isValidEntityType(t: string): t is RelationEntityType {
  return VALID.has(t as RelationEntityType);
}

/** Client route for an entity. `card` needs the related card's pipelineId. */
export function relationHref(type: string, entityId: number, ctx?: { pipelineId?: number }): string {
  switch (type) {
    case "customer": return "/customers";
    case "lead": return "/leads";
    case "collection": return "/collections";
    case "odp": return "/odps";
    case "card": return ctx?.pipelineId ? `/pipelines/${ctx.pipelineId}?card=${entityId}` : "/pipelines";
    default: return "/pipelines";
  }
}

export function dedupeRelations<T extends { entityType: string; entityId: number }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of list) {
    const k = `${r.entityType}:${r.entityId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test shared/cardRelations.test.ts`
Expected: PASS - all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/cardRelations.ts shared/cardRelations.test.ts
git commit -m "feat(pipelines): pure card-relations catalog + href helpers"
```

---

### Task 2: Schema + startup table creation

**Files:**
- Modify: `shared/schema.ts`
- Modify: `server/storage.ts` (startup `CREATE TABLE`)

- [ ] **Step 1: Add the table to the schema**

In `shared/schema.ts`, after the `pipelineCards` table block (or near the other pipeline tables), add:

```ts
export const cardRelations = mysqlTable("card_relations", {
  id: int("id").autoincrement().primaryKey(),
  mitraId: int("mitra_id").notNull().default(1),
  cardId: int("card_id").notNull(),
  entityType: varchar("entity_type", { length: 16 }).notNull(),
  entityId: int("entity_id").notNull(),
  label: varchar("label", { length: 255 }),
  createdBy: int("created_by"),
  createdAt: text("created_at").notNull(),
}, (t) => ({
  byCard: index("idx_card_relations_mitra_card").on(t.mitraId, t.cardId),
  uniqCardEntity: uniqueIndex("uniq_card_relation").on(t.cardId, t.entityType, t.entityId),
}));

export type CardRelation = typeof cardRelations.$inferSelect;
```

(`index` and `uniqueIndex` are already imported in schema.ts.)

- [ ] **Step 2: Create the table at startup**

In `server/storage.ts`, find the block where pipeline tables are created with `CREATE TABLE IF NOT EXISTS` (search for `CREATE TABLE IF NOT EXISTS pipeline_card_followers`). Add a sibling create (a new try/catch mirroring that one):

```ts
    try {
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS card_relations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          mitra_id INT NOT NULL DEFAULT 1,
          card_id INT NOT NULL,
          entity_type VARCHAR(16) NOT NULL,
          entity_id INT NOT NULL,
          label VARCHAR(255),
          created_by INT,
          created_at TEXT NOT NULL,
          KEY idx_card_relations_mitra_card (mitra_id, card_id),
          UNIQUE KEY uniq_card_relation (card_id, entity_type, entity_id)
        )
      `);
    } catch (e: any) {
      console.warn(`[migration] card_relations create skipped: ${e.message}`);
    }
```

- [ ] **Step 3: Import the table symbol in storage.ts**

Ensure `cardRelations` is in the schema import list at the top of `server/storage.ts` (the big `import { ... } from "@shared/schema"` or `"../shared/schema.js"` block - match the existing style). Add `cardRelations` and the `CardRelation` type alongside the other pipeline imports.

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(pipelines): card_relations table + startup create"
```

---

### Task 3: Storage - CRUD + batched resolver + search + implicit surfacing

**Files:**
- Modify: `server/storage.ts`

Context: follow the batched `inArray` + Map convention. The entity tables `customers`, `leads`, `collections`, `odps`, `pipelineCards` must be imported in storage.ts (most already are - verify with grep and add any missing to the schema import).

- [ ] **Step 1: Add the relations storage methods**

In `server/storage.ts`, near the other pipeline-card methods, add:

```ts
  async listCardRelations(cardId: number): Promise<CardRelation[]> {
    const mitraId = getMitraId();
    return this.db.select().from(cardRelations)
      .where(and(eq(cardRelations.mitraId, mitraId), eq(cardRelations.cardId, cardId)))
      .orderBy(asc(cardRelations.id));
  }

  async entityExistsInMitra(entityType: string, entityId: number): Promise<boolean> {
    const mitraId = getMitraId();
    const tbl: any = entityType === "customer" ? customers
      : entityType === "lead" ? leads
      : entityType === "collection" ? collections
      : entityType === "odp" ? odps
      : entityType === "card" ? pipelineCards
      : null;
    if (!tbl) return false;
    const rows = await this.db.select({ id: tbl.id }).from(tbl)
      .where(and(eq(tbl.mitraId, mitraId), eq(tbl.id, entityId)));
    return rows.length > 0;
  }

  async addCardRelation(cardId: number, data: { entityType: string; entityId: number; label?: string | null }, userId: number): Promise<CardRelation> {
    const mitraId = getMitraId();
    const now = new Date().toISOString();
    const result = await this.db.insert(cardRelations).values({
      mitraId, cardId, entityType: data.entityType, entityId: data.entityId,
      label: data.label ?? null, createdBy: userId, createdAt: now,
    } as any);
    const insertId = Number((result[0] as any).insertId);
    const [row] = await this.db.select().from(cardRelations).where(and(eq(cardRelations.id, insertId), eq(cardRelations.mitraId, mitraId)));
    return row!;
  }

  async deleteCardRelation(relationId: number): Promise<number> {
    const mitraId = getMitraId();
    const result: any = await this.db.delete(cardRelations)
      .where(and(eq(cardRelations.id, relationId), eq(cardRelations.mitraId, mitraId)));
    return Number(result?.[0]?.affectedRows ?? 0);
  }

  /** Enrich relations with display label/subtitle (+ pipelineId for card type). Batched per type. */
  async resolveRelationLabels(
    relations: { entityType: string; entityId: number }[],
  ): Promise<Map<string, { label: string; subtitle: string | null; pipelineId: number | null }>> {
    const mitraId = getMitraId();
    const key = (t: string, id: number) => `${t}:${id}`;
    const out = new Map<string, { label: string; subtitle: string | null; pipelineId: number | null }>();
    const idsByType = new Map<string, number[]>();
    for (const r of relations) {
      if (!idsByType.has(r.entityType)) idsByType.set(r.entityType, []);
      idsByType.get(r.entityType)!.push(r.entityId);
    }

    // customer
    const custIds = idsByType.get("customer") ?? [];
    if (custIds.length) {
      const rows = await this.db.select({ id: customers.id, name: customers.name, cid: customers.customerId })
        .from(customers).where(and(eq(customers.mitraId, mitraId), inArray(customers.id, custIds)));
      for (const r of rows) out.set(key("customer", r.id), { label: r.name ?? `Pelanggan #${r.id}`, subtitle: r.cid ?? null, pipelineId: null });
    }
    // lead
    const leadIds = idsByType.get("lead") ?? [];
    if (leadIds.length) {
      const rows = await this.db.select({ id: leads.id, name: leads.name, phone: leads.phone })
        .from(leads).where(and(eq(leads.mitraId, mitraId), inArray(leads.id, leadIds)));
      for (const r of rows) out.set(key("lead", r.id), { label: r.name ?? `Lead #${r.id}`, subtitle: r.phone ?? null, pipelineId: null });
    }
    // odp
    const odpIds = idsByType.get("odp") ?? [];
    if (odpIds.length) {
      const rows = await this.db.select({ id: odps.id, name: odps.name, code: odps.code })
        .from(odps).where(and(eq(odps.mitraId, mitraId), inArray(odps.id, odpIds)));
      for (const r of rows) out.set(key("odp", r.id), { label: r.name ?? `ODP #${r.id}`, subtitle: r.code ?? null, pipelineId: null });
    }
    // card
    const cardIds = idsByType.get("card") ?? [];
    if (cardIds.length) {
      const rows = await this.db.select({ id: pipelineCards.id, title: pipelineCards.title, pid: pipelineCards.pipelineId })
        .from(pipelineCards).where(and(eq(pipelineCards.mitraId, mitraId), inArray(pipelineCards.id, cardIds)));
      for (const r of rows) out.set(key("card", r.id), { label: r.title ?? `Kartu #${r.id}`, subtitle: null, pipelineId: r.pid });
    }
    // collection (label via its customer)
    const colIds = idsByType.get("collection") ?? [];
    if (colIds.length) {
      const cols = await this.db.select({ id: collections.id, customerId: collections.customerId, stage: collections.stage })
        .from(collections).where(and(eq(collections.mitraId, mitraId), inArray(collections.id, colIds)));
      const colCustIds = [...new Set(cols.map((c) => c.customerId).filter((x): x is number => x != null))];
      const custMap = new Map<number, string>();
      if (colCustIds.length) {
        const crows = await this.db.select({ id: customers.id, name: customers.name })
          .from(customers).where(and(eq(customers.mitraId, mitraId), inArray(customers.id, colCustIds)));
        for (const cr of crows) custMap.set(cr.id, cr.name ?? `Pelanggan #${cr.id}`);
      }
      for (const c of cols) {
        const name = c.customerId != null ? (custMap.get(c.customerId) ?? `Penagihan #${c.id}`) : `Penagihan #${c.id}`;
        out.set(key("collection", c.id), { label: name, subtitle: `Penagihan #${c.id}${c.stage ? ` · ${c.stage}` : ""}`, pipelineId: null });
      }
    }
    return out;
  }

  /** Search entities of one type for the add-relation picker (mitra-scoped, capped). */
  async searchRelatableEntities(entityType: string, q: string): Promise<{ id: number; label: string; subtitle: string | null; pipelineId?: number }[]> {
    const mitraId = getMitraId();
    const like = `%${q}%`;
    if (entityType === "customer") {
      const rows = await this.db.select({ id: customers.id, name: customers.name, cid: customers.customerId })
        .from(customers).where(and(eq(customers.mitraId, mitraId), or(like_(customers.name, like), like_(customers.customerId, like)))).limit(20);
      return rows.map((r) => ({ id: r.id, label: r.name ?? `Pelanggan #${r.id}`, subtitle: r.cid ?? null }));
    }
    if (entityType === "lead") {
      const rows = await this.db.select({ id: leads.id, name: leads.name, phone: leads.phone })
        .from(leads).where(and(eq(leads.mitraId, mitraId), like_(leads.name, like))).limit(20);
      return rows.map((r) => ({ id: r.id, label: r.name ?? `Lead #${r.id}`, subtitle: r.phone ?? null }));
    }
    if (entityType === "odp") {
      const rows = await this.db.select({ id: odps.id, name: odps.name, code: odps.code })
        .from(odps).where(and(eq(odps.mitraId, mitraId), or(like_(odps.name, like), like_(odps.code, like)))).limit(20);
      return rows.map((r) => ({ id: r.id, label: r.name ?? `ODP #${r.id}`, subtitle: r.code ?? null }));
    }
    if (entityType === "card") {
      const rows = await this.db.select({ id: pipelineCards.id, title: pipelineCards.title, pid: pipelineCards.pipelineId })
        .from(pipelineCards).where(and(eq(pipelineCards.mitraId, mitraId), like_(pipelineCards.title, like))).limit(20);
      return rows.map((r) => ({ id: r.id, label: r.title ?? `Kartu #${r.id}`, subtitle: null, pipelineId: r.pid }));
    }
    if (entityType === "collection") {
      const rows = await this.db.select({ id: collections.id, customerId: collections.customerId })
        .from(collections).where(eq(collections.mitraId, mitraId)).limit(50);
      const custIds = [...new Set(rows.map((r) => r.customerId).filter((x): x is number => x != null))];
      const custMap = new Map<number, string>();
      if (custIds.length) {
        const crows = await this.db.select({ id: customers.id, name: customers.name })
          .from(customers).where(and(eq(customers.mitraId, mitraId), inArray(customers.id, custIds)));
        for (const cr of crows) custMap.set(cr.id, cr.name ?? "");
      }
      return rows
        .map((r) => ({ id: r.id, label: r.customerId != null ? (custMap.get(r.customerId) || `Penagihan #${r.id}`) : `Penagihan #${r.id}`, subtitle: `Penagihan #${r.id}` }))
        .filter((x) => x.label.toLowerCase().includes(q.toLowerCase()) || x.subtitle.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 20);
    }
    return [];
  }
```

NOTE on `like_`: this codebase uses Drizzle's `like` operator. At the top of `server/storage.ts`, confirm `like` and `or` are imported from `drizzle-orm` (search `from "drizzle-orm"`); if `like`/`or` are missing, add them to that import. Then replace `like_(col, val)` above with `like(col, val)` (the `like_` name is a placeholder to force you to wire the real import - use the real `like`).

- [ ] **Step 2: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 3: Commit**

```bash
git add server/storage.ts
git commit -m "feat(pipelines): card-relations storage CRUD + batched resolver + search"
```

---

### Task 4: Routes - relations endpoints

**Files:**
- Modify: `server/routes.ts`

- [ ] **Step 1: Add the import**

At the top of `server/routes.ts`, add (matching the file's existing `../shared/*.js` import style):
```ts
import { isValidEntityType } from "../shared/cardRelations.js";
```

- [ ] **Step 2: Add the four routes**

In `server/routes.ts`, near the other `/api/pipelines/cards/:cardId/...` routes (e.g. after the move route), add:

```ts
  // -- Card relations (Phase 1) --
  router.get("/api/pipelines/cards/:cardId/relations", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    const card = await storage.getCard(Number(req.params.cardId));
    if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
    if (!(await requirePipelineView(req, res, card.pipelineId))) return;

    const explicit = await storage.listCardRelations(card.id);
    const toResolve: { entityType: string; entityId: number }[] = explicit.map((r) => ({ entityType: r.entityType, entityId: r.entityId }));
    // implicit source-customer relation (read-time), if not already explicit
    const srcCustomerId = (card as any).sourceCustomerId as number | null;
    const hasExplicitCustomer = explicit.some((r) => r.entityType === "customer" && r.entityId === srcCustomerId);
    if (srcCustomerId != null && !hasExplicitCustomer) toResolve.push({ entityType: "customer", entityId: srcCustomerId });

    const labels = await storage.resolveRelationLabels(toResolve);
    const k = (t: string, id: number) => `${t}:${id}`;
    const items = explicit.map((r) => {
      const meta = labels.get(k(r.entityType, r.entityId));
      return {
        id: r.id, entityType: r.entityType, entityId: r.entityId, label: r.label,
        entityLabel: meta?.label ?? `${r.entityType} #${r.entityId} (dihapus)`,
        entitySubtitle: meta?.subtitle ?? null, pipelineId: meta?.pipelineId ?? null, implicit: false,
      };
    });
    if (srcCustomerId != null && !hasExplicitCustomer) {
      const meta = labels.get(k("customer", srcCustomerId));
      items.unshift({
        id: null as any, entityType: "customer", entityId: srcCustomerId, label: "dari billing",
        entityLabel: meta?.label ?? `Pelanggan #${srcCustomerId}`, entitySubtitle: meta?.subtitle ?? null,
        pipelineId: null, implicit: true,
      });
    }
    sendSuccess(res, items);
  });

  router.post("/api/pipelines/cards/:cardId/relations", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const card = await storage.getCard(Number(req.params.cardId));
    if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
    if (!(await requirePipelineEdit(req, res, card.pipelineId))) return;
    const { entityType, entityId, label } = req.body ?? {};
    if (!isValidEntityType(String(entityType))) return sendError(res, "entityType tidak valid", 400);
    const eid = Number(entityId);
    if (!Number.isInteger(eid) || eid <= 0) return sendError(res, "entityId tidak valid", 400);
    if (!(await storage.entityExistsInMitra(String(entityType), eid))) return sendError(res, "Entity tidak ditemukan di tenant ini", 404);
    const lbl = typeof label === "string" ? (label.trim() || null) : null;
    try {
      const row = await storage.addCardRelation(card.id, { entityType: String(entityType), entityId: eid, label: lbl }, req.authUser!.id);
      sendSuccess(res, row);
    } catch (e: any) {
      if (String(e?.message).match(/duplicate|UNIQUE/i)) return sendError(res, "Relasi sudah ada", 409);
      throw e;
    }
  });

  router.delete("/api/pipelines/cards/:cardId/relations/:relationId", async (req, res) => {
    if (!requireWritePermission(req, res, "pipelines")) return;
    const card = await storage.getCard(Number(req.params.cardId));
    if (!card) return sendError(res, "Kartu tidak ditemukan", 404);
    if (!(await requirePipelineEdit(req, res, card.pipelineId))) return;
    const n = await storage.deleteCardRelation(Number(req.params.relationId));
    if (n === 0) return sendError(res, "Relasi tidak ditemukan", 404);
    sendSuccess(res, { ok: true });
  });

  router.get("/api/pipelines/relations/search", async (req, res) => {
    if (!requirePermission(req, res, "pipelines")) return;
    const type = String(req.query.type ?? "");
    if (!isValidEntityType(type)) return sendError(res, "type tidak valid", 400);
    const q = String(req.query.q ?? "").trim();
    if (q.length < 1) return sendSuccess(res, []);
    sendSuccess(res, await storage.searchRelatableEntities(type, q));
  });
```

- [ ] **Step 3: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "feat(pipelines): card-relations endpoints (list/add/delete/search)"
```

---

### Task 5: Frontend - relations hook + CardDetailModal section

**Files:**
- Modify: `client/hooks/usePipelines.ts` (add relations hooks)
- Modify: `client/components/pipelines/CardDetailModal.tsx`
- (Optional) Create: `client/components/pipelines/CardRelations.tsx` (the section component, to keep the modal focused)

Context: READ `client/components/pipelines/CardDetailModal.tsx` and `client/hooks/usePipelines.ts` first to match their query/mutation + `api` patterns.

- [ ] **Step 1: Add query + mutation hooks**

In `client/hooks/usePipelines.ts`, add (matching the file's `api` import + queryKey + invalidate style):

```ts
export function useCardRelations(cardId: number | null) {
  return useQuery({
    queryKey: ["card-relations", cardId],
    queryFn: () => api.get(`/pipelines/cards/${cardId}/relations`),
    enabled: cardId != null,
  });
}

export function useCardRelationMutations(cardId: number) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["card-relations", cardId] });
  return {
    add: useMutation({ mutationFn: (b: { entityType: string; entityId: number; label?: string | null }) => api.post(`/pipelines/cards/${cardId}/relations`, b), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (relationId: number) => api.del(`/pipelines/cards/${cardId}/relations/${relationId}`), onSuccess: invalidate }),
  };
}
```

(Use whatever the file calls the delete helper - `api.del` or `api.delete`; match existing usage. Ensure `useQuery`/`useMutation`/`useQueryClient` are imported in this file - they already are for other hooks.)

- [ ] **Step 2: Build the CardRelations section component**

Create `client/components/pipelines/CardRelations.tsx`:

```tsx
import { useState } from "react";
import { useCardRelations, useCardRelationMutations } from "@/hooks/usePipelines";
import { RELATION_ENTITY_TYPES, relationHref } from "@shared/cardRelations";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { Link2, X, Plus } from "lucide-react";
import { toast } from "sonner";

export function CardRelations({ cardId, writable }: { cardId: number; writable: boolean }) {
  const { data: relations } = useCardRelations(cardId);
  const m = useCardRelationMutations(cardId);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState("customer");
  const [picked, setPicked] = useState<{ id: number; label: string } | null>(null);
  const [label, setLabel] = useState("");
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);

  const search = async (q: string) => {
    if (!q.trim()) { setOptions([]); return; }
    const rows: any[] = await api.get(`/pipelines/relations/search?type=${type}&q=${encodeURIComponent(q)}`);
    setOptions(rows.map((r) => ({ value: String(r.id), label: r.subtitle ? `${r.label} · ${r.subtitle}` : r.label })));
  };

  const submit = async () => {
    if (!picked) return;
    try {
      await m.add.mutateAsync({ entityType: type, entityId: picked.id, label: label.trim() || null });
      setAdding(false); setPicked(null); setLabel(""); setOptions([]);
    } catch (e: any) { toast.error(e?.message || "Gagal menambah relasi"); }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Link2 className="size-3.5" /> Relasi</h3>
        {writable && !adding && <Button size="xs" variant="ghost" leftIcon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>Tambah</Button>}
      </div>

      <div className="space-y-1.5">
        {(relations ?? []).map((r: any, i: number) => (
          <div key={r.id ?? `imp-${i}`} className="flex items-center gap-2 rounded-lg border border-border/50 px-2.5 py-1.5">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground shrink-0">{RELATION_ENTITY_TYPES.find((t) => t.type === r.entityType)?.label ?? r.entityType}</span>
            <a href={relationHref(r.entityType, r.entityId, { pipelineId: r.pipelineId ?? undefined })} className="text-sm font-medium hover:underline truncate flex-1">{r.entityLabel}</a>
            {r.entitySubtitle && <span className="text-[11px] text-muted-foreground truncate hidden sm:block">{r.entitySubtitle}</span>}
            {r.label && <span className="text-[10px] text-info bg-info/10 px-1.5 py-0.5 rounded shrink-0">{r.label}</span>}
            {r.implicit && <span className="text-[10px] text-muted-foreground/70 italic shrink-0">implisit</span>}
            {writable && !r.implicit && (
              <button type="button" aria-label="Hapus relasi" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => m.remove.mutate(r.id)}><X className="size-3.5" /></button>
            )}
          </div>
        ))}
        {(relations ?? []).length === 0 && <p className="text-xs text-muted-foreground italic">Belum ada relasi.</p>}
      </div>

      {adding && writable && (
        <div className="rounded-lg border border-border/50 p-2.5 space-y-2">
          <div className="flex gap-2">
            <Combobox value={type} onChange={(v) => { setType(v); setPicked(null); setOptions([]); }} options={RELATION_ENTITY_TYPES.map((t) => ({ value: t.type, label: t.label }))} />
          </div>
          <Combobox value={picked ? String(picked.id) : ""} onChange={(v) => { const o = options.find((x) => x.value === v); setPicked(v ? { id: Number(v), label: o?.label ?? "" } : null); }}
            options={options} onSearch={search} searchPlaceholder="Cari entity…" />
          <Input inputSize="sm" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (opsional)" />
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} loading={m.add.isPending} disabled={!picked}>Tambah</Button>
            <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setPicked(null); setLabel(""); setOptions([]); }}>Batal</Button>
          </div>
        </div>
      )}
    </section>
  );
}
```

NOTE: `Combobox`'s exact props (`onSearch`, `searchPlaceholder`) must match the project's `@/components/ui/combobox`. READ that component; if it doesn't support async `onSearch`, fetch options on type change with a debounced effect instead and pass static `options`. Adapt to the real Combobox API - do not invent props.

- [ ] **Step 3: Mount it in CardDetailModal**

In `client/components/pipelines/CardDetailModal.tsx`, import and render `<CardRelations cardId={cardId} writable={writable} />` in a sensible spot (e.g. after the description/fields block, before or alongside the activity/comments section). Match the modal's existing section spacing.

```tsx
import { CardRelations } from "./CardRelations";
// ... inside the modal body:
<CardRelations cardId={cardId} writable={writable} />
```

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck` → 0 errors.
Run: `npm run build` → success.

- [ ] **Step 5: Commit**

```bash
git add client/hooks/usePipelines.ts client/components/pipelines/CardRelations.tsx client/components/pipelines/CardDetailModal.tsx
git commit -m "feat(pipelines): card relations section in CardDetailModal"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Pure tests** - Run: `npx tsx --test shared/cardRelations.test.ts` → all PASS.
- [ ] **Step 2: Typecheck** - Run: `npm run typecheck` → 0 errors.
- [ ] **Step 3: Build** - Run: `npm run build` → success.
- [ ] **Step 4: Wiring** - Run: `grep -rln "card_relations\|cardRelations\|CardRelations" server/ shared/ client/ | sort` → expect schema, storage, routes, shared module + test, hook, component.

---

## Self-Review

- **Spec coverage:** polymorphic table → Task 2. Pure catalog/href/dedupe → Task 1. Batched resolver + CRUD + search + entity existence → Task 3. Implicit source-customer surfacing (read-time, non-deletable) → Task 4 GET handler. 4 routes with card→pipeline permission → Task 4. CardDetailModal "Relasi" section + picker → Task 5. Multi-tenant scoping → every storage method uses `getMitraId()`; `entityExistsInMitra` enforces same-mitra on add. Testing → Task 1 + Task 6.
- **Placeholders:** Tasks 1-4 + 6 contain complete code. Tasks 3 and 5 flag two real integration points to wire against the actual codebase (`like`/`or` import in storage; `Combobox` async-search API) rather than guessing - both call out exactly what to verify and how to adapt.
- **Type consistency:** `RelationEntityType`, `RELATION_ENTITY_TYPES`, `isValidEntityType`, `relationHref`, `dedupeRelations` (Task 1) consumed in Tasks 4-5. `CardRelation` type (Task 2) used in Task 3 method signatures. Storage methods `listCardRelations`/`addCardRelation`/`deleteCardRelation`/`resolveRelationLabels`/`searchRelatableEntities`/`entityExistsInMitra` (Task 3) called by Task 4 routes. Route shapes (`entityLabel`/`entitySubtitle`/`pipelineId`/`implicit`) consumed by Task 5 component.

## Deploy note
New table `card_relations` is created on startup (`CREATE TABLE IF NOT EXISTS`) - no manual SQL. Purely additive; no impact on existing pipelines/cards.
