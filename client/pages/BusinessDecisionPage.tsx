import { useState, useMemo } from "react";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { exportFieldReports } from "@/lib/exportUtils";
import {
  TrendingUp, AlertTriangle, Shield, Star, EyeOff, WifiOff,
  MessageSquare, Download, CircleDot, MapPin,
  XCircle, Search as SearchIcon,
  FileText, Zap, LineChart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer, PageSection } from "@/components/ui/page-container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonKPIGrid, SkeletonCard, SkeletonList } from "@/components/ui/skeleton";

// -- Log type definitions (icon + accent class from theme) ------------------
const LOG_TYPES = [
  {
    key: "area_sepi", label: "Area Sepi", icon: EyeOff,
    iconCls: "text-muted-foreground", bgCls: "bg-muted",
    barCls: "bg-muted-foreground", accent: "neutral" as const,
    desc: "Tidak ada calon pelanggan",
  },
  {
    key: "akses_sulit", label: "Akses Sulit", icon: AlertTriangle,
    iconCls: "text-warning", bgCls: "bg-warning/10",
    barCls: "bg-warning", accent: "warning" as const,
    desc: "Jalan rusak, gang sempit",
  },
  {
    key: "kompetitor", label: "Kompetitor", icon: Shield,
    iconCls: "text-destructive", bgCls: "bg-destructive/10",
    barCls: "bg-destructive", accent: "danger" as const,
    desc: "Ada ISP lain dominan",
  },
  {
    key: "infrastruktur", label: "Infrastruktur", icon: WifiOff,
    iconCls: "text-chart-4", bgCls: "bg-chart-4/10",
    barCls: "bg-chart-4", accent: "info" as const,
    desc: "ODP jauh, kabel belum",
  },
  {
    key: "potensi_tinggi", label: "Potensi Tinggi", icon: Star,
    iconCls: "text-success", bgCls: "bg-success/10",
    barCls: "bg-success", accent: "success" as const,
    desc: "Area potensial prospek",
  },
  {
    key: "lainnya", label: "Lainnya", icon: MessageSquare,
    iconCls: "text-info", bgCls: "bg-info/10",
    barCls: "bg-info", accent: "info" as const,
    desc: "Catatan umum lapangan",
  },
];
const LOG_TYPE_MAP = Object.fromEntries(LOG_TYPES.map(t => [t.key, t]));

const SEVERITY_CFG = [
  { key: "info", label: "Info", tone: "info" as const, bar: "bg-info" },
  { key: "warning", label: "Perhatian", tone: "warning" as const, bar: "bg-warning" },
  { key: "critical", label: "Kritis", tone: "danger" as const, bar: "bg-destructive" },
];

const REC_CFG: Record<string, { label: string; icon: any; iconCls: string; bg: string; ring: string }> = {
  invest: {
    label: "Investasi", icon: TrendingUp,
    iconCls: "text-success", bg: "bg-success/10", ring: "ring-success/30",
  },
  avoid: {
    label: "Hindari", icon: XCircle,
    iconCls: "text-destructive", bg: "bg-destructive/10", ring: "ring-destructive/30",
  },
  investigate: {
    label: "Evaluasi", icon: SearchIcon,
    iconCls: "text-warning", bg: "bg-warning/10", ring: "ring-warning/30",
  },
};

interface AnalyticsData {
  totalReports: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  areaInsights: {
    odpId: number | null; odpName: string; totalReports: number;
    types: Record<string, number>; severityCounts: Record<string, number>;
    latestReport: string | null; dominantType: string | null;
    avgDistanceMeters?: number | null; minDistanceMeters?: number | null; maxDistanceMeters?: number | null;
  }[];
  recommendations: { type: string; area: string; reason: string }[];
  recentLogs: {
    id: number; type: string; title: string; description?: string | null;
    severity: string; createdAt: string; userName: string; odpName?: string | null;
    distanceMeters?: number | null;
  }[];
}

function fmtDistance(meters: number | null | undefined): string {
  if (meters == null) return "";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${meters} m`;
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

export default function BusinessDecisionPage() {
  const { user } = useAuth();
  const isSupervisor = user?.role === "System-Admin"
                    || user?.role === "Admin"
                    || user?.role === "admin"
                    || user?.role === "Administrator" /* legacy */
                    || user?.role === "marketing_spv";
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data, isLoading, refetch, isFetching } = useQuery<AnalyticsData>({
    queryKey: ["field_reports_analytics"],
    queryFn: () => api.get<AnalyticsData>("/marketing/field-reports/analytics"),
    refetchInterval: 120_000,
  });

  const filteredLogs = useMemo(() => {
    if (!data) return [];
    if (typeFilter === "all") return data.recentLogs;
    return data.recentLogs.filter(l => l.type === typeFilter);
  }, [data, typeFilter]);

  // -- Loading state --
  if (isLoading || !data) {
    return (
      <PageContainer>
        <PageHeader
          icon={LineChart}
          title="Area Insights"
          description="Analisis laporan lapangan untuk strategi marketing"
          accent="violet"
        />
        <SkeletonKPIGrid count={3} />
        <SkeletonCard rows={4} />
        <SkeletonList count={5} />
      </PageContainer>
    );
  }

  const maxTypeCount = Math.max(...Object.values(data.byType), 1);
  const criticalCount = data.bySeverity["critical"] ?? 0;
  const warningCount = data.bySeverity["warning"] ?? 0;
  const infoCount = data.bySeverity["info"] ?? 0;

  return (
    <PageContainer>
      <PageHeader
        icon={LineChart}
        title="Area Insights"
        description={isSupervisor ? "Analisis laporan lapangan untuk strategi marketing seluruh tim" : "Analisis laporan lapangan untuk strategi marketing"}
        accent="violet"
        onRefresh={() => refetch()}
        refreshing={isFetching}
        actions={
          <Button
            variant="outline-primary"
            size="sm"
            leftIcon={<Download />}
            onClick={() => exportFieldReports(data.recentLogs)}
            disabled={data.recentLogs.length === 0}
          >
            Export
          </Button>
        }
      />

      {/* === HERO: Field Report Overview === */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sidebar via-sidebar/95 to-violet-900 text-white shadow-elev-lg">
        <div className="absolute inset-0 bg-mesh opacity-40" />
        <div className="absolute inset-0 bg-grid-pattern opacity-20" />
        <div className="relative z-10 p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm text-2xs font-bold uppercase tracking-wider text-white mb-2">
                <FileText className="h-3 w-3 text-violet-300" />
                Laporan Lapangan
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-4xl md:text-5xl font-black tracking-tight-display tabular-nums">
                  {data.totalReports}
                </span>
                <span className="text-sm text-white/60 font-semibold">laporan terkumpul</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {criticalCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/20 border border-destructive/40 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
                    <span className="tabular-nums">{criticalCount}</span>
                    <span className="text-white/70">kritis</span>
                  </div>
                )}
                {warningCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/20 border border-warning/40 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                    <span className="tabular-nums">{warningCount}</span>
                    <span className="text-white/70">perhatian</span>
                  </div>
                )}
                {infoCount > 0 && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-info/20 border border-info/40 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-info" />
                    <span className="tabular-nums">{infoCount}</span>
                    <span className="text-white/70">info</span>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 min-w-[240px]">
              <p className="text-2xs uppercase tracking-widest font-bold text-white/50 mb-2">Distribusi Severity</p>
              <div className="h-2.5 rounded-full overflow-hidden bg-white/10 flex">
                {SEVERITY_CFG.map(s => {
                  const count = data.bySeverity[s.key] ?? 0;
                  const pct = data.totalReports > 0 ? (count / data.totalReports) * 100 : 0;
                  if (pct <= 0) return null;
                  return (
                    <div
                      key={s.key}
                      className={cn("h-full transition-all", s.bar)}
                      style={{ width: `${pct}%` }}
                      title={`${s.label}: ${count}`}
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-2xs">
                {SEVERITY_CFG.map(s => {
                  const count = data.bySeverity[s.key] ?? 0;
                  return (
                    <div key={s.key} className="flex items-center gap-1">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.bar)} />
                      <span className="text-white/60 truncate">
                        {s.label}:{" "}
                        <span className="text-white font-bold tabular-nums">{count}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* === Empty state when no reports === */}
      {data.totalReports === 0 && (
        <Card padding="none">
          <EmptyState
            icon={FileText}
            title="Belum Ada Laporan Lapangan"
            description="Mulai canvassing dan gunakan tombol 'Laporan' untuk mencatat kondisi area. Data akan muncul di sini untuk analisis bisnis."
            size="lg"
          />
        </Card>
      )}

      {/* === Main content grid (only when data exists) === */}
      {data.totalReports > 0 && (
        <>
          {/* -- Issue Type Matrix -- */}
          <PageSection title="Distribusi Masalah" description="Kategori kendala lapangan yang dilaporkan tim">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {LOG_TYPES.map(lt => {
                const count = data.byType[lt.key] ?? 0;
                const pct = maxTypeCount > 0 ? Math.round((count / maxTypeCount) * 100) : 0;
                const active = count > 0;
                return (
                  <button
                    key={lt.key}
                    onClick={() => setTypeFilter(typeFilter === lt.key ? "all" : lt.key)}
                    className={cn(
                      "text-left p-3 rounded-xl border transition-all",
                      active
                        ? "border-border bg-card hover:border-primary/30 hover:shadow-elev-sm"
                        : "border-dashed border-border/50 bg-muted/20 opacity-70",
                      typeFilter === lt.key && "ring-2 ring-primary/30 border-primary/40"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", lt.bgCls)}>
                        <lt.icon className={cn("h-4 w-4", lt.iconCls)} strokeWidth={2.25} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{lt.label}</p>
                        <p className="text-2xs text-muted-foreground truncate">{lt.desc}</p>
                      </div>
                      <span className={cn(
                        "text-lg font-black tabular-nums shrink-0",
                        active ? lt.iconCls : "text-muted-foreground/40"
                      )}>
                        {count}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden bg-muted">
                      <div
                        className={cn("h-full rounded-full transition-all", lt.barCls)}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </PageSection>

          {/* -- Recommendations + Area Analysis grid -- */}
          <div className={cn("grid gap-4", data.recommendations.length > 0 ? "md:grid-cols-2" : "md:grid-cols-1")}>
            {data.recommendations.length > 0 && (
              <Card padding="lg">
                <div className="flex items-center gap-2 mb-4">
                  <Zap className="h-4 w-4 text-warning" />
                  <h3 className="text-sm font-bold tracking-tight">Rekomendasi Strategis</h3>
                </div>
                <div className="space-y-2.5">
                  {data.recommendations.map((rec, i) => {
                    const cfg = REC_CFG[rec.type] ?? REC_CFG.investigate;
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex gap-3 p-3 rounded-xl border border-border/40",
                          cfg.bg
                        )}
                      >
                        <div className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-background ring-1",
                          cfg.ring
                        )}>
                          <Icon className={cn("h-4 w-4", cfg.iconCls)} strokeWidth={2.25} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={cn(
                              "text-2xs font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                              cfg.bg.replace("/10", "/20"),
                              cfg.iconCls
                            )}>
                              {cfg.label}
                            </span>
                            <span className="text-xs font-bold text-foreground truncate">{rec.area}</span>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">{rec.reason}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Area Comparison */}
            <Card padding="lg">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold tracking-tight">Analisis per Area</h3>
                </div>
                <span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground tabular-nums">
                  {data.areaInsights.length} area
                </span>
              </div>

              {data.areaInsights.length === 0 ? (
                <EmptyState
                  icon={MapPin}
                  title="Belum ada data area"
                  description="Laporan akan diaggregasi per ODP."
                  size="sm"
                />
              ) : (
                <div className="space-y-2">
                  {data.areaInsights.slice(0, 10).map((area, i) => {
                    const domCfg = LOG_TYPE_MAP[area.dominantType ?? ""] ?? LOG_TYPES[5];
                    const DomIcon = domCfg.icon;
                    const sevScore = (area.severityCounts["critical"] ?? 0) * 3
                      + (area.severityCounts["warning"] ?? 0) * 2
                      + (area.severityCounts["info"] ?? 0);
                    const scoreColor = sevScore >= 6
                      ? "text-destructive"
                      : sevScore >= 3
                        ? "text-warning"
                        : "text-success";
                    return (
                      <div
                        key={`${area.odpId}-${i}`}
                        className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
                      >
                        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", domCfg.bgCls)}>
                          <DomIcon className={cn("h-4 w-4", domCfg.iconCls)} strokeWidth={2.25} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate text-foreground">{area.odpName}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-2xs text-muted-foreground tabular-nums">
                              {area.totalReports} laporan
                            </span>
                            {area.avgDistanceMeters != null && (
                              <span className="text-2xs flex items-center gap-0.5 text-primary font-semibold">
                                <MapPin className="h-2.5 w-2.5" /> ~{fmtDistance(area.avgDistanceMeters)}
                              </span>
                            )}
                            <StatusBadge
                              variant={domCfg.accent === "warning" || domCfg.accent === "success" ? domCfg.accent : domCfg.accent === "danger" ? "danger" : "neutral"}
                              label={domCfg.label}
                              size="sm"
                            />
                            {(area.severityCounts["critical"] ?? 0) > 0 && (
                              <StatusBadge
                                variant="danger"
                                label={`${area.severityCounts["critical"]} kritis`}
                                size="sm"
                                appearance="solid"
                              />
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={cn("text-sm font-black tabular-nums", scoreColor)}>
                            {sevScore}
                          </p>
                          <p className="text-2xs text-muted-foreground uppercase tracking-wider">Skor</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* -- Recent Reports Timeline -- */}
          <PageSection
            title="Laporan Terbaru"
            description="Timeline laporan lapangan - klik kategori untuk filter"
          >
            <Card padding="lg">
              {/* Type filter chips */}
              <ScrollRow className="gap-1.5 pb-3 mb-1 border-b border-border/40 -mx-5 px-5">
                <button
                  onClick={() => setTypeFilter("all")}
                  className={cn(
                    "shrink-0 h-7 px-3 rounded-full text-xs font-semibold transition-colors",
                    typeFilter === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  )}
                >
                  Semua ({data.totalReports})
                </button>
                {LOG_TYPES.map(lt => {
                  const count = data.byType[lt.key] ?? 0;
                  if (count === 0) return null;
                  return (
                    <button
                      key={lt.key}
                      onClick={() => setTypeFilter(lt.key)}
                      className={cn(
                        "shrink-0 h-7 px-3 rounded-full text-xs font-semibold transition-colors inline-flex items-center gap-1.5",
                        typeFilter === lt.key
                          ? `${lt.bgCls} ${lt.iconCls} ring-1 ring-current/20`
                          : "bg-muted text-muted-foreground hover:bg-muted/70"
                      )}
                    >
                      <lt.icon className="h-3 w-3" />
                      <span>{lt.label}</span>
                      <span className="text-2xs tabular-nums opacity-70">({count})</span>
                    </button>
                  );
                })}
              </ScrollRow>

              {filteredLogs.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="Tidak ada laporan"
                  description={typeFilter === "all" ? "Belum ada laporan lapangan." : "Filter ini belum ada hasilnya."}
                  size="sm"
                />
              ) : (
                <div className="space-y-2 mt-3">
                  {filteredLogs.slice(0, 15).map((log, i) => {
                    const cfg = LOG_TYPE_MAP[log.type] ?? LOG_TYPES[5];
                    const Icon = cfg.icon;
                    const sevCfg = SEVERITY_CFG.find(s => s.key === log.severity) ?? SEVERITY_CFG[0];
                    return (
                      <div
                        key={`${log.id}-${i}`}
                        className="flex gap-3 p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors"
                      >
                        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", cfg.bgCls)}>
                          <Icon className={cn("h-4 w-4", cfg.iconCls)} strokeWidth={2.25} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-xs font-bold truncate text-foreground">{log.title}</span>
                            <StatusBadge
                              variant={sevCfg.tone}
                              label={sevCfg.label}
                              size="sm"
                            />
                          </div>
                          {log.description && (
                            <p className="text-xs truncate text-muted-foreground mb-1">{log.description}</p>
                          )}
                          <div className="flex items-center gap-2 text-2xs flex-wrap text-muted-foreground">
                            <span className="font-semibold">{log.userName}</span>
                            {log.odpName && (
                              <span className="flex items-center gap-0.5 font-mono-tight">
                                <CircleDot className="h-2.5 w-2.5" /> {log.odpName}
                              </span>
                            )}
                            {log.distanceMeters != null && (
                              <span className="flex items-center gap-0.5 text-primary font-bold">
                                <MapPin className="h-2.5 w-2.5" /> {fmtDistance(log.distanceMeters)}
                              </span>
                            )}
                            <span className="ml-auto">{fmtRelative(log.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </PageSection>
        </>
      )}
    </PageContainer>
  );
}
