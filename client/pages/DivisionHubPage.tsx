/** Dashboard per divisi (v5.4): tiap divisi punya "ruang laporan" sendiri -
 *  KPI relevan + ringkasan data (pipeline collection / kapasitas jaringan / tugas)
 *  dari endpoint existing, hanya bila punya izin. Navigasi antar-modul ada di sidebar,
 *  jadi halaman ini fokus ke DATA, bukan daftar menu. */
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
} from "lucide-react";

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

  const { data: tasks } = useAllTasks();
  const openTasks = useMemo(() => {
    if (!tasks) return null;
    return tasks.cards.filter((c) => !c.isCompleted && !(c as any).archivedAt).length;
  }, [tasks]);

  if (!division) {
    return (
      <PageContainer>
        <EmptyState icon={Compass} title="Divisi tidak ditemukan" description="Pilih divisi dari Beranda." action={{ label: "Ke Beranda", onClick: () => navigate("/") }} />
      </PageContainer>
    );
  }

  // -- KPI tiles per divisi --
  type Tile = { icon: any; label: string; value: string; accent: any; path?: string; description?: string };
  const tiles: Tile[] = [];

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
  if (key === "cs" && dash) {
    tiles.push(
      { icon: Users, label: "Total Pelanggan", value: fmt(dash.totalCustomers), accent: "primary", path: "/customers" },
      { icon: Users, label: "Aktif", value: fmt(dash.activeCustomers), accent: "success", path: "/customers" },
      { icon: UserX, label: "Isolir", value: fmt(dash.isolirCustomers), accent: (dash.isolirCustomers ?? 0) > 0 ? "warning" : "neutral", path: "/customers", description: "perlu tindak lanjut" },
    );
  }
  if (key === "cs" && colStats) {
    tiles.push({ icon: AlertTriangle, label: "Delegasi ke CS", value: fmt(colStats.total), accent: (colStats.total ?? 0) > 0 ? "danger" : "success", path: "/collections/cs", description: "reaktivasi" });
  }
  if (key === "keuangan" && colStats) {
    tiles.push(
      { icon: AlertTriangle, label: "Collection Terbuka", value: fmt(colStats.total), accent: (colStats.total ?? 0) > 0 ? "danger" : "success", path: "/collections", description: "kasus aktif" },
      { icon: Wallet, label: "Total Tagihan", value: fmtRp(colStats.totalOverdue), accent: "warning", path: "/collections" },
      { icon: Clock, label: "Rata-rata Umur", value: `${fmt(colStats.avgAgeDays)}h`, accent: "info", path: "/collections" },
    );
    if (dash) tiles.push({ icon: UserX, label: "Pelanggan Isolir", value: fmt(dash.isolirCustomers), accent: (dash.isolirCustomers ?? 0) > 0 ? "danger" : "success", path: "/customers", description: "basis collection" });
  }
  if (key === "marketing") {
    if (dash) tiles.push(
      { icon: Users, label: "Pelanggan Aktif", value: fmt(dash.activeCustomers), accent: "success", path: "/customers" },
      { icon: TrendingUp, label: "Pertumbuhan/hari", value: fmt(dash.rataPertumbuhanHarian), accent: "info", description: "akuisisi harian" },
    );
    if (colStats) tiles.push({ icon: AlertTriangle, label: "Reaktivasi (Delegasi)", value: fmt(colStats.total), accent: (colStats.total ?? 0) > 0 ? "warning" : "success", path: "/collections/marketing" });
  }
  if (openTasks != null && canRead("team_tasks")) {
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

  // -- Breakdown: kapasitas jaringan (Teknik / NOC) --
  const capacity = useMemo(() => {
    if (!dash || !(key === "teknik" || key === "noc")) return null;
    const core = dash.totalCoreUsage ?? { total: 0, used: 0 };
    const port = dash.totalPortUsage ?? { total: 0, used: 0 };
    return [
      { label: "Pemakaian Core", value: pct(core.used, core.total), max: 100, color: pct(core.used, core.total) > 85 ? "#EF4444" : "#0EA5E9", suffix: "%" },
      { label: "Pemakaian Port ODP", value: pct(port.used, port.total), max: 100, color: pct(port.used, port.total) > 85 ? "#EF4444" : "#22C55E", suffix: "%" },
    ];
  }, [dash, key]);

  const hasData = tiles.length > 0 || collectionBreakdown || capacity;

  return (
    <PageContainer>
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

      {(collectionBreakdown || capacity) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {collectionBreakdown && (
            <Card padding="md" className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Pipeline Collection per Tahap</p>
              </div>
              <div className="space-y-2.5">
                {collectionBreakdown.rows.map((r) => (
                  <BarRow key={r.label} label={r.label} value={r.value} max={collectionBreakdown.max} color={r.color} />
                ))}
              </div>
            </Card>
          )}
          {capacity && (
            <Card padding="md" className="space-y-3">
              <div className="flex items-center gap-2">
                <Gauge className="size-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Kapasitas Jaringan</p>
              </div>
              <div className="space-y-2.5">
                {capacity.map((r) => (
                  <BarRow key={r.label} label={r.label} value={r.value} max={r.max} color={r.color} suffix={r.suffix} />
                ))}
              </div>
            </Card>
          )}
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
