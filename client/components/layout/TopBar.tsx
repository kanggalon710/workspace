import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSidebar } from "@/context/SidebarContext";
import { SystemStatusDot, type SystemStatus } from "@/components/ui/system-status-dot";
import { CommandPalette } from "@/components/CommandPalette";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/roleLabel";

const NotificationBell = lazy(() => import("@/components/notifications/NotificationBell"));
import {
  Search, Command, ChevronRight, Menu, Sun, Moon, Activity,
  Router as RouterIcon, Wifi, Database, LogOut, User, Building2, Check, ChevronDown,
} from "lucide-react";

// Map pathnames → display labels (fast lookup for breadcrumbs/page title)
const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/map": "Peta Jaringan",
  "/profile": "Profil Saya",
  "/pops": "POP",
  "/odcs": "ODC",
  "/odps": "ODP",
  "/poles": "Tiang",
  "/cables": "Kabel",
  "/otb-manager": "OTB Manager",
  "/bestray-manager": "Bestray",
  "/splitters": "Splitter",
  "/cable-cores": "Core Manager",
  "/core-connections": "Koneksi Core",
  "/splitter-chain": "Splitter Chain",
  "/power-budget": "Power Budget",
  "/export-import": "Export / Import",
  "/customers": "Pelanggan",
  "/tickets": "Work Order",
  "/collections": "Collection",
  "/loyalty": "JABNET Sahabat",
  "/devices": "Perangkat ONT",
  "/billing/routers": "Router MikroTik",
  "/billing/sessions": "Sesi Aktif",
  "/billing/packages": "Paket Internet",
  "/billing/monitoring": "Monitoring",
  "/marketing": "Marketing Dashboard",
  "/canvassing": "Canvassing",
  "/canvassing/history": "Riwayat Canvassing",
  "/canvassing/reports": "Laporan Lapangan",
  "/leads": "Lead Pipeline",
  "/contacts": "Kontak",
  "/prospects": "Prospect Finder",
  "/marketing/ads": "Marketing Ads",
  "/marketing/bisnis": "Keputusan Bisnis",
  "/integrations": "Integrasi API",
  "/mpwa": "MPWA WhatsApp (Legacy)",
  "/broadcast": "Broadcast (Legacy)",
  "/whatsapp/devices": "Nomor Whatsapp",
  "/whatsapp/templates": "Template Whatsapp",
  "/whatsapp/phonebook": "Phonebook",
  "/whatsapp/broadcast/pelanggan": "Broadcast Pelanggan",
  "/whatsapp/broadcast/reseller": "Broadcast Reseller",
  "/api-keys": "Public API",
  "/audit-logs": "Activity Log",
  "/users": "Manajemen User",
  "/roles": "Manajemen Role",
  "/announcements": "Pengumuman",
  "/bugs": "Lapor Bug",
};

function getPageLabel(path: string): string {
  return ROUTE_LABELS[path] || path.split("/").filter(Boolean).pop()?.replace(/-/g, " ") || "Workspace";
}

export function TopBar() {
  const [location, setLocation] = useLocation();
  const { user, logout, switchMitra } = useAuth();
  const { collapsed, toggle, mobileOpen, setMobileOpen } = useSidebar();
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  // Phase B: tenant switcher state
  const [mitraMenuOpen, setMitraMenuOpen] = useState(false);
  const mitraMenuRef = useRef<HTMLDivElement>(null);
  const [switching, setSwitching] = useState(false);

  // Close user menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  // Close mitra menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mitraMenuRef.current && !mitraMenuRef.current.contains(e.target as Node)) {
        setMitraMenuOpen(false);
      }
    };
    if (mitraMenuOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mitraMenuOpen]);

  // System health - poll every 60s
  const { data: syncStatus } = useQuery<any>({
    queryKey: ["/api/billing/sync/status"],
    queryFn: () => api.get<any>("/billing/sync/status"),
    refetchInterval: 60_000,
    retry: false,
  });

  const billingStatus: SystemStatus = syncStatus?.stale ? "degraded" : syncStatus ? "operational" : "unknown";
  const apiStatus: SystemStatus = "operational";
  const mikrotikStatus: SystemStatus = "operational";

  const pageLabel = getPageLabel(location);

  const toggleTheme = () => {
    document.documentElement.classList.toggle("dark");
    setDarkMode(!darkMode);
  };

  // Command palette state - Cmd+K handled globally inside CommandPalette
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <>
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    <header
      className={cn(
        "sticky top-0 z-40 h-14 md:h-16 flex items-center gap-3 px-3 md:px-6",
        "bg-background/80 backdrop-blur-xl border-b border-border/60"
      )}
    >
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden h-9 w-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
        title="Menu"
        aria-label="Buka menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Desktop: show sidebar expand button when collapsed */}
      {collapsed && (
        <button
          onClick={toggle}
          className="hidden md:flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent transition-colors"
          title="Tampilkan sidebar"
          aria-label="Tampilkan sidebar"
        >
          <Menu className="h-4 w-4" />
        </button>
      )}

      {/* Page title / breadcrumb (desktop) */}
      <div className="hidden md:flex items-center gap-1.5 min-w-0 shrink">
        <span className="text-xs text-muted-foreground font-medium">Workspace</span>
        <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
        <span className="text-sm font-semibold text-foreground truncate">{pageLabel}</span>
      </div>

      {/* Mobile: page title (hamburger already takes left space) */}
      <div className="md:hidden flex-1 min-w-0">
        <h1 className="text-sm font-bold text-foreground truncate tracking-tight">{pageLabel}</h1>
      </div>

      {/* Spacer */}
      <div className="flex-1 hidden md:block" />

      {/* Search launcher (desktop) - opens Command Palette */}
      <button
        onClick={() => setPaletteOpen(true)}
        className="hidden md:flex items-center gap-2 w-72 h-9 px-3 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/50 hover:border-border transition-all group"
        aria-label="Buka pencarian global"
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="flex-1 text-left text-sm text-muted-foreground/70 group-hover:text-muted-foreground truncate">
          Cari halaman, aset, tiket...
        </span>
        <kbd className="hidden lg:inline-flex items-center gap-0.5 text-2xs font-mono-tight text-muted-foreground/70 bg-background px-1.5 py-0.5 rounded border border-border/60">
          <Command className="h-2.5 w-2.5" />K
        </kbd>
      </button>

      {/* Mobile: search icon that triggers palette */}
      <button
        onClick={() => setPaletteOpen(true)}
        className="md:hidden h-9 w-9 rounded-md hover:bg-accent flex items-center justify-center transition-colors"
        aria-label="Cari"
        title="Cari (⌘K)"
      >
        <Search className="h-[18px] w-[18px]" />
      </button>

      {/* System status traffic lights (desktop) */}
      <div className="hidden xl:flex items-center gap-3 pl-3 pr-1 border-l border-border/50">
        <StatusPill icon={Database} label="Billing Sync" status={billingStatus} />
        <StatusPill icon={Activity} label="API" status={apiStatus} />
        <StatusPill icon={Wifi} label="MikroTik" status={mikrotikStatus} />
      </div>

      {/* Notifications */}
      <Suspense fallback={<div className="h-9 w-9" />}>
        <NotificationBell />
      </Suspense>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="h-9 w-9 rounded-md hover:bg-accent flex items-center justify-center transition-colors"
        title={darkMode ? "Light mode" : "Dark mode"}
        aria-label="Toggle theme"
      >
        {darkMode ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
      </button>

      {/* Mobile: system status single dot (collapsed indicator) */}
      <button
        className="xl:hidden h-9 w-9 rounded-md hover:bg-accent flex items-center justify-center relative"
        title="System status"
        onClick={() => setLocation("/integrations")}
      >
        <Activity className="h-4 w-4" />
        <span className="absolute top-2 right-2">
          <SystemStatusDot
            status={billingStatus === "degraded" ? "degraded" : "operational"}
            size="sm"
          />
        </span>
      </button>

      {/* Phase B: Tenant switcher - only show if user has 2+ memberships or is system admin */}
      {user && (user.mitraMemberships?.length ?? 0) > 1 && (
        <div className="relative" ref={mitraMenuRef}>
          <button
            onClick={() => setMitraMenuOpen(!mitraMenuOpen)}
            disabled={switching}
            className="hidden md:flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-card hover:bg-accent text-sm font-medium transition-colors max-w-[200px]"
            aria-haspopup="menu"
            aria-expanded={mitraMenuOpen}
            title="Ganti mitra aktif"
          >
            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="truncate flex-1 text-left">
              {user.activeMitra?.displayName ?? user.activeMitra?.name ?? "Mitra"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          </button>
          {/* Mobile compact button */}
          <button
            onClick={() => setMitraMenuOpen(!mitraMenuOpen)}
            disabled={switching}
            className="md:hidden h-9 w-9 rounded-md border border-border bg-card hover:bg-accent flex items-center justify-center transition-colors"
            aria-label="Switch mitra"
            title="Ganti mitra"
          >
            <Building2 className="h-4 w-4" />
          </button>

          {mitraMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-border bg-popover shadow-elev-lg p-1 animate-pop-in z-50">
              <div className="px-3 py-2 border-b border-border/60 mb-1">
                <p className="text-2xs uppercase tracking-wider text-muted-foreground font-semibold">Mitra Aktif</p>
                <p className="text-sm font-semibold text-foreground truncate mt-0.5">
                  {user.activeMitra?.displayName ?? user.activeMitra?.name}
                </p>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {user.mitraMemberships?.map((m) => {
                  const isCurrent = m.id === user.activeMitraId;
                  return (
                    <button
                      key={m.id}
                      onClick={async () => {
                        if (isCurrent) {
                          setMitraMenuOpen(false);
                          return;
                        }
                        try {
                          setSwitching(true);
                          await switchMitra(m.id);
                        } catch (e: any) {
                          alert("Gagal switch mitra: " + (e?.message ?? e));
                          setSwitching(false);
                        }
                      }}
                      disabled={switching}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors text-left",
                        isCurrent && "bg-accent/40"
                      )}
                    >
                      <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{m.displayName ?? m.name}</div>
                        {m.slug && <div className="text-2xs text-muted-foreground truncate">{m.slug}</div>}
                      </div>
                      {isCurrent && <Check className="h-4 w-4 text-success flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* User avatar menu */}
      {user && (
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 h-9 px-1.5 pr-2 md:pr-3 rounded-full hover:bg-accent transition-colors"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
          >
            <div className="relative">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center text-white text-xs font-bold ring-2 ring-background shadow-elev-sm overflow-hidden">
                {(user as any)?.photoUrl ? (
                  <img src={(user as any).photoUrl} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-background" />
            </div>
            <div className="hidden md:flex flex-col items-start leading-tight min-w-0">
              <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                {user.name}
              </span>
              <span className="text-2xs text-muted-foreground capitalize">{roleLabel(user)}</span>
            </div>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-border bg-popover shadow-elev-lg p-1 animate-pop-in">
              <div className="px-3 py-2 border-b border-border/60 mb-1">
                <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  @{user.username} · {roleLabel(user)}
                </p>
              </div>
              <button
                onClick={() => {
                  setLocation("/profile");
                  setUserMenuOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm hover:bg-accent transition-colors text-left"
              >
                <User className="h-4 w-4 text-muted-foreground" />
                Profil Saya
              </button>
              <button
                onClick={async () => {
                  setUserMenuOpen(false);
                  await logout();
                  setLocation("/login");
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm hover:bg-destructive/10 hover:text-destructive transition-colors text-left"
              >
                <LogOut className="h-4 w-4" />
                Keluar
              </button>
            </div>
          )}
        </div>
      )}
    </header>
    </>
  );
}

function StatusPill({
  icon: Icon,
  label,
  status,
}: {
  icon: typeof Database;
  label: string;
  status: SystemStatus;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent transition-colors cursor-default"
      title={`${label}: ${status}`}
    >
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <SystemStatusDot status={status} size="sm" />
    </div>
  );
}
