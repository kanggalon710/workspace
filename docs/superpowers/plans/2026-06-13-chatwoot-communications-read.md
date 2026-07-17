# Chatwoot Communications (Read) — Batch 2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read Chatwoot conversations inside Workspace — a `/communications` page (inbox → conversations → thread) and a "Komunikasi" section in the customer-detail dialog — read-only, tenant-isolated.

**Architecture:** Reuse the existing per-mitra `chatwootRequest` (account-scoped token) in `server/chatwoot.ts`. Raw Chatwoot payloads are normalized by a pure, tested `shared/chatwootMappers.ts`. Four read endpoints gated by the `chatwoot` permission feed TanStack-Query hooks (polling, pause-on-blur) and reusable components shared by the page and the customer section. No new DB tables.

**Tech Stack:** Express 5 + Drizzle (MySQL) · React 18 + TanStack Query + Wouter + shadcn/ui · `node:test` via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-06-13-chatwoot-communications-read-design.md`

**Branch:** Work on `dev`. Do not push/deploy.

**Conventions confirmed:**
- `chatwootRequest(path, {method, body})` is a **module-private** helper in `server/chatwoot.ts` (account-scoped). New client functions live in that file and use it.
- Client API: `api.get<T>("/integrations/...")` (the `/api` prefix is added by the wrapper).
- `@shared` alias → `./shared`.
- Route: `<Route path="/communications">{() => <WithPerm permission="chatwoot"><CommunicationsPage /></WithPerm>}</Route>` + `const CommunicationsPage = lazy(() => import("@/pages/CommunicationsPage"))`.
- Sidebar item shape: `{ label, path, icon, permission }` inside a group's `items`.
- Verify UI-primitive prop names (`StatusBadge`, `Card`, `Button`, `EmptyState`, skeletons) against an existing usage before relying on them — they vary; grep and match.

---

## Task 1: Pure payload mappers `shared/chatwootMappers.ts`

**Files:** Create `shared/chatwootMappers.ts` + `shared/chatwootMappers.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// shared/chatwootMappers.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapInbox, mapConversation, mapMessage, mapConversationsPage } from "./chatwootMappers.js";

test("mapInbox", () => {
  assert.deepEqual(mapInbox({ id: 1, name: "WhatsApp", channel_type: "Channel::Whatsapp" }),
    { id: 1, name: "WhatsApp", channelType: "Channel::Whatsapp" });
});

test("mapMessage decodes message_type int + private", () => {
  assert.equal(mapMessage({ id: 5, content: "hai", message_type: 0, created_at: 1700000000, sender: { name: "Budi" } }).type, "incoming");
  assert.equal(mapMessage({ id: 6, content: "balas", message_type: 1, created_at: 1700000000 }).type, "outgoing");
  assert.equal(mapMessage({ id: 7, content: "x", message_type: 2 }).type, "activity");
  assert.equal(mapMessage({ id: 8, content: "note", message_type: 1, private: true }).type, "private");
});

test("mapMessage created_at epoch-seconds → ISO; tolerates missing", () => {
  const m = mapMessage({ id: 9, content: null, message_type: 0, created_at: 1700000000 });
  assert.equal(m.createdAt, new Date(1700000000 * 1000).toISOString());
  assert.equal(mapMessage({ id: 10, message_type: 0 }).createdAt, null);
});

test("mapConversation pulls last message + assignee + contact", () => {
  const c = mapConversation({
    id: 42, inbox_id: 1, status: "open",
    messages: [{ content: "halo", created_at: 1700000000 }],
    last_non_activity_message: { content: "halo terakhir" },
    meta: { assignee: { name: "CS Sari" }, sender: { name: "Budi" } },
    unread_count: 2,
    timestamp: 1700000500,
  });
  assert.equal(c.id, 42);
  assert.equal(c.inboxId, 1);
  assert.equal(c.status, "open");
  assert.equal(c.lastMessage, "halo terakhir");
  assert.equal(c.assigneeName, "CS Sari");
  assert.equal(c.contactName, "Budi");
  assert.equal(c.unread, 2);
});

test("mapConversationsPage reads data.payload + data.meta", () => {
  const page = mapConversationsPage({ data: { meta: { all_count: 3, current_page: "1" }, payload: [{ id: 1, status: "open" }, { id: 2, status: "resolved" }] } });
  assert.equal(page.conversations.length, 2);
  assert.equal(page.meta.count, 3);
  assert.equal(page.meta.currentPage, 1);
});
```

- [ ] **Step 2: Run test, verify FAIL**

Run: `npx tsx --test shared/chatwootMappers.test.ts`  → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// shared/chatwootMappers.ts
/** Pure mappers: raw Chatwoot NBI payloads → stable Workspace DTOs. No I/O — testable.
 *  Chatwoot shapes vary by version; access defensively. */

export type Inbox = { id: number; name: string; channelType: string | null };
export type ConversationSummary = {
  id: number; inboxId: number | null; status: string;
  lastMessage: string | null; lastActivityAt: string | null;
  assigneeName: string | null; contactName: string | null; unread: number;
};
export type ChatMessage = {
  id: number; content: string | null;
  type: "incoming" | "outgoing" | "private" | "activity";
  senderName: string | null; createdAt: string | null;
  attachments: { url: string; type: string }[];
};

/** Chatwoot timestamps are epoch SECONDS (sometimes ISO strings). → ISO or null. */
function toIso(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return new Date(v * 1000).toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function mapInbox(raw: any): Inbox {
  return { id: Number(raw?.id), name: String(raw?.name ?? ""), channelType: raw?.channel_type ?? null };
}

export function mapMessage(raw: any): ChatMessage {
  // message_type: 0 incoming, 1 outgoing, 2 activity, 3 template
  let type: ChatMessage["type"];
  if (raw?.private === true) type = "private";
  else if (raw?.message_type === 0) type = "incoming";
  else if (raw?.message_type === 1) type = "outgoing";
  else type = "activity";
  const atts = Array.isArray(raw?.attachments)
    ? raw.attachments.map((a: any) => ({ url: String(a?.data_url ?? a?.thumb_url ?? ""), type: String(a?.file_type ?? "file") }))
    : [];
  return {
    id: Number(raw?.id),
    content: raw?.content ?? null,
    type,
    senderName: raw?.sender?.name ?? null,
    createdAt: toIso(raw?.created_at),
    attachments: atts,
  };
}

export function mapConversation(raw: any): ConversationSummary {
  const lastMsg =
    raw?.last_non_activity_message?.content ??
    (Array.isArray(raw?.messages) && raw.messages.length ? raw.messages[raw.messages.length - 1]?.content : null) ??
    null;
  return {
    id: Number(raw?.id),
    inboxId: raw?.inbox_id != null ? Number(raw.inbox_id) : null,
    status: String(raw?.status ?? "open"),
    lastMessage: lastMsg,
    lastActivityAt: toIso(raw?.timestamp ?? raw?.last_activity_at),
    assigneeName: raw?.meta?.assignee?.name ?? null,
    contactName: raw?.meta?.sender?.name ?? null,
    unread: Number(raw?.unread_count ?? 0),
  };
}

export function mapConversationsPage(raw: any): { conversations: ConversationSummary[]; meta: { count: number; currentPage: number } } {
  const data = raw?.data ?? raw;
  const payload = Array.isArray(data?.payload) ? data.payload : [];
  return {
    conversations: payload.map(mapConversation),
    meta: { count: Number(data?.meta?.all_count ?? payload.length), currentPage: Number(data?.meta?.current_page ?? 1) },
  };
}
```

- [ ] **Step 4: Run test, verify PASS** (5 tests). Run: `npx tsx --test shared/chatwootMappers.test.ts`

- [ ] **Step 5: Commit**

```bash
git add shared/chatwootMappers.ts shared/chatwootMappers.test.ts
git commit -m "feat(chatwoot): pure payload→DTO mappers for communications (shared)"
```

---

## Task 2: Backend client functions in `server/chatwoot.ts`

**Files:** Modify `server/chatwoot.ts` (add exported read functions; reuse the existing private `chatwootRequest`). No unit test (network; mappers are tested separately).

- [ ] **Step 1: Add functions** (append near the other exported functions, after `sendChatwootMessage`):

```ts
// ── Read APIs for the Communications view (Batch 2a) ───────────────────────

/** List inboxes for the active mitra's account. */
export async function listInboxes(): Promise<any[]> {
  const res = await chatwootRequest("/inboxes");
  return Array.isArray(res?.payload) ? res.payload : [];
}

/** List conversations (optionally filtered). Returns the raw page ({ data: { meta, payload } }). */
export async function listConversations(params: { inboxId?: number; status?: string; page?: number } = {}): Promise<any> {
  const q = new URLSearchParams();
  if (params.inboxId) q.set("inbox_id", String(params.inboxId));
  if (params.status) q.set("status", params.status);
  q.set("page", String(params.page ?? 1));
  return chatwootRequest(`/conversations?${q.toString()}`);
}

/** Messages of a conversation (paginated by `before` message id, descending then we reverse client-side). */
export async function listConversationMessages(conversationId: number | string, before?: number): Promise<any[]> {
  const q = before ? `?before=${before}` : "";
  const res = await chatwootRequest(`/conversations/${conversationId}/messages${q}`);
  return Array.isArray(res?.payload) ? res.payload : [];
}

/** Find a contact by phone (normalized). Returns the best exact phone_number match or null. */
export async function searchContactByPhone(phone: string, normalize: (p: string) => string): Promise<any | null> {
  const target = normalize(phone);
  if (!target) return null;
  const res = await chatwootRequest(`/contacts/search?q=${encodeURIComponent(phone)}`);
  const hits: any[] = Array.isArray(res?.payload) ? res.payload : [];
  // exact normalized match only — avoid showing another customer's chats
  return hits.find((c) => c?.phone_number && normalize(String(c.phone_number)) === target) ?? null;
}

/** Conversations belonging to a contact. */
export async function listContactConversations(contactId: number | string): Promise<any[]> {
  const res = await chatwootRequest(`/contacts/${contactId}/conversations`);
  // Chatwoot returns { payload: [...] } here
  return Array.isArray(res?.payload) ? res.payload : (Array.isArray(res) ? res : []);
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck` → 0 errors.

- [ ] **Step 3: Commit**

```bash
git add server/chatwoot.ts
git commit -m "feat(chatwoot): read client fns (inboxes, conversations, messages, contact-by-phone)"
```

> Risk to verify at runtime: contact-conversations endpoint may return `{payload}` or a bare array — handled both ways above. Conversation list path/params confirmed during smoke (Task 8).

---

## Task 3: Backend read endpoints in `server/routes.ts`

**Files:** Modify `server/routes.ts` — add 4 routes near the existing chatwoot routes (after the `/status` route). All gated by `chatwoot` (read).

- [ ] **Step 1: Add the routes**

Find the block with `router.get("/api/integrations/chatwoot/status", ...)` and add AFTER it:

```ts
/** Communications (read) — Batch 2a. All gated by `chatwoot` (read), tenant-scoped via account token. */
router.get("/api/integrations/chatwoot/inboxes", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot")) return sendError(res, "Akses ditolak", 403);
  try {
    const { listInboxes } = await import("./chatwoot.js");
    const { mapInbox } = await import("../shared/chatwootMappers.js");
    const inboxes = (await listInboxes()).map(mapInbox);
    sendSuccess(res, { inboxes });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendSuccess(res, { inboxes: [] });
    sendError(res, e.message, 500);
  }
});

router.get("/api/integrations/chatwoot/conversations", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot")) return sendError(res, "Akses ditolak", 403);
  try {
    const { listConversations } = await import("./chatwoot.js");
    const { mapConversationsPage } = await import("../shared/chatwootMappers.js");
    const inboxId = req.query.inboxId ? Number(req.query.inboxId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const raw = await listConversations({ inboxId, status, page });
    sendSuccess(res, mapConversationsPage(raw));
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendSuccess(res, { conversations: [], meta: { count: 0, currentPage: 1 } });
    sendError(res, e.message, 500);
  }
});

router.get("/api/integrations/chatwoot/conversations/:id/messages", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot")) return sendError(res, "Akses ditolak", 403);
  try {
    const { listConversationMessages } = await import("./chatwoot.js");
    const { mapMessage } = await import("../shared/chatwootMappers.js");
    const before = req.query.before ? Number(req.query.before) : undefined;
    const raw = await listConversationMessages(req.params.id, before);
    const messages = raw.map(mapMessage).sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    sendSuccess(res, { messages, hasMore: raw.length >= 20 });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendSuccess(res, { messages: [], hasMore: false });
    sendError(res, e.message, 500);
  }
});

router.get("/api/integrations/chatwoot/customers/:id/conversations", async (req: Request, res: Response) => {
  if (!req.authUser) return sendError(res, "Unauthorized", 401);
  if (!hasPermission(req, "chatwoot")) return sendError(res, "Akses ditolak", 403);
  try {
    const customer = await storage.getCustomer(Number(req.params.id)); // tenant-scoped
    if (!customer) return sendError(res, "Pelanggan tidak ditemukan", 404);
    if (!customer.phone) return sendSuccess(res, { contactId: null, contactName: null, conversations: [] });
    const { searchContactByPhone, listContactConversations } = await import("./chatwoot.js");
    const { toWhatsappNumber } = await import("../shared/phone.js");
    const { mapConversation } = await import("../shared/chatwootMappers.js");
    const contact = await searchContactByPhone(customer.phone, toWhatsappNumber);
    if (!contact) return sendSuccess(res, { contactId: null, contactName: null, conversations: [] });
    const convs = (await listContactConversations(contact.id)).map(mapConversation);
    sendSuccess(res, { contactId: Number(contact.id), contactName: contact.name ?? null, conversations: convs });
  } catch (e: any) {
    if (String(e.message).includes("belum terkonfigurasi")) return sendSuccess(res, { contactId: null, contactName: null, conversations: [] });
    sendError(res, e.message, 500);
  }
});
```

> Before writing: confirm the storage method for a single tenant-scoped customer. Run `grep -n "async getCustomer\b\|getCustomerById" server/storage.ts`. If it's named differently (e.g. `getCustomerById`), use that name. Confirm `customer.phone` is the field (snake/camel: Drizzle returns `phone`). Confirm `toWhatsappNumber` is exported from `shared/phone.ts` (it is).

- [ ] **Step 2: Verify**

Run: `npm run typecheck` → 0 errors.

- [ ] **Step 3: Commit**

```bash
git add server/routes.ts
git commit -m "feat(chatwoot): read endpoints (inboxes, conversations, messages, customer convos)"
```

---

## Task 4: Client API wrappers + hooks

**Files:** Modify `client/lib/chatwoot.ts` and `client/hooks/useChatwoot.ts`.

- [ ] **Step 1: Extend `client/lib/chatwoot.ts`**

Add types + wrappers (keep the existing `chatwootApi.getStatus`):

```ts
export type Inbox = { id: number; name: string; channelType: string | null };
export type ConversationSummary = {
  id: number; inboxId: number | null; status: string;
  lastMessage: string | null; lastActivityAt: string | null;
  assigneeName: string | null; contactName: string | null; unread: number;
};
export type ChatMessage = {
  id: number; content: string | null;
  type: "incoming" | "outgoing" | "private" | "activity";
  senderName: string | null; createdAt: string | null;
  attachments: { url: string; type: string }[];
};

// add these to the chatwootApi object:
//   listInboxes: () => api.get<{ inboxes: Inbox[] }>("/integrations/chatwoot/inboxes"),
//   listConversations: (p: { inboxId?: number; status?: string; page?: number }) =>
//     api.get<{ conversations: ConversationSummary[]; meta: { count: number; currentPage: number } }>(
//       `/integrations/chatwoot/conversations?${new URLSearchParams(
//         Object.entries({ inboxId: p.inboxId, status: p.status, page: p.page })
//           .filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
//       ).toString()}`),
//   getConversationMessages: (id: number, before?: number) =>
//     api.get<{ messages: ChatMessage[]; hasMore: boolean }>(`/integrations/chatwoot/conversations/${id}/messages${before ? `?before=${before}` : ""}`),
//   getCustomerConversations: (customerId: number) =>
//     api.get<{ contactId: number | null; contactName: string | null; conversations: ConversationSummary[] }>(`/integrations/chatwoot/customers/${customerId}/conversations`),
```

Implement those as real properties on the exported `chatwootApi` object (uncomment/translate the commented block into actual object methods).

- [ ] **Step 2: Extend `client/hooks/useChatwoot.ts`**

```ts
import { useQuery } from "@tanstack/react-query";
import { chatwootApi } from "@/lib/chatwoot";

export function useChatwootInboxes() {
  return useQuery({ queryKey: ["chatwoot-inboxes"], queryFn: () => chatwootApi.listInboxes(), staleTime: 300_000, retry: 0 });
}
export function useChatwootConversations(params: { inboxId?: number; status?: string; page?: number }) {
  return useQuery({
    queryKey: ["chatwoot-conversations", params],
    queryFn: () => chatwootApi.listConversations(params),
    refetchInterval: 20_000, retry: 0,
  });
}
export function useChatwootMessages(conversationId: number | null) {
  return useQuery({
    queryKey: ["chatwoot-messages", conversationId],
    queryFn: () => chatwootApi.getConversationMessages(conversationId as number),
    enabled: conversationId != null,
    refetchInterval: 10_000, retry: 0,
  });
}
export function useCustomerConversations(customerId: number | null) {
  return useQuery({
    queryKey: ["chatwoot-customer-conversations", customerId],
    queryFn: () => chatwootApi.getCustomerConversations(customerId as number),
    enabled: customerId != null, retry: 0,
  });
}
```

(Keep the existing `useChatwootStatus`.)

- [ ] **Step 3: Verify** `npm run typecheck` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add client/lib/chatwoot.ts client/hooks/useChatwoot.ts
git commit -m "feat(chatwoot): client wrappers + polling hooks for communications"
```

---

## Task 5: Reusable components

**Files:** Create under `client/components/chatwoot/`:
`ConversationStatusBadge.tsx`, `ConversationListItem.tsx`, `ConversationList.tsx`, `ConversationThread.tsx`, `ChatwootContactCard.tsx`, `InboxSelector.tsx`.

> Verify `StatusBadge`, `Card`, `EmptyState`, skeleton component import paths + prop names against existing usages before relying on them (grep). Use the repo's `dateFormat` helper for relative times if present (`grep -rn "formatRelative" client/lib`).

- [ ] **Step 1: `ConversationStatusBadge.tsx`**

```tsx
import { StatusBadge } from "@/components/ui/status-badge";

const MAP: Record<string, { variant: "success" | "warning" | "danger" | "info" | "neutral" | "pending"; label: string }> = {
  open: { variant: "success", label: "Terbuka" },
  resolved: { variant: "neutral", label: "Selesai" },
  pending: { variant: "warning", label: "Pending" },
  snoozed: { variant: "info", label: "Snooze" },
};
export function ConversationStatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { variant: "neutral" as const, label: status };
  return <StatusBadge variant={m.variant} label={m.label} size="sm" appearance="subtle" />;
}
```

- [ ] **Step 2: `ConversationListItem.tsx`**

```tsx
import type { ConversationSummary } from "@/lib/chatwoot";
import { ConversationStatusBadge } from "./ConversationStatusBadge";

export function ConversationListItem({ c, active, onClick }: { c: ConversationSummary; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors hover:bg-accent ${active ? "bg-accent" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">{c.contactName || `#${c.id}`}</span>
        <ConversationStatusBadge status={c.status} />
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="text-xs text-muted-foreground truncate">{c.lastMessage || "—"}</span>
        {c.unread > 0 && <span className="text-2xs font-bold rounded-full bg-primary text-primary-foreground px-1.5 py-0.5">{c.unread}</span>}
      </div>
      {c.assigneeName && <span className="text-2xs text-muted-foreground">Agen: {c.assigneeName}</span>}
    </button>
  );
}
```

- [ ] **Step 3: `ConversationList.tsx`**

```tsx
import type { ConversationSummary } from "@/lib/chatwoot";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { MessageSquare } from "lucide-react";
import { ConversationListItem } from "./ConversationListItem";

export function ConversationList({ conversations, isLoading, activeId, onSelect }: {
  conversations: ConversationSummary[]; isLoading?: boolean; activeId?: number | null; onSelect: (id: number) => void;
}) {
  if (isLoading) return <SkeletonList count={6} />;
  if (!conversations.length) return <EmptyState icon={MessageSquare} title="Belum ada percakapan" description="Tidak ada percakapan untuk filter ini." />;
  return (
    <nav aria-label="Daftar percakapan" className="space-y-1">
      {conversations.map((c) => (
        <ConversationListItem key={c.id} c={c} active={activeId === c.id} onClick={() => onSelect(c.id)} />
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: `ConversationThread.tsx`**

```tsx
import { useChatwootMessages } from "@/hooks/useChatwoot";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare } from "lucide-react";

export function ConversationThread({ conversationId }: { conversationId: number | null }) {
  const { data, isLoading } = useChatwootMessages(conversationId);
  if (conversationId == null) return <EmptyState icon={MessageSquare} title="Pilih percakapan" description="Pilih percakapan untuk melihat pesan." />;
  if (isLoading) return <SkeletonList count={5} />;
  const messages = data?.messages ?? [];
  if (!messages.length) return <EmptyState icon={MessageSquare} title="Belum ada pesan" />;
  return (
    <section aria-label="Thread pesan" className="space-y-2 overflow-y-auto">
      {messages.map((m) => {
        const mine = m.type === "outgoing" || m.type === "private";
        if (m.type === "activity") {
          return <div key={m.id} className="text-center text-2xs text-muted-foreground py-1">{m.content}</div>;
        }
        return (
          <article key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
              m.type === "private" ? "bg-warning/15 text-foreground border border-warning/30"
              : mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
              {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
              {m.attachments.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="block text-xs underline mt-1">Lampiran ({a.type})</a>
              ))}
              <div className="text-2xs opacity-70 mt-1">{m.senderName ?? ""}{m.createdAt ? ` · ${new Date(m.createdAt).toLocaleString("id-ID")}` : ""}</div>
            </div>
          </article>
        );
      })}
    </section>
  );
}
```

- [ ] **Step 5: `ChatwootContactCard.tsx`**

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { OpenInChatwootButton } from "./OpenInChatwootButton";

export function ChatwootContactCard({ contactName, lastActivityAt }: { contactName: string | null; lastActivityAt?: string | null }) {
  return (
    <Card variant="flat">
      <CardContent className="p-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{contactName || "Kontak Chatwoot"}</p>
          {lastActivityAt && <p className="text-2xs text-muted-foreground">Interaksi terakhir: {new Date(lastActivityAt).toLocaleString("id-ID")}</p>}
        </div>
        <OpenInChatwootButton target="contacts" size="xs" />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: `InboxSelector.tsx`**

```tsx
import type { Inbox } from "@/lib/chatwoot";

export function InboxSelector({ inboxes, value, onChange }: { inboxes: Inbox[]; value: number | null; onChange: (id: number | null) => void }) {
  return (
    <nav aria-label="Inbox" className="space-y-1">
      <button type="button" onClick={() => onChange(null)}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-accent ${value == null ? "bg-accent font-medium" : ""}`}>Semua Inbox</button>
      {inboxes.map((ibx) => (
        <button key={ibx.id} type="button" onClick={() => onChange(ibx.id)}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-accent ${value === ibx.id ? "bg-accent font-medium" : ""}`}>
          {ibx.name}
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 7: Verify** `npm run typecheck` → 0 errors. Fix any UI-primitive prop mismatches (StatusBadge variants/size, EmptyState props, Card variant, SkeletonList count) to match the real components.

- [ ] **Step 8: Commit**

```bash
git add client/components/chatwoot/
git commit -m "feat(chatwoot): reusable conversation/thread/inbox/contact components"
```

---

## Task 6: `/communications` page + route + sidebar

**Files:** Create `client/pages/CommunicationsPage.tsx`; modify `client/App.tsx`, `client/components/layout/Sidebar.tsx`.

- [ ] **Step 1: Page**

```tsx
// client/pages/CommunicationsPage.tsx
import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { useChatwootInboxes, useChatwootConversations } from "@/hooks/useChatwoot";
import { InboxSelector } from "@/components/chatwoot/InboxSelector";
import { ConversationList } from "@/components/chatwoot/ConversationList";
import { ConversationThread } from "@/components/chatwoot/ConversationThread";

export default function CommunicationsPage() {
  const [inboxId, setInboxId] = useState<number | null>(null);
  const [activeConv, setActiveConv] = useState<number | null>(null);
  const { data: inboxData } = useChatwootInboxes();
  const { data: convData, isLoading } = useChatwootConversations({ inboxId: inboxId ?? undefined });
  const inboxes = inboxData?.inboxes ?? [];
  const conversations = convData?.conversations ?? [];

  return (
    <PageContainer>
      <PageHeader icon={MessageSquare} title="Komunikasi" description="Percakapan Chatwoot" accent="info" />
      {/* Desktop: 3-pane; mobile: drill-down */}
      <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(260px,320px)_1fr] gap-3 md:h-[calc(100dvh-12rem)]">
        <Card className="hidden md:block overflow-y-auto"><CardContent className="p-2"><InboxSelector inboxes={inboxes} value={inboxId} onChange={(v) => { setInboxId(v); setActiveConv(null); }} /></CardContent></Card>
        <Card className={`overflow-y-auto ${activeConv != null ? "hidden md:block" : ""}`}>
          <CardContent className="p-2">
            <div className="md:hidden mb-2"><InboxSelector inboxes={inboxes} value={inboxId} onChange={(v) => { setInboxId(v); setActiveConv(null); }} /></div>
            <ConversationList conversations={conversations} isLoading={isLoading} activeId={activeConv} onSelect={setActiveConv} />
          </CardContent>
        </Card>
        <Card className={`overflow-hidden flex flex-col ${activeConv == null ? "hidden md:flex" : ""}`}>
          <CardContent className="p-3 flex-1 overflow-y-auto">
            <button type="button" className="md:hidden text-xs text-muted-foreground mb-2" onClick={() => setActiveConv(null)}>← Kembali</button>
            <ConversationThread conversationId={activeConv} />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
```

> Verify `PageContainer`/`PageHeader`/`Card` import paths + props against an existing page. Adjust layout classes to match the repo's full-bleed/mobile conventions if needed.

- [ ] **Step 2: Lazy route in `client/App.tsx`**

Add near the other `lazy(...)` imports:
```tsx
const CommunicationsPage = lazy(() => import("@/pages/CommunicationsPage"));
```
Add the route alongside the others:
```tsx
<Route path="/communications">{() => <WithPerm permission="chatwoot"><CommunicationsPage /></WithPerm>}</Route>
```

- [ ] **Step 3: Sidebar entry in `client/components/layout/Sidebar.tsx`**

Add to a suitable group's `items` array (e.g. an "Operations"/"Tools" group, or create alongside customers). Match the existing item shape:
```tsx
{ label: "Komunikasi", path: "/communications", icon: MessageSquare, permission: "chatwoot" },
```
Ensure `MessageSquare` is imported from `lucide-react` in Sidebar.tsx (add to the import if missing).

- [ ] **Step 4: Verify** `npm run typecheck && npm run build` → 0 errors, build ok.

- [ ] **Step 5: Commit**

```bash
git add client/pages/CommunicationsPage.tsx client/App.tsx client/components/layout/Sidebar.tsx
git commit -m "feat(chatwoot): /communications page (inbox/list/thread, responsive) + route + sidebar"
```

---

## Task 7: Customer-detail "Komunikasi" section

**Files:** Modify `client/pages/CustomersPage.tsx`.

- [ ] **Step 1: Add the section to the customer detail dialog**

Imports (top):
```tsx
import { useCustomerConversations } from "@/hooks/useChatwoot";
import { ConversationList } from "@/components/chatwoot/ConversationList";
import { ConversationThread } from "@/components/chatwoot/ConversationThread";
import { ChatwootContactCard } from "@/components/chatwoot/ChatwootContactCard";
```

Inside the customer detail dialog body (the dialog opened by `detailCustomer`, where `OpenInChatwootButton` was already added in its header), add a `<section>` that renders the customer's conversations. Create a small inline subcomponent at the bottom of the file to keep hook usage clean:

```tsx
function CustomerCommunication({ customerId }: { customerId: number }) {
  const { data, isLoading } = useCustomerConversations(customerId);
  const [active, setActive] = useState<number | null>(null);
  if (!isLoading && data && data.contactId == null) {
    return <p className="text-xs text-muted-foreground">Belum ada kontak Chatwoot untuk pelanggan ini.</p>;
  }
  return (
    <section aria-label="Komunikasi" className="space-y-2">
      {data?.contactId != null && <ChatwootContactCard contactName={data.contactName} />}
      {active == null ? (
        <ConversationList conversations={data?.conversations ?? []} isLoading={isLoading} onSelect={setActive} />
      ) : (
        <>
          <button type="button" className="text-xs text-muted-foreground" onClick={() => setActive(null)}>← Daftar percakapan</button>
          <div className="max-h-80 overflow-y-auto"><ConversationThread conversationId={active} /></div>
        </>
      )}
    </section>
  );
}
```

Then, in the detail dialog JSX (a sensible spot below the main customer info, gated so it only shows when Chatwoot is usable — reuse `useChatwootStatus`), render:
```tsx
{detailCustomer && <ChatwootCommBlock customerId={detailCustomer.id} />}
```
where `ChatwootCommBlock` wraps the status check:
```tsx
function ChatwootCommBlock({ customerId }: { customerId: number }) {
  const { data: status } = useChatwootStatus(); // import from "@/hooks/useChatwoot"
  if (!status?.enabled || !status.configured) return null;
  return (
    <div className="border-t pt-3 mt-3">
      <h3 className="text-sm font-semibold mb-2">Komunikasi</h3>
      <CustomerCommunication customerId={customerId} />
    </div>
  );
}
```

> Find the exact field for the customer id on `detailCustomer` (likely `.id`). Place `<ChatwootCommBlock>` inside the detail dialog content, below existing sections. Add `useChatwootStatus` + `useState` imports if not present.

- [ ] **Step 2: Verify** `npm run typecheck && npm run build` → 0 errors, build ok.

- [ ] **Step 3: Commit**

```bash
git add client/pages/CustomersPage.tsx
git commit -m "feat(chatwoot): Komunikasi section in customer detail (conversations + thread)"
```

---

## Task 8: Verification + smoke

- [ ] **Step 1: Full suite**

Run: `npm run typecheck && npx tsx --test shared/*.test.ts server/*.test.ts && npm run build`
Expected: 0 type errors · all tests pass (incl. `chatwootMappers`) · build ok.

- [ ] **Step 2: Manual smoke (staging, real Chatwoot)**

1. Sidebar shows "Komunikasi" for a role with `chatwoot`; hidden for a role without it.
2. `/communications`: inboxes load → "Semua" + each inbox; pick a conversation → thread renders, bubbles correct (incoming left, outgoing right, private styled, activity centered); polling refreshes.
3. Mobile (≤sm): drill-down inbox → list → thread with back buttons; one pane at a time.
4. Customer detail dialog → "Komunikasi": customer WITH a Chatwoot contact (by phone) shows conversations; click → thread. Customer WITHOUT a contact → "Belum ada kontak Chatwoot…".
5. **Isolation:** switch mitra → only that account's inboxes/conversations appear.
6. **Permission:** role without `chatwoot` → 403 on the endpoints + no sidebar/route.
7. If any Chatwoot payload field is wrong (timestamps, message_type, last message), fix ONLY in `shared/chatwootMappers.ts` and re-run its test.

- [ ] **Step 3: Commit any smoke fixes**

```bash
git add -A && git commit -m "fix(chatwoot): communications smoke-test adjustments"
```

---

## Self-review notes

- **Spec coverage:** §1a client fns → T2; §1b endpoints → T3; §1c mappers → T1; §2a wrappers/hooks → T4; §2b components → T5; §2c page → T6; §2d customer section → T7; §3 testing → T1,T8. All covered.
- **Type consistency:** `ConversationSummary`/`ChatMessage`/`Inbox` defined identically in `shared/chatwootMappers.ts` (T1) and re-declared in `client/lib/chatwoot.ts` (T4) — keep fields in sync (client mirrors server DTO).
- **Deferred:** reply-from-Workspace, contact/agent sync, websockets, assign/resolve.
- **Verify-before-use flagged** for: `storage.getCustomer` name, UI-primitive props (StatusBadge/Card/EmptyState/Skeleton/PageHeader), Chatwoot API payload shapes (isolated to the tested mapper), `detailCustomer` id field + dialog insertion point.
