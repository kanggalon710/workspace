import { api } from "@/lib/api";
// DRY: DTO shapes are owned by the server-side pure modules — re-export, don't redeclare.
import type { Inbox, ConversationSummary, ChatMessage, CannedResponse } from "@shared/chatwootMappers";
import type { ChatwootAgent } from "@shared/chatwootAgent";

export type { Inbox, ConversationSummary, ChatMessage, CannedResponse, ChatwootAgent };

export type ChatwootStatus = {
  enabled: boolean;
  configured: boolean;
  baseUrl: string | null;
  accountId: number | null;
};

export type ConversationsPage = { conversations: ConversationSummary[]; meta: { count: number; currentPage: number } };

export type CustomerConversations = { contactId: number | null; contactName: string | null; conversations: ConversationSummary[] };

export type AgentMapData = {
  agents: ChatwootAgent[];
  links: { userId: number; chatwootAgentId: string; agentName: string | null }[];
  suggestions: { userId: number; agentId: number }[];
};

export const chatwootApi = {
  getStatus: () => api.get<ChatwootStatus>("/integrations/chatwoot/status"),
  listInboxes: () => api.get<{ inboxes: Inbox[] }>("/integrations/chatwoot/inboxes"),
  listCannedResponses: () => api.get<{ cannedResponses: CannedResponse[] }>("/integrations/chatwoot/canned-responses"),
  listConversations: (p: { inboxId?: number; status?: string; page?: number }) => {
    const q = new URLSearchParams();
    if (p.inboxId != null) q.set("inboxId", String(p.inboxId));
    if (p.status) q.set("status", p.status);
    if (p.page != null) q.set("page", String(p.page));
    const qs = q.toString();
    return api.get<ConversationsPage>(`/integrations/chatwoot/conversations${qs ? `?${qs}` : ""}`);
  },
  getConversationMessages: (id: number, before?: number) =>
    api.get<{ messages: ChatMessage[]; hasMore: boolean }>(`/integrations/chatwoot/conversations/${id}/messages${before ? `?before=${before}` : ""}`),
  getCustomerConversations: (customerId: number) =>
    api.get<CustomerConversations>(`/integrations/chatwoot/customers/${customerId}/conversations`),
  syncCustomerContact: (customerId: number) =>
    api.post<{ contactId: number; action: "created" | "updated" }>(`/integrations/chatwoot/customers/${customerId}/sync`, {}),
  syncBulkContacts: (customerIds: number[]) =>
    api.post<{ results: { customerId: number; ok: boolean; contactId?: number; action?: string; error?: string }[]; synced: number; failed: number }>(`/integrations/chatwoot/contacts/sync-bulk`, { customerIds }),
  sendMessage: (conversationId: number, content: string, isPrivate: boolean) =>
    api.post<{ ok: boolean }>(`/integrations/chatwoot/conversations/${conversationId}/messages`, { content, private: isPrivate }),
  sendMessageWithAttachments: (conversationId: number, content: string, isPrivate: boolean, attachments: { dataUrl: string; filename: string }[]) =>
    api.post<{ ok: boolean }>(`/integrations/chatwoot/conversations/${conversationId}/messages-attachment`, { content, private: isPrivate, attachments }),
  setConversationStatus: (conversationId: number, status: "open" | "pending" | "resolved") =>
    api.post<{ ok: boolean }>(`/integrations/chatwoot/conversations/${conversationId}/status`, { status }),
  assignConversation: (conversationId: number, assigneeId: number | null) =>
    api.post<{ ok: boolean }>(`/integrations/chatwoot/conversations/${conversationId}/assign`, { assigneeId }),
  listAgents: () => api.get<AgentMapData>("/integrations/chatwoot/agents"),
  setUserAgent: (userId: number, agentId: string) => api.put<{ ok: boolean }>(`/integrations/chatwoot/users/${userId}/agent`, { agentId }),
  clearUserAgent: (userId: number) => api.delete<{ ok: boolean }>(`/integrations/chatwoot/users/${userId}/agent`),
};
