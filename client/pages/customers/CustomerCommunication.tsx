import { useState } from "react";
import { useCustomerConversations } from "@/hooks/useChatwoot";
import { ConversationList } from "@/components/chatwoot/ConversationList";
import { ConversationThread } from "@/components/chatwoot/ConversationThread";
import { ChatwootContactCard } from "@/components/chatwoot/ChatwootContactCard";

export function CustomerCommunication({ customerId }: { customerId: number }) {
  const { data, isLoading } = useCustomerConversations(customerId);
  const [active, setActive] = useState<number | null>(null);

  if (!isLoading && data && data.contactId == null) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Belum ada kontak Chatwoot untuk pelanggan ini.</p>;
  }
  return (
    <section aria-label="Komunikasi" className="space-y-2 pt-2">
      {data?.contactId != null && <ChatwootContactCard contactName={data.contactName} />}
      {active == null ? (
        <ConversationList conversations={data?.conversations ?? []} isLoading={isLoading} onSelect={setActive} />
      ) : (
        <>
          <button type="button" className="text-xs text-muted-foreground" onClick={() => setActive(null)}>← Daftar percakapan</button>
          <div className="max-h-80 overflow-y-auto"><ConversationThread conversationId={active} conversation={data?.conversations?.find((c) => c.id === active)} /></div>
        </>
      )}
    </section>
  );
}
