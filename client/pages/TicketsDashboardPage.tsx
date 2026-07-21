/**
 * v4.2.18 (G): Operational Dashboard /tickets/dashboard
 *
 * Konsolidasi semua KPI ticketing:
 *   - SLA Performance (compliance %, MTTR, breach trend)
 *   - Active state (open / in-progress / pending breakdown)
 *   - Workload per Teknisi
 *   - CSAT per teknisi (kalau ada data)
 *   - Repeat-issue ODP heatmap (top 10)
 *   - Top 10 resolution codes (frequency analysis)
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { SlaWidget } from "@/components/tickets/SlaWidget";
import {
  Activity, AlertCircle, Award, BarChart3, ClipboardList, MapPin,
  Star, Users, Wrench, Loader2, ArrowLeft,
} from "lucide-react";

interface WorkloadEntry {
  userId: number;
  userName: string;
  userRole: string;
  totalAssigned: number;
  asLead: number;
  asHelper: number;
  open: number;
  inProgress: number;
  pending: number;
  resolvedThisMonth: number;
  avgWorkMinutes: number | null;
}

interface CsatEntry {
  userId: number;
  userName: string;
  responses: number;
  avgRating: number;
  rating5: number;
  rating4: number;
  rating3: number;
  rating2: number;
  rating1: number;
}

interface OdpRepeat {
  odpId: number;
  odpName: string;
  ticketCount: number;
  district: string | null;
  lastIssueAt: string;
}

interface TicketStats {
  open: number;
  inProgress: number;
  pending: number;
  resolvedThisMonth: number;
  total: number;
}

export default function TicketsDashboardPage() {
  const { data: stats } = useQuery<TicketStats>({
    queryKey: ["ticket-stats"],
    queryFn: () => api.get<TicketStats>("/tickets/stats"),
  });

  const { data: workload = [] } = useQuery<WorkloadEntry[]>({
    queryKey: ["technician-workload"],
    queryFn: () => api.get<WorkloadEntry[]>("/tickets/workload-by-technician"),
  });

  const { data: csatData = [] } = useQuery<CsatEntry[]>({
    queryKey: ["csat-by-technician"],
    queryFn: () => api.get<CsatEntry[]>("/tickets/csat-by-technician"),
  });

  const { data: odpRepeats = [] } = useQuery<OdpRepeat[]>({
    queryKey: ["odp-repeat-issues", 2, 30],
    queryFn: () => api.get<OdpRepeat[]>("/tickets/odp-repeat-issues?threshold=2&days=30"),
  });

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/tickets" className="rounded-md hover:bg-muted p-2 -ml-2" aria-label="Kembali">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="rounded-lg bg-gradient-to-br from-sky-100 to-blue-200 p-2.5">
            <BarChart3 className="h-5 w-5 text-sky-700" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight-display">Operational Dashboard</h1>
            <p className="text-sm text-muted-foreground">Monitoring SLA, beban kerja, CSAT, dan hot-spot ODP</p>
          </div>
        </div>
      </div>

      {/* SLA widget */}
      <SlaWidget />

      {/* Active state breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Total Tiket" value={stats?.total ?? 0} color="text-zinc-700" />
        <KpiCard label="Open" value={stats?.open ?? 0} color="text-blue-700" />
        <KpiCard label="Dikerjakan" value={stats?.inProgress ?? 0} color="text-orange-700" />
        <KpiCard label="Pending/Hold" value={stats?.pending ?? 0} color="text-amber-700" />
        <KpiCard label="Resolved Bulan Ini" value={stats?.resolvedThisMonth ?? 0} color="text-emerald-700" />
      </div>

      {/* Two column: Workload + CSAT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Workload */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-bold uppercase tracking-wider">Beban Kerja per Teknisi</h2>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted">{workload.length}</span>
          </div>
          {workload.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground italic">Belum ada teknisi yang di-assign tiket.</div>
          ) : (
            <div className="space-y-2">
              {workload.slice(0, 10).map(w => {
                const active = w.open + w.inProgress + w.pending;
                return (
                  <div key={w.userId} className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/30 transition">
                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 grid place-items-center text-white text-[10px] font-bold shrink-0">
                      {w.userName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold truncate">{w.userName}</span>
                        <span className="text-[9px] uppercase tracking-wider px-1 rounded bg-zinc-100 text-zinc-700">{w.userRole}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Lead {w.asLead} · Helper {w.asHelper} · Avg{" "}
                        {w.avgWorkMinutes != null ? `${w.avgWorkMinutes}m` : "-"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-mono">
                      {w.open > 0 && <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">{w.open}</span>}
                      {w.inProgress > 0 && <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">{w.inProgress}</span>}
                      {w.pending > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{w.pending}</span>}
                      {active === 0 && <span className="text-muted-foreground italic">idle</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CSAT */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-bold uppercase tracking-wider">CSAT per Teknisi</h2>
            </div>
            <span className="text-[10px] text-muted-foreground italic">30 hari</span>
          </div>
          {csatData.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground italic">
              Belum ada CSAT response. Survey muncul setelah tiket resolved.
            </div>
          ) : (
            <div className="space-y-2">
              {csatData.slice(0, 10).map(c => (
                <div key={c.userId} className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-muted/30 transition">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 grid place-items-center text-white text-[10px] font-bold shrink-0">
                    {c.userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{c.userName}</div>
                    <div className="text-[10px] text-muted-foreground">{c.responses} response</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star key={n}
                        className={`h-3 w-3 ${n <= Math.round(c.avgRating) ? "fill-amber-400 text-amber-400" : "text-zinc-300"}`}
                      />
                    ))}
                    <span className="ml-1.5 text-xs font-bold tabular-nums">{c.avgRating.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ODP repeat issues */}
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-rose-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider">Hot-spot ODP - Repeat Issues</h2>
          </div>
          <Link href="/tickets/heatmap" className="text-xs text-primary hover:underline">
            Heatmap →
          </Link>
        </div>
        {odpRepeats.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground italic">
            Tidak ada ODP dengan repeat issue (threshold 2× dalam 30 hari). Bagus!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {odpRepeats.slice(0, 12).map(o => (
              <div
                key={o.odpId}
                className="rounded-md border-2 border-rose-200 bg-rose-50/40 px-3 py-2 hover:border-rose-300 transition"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-xs font-bold truncate">{o.odpName}</div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 shrink-0">
                    {o.ticketCount}× tiket
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {o.district ?? "-"}
                </div>
                <div className="text-[10px] text-rose-700 mt-1 italic">
                  Last issue: {new Date(o.lastIssueAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer link */}
      <div className="text-center text-xs text-muted-foreground py-4">
        Data refresh otomatis · Cache TTL 60s · <Link href="/tickets" className="text-primary hover:underline">Kembali ke list →</Link>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-black tabular-nums mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
