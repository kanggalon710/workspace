import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePortalAuth } from "@/context/CustomerPortalAuthContext";
import { Wifi, Activity, Receipt, Award, LogOut, Loader2, Zap, HeadphonesIcon, Home, Radio } from "lucide-react";
import { OverviewTab } from "./dashboard/OverviewTab";
import { TrafficTab } from "./dashboard/TrafficTab";
import { BillingTab } from "./dashboard/BillingTab";
import { WifiTab } from "./dashboard/WifiTab";
import { TicketsTab } from "./dashboard/TicketsTab";
import { PointsTab } from "./dashboard/PointsTab";
import { LoyaltyTab } from "./dashboard/LoyaltyTab";
import { FEATURE_BILLING_ENABLED } from "./dashboard/shared";

type Tab = "overview" | "traffic" | "billing" | "wifi" | "tickets" | "loyalty" | "points";

const TAB_DEFS = [
  { key: "overview", label: "Ringkasan", icon: Home },
  { key: "traffic", label: "Pemakaian", icon: Activity },
  ...(FEATURE_BILLING_ENABLED ? [{ key: "billing", label: "Tagihan", icon: Receipt }] : []),
  { key: "wifi", label: "WiFi", icon: Wifi },
  { key: "points", label: "Boost", icon: Zap },
  { key: "tickets", label: "Bantuan", icon: HeadphonesIcon },
  { key: "loyalty", label: "Sahabat", icon: Award },
] as const;

// ---------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------
export default function PortalDashboardPage() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading, customer, logout, apiFetch } = usePortalAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) setLocation("/portal/login");
  }, [authLoading, isAuthenticated, setLocation]);

  const { data: me, isLoading: meLoading, refetch: refetchMe } = useQuery<any>({
    queryKey: ["portal-me"],
    queryFn: () => apiFetch("/api/portal/me"),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  const { data: billing } = useQuery<any>({
    queryKey: ["portal-billing"],
    queryFn: () => apiFetch("/api/portal/billing"),
    enabled: isAuthenticated,
  });

  const { data: traffic } = useQuery<any>({
    queryKey: ["portal-traffic"],
    queryFn: () => apiFetch("/api/portal/traffic"),
    enabled: isAuthenticated && tab === "traffic",
    refetchInterval: 30_000,
  });

  const { data: tickets } = useQuery<any[]>({
    queryKey: ["portal-tickets"],
    queryFn: () => apiFetch<any[]>("/api/portal/tickets"),
    enabled: isAuthenticated && tab === "tickets",
  });

  const { data: loyalty } = useQuery<any>({
    queryKey: ["portal-loyalty"],
    queryFn: () => apiFetch("/api/portal/loyalty"),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  if (authLoading || !customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-sky-500 mx-auto" />
          <div className="text-xs text-muted-foreground mt-3">Memuat portal pelanggan...</div>
        </div>
      </div>
    );
  }

  const pppoeOnline = me?.pppoe?.online === true;
  const isIsolir = me?.customer?.isIsolir === 1;

  const firstName = (customer.name || "").split(" ")[0] || "Pelanggan";

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-6 relative">
      {/* -- Decorative gradient band (mobile only) -- */}
      <div className="md:hidden absolute top-0 left-0 right-0 h-64 bg-mesh" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-sidebar/95 via-sidebar/70 to-background" />
      </div>

      {/* -- Premium header -- */}
      <header className="relative z-20 md:sticky md:top-0 md:bg-gradient-to-r md:from-sidebar md:via-sidebar md:to-sidebar/95 md:text-white md:shadow-elev-md md:border-b md:border-white/5">
        <div className="max-w-5xl mx-auto px-4 md:px-6 pt-5 md:pt-0 pb-3 md:pb-0 md:h-16 flex items-center justify-between gap-3">
          {/* Brand + greeting (mobile) / brand (desktop) */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 md:w-9 md:h-9 rounded-xl md:rounded-lg bg-gradient-to-br from-sky-400 to-blue-600 md:bg-white/15 md:backdrop-blur flex items-center justify-center shrink-0 shadow-elev-md ring-1 ring-white/20">
              <Radio className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="min-w-0 flex-1">
              {/* Mobile: greeting */}
              <div className="md:hidden">
                <div className="text-[10px] uppercase tracking-widest font-semibold text-white/60">
                  Halo, selamat datang
                </div>
                <div className="font-black text-base leading-tight truncate text-white tracking-tight">
                  {firstName}!
                </div>
              </div>
              {/* Desktop: brand */}
              <div className="hidden md:block">
                <div className="font-black text-sm leading-tight flex items-center gap-2 text-white tracking-tight">
                  JABNET
                  <span className="px-1.5 py-0.5 bg-white/15 rounded text-[9px] font-bold uppercase tracking-[0.15em]">Portal</span>
                </div>
                <div className="text-[11px] text-white/70 truncate">
                  {customer.name}
                </div>
              </div>
            </div>
          </div>

          {/* Status pill + logout */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-2xs font-bold backdrop-blur-sm border ${
                pppoeOnline
                  ? "bg-emerald-400/15 border-emerald-300/30 text-emerald-100"
                  : isIsolir
                  ? "bg-rose-400/15 border-rose-300/30 text-rose-100"
                  : "bg-white/10 border-white/20 text-white/80"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  pppoeOnline
                    ? "bg-emerald-300 animate-pulse"
                    : isIsolir
                    ? "bg-rose-300"
                    : "bg-white/50"
                }`}
              />
              {pppoeOnline ? "ONLINE" : isIsolir ? "ISOLIR" : "OFFLINE"}
            </div>
            <button
              onClick={async () => { await logout(); setLocation("/portal/login"); }}
              className="w-9 h-9 rounded-lg hover:bg-white/10 flex items-center justify-center transition-colors text-white/80 hover:text-white"
              title="Keluar"
              aria-label="Keluar"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Desktop tab bar */}
        <div className="hidden md:block max-w-5xl mx-auto px-6 pb-0 border-t border-white/10">
          <div className="flex gap-1 -mb-px">
            {TAB_DEFS.map(({ key, label, icon: Ic }) => (
              <button
                key={key}
                onClick={() => setTab(key as Tab)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 transition-colors tracking-wide ${
                  tab === key
                    ? "border-sky-300 text-white"
                    : "border-transparent text-white/60 hover:text-white"
                }`}
              >
                <Ic className="h-3.5 w-3.5" strokeWidth={2.25} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* -- Content -- */}
      <main className="relative max-w-5xl mx-auto px-4 md:px-6 py-3 md:py-6">
        {tab === "overview" && <OverviewTab me={me} billing={billing} loyalty={loyalty} meLoading={meLoading} onRefresh={() => refetchMe()} setTab={setTab} firstName={firstName} />}
        {tab === "traffic" && <TrafficTab traffic={traffic} pppoeOnline={pppoeOnline} apiFetch={apiFetch} />}
        {tab === "billing" && FEATURE_BILLING_ENABLED && <BillingTab billing={billing} customer={customer} />}
        {tab === "wifi" && <WifiTab apiFetch={apiFetch} me={me} qc={qc} />}
        {tab === "points" && <PointsTab apiFetch={apiFetch} qc={qc} />}
        {tab === "tickets" && <TicketsTab tickets={tickets} apiFetch={apiFetch} qc={qc} />}
        {tab === "loyalty" && <LoyaltyTab apiFetch={apiFetch} qc={qc} />}
      </main>

      {/* -- Premium mobile bottom nav -- */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-background/85 backdrop-blur-xl border-t border-border/60"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: "0 -4px 20px -4px hsl(var(--foreground) / 0.08)",
        }}
        aria-label="Portal navigation"
      >
        <div className="grid grid-cols-7 max-w-5xl mx-auto">
          {TAB_DEFS.map(({ key, label, icon: Ic }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key as Tab)}
                className={`relative flex flex-col items-center justify-center gap-1 py-2.5 px-1 transition-all ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
                aria-current={active ? "page" : undefined}
                aria-label={label}
              >
                {/* Top active indicator */}
                {active && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-7 h-[2.5px] rounded-b-full bg-gradient-to-r from-transparent via-primary to-transparent" />
                )}
                <span
                  className={`flex items-center justify-center w-9 h-9 rounded-xl transition-all ${
                    active ? "bg-primary/10 scale-100" : "scale-95"
                  }`}
                >
                  <Ic
                    className={`h-[18px] w-[18px] transition-transform ${active ? "-translate-y-px" : ""}`}
                    strokeWidth={active ? 2.5 : 2}
                  />
                </span>
                <span className={`text-[10px] font-bold leading-none tracking-tight ${active ? "text-primary" : ""}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// =====================================================================
// OVERVIEW TAB
// =====================================================================
