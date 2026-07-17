/** Pure mappers: raw Chatwoot NBI payloads → stable Workspace DTOs. No I/O — testable.
 *  Chatwoot shapes vary by version; access defensively. */

export type Inbox = { id: number; name: string; channelType: string | null };
export type CannedResponse = { id: number; shortCode: string; content: string };
export type ConversationSummary = {
  id: number; inboxId: number | null; status: string;
  lastMessage: string | null; lastActivityAt: string | null;
  assigneeName: string | null; assigneeId: number | null; contactName: string | null; unread: number;
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

export function mapCannedResponse(raw: any): CannedResponse {
  return { id: Number(raw?.id), shortCode: String(raw?.short_code ?? ""), content: String(raw?.content ?? "") };
}

export function mapMessage(raw: any): ChatMessage {
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
    assigneeId: raw?.meta?.assignee?.id != null ? Number(raw.meta.assignee.id) : null,
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
