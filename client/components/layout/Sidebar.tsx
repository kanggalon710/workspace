import { useLocation } from "wouter";
import {
  LayoutDashboard, Map, Radio, Box, CircleDot,
  Users, Landmark, Cable, Moon, Sun, Menu, X,
  Server, Rows3, Split, Cpu, Calculator, Link2, GitBranch, FileSpreadsheet,
  ClipboardList, LogOut, UserCog, PanelLeftClose, PanelLeftOpen,
  MapPinned, ListChecks, Search, BarChart3, Contact, TrendingUp, ChevronRight,
  ChevronDown, Network, Wrench, Megaphone, Settings,
  Router, Wifi, Activity, Package, AlertCircle, MessageCircle, Camera, Heart, KeyRound,
  Bug, Building2, Kanban, MessageSquare, UsersRound, CheckSquare, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import { DIVISIONS } from "@/lib/divisions";

// ─── Types ───
type NavItem = {
  label: string;
  path?: string;             // optional: kalau ada children, path bisa kosong (parent collapsible)
  icon: any;
  roles?: string[];
  permission?: string;
  requireSystemAdmin?: boolean;  // true = hanya JABNET system admin yang lihat item ini
  children?: NavItem[];      // v4.2.20: support nested submenu (1 level)
  hub?: boolean;             // v5.1: item Beranda divisi — tidak membuat group visible sendirian
};
type NavGroup = {
  key: string;           // unique key for state tracking
  label: string;
  icon: any;             // group-level icon
  roles?: string[];
  collapsible?: boolean; // false = always visible (e.g. Dashboard)
  items: NavItem[];
};

// ─── Navigation Structure (v5.1: berbasis DIVISI — sumber: client/lib/divisions.ts) ───
const divisionGroups: NavGroup[] = DIVISIONS.map((d) => ({
  key: `div-${d.key}`,
  label: d.short,
  icon: d.icon,
  items: [
    // Item hub selalu lolos filter izin — group tetap disembunyikan bila TIDAK ada
    // modul lain yang visible (lihat filter hub-only di visibleGroups).
    { label: `Beranda ${d.short}`, path: `/divisi/${d.key}`, icon: d.icon, hub: true },
    ...(d.modules as NavItem[]),
  ],
}));

const navGroups: NavGroup[] = [
  {
    key: "utama", label: "Utama", icon: LayoutDashboard, collapsible: false,
    items: [
      { label: "Beranda", path: "/", icon: LayoutDashboard },
    ],
  },
  ...divisionGroups,
  {
    // Feedback user: Pipelines berdiri sendiri.
    key: "pipelines", label: "Pipelines", icon: Kanban,
    items: [
      { label: "Pipelines", path: "/pipelines", icon: Kanban, permission: "pipelines" },
    ],
  },
  {
    key: "manajemen", label: "Integrasi & Tools", icon: Settings,
    items: [
      { label: "Pengumuman", path: "/announcements", icon: Megaphone },
      { label: "Lapor Bug", path: "/bugs", icon: Bug },
      { label: "Integrasi API", path: "/integrations", icon: Link2, permission: "integrations" },
      { label: "Public API (Open API)", path: "/api-keys", icon: KeyRound, permission: "api_keys" },
      { label: "Kelola Mitra", path: "/mitra", icon: Building2, requireSystemAdmin: true },
    ],
  },
];

// ─── Favorit + persist state (localStorage, per-browser) ───
const FAV_KEY = "jabnet_nav_favorites";
const EXP_KEY = "jabnet_nav_expanded";

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function saveJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage penuh/blocked — abaikan */ }
}

type FlatLeaf = { label: string; path: string; icon: any; groupLabel: string };

/** Flatten semua leaf (termasuk nested children) yang visible — dipakai filter & Favorit. */
function flattenLeaves(groups: NavGroup[]): FlatLeaf[] {
  const out: FlatLeaf[] = [];
  for (const g of groups) {
    for (const item of g.items) {
      if (item.children) {
        for (const c of item.children) if (c.path) out.push({ label: c.label, path: c.path, icon: c.icon, groupLabel: `${g.label} · ${item.label}` });
      } else if (item.path) {
        out.push({ label: item.label, path: item.path, icon: item.icon, groupLabel: g.label });
      }
    }
  }
  return out;
}

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

  // ── Collapsible state: set of expanded group keys (persist per-browser) ──
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const saved = loadJson<string[]>(EXP_KEY, []);
    const active = findActiveGroup(location, navGroups);
    return new Set(active ? [...saved, active] : saved);
  });
  useEffect(() => { saveJson(EXP_KEY, [...expanded]); }, [expanded]);

  // ── Favorit (pin) + quick filter ──
  const [favorites, setFavorites] = useState<string[]>(() => loadJson<string[]>(FAV_KEY, []));
  const toggleFavorite = useCallback((path: string) => {
    setFavorites((prev) => {
      const next = prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path];
      saveJson(FAV_KEY, next);
      return next;
    });
  }, []);
  const [navQuery, setNavQuery] = useState("");

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
    .filter(group => group.items.some(item => !item.hub));   // group tampil hanya bila ada modul non-hub yang visible

  // Flatten leaf visible → dipakai Favorit (permission-aware) + quick filter.
  const flatLeaves = useMemo(() => flattenLeaves(visibleGroups), [visibleGroups]);
  const favLeaves = useMemo(
    () => favorites.map((p) => flatLeaves.find((l) => l.path === p)).filter((x): x is FlatLeaf => !!x),
    [favorites, flatLeaves],
  );
  const q = navQuery.trim().toLowerCase();
  const filteredLeaves = q
    ? flatLeaves.filter((l) => l.label.toLowerCase().includes(q) || l.groupLabel.toLowerCase().includes(q))
    : null;

  /** Baris menu flat (dipakai Favorit + hasil filter) dengan tombol pin di hover. */
  const renderFlatLeaf = (leaf: FlatLeaf, showGroup: boolean) => {
    const isActive = isPathActive(location, leaf.path);
    const isFav = favorites.includes(leaf.path);
    const LeafIcon = leaf.icon;
    return (
      <div key={leaf.path} className="group/item relative">
        <button
          onClick={() => { setLocation(leaf.path); setMobileOpen(false); setNavQuery(""); }}
          className={cn(
            "w-full flex items-center gap-2.5 pl-3 pr-7 py-2 rounded-lg text-sm transition-all",
            isActive ? "bg-primary text-white font-medium shadow-elev-sm" : "text-white/70 hover:text-white hover:bg-white/10"
          )}
        >
          <LeafIcon className="h-4 w-4 shrink-0" />
          <span className="flex-1 min-w-0 text-left">
            <span className="block truncate">{leaf.label}</span>
            {showGroup && <span className={cn("block truncate text-[9px] uppercase tracking-wider", isActive ? "text-white/60" : "text-white/30")}>{leaf.groupLabel}</span>}
          </span>
        </button>
        <button
          type="button"
          aria-label={isFav ? `Hapus ${leaf.label} dari Favorit` : `Pin ${leaf.label} ke Favorit`}
          onClick={(e) => { e.stopPropagation(); toggleFavorite(leaf.path); }}
          className={cn(
            "absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 transition-all",
            isFav ? "flex text-amber-400" : "hidden group-hover/item:flex text-white/40 hover:text-amber-300"
          )}
        >
          <Star className={cn("h-3 w-3", isFav && "fill-current")} />
        </button>
      </div>
    );
  };

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

      {/* Quick filter menu */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40 pointer-events-none" />
          <input
            value={navQuery}
            onChange={(e) => setNavQuery(e.target.value)}
            placeholder="Filter menu…"
            className="w-full rounded-lg bg-white/5 border border-white/10 pl-8 pr-7 py-1.5 text-sm text-white placeholder:text-white/35 outline-none focus:border-primary/60 focus:bg-white/10 transition-colors"
          />
          {navQuery && (
            <button
              type="button"
              aria-label="Bersihkan filter menu"
              onClick={() => setNavQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation (fully scrollable) */}
      <nav className="flex-1 p-3 overflow-y-auto space-y-1">
        {/* ── Hasil filter (flat, semua grup) ── */}
        {filteredLeaves && (
          <div className="space-y-0.5">
            {filteredLeaves.length === 0 ? (
              <p className="px-3 py-4 text-xs text-white/40">Tidak ada menu cocok "{navQuery}".</p>
            ) : (
              filteredLeaves.map((l) => renderFlatLeaf(l, true))
            )}
          </div>
        )}

        {/* ── Favorit (pinned, persist per-browser) ── */}
        {!filteredLeaves && favLeaves.length > 0 && (
          <div>
            <p className="text-[10px] uppercase text-amber-300/70 px-3 mb-1 font-semibold tracking-wider flex items-center gap-1.5">
              <Star className="h-3 w-3 fill-current" /> Favorit
            </p>
            <div className="space-y-0.5 mb-2">
              {favLeaves.map((l) => renderFlatLeaf(l, false))}
            </div>
          </div>
        )}

        {!filteredLeaves && visibleGroups.map((group) => {
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
                                const isFav = child.path ? favorites.includes(child.path) : false;
                                return (
                                  <div key={child.path ?? child.label} className="group/item relative">
                                    <button
                                      onClick={() => { if (child.path) { setLocation(child.path); setMobileOpen(false); } }}
                                      className={cn(
                                        "w-full flex items-center gap-2 pl-3 pr-7 py-1.5 rounded-md text-[13px] transition-all",
                                        isActive
                                          ? "bg-primary text-white font-medium"
                                          : "text-white/60 hover:text-white hover:bg-white/10"
                                      )}
                                    >
                                      <span className="text-white/30">○</span>
                                      <span className="truncate">{child.label}</span>
                                    </button>
                                    {child.path && (
                                      <button
                                        type="button"
                                        aria-label={isFav ? `Hapus ${child.label} dari Favorit` : `Pin ${child.label} ke Favorit`}
                                        onClick={(e) => { e.stopPropagation(); toggleFavorite(child.path!); }}
                                        className={cn(
                                          "absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 transition-all",
                                          isFav ? "flex text-amber-400" : "hidden group-hover/item:flex text-white/40 hover:text-amber-300"
                                        )}
                                      >
                                        <Star className={cn("h-3 w-3", isFav && "fill-current")} />
                                      </button>
                                    )}
                                  </div>
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
                    const isFav = favorites.includes(item.path);
                    return (
                      <div key={item.path} className="group/item relative">
                        <button
                          onClick={() => { setLocation(item.path!); setMobileOpen(false); }}
                          className={cn(
                            "w-full flex items-center gap-2.5 pl-3 pr-7 py-2 rounded-lg text-sm transition-all",
                            isActive
                              ? "bg-primary text-white font-medium shadow-elev-sm"
                              : "text-white/70 hover:text-white hover:bg-white/10"
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 min-w-0 truncate text-left">{item.label}</span>
                        </button>
                        <button
                          type="button"
                          aria-label={isFav ? `Hapus ${item.label} dari Favorit` : `Pin ${item.label} ke Favorit`}
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(item.path!); }}
                          className={cn(
                            "absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 transition-all",
                            isFav ? "flex text-amber-400" : "hidden group-hover/item:flex text-white/40 hover:text-amber-300"
                          )}
                        >
                          <Star className={cn("h-3 w-3", isFav && "fill-current")} />
                        </button>
                      </div>
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
              <span className="font-medium tracking-wider">v5.0</span>
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
