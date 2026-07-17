import type { ConversationSummary } from "@/lib/chatwoot";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonList } from "@/components/ui/skeleton";
import { MessageSquare } from "lucide-react";
import { ConversationListItem } from "./ConversationListItem";

export function ConversationList({ conversations, isLoading, activeId, onSelect }: {
  conversations: ConversationSummary[];
  isLoading?: boolean;
  activeId?: number | null;
  onSelect: (id: number) => void;
}) {
  if (isLoading) return <SkeletonList count={6} />;
  if (!conversations.length) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Belum ada percakapan"
        description="Tidak ada percakapan untuk filter ini."
      />
    );
  }
  return (
    <nav aria-label="Daftar percakapan" className="space-y-1">
      {conversations.map((c) => (
        <ConversationListItem
          key={c.id}
          c={c}
          active={activeId === c.id}
          onClick={() => onSelect(c.id)}
        />
      ))}
    </nav>
  );
}
