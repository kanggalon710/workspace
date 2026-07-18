import { useLocation } from "wouter";
import {
  LayoutDashboard, Map, Radio, Box, CircleDot,
  Users, Landmark, Cable, Moon, Sun, Menu, X,
  Server, Rows3, Split, Cpu, Calculator, Link2, GitBranch, FileSpreadsheet,
  ClipboardList, LogOut, UserCog, PanelLeftClose, PanelLeftOpen,
  MapPinned, ListChecks, Search, BarChart3, Contact, TrendingUp, ChevronRight,
  ChevronDown, Network, Wrench, Megaphone, Settings,
  Router, Wifi, Activity, Package, AlertCircle, MessageCircle, Camera, Heart, KeyRound,
  Bug, Building2, Kanban, MessageSquare, UsersRound, CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";

// ─── Types ───
type NavItem = {
  label: string;
  path?: string;             // optional: kalau ada children, path bisa kosong (parent collapsible)
  icon: any;
  roles?: string[];
  permission?: string;
  requireSystemAdmin?: boolean;  // true = hanya JABNET system admin yang lihat item ini
  children?: NavItem[];      // v4.2.20: support nested submenu (1 level)
};
type NavGroup = {
  key: string;           // unique key for state tracking
  label: string;
  icon: any;             // group-level icon
  roles?: string[];
  collapsible?: boolean; // false = always visible (e.g. Dashboard)
  items: NavItem[];
};

// ─── Navigation Structure ───
const navGroups: NavGroup[] = [
  {
    key: "utama", label: "Utama", icon: LayoutDashboard, collapsible: false,
    items: [
      { label: "Dashboard", path: "/", icon: LayoutDashboard, permission: "dashboard" },
      { label: "Peta Jaringan", path: "/map", icon: Map, permission: "map" },
    ],
  },
  {
    // Restrukturisasi (feedback user): SEMUA yang terkait aset jaringan berkumpul di sini —
    // aset fisik + Core Management + tools jaringan sebagai sub-menu (tab) collapsible.
    key: "aset", label: "Aset Jaringan", icon: Network,
    items: [
      { label: "POP", path: "/pops", icon: Radio, permission: "pops" },
      { label: "ODC", path: "/odcs", icon: Box, permission: "odcs" },
      { label: "ODP", path: "/odps", icon: CircleDot, permission: "odps" },
      { label: "Tiang", path: "/poles", icon: Landmark, permission: "poles" },
      { label: "Kabel", path: "/cables", icon: Cable, permission: "cables" },
      {
        label: "Core Management",
        icon: Cpu,
        children: [
          { label: "OTB Manager", path: "/otb-manager", icon: Server, permission: "otbs" },
          { label: "Bestray", path: "/bestray-manager", icon: Rows3, permission: "bestrays" },
          { label: "Splitter", path: "/splitters", icon: Split, permission: "splitters" },
          { label: "Core Manager", path: "/cable-cores", icon: Cpu, permission: "cable_cores" },
          { label: "Koneksi Core", path: "/core-connections", icon: Link2, permission: "core_connections" },
        ],
      },
      {
        label: "Tools Jaringan",
        icon: Wrench,
        children: [
          { label: "Splitter Chain", path: "/splitter-chain", icon: GitBranch, permission: "splitter_chain" },
          { label: "Power Budget", path: "/power-budget", icon: Calculator, permission: "power_budget" },
          { label: "Export / Import", path: "/export-import", icon: FileSpreadsheet, permission: "export_import" },
        ],
      },
    ],
  },
  {
    key: "marketing", label: "Marketing", icon: Megaphone,
    items: [
      // ── Overview ──
      { label: "Dashboard Marketing", path: "/marketing", icon: BarChart3, permission: "marketing_dashboard" },
      // ── Lead Generation (top of funnel) ──
      { label: "Canvassing Lapangan", path: "/canvassing", icon: MapPinned, permission: "canvassing" },
      { label: "Prospect Finder", path: "/prospects", icon: Search, permission: "prospects" },
      // ── Pipeline Management ──
      // "Lead Pipeline" (/leads) disembunyikan — lead sekarang mengalir ke /pipelines/2 (Leads Marketing).
      // Route masih aktif di App.tsx untuk akses langsung; cukup hapus dari nav.
      { label: "Database Kontak", path: "/contacts", icon: Contact, permission: "contacts" },
      // ── Field Analytics ──
      { label: "Riwayat Sesi", path: "/canvassing/history", icon: ClipboardList, permission: "canvassing" },
      { label: "Laporan Lapangan", path: "/canvassing/reports", icon: Camera, permission: "canvassing" },
      { label: "Area Insights", path: "/marketing/bisnis", icon: TrendingUp, permission: "marketing_dashboard" },
      // ── Campaigns ──
      { label: "Iklan & Kampanye", path: "/marketing/ads", icon: Megaphone, permission: "marketing_ads" },
    ],
  },
  {
    // Feedback user: Pipelines berdiri sendiri, tidak bergabung di Tools.
    key: "pipelines", label: "Pipelines", icon: Kanban,
    items: [
      { label: "Pipelines", path: "/pipelines", icon: Kanban, permission: "pipelines" },
    ],
  },
  {
    key: "billing", label: "Billing", icon: Package,
    items: [
      { label: "Pelanggan", path: "/customers", icon: Users, permission: "customers" },
      { label: "Komunikasi", path: "/communications", icon: MessageSquare, permission: "chatwoot" },
      { label: "Paket Internet", path: "/billing/packages", icon: Package, permission: "packages" },
      { label: "Work Order", path: "/tickets", icon: ClipboardList, permission: "tickets" },
      { label: "Collection (Penagihan)", path: "/collections", icon: AlertCircle, permission: "collections" },
      { label: "JABNET Sahabat", path: "/loyalty", icon: Heart, permission: "loyalty_admin" },
    ],
  },
  {
    key: "mikrotik", label: "MikroTik", icon: Router,
    items: [
      { label: "Sesi Aktif", path: "/billing/sessions", icon: Activity, permission: "sessions" },
      { label: "Perangkat ONT", path: "/devices", icon: Cpu, permission: "devices" },
      { label: "Monitoring", path: "/billing/monitoring", icon: BarChart3, permission: "monitoring" },
      { label: "Router MikroTik", path: "/billing/routers", icon: Wifi, permission: "routers" },
    ],
  },
  {
    // v4.2.20 (PRD WA Feature v2): Notifikasi group dengan parent collapsible Whatsapp
    key: "notifikasi", label: "Notifikasi", icon: MessageCircle,
    items: [
      {
        label: "Whatsapp",
        icon: MessageCircle,
        permission: "whatsapp",
        children: [
          { label: "Nomor Whatsapp",       path: "/whatsapp/devices",            icon: MessageCircle, permission: "whatsapp" },
          { label: "Template Whatsapp",    path: "/whatsapp/templates",          icon: MessageCircle, permission: "whatsapp" },
          { label: "Phonebook",            path: "/whatsapp/phonebook",          icon: MessageCircle, permission: "phonebooks" },
          { label: "Broadcast Pelanggan",  path: "/whatsapp/broadcast/pelanggan", icon: Megaphone,    permission: "whatsapp" },
          { label: "Broadcast Reseller",   path: "/whatsapp/broadcast/reseller",  icon: Megaphone,    permission: "whatsapp" },
        ],
      },
    ],
  },
  {
    // Teamspace v5.0 — kolaborasi tim internal (PRD-JABNET-TEAMSPACE.md)
    key: "teamspace", label: "Teamspace", icon: UsersRound,
    items: [
      { label: "Semua Tugas", path: "/teamspace/tasks", icon: CheckSquare, permission: "team_tasks" },
      { label: "Tim Saya", path: "/teamspace/teams", icon: UsersRound, permission: "team_tasks" },
      { label: "Laporan Kinerja", path: "/teamspace/performance", icon: BarChart3, permission: "performance_reports" },
      { label: "Cheers", path: "/teamspace/cheers", icon: Heart, permission: "cheers" },
    ],
  },
  {
    key: "manajemen", label: "Integrasi & Tools", icon: Settings,
    items: [
      { label: "Pengumuman", path: "/announcements", icon: Megaphone },
      { label: "Lapor Bug", path: "/bugs", icon: Bug },
      { label: "Integrasi API", path: "/integrations", icon: Link2, permission: "integrations" },
      { label: "Public API (Open API)", path: "/api-keys", icon: KeyRound, permission: "api_keys" },
      { label: "Activity & Produktivitas", path: "/audit-logs", icon: ClipboardList, permission: "audit_logs" },
      { label: "Kelola Mitra", path: "/mitra", icon: Building2, requireSystemAdmin: true },
      { label: "Manajemen User", path: "/users", icon: UserCog, permission: "user_management" },
      { label: "Manajemen Role", path: "/roles", icon: UserCog, permission: "user_management" },
    ],
  },
];

// ─── Helpers ───
function isPathActive(location: string, path: string): boolean {
  if (path === "/") return location === "/";
  // Exact match only — prevents /canvassing matching /canvassing/history
  return location === path;
}

function findActiveGroup(location: string, groups: NavGroup[]): string | null {
  for (const g of groups) {
    for (const item of g.items) {
      if (location === item.path || location.startsWith(item.path + "/")) return g.key;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
export function Sidebar() {
  const [location, setLocation] = useLocation();
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  const { user, logout, canRead } = useAuth();
  const { collapsed, toggle, mobileOpen, setMobileOpen } = useSidebar();

  // ── Collapsible state: set of expanded group keys ──
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const active = findActiveGroup(location, navGroups);
    return new Set(active ? [active] : []);
  });

  // Auto-expand group when navigating to a page in a collapsed group
  useEffect(() => {
    const activeGroup = findActiveGroup(location, navGroups);
    if (activeGroup && !expanded.has(activeGroup)) {
      setExpanded(prev => new Set([...prev, activeGroup]));
    }
  }, [location]);

  const toggleGroup = useCallback((key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    setDarkMode(!darkMode);
  };

  // Permission-based filtering via role (canRead handles system admin + permLevels + legacy array)
  const hasPerm = (p?: string) => !p || canRead(p);
  const isSysAdmin = !!user?.isSystemAdmin;
  // Combined visibility: permission check + system-admin gate
  const isItemVisible = (item: NavItem) => {
    if (item.requireSystemAdmin && !isSysAdmin) return false;
    return hasPerm(item.permission);
  };

  const visibleGroups = navGroups
    .map(group => ({
      ...group,
      items: group.items
        .map(item => {
          if (item.children) {
            // v4.2.20: filter children by permission, kalau ada parent permission check itu juga
            const visibleChildren = item.children.filter(isItemVisible);
            return { ...item, children: visibleChildren };
          }
          return item;
        })
        .filter(item => {
          // Parent dengan children: visible kalau salah satu child visible
          if (item.children) return item.children.length > 0;
          return isItemVisible(item);
        }),
    }))
    .filter(group => group.items.length > 0);

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo — refined enterprise header */}
      <div className="px-4 py-4 border-b border-white/10 relative overflow-hidden">
        {/* Subtle gradient accent */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="relative flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shrink-0 shadow-elev-md ring-1 ring-white/15">
            <Radio className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-black text-sm text-white tracking-tight leading-none">JABNET</h1>
            <p className="text-[10px] text-white/50 uppercase tracking-[0.15em] font-semibold mt-0.5">
              Fiber Operations
            </p>
          </div>
          <button
            onClick={toggle}
            className="hidden md:flex w-7 h-7 rounded-md items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all shrink-0"
            title={collapsed ? "Tampilkan sidebar" : "Sembunyikan sidebar"}
            aria-label={collapsed ? "Tampilkan sidebar" : "Sembunyikan sidebar"}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Navigation (fully scrollable) */}
      <nav className="flex-1 p-3 overflow-y-auto space-y-1">
        {visibleGroups.map((group) => {
          const isCollapsible = group.collapsible !== false;
          const isExpanded = !isCollapsible || expanded.has(group.key);
          const GroupIcon = group.icon;

          // Check if any item (or nested child) in this group is active
          const hasActiveChild = group.items.some(item => {
            if (item.path && isPathActive(location, item.path)) return true;
            if (item.children) return item.children.some(c => c.path && isPathActive(location, c.path));
            return false;
          });

          return (
            <div key={group.key}>
              {isCollapsible ? (
                /* ── Collapsible group header ── */
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all",
                    hasActiveChild && !isExpanded
                      ? "text-primary bg-primary/10"
                      : "text-white/50 hover:text-white/80 hover:bg-white/5"
                  )}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{group.label}</span>
                  {/* Item count badge when collapsed */}
                  {!isExpanded && (
                    <span className={cn(
                      "text-[9px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center",
                      hasActiveChild
                        ? "bg-primary/30 text-primary"
                        : "bg-white/10 text-white/40"
                    )}>
                      {group.items.length}
                    </span>
                  )}
                  <ChevronDown className={cn(
                    "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
                    isExpanded ? "rotate-0" : "-rotate-90"
                  )} />
                </button>
              ) : (
                /* ── Non-collapsible group label ── */
                <p className="text-[10px] uppercase text-white/40 px-3 mb-1 font-semibold tracking-wider">
                  {group.label}
                </p>
              )}

              {/* ── Child items (animated expand/collapse) ── */}
              <div
                className={cn(
                  "overflow-hidden transition-all duration-200 ease-in-out",
                  isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
                )}
              >
                <div className={cn("space-y-0.5", isCollapsible ? "mt-0.5 ml-2 pl-2 border-l border-white/10" : "")}>
                  {group.items.map((item) => {
                    const itemKey = `${group.key}-${item.label}`;
                    // v4.2.20: nested children (sub-menu collapsible)
                    if (item.children && item.children.length > 0) {
                      const subExpanded = expanded.has(itemKey);
                      const hasActiveSubChild = item.children.some(c => c.path && isPathActive(location, c.path));
                      // Filter children by permission + system-admin gate
                      const visibleChildren = item.children.filter(isItemVisible);
                      if (visibleChildren.length === 0) return null;
                      return (
                        <div key={itemKey}>
                          <button
                            type="button"
                            onClick={() => toggleGroup(itemKey)}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all",
                              hasActiveSubChild
                                ? "text-primary bg-primary/10 font-medium"
                                : "text-white/70 hover:text-white hover:bg-white/10"
                            )}
                          >
                            <item.icon className="h-4 w-4 shrink-0" />
                            <span className="flex-1 text-left truncate">{item.label}</span>
                            <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", subExpanded ? "rotate-0" : "-rotate-90")} />
                          </button>
                          <div className={cn("overflow-hidden transition-all duration-200", subExpanded ? "max-h-[500px] opacity-100 mt-0.5" : "max-h-0 opacity-0")}>
                            <div className="ml-2 pl-2 border-l border-white/10 space-y-0.5">
                              {visibleChildren.map(child => {
                                const isActive = child.path ? isPathActive(location, child.path) : false;
                                return (
                                  <button
                                    key={child.path ?? child.label}
                                    onClick={() => { if (child.path) { setLocation(child.path); setMobileOpen(false); } }}
                                    className={cn(
                                      "w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] transition-all",
                                      isActive
                                        ? "bg-primary text-white font-medium"
                                        : "text-white/60 hover:text-white hover:bg-white/10"
                                    )}
                                  >
                                    <span className="text-white/30">○</span>
                                    <span className="truncate">{child.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    // ── Leaf item (no children) ──
                    if (!item.path) return null;
                    const isActive = isPathActive(location, item.path);
                    return (
                      <button
                        key={item.path}
                        onClick={() => { setLocation(item.path!); setMobileOpen(false); }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all",
                          isActive
                            ? "bg-primary text-white font-medium"
                            : "text-white/70 hover:text-white hover:bg-white/10"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 min-w-0 truncate text-left">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {/* ── User Info + Actions ── */}
        <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
          {user && (() => {
            const isProfileActive = location === "/profile";
            return (
              <button
                onClick={() => { setLocation("/profile"); setMobileOpen(false); }}
                className={cn(
                  "group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all mb-1 text-left",
                  isProfileActive
                    ? "bg-primary/20 ring-1 ring-primary/40 shadow-elev-sm"
                    : "bg-white/[0.03] hover:bg-white/[0.08] border border-white/5"
                )}
                title="Buka profil saya"
              >
                <div className="relative shrink-0">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-400 via-primary to-blue-600 flex items-center justify-center text-white font-black text-sm ring-2 ring-white/10 shadow-elev-sm overflow-hidden">
                    {(user as any)?.photoUrl ? (
                      <img src={(user as any).photoUrl} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      user.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  {/* Online dot */}
                  <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-sidebar" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate tracking-tight">{user.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/25 text-sky-200 font-semibold">
                      {user.role}
                    </span>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-white/40 group-hover:text-white/80 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            );
          })()}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/10 transition-all"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {darkMode ? "Light Mode" : "Dark Mode"}
          </button>
          {user && (
            <button
              onClick={async () => { await logout(); setLocation("/login"); }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/70 hover:text-white hover:bg-red-500/20 transition-all"
            >
              <LogOut className="h-4 w-4" />
              Keluar
            </button>
          )}

          {/* ── Version footer ── */}
          <div className="flex items-center justify-between gap-2 px-3 pt-3 mt-2 border-t border-white/5">
            <div className="flex items-center gap-1.5 text-[10px] text-white/40">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success pulse-ring-success" />
              <span className="font-medium tracking-wider">v4.2.1</span>
            </div>
            <span className="text-[9px] text-white/30 uppercase tracking-widest font-semibold">
              JABNET · Garut
            </span>
          </div>
        </div>
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile overlay — hamburger lives in TopBar */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 md:hidden backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-[60] h-screen w-64 bg-sidebar transition-transform duration-300",
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
          collapsed ? "md:-translate-x-full" : "md:translate-x-0"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop expand button — visible only when collapsed */}
      {collapsed && (
        <button
          onClick={toggle}
          className="hidden md:flex fixed left-0 top-1/2 -translate-y-1/2 z-[59] w-6 h-14 bg-sidebar rounded-r-lg items-center justify-center text-white/70 hover:text-white hover:w-8 transition-all shadow-lg"
          title="Tampilkan sidebar"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      )}
    </>
  );
}
