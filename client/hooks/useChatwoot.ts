import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatwootApi, type ChatwootStatus, type AgentMapData } from "@/lib/chatwoot";

/** Lightweight Chatwoot status for badges + Open-in-Chatwoot button. retry:0 so a 403 (no perm) hides quietly. */
export function useChatwootStatus() {
  return useQuery<ChatwootStatus>({
    queryKey: ["chatwoot-status"],
    queryFn: () => chatwootApi.getStatus(),
    staleTime: 60_000,
    retry: 0,
  });
}

export function useChatwootInboxes() {
  return useQuery({ queryKey: ["chatwoot-inboxes"], queryFn: () => chatwootApi.listInboxes(), staleTime: 300_000, retry: 0 });
}

/** Canned responses untuk slash-command "/" di composer. retry:0 supaya 403/Chatwoot-mati hide diam. */
export function useChatwootCannedResponses(enabled = true) {
  return useQuery({ queryKey: ["chatwoot-canned-responses"], queryFn: () => chatwootApi.listCannedResponses(), staleTime: 300_000, retry: 0, enabled });
}

export function useChatwootConversations(params: { inboxId?: number; status?: string; page?: number }) {
  return useQuery({ queryKey: ["chatwoot-conversations", params], queryFn: () => chatwootApi.listConversations(params), refetchInterval: 20_000, retry: 0 });
}

export function useChatwootMessages(conversationId: number | null) {
  return useQuery({ queryKey: ["chatwoot-messages", conversationId], queryFn: () => chatwootApi.getConversationMessages(conversationId as number), enabled: conversationId != null, refetchInterval: 10_000, retry: 0 });
}

export function useCustomerConversations(customerId: number | null) {
  return useQuery({ queryKey: ["chatwoot-customer-conversations", customerId], queryFn: () => chatwootApi.getCustomerConversations(customerId as number), enabled: customerId != null, retry: 0 });
}

export function useSyncCustomerContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (customerId: number) => chatwootApi.syncCustomerContact(customerId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); },
  });
}

export function useSyncBulkContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (customerIds: number[]) => chatwootApi.syncBulkContacts(customerIds),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customers"] }); },
  });
}

export function useChatwootAgents(enabled = true) {
  return useQuery<AgentMapData>({ queryKey: ["chatwoot-agents"], queryFn: () => chatwootApi.listAgents(), staleTime: 60_000, retry: 0, enabled });
}

export function useSetUserAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, agentId }: { userId: number; agentId: string }) => chatwootApi.setUserAgent(userId, agentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatwoot-agents"] }),
  });
}

export function useClearUserAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => chatwootApi.clearUserAgent(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatwoot-agents"] }),
  });
}

/** Kirim balasan ke conversation (outgoing atau private note).
 *  Optimistic insert: pesan langsung tampil (temp id), rollback bila gagal, refetch saat selesai. */
export function useSendChatwootMessage(conversationId: number | null) {
  const qc = useQueryClient();
  const key = ["chatwoot-messages", conversationId];
  return useMutation({
    mutationFn: ({ content, isPrivate }: { content: string; isPrivate: boolean }) =>
      chatwootApi.sendMessage(conversationId as number, content, isPrivate),
    onMutate: async ({ content, isPrivate }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<{ messages: any[]; hasMore: boolean }>(key);
      const optimistic = {
        id: -Date.now(), content,
        type: isPrivate ? "private" : "outgoing",
        senderName: "Anda", createdAt: new Date().toISOString(), attachments: [],
      };
      qc.setQueryData<{ messages: any[]; hasMore: boolean }>(key, (old) =>
        old ? { ...old, messages: [...old.messages, optimistic] } : { messages: [optimistic], hasMore: false });
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** Kirim balasan dengan lampiran (tanpa optimistic — refetch setelah sukses). */
export function useSendChatwootAttachment(conversationId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ content, isPrivate, attachments }: { content: string; isPrivate: boolean; attachments: { dataUrl: string; filename: string }[] }) =>
      chatwootApi.sendMessageWithAttachments(conversationId as number, content, isPrivate, attachments),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatwoot-messages", conversationId] }),
  });
}

/** Invalidate daftar conversation (list + per-pelanggan) setelah status/assign berubah. */
function invalidateConversationLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["chatwoot-conversations"] });
  qc.invalidateQueries({ queryKey: ["chatwoot-customer-conversations"] });
}

export function useSetConversationStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, status }: { conversationId: number; status: "open" | "pending" | "resolved" }) =>
      chatwootApi.setConversationStatus(conversationId, status),
    onSuccess: () => invalidateConversationLists(qc),
  });
}

export function useAssignConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, assigneeId }: { conversationId: number; assigneeId: number | null }) =>
      chatwootApi.assignConversation(conversationId, assigneeId),
    onSuccess: () => invalidateConversationLists(qc),
  });
}
