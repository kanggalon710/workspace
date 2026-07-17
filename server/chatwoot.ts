/**
 * Chatwoot Integration Adapter (v4.2.5)
 *
 * Bidirectional integration:
 * - Inbound:  Chatwoot webhook → JABNET (auto-create tiket dari conversation)
 * - Outbound: JABNET tiket events → Chatwoot (notify CS agent saat tiket selesai)
 *
 * Setup:
 * 1. Di Chatwoot: Settings → Integrations → Webhooks → Add new
 *    URL: https://fiber-tools.arkanova.id/api/integrations/chatwoot/webhook
 *    Events: conversation_created, message_created
 * 2. Copy webhook secret yang Chatwoot generate
 * 3. Di JABNET: Integrations → Chatwoot → paste config (URL, account_id, api_token, webhook secret)
 *
 * Customer linking:
 * - Match Chatwoot contact.phone_number ke JABNET customers.phone (multi-format normalization)
 * - Kalau ngga match, tiket tetap dibuat dengan customerId=null (admin handle manual)
 *
 * References:
 * - https://www.chatwoot.com/docs/product/others/webhook-events
 * - https://developers.chatwoot.com/api-reference/conversations/update-custom-attributes
 */

import crypto from "crypto";
import { storage } from "./storage.js";

// ── Type definitions ──────────────────────────────────────────────────────

interface ChatwootContact {
  id: number;
  name: string;
  phone_number?: string | null;
  email?: string | null;
}

interface ChatwootConversation {
  id: number;
  account_id?: number;
  inbox_id?: number;
  status?: string;
  contact?: ChatwootContact;
  meta?: { sender?: ChatwootContact };
  messages?: Array<{ content?: string; message_type?: number | string }>;
}

export interface ChatwootWebhookEvent {
  event: string;                      // conversation_created | message_created | conversation_status_changed
  account?: { id: number; name: string };
  inbox?: { id: number; name: string };
  contact?: ChatwootContact;
  conversation?: ChatwootConversation;
  // For message_created
  id?: number;                        // message id
  content?: string;
  message_type?: string | number;     // "incoming" | "outgoing" | 0 | 1
  conversation_id?: number;
  sender?: ChatwootContact;
  // Other
  [key: string]: any;
}

// ── HMAC verification (optional, recommended) ─────────────────────────────

/**
 * Verify webhook signature dari Chatwoot.
 * Header: X-Chatwoot-Webhook-Signature (atau "x-chatwoot-signature")
 * Hash: HMAC-SHA256(rawBody, secret)
 */
export function verifyWebhookSignature(rawBody: string, signature: string | undefined, secret: string | null | undefined): boolean {
  if (!secret) return true;  // skip verification kalau secret belum di-set
  if (!signature) return false;
  try {
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

// ── Outbound API client ───────────────────────────────────────────────────

async function chatwootRequest(path: string, options: { method?: string; body?: any } = {}): Promise<any> {
  const config = await storage.getChatwootConfig();
  if (!config?.enabled || !config.baseUrl || !config.accountId || !config.apiAccessToken) {
    throw new Error("Chatwoot belum terkonfigurasi");
  }
  const url = `${config.baseUrl.replace(/\/$/, "")}/api/v1/accounts/${config.accountId}${path}`;
  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      "api_access_token": config.apiAccessToken,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chatwoot API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Update custom attributes pada Chatwoot conversation.
 * Dipakai untuk link ke JABNET ticket — agent CS bisa klik link langsung dari Chatwoot.
 */
export async function setConversationCustomAttributes(conversationId: string | number, attributes: Record<string, any>): Promise<void> {
  await chatwootRequest(`/conversations/${conversationId}/custom_attributes`, {
    method: "POST",
    body: { custom_attributes: attributes },
  });
}

/**
 * Send message ke Chatwoot conversation (outgoing dari JABNET → customer atau private note).
 * @param messageType "outgoing" untuk reply ke customer, "private" untuk note internal CS only.
 */
export async function sendChatwootMessage(
  conversationId: string | number,
  content: string,
  messageType: "outgoing" | "incoming" = "outgoing",
  isPrivate = false,
): Promise<any> {
  return chatwootRequest(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { content, message_type: messageType, private: isPrivate },
  });
}

/**
 * Test koneksi — coba GET account info.
 */
export async function testChatwootConnection(): Promise<{ success: boolean; account?: any; error?: string }> {
  try {
    const result = await chatwootRequest(""); // GET /accounts/{id}
    return { success: true, account: result };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// ── Read APIs for the Communications view (Batch 2a) ───────────────────────

/** List inboxes for the active mitra's account. */
export async function listInboxes(): Promise<any[]> {
  const res = await chatwootRequest("/inboxes");
  return Array.isArray(res?.payload) ? res.payload : [];
}

/** List canned responses for the active mitra's account.
 *  Chatwoot mengembalikan array telanjang (bukan {payload}); tangani keduanya. */
export async function listCannedResponses(): Promise<any[]> {
  const res = await chatwootRequest("/canned_responses");
  if (Array.isArray(res)) return res;
  return Array.isArray(res?.payload) ? res.payload : [];
}

/** List conversations (optionally filtered). Returns the raw page ({ data: { meta, payload } }). */
export async function listConversations(params: { inboxId?: number; status?: string; page?: number } = {}): Promise<any> {
  const q = new URLSearchParams();
  if (params.inboxId != null) q.set("inbox_id", String(params.inboxId));
  if (params.status) q.set("status", params.status);
  q.set("page", String(params.page ?? 1));
  return chatwootRequest(`/conversations?${q.toString()}`);
}

/** Messages of a conversation (optionally paginated by `before` message id). */
export async function listConversationMessages(conversationId: number | string, before?: number): Promise<any[]> {
  const q = before ? `?before=${before}` : "";
  const res = await chatwootRequest(`/conversations/${conversationId}/messages${q}`);
  return Array.isArray(res?.payload) ? res.payload : [];
}

/** Find a contact by phone (normalized). Returns the best EXACT normalized phone_number match or null. */
export async function searchContactByPhone(phone: string, normalize: (p: string) => string): Promise<any | null> {
  const target = normalize(phone);
  if (!target) return null;
  const res = await chatwootRequest(`/contacts/search?q=${encodeURIComponent(phone)}`);
  const hits: any[] = Array.isArray(res?.payload) ? res.payload : [];
  return hits.find((c) => c?.phone_number && normalize(String(c.phone_number)) === target) ?? null;
}

/** Conversations belonging to a contact. Chatwoot may return { payload: [...] } or a bare array. */
export async function listContactConversations(contactId: number | string): Promise<any[]> {
  const res = await chatwootRequest(`/contacts/${contactId}/conversations`);
  return Array.isArray(res?.payload) ? res.payload : (Array.isArray(res) ? res : []);
}

// ── Contact sync (Batch 2b) ────────────────────────────────────────────────

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

  try {
    const labels = opts.buildLabels(customer, { tenant: opts.tenant });
    if (labels.length) await chatwootRequest(`/contacts/${contactId}/labels`, { method: "POST", body: { labels } });
  } catch (e: any) {
    console.warn("[chatwoot] set labels gagal (diabaikan):", e.message);
  }

  return { contactId, action };
}

// ── Inbound webhook handler ────────────────────────────────────────────────

/**
 * Handle conversation_created event.
 * Auto-create ticket kalau:
 *   1. Auto-create-on-keyword toggle ON
 *   2. Latest incoming message match keyword rule
 * Customer di-match by phone.
 */
export async function handleConversationCreated(event: ChatwootWebhookEvent): Promise<{ ticketId?: number; reason: string }> {
  const config = await storage.getChatwootConfig();
  if (!config?.enabled) return { reason: "Chatwoot integration disabled" };

  const conv = event.conversation ?? (event as any);
  const conversationId = String(conv.id ?? event.id);
  const contact = conv.contact ?? conv.meta?.sender ?? event.contact;

  // Cek kalau sudah ada link (idempotent — webhook bisa double-fire)
  const existing = await storage.getChatwootLinkByConversation(conversationId);
  if (existing) return { ticketId: existing.ticketId, reason: "already linked" };

  // Cari customer by phone
  const phone = contact?.phone_number;
  let customerId: number | null = null;
  if (phone) {
    const customer = await storage.findCustomerByPhone(phone);
    if (customer) customerId = customer.id;
  }

  // Match keyword dari latest message (kalau auto-create on)
  const messages = conv.messages ?? [];
  const incomingTexts = messages.filter((m: any) => m.message_type === "incoming" || m.message_type === 0).map((m: any) => m.content ?? "").filter(Boolean);
  const fullText = incomingTexts.join(" ");

  let categoryId: number | null = config.defaultCategoryId ?? null;
  let priority = "medium";
  let matchedRule = null;

  if (config.autoCreateOnKeyword && fullText) {
    matchedRule = await storage.matchChatwootKeywordRule(fullText);
    if (matchedRule) {
      categoryId = matchedRule.categoryId;
      priority = matchedRule.priority ?? "medium";
    } else if (!categoryId) {
      // Ngga match keyword + ngga ada default category → skip auto-create
      return { reason: "no keyword match + no default category" };
    }
  } else if (!categoryId) {
    return { reason: "auto-create disabled + no default category" };
  }

  // Build ticket title dari first 80 chars of message
  const title = (fullText || `Chat dari ${contact?.name ?? "customer"}`).slice(0, 80).trim();
  const description = fullText.slice(0, 500);

  // Create ticket — pakai admin user (ID 1) sebagai createdBy
  const adminUser = await storage.getUserByUsername?.("admin");
  const createdBy = (adminUser as any)?.id ?? 1;

  const ticketNumber = await storage.getNextTicketNumber();
  const ticket = await storage.createTicket({
    ticketNumber,
    categoryId: categoryId ?? undefined,
    customerId: customerId ?? undefined,
    title,
    description: description ? `[Chatwoot] ${description}` : null,
    priority,
    status: "open",
    createdBy,
  } as any);

  // Save link
  await storage.createChatwootTicketLink({
    ticketId: ticket.id,
    conversationId,
    contactId: contact?.id ? String(contact.id) : undefined,
    inboxId: event.inbox?.id ? String(event.inbox.id) : undefined,
  });

  // Update Chatwoot conversation custom_attributes (best-effort)
  try {
    await setConversationCustomAttributes(conversationId, {
      jabnet_ticket_id: ticket.ticketNumber,
      jabnet_ticket_url: `/tickets#${ticket.id}`,
      jabnet_ticket_status: "open",
      jabnet_customer_matched: customerId ? "yes" : "no",
    });
  } catch (e: any) {
    console.warn("[Chatwoot] set custom_attributes failed:", e.message);
  }

  console.log(`[Chatwoot] auto-created ticket #${ticket.ticketNumber} from conversation ${conversationId} (customer ${customerId ?? "unmatched"}, rule: ${matchedRule?.keyword?.split(",")[0] ?? "default"})`);

  return { ticketId: ticket.id, reason: matchedRule ? `keyword: ${matchedRule.keyword.split(",")[0]}` : "default category" };
}

/**
 * Handle message_created event.
 * Cuma update existing ticket — append message ke notes/activity (kalau conversation sudah linked).
 */
export async function handleMessageCreated(event: ChatwootWebhookEvent): Promise<{ ticketId?: number; reason: string }> {
  const config = await storage.getChatwootConfig();
  if (!config?.enabled) return { reason: "disabled" };

  const conversationId = String(event.conversation_id ?? event.conversation?.id ?? "");
  if (!conversationId) return { reason: "no conversation_id" };

  // Skip outgoing messages dari JABNET (kita yang send) supaya ga loop
  const isIncoming = event.message_type === "incoming" || event.message_type === 0;
  if (!isIncoming) return { reason: "outgoing message, skipped" };

  const link = await storage.getChatwootLinkByConversation(conversationId);
  if (!link) return { reason: "conversation not linked" };

  // Append sebagai activity
  const content = event.content || "";
  if (!content.trim()) return { reason: "empty message" };

  const adminUser = await storage.getUserByUsername?.("admin");
  const userId = (adminUser as any)?.id ?? 1;

  await storage.createTicketActivity({
    ticketId: link.ticketId,
    userId,
    type: "chatwoot_message",
    content: `[Chatwoot] ${content.slice(0, 500)}`,
    createdAt: new Date().toISOString(),
  } as any);

  return { ticketId: link.ticketId, reason: "message appended to activity" };
}

/**
 * Notifier: kirim ke Chatwoot saat tiket di-resolve.
 * Dipanggil dari ticket resolve flow (lihat backend route checkpoint complete).
 */
export async function notifyChatwootTicketResolved(ticketId: number): Promise<void> {
  const config = await storage.getChatwootConfig();
  if (!config?.enabled || !config.autoNotifyOnResolve) return;

  const link = await storage.getChatwootLinkByTicket(ticketId);
  if (!link) return;  // ticket bukan dari Chatwoot

  const ticket = await storage.getTicket(ticketId);
  if (!ticket) return;

  try {
    // Update custom_attributes
    await setConversationCustomAttributes(link.conversationId, {
      jabnet_ticket_status: "resolved",
      jabnet_resolved_at: ticket.resolvedAt ?? new Date().toISOString(),
    });

    // Send message ke conversation (private note ke CS, biar bisa relay manual ke customer)
    const message = `✓ Tiket #${ticket.ticketNumber} sudah selesai dikerjakan.\nResolusi: ${ticket.resolution ?? "(tidak ada catatan)"}\n\nMohon konfirmasi ke pelanggan apakah masalah sudah teratasi.`;
    await sendChatwootMessage(link.conversationId, message, "outgoing", true); // private=true (CS only)
  } catch (e: any) {
    console.warn("[Chatwoot] notify resolved failed:", e.message);
  }
}

/**
 * Notifier: kirim update ke Chatwoot saat ada checkpoint penting (depart, arrive, complete).
 * Dipanggil dari checkpoint flow.
 */
export async function notifyChatwootCheckpoint(ticketId: number, action: string, byUserName?: string): Promise<void> {
  const config = await storage.getChatwootConfig();
  if (!config?.enabled) return;

  const link = await storage.getChatwootLinkByTicket(ticketId);
  if (!link) return;

  // Hanya notify untuk action penting yang customer-facing
  const importantActions: Record<string, string> = {
    depart:   "🚗 Teknisi sedang otw ke lokasi",
    arrive:   "📍 Teknisi sudah sampai di lokasi",
    complete: "✅ Pengerjaan selesai",
  };
  if (!importantActions[action]) return;

  const ticket = await storage.getTicket(ticketId);
  if (!ticket) return;

  try {
    const msg = `${importantActions[action]} (Tiket #${ticket.ticketNumber}${byUserName ? ` · ${byUserName}` : ""})`;
    // Private note — biar CS yang relay ke customer (atau setting: kirim langsung ke customer)
    await sendChatwootMessage(link.conversationId, msg, "outgoing", true);
  } catch (e: any) {
    console.warn(`[Chatwoot] notify ${action} failed:`, e.message);
  }
}

/** List agents of the active mitra's account. Chatwoot returns a bare array (or {payload}). */
export async function listAgents(): Promise<any[]> {
  const res = await chatwootRequest("/agents");
  return Array.isArray(res) ? res : (Array.isArray(res?.payload) ? res.payload : []);
}

/** Kirim pesan dengan lampiran (Batch 2f) via multipart/form-data ke Chatwoot. */
export async function sendChatwootMessageMultipart(
  conversationId: number | string,
  content: string,
  isPrivate: boolean,
  files: { buffer: Buffer; filename: string; contentType: string }[],
): Promise<any> {
  const config = await storage.getChatwootConfig();
  if (!config?.enabled || !config.baseUrl || !config.accountId || !config.apiAccessToken) {
    throw new Error("Chatwoot belum terkonfigurasi");
  }
  const url = `${config.baseUrl.replace(/\/$/, "")}/api/v1/accounts/${config.accountId}/conversations/${conversationId}/messages`;
  const fd = new FormData();
  if (content) fd.append("content", content);
  fd.append("message_type", "outgoing");
  fd.append("private", String(isPrivate));
  for (const f of files) {
    fd.append("attachments[]", new Blob([new Uint8Array(f.buffer)], { type: f.contentType }), f.filename);
  }
  // Jangan set Content-Type manual — biar fetch menetapkan boundary multipart.
  const res = await fetch(url, { method: "POST", headers: { api_access_token: config.apiAccessToken }, body: fd });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chatwoot API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

/** Ubah status conversation (Batch 2e). */
export async function setConversationStatus(conversationId: number | string, status: "open" | "pending" | "resolved"): Promise<any> {
  return chatwootRequest(`/conversations/${conversationId}/toggle_status`, { method: "POST", body: { status } });
}

/** Assign/unassign agent ke conversation (assigneeId null/0 = unassign). */
export async function assignConversation(conversationId: number | string, assigneeId: number | null): Promise<any> {
  return chatwootRequest(`/conversations/${conversationId}/assignments`, { method: "POST", body: { assignee_id: assigneeId ?? 0 } });
}
