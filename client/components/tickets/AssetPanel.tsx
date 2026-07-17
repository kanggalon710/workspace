/**
 * v4.2.18 (B.3): Asset Panel — ODP info di sidebar /work/:id
 * - ODP info (ID, name, district)
 * - Total ports + utilization
 * - Tiket aktif di ODP yang sama (drill ke heatmap)
 * - Repeat issue indicator (kalau ≥3 tiket dalam 30 hari)
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Server, AlertTriangle, MapPin, ExternalLink, Loader2, Zap } from "lucide-react";

interface OdpActiveData {
  activeTickets: Array<{
    id: number; ticketNumber: string; title: string;
    status: string | null; createdAt: string | null;
  }>;
  resolutionPatterns: Array<{
    ticketNumber: string; title: string; resolution: string | null; resolvedAt: string | null;
  }>;
}

export function AssetPanel({ odpId, currentTicketId }: { odpId: number; currentTicketId?: number }) {
  const { data: odp } = useQuery<{ id: number; name: string; totalPorts: number; district: string | null; address?: string | null }>({
    queryKey: ["odp-detail", odpId],
    queryFn: () => api.get(`/odps/${odpId}`),
    enabled: !!odpId,
  });

  const { data: active } = useQuery<OdpActiveData>({
    queryKey: ["odp-active-tickets", odpId],
    queryFn: () => api.get(`/odps/${odpId}/active-tickets`),
    enabled: !!odpId,
  });

  if (!odp) {
    return (
      <div className="rounded-lg border bg-card p-4 flex items-center justify-center min-h-[80px] text-xs text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading ODP...
      </div>
    );
  }

  const otherActive = (active?.activeTickets ?? []).filter(t => t.id !== currentTicketId);
  const isRepeatIssue = otherActive.length >= 2; // 2+ tiket aktif lain = pattern issue

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
        <Server className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Aset Jaringan</span>
        {isRepeatIssue && (
          <span className="ml-auto inline-flex items-center gap-1 px-1.5 py-0 rounded bg-rose-100 text-rose-700 text-[9px] font-bold uppercase tracking-wider">
            <AlertTriangle className="w-2.5 h-2.5" /> Repeat
          </span>
        )}
      </div>

      {/* ODP info */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-start gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-purple-100 dark:bg-purple-950/40 grid place-items-center shrink-0">
            <Server className="w-4 h-4 text-purple-700 dark:text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm truncate">{odp.name}</div>
            <div className="text-[10px] font-mono text-muted-foreground">ID #{odp.id}</div>
            {odp.district && (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                <MapPin className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                {odp.district}
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
          <div className="rounded bg-muted/40 p-2 text-center">
            <div className="text-muted-foreground uppercase tracking-wider text-[9px] font-bold">Total Port</div>
            <div className="font-bold tabular-nums text-base mt-0.5">{odp.totalPorts ?? "—"}</div>
          </div>
          <div className={cn(
            "rounded p-2 text-center",
            isRepeatIssue ? "bg-rose-50 dark:bg-rose-950/30" : "bg-muted/40",
          )}>
            <div className={cn("uppercase tracking-wider text-[9px] font-bold", isRepeatIssue ? "text-rose-700" : "text-muted-foreground")}>
              Tiket Aktif Lain
            </div>
            <div className={cn("font-bold tabular-nums text-base mt-0.5", isRepeatIssue ? "text-rose-700" : "text-foreground")}>
              {otherActive.length}
            </div>
          </div>
        </div>
      </div>

      {/* Active tickets list */}
      {otherActive.length > 0 && (
        <div className="border-b">
          <div className="px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-muted/20">
            Tiket Aktif Lain di ODP Ini
          </div>
          <div className="divide-y">
            {otherActive.slice(0, 3).map(t => (
              <Link key={t.id} href={`/work/${t.id}`} className="block px-4 py-2 hover:bg-muted/30">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-blue-600 font-semibold">{t.ticketNumber}</span>
                  {t.status && <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0 rounded bg-orange-100 text-orange-700">{t.status}</span>}
                </div>
                <div className="text-xs truncate text-foreground/80 mt-0.5">{t.title}</div>
              </Link>
            ))}
            {otherActive.length > 3 && (
              <Link href="/tickets/heatmap" className="block px-4 py-2 hover:bg-muted/30 text-[11px] text-primary font-semibold flex items-center gap-1">
                Lihat semua di heatmap <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Past resolution patterns */}
      {(active?.resolutionPatterns ?? []).length > 0 && (
        <div>
          <div className="px-4 py-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground bg-muted/20">
            <Zap className="w-2.5 h-2.5 inline -mt-0.5 mr-0.5" />
            Resolusi Tiket Sebelumnya di ODP Ini
          </div>
          <div className="divide-y">
            {(active?.resolutionPatterns ?? []).slice(0, 2).map((p, i) => (
              <div key={i} className="px-4 py-2 text-[11px]">
                <div className="font-mono text-[10px] text-muted-foreground">{p.ticketNumber}</div>
                <div className="text-foreground/80 line-clamp-2 mt-0.5 italic">"{p.resolution}"</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
