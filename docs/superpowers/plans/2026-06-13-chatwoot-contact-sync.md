# Chatwoot Contact Sync - Batch 2b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Manually push Workspace customers into Chatwoot as contacts (idempotent upsert + labels), storing the contact id back on the customer.

**Architecture:** Reuse the existing per-mitra `chatwootRequest` (account-scoped → isolation) + `searchContactByPhone`. Pure payload/label builders in a tested `shared/` module. Two write-gated endpoints (single + bulk). Mapping stored in two new `customers` columns.

**Tech Stack:** Express 5 + Drizzle (MySQL) · React 18 + TanStack Query · `node:test` via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-06-13-chatwoot-contact-sync-design.md`
**Branch:** `dev`. Do not push/deploy.

**Confirmed conventions:**
- `toWhatsappNumber(raw)` (from `shared/phone.ts`) returns Indonesian digits WITHOUT `+` (e.g. `628123…`); Chatwoot `phone_number` wants E.164 `+62…` → prefix `+`.
- Startup `ALTER TABLE ADD COLUMN` must use an information_schema check (NO `IF NOT EXISTS`); see existing examples around `server/storage.ts:460-550`.
- `req.params.id` is `string|string[]` → wrap `Number(...)`.
- Verify UI primitive prop names (`Button`) + the customer detail dialog insertion point (the dialog opened by `detailCustomer`, header already has `OpenInChatwootButton`).
- `/customers` has no general bulk-select; bulk sync = a header button over the currently-filtered customer list.

---

## Task 1: Schema columns + startup migration + storage helper

**Files:** `shared/schema.ts`, `server/storage.ts`

- [ ] **Step 1: Add columns to `customers` in `shared/schema.ts`** (after `billingSyncSource`):
```ts
  chatwootContactId: text("chatwoot_contact_id"),
  chatwootSyncedAt: text("chatwoot_synced_at"),
```

- [ ] **Step 2: Startup ALTER in `server/storage.ts`**
Find the startup migration area that does `ALTER TABLE ... ADD COLUMN` with an information_schema existence check (around lines 460-550). Following that EXACT pattern (check `information_schema.columns` for the column, then `ALTER` in a try/catch), add migrations for `customers.chatwoot_contact_id VARCHAR(64) NULL` and `customers.chatwoot_synced_at VARCHAR(40) NULL`. Mirror the surrounding code's helper if one exists (e.g. an `addColumnIfMissing(table, name, def)` helper - search for it; if present, just add two calls).

- [ ] **Step 3: Storage helper** - add to `DatabaseStorage` (near other customer methods):
```ts
async updateCustomerChatwootLink(id: number, contactId: string, syncedAt: string): Promise<void> {
  const mitraId = getMitraId();
  await this.db.update(customers)
    .set({ chatwootContactId: contactId, chatwootSyncedAt: syncedAt })
    .where(and(eq(customers.id, id), eq(customers.mitraId, mitraId)));
}
```
(Confirm `customers`, `and`, `eq`, `getMitraId` are imported in storage.ts - they are, used by `getCustomer`.)

- [ ] **Step 4: Verify** `npm run typecheck` → 0 errors (run it yourself; don't trust prior assumptions).

- [ ] **Step 5: Commit**
```bash
git add shared/schema.ts server/storage.ts
git commit -m "feat(chatwoot): customers.chatwoot_contact_id/synced_at columns + link helper"
```

---

## Task 2: Pure builders `shared/chatwootContact.ts`

**Files:** Create `shared/chatwootContact.ts` + `shared/chatwootContact.test.ts`

- [ ] **Step 1: Write the failing test**
```ts
// shared/chatwootContact.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChatwootContactPayload, buildChatwootContactLabels } from "./chatwootContact.js";

test("payload: maps fields, normalizes phone to +62, sets identifier + custom_attributes", () => {
  const p = buildChatwootContactPayload(
    { name: "Budi", customerId: "052500015", phone: "08123456789", email: "b@x.id", status: "active", customerType: "rumahan" },
    { tenant: "jabnet" },
  );
  assert.equal(p.name, "Budi");
  assert.equal(p.phone_number, "+628123456789");
  assert.equal(p.email, "b@x.id");
  assert.equal(p.identifier, "052500015");
  assert.deepEqual(p.custom_attributes, { jabnet_customer_id: "052500015", tenant: "jabnet", status: "active", customer_type: "rumahan" });
});

test("payload: omits empty phone/email and empty custom_attributes", () => {
  const p = buildChatwootContactPayload({ name: "X", customerId: "1", phone: "", email: null, status: null, customerType: null }, { tenant: "jabnet" });
  assert.equal("phone_number" in p, false);
  assert.equal("email" in p, false);
  assert.deepEqual(p.custom_attributes, { jabnet_customer_id: "1", tenant: "jabnet" });
});

test("labels: slugified, deduped, empties dropped", () => {
  assert.deepEqual(
    buildChatwootContactLabels({ status: "Active", customerType: "Rumahan", customerId: "1", name: "x", phone: "", email: "" }, { tenant: "JABNET" }),
    ["jabnet", "active", "rumahan"],
  );
  assert.deepEqual(
    buildChatwootContactLabels({ status: null, customerType: null, customerId: "1", name: "x", phone: "", email: "" }, { tenant: "jabnet" }),
    ["jabnet"],
  );
});
```

- [ ] **Step 2: Run, verify FAIL** - `npx tsx --test shared/chatwootContact.test.ts`

- [ ] **Step 3: Implement `shared/chatwootContact.ts`**
```ts
/** Pure builders: Workspace customer → Chatwoot contact payload + labels. No I/O - testable. */
import { toWhatsappNumber } from "./phone.js";

type CustomerLike = {
  name: string; customerId: string;
  phone?: string | null; email?: string | null;
  status?: string | null; customerType?: string | null;
};

export function buildChatwootContactPayload(c: CustomerLike, opts: { tenant: string }) {
  const digits = c.phone ? toWhatsappNumber(c.phone) : "";
  const custom: Record<string, string> = { jabnet_customer_id: c.customerId, tenant: opts.tenant };
  if (c.status) custom.status = c.status;
  if (c.customerType) custom.customer_type = c.customerType;

  const payload: Record<string, any> = {
    name: c.name,
    identifier: c.customerId,
    custom_attributes: custom,
  };
  if (digits) payload.phone_number = `+${digits}`;
  if (c.email) payload.email = c.email;
  return payload;
}

function slug(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildChatwootContactLabels(c: CustomerLike, opts: { tenant: string }): string[] {
  const raw = [opts.tenant, c.status ?? "", c.customerType ?? ""];
  const out: string[] = [];
  for (const r of raw) {
    const s = slug(String(r));
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}
```

- [ ] **Step 4: Run, verify PASS** (3 tests) - `npx tsx --test shared/chatwootContact.test.ts`

- [ ] **Step 5: Commit**
```bash
git add shared/chatwootContact.ts shared/chatwootContact.test.ts
git commit -m "feat(chatwoot): pure contact payload + label builders (shared)"
```

---

## Task 3: Backend upsert in `server/chatwoot.ts`

**Files:** Modify `server/chatwoot.ts` (append; reuse private `chatwootRequest` + existing `searchContactByPhone`). No unit test (network).

- [ ] **Step 1: Add functions** (after `listContactConversations`):
```ts
// -- Contact sync (Batch 2b) ------------------------------------------------

/** Find an existing contact by identifier (customerId) first, else by normalized phone. */
export async function findChatwootContact(customerId: string, phone: string | null | undefined, normalize: (p: string) => string): Promise<any | null> {
  if (customerId) {
    const res = await chatwootRequest(`/contacts/search?q=${encodeURIComponent(customerId)}`);
    const hits: any[] = Array.isArray(res?.payload) ? res.payload : [];
    const byId = hits.find((c) => c?.identifier && String(c.identifier) === String(customerId));
    if (byId) return byId;
  }
  if (phone) return searchContactByPhone(phone, normalize);
  return null;
}

/** Idempotent upsert: create/update a Chatwoot contact for a customer, then set labels (best-effort). */
export async function upsertChatwootContact(
  customer: { id: number; name: string; customerId: string; phone?: string | null; email?: string | null; status?: string | null; customerType?: string | null },
  opts: { tenant: string; normalize: (p: string) => string;
          buildPayload: (c: any, o: { tenant: string }) => any; buildLabels: (c: any, o: { tenant: string }) => string[] },
): Promise<{ contactId: number; action: "created" | "updated" }> {
  const payload = opts.buildPayload(customer, { tenant: opts.tenant });
  const existing = await findChatwootContact(customer.customerId, customer.phone, opts.normalize);

  let contactId: number;
  let action: "created" | "updated";
  if (existing?.id != null) {
    await chatwootRequest(`/contacts/${existing.id}`, { method: "PUT", body: payload });
    contactId = Number(existing.id);
    action = "updated";
  } else {
    const res = await chatwootRequest(`/contacts`, { method: "POST", body: payload });
    const id = res?.payload?.contact?.id ?? res?.payload?.id ?? res?.id;
    if (id == null) throw new Error("Chatwoot: gagal membaca id contact baru");
    contactId = Number(id);
    action = "created";
  }

  // Labels - best-effort; jangan gagalkan sync kalau label error.
  try {
    const labels = opts.buildLabels(customer, { tenant: opts.tenant });
    if (labels.length) await chatwootRequest(`/contacts/${contactId}/labels`, { method: "POST", body: { labels } });
  } catch (e: any) {
    console.warn("[chatwoot] set labels gagal (diabaikan):", e.message);
  }

  return { contactId, action };
}
```
> Inject the pure builders + normalizer from the route (avoids `server/chatwoot.ts` importing shared builders directly, keeps it flexible). `searchContactByPhone` already exists in this file.

- [ ] **Step 2: Verify** `npm run typecheck` → 0 errors.

- [ ] **Step 3: Commit**
```bash
git add server/chatwoot.ts
git commit -m "feat(chatwoot): findChatwootContact + idempotent upsertChatwootContact (+labels)"
```

> Risk: Chatwoot create response shape (`payload.contact.id` vs `payload.id` vs `id`) handled defensively; verify at smoke (Task 7).

---

## Task 4: Sync endpoints in `server/routes.ts`

**Files:** Modify `server/routes.ts` - add after the chatwoot read endpoints. Gated `chatwoot` **write**.

- [ ] **Step 1: Add routes**
```ts
/** Contact sync (Batch 2b) - manual. Gated `chatwoot` write. Workspace → Chatwoot upsert. */
router.post("/api/integrations/chatwoot/customers/:id/sync", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const customer = await storage.getCustomer(Number(req.params.id)); // tenant-scoped
    if (!customer) return sendError(res, "Pelanggan tidak ditemukan", 404);
    const { upsertChatwootContact } = await import("./chatwoot.js");
    const { toWhatsappNumber } = await import("../shared/phone.js");
    const { buildChatwootContactPayload, buildChatwootContactLabels } = await import("../shared/chatwootContact.js");
    const tenant = String(req.authUser.activeMitraId ?? 1);
    const result = await upsertChatwootContact(customer as any, {
      tenant, normalize: toWhatsappNumber, buildPayload: buildChatwootContactPayload, buildLabels: buildChatwootContactLabels,
    });
    await storage.updateCustomerChatwootLink(customer.id, String(result.contactId), new Date().toISOString());
    await storage.createAuditLog({
      userId: req.authUser.id, username: req.authUser.username, userName: req.authUser.name,
      action: "UPDATE", entityType: "chatwoot_contact_sync", entityId: customer.id, entityName: customer.name,
      details: JSON.stringify({ contactId: result.contactId, action: result.action }), createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, result);
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendError(res, "Chatwoot belum dikonfigurasi", 400);
    sendError(res, e.message, 500);
  }
});

router.post("/api/integrations/chatwoot/contacts/sync-bulk", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasWritePermission(req, "chatwoot")) return sendError(res, "Akses ditolak (write)", 403);
  try {
    const ids: number[] = Array.isArray(req.body?.customerIds) ? req.body.customerIds.slice(0, 200).map(Number) : [];
    if (!ids.length) return sendError(res, "customerIds kosong", 400);
    const { upsertChatwootContact } = await import("./chatwoot.js");
    const { toWhatsappNumber } = await import("../shared/phone.js");
    const { buildChatwootContactPayload, buildChatwootContactLabels } = await import("../shared/chatwootContact.js");
    const tenant = String(req.authUser.activeMitraId ?? 1);
    const results: any[] = [];
    let synced = 0, failed = 0;
    for (const id of ids) {
      try {
        const customer = await storage.getCustomer(id);
        if (!customer) { results.push({ customerId: id, ok: false, error: "not found" }); failed++; continue; }
        const r = await upsertChatwootContact(customer as any, { tenant, normalize: toWhatsappNumber, buildPayload: buildChatwootContactPayload, buildLabels: buildChatwootContactLabels });
        await storage.updateCustomerChatwootLink(customer.id, String(r.contactId), new Date().toISOString());
        results.push({ customerId: id, ok: true, contactId: r.contactId, action: r.action }); synced++;
      } catch (e: any) { results.push({ customerId: id, ok: false, error: e.message }); failed++; }
    }
    await storage.createAuditLog({
      userId: req.authUser.id, username: req.authUser.username, userName: req.authUser.name,
      action: "UPDATE", entityType: "chatwoot_contact_sync_bulk", entityId: null, entityName: `${synced}/${ids.length}`,
      details: JSON.stringify({ synced, failed }), createdAt: new Date().toISOString(),
    } as any);
    sendSuccess(res, { results, synced, failed });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendError(res, "Chatwoot belum dikonfigurasi", 400);
    sendError(res, e.message, 500);
  }
});
```
> Confirm `req.authUser` has `.activeMitraId`, `.id`, `.username`, `.name` (used elsewhere in routes.ts - it does).

- [ ] **Step 2: Verify** `npm run typecheck` → 0 errors.

- [ ] **Step 3: Commit**
```bash
git add server/routes.ts
git commit -m "feat(chatwoot): contact sync endpoints (single + bulk, write-gated, audited)"
```

---

## Task 5: Client wrappers + mutation hooks

**Files:** `client/lib/chatwoot.ts`, `client/hooks/useChatwoot.ts`

- [ ] **Step 1: `client/lib/chatwoot.ts`** - add to `chatwootApi`:
```ts
  syncCustomerContact: (customerId: number) =>
    api.post<{ contactId: number; action: "created" | "updated" }>(`/integrations/chatwoot/customers/${customerId}/sync`, {}),
  syncBulkContacts: (customerIds: number[]) =>
    api.post<{ results: { customerId: number; ok: boolean; contactId?: number; action?: string; error?: string }[]; synced: number; failed: number }>(`/integrations/chatwoot/contacts/sync-bulk`, { customerIds }),
```

- [ ] **Step 2: `client/hooks/useChatwoot.ts`** - add (merge imports; needs `useMutation`, `useQueryClient`):
```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useSyncCustomerContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (customerId: number) => chatwootApi.syncCustomerContact(customerId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/customers"] }); },
  });
}
export function useSyncBulkContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (customerIds: number[]) => chatwootApi.syncBulkContacts(customerIds),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/customers"] }); },
  });
}
```
> Confirm the customers list query key by grepping `useQuery` in `CustomersPage.tsx` and match it (adjust the invalidate key if different).

- [ ] **Step 3: Verify** `npm run typecheck` → 0 errors.

- [ ] **Step 4: Commit**
```bash
git add client/lib/chatwoot.ts client/hooks/useChatwoot.ts
git commit -m "feat(chatwoot): client sync wrappers + mutation hooks"
```

---

## Task 6: ChatwootSyncButton + wire into CustomersPage

**Files:** Create `client/components/chatwoot/ChatwootSyncButton.tsx`; modify `client/pages/CustomersPage.tsx`.

- [ ] **Step 1: `ChatwootSyncButton.tsx`**
```tsx
import { RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useChatwootStatus, useSyncCustomerContact } from "@/hooks/useChatwoot";

/** Per-customer "Sync ke Chatwoot". Self-hides when Chatwoot disabled. */
export function ChatwootSyncButton({ customerId, alreadySynced, size = "sm" }: {
  customerId: number; alreadySynced?: boolean; size?: "xs" | "sm" | "default";
}) {
  const { data: status } = useChatwootStatus();
  const sync = useSyncCustomerContact();
  if (!status?.enabled || !status.configured) return null;
  return (
    <Button type="button" variant="outline" size={size as "xs" | "sm" | "default"} loading={sync.isPending}
      onClick={() => sync.mutate(customerId, {
        onSuccess: (r) => toast.success(r.action === "created" ? "Kontak Chatwoot dibuat" : "Kontak Chatwoot diperbarui"),
        onError: (e: any) => toast.error(e.message || "Gagal sync"),
      })}>
      {alreadySynced ? <Check className="size-3.5 mr-1" aria-hidden="true" /> : <RefreshCw className="size-3.5 mr-1" aria-hidden="true" />}
      {alreadySynced ? "Sync ulang" : "Sync ke Chatwoot"}
    </Button>
  );
}
```
> Verify `Button` supports `loading` + `size` (it does per earlier tasks; match `sonner` toast import to the repo - grep `import { toast }`).

- [ ] **Step 2: Per-customer placement in `CustomersPage.tsx`**
Import `ChatwootSyncButton`. In the customer detail dialog header (the `<div className="flex items-start justify-between gap-3">` that already contains `<OpenInChatwootButton target="contacts" size="sm" />`), add beside it:
```tsx
<ChatwootSyncButton customerId={(detailCustomer as any).id} alreadySynced={!!(detailCustomer as any).chatwootContactId} size="sm" />
```
(Wrap the two buttons in a `flex items-center gap-2` if not already.)

- [ ] **Step 3: Bulk header action in `CustomersPage.tsx`**
The page renders a filtered customers array (grep for the memoized filtered list feeding the table, e.g. `filtered`/`filteredCustomers`). Add a header button (near the page actions) that syncs that filtered list:
```tsx
// near other page-level hooks:
const bulkSync = useSyncBulkContacts();
// in the header actions row (gated by chatwoot status - reuse useChatwootStatus or just render; backend enforces perm):
<Button type="button" variant="outline" size="sm" loading={bulkSync.isPending}
  onClick={() => {
    const ids = filteredCustomers.map((c: any) => c.id).slice(0, 200);
    if (!ids.length) return;
    bulkSync.mutate(ids, {
      onSuccess: (r) => toast.success(`Sync selesai: ${r.synced} sukses, ${r.failed} gagal`),
      onError: (e: any) => toast.error(e.message || "Gagal sync massal"),
    });
  }}>
  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Sync ke Chatwoot
</Button>
```
> Replace `filteredCustomers` with the page's actual filtered array variable. Place the button where other header/toolbar actions live. If a row-selection set is readily available, prefer syncing selected ids over all-filtered; otherwise all-filtered (capped 200) is fine for this cut. Import `RefreshCw` + `useSyncBulkContacts` + `useChatwootStatus` as needed.

- [ ] **Step 4: Verify** `npm run typecheck && npm run build` → 0 errors, build ok.

- [ ] **Step 5: Commit**
```bash
git add client/components/chatwoot/ChatwootSyncButton.tsx client/pages/CustomersPage.tsx
git commit -m "feat(chatwoot): ChatwootSyncButton (per-customer) + bulk sync action in /customers"
```

---

## Task 7: Verification + smoke

- [ ] **Step 1: Full suite** (run yourself; do NOT trust subagent typecheck claims):
`npm run typecheck && npx tsx --test shared/*.test.ts server/*.test.ts && npm run build`
Expected: 0 errors · all tests pass (incl. `chatwootContact`) · build ok.

- [ ] **Step 2: Manual smoke (staging, real Chatwoot)**
1. Customer detail → "Sync ke Chatwoot" → contact appears in Chatwoot with name, `+62` phone, email, `identifier`=customerId, custom_attributes, labels; button → "Sync ulang"; `chatwoot_contact_id` persisted.
2. Re-sync same customer → updates, NO duplicate.
3. Bulk "Sync ke Chatwoot" over a filtered list → toast "N sukses, M gagal"; spot-check contacts.
4. Customer with no phone/email → still creates by identifier; no crash.
5. Other mitra's customer id → 404. Role without `chatwoot` write → 403.
6. Verify create-response id path + labels body against live Chatwoot; if shape differs, fix ONLY in `upsertChatwootContact`.

- [ ] **Step 3: Commit any smoke fixes**
```bash
git add -A && git commit -m "fix(chatwoot): contact-sync smoke adjustments"
```

---

## Self-review notes
- **Spec coverage:** §1 schema → T1; §2 builders → T2; §3 backend → T3; §4 routes → T4; §5 frontend → T5,T6; §6 security (write-gate, tenant-scoped, audit, cap) → T4; §7 testing → T2,T7. Covered.
- **Type consistency:** `buildChatwootContactPayload`/`buildChatwootContactLabels` signatures match between T2 (def), T3 (injected), T4 (passed). `updateCustomerChatwootLink(id, contactId:string, syncedAt:string)` consistent T1↔T4.
- **Deferred:** scheduled/real-time sync, inbound pull, contact delete/merge, agent sync.
- **Verify-before-use:** startup-ALTER helper name, customers list query key, filtered-array variable name in CustomersPage, toast lib, Button props, Chatwoot create/labels response shapes.
