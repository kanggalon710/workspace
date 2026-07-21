import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import {
  LayoutDashboard, Map, Users, UserCog, Radio, Box, CircleDot, Landmark, Cable,
  BarChart3, MapPinned, ListChecks, Contact, Search, Package, Activity,
  Cpu, Wifi, AlertCircle, Heart, Server, Rows3, Split, Link2, GitBranch,
  Calculator, FileSpreadsheet, ClipboardList, Megaphone, Bug, KeyRound,
  MessageCircle, Settings, TrendingUp, Sun, Moon, LogOut, User, Building2, Kanban,
  UsersRound, FileText, SquareCheckBig, Trophy, History,
} from "lucide-react";

interface CommandItemDef {
  id: string;
  label: string;
  icon: any;
  path?: string;
  action?: () => void;
  keywords?: string[];
  permission?: string;
  requireSystemAdmin?: boolean;
  shortcut?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RECENT_KEY = "jabnet_recent_pages";

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [location, setLocation] = useLocation();
  const { canRead, logout, user } = useAuth();
  const isSysAdmin = !!user?.isSystemAdmin;
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  // -- Terakhir Dikunjungi: rekam route (dedupe, max 12) → grup teratas saat ⌘K dibuka --
  useEffect(() => {
    if (!location || location === "/login") return;
    try {
      const prev: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      const next = [location, ...prev.filter((p) => p !== location)].slice(0, 12);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch { /* storage blocked - abaikan */ }
  }, [location]);
  const [recents, setRecents] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    try { setRecents(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")); } catch { setRecents([]); }
  }, [open]);

  // -- Search All Teamspace (gaya Cicle): cari tim/kartu/dokumen dari ⌘K --
  const [search, setSearch] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { if (!open) { setSearch(""); setDebouncedQ(""); } }, [open]);
  const { data: tsResults } = useQuery({
    queryKey: ["teamspace-search", debouncedQ],
    queryFn: () => api.get<{
      teams: Array<{ id: number; name: string }>;
      cards: Array<{ id: number; title: string; pipelineId: number; teamName: string }>;
      docs: Array<{ id: number; title: string; teamId: number; teamName: string }>;
    }>(`/teamspace/search?q=${encodeURIComponent(debouncedQ)}`),
    enabled: open && debouncedQ.length >= 2 && (canRead("team_tasks") || canRead("teams")),
    staleTime: 30_000,
  });

  // Global Cmd+K shortcut to toggle palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  const runCommand = (fn: () => void) => {
    onOpenChange(false);
    setTimeout(fn, 100);
  };

  const navigate = (path: string) => runCommand(() => setLocation(path));

  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    setDarkMode(!darkMode);
  };

  // -- Navigation items --
  const navigationItems: CommandItemDef[] = [
    { id: "beranda", label: "Beranda (Pilih Divisi)", icon: LayoutDashboard, path: "/", keywords: ["beranda", "home", "divisi"], shortcut: "⌘D" },
    { id: "dashboard", label: "Dashboard Jaringan", icon: LayoutDashboard, path: "/dashboard-jaringan", permission: "dashboard", keywords: ["dashboard", "jaringan", "noc"] },
    { id: "map", label: "Peta Jaringan", icon: Map, path: "/map", permission: "map", shortcut: "⌘M", keywords: ["peta", "map", "jaringan", "gis"] },
    { id: "customers", label: "Pelanggan", icon: Users, path: "/customers", permission: "customers", keywords: ["customer", "pelanggan", "user"] },
    { id: "marketing", label: "Marketing Dashboard", icon: BarChart3, path: "/marketing", permission: "marketing_dashboard" },
    { id: "canvassing", label: "Canvassing", icon: MapPinned, path: "/canvassing", permission: "canvassing" },
    // "Lead Pipeline" (/leads) disembunyikan - lead sekarang ada di /pipelines/2.
    { id: "contacts", label: "Kontak", icon: Contact, path: "/contacts", permission: "contacts" },
    { id: "prospects", label: "Prospect Finder", icon: Search, path: "/prospects", permission: "prospects" },
    { id: "loyalty", label: "JABNET Sahabat", icon: Heart, path: "/loyalty", permission: "loyalty_admin" },
  ];

  const assetItems: CommandItemDef[] = [
    { id: "pops", label: "POP", icon: Radio, path: "/pops", permission: "pops" },
    { id: "odcs", label: "ODC", icon: Box, path: "/odcs", permission: "odcs" },
    { id: "odps", label: "ODP", icon: CircleDot, path: "/odps", permission: "odps" },
    { id: "poles", label: "Tiang", icon: Landmark, path: "/poles", permission: "poles" },
    { id: "cables", label: "Kabel", icon: Cable, path: "/cables", permission: "cables" },
    { id: "otbs", label: "OTB Manager", icon: Server, path: "/otb-manager", permission: "otbs" },
    { id: "bestrays", label: "Bestray", icon: Rows3, path: "/bestray-manager", permission: "bestrays" },
    { id: "splitters", label: "Splitter", icon: Split, path: "/splitters", permission: "splitters" },
    { id: "cores", label: "Core Manager", icon: Cpu, path: "/cable-cores", permission: "cable_cores" },
    { id: "core-conn", label: "Koneksi Core", icon: Link2, path: "/core-connections", permission: "core_connections" },
  ];

  const billingItems: CommandItemDef[] = [
    { id: "tickets", label: "Work Order / Tiket", icon: ClipboardList, path: "/tickets", permission: "tickets" },
    { id: "collections", label: "Collection (Penagihan)", icon: AlertCircle, path: "/collections", permission: "collections" },
    { id: "packages", label: "Paket Internet", icon: Package, path: "/billing/packages", permission: "packages" },
    { id: "sessions", label: "Sesi Aktif", icon: Activity, path: "/billing/sessions", permission: "sessions" },
    { id: "monitoring", label: "Monitoring", icon: BarChart3, path: "/billing/monitoring", permission: "monitoring" },
    { id: "routers", label: "Router MikroTik", icon: Wifi, path: "/billing/routers", permission: "routers" },
    { id: "devices", label: "Perangkat ONT", icon: Cpu, path: "/devices", permission: "devices" },
  ];

  const toolsItems: CommandItemDef[] = [
    { id: "pipelines", label: "Pipelines", icon: Kanban, path: "/pipelines", permission: "pipelines", keywords: ["pipeline", "kanban", "board", "workflow"] },
    { id: "chain", label: "Splitter Chain", icon: GitBranch, path: "/splitter-chain", permission: "splitter_chain" },
    { id: "power", label: "Power Budget", icon: Calculator, path: "/power-budget", permission: "power_budget" },
    { id: "export", label: "Export / Import", icon: FileSpreadsheet, path: "/export-import", permission: "export_import" },
    { id: "bisnis", label: "Keputusan Bisnis", icon: TrendingUp, path: "/marketing/bisnis", permission: "marketing_dashboard" },
    { id: "ads", label: "Marketing Ads", icon: Megaphone, path: "/marketing/ads", permission: "marketing_ads" },
  ];

  const teamspaceItems: CommandItemDef[] = [
    { id: "ts-teams", label: "Tim Saya", icon: UsersRound, path: "/teamspace/teams", permission: "team_tasks", keywords: ["teamspace", "tim", "team", "ruangan"] },
    { id: "ts-tasks", label: "Semua Tugas", icon: SquareCheckBig, path: "/teamspace/tasks", permission: "team_tasks", keywords: ["teamspace", "tugas", "task", "todo"] },
    { id: "ts-perf", label: "Laporan Kinerja", icon: BarChart3, path: "/teamspace/performance", permission: "performance_reports", keywords: ["teamspace", "kinerja", "performance", "report", "kpi"] },
    { id: "ts-cheers", label: "Cheers", icon: Trophy, path: "/teamspace/cheers", permission: "cheers", keywords: ["teamspace", "cheers", "apresiasi"] },
  ];

  const adminItems: CommandItemDef[] = [
    { id: "mitra", label: "Kelola Mitra", icon: Building2, path: "/mitra", requireSystemAdmin: true, keywords: ["mitra", "tenant", "reseller", "owner"] },
    { id: "users", label: "Manajemen User", icon: UserCog, path: "/users", permission: "user_management" },
    { id: "roles", label: "Manajemen Role", icon: UserCog, path: "/roles", permission: "user_management" },
    { id: "audit", label: "Activity Log", icon: ClipboardList, path: "/audit-logs", permission: "audit_logs" },
    { id: "integrations", label: "Integrasi API", icon: Link2, path: "/integrations", permission: "integrations" },
    { id: "apikeys", label: "Public API Keys", icon: KeyRound, path: "/api-keys", permission: "api_keys" },
    { id: "mpwa", label: "MPWA WhatsApp", icon: MessageCircle, path: "/mpwa", permission: "mpwa" },
    { id: "announce", label: "Pengumuman", icon: Megaphone, path: "/announcements" },
    { id: "bugs", label: "Lapor Bug", icon: Bug, path: "/bugs" },
  ];

  const quickActions: CommandItemDef[] = [
    { id: "profile", label: "Profil Saya", icon: User, action: () => runCommand(() => setLocation("/profile")) },
    {
      id: "theme",
      label: darkMode ? "Pakai Light Mode" : "Pakai Dark Mode",
      icon: darkMode ? Sun : Moon,
      action: () => {
        toggleTheme();
        onOpenChange(false);
      },
    },
    {
      id: "logout",
      label: "Keluar dari sesi",
      icon: LogOut,
      action: () => runCommand(async () => {
        await logout();
        setLocation("/login");
      }),
    },
  ];

  // Terakhir Dikunjungi: resolve path riwayat → item nav dikenal (permission-aware, skip halaman aktif)
  const allNavDefs = [...navigationItems, ...assetItems, ...billingItems, ...toolsItems, ...teamspaceItems, ...adminItems];
  const recentItems = recents
    .filter((p) => p !== location)
    .map((p) => allNavDefs.find((i) => i.path === p))
    .filter((i): i is CommandItemDef => !!i)
    .filter((i) => (!i.requireSystemAdmin || isSysAdmin) && (!i.permission || canRead(i.permission)))
    .slice(0, 5);

  const filterByPerm = (items: CommandItemDef[]) =>
    items.filter((item) => {
      if (item.requireSystemAdmin && !isSysAdmin) return false;
      return !item.permission || canRead(item.permission);
    });

  const renderGroup = (heading: string, items: CommandItemDef[]) => {
    const visible = filterByPerm(items);
    if (visible.length === 0) return null;
    return (
      <CommandGroup heading={heading}>
        {visible.map((item) => (
          <CommandItem
            key={item.id}
            value={`${item.label} ${item.keywords?.join(" ") || ""}`}
            onSelect={() => {
              if (item.action) item.action();
              else if (item.path) navigate(item.path);
            }}
          >
            <item.icon />
            <span>{item.label}</span>
            {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
          </CommandItem>
        ))}
      </CommandGroup>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 max-w-xl border-border/60 shadow-elev-lg">
        <VisuallyHidden.Root>
          <DialogTitle>Pencarian Global</DialogTitle>
          <DialogDescription>
            Cari halaman, fitur, atau jalankan aksi cepat dengan keyboard.
          </DialogDescription>
        </VisuallyHidden.Root>
        <Command className="rounded-lg" filter={(value, search) => {
          if (!search) return 1;
          return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
        }}>
          <CommandInput placeholder="Cari halaman, tugas, tim, dokumen..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>
              <div className="flex flex-col items-center gap-2 py-6">
                <Search className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Tidak ada hasil ditemukan.</p>
                <p className="text-xs text-muted-foreground/60">Coba kata kunci lain.</p>
              </div>
            </CommandEmpty>
            {/* Terakhir Dikunjungi: lompat balik cepat ke halaman yang baru dibuka */}
            {!search && recentItems.length > 0 && (
              <>
                <CommandGroup heading="Terakhir Dikunjungi">
                  {recentItems.map((item) => (
                    <CommandItem key={`recent-${item.id}`} value={`riwayat-${item.label}`} onSelect={() => item.path && navigate(item.path)}>
                      <History />
                      <span>{item.label}</span>
                      <span className="ml-auto text-2xs text-muted-foreground">Riwayat</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {/* Search All Teamspace (gaya Cicle): hasil konten live - value diberi suffix
                search agar lolos filter cmdk (match tim bisa dari deskripsi). */}
            {tsResults && (tsResults.teams.length + tsResults.cards.length + tsResults.docs.length) > 0 && (
              <>
                <CommandGroup heading="Teamspace - Hasil Pencarian">
                  {tsResults.teams.map((t) => (
                    <CommandItem key={`ts-team-${t.id}`} value={`${t.name} ${search}`} onSelect={() => navigate(`/teamspace/teams/${t.id}`)}>
                      <UsersRound />
                      <span>{t.name}</span>
                      <span className="ml-auto text-2xs text-muted-foreground">Tim</span>
                    </CommandItem>
                  ))}
                  {tsResults.cards.map((c) => (
                    <CommandItem key={`ts-card-${c.id}`} value={`${c.title} ${search}`} onSelect={() => navigate(`/teamspace/boards/${c.pipelineId}?card=${c.id}`)}>
                      <SquareCheckBig />
                      <span className="truncate">{c.title}</span>
                      <span className="ml-auto shrink-0 text-2xs text-muted-foreground">Tugas · {c.teamName}</span>
                    </CommandItem>
                  ))}
                  {tsResults.docs.map((d) => (
                    <CommandItem key={`ts-doc-${d.id}`} value={`${d.title} ${search}`} onSelect={() => navigate(`/teamspace/teams/${d.teamId}?tab=docs`)}>
                      <FileText />
                      <span className="truncate">{d.title}</span>
                      <span className="ml-auto shrink-0 text-2xs text-muted-foreground">Dokumen · {d.teamName}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {renderGroup("Navigasi Utama", navigationItems)}
            <CommandSeparator />
            {renderGroup("Teamspace", teamspaceItems)}
            <CommandSeparator />
            {renderGroup("Aset Jaringan", assetItems)}
            <CommandSeparator />
            {renderGroup("Billing & Operations", billingItems)}
            <CommandSeparator />
            {renderGroup("Tools & Utilitas", toolsItems)}
            <CommandSeparator />
            {renderGroup("Administrasi", adminItems)}
            <CommandSeparator />
            <CommandGroup heading="Aksi Cepat">
              {quickActions.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.label}
                  onSelect={() => item.action?.()}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>

          {/* Footer with shortcut hints */}
          <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-border/60 bg-muted/20 text-2xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="inline-flex items-center justify-center h-4 px-1 rounded bg-background border border-border/60 font-mono-tight">↑↓</kbd>
                navigasi
              </span>
              <span className="flex items-center gap-1">
                <kbd className="inline-flex items-center justify-center h-4 px-1 rounded bg-background border border-border/60 font-mono-tight">⏎</kbd>
                pilih
              </span>
              <span className="flex items-center gap-1">
                <kbd className="inline-flex items-center justify-center h-4 px-1 rounded bg-background border border-border/60 font-mono-tight">esc</kbd>
                tutup
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span>Tekan</span>
              <kbd className="inline-flex items-center justify-center h-4 px-1 rounded bg-background border border-border/60 font-mono-tight">⌘K</kbd>
              <span>kapan saja</span>
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
