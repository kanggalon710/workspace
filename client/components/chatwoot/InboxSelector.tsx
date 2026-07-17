import type { Inbox } from "@/lib/chatwoot";

export function InboxSelector({ inboxes, value, onChange }: {
  inboxes: Inbox[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  return (
    <nav aria-label="Inbox" className="space-y-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-accent ${value == null ? "bg-accent font-medium" : ""}`}
      >
        Semua Inbox
      </button>
      {inboxes.map((ibx) => (
        <button
          key={ibx.id}
          type="button"
          onClick={() => onChange(ibx.id)}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-accent ${value === ibx.id ? "bg-accent font-medium" : ""}`}
        >
          {ibx.name}
        </button>
      ))}
    </nav>
  );
}
