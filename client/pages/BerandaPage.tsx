/** Beranda (v5.1): pengganti dashboard global - pemilih divisi.
 * Role dengan divisi utama (ROLE_HOME_DIVISION) langsung diarahkan ke hub-nya;
 * admin / role lintas divisi melihat grid semua divisi yang boleh diakses. */
import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { DIVISIONS, ROLE_HOME_DIVISION } from "@/lib/divisions";
import { PageContainer } from "@/components/ui/page-container";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { useAllTasks } from "@/hooks/useTeamspace";
import { Compass, ChevronRight, Users, UserX, CircleDot, CheckSquare } from "lucide-react";

const ACCENT_BG: Record<string, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  violet: "bg-chart-5/10 text-chart-5",
  rose: "bg-destructive/10 text-destructive",
};

/** KPI ringkas seluruh divisi di Beranda - hanya tile yang izinnya dimiliki user. */
function DashboardUmum() {
  const [, navigate] = useLocation();
  const { canRead } = useAuth();
  const { data: dash } = useQuery({
    queryKey: ["/api/dashboard", "beranda"],
    queryFn: () => api.get<any>("/dashboard"),
    enabled: canRead("dashboard"),
    staleTime: 60_000,
  });
  const { data: tasks } = useAllTasks();
  const openTasks = useMemo(
    () => tasks ? tasks.cards.filter((c) => !c.isCompleted && !(c as any).archivedAt).length : null,
    [tasks],
  );
  const tiles: Array<{ icon: any; label: string; value: string; accent: any; path: string; description?: string }> = [];
  if (dash) {
    tiles.push(
      { icon: Users, label: "Pelanggan Aktif", value: String(dash.activeCustomers ?? "-"), accent: "success", path: "/customers" },
      { icon: UserX, label: "Isolir", value: String(dash.isolirCustomers ?? "-"), accent: (dash.isolirCustomers ?? 0) > 0 ? "warning" : "neutral", path: "/collections", description: "basis penagihan" },
      { icon: CircleDot, label: "ODP Kritis", value: String(dash.odpKritisCount ?? "-"), accent: (dash.odpKritisCount ?? 0) > 0 ? "danger" : "success", path: "/odps", description: "> 80% kapasitas" },
    );
  }
  if (openTasks != null && canRead("team_tasks")) {
    tiles.push({ icon: CheckSquare, label: "Tugas Tim Terbuka", value: String(openTasks), accent: "violet", path: "/teamspace/tasks" });
  }
  if (tiles.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Dashboard Umum - Seluruh Divisi</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <StatTile key={t.label} icon={t.icon} label={t.label} value={t.value} accent={t.accent} description={t.description} onClick={() => navigate(t.path)} />
        ))}
      </div>
    </div>
  );
}

export default function BerandaPage() {
  const [, navigate] = useLocation();
  const { user, canRead } = useAuth();

  const canSee = (p?: string) => !p || canRead(p);
  const accessible = useMemo(
    () => DIVISIONS.filter((d) =>
      d.modules.some((m) => (m.children ? m.children.some((c) => canSee(c.permission)) : canSee(m.permission)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.role],
  );

  // Role dengan rumah divisi jelas → langsung ke hub-nya (Teamspace tetap terjangkau dari sidebar).
  const home = user?.role ? ROLE_HOME_DIVISION[user.role] : undefined;
  useEffect(() => {
    if (home && accessible.some((d) => d.key === home)) navigate(`/divisi/${home}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home]);

  if (accessible.length === 0) {
    return (
      <PageContainer>
        <EmptyState icon={Compass} title="Belum ada akses divisi" description="Hubungi admin untuk mendapatkan izin modul." />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sidebar via-sidebar/95 to-sky-900 px-6 py-8 text-white">
        <div className="bg-mesh absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="relative">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">JABNET Workspace</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight-display">
            Halo, {user?.name?.split(" ")[0] ?? "Tim"}
          </h1>
          <p className="mt-1 text-sm text-white/70">Pilih divisi untuk mulai bekerja - tiap divisi punya dashboard & modulnya sendiri.</p>
        </div>
      </div>

      {/* Dashboard Umum lintas divisi (permission-aware) - feedback user */}
      <DashboardUmum />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accessible.map((d) => {
          const DIcon = d.icon;
          return (
            <button key={d.key} type="button" onClick={() => navigate(`/divisi/${d.key}`)}
              className="group flex items-start gap-3.5 rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/40 hover:shadow-elev-md">
              <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${ACCENT_BG[d.accent] ?? ACCENT_BG.primary}`}>
                <DIcon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-bold">
                  {d.label}
                  <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{d.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </PageContainer>
  );
}
