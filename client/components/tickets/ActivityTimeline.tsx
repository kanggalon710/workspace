/**
 * v4.2.18 (B.1): ActivityTimeline — vertical timeline of ticket events
 * Fetches paginated dari /api/tickets/:id/activities
 *
 * Filter chip: All / Stages / Comments / Edits / Photos / Status
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatRelative, formatDate } from "@/lib/dateFormat";
import { cn } from "@/lib/utils";
import {
  Activity, Plus, Edit3, MessageSquare, Camera, Tag, Users,
  ArrowRight, Loader2, CheckCircle2, AlertCircle, RefreshCw, Clock,
  Pause, ChevronRight, ChevronDown,
} from "lucide-react";

interface ActivityRow {
  id: number;
  ticketId: number;
  userId: number;
  type: string;
  content: string | null;
  payloadJson: string | null;
  ip: string | null;
  userAgent: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  createdAt: string;
  actorName: string | null;
  actorRole: string | null;
}

const FILTER_GROUPS: Record<string, { label: string; types: string[] }> = {
  all: { label: "All", types: [] },
  stages: { label: "Stages", types: ["stage.completed", "stage.started", "stage_advance"] },
  edits: { label: "Edits", types: ["stage.edited", "stage_edit"] },
  comments: { label: "Comments", types: ["comment.added"] },
  photos: { label: "Photos", types: ["attachment.uploaded"] },
  status: { label: "Status", types: ["status.changed", "status_change", "ticket.created", "auto_created"] },
  team: { label: "Team", types: ["ticket.assigned", "team.added", "team.removed", "assigned"] },
};

function getIconAndColor(type: string): { Icon: any; color: string; bg: string } {
  if (type.startsWith("stage.completed") || type === "stage_advance") return { Icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-100" };
  if (type.startsWith("stage.edited") || type === "stage_edit") return { Icon: Edit3, color: "text-amber-700", bg: "bg-amber-100" };
  if (type === "comment.added") return { Icon: MessageSquare, color: "text-sky-700", bg: "bg-sky-100" };
  if (type === "attachment.uploaded") return { Icon: Camera, color: "text-purple-700", bg: "bg-purple-100" };
  if (type === "ticket.assigned" || type === "team.added" || type === "assigned") return { Icon: Users, color: "text-indigo-700", bg: "bg-indigo-100" };
  if (type === "team.removed") return { Icon: Users, color: "text-rose-700", bg: "bg-rose-100" };
  if (type === "ticket.created" || type === "auto_created") return { Icon: Plus, color: "text-blue-700", bg: "bg-blue-100" };
  if (type === "status.changed" || type === "status_change") return { Icon: ArrowRight, color: "text-orange-700", bg: "bg-orange-100" };
  if (type === "ticket.held") return { Icon: Pause, color: "text-zinc-700", bg: "bg-zinc-100" };
  if (type === "ticket.escalated") return { Icon: AlertCircle, color: "text-rose-700", bg: "bg-rose-100" };
  return { Icon: Activity, color: "text-slate-700", bg: "bg-slate-100" };
}

function describe(a: ActivityRow): string {
  // Try parse payloadJson for richer description
  let payload: any = null;
  try { payload = a.payloadJson ? JSON.parse(a.payloadJson) : null; } catch {}

  switch (a.type) {
    case "ticket.created":
      return payload?.ticketNumber ? `Tiket ${payload.ticketNumber} dibuat` : "Tiket dibuat";
    case "auto_created":
      return a.content || "Auto-created dari alarm";
    case "ticket.assigned":
    case "assigned":
      if (payload?.assignedTo && payload.role === "lead") return `Lead di-assign ke user #${payload.assignedTo}`;
      return a.content || "Ditugaskan";
    case "team.added":
      return `Tim: user #${payload?.userId ?? "?"} ditambahkan sebagai ${payload?.role ?? "member"}`;
    case "team.removed":
      return `Tim: user #${payload?.userId ?? "?"} (${payload?.role ?? "member"}) dikeluarkan`;
    case "status.changed":
    case "status_change":
      if (payload?.from && payload?.to) return `Status: ${payload.from} → ${payload.to}`;
      return a.content || "Status berubah";
    case "stage.completed":
    case "stage_advance":
      return payload?.toStage ? `Stage selesai → ${payload.toStage}` : (a.content || "Stage advance");
    case "stage.edited":
    case "stage_edit":
      return a.content || "Stage data di-edit";
    case "comment.added":
      return a.content || "Komentar ditambahkan";
    case "attachment.uploaded":
      return a.content || "File diunggah";
    case "ticket.held":
      return payload?.reason ? `Tiket di-hold: ${payload.reason}` : "Tiket di-hold";
    case "ticket.escalated":
      return a.content || "Tiket di-escalate ke supervisor";
    case "ticket.priority_changed":
      return payload?.from && payload?.to ? `Prioritas: ${payload.from} → ${payload.to}` : "Prioritas diubah";
    default:
      return a.content || a.type;
  }
}

export function ActivityTimeline({ ticketId }: { ticketId: number }) {
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const filterTypes = FILTER_GROUPS[filter]?.types ?? [];
  const queryParams = filterTypes.length > 0 ? `&types=${filterTypes.join(",")}` : "";
  const { data, isLoading } = useQuery<{ items: ActivityRow[]; total: number }>({
    queryKey: ["ticket-activities", ticketId, filter],
    queryFn: () => api.get(`/tickets/${ticketId}/activities?limit=100${queryParams}`),
    enabled: !!ticketId,
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];

  function toggleExpand(id: number) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2 flex-wrap">
        <Activity className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Activity Timeline</span>
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{data?.total ?? 0}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 flex-wrap">
          {Object.entries(FILTER_GROUPS).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                "text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded transition-colors",
                filter === k
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border hover:bg-muted",
              )}
            >{v.label}</button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
          <span className="text-xs">Memuat aktivitas...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-xs text-muted-foreground">
          Belum ada aktivitas {filter !== "all" ? `(filter: ${FILTER_GROUPS[filter].label})` : ""}
        </div>
      ) : (
        <div className="divide-y">
          {items.map((a, idx) => {
            const { Icon, color, bg } = getIconAndColor(a.type);
            const desc = describe(a);
            const isExpanded = expanded.has(a.id);
            const hasDetail = !!a.payloadJson || !!a.ip;
            return (
              <div key={a.id} className="px-4 py-2.5 flex gap-3 hover:bg-muted/20 transition-colors">
                {/* Vertical line + dot */}
                <div className="relative flex flex-col items-center shrink-0">
                  <div className={cn("h-7 w-7 rounded-full grid place-items-center z-10", bg)}>
                    <Icon className={cn("w-3.5 h-3.5", color)} />
                  </div>
                  {idx < items.length - 1 && (
                    <div className="absolute top-7 bottom-[-12px] w-px bg-border" />
                  )}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug">{desc}</p>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                        <span className="font-medium">{a.actorName ?? `User #${a.userId}`}</span>
                        <span>·</span>
                        <span title={formatDate(a.createdAt)}>{formatRelative(a.createdAt)}</span>
                        {a.gpsLat != null && a.gpsLng != null && (
                          <span className="text-[10px] font-mono opacity-60" title={`${a.gpsLat}, ${a.gpsLng}`}>· </span>
                        )}
                      </div>
                    </div>
                    {hasDetail && (
                      <button
                        onClick={() => toggleExpand(a.id)}
                        className="text-[10px] text-muted-foreground hover:text-foreground p-0.5"
                        title="Detail"
                      >
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="mt-2 p-2 rounded bg-muted/40 text-[11px] font-mono space-y-1">
                      {a.payloadJson && (
                        <div className="break-all">
                          <span className="text-muted-foreground">payload:</span> {a.payloadJson}
                        </div>
                      )}
                      {a.ip && <div className="text-muted-foreground">IP: <span className="text-foreground">{a.ip}</span></div>}
                      {a.userAgent && <div className="text-muted-foreground truncate">UA: <span className="text-foreground" title={a.userAgent}>{a.userAgent.slice(0, 60)}</span></div>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
