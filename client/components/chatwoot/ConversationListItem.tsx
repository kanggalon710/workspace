import type { ConversationSummary } from "@/lib/chatwoot";
import { ConversationStatusBadge } from "./ConversationStatusBadge";

export function ConversationListItem({ c, active, onClick }: {
  c: ConversationSummary;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors hover:bg-accent ${active ? "bg-accent" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.contactName || `#${c.id}`}</span>
        <ConversationStatusBadge status={c.status} />
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{c.lastMessage || "-"}</span>
        {c.unread > 0 && (
          <span className="shrink-0 text-[10px] font-bold rounded-full bg-primary text-primary-foreground px-1.5 py-0.5">
            {c.unread}
          </span>
        )}
      </div>
      {c.assigneeName && (
        <span className="text-[10px] text-muted-foreground">Agen: {c.assigneeName}</span>
      )}
    </button>
  );
}
