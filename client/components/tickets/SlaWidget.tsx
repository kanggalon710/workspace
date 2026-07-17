/**
 * v4.2.18 (C.4): SLA Dashboard Widget
 * Compliance %, MTTR, breach trend sparkline, active risk counter.
 */

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Activity, AlertTriangle, CheckCircle2, Clock, Pause, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "wouter";

interface SlaStats {
  complianceRate: number;
  mttrMinutes: number | null;
  activeOverdue: number;
  activeAtRisk: number;
  onHoldCount: number;
  breachTrend14d: Array<{ date: string; resolved: number; breached: number }>;
}

function fmtMinutes(m: number | null): string {
  if (m == null) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return min > 0 ? `${h}j ${min}m` : `${h}j`;
}

function Sparkline({ data }: { data: Array<{ date: string; resolved: number; breached: number }> }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => d.resolved), 1);
  const W = 220, H = 36;
  const stepX = W / (data.length - 1 || 1);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {/* Bars: resolved (green) vs breached (rose) */}
      {data.map((d, i) => {
        const x = i * stepX;
        const totalH = (d.resolved / max) * (H - 6);
        const breachH = ((d.breached) / max) * (H - 6);
        const onTimeH = totalH - breachH;
        return (
          <g key={i}>
            {/* On-time */}
            <rect x={x - 3} y={H - totalH} width={6} height={onTimeH} fill="#10b981" rx={1} />
            {/* Breached on top */}
            <rect x={x - 3} y={H - breachH} width={6} height={breachH} fill="#ef4444" rx={1} />
          </g>
        );
      })}
    </svg>
  );
}

export function SlaWidget() {
  const { data, isLoading } = useQuery<SlaStats>({
    queryKey: ["sla-stats"],
    queryFn: () => api.get<SlaStats>("/tickets/sla-stats"),
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="rounded-xl bg-card border p-4 animate-pulse">
        <div className="h-4 w-24 bg-muted rounded mb-3" />
        <div className="grid grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-16 bg-muted/50 rounded-lg" />)}
        </div>
      </div>
    );
  }

  const trendUp = data.breachTrend14d.slice(-3).reduce((s, d) => s + d.breached, 0) <
                  data.breachTrend14d.slice(-7, -3).reduce((s, d) => s + d.breached, 0);
  const compColor =
    data.complianceRate >= 95 ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
    data.complianceRate >= 85 ? "text-amber-700 bg-amber-50 border-amber-200" :
    "text-rose-700 bg-rose-50 border-rose-200";

  return (
    <div className="rounded-xl bg-gradient-to-br from-sky-50/50 to-blue-50/30 border border-sky-200/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-gradient-to-br from-sky-500 to-blue-700 p-1.5">
            <Activity className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SLA Performance</div>
            <div className="text-[10px] text-muted-foreground">30 hari terakhir</div>
          </div>
        </div>
        <Link href="/tickets/dashboard" className="text-xs text-primary hover:underline">
          Detail dashboard →
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className={`rounded-lg border px-3 py-2.5 ${compColor}`}>
          <div className="flex items-center gap-1 mb-1">
            <CheckCircle2 className="h-3 w-3" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Compliance</span>
          </div>
          <div className="text-xl font-black tabular-nums">{data.complianceRate.toFixed(1)}<span className="text-xs font-bold">%</span></div>
        </div>

        <div className="rounded-lg border bg-white px-3 py-2.5">
          <div className="flex items-center gap-1 mb-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className="text-[10px] font-bold uppercase tracking-wider">MTTR</span>
          </div>
          <div className="text-xl font-black tabular-nums">{fmtMinutes(data.mttrMinutes)}</div>
        </div>

        <div className={`rounded-lg border px-3 py-2.5 ${data.activeOverdue > 0 ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-white"}`}>
          <div className="flex items-center gap-1 mb-1">
            <AlertTriangle className="h-3 w-3" />
            <span className="text-[10px] font-bold uppercase tracking-wider">Breach Aktif</span>
          </div>
          <div className="text-xl font-black tabular-nums">
            {data.activeOverdue}
            {data.activeAtRisk > 0 && <span className="text-xs ml-1.5 text-amber-700 font-bold">+{data.activeAtRisk} at risk</span>}
          </div>
        </div>

        <div className="rounded-lg border bg-white px-3 py-2.5">
          <div className="flex items-center gap-1 mb-1 text-muted-foreground">
            <Pause className="h-3 w-3" />
            <span className="text-[10px] font-bold uppercase tracking-wider">On Hold</span>
          </div>
          <div className="text-xl font-black tabular-nums">{data.onHoldCount}</div>
        </div>
      </div>

      {/* Trend sparkline */}
      <div className="rounded-lg border bg-white px-3 py-2.5">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Tren Resolved vs Breach (14 hari)</div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold">
            {trendUp ? (
              <span className="inline-flex items-center gap-0.5 text-emerald-600">
                <TrendingDown className="h-3 w-3" /> Membaik
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 text-rose-600">
                <TrendingUp className="h-3 w-3" /> Memburuk
              </span>
            )}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <Sparkline data={data.breachTrend14d} />
          <div className="text-[10px] text-muted-foreground space-y-0.5">
            <div className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" /> On-time</div>
            <div className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-rose-500" /> Breach</div>
          </div>
        </div>
      </div>
    </div>
  );
}
