import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { LEAD_STAGE_COLORS, LEAD_CATEGORY_LABELS } from "../../shared/schema";
import {
  TrendingUp, TrendingDown, Users, Target, CheckCircle2, XCircle,
  Zap, PhoneCall, MessageSquare, Navigation, StickyNote,
  ArrowRight, User as UserIcon, Star, Download, FileText,
  AlertTriangle, EyeOff, Shield, WifiOff, MapPin, CircleDot,
  BarChart3, Award, Flame, MapPinned, Search, Clock,
  ChevronRight,
} from "lucide-react";
import { exportDashboardSummary } from "@/lib/exportUtils";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer, PageSection } from "@/components/ui/page-container";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  SkeletonKPIGrid, SkeletonCard, SkeletonList,
} from "@/components/ui/skeleton";

// --- Activity type mapping ------------------------------------------------
const ACTIVITY_ICONS: Record<string, any> = {
  note: StickyNote, call: PhoneCall, whatsapp: MessageSquare,
  visit: Navigation, stage_change: ArrowRight, assigned: UserIcon,
};
const ACTIVITY_TONE: Record<string, string> = {
  note: "bg-muted text-muted-foreground",
  call: "bg-chart-1/10 text-chart-1",
  whatsapp: "bg-success/10 text-success",
  visit: "bg-chart-4/10 text-chart-4",
  stage_change: "bg-warning/10 text-warning",
  assigned: "bg-info/10 text-info",
};
const SOURCE_LABELS: Record<string, string> = {
  canvassing: "Canvassing", prospect_finder: "Prospect Finder",
  referral: "Referral", inbound: "Inbound",
};
const CAT_TONE: Record<string, { bg: string; text: string; dot: string }> = {
  rumahan: { bg: "bg-success/10", text: "text-success", dot: "bg-success" },
  bisnis: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning" },
  perkantoran: { bg: "bg-info/10", text: "text-info", dot: "bg-info" },
  sekolah: { bg: "bg-chart-4/10", text: "text-chart-4", dot: "bg-chart-4" },
  lainnya: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground" },
};

function fmtDist(m: number | null | undefined): string {
  if (m == null) return "";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

function fmtRelative(iso: string | null | undefined) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}j lalu`;
  const days = Math.floor(hrs / 24);
  return `${days}h lalu`;
}

interface DashboardData {
  totalLeads: number; activeLeads: number; wonLeads: number; lostLeads: number;
  conversionRate: number; thisMonthLeads: number; lastMonthLeads: number;
  thisWeekLeads: number; growth: number;
  pipeline: { stage: string; label: string; count: number }[];
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
  activeSessions: number; totalSessions: number;
  recentActivities: { id: number; type: string; content: string; createdAt: string; leadName: string; leadCategory: string }[];
  teamPerformance: { id: number; name: string; role: string; totalLeads: number; wonLeads: number; activeLeads: number; conversionRate: number }[];
  fieldReportCount: number;
  logsByType: Record<string, number>;
  logsBySeverity: Record<string, number>;
  recentFieldLogs: { id: number; type: string; title: string; severity: string; createdAt: string; odpName?: string | null; distanceMeters?: number | null }[];
}

// Board pipeline "Leads Marketing" (mitra JABNET = pipeline id 2). Lead sekarang dikelola di
// /pipelines; halaman /leads lama hanya disisakan untuk convert→customer & timeline aktivitas.
// Navigasi "buka board" generik diarahkan ke sini; stat-tile per-stage & baris aktivitas
// (butuh filter stage / lead spesifik yang belum didukung pipeline via URL) tetap ke /leads.
const LEADS_PIPELINE_PATH = "/pipelines/2";

export default function MarketingDashboardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const isSupervisor = user?.role === "System-Admin"
                    || user?.role === "Admin"
                    || user?.role === "admin"
                    || user?.role === "Administrator" /* legacy */
                    || user?.role === "marketing_spv";

  const { data, isLoading, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ["marketing_dashboard"],
    queryFn: () => api.get<DashboardData>("/marketing/dashboard"),
    refetchInterval: 60_000,
  });

  // -- Loading state --
  if (isLoading || !data) {
    return (
      <PageContainer>
        <PageHeader
          icon={BarChart3}
          title="Marketing Dashboard"
          description="Overview performa tim & pipeline konversi"
          accent="primary"
        />
        <SkeletonKPIGrid count={4} />
        <div className="grid md:grid-cols-2 gap-4">
          <SkeletonCard rows={5} />
          <SkeletonCard rows={5} />
        </div>
        <SkeletonList count={5} />
      </PageContainer>
    );
  }

  // -- Compute hot metrics --
  const maxPipeline = Math.max(...data.pipeline.map(p => p.count), 1);
  const prevMonth = data.lastMonthLeads;
  const thisMonth = data.thisMonthLeads;
  const growth = data.growth;

  return (
    <PageContainer>
      <PageHeader
        icon={BarChart3}
        title="Marketing Dashboard"
        description={isSupervisor ? "Overview seluruh tim marketing & funnel konversi" : `Halo ${user?.name?.split(" ")[0] || "Marketing"}, berikut ringkasanmu.`}
        accent="primary"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        lastUpdated={new Date()}
        actions={
          <Button
            variant="outline-primary"
            size="sm"
            leftIcon={<Download />}
            onClick={() => data && exportDashboardSummary(data)}
          >
            Export
          </Button>
        }
      />

      {/* === HERO: Pipeline Momentum === */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sidebar via-sidebar/95 to-sky-900 text-white shadow-elev-lg">
        {/* Decorative gradient mesh */}
        <div className="absolute inset-0 bg-mesh opacity-40" />
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />
        <div className="relative z-10 p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm text-2xs font-bold uppercase tracking-wider text-white mb-2">
                <Flame className="h-3 w-3 text-warning" />
                Pipeline Aktif
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-4xl md:text-5xl font-black tracking-tight-display tabular-nums">
                  {data.activeLeads}
                </span>
                <span className="text-sm text-white/60 font-semibold">lead sedang diproses</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-success/20 to-success/5 border border-success/30 text-sm">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span className="font-bold tabular-nums text-white">{data.wonLeads}</span>
                  <span className="text-white/60 text-xs">won</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/15 text-sm">
                  <span className="text-white/60 text-xs">Rate:</span>
                  <span className="font-bold tabular-nums text-white">{data.conversionRate}%</span>
                </div>
                <div className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold",
                  growth >= 0
                    ? "bg-success/15 border-success/30 text-success"
                    : "bg-destructive/15 border-destructive/30 text-destructive"
                )}>
                  {growth >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  <span className="tabular-nums">{growth > 0 ? "+" : ""}{growth}%</span>
                  <span className="text-white/50">vs bulan lalu</span>
                </div>
              </div>
            </div>

            {/* Circular progress - conversion */}
            <div className="flex items-center gap-4 md:gap-6 shrink-0">
              <div className="relative w-20 h-20 md:w-24 md:h-24">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/10" />
                  <circle
                    cx="50" cy="50" r="40" fill="none"
                    stroke="url(#convgrad)"
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray="251.2"
                    strokeDashoffset={251.2 - (251.2 * data.conversionRate) / 100}
                    className="transition-all duration-700"
                  />
                  <defs>
                    <linearGradient id="convgrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#2563eb" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl md:text-2xl font-black tabular-nums tracking-tight leading-none">{data.conversionRate}%</span>
                  <span className="text-[9px] uppercase tracking-widest text-white/60 font-semibold mt-0.5">Konversi</span>
                </div>
              </div>

              <div className="hidden md:grid grid-cols-2 gap-2 min-w-[200px]">
                <MiniMetric label="Bulan ini" value={thisMonth} />
                <MiniMetric label="Minggu ini" value={data.thisWeekLeads} />
                <MiniMetric label="Total Leads" value={data.totalLeads} />
                <MiniMetric label="Sesi Aktif" value={data.activeSessions} accent />
              </div>
            </div>
          </div>

          {/* Mobile mini metrics */}
          <div className="md:hidden grid grid-cols-4 gap-2 mt-4 pt-4 border-t border-white/10">
            <MiniMetric label="Bulan ini" value={thisMonth} small />
            <MiniMetric label="Minggu ini" value={data.thisWeekLeads} small />
            <MiniMetric label="Total" value={data.totalLeads} small />
            <MiniMetric label="Sesi" value={data.activeSessions} small accent />
          </div>
        </div>
      </section>

      {/* === STAT TILES === */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile
          icon={Zap}
          label="Prospek Baru"
          value={data.pipeline.find(p => p.stage === "new")?.count ?? 0}
          description="Belum dihubungi"
          accent="warning"
          onClick={() => setLocation("/leads")}
        />
        <StatTile
          icon={PhoneCall}
          label="Dihubungi"
          value={data.pipeline.find(p => p.stage === "contacted")?.count ?? 0}
          description="Sedang engage"
          accent="info"
          onClick={() => setLocation("/leads")}
        />
        <StatTile
          icon={CheckCircle2}
          label="Closing"
          value={data.wonLeads}
          description="Sudah konversi"
          accent="success"
          onClick={() => setLocation("/leads")}
          trend={growth !== 0 ? { value: Math.abs(growth), direction: growth >= 0 ? "up" : "down" } : undefined}
        />
        <StatTile
          icon={XCircle}
          label="Tidak Jadi"
          value={data.lostLeads}
          description="Deal hilang"
          accent="danger"
          onClick={() => setLocation("/leads")}
        />
      </div>

      {/* === PIPELINE FUNNEL + BREAKDOWN === */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Funnel */}
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold tracking-tight">Pipeline Funnel</h3>
            </div>
            <Button
              size="xs"
              variant="ghost-primary"
              rightIcon={<ChevronRight />}
              onClick={() => setLocation(LEADS_PIPELINE_PATH)}
            >
              Lihat Pipeline
            </Button>
          </div>

          <div className="space-y-3">
            {data.pipeline.filter(p => p.stage !== "lost").map((p, idx, arr) => {
              const pct = maxPipeline > 0 ? Math.round((p.count / maxPipeline) * 100) : 0;
              const color = LEAD_STAGE_COLORS[p.stage as keyof typeof LEAD_STAGE_COLORS] ?? "#64748b";
              const next = arr[idx + 1];
              const dropRate = next && p.count > 0
                ? Math.round(((p.count - next.count) / p.count) * 100)
                : null;
              return (
                <div key={p.stage} className="group">
                  <div className="flex items-center justify-between mb-1.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <span className="font-semibold text-foreground truncate">{p.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {dropRate !== null && dropRate > 0 && (
                        <span className="text-2xs text-muted-foreground/80 tabular-nums">
                          -{dropRate}%
                        </span>
                      )}
                      <span className="font-black tabular-nums text-foreground">{p.count}</span>
                    </div>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-500 origin-left"
                      style={{ width: `${pct}%`, background: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {data.lostLeads > 0 && (
            <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <XCircle className="h-3.5 w-3.5 text-destructive" />
                <span>Lost</span>
              </div>
              <span className="font-bold tabular-nums text-destructive">{data.lostLeads}</span>
            </div>
          )}
        </Card>

        {/* Breakdown */}
        <Card padding="lg">
          <h3 className="text-sm font-bold tracking-tight mb-4">Distribusi Lead</h3>

          <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Kategori</p>
          <div className="flex gap-1.5 flex-wrap mb-5">
            {Object.entries(data.byCategory).map(([cat, count]) => {
              const label = LEAD_CATEGORY_LABELS[cat as keyof typeof LEAD_CATEGORY_LABELS] ?? cat;
              const tone = CAT_TONE[cat] ?? CAT_TONE.lainnya;
              return (
                <div
                  key={cat}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${tone.bg}`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} />
                  <span className="text-xs font-medium text-foreground">{label}</span>
                  <span className={`text-xs font-black tabular-nums ${tone.text}`}>{count}</span>
                </div>
              );
            })}
          </div>

          <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Sumber</p>
          <div className="space-y-2">
            {Object.entries(data.bySource).map(([src, count]) => {
              const total = data.totalLeads || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={src} className="flex items-center gap-3 text-xs">
                  <span className="w-24 truncate text-muted-foreground">{SOURCE_LABELS[src] ?? src}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-sky-400 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-10 text-right font-bold tabular-nums text-foreground">{count}</span>
                  <span className="w-10 text-right text-2xs text-muted-foreground tabular-nums">{pct}%</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* === ACTIVITY + TEAM PERFORMANCE === */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Recent Activity */}
        <Card padding="lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold tracking-tight">Aktivitas Terbaru</h3>
            </div>
            <Button
              size="xs"
              variant="ghost-primary"
              rightIcon={<ChevronRight />}
              onClick={() => setLocation("/audit-logs")}
            >
              Riwayat
            </Button>
          </div>
          {data.recentActivities.length === 0 ? (
            <EmptyState
              icon={StickyNote}
              title="Belum ada aktivitas"
              description="Aktivitas lead (catatan, telepon, kunjungan) akan muncul di sini."
              size="sm"
            />
          ) : (
            <div className="space-y-2.5">
              {data.recentActivities.slice(0, 8).map((act, i) => {
                const Icon = ACTIVITY_ICONS[act.type] ?? StickyNote;
                const tone = ACTIVITY_TONE[act.type] ?? ACTIVITY_TONE.note;
                const labels: Record<string, string> = {
                  note: "Catatan", call: "Telepon", whatsapp: "WhatsApp",
                  visit: "Kunjungan", stage_change: "Pindah Stage", assigned: "Ditugaskan",
                };
                let displayContent = act.content ?? "";
                if (displayContent) {
                  try {
                    const parsed = JSON.parse(displayContent);
                    if (act.type === "stage_change") {
                      const STAGE_LABELS: Record<string, string> = {
                        new: "Prospek Baru", contacted: "Dihubungi", interested: "Tertarik",
                        negotiation: "Negosiasi", won: "Closing ✓", lost: "Tidak Jadi",
                      };
                      displayContent = `${STAGE_LABELS[parsed.from] ?? parsed.from} → ${STAGE_LABELS[parsed.to] ?? parsed.to}`;
                    } else if (act.type === "assigned") {
                      displayContent = parsed.assignedToName ?? "Tim";
                    } else {
                      displayContent = Object.values(parsed).filter(Boolean).join(", ");
                    }
                  } catch { /* Not JSON */ }
                }

                return (
                  <button
                    key={`${act.id}-${i}`}
                    onClick={() => setLocation("/leads")}
                    className="group w-full flex gap-3 p-2 -mx-2 rounded-lg hover:bg-muted/60 transition-colors text-left"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
                      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-foreground truncate">{act.leadName}</span>
                        <span className="text-2xs text-muted-foreground whitespace-nowrap">· {fmtRelative(act.createdAt)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        <span className="font-semibold text-foreground/80">{labels[act.type] ?? act.type}</span>
                        {displayContent ? ` - ${displayContent}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Team Performance (SPV only) or Quick Actions (non-SPV) */}
        {isSupervisor && data.teamPerformance.length > 0 ? (
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4 text-warning" />
                <h3 className="text-sm font-bold tracking-tight">Leaderboard Tim</h3>
              </div>
              <Button
                size="xs"
                variant="ghost-primary"
                rightIcon={<ChevronRight />}
                onClick={() => setLocation("/users")}
              >
                Kelola
              </Button>
            </div>

            <div className="space-y-2">
              {data.teamPerformance.slice(0, 6).map((m, i) => {
                const medal = i < 3 ? `#${i + 1}` : null;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-black w-5 text-center tabular-nums text-muted-foreground">
                        {medal || `#${i + 1}`}
                      </span>
                      <div
                        className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 shadow-elev-sm",
                          i === 0
                            ? "bg-gradient-to-br from-amber-400 to-orange-600"
                            : i === 1
                              ? "bg-gradient-to-br from-slate-300 to-slate-500"
                              : i === 2
                                ? "bg-gradient-to-br from-orange-400 to-amber-700"
                                : "bg-gradient-to-br from-sky-500 to-blue-700"
                        )}
                      >
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-foreground truncate">{m.name}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-2xs">
                          <span className="text-muted-foreground tabular-nums">{m.totalLeads} lead</span>
                          <span className="text-success font-bold tabular-nums">{m.wonLeads} won</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 min-w-[60px]">
                      <span className="text-sm font-black tabular-nums text-foreground">{m.conversionRate}%</span>
                      <div className="w-14 h-1.5 rounded-full overflow-hidden bg-border">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-sky-400"
                          style={{ width: `${Math.min(100, m.conversionRate)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : (
          <Card padding="lg">
            <h3 className="text-sm font-bold tracking-tight mb-4">Aksi Cepat</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <QuickAction
                icon={MapPinned}
                label="Mulai Canvassing"
                desc="Sesi lapangan baru"
                tone="sky"
                onClick={() => setLocation("/canvassing")}
              />
              <QuickAction
                icon={Target}
                label="Pipeline Lead"
                desc="Kelola lead aktif"
                tone="emerald"
                onClick={() => setLocation(LEADS_PIPELINE_PATH)}
              />
              <QuickAction
                icon={Users}
                label="Database Kontak"
                desc="Semua lead & kontak"
                tone="violet"
                onClick={() => setLocation("/contacts")}
              />
              <QuickAction
                icon={Search}
                label="Prospect Finder"
                desc="Temukan prospek baru"
                tone="amber"
                onClick={() => setLocation("/prospects")}
              />
            </div>
          </Card>
        )}
      </div>

      {/* === FIELD REPORT (conditional) === */}
      {data.fieldReportCount > 0 && (
        <PageSection
          title="Insights Lapangan"
          description="Ringkasan laporan tim canvassing"
          actions={
            <Button
              size="sm"
              variant="outline-primary"
              rightIcon={<ChevronRight />}
              onClick={() => setLocation("/marketing/bisnis")}
            >
              Analisis Area
            </Button>
          }
        >
          <Card padding="lg">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold">Total Laporan</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-black bg-primary/10 text-primary tabular-nums">
                  {data.fieldReportCount}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                {[
                  { key: "info", label: "Info", accent: "bg-info" },
                  { key: "warning", label: "Perhatian", accent: "bg-warning" },
                  { key: "critical", label: "Kritis", accent: "bg-destructive" },
                ].map(s => (
                  <div key={s.key} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${s.accent}`} />
                    <span className="text-muted-foreground">
                      {s.label}: <span className="font-bold text-foreground tabular-nums">{data.logsBySeverity[s.key] ?? 0}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 md:gap-3">
              {[
                { key: "area_sepi", label: "Area Sepi", icon: EyeOff, accent: "neutral" },
                { key: "kompetitor", label: "Kompetitor", icon: Shield, accent: "danger" },
                { key: "akses_sulit", label: "Akses Sulit", icon: AlertTriangle, accent: "warning" },
                { key: "infrastruktur", label: "Infrastruktur", icon: WifiOff, accent: "info" },
                { key: "potensi_tinggi", label: "Potensi Tinggi", icon: Star, accent: "success" },
                { key: "lainnya", label: "Lainnya", icon: MessageSquare, accent: "neutral" },
              ].filter(t => (data.logsByType[t.key] ?? 0) > 0).map(t => {
                const toneMap: Record<string, string> = {
                  neutral: "bg-muted text-muted-foreground",
                  danger: "bg-destructive/10 text-destructive",
                  warning: "bg-warning/10 text-warning",
                  info: "bg-info/10 text-info",
                  success: "bg-success/10 text-success",
                };
                return (
                  <div
                    key={t.key}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border/60 hover:border-primary/30 hover:shadow-elev-sm transition-all"
                  >
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", toneMap[t.accent])}>
                      <t.icon className="h-4 w-4" strokeWidth={2.25} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">{t.label}</p>
                      <p className="text-lg font-black tabular-nums text-foreground">{data.logsByType[t.key] ?? 0}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {data.recentFieldLogs.length > 0 && (
              <div className="mt-5 pt-4 border-t border-border/50">
                <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground mb-2">Laporan Terbaru</p>
                <div className="space-y-1.5">
                  {data.recentFieldLogs.map(fl => (
                    <div
                      key={fl.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors"
                    >
                      <StatusBadge
                        variant={fl.severity === "critical" ? "danger" : fl.severity === "warning" ? "warning" : "info"}
                        label={fl.severity}
                        size="sm"
                        appearance="dot"
                      />
                      <span className="text-xs font-medium truncate flex-1 text-foreground">{fl.title}</span>
                      {fl.odpName && (
                        <span className="text-2xs flex items-center gap-0.5 shrink-0 text-muted-foreground font-mono-tight">
                          <CircleDot className="h-2.5 w-2.5" /> {fl.odpName}
                        </span>
                      )}
                      {fl.distanceMeters != null && (
                        <span className="text-2xs flex items-center gap-0.5 shrink-0 font-bold text-primary tabular-nums">
                          <MapPin className="h-2.5 w-2.5" /> {fmtDist(fl.distanceMeters)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </PageSection>
      )}

      {/* === QUICK ACTIONS FOR SPV (extra row) === */}
      {isSupervisor && (
        <PageSection title="Aksi Cepat">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <QuickAction icon={MapPinned} label="Canvassing" desc="Sesi lapangan baru" tone="sky" onClick={() => setLocation("/canvassing")} />
            <QuickAction icon={Target} label="Pipeline" desc="Kelola lead aktif" tone="emerald" onClick={() => setLocation(LEADS_PIPELINE_PATH)} />
            <QuickAction icon={Users} label="Kontak" desc="Database lead" tone="violet" onClick={() => setLocation("/contacts")} />
            <QuickAction icon={Search} label="Prospect Finder" desc="Cari prospek baru" tone="amber" onClick={() => setLocation("/prospects")} />
          </div>
        </PageSection>
      )}
    </PageContainer>
  );
}

// --- Subcomponents -----------------------------------------------------

function MiniMetric({
  label, value, accent, small,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className={cn(small ? "text-center" : "")}>
      <p className={cn(
        "uppercase tracking-widest font-bold text-white/50",
        small ? "text-[9px]" : "text-[10px]"
      )}>{label}</p>
      <p className={cn(
        "font-black tabular-nums",
        small ? "text-sm" : "text-base",
        accent ? "text-sky-300" : "text-white"
      )}>{value}</p>
    </div>
  );
}

function QuickAction({
  icon: Ic, label, desc, tone, onClick,
}: {
  icon: any; label: string; desc: string;
  tone: "sky" | "emerald" | "amber" | "violet";
  onClick: () => void;
}) {
  const tones: Record<string, { bg: string; icon: string; hover: string; gradient: string }> = {
    sky: {
      bg: "bg-sky-500/10",
      icon: "text-sky-600 dark:text-sky-400",
      hover: "group-hover:border-sky-300 dark:group-hover:border-sky-700",
      gradient: "from-sky-500/5 to-transparent",
    },
    emerald: {
      bg: "bg-emerald-500/10",
      icon: "text-emerald-600 dark:text-emerald-400",
      hover: "group-hover:border-emerald-300 dark:group-hover:border-emerald-700",
      gradient: "from-emerald-500/5 to-transparent",
    },
    amber: {
      bg: "bg-amber-500/10",
      icon: "text-amber-600 dark:text-amber-400",
      hover: "group-hover:border-amber-300 dark:group-hover:border-amber-700",
      gradient: "from-amber-500/5 to-transparent",
    },
    violet: {
      bg: "bg-violet-500/10",
      icon: "text-violet-600 dark:text-violet-400",
      hover: "group-hover:border-violet-300 dark:group-hover:border-violet-700",
      gradient: "from-violet-500/5 to-transparent",
    },
  };
  const t = tones[tone];
  return (
    <button
      onClick={onClick}
      className={`group relative text-left p-3 md:p-4 rounded-xl border border-border bg-card overflow-hidden hover:shadow-elev-md transition-all active:scale-[0.97] ${t.hover}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${t.gradient} pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity`} />
      <div className="relative">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.bg} mb-2.5 ring-1 ring-border/40`}>
          <Ic className={`h-5 w-5 ${t.icon}`} strokeWidth={2.25} />
        </div>
        <div className="font-bold text-sm tracking-tight text-foreground">{label}</div>
        <div className="text-2xs md:text-xs text-muted-foreground mt-0.5 line-clamp-1">{desc}</div>
      </div>
    </button>
  );
}
