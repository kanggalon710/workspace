import { useEffect, useState } from "react";
import { useLocation } from "wouter";
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

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const { canRead, logout, user } = useAuth();
  const isSysAdmin = !!user?.isSystemAdmin;
  const [darkMode, setDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

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

  // ── Navigation items ──
  const navigationItems: CommandItemDef[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, path: "/", permission: "dashboard", shortcut: "⌘D" },
    { id: "map", label: "Peta Jaringan", icon: Map, path: "/map", permission: "map", shortcut: "⌘M", keywords: ["peta", "map", "jaringan", "gis"] },
    { id: "customers", label: "Pelanggan", icon: Users, path: "/customers", permission: "customers", keywords: ["customer", "pelanggan", "user"] },
    { id: "marketing", label: "Marketing Dashboard", icon: BarChart3, path: "/marketing", permission: "marketing_dashboard" },
    { id: "canvassing", label: "Canvassing", icon: MapPinned, path: "/canvassing", permission: "canvassing" },
    // "Lead Pipeline" (/leads) disembunyikan — lead sekarang ada di /pipelines/2.
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
          <CommandInput placeholder="Cari halaman, aksi, atau fitur..." />
          <CommandList>
            <CommandEmpty>
              <div className="flex flex-col items-center gap-2 py-6">
                <Search className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Tidak ada hasil ditemukan.</p>
                <p className="text-xs text-muted-foreground/60">Coba kata kunci lain.</p>
              </div>
            </CommandEmpty>
            {renderGroup("Navigasi Utama", navigationItems)}
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
