/** Hub per divisi (restrukturisasi v5.1): dashboard ringan tiap divisi —
 *  KPI relevan (dari endpoint existing, hanya bila punya izin) + grid modul.
 *  Konsep: dashboard global dihapus; tiap divisi punya "rumah" sendiri. */
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
  Users, UserX, CircleDot, AlertTriangle, ClipboardList, Activity, CheckSquare,
  Compass, ChevronRight,
} from "lucide-react";

export default function DivisionHubPage() {
  const [, params] = useRoute("/divisi/:key");
  const division = getDivision(params?.key);
  const [, navigate] = useLocation();
  const { canRead } = useAuth();

  const canSee = (p?: string) => !p || canRead(p);

  // KPI sumber: /api/dashboard (izin "dashboard") — dipakai lintas divisi.
  const wantsDash = !!division && ["teknik", "noc", "cs", "keuangan"].includes(division.key) && canRead("dashboard");
  const { data: dash } = useQuery({
    queryKey: ["/api/dashboard", "division-hub"],
    queryFn: () => api.get<any>("/dashboard"),
    enabled: wantsDash,
    staleTime: 60_000,
  });
  // Teamspace: tugas divisi (buat KPI "Tugas Tim Terbuka" di semua hub).
  const { data: tasks } = useAllTasks();

  const visibleModules = useMemo(() => {
    if (!division) return [];
    return division.modules
      .map((mod) => (mod.children ? { ...mod, children: mod.children.filter((c) => canSee(c.permission)) } : mod))
      .filter((mod) => (mod.children ? mod.children.length > 0 : canSee(mod.permission)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [division, canRead]);

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

  // ── KPI per divisi (defensif: field bisa absen → tampil "—") ──
  const fmt = (v: any) => (v == null ? "—" : String(v));
  const tiles: Array<{ icon: any; label: string; value: string; accent: any; path?: string; description?: string }> = [];
  if (division.key === "teknik" && dash) {
    tiles.push(
      { icon: CircleDot, label: "ODP Kritis", value: fmt(dash.odpKritisCount), accent: (dash.odpKritisCount ?? 0) > 0 ? "danger" : "success", path: "/odps", description: "> 80% kapasitas" },
      { icon: Activity, label: "Core Feeder Sisa", value: fmt(dash.coreFeederSisa), accent: (dash.coreFeederSisa ?? 99) < 4 ? "danger" : "primary", path: "/cables" },
      { icon: ClipboardList, label: "Total Kabel", value: fmt(dash.totalCables), accent: "info", path: "/cables" },
    );
  }
  if (division.key === "noc" && dash) {
    tiles.push(
      { icon: Users, label: "Pelanggan Aktif", value: fmt(dash.activeCustomers), accent: "success", path: "/customers" },
      { icon: UserX, label: "Isolir", value: fmt(dash.isolirCustomers), accent: (dash.isolirCustomers ?? 0) > 0 ? "warning" : "neutral", path: "/customers" },
      { icon: CircleDot, label: "ODP Kritis", value: fmt(dash.odpKritisCount), accent: (dash.odpKritisCount ?? 0) > 0 ? "danger" : "success", path: "/odps" },
    );
  }
  if (division.key === "cs" && dash) {
    tiles.push(
      { icon: Users, label: "Total Pelanggan", value: fmt(dash.totalCustomers), accent: "primary", path: "/customers" },
      { icon: UserX, label: "Isolir", value: fmt(dash.isolirCustomers), accent: (dash.isolirCustomers ?? 0) > 0 ? "warning" : "neutral", path: "/customers", description: "perlu tindak lanjut" },
    );
  }
  if (division.key === "keuangan" && dash) {
    tiles.push(
      { icon: UserX, label: "Pelanggan Isolir", value: fmt(dash.isolirCustomers), accent: (dash.isolirCustomers ?? 0) > 0 ? "danger" : "success", path: "/collections", description: "basis collection" },
      { icon: Users, label: "Pelanggan Aktif", value: fmt(dash.activeCustomers), accent: "success", path: "/customers" },
    );
  }
  if (openTasks != null && canRead("team_tasks")) {
    tiles.push({ icon: CheckSquare, label: "Tugas Tim Terbuka", value: String(openTasks), accent: "violet", path: "/teamspace/tasks", description: "seluruh tim Anda" });
  }

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

      <PageSection title="Modul" description={`Semua halaman kerja divisi ${division.short}`}>
        {visibleModules.length === 0 ? (
          <EmptyState icon={AlertTriangle} size="sm" title="Tidak ada akses" description="Anda belum punya izin untuk modul divisi ini — hubungi admin." />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleModules.map((mod) => {
              const ModIcon = mod.icon;
              if (mod.children) {
                return (
                  <Card key={mod.label} padding="md" className="space-y-1.5">
                    <p className="inline-flex items-center gap-2 text-sm font-semibold"><ModIcon className="size-4 text-muted-foreground" /> {mod.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {mod.children.map((c) => (
                        <button key={c.path} type="button" onClick={() => c.path && navigate(c.path)}
                          className="rounded-full border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:scale-95">
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </Card>
                );
              }
              return (
                <button key={mod.path ?? mod.label} type="button" onClick={() => mod.path && navigate(mod.path)}
                  className="group flex items-center gap-3 rounded-xl border bg-card p-3.5 text-left shadow-elev-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/[0.03] hover:shadow-elev-md active:scale-[0.99]">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/15">
                    <ModIcon className="size-5 text-primary" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{mod.label}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                </button>
              );
            })}
          </div>
        )}
      </PageSection>
    </PageContainer>
  );
}
