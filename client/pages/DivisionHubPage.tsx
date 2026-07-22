/** Dashboard per divisi (v5.6): tiap divisi punya "ruang laporan" sendiri sesuai
 *  rule kerjanya - KPI + breakdown untuk REVIEW & MONITORING. Data dari endpoint
 *  existing, hanya bila punya izin. Navigasi antar-modul ada di sidebar, jadi
 *  halaman ini fokus ke DATA, bukan daftar menu.
 *
 *  Peta sumber data per divisi:
 *  - marketing : /marketing/dashboard (funnel lead + canvassing) + reaktivasi collection
 *  - teknik    : /dashboard (aset + kapasitas jaringan)
 *  - noc       : /dashboard (kesehatan pelanggan + kapasitas)
 *  - cs        : /dashboard (pelanggan) + /collections/stats?division=cs (reaktivasi)
 *  - keuangan  : /collections/stats (pipeline penagihan + aging)
 *  - hrd       : /hr/dashboard (headcount, kehadiran hari ini, antrean persetujuan)
 *  - teamspace : /teamspace/performance (distribusi tugas + on-time + blocker) */
import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { getDivision } from "@/lib/divisions";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer, PageSection } from "@/components/ui/page-container";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { useAllTasks } from "@/hooks/useTeamspace";
import {
  Users, UserX, CircleDot, Activity, ClipboardList, CheckSquare, Compass,
  Radio, Box, Landmark, Cable, Cpu, Gauge, Wallet, TrendingUp, AlertTriangle, Clock,
  Kanban, Target, Trophy, MapPinned, Camera, UsersRound, UserCheck, CalendarClock,
  ListChecks, Timer, Ban,
} from "lucide-react";

/** Divisi yang punya banner hero (AI-generated) di /public/brand/divisi. */
const BANNER_DIVISIONS = new Set(["marketing", "teknik", "noc", "cs", "keuangan", "hrd", "teamspace"]);

const fmtRp = (n: any) => (n == null ? "Rp 0" : `Rp ${Number(n).toLocaleString("id-ID")}`);
const fmt = (v: any) => (v == null ? "-" : String(v));
const pct = (used: number, total: number) => (total > 0 ? Math.round((used / total) * 100) : 0);

/** Baris breakdown sederhana (bar horizontal) - tanpa lib chart, ringan. */
function BarRow({ label, value, max, color, suffix }: { label: string; value: number; max: number; color: string; suffix?: string }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground truncate">{label}</span>
        <span className="font-semibold tabular-nums">{value.toLocaleString("id-ID")}{suffix ?? ""}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${w}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

type Tile = { icon: any; label: string; value: string; accent: any; path?: string; description?: string };
type BarItem = { label: string; value: number; color: string; suffix?: string };
type Breakdown = { title: string; icon: any; rows: BarItem[]; max: number };

/** Ubah Record<string,number> jadi baris bar terurut pakai peta label+warna. */
function recordToRows(rec: Record<string, number> | undefined, meta: Record<string, { label: string; color: string }>): BarItem[] {
  if (!rec) return [];
  return Object.keys(meta)
    .map((k) => ({ label: meta[k].label, value: Number(rec[k] ?? 0), color: meta[k].color }))
    .filter((r) => r.value > 0);
}

const LEAD_COLORS: Record<string, string> = {
  new: "#6B7280", contacted: "#0EA5E9", interested: "#8B5CF6",
  negotiation: "#F59E0B", won: "#22C55E", lost: "#EF4444",
};
const ATT_META: Record<string, { label: string; color: string }> = {
  hadir: { label: "Hadir", color: "#22C55E" },
  terlambat: { label: "Terlambat", color: "#F59E0B" },
  izin: { label: "Izin", color: "#0EA5E9" },
  sakit: { label: "Sakit", color: "#8B5CF6" },
  cuti: { label: "Cuti", color: "#3B82F6" },
  alpha: { label: "Alpha", color: "#EF4444" },
  libur: { label: "Libur", color: "#94A3B8" },
};
const PEND_META: Record<string, { label: string; color: string }> = {
  leaves: { label: "Cuti", color: "#3B82F6" },
  overtime: { label: "Lembur", color: "#F59E0B" },
  kasbon: { label: "Kasbon", color: "#8B5CF6" },
  reimburse: { label: "Reimburse", color: "#0EA5E9" },
  presensi: { label: "Koreksi Presensi", color: "#EF4444" },
};
const TASK_META: Record<string, { label: string; color: string }> = {
  selesai: { label: "Selesai", color: "#22C55E" },
  dikerjakan: { label: "Dikerjakan", color: "#0EA5E9" },
  terlambat: { label: "Terlambat", color: "#EF4444" },
  belum: { label: "Belum Mulai", color: "#94A3B8" },
};

export default function DivisionHubPage() {
  const [, params] = useRoute("/divisi/:key");
  const division = getDivision(params?.key);
  const [, navigate] = useLocation();
  const { canRead } = useAuth();
  const key = division?.key;

  // Divisi yang butuh data pipeline collection (dengan scope divisi kalau perlu).
  const colDivisionParam = key === "cs" ? "cs" : key === "marketing" ? "marketing" : undefined;
  const wantsCollections =
    (key === "keuangan" && canRead("collections")) ||
    (key === "cs" && (canRead("customers") || canRead("collections"))) ||
    (key === "marketing" && (canRead("leads") || canRead("collections")));
  const colQ = colDivisionParam ? `?division=${colDivisionParam}` : "";

  const wantsDash = !!key && ["teknik", "noc", "cs", "keuangan", "marketing"].includes(key) && canRead("dashboard");
  const { data: dash } = useQuery<any>({
    queryKey: ["/api/dashboard", "division-hub"],
    queryFn: () => api.get<any>("/dashboard"),
    enabled: wantsDash,
    staleTime: 60_000,
  });

  const { data: colStats } = useQuery<any>({
    queryKey: ["/api/collections/stats", colDivisionParam ?? "all", "hub"],
    queryFn: () => api.get<any>(`/collections/stats${colQ}`),
    enabled: wantsCollections,
    staleTime: 60_000,
  });
  const { data: colStages = [] } = useQuery<any[]>({
    queryKey: ["/api/collections/stages", colDivisionParam ?? "all", "hub"],
    queryFn: () => api.get<any[]>(`/collections/stages${colQ}`),
    enabled: wantsCollections,
    staleTime: 5 * 60_000,
  });

  // Marketing: funnel lead + canvassing (endpoint punya guard role sendiri).
  const wantsMkt = key === "marketing" && canRead("marketing_dashboard");
  const { data: mktDash } = useQuery<any>({
    queryKey: ["/api/marketing/dashboard", "hub"],
    queryFn: () => api.get<any>("/marketing/dashboard"),
    enabled: wantsMkt, staleTime: 60_000, retry: false,
  });

  // HRD: headcount + kehadiran hari ini + antrean persetujuan.
  const wantsHr = key === "hrd" && canRead("hr_sdm");
  const { data: hrDash } = useQuery<any>({
    queryKey: ["/api/hr/dashboard", "hub"],
    queryFn: () => api.get<any>("/hr/dashboard"),
    enabled: wantsHr, staleTime: 60_000, retry: false,
  });

  // Teamspace: distribusi tugas + on-time + blocker (default 30 hari terakhir).
  const wantsPerf = key === "teamspace" && canRead("performance_reports");
  const { data: perf } = useQuery<any>({
    queryKey: ["/api/teamspace/performance", "hub"],
    queryFn: () => api.get<any>("/teamspace/performance"),
    enabled: wantsPerf, staleTime: 60_000, retry: false,
  });

  const { data: tasks } = useAllTasks();
  const openTasks = useMemo(() => {
    if (!tasks) return null;
    return tasks.cards.filter((c) => !c.isCompleted && !(c as any).archivedAt).length;
  }, [tasks]);

  // -- KPI tiles per divisi --
  const tiles: Tile[] = [];
  const breakdowns: Breakdown[] = [];

  if (key === "marketing") {
    if (mktDash) {
      tiles.push(
        { icon: Kanban, label: "Total Lead", value: fmt(mktDash.totalLeads), accent: "primary", path: "/leads" },
        { icon: Activity, label: "Lead Aktif", value: fmt(mktDash.activeLeads), accent: "info", path: "/leads", description: "belum won/lost" },
        { icon: Trophy, label: "Menang (Won)", value: fmt(mktDash.wonLeads), accent: "success", path: "/leads" },
        { icon: Target, label: "Konversi", value: `${fmt(mktDash.conversionRate)}%`, accent: "violet", description: "won / total lead" },
        { icon: TrendingUp, label: "Lead Minggu Ini", value: fmt(mktDash.thisWeekLeads), accent: "info", description: `bulan ini ${fmt(mktDash.thisMonthLeads)}` },
        { icon: MapPinned, label: "Canvassing Aktif", value: fmt(mktDash.activeSessions), accent: (mktDash.activeSessions ?? 0) > 0 ? "warning" : "neutral", path: "/canvassing", description: `total sesi ${fmt(mktDash.totalSessions)}` },
        { icon: Camera, label: "Laporan Lapangan", value: fmt(mktDash.fieldReportCount), accent: "neutral", path: "/canvassing/reports" },
      );
      const funnel = (mktDash.pipeline ?? [])
        .map((p: any) => ({ label: p.label, value: Number(p.count ?? 0), color: LEAD_COLORS[p.stage] ?? "#6B7280" }))
        .filter((r: BarItem) => r.value > 0);
      if (funnel.length > 0) breakdowns.push({ title: "Funnel Lead (Canvassing)", icon: Kanban, rows: funnel, max: Math.max(...funnel.map((r: BarItem) => r.value)) });
    } else if (dash) {
      // Fallback kalau bukan role marketing: pakai metrik akuisisi dari dashboard umum.
      tiles.push(
        { icon: Users, label: "Pelanggan Aktif", value: fmt(dash.activeCustomers), accent: "success", path: "/customers" },
        { icon: TrendingUp, label: "Pertumbuhan/hari", value: fmt(dash.rataPertumbuhanHarian), accent: "info", description: "akuisisi harian" },
      );
    }
    if (colStats) tiles.push({ icon: AlertTriangle, label: "Reaktivasi (Delegasi)", value: fmt(colStats.total), accent: (colStats.total ?? 0) > 0 ? "warning" : "success", path: "/collections/marketing", description: "kartu churn didelegasikan" });
  }

  if (key === "teknik" && dash) {
    tiles.push(
      { icon: Radio, label: "POP", value: fmt(dash.totalPops), accent: "primary", path: "/pops" },
      { icon: Box, label: "ODC", value: fmt(dash.totalOdcs), accent: "info", path: "/odcs" },
      { icon: CircleDot, label: "ODP", value: fmt(dash.totalOdps), accent: "primary", path: "/odps" },
      { icon: CircleDot, label: "ODP Kritis", value: fmt(dash.odpKritisCount), accent: (dash.odpKritisCount ?? 0) > 0 ? "danger" : "success", path: "/odps", description: "> 80% kapasitas" },
      { icon: Landmark, label: "Tiang", value: fmt(dash.totalPoles), accent: "neutral", path: "/poles" },
      { icon: Cable, label: "Kabel", value: fmt(dash.totalCables), accent: "info", path: "/cables" },
      { icon: Activity, label: "Core Feeder Sisa", value: fmt(dash.coreFeederSisa), accent: (dash.coreFeederSisa ?? 99) < 4 ? "danger" : "success", path: "/cables" },
      { icon: Cpu, label: "Port Tersedia", value: fmt(dash.portTersediaTotal), accent: "success", path: "/odps" },
    );
  }

  if (key === "noc" && dash) {
    tiles.push(
      { icon: Users, label: "Pelanggan Aktif", value: fmt(dash.activeCustomers), accent: "success", path: "/customers" },
      { icon: UserX, label: "Isolir", value: fmt(dash.isolirCustomers), accent: (dash.isolirCustomers ?? 0) > 0 ? "warning" : "neutral", path: "/customers" },
      { icon: Users, label: "Total Pelanggan", value: fmt(dash.totalCustomers), accent: "primary", path: "/customers" },
      { icon: CircleDot, label: "ODP Kritis", value: fmt(dash.odpKritisCount), accent: (dash.odpKritisCount ?? 0) > 0 ? "danger" : "success", path: "/odps" },
      { icon: TrendingUp, label: "Pertumbuhan/hari", value: fmt(dash.rataPertumbuhanHarian), accent: "info", description: "rata-rata pelanggan baru" },
    );
  }

  if (key === "cs") {
    if (dash) tiles.push(
      { icon: Users, label: "Total Pelanggan", value: fmt(dash.totalCustomers), accent: "primary", path: "/customers" },
      { icon: Users, label: "Aktif", value: fmt(dash.activeCustomers), accent: "success", path: "/customers" },
      { icon: UserX, label: "Isolir", value: fmt(dash.isolirCustomers), accent: (dash.isolirCustomers ?? 0) > 0 ? "warning" : "neutral", path: "/customers", description: "perlu tindak lanjut" },
    );
    if (colStats) tiles.push({ icon: AlertTriangle, label: "Delegasi ke CS", value: fmt(colStats.total), accent: (colStats.total ?? 0) > 0 ? "danger" : "success", path: "/collections/cs", description: "reaktivasi" });
  }

  if (key === "keuangan" && colStats) {
    tiles.push(
      { icon: AlertTriangle, label: "Collection Terbuka", value: fmt(colStats.total), accent: (colStats.total ?? 0) > 0 ? "danger" : "success", path: "/collections", description: "kasus aktif" },
      { icon: Wallet, label: "Total Tagihan", value: fmtRp(colStats.totalOverdue), accent: "warning", path: "/collections" },
      { icon: Clock, label: "Rata-rata Umur", value: `${fmt(colStats.avgAgeDays)}h`, accent: "info", path: "/collections" },
    );
    if (dash) tiles.push({ icon: UserX, label: "Pelanggan Isolir", value: fmt(dash.isolirCustomers), accent: (dash.isolirCustomers ?? 0) > 0 ? "danger" : "success", path: "/customers", description: "basis collection" });
  }

  if (key === "hrd" && hrDash) {
    const att = hrDash.todayAttendance ?? {};
    const pend = hrDash.pending ?? {};
    const totalPending = ["leaves", "overtime", "kasbon", "reimburse", "presensi"].reduce((s, k) => s + Number(pend[k] ?? 0), 0);
    tiles.push(
      { icon: UsersRound, label: "Karyawan", value: fmt(hrDash.headcount), accent: "primary", path: "/hrd/sdm" },
      { icon: UserCheck, label: "Aktif", value: fmt(hrDash.activeCount), accent: "success", path: "/hrd/sdm" },
      { icon: UserCheck, label: "Hadir Hari Ini", value: fmt(att.hadir ?? 0), accent: "success", path: "/hrd/sdm" },
      { icon: Clock, label: "Terlambat", value: fmt(att.terlambat ?? 0), accent: (att.terlambat ?? 0) > 0 ? "warning" : "neutral", description: "hari ini" },
      { icon: CalendarClock, label: "Izin/Sakit/Cuti", value: fmt((att.izin ?? 0) + (att.sakit ?? 0) + (att.cuti ?? 0)), accent: "info", description: "hari ini" },
      { icon: UserX, label: "Alpha", value: fmt(att.alpha ?? 0), accent: (att.alpha ?? 0) > 0 ? "danger" : "success", description: "tanpa keterangan" },
      { icon: ListChecks, label: "Perlu Persetujuan", value: fmt(totalPending), accent: totalPending > 0 ? "warning" : "success", path: "/hrd/sdm", description: "cuti/lembur/kasbon/dll" },
    );
    const attRows = recordToRows(att, ATT_META);
    if (attRows.length > 0) breakdowns.push({ title: "Kehadiran Hari Ini", icon: UserCheck, rows: attRows, max: Math.max(...attRows.map((r) => r.value)) });
    const pendRows = recordToRows(pend, PEND_META);
    if (pendRows.length > 0) breakdowns.push({ title: "Antrean Persetujuan", icon: ListChecks, rows: pendRows, max: Math.max(...pendRows.map((r) => r.value)) });
  }

  if (key === "teamspace" && perf) {
    const d = perf.totals?.distribution ?? {};
    const onTime = perf.totals?.onTimeRate;
    const blockers = perf.blockers?.length ?? 0;
    tiles.push(
      { icon: CheckSquare, label: "Tugas Aktif", value: fmt(perf.totals?.totalActive ?? 0), accent: "violet", path: "/teamspace/tasks", description: "30 hari terakhir" },
      { icon: CheckSquare, label: "Selesai", value: fmt(d.selesai ?? 0), accent: "success", path: "/teamspace/tasks" },
      { icon: Activity, label: "Dikerjakan", value: fmt(d.dikerjakan ?? 0), accent: "info", path: "/teamspace/tasks" },
      { icon: AlertTriangle, label: "Terlambat", value: fmt(d.terlambat ?? 0), accent: (d.terlambat ?? 0) > 0 ? "danger" : "neutral", path: "/teamspace/tasks" },
      { icon: Timer, label: "Tepat Waktu", value: onTime != null ? `${Math.round(onTime * 100)}%` : "-", accent: "success", description: "selesai on-time", path: "/teamspace/performance" },
      { icon: Ban, label: "Blocker (macet)", value: fmt(blockers), accent: blockers > 0 ? "warning" : "success", path: "/teamspace/performance", description: "tugas menua" },
    );
    const taskRows = recordToRows(d, TASK_META);
    if (taskRows.length > 0) breakdowns.push({ title: "Distribusi Tugas Tim", icon: Kanban, rows: taskRows, max: Math.max(...taskRows.map((r) => r.value)) });
  }

  // Tugas tim lintas-divisi (kecuali Teamspace yang sudah punya laporan tugas kaya).
  if (key !== "teamspace" && openTasks != null && canRead("team_tasks")) {
    tiles.push({ icon: CheckSquare, label: "Tugas Tim Terbuka", value: String(openTasks), accent: "violet", path: "/teamspace/tasks", description: "seluruh tim Anda" });
  }

  // -- Breakdown: pipeline collection per stage (Keuangan / CS / Marketing) --
  const collectionBreakdown = useMemo(() => {
    if (!wantsCollections || !colStats || colStages.length === 0) return null;
    const byStage = colStats.byStage ?? {};
    const rows = colStages
      .map((s) => ({ label: s.label, value: Number(byStage[s.key] ?? 0), color: s.color || "#6B7280" }))
      .filter((r) => r.value > 0);
    if (rows.length === 0) return null;
    const max = Math.max(...rows.map((r) => r.value));
    return { rows, max };
  }, [wantsCollections, colStats, colStages]);
  if (collectionBreakdown) {
    breakdowns.push({ title: "Pipeline Collection per Tahap", icon: AlertTriangle, rows: collectionBreakdown.rows, max: collectionBreakdown.max });
  }

  // -- Breakdown: kapasitas jaringan (Teknik / NOC) --
  const capacity = useMemo(() => {
    if (!dash || !(key === "teknik" || key === "noc")) return null;
    const core = dash.totalCoreUsage ?? { total: 0, used: 0 };
    const port = dash.totalPortUsage ?? { total: 0, used: 0 };
    return [
      { label: "Pemakaian Core", value: pct(core.used, core.total), color: pct(core.used, core.total) > 85 ? "#EF4444" : "#0EA5E9", suffix: "%" },
      { label: "Pemakaian Port ODP", value: pct(port.used, port.total), color: pct(port.used, port.total) > 85 ? "#EF4444" : "#22C55E", suffix: "%" },
    ];
  }, [dash, key]);
  if (capacity) {
    breakdowns.push({ title: "Kapasitas Jaringan", icon: Gauge, rows: capacity, max: 100 });
  }

  if (!division) {
    return (
      <PageContainer>
        <EmptyState icon={Compass} title="Divisi tidak ditemukan" description="Pilih divisi dari Beranda." action={{ label: "Ke Beranda", onClick: () => navigate("/") }} />
      </PageContainer>
    );
  }

  const hasData = tiles.length > 0 || breakdowns.length > 0;
  const bannerSrc = BANNER_DIVISIONS.has(division.key) ? `/brand/divisi/${division.key}.jpg` : undefined;

  return (
    <PageContainer>
      {bannerSrc && (
        <div className="relative -mx-4 md:-mx-6 -mt-4 md:-mt-6 mb-4 h-32 md:h-44 overflow-hidden">
          <img src={bannerSrc} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-center" />
          {/* fade the photo into the page background (theme-aware) */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/60 to-transparent" />
        </div>
      )}
      <PageHeader
        icon={division.icon}
        title={division.label}
        description={division.description}
        accent={division.accent}
        breadcrumbs={[{ label: "Beranda", path: "/" }, { label: division.short }]}
      />

      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {tiles.map((t) => (
            <StatTile key={t.label} icon={t.icon} label={t.label} value={t.value} accent={t.accent} description={t.description} onClick={t.path ? () => navigate(t.path!) : undefined} />
          ))}
        </div>
      )}

      {breakdowns.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {breakdowns.map((b) => (
            <Card key={b.title} padding="md" className="space-y-3">
              <div className="flex items-center gap-2">
                <b.icon className="size-4 text-muted-foreground" />
                <p className="text-sm font-semibold">{b.title}</p>
              </div>
              <div className="space-y-2.5">
                {b.rows.map((r) => (
                  <BarRow key={r.label} label={r.label} value={r.value} max={b.max} color={r.color} suffix={r.suffix} />
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {!hasData && (
        <PageSection title="Laporan Divisi">
          <EmptyState icon={ClipboardList} size="sm" title="Belum ada data ringkasan"
            description="Data laporan divisi ini belum tersedia atau Anda belum punya izin. Gunakan menu di sidebar untuk membuka modul kerja." />
        </PageSection>
      )}
    </PageContainer>
  );
}
