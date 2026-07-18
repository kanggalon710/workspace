import React, { useState } from "react";
import { useLocation } from "wouter";
import {
  LayoutDashboard, Map, Box, Users, Settings,
  Radio, CircleDot, Landmark, Cable, Wrench,
  Server, Split, Calculator, FileSpreadsheet, ClipboardList,
  X, MapPinned, ListChecks, BarChart3, Contact, Search, TrendingUp, Kanban,
  UsersRound, CheckSquare,
} from "lucide-react";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { useAuth } from "@/context/AuthContext";

const MARKETING_ROLES = ["admin", "marketing", "marketing_spv"];

const NETWORK_NAV_ITEMS = [
  { key: "home", icon: LayoutDashboard, label: "Home", path: "/" },
  { key: "map", icon: Map, label: "Peta", path: "/map" },
  { key: "assets", icon: Box, label: "Aset", path: null },
  { key: "customers", icon: Users, label: "Pelanggan", path: "/customers" },
  { key: "tools", icon: Wrench, label: "Tools", path: null },
];

const MARKETING_NAV_ITEMS = [
  { key: "mkt-dashboard", icon: BarChart3, label: "Dashboard", path: "/marketing" },
  { key: "canvassing", icon: MapPinned, label: "Canvassing", path: "/canvassing" },
  { key: "leads", icon: ListChecks, label: "Pipeline", path: "/pipelines/2" },
  { key: "contacts", icon: Contact, label: "Kontak", path: "/contacts" },
  { key: "tools", icon: Wrench, label: "Tools", path: null },
];

// Static class strings — Tailwind JIT requires full class names visible to scanner
const ASSET_SUBMENU = [
  { icon: Radio, label: "POP", path: "/pops", iconCls: "text-asset-pop", bgCls: "bg-asset-pop/10 ring-asset-pop/15 group-hover:ring-asset-pop/30" },
  { icon: Box, label: "ODC", path: "/odcs", iconCls: "text-asset-odc", bgCls: "bg-asset-odc/10 ring-asset-odc/15 group-hover:ring-asset-odc/30" },
  { icon: CircleDot, label: "ODP", path: "/odps", iconCls: "text-asset-odp", bgCls: "bg-asset-odp/10 ring-asset-odp/15 group-hover:ring-asset-odp/30" },
  { icon: Landmark, label: "Tiang", path: "/poles", iconCls: "text-asset-pole", bgCls: "bg-asset-pole/10 ring-asset-pole/15 group-hover:ring-asset-pole/30" },
  { icon: Cable, label: "Kabel", path: "/cables", iconCls: "text-asset-cable", bgCls: "bg-asset-cable/10 ring-asset-cable/15 group-hover:ring-asset-cable/30" },
] as const;

const NETWORK_TOOLS_SUBMENU = [
  { icon: UsersRound, label: "Tim Saya", path: "/teamspace/teams" },
  { icon: CheckSquare, label: "Semua Tugas", path: "/teamspace/tasks" },
  { icon: Kanban, label: "Pipelines", path: "/pipelines" },
  { icon: Server, label: "OTB Manager", path: "/otb-manager" },
  { icon: Split, label: "Splitter Chain", path: "/splitter-chain" },
  { icon: Calculator, label: "Power Budget", path: "/power-budget" },
  { icon: FileSpreadsheet, label: "Export/Import", path: "/export-import" },
  { icon: ClipboardList, label: "Log Aktivitas", path: "/audit-logs" },
];

const MARKETING_TOOLS_SUBMENU = [
  { icon: UsersRound, label: "Tim Saya", path: "/teamspace/teams" },
  { icon: CheckSquare, label: "Semua Tugas", path: "/teamspace/tasks" },
  { icon: Search, label: "Prospect Finder", path: "/prospects" },
  { icon: TrendingUp, label: "Keputusan Bisnis", path: "/marketing/bisnis" },
];

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const [sheetOpen, setSheetOpen] = useState<"assets" | "tools" | null>(null);
  const { user } = useAuth();

  const isMarketingUser = MARKETING_ROLES.includes(user?.role ?? "");
  const isNetworkUser = ["admin", "operator", "viewer"].includes(user?.role ?? "");

  // Marketing-only users get marketing nav; admin gets marketing nav too; operator/viewer get network nav
  const NAV_ITEMS = (user?.role === "marketing" || user?.role === "marketing_spv") ? MARKETING_NAV_ITEMS : NETWORK_NAV_ITEMS;

  const isActive = (key: string, path: string | null) => {
    if (key === "home" || key === "mkt-dashboard") return location === (path ?? "/");
    if (key === "map") return location === "/map";
    if (key === "customers") return location === "/customers";
    if (key === "canvassing") return location === "/canvassing";
    if (key === "leads") return location.startsWith("/pipelines");
    if (key === "contacts") return location === "/contacts";
    if (key === "assets") return ["/pops", "/odcs", "/odps", "/poles", "/cables"].some(p => location.startsWith(p));
    if (key === "tools") return ["/teamspace", "/otb-manager", "/splitter-chain", "/power-budget", "/export-import", "/audit-logs", "/bestray-manager", "/splitters", "/cable-cores", "/core-connections", "/marketing", "/canvassing", "/contacts", "/prospects"].some(p => location.startsWith(p));
    return false;
  };

  const handleNavClick = (key: string, path: string | null) => {
    if (path) {
      setLocation(path);
      setSheetOpen(null);
    } else {
      setSheetOpen(sheetOpen === key ? null : key as any);
    }
  };

  return (
    <>
      <nav className="bottom-nav md:hidden" aria-label="Bottom navigation">
        <div className="flex items-stretch">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.key, item.path);
            return (
              <button
                key={item.key}
                onClick={() => handleNavClick(item.key, item.path)}
                className={`bottom-nav-item flex-1 ${active ? "active" : ""}`}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
              >
                <span className="icon-wrap">
                  <item.icon className="icon" strokeWidth={active ? 2.5 : 2} />
                </span>
                <span className="label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Asset sub-menu bottom sheet */}
      <BottomSheet
        open={sheetOpen === "assets"}
        onClose={() => setSheetOpen(null)}
        title="Aset Jaringan"
        height="sm"
      >
        <div className="grid grid-cols-3 gap-2.5">
          {ASSET_SUBMENU.map((item) => (
            <button
              key={item.path}
              onClick={() => { setLocation(item.path); setSheetOpen(null); }}
              className="group flex flex-col items-center gap-2 p-3 rounded-xl border border-transparent hover:border-border hover:bg-accent/40 transition-all active:scale-95"
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ring-1 transition-all ${item.bgCls}`}>
                <item.icon className={`h-5 w-5 ${item.iconCls}`} strokeWidth={2.25} />
              </div>
              <span className="text-xs font-semibold text-foreground">{item.label}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Tools sub-menu bottom sheet */}
      <BottomSheet
        open={sheetOpen === "tools"}
        onClose={() => setSheetOpen(null)}
        title="Tools & Utilitas"
        height="sm"
      >
        <div className="space-y-1">
          {((user?.role === "marketing" || user?.role === "marketing_spv") ? MARKETING_TOOLS_SUBMENU : NETWORK_TOOLS_SUBMENU).map((item) => (
            <button
              key={item.path}
              onClick={() => { setLocation(item.path); setSheetOpen(null); }}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-xl hover:bg-accent/60 transition-colors active:scale-[0.98] text-left group"
            >
              <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <span className="text-sm font-medium text-foreground flex-1">{item.label}</span>
              <span className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all text-sm">→</span>
            </button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
