/** Beranda Pengaturan (v5.8) - satu pintu untuk administrasi: Manajemen User,
 *  Manajemen Role & Hak Akses, Integrasi, Public API, dll. Ditambah "Peta Akses Menu"
 *  yang memetakan tiap rute/menu ke permission key yang menggerbangnya - referensi cepat
 *  saat admin mengatur hak akses per role di Manajemen Role. */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DIVISIONS } from "@/lib/divisions";
import { ALL_PERMISSIONS } from "@shared/schema";
import {
  Settings, UserCog, KeyRound, Link2, Megaphone, Bug, Building2, ShieldCheck,
  ChevronRight, Search, Map as MapIcon, Route as RouteIcon, Lock,
} from "lucide-react";

type SettingModule = {
  label: string;
  description: string;
  path: string;
  icon: any;
  permission?: string;
  requireSystemAdmin?: boolean;
  accent: string;
};

// Modul di grup Pengaturan (sinkron dengan Sidebar grup "manajemen").
const SETTING_MODULES: SettingModule[] = [
  { label: "Manajemen User", description: "Tambah, nonaktifkan, atur role & data karyawan pengguna aplikasi.", path: "/users", icon: UserCog, permission: "user_management", accent: "bg-sky-500" },
  { label: "Manajemen Role & Hak Akses", description: "Definisikan role + permission per fitur/menu (none/read/write). Kontrol siapa boleh akses apa.", path: "/roles", icon: ShieldCheck, permission: "user_management", accent: "bg-violet-500" },
  { label: "Integrasi API", description: "Maps, MikroTik, ACS, Billing, WhatsApp, dan pembaruan aplikasi.", path: "/integrations", icon: Link2, permission: "integrations", accent: "bg-emerald-500" },
  { label: "Public API (Open API)", description: "Kelola API key untuk integrasi AI / BI eksternal.", path: "/api-keys", icon: KeyRound, permission: "api_keys", accent: "bg-amber-500" },
  { label: "Pengumuman", description: "Broadcast update fitur & informasi ke seluruh staff.", path: "/announcements", icon: Megaphone, accent: "bg-rose-500" },
  { label: "Lapor Bug", description: "Pantau & triage laporan bug dari pengguna.", path: "/bugs", icon: Bug, accent: "bg-orange-500" },
  { label: "Kelola Mitra", description: "Administrasi multi-tenant (khusus owner).", path: "/mitra", icon: Building2, requireSystemAdmin: true, accent: "bg-slate-600" },
];

// Label permission -> untuk tampil di peta akses.
const PERM_LABEL: Record<string, string> = Object.fromEntries(ALL_PERMISSIONS.map((p) => [p.key, p.label]));

export default function SettingsHubPage() {
  const [, navigate] = useLocation();
  const { user, canRead } = useAuth();
  const isSystemAdmin = !!user?.isSystemAdmin;
  const [q, setQ] = useState("");

  const modules = SETTING_MODULES.filter((m) => {
    if (m.requireSystemAdmin && !isSystemAdmin) return false;
    if (m.permission && !canRead(m.permission)) return false;
    return true;
  });

  // Peta akses: tiap divisi -> daftar (label menu, permission key) dari divisions.ts.
  const accessMap = useMemo(() => {
    const rows: { division: string; short: string; icon: any; items: { label: string; permission: string }[] }[] = [];
    for (const d of DIVISIONS) {
      const items: { label: string; permission: string }[] = [];
      const walk = (mods: any[]) => {
        for (const m of mods) {
          if (m.children) walk(m.children);
          else if (m.path && m.permission) items.push({ label: m.label, permission: m.permission });
        }
      };
      walk(d.modules as any[]);
      if (items.length) rows.push({ division: d.label, short: d.short, icon: d.icon, items });
    }
    return rows;
  }, []);

  const filteredMap = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return accessMap;
    return accessMap
      .map((r) => ({ ...r, items: r.items.filter((i) => i.label.toLowerCase().includes(term) || i.permission.includes(term) || (PERM_LABEL[i.permission] ?? "").toLowerCase().includes(term)) }))
      .filter((r) => r.items.length || r.division.toLowerCase().includes(term));
  }, [accessMap, q]);

  const canManageAccess = canRead("user_management") || isSystemAdmin;

  return (
    <PageContainer>
      <PageHeader
        icon={Settings}
        title="Pengaturan"
        description="Administrasi aplikasi: pengguna, hak akses, integrasi, dan API"
        accent="violet"
      />

      {/* Modul pengaturan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {modules.map((m) => (
          <button
            key={m.path}
            type="button"
            onClick={() => navigate(m.path)}
            className="group text-left"
          >
            <Card className="p-4 h-full transition hover:shadow-elev-md hover:border-primary/40">
              <div className="flex items-start gap-3">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl text-white ${m.accent}`}>
                  <m.icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 font-semibold">
                    <span className="truncate">{m.label}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{m.description}</p>
                </div>
              </div>
            </Card>
          </button>
        ))}
      </div>

      {/* Peta akses menu -> permission (referensi saat atur hak akses per role) */}
      {canManageAccess && (
        <Card className="mt-2 p-4 md:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400">
                <RouteIcon className="size-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold flex items-center gap-1.5"><MapIcon className="size-4 text-muted-foreground" /> Peta Akses Menu</h3>
                <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                  Tiap menu/rute digerbangi satu <strong>permission key</strong>. Atur level akses (none / read / write)
                  per role di <button type="button" className="text-primary underline underline-offset-2" onClick={() => navigate("/roles")}>Manajemen Role & Hak Akses</button>.
                </p>
              </div>
            </div>
            <div className="w-full sm:w-64">
              <Input
                inputSize="sm"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari menu / permission..."
                leftIcon={<Search className="size-3.5" />}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
            {filteredMap.map((r) => (
              <div key={r.division} className="min-w-0">
                <div className="flex items-center gap-1.5 mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <r.icon className="size-3.5" /> {r.division}
                </div>
                <div className="rounded-lg border divide-y">
                  {r.items.map((i, idx) => (
                    <div key={`${i.label}-${idx}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                      <span className="truncate">{i.label}</span>
                      <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono-tight text-[10px] text-muted-foreground" title={PERM_LABEL[i.permission] ?? i.permission}>
                        {i.permission}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {filteredMap.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Lock className="size-6 text-muted-foreground/40" /> Tidak ada menu cocok dengan pencarian.
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={() => navigate("/roles")} leftIcon={<KeyRound className="size-3.5" />}>
              Atur Hak Akses Role
            </Button>
          </div>
        </Card>
      )}
    </PageContainer>
  );
}
