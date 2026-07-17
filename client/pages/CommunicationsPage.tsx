import { useState } from "react";
import { MessageSquare } from "lucide-react";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
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
      {/* Desktop: 3 panel (inbox | daftar | thread). Mobile: drill-down satu panel. */}
      <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(260px,320px)_1fr] gap-3 md:h-[calc(100dvh-12rem)]">
        <Card className="hidden md:block overflow-y-auto">
          <CardContent className="p-2">
            <InboxSelector inboxes={inboxes} value={inboxId} onChange={(v) => { setInboxId(v); setActiveConv(null); }} />
          </CardContent>
        </Card>
        <Card className={`overflow-y-auto ${activeConv != null ? "hidden md:block" : ""}`}>
          <CardContent className="p-2">
            <div className="md:hidden mb-2">
              <InboxSelector inboxes={inboxes} value={inboxId} onChange={(v) => { setInboxId(v); setActiveConv(null); }} />
            </div>
            <ConversationList conversations={conversations} isLoading={isLoading} activeId={activeConv} onSelect={setActiveConv} />
          </CardContent>
        </Card>
        <Card className={`overflow-hidden flex flex-col ${activeConv == null ? "hidden md:flex" : ""}`}>
          <CardContent className="p-3 flex-1 overflow-y-auto">
            <button type="button" className="md:hidden text-xs text-muted-foreground mb-2" onClick={() => setActiveConv(null)}>← Kembali</button>
            <ConversationThread conversationId={activeConv} conversation={conversations.find((c) => c.id === activeConv)} />
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
