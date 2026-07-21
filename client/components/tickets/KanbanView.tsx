// v4.2.18 (F.1): Kanban View - tiket dikelompokkan per status.
import { useMemo } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import type { Ticket, TicketCategory } from "./shared";

export function KanbanView({ tickets, categoryMap }: {
  tickets: Ticket[];
  categoryMap: Map<number, TicketCategory>;
}) {
  const columns = [
    { key: "open",        label: "Open",        color: "bg-blue-50 border-blue-200",   accent: "bg-blue-500" },
    { key: "in_progress", label: "Dikerjakan",  color: "bg-orange-50 border-orange-200", accent: "bg-orange-500" },
    { key: "pending",     label: "Pending/Hold", color: "bg-amber-50 border-amber-200", accent: "bg-amber-500" },
    { key: "resolved",    label: "Resolved",    color: "bg-emerald-50 border-emerald-200", accent: "bg-emerald-500" },
  ];

  const grouped = useMemo(() => {
    const map: Record<string, Ticket[]> = { open: [], in_progress: [], pending: [], resolved: [] };
    for (const t of tickets) {
      const s = t.status ?? "open";
      const key = s === "assigned" ? "open" :
                  s === "on_hold" ? "pending" :
                  s === "closed" ? "resolved" : s;
      if (map[key]) map[key].push(t);
    }
    return map;
  }, [tickets]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3">
      {columns.map(col => {
        const items = grouped[col.key] ?? [];
        return (
          <div key={col.key} className={cn("rounded-lg border-2 p-2", col.color)}>
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2">
                <div className={cn("h-2 w-2 rounded-full", col.accent)} />
                <span className="text-xs font-bold uppercase tracking-wider">{col.label}</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border">{items.length}</span>
            </div>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {items.length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic text-center py-4">Kosong</div>
              ) : items.map(t => {
                const cat = t.categoryId ? categoryMap.get(t.categoryId) : null;
                return (
                  <Link
                    key={t.id}
                    href={`/work/${t.id}`}
                    className="block rounded-md bg-white border px-2.5 py-2 hover:shadow-md transition shadow-sm"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-mono text-muted-foreground">{t.ticketNumber}</span>
                      {t.priority === "urgent" && <span className="text-[9px] font-bold px-1 rounded bg-rose-100 text-rose-700">URG</span>}
                      {t.priority === "high" && <span className="text-[9px] font-bold px-1 rounded bg-amber-100 text-amber-700">HIGH</span>}
                    </div>
                    <div className="text-xs font-semibold leading-snug line-clamp-2">{t.title}</div>
                    {t.customerName && (
                      <div className="text-[10px] text-muted-foreground mt-1 truncate">{t.customerName}</div>
                    )}
                    {cat && (
                      <div className="flex items-center gap-1 mt-1">
                        <div className="h-1.5 w-1.5 rounded-full" style={{ background: cat.color ?? "#475569" }} />
                        <span className="text-[10px] text-muted-foreground">{cat.name}</span>
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
