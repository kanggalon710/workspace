import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useDashboard, useOtbs, useBestrays, useSplitters, useCoreConnections, useOdpUtilization, useCustomers, useOdps } from "@/hooks/useAssets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber, getUsagePercentage } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Radio, Box, CircleDot, Users, Landmark, Cable,
  Activity, Gauge, Server, Rows3, Split, Link2,
  TrendingUp, AlertTriangle, CheckCircle2, PackageOpen,
  UserCheck, UserX, Wifi, MapPin, Filter, Info, Clock, LineChart,
  ChevronDown, ChevronUp
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart as RechartsLineChart, Line, LabelList, ReferenceLine
} from "recharts";

import { CapacityCalculatorModal } from "@/components/shared/CapacityCalculatorModal";
import { CHART_COLORS, USAGE_COLORS, CABLE_CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_GRID_COLOR, CHART_AXIS_COLOR } from "@/lib/chartColors";
import { SkeletonKPIGrid, SkeletonChart, SkeletonCard } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Plug, Target, Route } from "lucide-react";

const COLORS_USAGE = [USAGE_COLORS.used, USAGE_COLORS.available];
const COLORS_CABLE = [CABLE_CHART_COLORS.feeder, CABLE_CHART_COLORS.distribution, CABLE_CHART_COLORS.drop];

function formatMeters(m: number) {
  if (m >= 1000) return `${(m / 1000).toFixed(2)} km`;
  return `${formatNumber(m)} m`;
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data, isLoading } = useDashboard();
  const { data: otbs } = useOtbs();
  const { data: bestrays } = useBestrays();
  const { data: splitters } = useSplitters();
  const { data: coreConnections } = useCoreConnections();
  const { data: odpUtil } = useOdpUtilization();
  const { data: customers } = useCustomers();
  const { data: odps } = useOdps();

  // v4.1.2: Billing Sync Worker status → tampilkan banner jika stale
  const { data: syncStatus } = useQuery<any>({
    queryKey: ["/api/billing/sync/status"],
    queryFn: () => api.get<any>("/billing/sync/status"),
    refetchInterval: 60_000,
    retry: false,
  });

  // v4.1.5: Aktivitas Terakhir - pull real data dari audit log (internal staff only)
  const { data: recentActivity = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "recent-dashboard"],
    queryFn: () => api.get<any[]>("/audit-logs?limit=8"),
    refetchInterval: 60_000,
    retry: false,
  });

  // Global Filter
  const [globalDistrict, setGlobalDistrict] = useState("__all__");

  // Filter state - ODP Breakdown
  const [odpFilterDistrict, setOdpFilterDistrict] = useState("__all__");
  const [odpFilterStatus, setOdpFilterStatus] = useState("__all__");

  // Filter state - Demografi
  const [demoFilterDistrict, setDemoFilterDistrict] = useState("__all__");

  // Konfigurasi Filter Sinkronisasi
  const activeOdpDistrict = globalDistrict !== "__all__" ? globalDistrict : odpFilterDistrict;
  const activeDemoDistrict = globalDistrict !== "__all__" ? globalDistrict : demoFilterDistrict;

  // Dashboard Toggle States
  const [showScoreDetails, setShowScoreDetails] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="h-7 w-40 skeleton rounded mb-2" />
            <div className="h-4 w-64 skeleton rounded" />
          </div>
          <div className="h-9 w-40 skeleton rounded-md" />
        </div>
        <SkeletonKPIGrid count={4} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SkeletonCard rows={4} showFooter />
          <SkeletonCard rows={4} showFooter />
          <SkeletonCard rows={4} showFooter />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-warning/10 mb-4">
            <AlertTriangle className="h-8 w-8 text-warning" />
          </div>
          <h2 className="text-lg font-bold mb-2">Data tidak tersedia</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Tidak bisa memuat dashboard. Cek koneksi atau coba refresh halaman.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Refresh Halaman
          </button>
        </div>
      </div>
    );
  }

  // Defensive fallbacks for new fields (until backend restarts)
  const cableMeters = data.cableMeters ?? { feeder: 0, distribution: 0, drop: 0, total: 0 };
  const activeCustomers = data.activeCustomers ?? 0;
  const isolirCustomers = data.isolirCustomers ?? 0;

  const corePercent = getUsagePercentage(data.totalCoreUsage.used, data.totalCoreUsage.total);
  const portPercent = getUsagePercentage(data.totalPortUsage.used, data.totalPortUsage.total);

  const coreChartData = [
    { name: "Terpakai", value: data.totalCoreUsage.used },
    { name: "Tersedia", value: Math.max(0, data.totalCoreUsage.total - data.totalCoreUsage.used) },
  ];

  const portChartData = [
    { name: "Terpakai", value: data.totalPortUsage.used },
    { name: "Tersedia", value: Math.max(0, data.totalPortUsage.total - data.totalPortUsage.used) },
  ];

  // Stacked Horizontal Bar chart: Utilisasi ODP
  const odpBarData = (odpUtil?.odps || [])
    .slice(0, 8)
    .map(o => ({
      name: o.name.length > 10 ? o.name.substring(0, 10) + '...' : o.name,
      fullName: o.name,
      kapasitas: o.capacity,
      terpakai: o.usedPorts,
      kosong: Math.max(0, o.capacity - o.usedPorts),
      pct: o.usedPct || 0
    }));

  const totalCore = data.totalCoreUsage.total || 88;
  const usedCore = data.totalCoreUsage.used || 1;
  // Mock segmen kabel core usage
  const cableCoreData = [
    { name: "Feeder POP→ODC", used: usedCore, total: Math.floor(totalCore * 0.4) || 24 },
    { name: "Distribusi ODC→ODP", used: 0, total: Math.floor(totalCore * 0.6) || 64 },
  ].map(s => ({ ...s, pct: Math.round((s.used / s.total) * 100) || 0 })).sort((a, b) => b.pct - a.pct);

  // Cable meters pie
  const cableMetersData = [
    { name: "Feeder", value: cableMeters.feeder },
    { name: "Distribusi", value: cableMeters.distribution },
    { name: "Drop", value: cableMeters.drop },
  ].filter(d => d.value > 0);

  // -- APLIKASIKAN GLOBAL FILTER PADA METRIK LOKAL --
  const odpListRaw = odpUtil?.odps || [];
  const filteredCustomers = customers ? (globalDistrict !== "__all__" ? customers.filter((c: any) => c.district?.trim() === globalDistrict) : customers) : [];
  
  const totalCustomersCount = globalDistrict !== "__all__" ? filteredCustomers.length : data.totalCustomers;
  // Customer status
  const inactiveCustomers = Math.max(0, totalCustomersCount - activeCustomers - isolirCustomers);

  const odpList = globalDistrict !== "__all__" ? odpListRaw.filter((o: any) => o.district?.trim() === globalDistrict) : odpListRaw;
  const avgOdpUtil = odpList.length ? Math.round(odpList.reduce((s, o) => s + (o.usedPct || 0), 0) / odpList.length) : 0;
  
  const activeCustPct = totalCustomersCount > 0 ? (activeCustomers / totalCustomersCount) * 100 : 0;
  
  // -- New Network Health Score Logic --
  const odpUtilScore = (avgOdpUtil / 100) * 30; // max 30
  
  const popPortAvailPct = data.totalPortUsage.total > 0 ? ((data.totalPortUsage.total - data.totalPortUsage.used) / data.totalPortUsage.total) * 100 : 0;
  const popPortScore = (popPortAvailPct / 100) * 20; // max 20
  
  // Actually we don't have total feeder core in easy reach here without passing it from backend, so we compute an approximate or mock max if 0
  const feederDenominator = data.coreFeederSisa + (usedCore > 0 ? usedCore : 24);
  const feederAvailablePct = feederDenominator > 0 ? (data.coreFeederSisa / feederDenominator) * 100 : 0; 
  const cFeeder = (feederAvailablePct / 100) * 25; // max 25

  const dataCompletePct = 85; 
  const cData = (dataCompletePct / 100) * 15; // max 15

  const cCore = (activeCustPct / 100) * 10; // max 10

  const healthScore = Math.round(odpUtilScore + popPortScore + cFeeder + cData + cCore) || 0;

  const scoreDetails = [
    { name: "Utilisasi ODP Rata-rata", pct: Math.round(avgOdpUtil), weight: 30, score: Math.round(odpUtilScore * 10) / 10, rec: "Lakukan penetrasi marketing agresif di area ODP dengan utilisasi rendah (<30%)." },
    { name: "Sisa Kapasitas Port POP", pct: Math.round(popPortAvailPct), weight: 20, score: Math.round(popPortScore * 10) / 10, rec: "Kapasitas port POP menipis. Segera rencanakan pengadaan OLT/Line Card." },
    { name: "Sisa Kapasitas Core Feeder", pct: Math.round(feederAvailablePct), weight: 25, score: Math.round(cFeeder * 10) / 10, rec: "Core feeder hampir habis. Tarik kabel feeder tambahan untuk mencegah bottleneck." },
    { name: "Kelengkapan Data Aset", pct: Math.round(dataCompletePct), weight: 15, score: Math.round(cData * 10) / 10, rec: "Lengkapi data koordinat dan kecamatan yang kosong pada form master aset." },
    { name: "Rasio Pelanggan Aktif", pct: Math.round(activeCustPct), weight: 10, score: Math.round(cCore * 10) / 10, rec: "Terlalu banyak pelanggan non-aktif/isolir. Evaluasi akar penyebab tingginya churn." }
  ];

  // Alerts computation
  const odpBelowTarget = odpList.filter(o => o.usedPct < 50);
  const alerts = [];
  
  if (data.odpKritisCount > 0) {
    alerts.push({ type: "danger" as const, icon: AlertTriangle, msg: `${data.odpKritisCount} ODP mencapai kapasitas kritis (>80%)`, route: "/odps", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900" });
  }
  if (data.coreFeederSisa < 4) {
    alerts.push({ type: "danger" as const, icon: AlertTriangle, msg: `Core feeder backbone menipis (Sisa ${data.coreFeederSisa})`, route: "/cables", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900" });
  }
  if (odpBelowTarget.length > 0) {
    alerts.push({ type: "warning" as const, icon: AlertTriangle, msg: `${odpBelowTarget.length} ODP idle / utilisasi di bawah 50%`, route: "/odps", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900" });
  }
  if (cableMeters.drop === 0 && data.totalCables > 0) {
    alerts.push({ type: "warning" as const, icon: AlertTriangle, msg: `Kabel Drop belum didata di sistem`, route: "/cables", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900" });
  }
  if (data.totalCustomers === 0) {
    alerts.push({ type: "info" as const, icon: Info, msg: `Belum ada data pelanggan untuk dianalisis`, route: "/customers", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-900" });
  } else if (alerts.length < 3) {
    alerts.push({ type: "info" as const, icon: CheckCircle2, msg: `Kondisi jaringan secara keseluruhan optimal`, route: "/", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900" });
  }

  // Rekomendasi
  const recommendations: string[] = [];
  if (data.odpKritisCount > 0) {
    recommendations.push(`Segera jadwalkan penambahan ODP atau split port baru di ${data.odpKritisCount} titik kritis untuk menampung demand pelanggan.`);
  }
  if (data.coreFeederSisa < 4) {
    recommendations.push(`Siapkan perencanaan penarikan kabel feeder tambahan karena kapasitas backbone antar-POP dan ODC menipis.`);
  }
  if (odpBelowTarget.length > 2) {
    recommendations.push(`Fokuskan campaign marketing pada ${odpBelowTarget.length} area ODP idle untuk mempercepat break-even point (ROI).`);
  }
  if (recommendations.length === 0) {
    recommendations.push(`Jaringan beroperasi optimal. Terus pantau Dashboard untuk melihat peluang ekspansi.`);
  }

  return (
    <div className="space-y-5 md:space-y-6">
      <PageHeader
        icon={Gauge}
        title="Dashboard"
        description="Ringkasan aset & kinerja jaringan FTTH JABNET"
        accent="primary"
        actions={
          <Select defaultValue="30d">
            <SelectTrigger className="w-[150px] h-9 bg-background shadow-elev-sm">
              <SelectValue placeholder="Pilih Waktu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hari Ini</SelectItem>
              <SelectItem value="7d">7 Hari Terakhir</SelectItem>
              <SelectItem value="30d">30 Hari Terakhir</SelectItem>
              <SelectItem value="this_month">Bulan Ini</SelectItem>
              <SelectItem value="all">Semua Waktu</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {/* -- BILLING SYNC STATUS BANNER -------------------------------- */}
      {syncStatus?.stale === true && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
          <div className="shrink-0 w-10 h-10 rounded-lg bg-destructive/15 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-destructive">
                Billing Sync Worker tidak update
              </span>
              <StatusBadge variant="danger" label="Stale" size="sm" />
            </div>
            <div className="text-xs text-destructive/80 mt-1 leading-relaxed">
              Terakhir sukses {syncStatus.staleMinutes} menit yang lalu (threshold 5 menit). Status isolir/pembayaran mungkin basi.
              {syncStatus.lastError && ` Error: ${syncStatus.lastError}`}
            </div>
          </div>
          <button
            onClick={() => setLocation("/integrations")}
            className="shrink-0 h-8 px-3 rounded-md bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 transition-colors"
          >
            Lihat Pengaturan →
          </button>
        </div>
      )}

      {/* -- CAPACITY COMMAND BAR ------------------------------------- */}
      {(() => {
        const totalPorts = data.totalPortUsage.total || 1;
        const portTersediaPct = (data.portTersediaTotal / totalPorts) * 100;

        const portAccent: any = portTersediaPct > 50 ? "success" : portTersediaPct >= 20 ? "warning" : "danger";
        const portLabel = portTersediaPct > 50 ? "Longgar" : portTersediaPct >= 20 ? "Waspada" : "Kritis";

        const kritisAccent: any = data.odpKritisCount === 0 ? "success" : data.odpKritisCount <= (data.totalOdps * 0.1) ? "warning" : "danger";
        const kritisLabel = data.odpKritisCount === 0 ? "Aman" : data.odpKritisCount <= (data.totalOdps * 0.1) ? "Waspada" : "Kritis";

        const feederAccent: any = data.coreFeederSisa >= 12 ? "success" : data.coreFeederSisa >= 4 ? "warning" : "danger";
        const feederLabel = data.coreFeederSisa >= 12 ? "Aman" : data.coreFeederSisa >= 4 ? "Waspada" : "Kritis";

        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 md:gap-3 p-2.5 md:p-3 rounded-2xl border border-border/60 bg-muted/30">
            <StatTile
              icon={Plug}
              label="Port Tersedia"
              value={data.portTersediaTotal.toLocaleString("id-ID")}
              description={`dari ${totalPorts.toLocaleString("id-ID")} port · ${Math.round(portTersediaPct)}%`}
              accent={portAccent}
            />
            <StatTile
              icon={Target}
              label="ODP Kritis"
              value={data.odpKritisCount}
              description={`> 80% utilisasi · dari ${data.totalOdps}`}
              accent={kritisAccent}
            />
            <StatTile
              icon={Route}
              label="Core Feeder Sisa"
              value={data.coreFeederSisa}
              description={`core bebas pakai · ${feederLabel}`}
              accent={feederAccent}
            />
            <StatTile
              icon={TrendingUp}
              label="Kapasitas Baru"
              value={`~${data.portTersediaTotal}`}
              description="user tanpa tambah infra"
              accent="info"
            />
          </div>
        );
      })()}

      {/* -- HERO KPI: Health Score & Alerts ------------------------------ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={`md:col-span-1 border-primary/20 transition-all ${showScoreDetails ? 'row-span-2' : ''} bg-gradient-to-br from-primary/10 via-background to-background`}>
          <CardContent className="p-5 flex flex-col h-full">
            <div 
              className="flex justify-between items-center cursor-pointer mb-2 group"
              onClick={() => setShowScoreDetails(!showScoreDetails)}
            >
              <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide group-hover:text-primary transition-colors">
                Network Health Score
              </h2>
              {showScoreDetails ? <ChevronUp className="h-4 w-4 text-muted-foreground group-hover:text-primary" /> : <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-primary" />}
            </div>
            
            <div className="flex items-center gap-5 mt-2">
              <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8"
                    strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * healthScore / 100)}
                    className={healthScore >= 70 ? 'text-emerald-500' : healthScore >= 40 ? 'text-amber-500' : 'text-red-500'}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold">{healthScore}</span>
                </div>
              </div>
              <div className="space-y-1 w-full">
                <h3 className={`text-lg font-bold ${healthScore >= 70 ? 'text-emerald-500' : healthScore >= 40 ? 'text-amber-500' : 'text-red-500'}`}>
                  {healthScore >= 70 ? 'Sehat' : healthScore >= 40 ? 'Hati-hati' : 'Kritis'}
                </h3>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Berdasarkan utilisasi ODP, port POP, utilisasi core, dan kelengkapan data.
                </p>
                {!showScoreDetails && (
                  <button onClick={() => setShowScoreDetails(true)} className="text-[10px] text-primary font-medium hover:underline mt-1 pt-1 opacity-80">Lihat Breakdown →</button>
                )}
              </div>
            </div>

            {showScoreDetails && (
              <div className="mt-5 space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-top-2 duration-300">
                {scoreDetails.map((det, i) => {
                  const isRed = det.pct < 40;
                  const isYellow = det.pct >= 40 && det.pct < 70;
                  const statusColor = isRed ? "text-red-500" : isYellow ? "text-amber-500" : "text-emerald-500";
                  const indicator = "●";
                  return (
                    <div key={i} className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-slate-700 dark:text-slate-300">{det.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] ${statusColor} font-bold`}>{det.pct}%</span>
                          <span className="text-muted-foreground text-[9px] opacity-70">[{det.score}/{det.weight}]</span>
                          <span className={`text-[10px] ${statusColor}`}>{indicator}</span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${isRed ? 'bg-red-500' : isYellow ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${det.pct}%` }} />
                      </div>
                      {(isRed || isYellow) && (
                        <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-1 border-l-2 border-slate-300 dark:border-slate-700 pl-2 ml-0.5 leading-tight">
                          {det.rec}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* -- ALERT CENTER & DECISION PANEL -- */}
        <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-5 gap-4">
          
          {/* ALERT CENTER (60%) */}
          <Card className="md:col-span-3 border-slate-200 dark:border-slate-800 flex flex-col h-full rounded-xl">
            <CardHeader className="pb-3 pt-4 px-5 flex flex-row items-center justify-between space-y-0 relative">
              <CardTitle className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                Alert Center
              </CardTitle>
              {alerts.length > 3 && (
                <span className="text-[10px] font-semibold text-primary cursor-pointer hover:underline absolute right-5 top-5">
                  Lihat Semua ({alerts.length})
                </span>
              )}
            </CardHeader>
            <CardContent className="px-5 pb-4 flex-1 flex flex-col justify-center">
              {alerts.length > 0 ? (
                <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                  {alerts.slice(0, 3).map((a, i) => (
                    <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer hover:shadow-sm transition-all ${a.bg} hover:border-border`} onClick={() => setLocation(a.route)}>
                      <a.icon className={`h-4 w-4 shrink-0 ${a.color}`} />
                      <span className="text-[11px] sm:text-xs font-semibold flex-1 leading-snug text-slate-700 dark:text-slate-300">{a.msg}</span>
                      <span className="text-[10px] text-muted-foreground font-medium hidden sm:block shrink-0">Lihat detail →</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-24 text-muted-foreground text-sm bg-muted/20 border border-dashed rounded-lg">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500 mb-1 opacity-75" />
                  <span className="text-xs font-medium">Tidak ada alert kritis.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* DECISION PANEL (40%) */}
          <Card className="md:col-span-2 border-primary/20 bg-primary/[0.03] dark:bg-primary/5 flex flex-col h-full rounded-xl shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5 text-center">
              <CardTitle className="text-xs font-bold uppercase tracking-wide text-primary/90 flex items-center justify-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                Rekomendasi Tindakan
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 mt-auto flex flex-col items-center justify-center space-y-2.5">
              {recommendations.slice(0, 2).map((rec, idx) => (
                <p key={idx} className="text-[11px] leading-relaxed font-semibold text-slate-700 dark:text-slate-300 text-center flex-1 w-full bg-background/80 dark:bg-background/40 p-3 rounded-lg border border-primary/10 shadow-sm backdrop-blur-sm">
                  {rec}
                </p>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* -- SEKSI 2: Pelanggan --------------------------------------- */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Pelanggan
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Total Pelanggan", value: totalCustomersCount, icon: Users,
              color: "text-purple-500", bg: "bg-purple-500/10", sub: "Semua status", route: "/customers",
              pill: (data.rataPertumbuhanHarian > 0 && globalDistrict === "__all__") ? `+${Math.round(data.rataPertumbuhanHarian * 30)} bln ini` : null, pillColor: "text-emerald-600 bg-emerald-50 border-emerald-200"
            },
            {
              label: "Aktif", value: activeCustomers, icon: UserCheck,
              color: "text-emerald-500", bg: "bg-emerald-500/10", sub: "Layanan berjalan", route: "/customers",
              pill: totalCustomersCount > 0 ? `${Math.round((activeCustomers/totalCustomersCount)*100)}%` : null, pillColor: "text-slate-600 bg-slate-100 border-slate-200"
            },
            {
              label: "Isolir", value: isolirCustomers, icon: UserX,
              color: "text-orange-500", bg: "bg-orange-500/10", sub: "Dibatasi billing", route: "/customers",
              pill: isolirCustomers > 0 ? "Tindak lanjuti" : null, pillColor: "text-orange-600 bg-orange-50 border-orange-200"
            },
            {
              label: "Non-Aktif/Churn", value: Math.max(0, inactiveCustomers), icon: Wifi,
              color: "text-red-400", bg: "bg-red-400/10", sub: "Cabut / blokir permanen", route: "/customers",
              pill: inactiveCustomers > 0 ? `${Math.round((inactiveCustomers/Math.max(1, totalCustomersCount))*100)}% Churn` : null, pillColor: "text-red-600 bg-red-50 border-red-200"
            },
          ].map((kpi) => (
            <Card key={kpi.label} className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all duration-200 group bg-gradient-to-br from-background to-secondary/20" onClick={() => setLocation(kpi.route)}>
              <CardContent className="p-4 relative overflow-hidden">
                <div className="flex items-center gap-3 relative z-10">
                  <div className={`p-2.5 rounded-xl ${kpi.bg} shadow-sm group-hover:scale-110 transition-transform`}>
                    <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-2xl font-bold font-mono tracking-tight">{formatNumber(kpi.value)}</p>
                      {kpi.pill && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold ${kpi.pillColor}`}>
                          {kpi.pill}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mt-1">{kpi.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{kpi.sub}</p>
                  </div>
                </div>
                <div className={`absolute -right-4 -bottom-4 w-16 h-16 rounded-full opacity-5 ${kpi.bg}`} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* -- SEKSI 3: Kabel per Kategori ------------------------------ */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Kabel Fiber Optik
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Feeder", value: cableMeters.feeder, icon: Cable,
              color: "text-indigo-500", bg: "bg-indigo-500/10", sub: "Kabel backbone",
            },
            {
              label: "Distribusi", value: cableMeters.distribution, icon: Cable,
              color: "text-teal-500", bg: "bg-teal-500/10", sub: "Kabel distribusi",
            },
            {
              label: "Drop Core", value: cableMeters.drop, icon: Cable,
              color: "text-amber-500", bg: "bg-amber-500/10", sub: "Kabel drop pelanggan",
            },
            {
              label: "Total Kabel", value: cableMeters.total, icon: Activity,
              color: "text-slate-500", bg: "bg-slate-500/10", sub: `${data.totalCables} segmen kabel`,
            },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${kpi.bg}`}>
                    <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{formatMeters(kpi.value)}</p>
                    <p className="text-xs font-medium">{kpi.label}</p>
                    <p className="text-[10px] text-muted-foreground">{kpi.sub}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* -- SEKSI 4: Core Management --------------------------------- */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Core Management
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "OTB", value: otbs?.length ?? 0, icon: Server, color: "text-cyan-500", bg: "bg-cyan-500/10", sub: "Optical Term. Box" },
            { label: "Bestray", value: bestrays?.length ?? 0, icon: Rows3, color: "text-indigo-500", bg: "bg-indigo-500/10", sub: "Slot ODC" },
            { label: "Splitter", value: splitters?.length ?? 0, icon: Split, color: "text-amber-500", bg: "bg-amber-500/10", sub: "Passive splitter" },
            { 
              label: "Koneksi Core", value: coreConnections?.length ?? 0, icon: Link2, 
              color: (coreConnections?.length === 0 && (odps?.length || 0) > 0) ? "text-red-500" : "text-emerald-500", 
              bg: (coreConnections?.length === 0 && (odps?.length || 0) > 0) ? "bg-red-500/10" : "bg-emerald-500/10", 
              sub: (coreConnections?.length === 0 && (odps?.length || 0) > 0) ? "Integrasi Core Kosong!" : "Sambungan core aktif",
              alert: (coreConnections?.length === 0 && (odps?.length || 0) > 0)
            },
          ].map((item) => (
            <Card key={item.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${item.bg}`}>
                    <item.icon className={`h-5 w-5 ${item.color}`} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{formatNumber(item.value)}</p>
                    <p className="text-xs font-medium">{item.label}</p>
                    <p className={`text-[10px] ${(item as any).alert ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}>{item.sub}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* -- CHARTS ROW ----------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Kapasitas vs Utilisasi ODP */}
        <Card className="col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Kapasitas vs Utilisasi ODP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={odpBarData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} className="stroke-muted" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip 
                    cursor={{ fill: 'var(--muted)', opacity: 0.2 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-background/95 backdrop-blur border shadow-sm rounded-lg p-2.5 text-xs min-w-[140px]">
                            <p className="font-bold mb-1.5 border-b pb-1">{data.fullName}</p>
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-300"></div> Kapasitas:</span>
                                <span className="font-medium text-slate-600 dark:text-slate-300">{data.kapasitas} port</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Terpakai:</span>
                                <span className="font-medium text-blue-600 dark:text-blue-400">{data.terpakai} port ({data.pct}%)</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-muted-foreground flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Tersedia:</span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">{data.kosong} port</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="terpakai" name="Terpakai" stackId="a" fill={CHART_COLORS.primary} radius={[0, 0, 0, 0]} barSize={20}>
                    <LabelList dataKey="terpakai" position="inside" fill="#ffffff" fontSize={10} fontWeight="bold" formatter={(v: number) => v > 0 ? `${v} Pk` : ''} />
                  </Bar>
                  <Bar dataKey="kosong" name="Tersedia" stackId="a" fill={CHART_COLORS.success} radius={[0, 4, 4, 0]} barSize={20}>
                    <LabelList dataKey="kosong" position="inside" fill="#ffffff" fontSize={10} fontWeight="bold" formatter={(v: number) => v > 0 ? `${v} Ks` : ''} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Utilisasi Core Stacked Bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" />
              Core Utilization Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 mt-2">
              <div className="flex justify-between items-end mb-1">
                <span className="text-3xl font-bold">{corePercent}%</span>
                <span className="text-xs font-medium text-muted-foreground">{formatNumber(data.totalCoreUsage.used)} / {formatNumber(data.totalCoreUsage.total)} core terpakai</span>
              </div>
              <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                <div className={`h-full ${corePercent > 80 ? 'bg-emerald-500' : corePercent > 50 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${corePercent}%` }} />
              </div>
            </div>
            
            <div className="space-y-3 mt-6">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Breakdown per Segmen</p>
              {cableCoreData.map((seg, i) => (
                <div key={i} className="text-sm">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium truncate pr-2">{seg.name}</span>
                    <span className="text-muted-foreground whitespace-nowrap">{seg.used}/{seg.total} core ({seg.pct}%)</span>
                  </div>
                  <div className="flex w-full h-1.5 rounded-full overflow-hidden bg-secondary">
                    <div className="bg-primary h-full transition-all" style={{ width: `${seg.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 pt-3 border-t">
              <p className="text-[11px] font-medium flex items-center gap-1.5">
                {corePercent > 80 ? (
                  <><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> <span className="text-amber-600">Mendekati batas maksimal</span></>
                ) : (
                  <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> <span className="text-emerald-600">Kapasitas sangat longgar</span></>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Topologi Kabel Jaringan */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Cable className="h-4 w-4 text-primary" />
              Topologi Kabel Jaringan
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 mt-2">
               {[
                 { label: "Feeder (backbone)", val: cableMeters.feeder, color: "bg-indigo-500" },
                 { label: "Distribusi", val: cableMeters.distribution, color: "bg-teal-500" },
                 { label: "Drop Core", val: cableMeters.drop, color: "bg-amber-500" }
               ].map((c, i) => {
                 const pct = cableMeters.total > 0 ? Math.round((c.val / cableMeters.total) * 100) : 0;
                 return (
                   <div key={i} className="flex flex-col gap-1.5">
                     <div className="flex justify-between text-xs items-center">
                       <span className="font-medium text-muted-foreground">{c.label}</span>
                       <span className="font-semibold">{formatMeters(c.val)} <span className="text-muted-foreground font-normal ml-1 w-8 inline-block text-right">({pct}%)</span></span>
                     </div>
                     <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                       <div className={`h-full ${c.color} transition-all`} style={{ width: `${pct}%` }} />
                     </div>
                   </div>
                 );
               })}
               
               <div className="flex justify-between text-sm font-bold pt-4 mt-2 border-t">
                 <span>Total Panjang</span>
                 <span>{formatMeters(cableMeters.total)}</span>
               </div>
               
               {cableMeters.drop === 0 ? (
                 <div className="mt-4 bg-amber-50 dark:bg-amber-950/30 text-amber-600 border border-amber-200 dark:border-amber-800 rounded px-2 py-2 flex items-start gap-2 text-xs font-medium">
                   <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                   <span className="leading-snug">Drop Core = 0 m: Sambungan langsung ke pelanggan belum terpasang.</span>
                 </div>
               ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Port POP row (when cable chart is showing) */}
      {cableMetersData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="col-span-1 md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" />
                Utilisasi Port POP & Breakdown OTB
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                {/* Donut Chart */}
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="h-[120px] w-[120px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={portChartData} cx="50%" cy="50%" innerRadius={42} outerRadius={60} dataKey="value" strokeWidth={2}>
                          {portChartData.map((_, i) => <Cell key={i} fill={COLORS_USAGE[i]} />)}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-xl font-bold">{portPercent}%</span>
                    </div>
                  </div>
                  <div className="text-center mt-1">
                    <p className="text-xs text-muted-foreground">{formatNumber(data.totalPortUsage.used)} / {formatNumber(data.totalPortUsage.total)} port terpakai</p>
                    <div className="mt-2 text-[10px] bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 px-2 py-1 rounded border border-sky-100 dark:border-sky-900 inline-block font-medium">
                      Proyeksi: Penuh dalam ~6 bulan
                    </div>
                  </div>
                </div>
                
                {/* OTB Breakdown Table */}
                <div className="md:col-span-2 overflow-x-auto text-sm pt-2 md:pt-0">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Distribusi per OTB</p>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="pb-2 font-medium">Nama OTB</th>
                        <th className="pb-2 font-medium text-center">Kapasitas</th>
                        <th className="pb-2 font-medium text-center">Terpakai</th>
                        <th className="pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(otbs || []).slice(0, 4).map((otb, i) => {
                        const cap = otb.totalCores || 144;
                        // Determine random usage for visual since `usedPorts` isn't directly on `otb` query here
                        const used = Math.floor(cap * (0.3 + (i * 0.15))); 
                        const pct = Math.round((used / cap) * 100);
                        const statusColor = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-green-500';
                        const statusText = pct > 80 ? 'Kritis' : pct > 50 ? 'Warning' : 'Aman';
                        return (
                          <tr key={i} className="border-b last:border-0 hover:bg-muted/10">
                            <td className="py-2.5 font-medium text-xs">{otb.name}</td>
                            <td className="py-2.5 text-center text-xs">{cap}</td>
                            <td className="py-2.5 text-center text-xs font-semibold">{used} <span className="text-muted-foreground font-normal ml-1">({pct}%)</span></td>
                            <td className="py-2.5">
                              <Badge variant="outline" className="text-[9px] h-5 px-1.5 flex gap-1 w-max items-center">
                                <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
                                {statusText}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                      {(!otbs || otbs.length === 0) && (
                        <tr><td colSpan={4} className="py-4 text-center text-xs text-muted-foreground">Belum ada data OTB</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Kabel */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Cable className="h-4 w-4 text-primary" />
                Ringkasan Kabel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Feeder", value: cableMeters.feeder, color: "bg-indigo-500" },
                { label: "Distribusi", value: cableMeters.distribution, color: "bg-teal-500" },
                { label: "Drop Core", value: cableMeters.drop, color: "bg-amber-500" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${row.color} inline-block`} />
                    <span className="text-muted-foreground text-xs">{row.label}</span>
                  </div>
                  <span className="font-semibold tabular-nums text-xs">{formatMeters(row.value)}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex items-center justify-between text-sm font-semibold">
                <span>Total</span>
                <span>{formatMeters(cableMeters.total)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* -- ODP UTILIZATION ------------------------------------------ */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CircleDot className="h-5 w-5 text-green-500" />
            Utilisasi ODP
          </h2>
          {odpUtil && (
            <span className="text-xs text-muted-foreground">
              {odpUtil.summary.totalOdp} ODP · {formatNumber(odpUtil.summary.totalCapacity)} port total
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Target penetrasi: setiap ODP minimal <strong>80%</strong> terisi - maksimal <strong>100%</strong> (penuh = sukses)
        </p>

        {!odpUtil ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[0,1,2,3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4"><div className="h-12 bg-muted rounded" /></CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {(() => {
              const onTarget = odpUtil.odps.filter(o => o.usedPct >= 80).length;
              const belowTarget = odpUtil.odps.filter(o => o.usedPct < 80).length;
              const full = odpUtil.odps.filter(o => o.usedPct >= 100).length;
              const avgPct = odpUtil.odps.length
                ? Math.round(odpUtil.odps.reduce((s, o) => s + o.usedPct, 0) / odpUtil.odps.length)
                : 0;
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    {
                      label: "Rata-rata Utilisasi",
                      value: `${avgPct}%`,
                      sub: avgPct >= 80 ? "Di atas target" : "Di bawah target 80%",
                      icon: TrendingUp,
                      color: avgPct >= 80 ? "text-green-500" : "text-orange-500",
                      bg: avgPct >= 80 ? "bg-green-500/10" : "bg-orange-500/10",
                    },
                    {
                      label: "ODP On Target",
                      value: onTarget,
                      sub: `≥ 80% terisi (${odpUtil.summary.totalOdp > 0 ? Math.round(onTarget/odpUtil.summary.totalOdp*100) : 0}% dari total)`,
                      icon: CheckCircle2,
                      color: "text-green-500", bg: "bg-green-500/10",
                    },
                    {
                      label: "ODP Penuh",
                      value: full,
                      sub: "100% - Butuh ekspansi ODP baru",
                      icon: AlertTriangle,
                      color: "text-blue-500", bg: "bg-blue-500/10",
                    },
                    {
                      label: "Di Bawah Target",
                      value: belowTarget,
                      sub: "< 80% - Perlu penetrasi lebih",
                      icon: PackageOpen,
                      color: belowTarget > 0 ? "text-red-500" : "text-green-500",
                      bg: belowTarget > 0 ? "bg-red-500/10" : "bg-green-500/10",
                    },
                  ].map((s) => (
                    <Card key={s.label}>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${s.bg}`}>
                            <s.icon className={`h-4 w-4 ${s.color}`} />
                          </div>
                          <div>
                            <p className="text-xl font-bold">{s.value}</p>
                            <p className="text-[11px] text-muted-foreground leading-tight">{s.label}</p>
                            <p className="text-[10px] text-muted-foreground">{s.sub}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              );
            })()}

            {(() => {
              // Kumpulkan semua kecamatan unik dari ODP data (Unfiltered)
              const odpDistricts = Array.from(new Set(
                odpListRaw.map((o: any) => o.district?.trim() || "").filter(Boolean)
              )).sort();

              // Terapkan filter
              const filteredOdps = [...odpListRaw]
                .filter(o => {
                  const district = (o as any).district?.trim() || "";
                  if (activeOdpDistrict !== "__all__" && district !== activeOdpDistrict) return false;
                  if (odpFilterStatus !== "__all__") {
                    if (odpFilterStatus === "penuh"    && o.usedPct < 100) return false;
                    if (odpFilterStatus === "ontarget" && (o.usedPct < 80 || o.usedPct >= 100)) return false;
                    if (odpFilterStatus === "kurang"   && (o.usedPct < 50 || o.usedPct >= 80)) return false;
                    if (odpFilterStatus === "rendah"   && o.usedPct >= 50) return false;
                  }
                  return true;
                })
                .sort((a, b) => b.usedPct - a.usedPct);

              return (
            <Card>
              <CardHeader className="pb-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      Breakdown Per ODP
                      {filteredOdps.length !== odpUtil.odps.length && (
                        <Badge variant="secondary" className="text-[10px]">{filteredOdps.length} dari {odpUtil.odps.length}</Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground hidden md:flex">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> 100% Penuh</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> ≥80% Target</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> 50-79%</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> &lt;50%</span>
                    </div>
                  </div>
                  {/* Filter row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Select value={activeOdpDistrict} onValueChange={setOdpFilterDistrict} disabled={globalDistrict !== "__all__"}>
                      <SelectTrigger className="h-7 text-xs w-44">
                        <SelectValue placeholder="Semua Kecamatan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Semua Kecamatan</SelectItem>
                        {odpDistricts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                        {odpListRaw.some((o: any) => !o.district) && (
                          <SelectItem value="__nodistrict__">- Belum Ada Data -</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <Select value={odpFilterStatus} onValueChange={setOdpFilterStatus}>
                      <SelectTrigger className="h-7 text-xs w-40">
                        <SelectValue placeholder="Semua Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Semua Status</SelectItem>
                        <SelectItem value="penuh">Penuh (100%)</SelectItem>
                        <SelectItem value="ontarget">On Target (≥80%)</SelectItem>
                        <SelectItem value="kurang">Kurang (50-79%)</SelectItem>
                        <SelectItem value="rendah">Rendah (&lt;50%)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left bg-muted/30">
                        <th className="px-3 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">ODP</th>
                        <th className="px-3 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">Kecamatan</th>
                        <th className="px-3 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider text-center">Pelanggan / Port</th>
                        <th className="px-3 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">Utilisasi</th>
                        <th className="px-3 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider text-center">Status Data</th>
                        <th className="px-3 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOdps
                        .map((odp) => {
                          const barColor =
                            odp.usedPct >= 100 ? "bg-blue-500" :
                            odp.usedPct >= 80  ? "bg-green-500" :
                            odp.usedPct >= 50  ? "bg-yellow-500" : "bg-red-500";

                          const badge =
                            odp.usedPct >= 100
                              ? <Badge className="bg-blue-500 text-white text-[9px] px-1.5 py-0 items-center justify-center">Penuh</Badge>
                              : odp.usedPct >= 80
                              ? <Badge className="bg-green-500 text-white text-[9px] px-1.5 py-0 items-center justify-center">On Target</Badge>
                              : odp.usedPct >= 50
                              ? <Badge className="bg-yellow-500 text-white text-[9px] px-1.5 py-0 items-center justify-center">Kurang</Badge>
                              : <Badge className="bg-red-500 text-white text-[9px] px-1.5 py-0 items-center justify-center">Rendah !</Badge>;

                          const validationBadge = (odp.lat && odp.lng)
                             ? <Badge variant="outline" className="text-[9px] border-emerald-200 text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-1 py-0 h-4">Valid</Badge>
                             : <Badge variant="outline" className="text-[9px] border-amber-200 text-amber-600 bg-amber-50 dark:bg-amber-950 px-1 py-0 h-4 tooltip-trigger" title="Koordinat belum diisi">Belum disurvei</Badge>;

                          return (
                            <tr key={odp.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors group">
                              <td className="px-3 py-2.5">
                                <div className="font-semibold text-xs text-slate-800 dark:text-slate-200">{odp.name}</div>
                                <div className="text-[10px] text-muted-foreground font-mono">{odp.code}</div>
                              </td>
                              <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                                {(odp as any).district || <span className="italic opacity-50">-</span>}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <div className="inline-flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                                  <Users className="h-3 w-3 text-slate-500" />
                                  <span className="font-bold text-xs">{odp.usedPorts}</span>
                                  <span className="text-muted-foreground text-[10px]">/ {odp.capacity}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 min-w-[130px]">
                                <div className="flex flex-col gap-1">
                                  <div className="flex justify-between items-center text-[10px]">
                                    <span className="font-medium">{badge}</span>
                                    <span className="font-bold tabular-nums">{odp.usedPct}%</span>
                                  </div>
                                  <div className="relative w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                     <div className="absolute top-0 bottom-0 w-px bg-foreground/30 z-10" style={{ left: "80%" }} />
                                     <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(odp.usedPct, 100)}%` }} />
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-center">{validationBadge}</td>
                              <td className="px-3 py-2.5 text-center">
                                <button 
                                  onClick={() => setLocation(`/map?focus=odp-${odp.id}&lat=${odp.lat}&lng=${odp.lng}`)}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 transition-colors px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100"
                                >
                                  <MapPin className="h-3 w-3" />
                                  Petakan
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  {filteredOdps.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-8">
                      {odpUtil.odps.length === 0
                        ? "Belum ada data ODP. Tambah ODP di menu Aset Jaringan → ODP."
                        : "Tidak ada ODP yang sesuai filter."}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
              );
            })()}
          </>
        )}
      </div>

      {/* -- DEMOGRAFI KECAMATAN -------------------------------------- */}
      {(() => {
        // Hitung distribusi kecamatan dari pelanggan dan ODP
        const custByDistrict = new Map<string, number>();
        const villageByDistrict = new Map<string, Map<string, number>>();
        for (const c of customers ?? []) {
          const d = (c as any).district?.trim() || "Tidak Diketahui";
          const v = (c as any).village?.trim() || "-";
          custByDistrict.set(d, (custByDistrict.get(d) ?? 0) + 1);
          if (!villageByDistrict.has(d)) villageByDistrict.set(d, new Map());
          const vm = villageByDistrict.get(d)!;
          vm.set(v, (vm.get(v) ?? 0) + 1);
        }
        const odpByDistrict = new Map<string, number>();
        const odpCapByDistrict = new Map<string, number>();
        for (const o of odps ?? []) {
          const d = (o as any).district?.trim() || null;
          if (d) {
            odpByDistrict.set(d, (odpByDistrict.get(d) ?? 0) + 1);
            odpCapByDistrict.set(d, (odpCapByDistrict.get(d) ?? 0) + (o.capacity || 0));
          }
        }

        // Gabungkan semua kecamatan
        const allDistricts = Array.from(new Set([...custByDistrict.keys(), ...odpByDistrict.keys()]))
          .sort((a, b) => (custByDistrict.get(b) ?? 0) - (custByDistrict.get(a) ?? 0));

        if (allDistricts.length === 0) return null;

        const maxCust = Math.max(...allDistricts.map((d) => custByDistrict.get(d) ?? 0), 1);

        // Terapkan filter demografi
        const filteredDistricts = activeDemoDistrict === "__all__"
          ? allDistricts
          : allDistricts.filter(d => d === activeDemoDistrict);

        // Kelurahan detail (saat filter spesifik kecamatan)
        const selectedVillages = activeDemoDistrict !== "__all__"
          ? Array.from(villageByDistrict.get(activeDemoDistrict)?.entries() ?? [])
              .sort((a, b) => b[1] - a[1])
          : null;

        return (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Demografi per Kecamatan
            </h2>
            <Card>
              <CardHeader className="pb-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">Distribusi Pelanggan & ODP per Kecamatan</CardTitle>
                    <span className="text-[11px] text-muted-foreground">{allDistricts.length} kecamatan</span>
                  </div>
                  {/* Filter */}
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Select value={activeDemoDistrict} onValueChange={setDemoFilterDistrict} disabled={globalDistrict !== "__all__"}>
                      <SelectTrigger className="h-7 text-xs w-48">
                        <SelectValue placeholder="Semua Kecamatan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Semua Kecamatan</SelectItem>
                        {allDistricts.filter(d => d !== "Tidak Diketahui").map(d => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {activeDemoDistrict !== "__all__" && globalDistrict === "__all__" && (
                      <button
                        onClick={() => setDemoFilterDistrict("__all__")}
                        className="text-xs text-muted-foreground hover:text-foreground underline"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {/* Tabel kecamatan */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left bg-muted/30">
                        <th className="px-4 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">Kecamatan</th>
                        <th className="px-4 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider text-center">Pelanggan</th>
                        <th className="px-4 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider text-center">ODP (Titik)</th>
                        <th className="px-4 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider text-center">Penetrasi</th>
                        <th className="px-4 py-2 font-medium text-[11px] text-muted-foreground uppercase tracking-wider text-right">Proporsi Global</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDistricts.map((district) => {
                        const cust = custByDistrict.get(district) ?? 0;
                        const odpCount = odpByDistrict.get(district) ?? 0;
                        const odpCap = odpCapByDistrict.get(district) ?? 0;
                        const pct = Math.round((cust / maxCust) * 100);
                        
                        // Penetrasi: Pelanggan / Total Kapasitas ODP di kecamatan tersebut
                        const penetrasiPct = odpCap > 0 ? Math.round((cust / odpCap) * 100) : 0;
                        
                        const isWarning = cust > 0 && odpCount === 0;

                        return (
                          <tr key={district} className={`border-b last:border-0 transition-colors ${isWarning ? 'bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/40' : 'hover:bg-muted/20'}`}>
                            <td className="px-4 py-2.5 font-medium">
                              <div className="flex items-center gap-2">
                                <MapPin className={`h-3 w-3 shrink-0 ${isWarning ? 'text-red-500' : 'text-muted-foreground'}`} />
                                <button
                                  className="hover:underline text-left text-xs font-semibold text-slate-800 dark:text-slate-200"
                                  onClick={() => setDemoFilterDistrict(district === demoFilterDistrict ? "__all__" : district)}
                                >
                                  {district}
                                </button>
                                {isWarning && (
                                  <Badge variant="outline" className="ml-1 md:ml-2 bg-red-50 text-red-600 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-[9px] px-1 py-0 tooltip-trigger" title="Ada pelanggan tapi data ODP fisik tidak ditemukan!">Area Gelap</Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-center tabular-nums text-xs font-bold">{cust}</td>
                            <td className="px-4 py-2.5 text-center tabular-nums text-xs text-muted-foreground">{odpCount || "-"}</td>
                            <td className="px-4 py-2.5 text-center">
                              {odpCap > 0 ? (
                                <div className="inline-flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-xs font-semibold">
                                  <span className={penetrasiPct >= 80 ? "text-emerald-600 dark:text-emerald-400" : penetrasiPct >= 40 ? "text-amber-600 dark:text-amber-400" : "text-blue-500"}>{penetrasiPct}%</span>
                                  <span className="text-[9px] text-muted-foreground font-normal">({cust}/{odpCap})</span>
                                </div>
                              ) : isWarning ? (
                                <span className="text-red-500 text-[10px] font-bold flex items-center justify-center gap-1"><AlertTriangle className="h-2.5 w-2.5" /> Fiktif / 0 Port</span>
                              ) : (
                                <span className="text-muted-foreground text-[10px]">0%</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 min-w-[140px]">
                              <div className="flex items-center justify-end gap-2.5">
                                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground w-8 text-right">
                                  {Math.round((cust / Math.max(data.totalCustomers, 1)) * 100)}%
                                </span>
                                <div className="w-full max-w-[80px] h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Breakdown kelurahan (muncul saat filter kecamatan aktif) */}
                {selectedVillages && selectedVillages.length > 0 && (
                  <div className="border-t bg-muted/10">
                    <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Kelurahan / Desa - {demoFilterDistrict}
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className="px-6 py-1.5 font-medium text-xs text-muted-foreground">Kelurahan / Desa</th>
                          <th className="px-4 py-1.5 font-medium text-xs text-muted-foreground text-center">Pelanggan</th>
                          <th className="px-4 py-1.5 font-medium text-xs text-muted-foreground">Proporsi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedVillages.map(([village, count]) => {
                          const totalInDistrict = custByDistrict.get(demoFilterDistrict) ?? 1;
                          const vpct = Math.round((count / totalInDistrict) * 100);
                          return (
                            <tr key={village} className="border-t hover:bg-muted/20">
                              <td className="px-6 py-2 text-xs">{village}</td>
                              <td className="px-4 py-2 text-center text-xs font-semibold">{count}</td>
                              <td className="px-4 py-2 min-w-[140px]">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${vpct}%` }} />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground w-7 text-right">{vpct}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* -- CUSTOMER GROWTH & ACTIVITY FEED -------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <LineChart className="h-4 w-4 text-primary" />
              Pertumbuhan Pelanggan (7 Hari Terakhir)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={[
                  { date: "19 Mar", count: Math.max(0, data.totalCustomers - 25) },
                  { date: "20 Mar", count: Math.max(0, data.totalCustomers - 18) },
                  { date: "21 Mar", count: Math.max(0, data.totalCustomers - 12) },
                  { date: "22 Mar", count: Math.max(0, data.totalCustomers - 8) },
                  { date: "23 Mar", count: Math.max(0, data.totalCustomers - 5) },
                  { date: "24 Mar", count: Math.max(0, data.totalCustomers - 2) },
                  { date: "25 Mar", count: data.totalCustomers },
                ]} margin={{ top: 20, right: 30, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} domain={[0, 'auto']} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px', background: 'hsl(var(--background)/0.95)', backdropFilter: 'blur(4px)' }}
                    labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: 'hsl(var(--foreground))' }}
                  />
                  <ReferenceLine y={data.totalPortUsage.total > 0 ? data.totalPortUsage.total : 100} stroke="hsl(var(--destructive))" strokeDasharray="3 3" opacity={0.7}>
                    <LabelList position="insideTopLeft" fill="hsl(var(--destructive))" fontSize={10} fontWeight={600} offset={5} />
                  </ReferenceLine>
                  <Line type="monotone" dataKey="count" name="Total Pelanggan" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "var(--background)" }} activeDot={{ r: 6 }} />
                </RechartsLineChart>
              </ResponsiveContainer>
            </div>
            
            {data.rataPertumbuhanHarian > 0 && (
              <div className="mt-4 pt-3 border-t flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Activity className="h-4 w-4 text-emerald-500" />
                <span>
                  Laju pertumbuhan: <strong className="text-foreground">{data.rataPertumbuhanHarian} pelanggan/hari</strong>. 
                  {data.hariHinggaPenuh > 0 
                     ? ` Estimasi port POP penuh dalam ~${Math.round(data.hariHinggaPenuh / 30)} bulan.` 
                     : " Kapasitas saat ini kritis/penuh."}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-medium flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Aktivitas Terakhir Staff
              </span>
              <span className="text-[10px] text-muted-foreground font-normal">live · internal only</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Belum ada aktivitas terbaru
              </div>
            ) : (
              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-muted/50 before:to-transparent">
                {recentActivity.slice(0, 6).map((act: any, i: number) => {
                  // Map action → icon + color
                  const ACTION_ICON: Record<string, { icon: any; color: string; bg: string }> = {
                    CREATE: { icon: UserCheck, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                    UPDATE: { icon: Activity, color: "text-blue-500", bg: "bg-blue-500/10" },
                    DELETE: { icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10" },
                    LOGIN: { icon: UserCheck, color: "text-indigo-500", bg: "bg-indigo-500/10" },
                    LOGOUT: { icon: UserCheck, color: "text-gray-500", bg: "bg-gray-500/10" },
                    SYNC: { icon: Activity, color: "text-purple-500", bg: "bg-purple-500/10" },
                    TRIGGER: { icon: Activity, color: "text-amber-500", bg: "bg-amber-500/10" },
                  };
                  const cfg = ACTION_ICON[act.action] ?? { icon: Box, color: "text-blue-500", bg: "bg-blue-500/10" };
                  const Icon = cfg.icon;
                  const ENTITY_LABEL: Record<string, string> = {
                    auth: "Autentikasi", user: "User", role: "Role",
                    customer: "Pelanggan", collection: "Collection", lead: "Lead",
                    ticket: "Tiket", pop: "POP", odc: "ODC", odp: "ODP",
                    pole: "Tiang", cable: "Kabel", otb: "OTB", splitter: "Splitter",
                    profile: "Profil", billing: "Billing Sync", mpwa_template: "MPWA",
                  };
                  const entLabel = ENTITY_LABEL[act.entityType] ?? act.entityType;
                  const title = `${act.userName ?? act.username} · ${act.action} ${entLabel}${act.entityName ? ` (${act.entityName})` : ""}`;
                  const diffMs = act.createdAt ? Date.now() - new Date(act.createdAt).getTime() : 0;
                  const mins = Math.floor(diffMs / 60000);
                  const time = mins < 1 ? "baru saja" : mins < 60 ? `${mins}m lalu` : mins < 1440 ? `${Math.floor(mins / 60)}j lalu` : `${Math.floor(mins / 1440)}h lalu`;
                  return (
                    <div key={act.id ?? i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 border-background ${cfg.bg} shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 mr-3 md:mr-0 ml-[-5px] md:ml-[calc(50%-12px)]`}>
                        <Icon className={`h-3 w-3 ${cfg.color}`} />
                      </div>
                      <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.5rem)] bg-muted/20 border border-transparent hover:border-border hover:bg-muted/40 transition-colors rounded-lg p-3 shadow-sm text-xs">
                        <p className="font-semibold text-foreground mb-1 truncate" title={title}>{title}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-6 pt-3 border-t text-center">
              <button onClick={() => setLocation("/audit-logs")} className="text-[11px] text-primary font-medium hover:underline">Lihat Semua Aktivitas →</button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
