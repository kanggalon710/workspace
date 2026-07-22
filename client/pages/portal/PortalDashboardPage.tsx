import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePortalAuth } from "@/context/CustomerPortalAuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Wifi, WifiOff, Activity, Receipt, MessageSquare, Power, Award, LogOut,
  Loader2, Eye, EyeOff, AlertTriangle, CheckCircle2, ChevronRight, RefreshCw,
  Edit3, Copy, Share2, Gift, TrendingUp, Users, Signal, Globe, Clock, Shield,
  Zap, UserPlus, ArrowRight, XCircle, Inbox, Plus, HeadphonesIcon,
  Star as StarIcon, Home, Radio, Trophy, Sparkles,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, AreaChart,
} from "recharts";

type Tab = "overview" | "traffic" | "billing" | "wifi" | "tickets" | "loyalty" | "points";

// v4.2.14: feature flag - Tagihan di-hide sementara karena belum integrasi
const FEATURE_BILLING_ENABLED = false;

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
function OverviewTab({ me, billing, loyalty, meLoading, onRefresh, setTab, firstName }: any) {
  if (meLoading || !me) return <LoadingState />;

  const pppoe = me.pppoe ?? {};
  const ont = me.ont ?? {};
  const customer = me.customer ?? {};
  const isIsolir = customer.isIsolir === 1;
  const online = pppoe.online === true;

  const dueDate = billing?.dueDate ? new Date(billing.dueDate) : null;
  const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (86400_000)) : null;
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
  const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 7;

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Alerts - v4.2.14: hide payment-related alerts saat billing belum integrasi */}
      {isIsolir && (
        <AlertCard
          variant="danger"
          icon={<XCircle className="h-5 w-5" />}
          title="Layanan dalam status isolir"
          desc="Layanan internet Anda dihentikan sementara. Silakan hubungi customer service untuk informasi lebih lanjut."
          cta={FEATURE_BILLING_ENABLED
            ? { label: "Lihat Tagihan", onClick: () => setTab("billing") }
            : { label: "Hubungi CS", onClick: () => window.open("https://wa.me/6282180009030", "_blank") }
          }
        />
      )}
      {!isIsolir && isOverdue && FEATURE_BILLING_ENABLED && (
        <AlertCard
          variant="warning"
          icon={<AlertTriangle className="h-5 w-5" />}
          title={`Tagihan telat ${Math.abs(daysUntilDue!)} hari`}
          desc="Segera lunasi untuk menghindari isolir otomatis. Hubungi CS untuk konfirmasi pembayaran."
          cta={{ label: "Bayar Sekarang", onClick: () => setTab("billing") }}
        />
      )}

      {/* Hero - Status connection */}
      <section className={`grid grid-cols-1 ${FEATURE_BILLING_ENABLED ? "md:grid-cols-3" : "md:grid-cols-1"} gap-3 md:gap-4`}>
        <Card className={`${FEATURE_BILLING_ENABLED ? "md:col-span-2" : ""} relative overflow-hidden`}>
          <div
            className={`absolute top-0 left-0 right-0 h-1 ${online ? "bg-emerald-500" : "bg-slate-300"}`}
          />
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${online ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status Koneksi
                </span>
              </div>
              <button onClick={onRefresh} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex items-baseline gap-3">
              <h2 className={`text-3xl md:text-4xl font-bold tracking-tight ${online ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                {online ? "Online" : "Offline"}
              </h2>
              {online && pppoe.uptime && (
                <span className="text-xs text-muted-foreground">
                  uptime {pppoe.uptime}
                </span>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MiniStat icon={<Globe className="h-3.5 w-3.5" />} label="IP" value={pppoe.ipAddress || "-"} mono />
              <MiniStat icon={<Signal className="h-3.5 w-3.5" />} label="Router" value={pppoe.routerName || "-"} />
              <MiniStat
                icon={<Zap className="h-3.5 w-3.5" />}
                label="ONT"
                value={ont.matched ? (ont.status === "online" ? "Aktif" : "Offline") : "N/A"}
                tone={ont.matched && ont.status === "online" ? "good" : "muted"}
              />
              <MiniStat
                icon={<Activity className="h-3.5 w-3.5" />}
                label="RX Power"
                value={ont.rxPower ? `${ont.rxPower} dBm` : "-"}
                tone={ont.rxPower ? (parseFloat(ont.rxPower) > -25 ? "good" : parseFloat(ont.rxPower) > -28 ? "warn" : "bad") : "muted"}
              />
            </div>
          </CardContent>
        </Card>

        {/* Billing quick card - v4.2.14: hide saat billing belum integrasi */}
        {FEATURE_BILLING_ENABLED && (
          <Card className="relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-1 ${isOverdue ? "bg-rose-500" : isDueSoon ? "bg-amber-500" : "bg-sky-500"}`} />
            <CardContent className="p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tagihan
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {billing?.billingStatus ?? "-"}
                </Badge>
              </div>
              <div className="text-3xl font-bold tracking-tight">
                Rp {(billing?.billingPrice ?? 0).toLocaleString("id-ID")}
              </div>
              {dueDate && (
                <div className="mt-2 text-xs text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  {isOverdue ? (
                    <span className="text-rose-600 font-semibold">Lewat {Math.abs(daysUntilDue!)} hari</span>
                  ) : isDueSoon ? (
                    <span className="text-amber-600 font-semibold">Jatuh tempo {daysUntilDue} hari lagi</span>
                  ) : (
                    <span>Jatuh tempo {daysUntilDue} hari lagi</span>
                  )}
                </div>
              )}
              <button
                onClick={() => setTab("billing")}
                className="w-full mt-4 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded-lg transition-colors"
              >
                Lihat detail <ArrowRight className="h-3 w-3" />
              </button>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Customer identity */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <IdentityField label="Customer ID" value={customer.customerId} mono />
            <IdentityField label="Paket Layanan" value={customer.package || "-"} />
            <IdentityField label="Nomor HP" value={customer.phone || "-"} mono />
            <IdentityField label="PPPoE Username" value={customer.pppoeUsername || "-"} mono />
          </div>
          {customer.address && (
            <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
              <span className="uppercase tracking-wider text-[10px] font-semibold text-foreground/60">Alamat</span>
              <div className="mt-0.5 text-foreground">{customer.address}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Aksi Cepat</h3>
          <span className="text-2xs text-muted-foreground">Tap untuk buka</span>
        </div>
        <div className={`grid grid-cols-2 ${FEATURE_BILLING_ENABLED ? "md:grid-cols-4" : "md:grid-cols-3"} gap-2.5 md:gap-3`}>
          <QuickAction
            icon={Activity}
            label="Pemakaian"
            desc="Live 24 jam"
            tone="emerald"
            onClick={() => setTab("traffic")}
          />
          <QuickAction
            icon={Wifi}
            label="Kelola WiFi"
            desc="SSID & password"
            tone="sky"
            onClick={() => setTab("wifi")}
          />
          {FEATURE_BILLING_ENABLED && (
            <QuickAction
              icon={Receipt}
              label="Tagihan"
              desc={billing?.billingStatus || "Cek status"}
              tone={isOverdue ? "rose" : isDueSoon ? "amber" : "sky"}
              onClick={() => setTab("billing")}
              badge={isOverdue ? "!" : isDueSoon ? `${daysUntilDue}h` : undefined}
            />
          )}
          <QuickAction
            icon={HeadphonesIcon}
            label="Bantuan"
            desc="Lapor kendala"
            tone="amber"
            onClick={() => setTab("tickets")}
          />
        </div>
      </section>

      {/* Sahabat summary teaser */}
      {loyalty?.sahabat && (
        <Card className="relative overflow-hidden bg-gradient-to-br from-violet-50 to-sky-50 dark:from-violet-950/40 dark:to-sky-950/40 border-violet-200/50 dark:border-violet-800/50">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Award className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                    JABNET Sahabat
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  <h3 className="text-xl font-bold" style={{ color: loyalty.sahabat.levelColor }}>
                    {loyalty.sahabat.levelLabel}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {loyalty.sahabat.totalSuccessfulReferrals} referral sukses
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {loyalty.progressToNext
                    ? `${loyalty.progressToNext.remaining} referral lagi ke ${loyalty.progressToNext.toLabel}`
                    : "Level tertinggi tercapai"}
                </p>
              </div>
              <button
                onClick={() => setTab("loyalty")}
                className="shrink-0 p-2 rounded-lg bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow"
              >
                <ChevronRight className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// TRAFFIC TAB
// =====================================================================
// --- Byte / speed formatters -------------------------------------
/** Format bytes → "XX.X MB" atau "X.XX GB" atau "X.XX TB" otomatis */
function fmtBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 MB";
  const KB = 1024, MB = KB * 1024, GB = MB * 1024, TB = GB * 1024;
  if (bytes >= TB) return `${(bytes / TB).toFixed(2)} TB`;
  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  return `${(bytes / KB).toFixed(0)} KB`;
}

/** Format MB → "XXX MB" / "X.XX GB" / "X.XX TB" */
function fmtMB(mb: number): string {
  if (!mb || mb < 0) return "0 MB";
  if (mb >= 1_000_000) return `${(mb / 1_000_000).toFixed(2)} TB`;
  if (mb >= 1000) return `${(mb / 1000).toFixed(2)} GB`;
  return `${Math.round(mb)} MB`;
}

/** Format bytes/sec → "XX.X Mbps" atau "X.XX Gbps" (network rate) */
function fmtSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec < 0) return "0 bps";
  const bitsPerSec = bytesPerSec * 8;
  if (bitsPerSec >= 1_000_000_000) return `${(bitsPerSec / 1_000_000_000).toFixed(2)} Gbps`;
  if (bitsPerSec >= 1_000_000) return `${(bitsPerSec / 1_000_000).toFixed(2)} Mbps`;
  if (bitsPerSec >= 1000) return `${(bitsPerSec / 1000).toFixed(0)} Kbps`;
  return `${Math.round(bitsPerSec)} bps`;
}

function TrafficTab({ traffic, pppoeOnline, apiFetch }: any) {
  // - Live realtime polling -
  const [livePrev, setLivePrev] = useState<{ ts: number; bytesIn: number; bytesOut: number } | null>(null);
  const [liveNow, setLiveNow] = useState<{ ts: number; bytesIn: number; bytesOut: number } | null>(null);
  // Ref menyimpan nilai terbaru supaya closure di interval tidak stale
  const liveNowRef = useRef<{ ts: number; bytesIn: number; bytesOut: number } | null>(null);

  useEffect(() => {
    if (!pppoeOnline || !apiFetch) return;
    let mounted = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      try {
        const r = await apiFetch("/api/portal/traffic/live");
        if (!mounted || !r?.online) return;
        const next = { ts: r.ts as number, bytesIn: r.bytesIn as number, bytesOut: r.bytesOut as number };
        if (liveNowRef.current) setLivePrev(liveNowRef.current);
        liveNowRef.current = next;
        setLiveNow(next);
      } catch {}
    };

    const start = () => {
      if (interval) return;
      tick();
      interval = setInterval(tick, 3000);
    };
    const stop = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mounted = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pppoeOnline]);

  // Compute realtime speed dari delta bytes / delta seconds
  const liveSpeed = useMemo(() => {
    if (!livePrev || !liveNow) return null;
    const dt = (liveNow.ts - livePrev.ts) / 1000;
    if (dt <= 0) return null;
    const dlBytesPerSec = Math.max(0, (liveNow.bytesIn - livePrev.bytesIn) / dt);
    const ulBytesPerSec = Math.max(0, (liveNow.bytesOut - livePrev.bytesOut) / dt);
    return { dl: dlBytesPerSec, ul: ulBytesPerSec, age: Date.now() - liveNow.ts };
  }, [livePrev, liveNow]);

  // NOTE: Semua useMemo WAJIB di-call sebelum early return (Rules of Hooks).
  const snapshots: any[] = traffic?.snapshots ?? [];
  const chartData = useMemo(() => snapshots.map((s) => ({
    time: new Date(s.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
    download: Math.round((s.bytesIn ?? 0) / 1024 / 1024),
    upload: Math.round((s.bytesOut ?? 0) / 1024 / 1024),
  })), [snapshots]);

  // Early return - SETELAH semua hooks dipanggil
  if (!traffic) return <LoadingState />;
  const live = traffic.live ?? {};

  const totalDownMB = chartData.reduce((a, b) => a + b.download, 0);
  const totalUpMB = chartData.reduce((a, b) => a + b.upload, 0);
  // Decide chart Y-axis unit: kalau max > 1000 MB pakai GB
  const maxValueMB = chartData.reduce((m, d) => Math.max(m, d.download, d.upload), 0);
  const useGbAxis = maxValueMB >= 1000;

  return (
    <div className="space-y-4 md:space-y-5">
      {/* LIVE SPEED - realtime current bandwidth */}
      {pppoeOnline && (
        <Card className="overflow-hidden">
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Live Speed
                </span>
                <span className="text-[10px] text-muted-foreground">· update tiap 3 detik</span>
              </div>
              {liveSpeed && liveSpeed.age < 10_000 ? (
                <span className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider">● Live</span>
              ) : (
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">menunggu data...</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 border border-emerald-200/50 dark:border-emerald-900/50">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold">
                  <TrendingUp className="h-3 w-3" /> Download
                </div>
                <div className="text-2xl md:text-3xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums mt-1">
                  {liveSpeed ? fmtSpeed(liveSpeed.dl) : "-"}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 border border-amber-200/50 dark:border-amber-900/50">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold">
                  <TrendingUp className="h-3 w-3 rotate-180" /> Upload
                </div>
                <div className="text-2xl md:text-3xl font-bold text-amber-700 dark:text-amber-300 tabular-nums mt-1">
                  {liveSpeed ? fmtSpeed(liveSpeed.ul) : "-"}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sesi info */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${pppoeOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sesi Saat Ini
                </span>
              </div>
              <div className={`text-xl font-bold ${pppoeOnline ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                {pppoeOnline ? "Tersambung" : "Tidak Online"}
              </div>
            </div>
            {pppoeOnline && live.uptime && (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Uptime</div>
                <div className="text-sm font-semibold font-mono">{live.uptime}</div>
              </div>
            )}
          </div>

          {pppoeOnline ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <BigStat icon={<Globe className="h-4 w-4" />} label="IP Address" value={live.ipAddress || "-"} mono tone="sky" />
              <BigStat icon={<Signal className="h-4 w-4" />} label="Router" value={live.routerName || "-"} tone="sky" />
              <BigStat icon={<TrendingUp className="h-4 w-4" />} label="Download Sesi" value={fmtBytes(live.bytesIn ?? 0)} tone="emerald" />
              <BigStat icon={<TrendingUp className="h-4 w-4 rotate-180" />} label="Upload Sesi" value={fmtBytes(live.bytesOut ?? 0)} tone="amber" />
            </div>
          ) : (
            <EmptyState icon={<WifiOff className="h-10 w-10" />} title="Tidak ada sesi aktif" desc="Koneksi PPPoE belum terdaftar. Cek modem atau hubungi support." />
          )}
        </CardContent>
      </Card>

      {/* Chart 24h */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Traffic 24 Jam</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                Pemakaian tercatat setiap 15 menit
              </div>
            </div>
            <div className="flex gap-4 text-right">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-emerald-600">Download</div>
                <div className="text-sm font-bold font-mono">{fmtMB(totalDownMB)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-amber-600">Upload</div>
                <div className="text-sm font-bold font-mono">{fmtMB(totalUpMB)}</div>
              </div>
            </div>
          </div>

          {chartData.length === 0 ? (
            <EmptyState
              icon={<Activity className="h-10 w-10" />}
              title="Belum ada data traffic"
              desc="Data akan tersedia setelah beberapa snapshot tercatat (setiap 15 menit)."
            />
          ) : (
            <div className="h-64 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ul" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="time" fontSize={10} stroke="hsl(var(--muted-foreground))" tickLine={false} />
                  <YAxis
                    fontSize={10}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(v) => useGbAxis ? `${(v / 1000).toFixed(1)}G` : `${v}M`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: any) => fmtMB(Number(v))}
                  />
                  <Area type="monotone" dataKey="download" stroke="#10b981" strokeWidth={2} fill="url(#dl)" name="Download" />
                  <Area type="monotone" dataKey="upload" stroke="#f59e0b" strokeWidth={2} fill="url(#ul)" name="Upload" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// BILLING TAB
// =====================================================================
function BillingTab({ billing, customer }: any) {
  if (!billing) return <LoadingState />;

  const dueDate = billing.dueDate ? new Date(billing.dueDate) : null;
  const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / 86400_000) : null;
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
  const isPaid = billing.billingStatus === "lunas" || billing.billingStatus === "paid";

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Invoice-style hero */}
      <Card className="overflow-hidden">
        <div className={`h-1.5 ${isPaid ? "bg-emerald-500" : isOverdue ? "bg-rose-500" : "bg-sky-500"}`} />
        <CardContent className="p-6 md:p-8">
          <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tagihan Aktif</div>
              <div className="text-4xl font-bold tracking-tight mt-1">
                Rp {(billing.billingPrice ?? 0).toLocaleString("id-ID")}
              </div>
              <div className="text-xs text-muted-foreground mt-1">per bulan · {billing.package || "-"}</div>
            </div>
            <BillingStatusBadge status={billing.billingStatus} isOverdue={isOverdue} />
          </div>

          {/* Timeline mini */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-5 border-t">
            <DataField label="Jatuh Tempo" value={dueDate ? dueDate.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "-"} meta={daysUntilDue !== null ? (isOverdue ? `telat ${Math.abs(daysUntilDue)} hari` : `${daysUntilDue} hari lagi`) : undefined} metaTone={isOverdue ? "danger" : daysUntilDue !== null && daysUntilDue <= 7 ? "warn" : "muted"} />
            <DataField label="Pembayaran Terakhir" value={billing.lastPaymentDate ? new Date(billing.lastPaymentDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "Belum ada"} />
            <DataField label="Tanggal Instalasi" value={billing.installDate ? new Date(billing.installDate).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }) : "-"} />
          </div>

          {billing.isIsolir && (
            <div className="mt-5 p-4 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex items-start gap-3">
              <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-sm text-rose-700 dark:text-rose-300">Layanan Diisolir</div>
                <div className="text-xs text-rose-600/80 dark:text-rose-400 mt-0.5">
                  Sejak {billing.isolirDate ? new Date(billing.isolirDate).toLocaleDateString("id-ID") : "-"}. Setelah pembayaran, layanan aktif kembali dalam 1×24 jam.
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment info */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <h3 className="text-sm font-semibold mb-1">Cara Pembayaran</h3>
          <p className="text-xs text-muted-foreground mb-4">Hubungi CS JABNET untuk informasi rekening dan konfirmasi pembayaran.</p>

          <a
            href="https://wa.me/6282180009030"
            target="_blank" rel="noreferrer"
            className="flex items-center justify-between p-4 rounded-lg border-2 border-dashed border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-sm">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold">Hubungi CS via WhatsApp</div>
                <div className="text-xs text-muted-foreground">Respons cepat · online 08:00-22:00</div>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

// =====================================================================
// WIFI TAB
// =====================================================================
function WifiTab({ apiFetch, me, qc }: any) {
  const ontMatched = me?.ont?.matched === true;
  const pppoeOnline = me?.pppoe?.online === true;
  const [restartConfirm, setRestartConfirm] = useState(false);

  const { data: wifiInfo, isLoading: wifiLoading, refetch: refetchWifi } = useQuery<any>({
    queryKey: ["portal-wifi-info"],
    queryFn: () => apiFetch("/api/portal/wifi/info"),
    enabled: ontMatched,
    staleTime: 30_000,
    retry: false,
  });

  const restartMut = useMutation({
    mutationFn: () => apiFetch("/api/portal/ont/restart", { method: "POST" }),
    onSuccess: (r: any) => { toast.success(r.message ?? "Perintah restart dikirim"); setRestartConfirm(false); },
    onError: (e: any) => { toast.error(e.message); setRestartConfirm(false); },
  });

  if (!ontMatched) {
    return (
      <Card>
        <CardContent className="p-8">
          <EmptyState
            icon={<WifiOff className="h-12 w-12" />}
            title="Perangkat ONT Belum Terdeteksi"
            desc="Fitur kelola WiFi aktif ketika perangkat ONT terhubung ke sistem JABNET. Hubungi CS bila memerlukan bantuan."
          />
        </CardContent>
      </Card>
    );
  }

  const usable: any[] = wifiInfo?.usable ?? [];
  const isDualBand = usable.length >= 2;
  const anyEnabled = usable.some((i: any) => i.enabled);
  const status = pppoeOnline && anyEnabled ? "active" : pppoeOnline ? "partial" : "offline";

  return (
    <div className="space-y-4 md:space-y-5">
      {/* WiFi hero */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                status === "active" ? "bg-emerald-500" : status === "partial" ? "bg-amber-500" : "bg-slate-400"
              } text-white shadow-sm`}>
                <Wifi className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Jaringan WiFi
                </div>
                <div className="text-lg font-bold">
                  {status === "active" ? "Aktif" : status === "partial" ? "Partial" : "Offline"}
                </div>
              </div>
            </div>
            {isDualBand && <Badge variant="secondary" className="text-[10px]">Dual Band</Badge>}
          </div>

          {wifiLoading ? (
            <div className="py-8"><LoadingState /></div>
          ) : usable.length === 0 ? (
            <EmptyState icon={<WifiOff className="h-10 w-10" />} title="Tidak ada interface WiFi aktif" desc="Hubungi support untuk pemeriksaan perangkat." />
          ) : (
            <div className="space-y-3">
              {usable.map((iface: any) => (
                <WifiInterfaceCard
                  key={iface.index}
                  iface={iface}
                  apiFetch={apiFetch}
                  onUpdated={() => {
                    qc.invalidateQueries({ queryKey: ["portal-wifi-info"] });
                    setTimeout(() => refetchWifi(), 5000);
                  }}
                />
              ))}
            </div>
          )}

          <div className="mt-4 p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200/50 dark:border-sky-900/50 flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-sky-800 dark:text-sky-200">
              Perubahan SSID/password aktif dalam 1-2 menit. Perangkat yang sudah terhubung perlu re-connect.
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Restart ONT */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center shrink-0">
              <Power className="h-5 w-5 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Restart Perangkat ONT</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Coba gunakan saat koneksi lambat atau tidak stabil. Internet putus sekitar 1-2 menit. Dibatasi maksimal 1× per jam.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full mt-4 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            onClick={() => setRestartConfirm(true)}
            disabled={restartMut.isPending}
          >
            {restartMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Power className="h-4 w-4 mr-2" />}
            Restart ONT Sekarang
          </Button>
        </CardContent>
      </Card>

      {/* Restart confirm dialog */}
      <Dialog open={restartConfirm} onOpenChange={setRestartConfirm}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Konfirmasi Restart ONT</DialogTitle>
            <DialogDescription>
              Koneksi internet akan terputus sekitar 1-2 menit. Semua perangkat di rumah perlu re-connect.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setRestartConfirm(false)} className="flex-1">Batal</Button>
            <Button onClick={() => restartMut.mutate()} disabled={restartMut.isPending} className="flex-1 bg-rose-600 hover:bg-rose-700">
              {restartMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Ya, Restart
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WifiInterfaceCard({ iface, onUpdated, apiFetch }: any) {
  const [editMode, setEditMode] = useState<"ssid" | "password" | null>(null);
  const [newSsid, setNewSsid] = useState(iface.ssid ?? "");
  const [newPassword, setNewPassword] = useState(iface.password ?? "");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => { if (editMode !== "ssid") setNewSsid(iface.ssid ?? ""); }, [iface.ssid, editMode]);
  useEffect(() => { if (editMode !== "password") setNewPassword(iface.password ?? ""); }, [iface.password, editMode]);

  const changeSsidMut = useMutation({
    mutationFn: (ssid: string) => apiFetch("/api/portal/wifi/ssid", {
      method: "POST",
      body: JSON.stringify({ newSsid: ssid, wlanIndex: iface.index }),
    }),
    onSuccess: (r: any) => { toast.success(r.message ?? `SSID ${iface.band} diperbarui`); setEditMode(null); onUpdated(); },
    onError: (e: any) => toast.error(e.message),
  });

  const changePwMut = useMutation({
    mutationFn: (pw: string) => apiFetch("/api/portal/wifi/password", {
      method: "POST",
      body: JSON.stringify({ newPassword: pw, wlanIndex: iface.index }),
    }),
    onSuccess: (r: any) => { toast.success(r.message ?? `Password ${iface.band} diperbarui`); setEditMode(null); onUpdated(); },
    onError: (e: any) => toast.error(e.message),
  });

  const mutPending = changeSsidMut.isPending || changePwMut.isPending;
  const bandColor = iface.band === "5GHz"
    ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 border-violet-200 dark:border-violet-900"
    : "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-900";

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${bandColor}`}>
            {iface.band} · WLAN{iface.index}
          </span>
          {iface.securityMode && (
            <span className="text-[10px] text-muted-foreground font-mono">{iface.securityMode}</span>
          )}
        </div>
        <Badge className={`text-[10px] ${iface.enabled ? "bg-emerald-500" : "bg-slate-400"}`}>
          {iface.enabled ? "ON" : "OFF"}
        </Badge>
      </div>

      <div className="p-4 space-y-3">
        {/* SSID */}
        {editMode === "ssid" ? (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nama WiFi (SSID)</label>
            <Input value={newSsid} onChange={(e) => setNewSsid(e.target.value)} maxLength={32} placeholder="Nama WiFi baru" autoFocus className="mt-1 font-mono" />
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditMode(null); setNewSsid(iface.ssid ?? ""); }}>Batal</Button>
              <Button size="sm" className="flex-1" disabled={!newSsid.trim() || newSsid.trim().length < 3 || mutPending} onClick={() => changeSsidMut.mutate(newSsid.trim())}>
                {changeSsidMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Simpan
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Nama WiFi</div>
              <div className="font-mono text-sm font-semibold truncate">{iface.ssid || "-"}</div>
            </div>
            <Button size="sm" variant="ghost" className="text-sky-600 dark:text-sky-400 hover:text-sky-700" onClick={() => { setEditMode("ssid"); setNewSsid(iface.ssid ?? ""); }}>
              <Edit3 className="h-3.5 w-3.5 mr-1" /> Ubah
            </Button>
          </div>
        )}

        {/* Password */}
        {editMode === "password" ? (
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Password Baru</label>
            <div className="relative mt-1">
              <Input
                type={showPw ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                maxLength={63}
                placeholder="Min. 8 karakter"
                autoFocus
                className="font-mono pr-10"
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Minimal 8 karakter. Disarankan kombinasi huruf dan angka.</p>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditMode(null); setNewPassword(iface.password ?? ""); }}>Batal</Button>
              <Button size="sm" className="flex-1" disabled={newPassword.length < 8 || mutPending} onClick={() => changePwMut.mutate(newPassword)}>
                {changePwMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />} Simpan
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Password</div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold truncate">
                  {iface.password ? (showPw ? iface.password : "•".repeat(Math.min(12, iface.password.length || 8))) : "-"}
                </span>
                {iface.password && (
                  <button type="button" onClick={() => setShowPw(!showPw)} className="text-muted-foreground hover:text-foreground">
                    {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>
            <Button size="sm" variant="ghost" className="text-sky-600 dark:text-sky-400 hover:text-sky-700" onClick={() => { setEditMode("password"); setNewPassword(iface.password ?? ""); }}>
              <Edit3 className="h-3.5 w-3.5 mr-1" /> Ubah
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// TICKETS TAB
// =====================================================================
function TicketsTab({ tickets, apiFetch, qc }: any) {
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const createMut = useMutation({
    mutationFn: (data: any) => apiFetch("/api/portal/tickets", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast.success("Tiket berhasil dilaporkan. Tim kami akan segera memproses.");
      setFormOpen(false); setTitle(""); setDesc("");
      qc.invalidateQueries({ queryKey: ["portal-tickets"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const STATUS_CFG: Record<string, { label: string; color: string }> = {
    open: { label: "Baru", color: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" },
    assigned: { label: "Ditugaskan", color: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
    in_progress: { label: "Ditangani", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
    resolved: { label: "Selesai", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
    closed: { label: "Ditutup", color: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400" },
  };

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header + action */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Pusat Bantuan</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Lapor kendala, pertanyaan, atau permintaan layanan</p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="bg-sky-600 hover:bg-sky-700">
          <Plus className="h-4 w-4 mr-1.5" /> Lapor Baru
        </Button>
      </div>

      {/* Tickets list */}
      {!tickets ? (
        <LoadingState />
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="p-10">
            <EmptyState
              icon={<Inbox className="h-12 w-12" />}
              title="Belum Ada Tiket"
              desc="Semua laporan akan tampil di sini. Klik 'Lapor Baru' untuk membuat tiket pertama."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t: any) => {
            const cfg = STATUS_CFG[t.status] ?? { label: t.status, color: "bg-muted" };
            return (
              <Card key={t.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[10px] font-mono font-semibold text-muted-foreground">#{t.ticketNumber}</span>
                        <Badge className={`text-[10px] border-0 ${cfg.color}`}>{cfg.label}</Badge>
                      </div>
                      <h4 className="font-semibold text-sm">{t.title}</h4>
                      {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                      <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(t.createdAt).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lapor Kendala Baru</DialogTitle>
            <DialogDescription>
              Jelaskan kendala secara spesifik agar tim support bisa segera membantu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Judul</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Internet lambat sejak pagi" maxLength={100} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deskripsi</label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ceritakan detail kendala..." rows={4} maxLength={1000} className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">{desc.length}/1000 karakter</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button
              onClick={() => createMut.mutate({ title: title.trim(), description: desc.trim() })}
              disabled={!title.trim() || createMut.isPending}
              className="bg-sky-600 hover:bg-sky-700"
            >
              {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Kirim Laporan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =====================================================================
// POINTS TAB - Speed-on-Demand (Telco Premium)
// =====================================================================
function PointsTab({ apiFetch, qc }: any) {
  const { data: points, isLoading } = useQuery<any>({
    queryKey: ["portal-points"],
    queryFn: () => apiFetch("/api/portal/points"),
    refetchInterval: 10_000, // poll lebih cepat (10s) supaya status change ke-detect cepat
  });

  const [confirmReward, setConfirmReward] = useState<any | null>(null);
  const [activatedToast, setActivatedToast] = useState<any | null>(null); // celebration banner saat baru ter-activate
  const prevPendingIdsRef = useRef<Set<number>>(new Set());
  const prevActiveIdRef = useRef<number | null>(null);

  // Live countdown ticker untuk active boost
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Detect status change pending → active → toast & banner
  useEffect(() => {
    if (!points) return;
    const currentActive = points.activeRedemption;
    const currentRedemptions: any[] = points.redemptions ?? [];
    const currentPendingIds = new Set<number>(currentRedemptions.filter(r => r.status === "pending").map(r => r.id));

    // If a redemption that was pending now is active → activated!
    const prevPending = prevPendingIdsRef.current;
    if (currentActive && prevPending.has(currentActive.id) && prevActiveIdRef.current !== currentActive.id) {
      // Just activated
      setActivatedToast({
        rewardLabel: currentActive.rewardLabel,
        speedMultiplier: currentActive.speedMultiplier,
        endAt: currentActive.endAt,
      });
      toast.success(` ${currentActive.rewardLabel} sudah AKTIF!`, {
        description: `Speed kamu di-boost ${currentActive.speedMultiplier}× sampai ${new Date(currentActive.endAt).toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}`,
        duration: 8000,
      });
      // Auto-hide celebration banner setelah 12 detik
      setTimeout(() => setActivatedToast(null), 12_000);
    }
    // Detect rejected: prev was pending, now in redemptions list as 'rejected'
    for (const r of currentRedemptions) {
      if (r.status === "rejected" && prevPending.has(r.id)) {
        toast.error(` Permintaan ${r.rewardLabel} ditolak`, {
          description: "Point sudah dikembalikan ke saldo kamu",
          duration: 6000,
        });
      }
    }
    // Detect expired: was active, now expired
    if (prevActiveIdRef.current && !currentActive) {
      const expiredOne = currentRedemptions.find(r => r.id === prevActiveIdRef.current && r.status === "expired");
      if (expiredOne) {
        toast.success(` Boost ${expiredOne.rewardLabel} selesai`, {
          description: "Speed kembali ke paket normal. Kumpulin point lagi untuk boost berikutnya",
          duration: 6000,
        });
      }
    }

    // Update refs
    prevPendingIdsRef.current = currentPendingIds;
    prevActiveIdRef.current = currentActive?.id ?? null;
  }, [points]);

  const redeemMut = useMutation({
    mutationFn: (rewardKey: string) =>
      apiFetch("/api/portal/points/redeem", { method: "POST", body: JSON.stringify({ rewardKey }) }),
    onSuccess: () => {
      toast.success("Permintaan boost terkirim. Admin akan verifikasi.");
      setConfirmReward(null);
      qc.invalidateQueries({ queryKey: ["portal-points"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !points) return <LoadingState />;

  const balance = points.balance ?? 0;
  const lifetimeEarned = points.lifetimeEarned ?? 0;
  const lifetimeRedeemed = points.lifetimeRedeemed ?? 0;
  const catalog = points.catalog ?? [];
  const history = points.history ?? [];
  const active = points.activeRedemption;
  const redemptions = points.redemptions ?? [];

  // Active countdown
  const activeMsLeft = active?.endAt ? new Date(active.endAt).getTime() - now : 0;
  const activeProgress = active?.startAt && active?.endAt
    ? Math.max(0, Math.min(100, ((now - new Date(active.startAt).getTime()) / (new Date(active.endAt).getTime() - new Date(active.startAt).getTime())) * 100))
    : 0;
  const fmtCountdown = (ms: number) => {
    if (ms <= 0) return "Selesai";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}j ${m}m ${s}d`;
    return `${m}m ${s}d`;
  };

  return (
    <div className="space-y-4 md:space-y-5">
      {/* === Celebration banner - boost just activated === */}
      {activatedToast && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-elev-lg animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 90% 10%, rgba(255,255,255,0.5), transparent 40%), radial-gradient(circle at 10% 90%, rgba(250,204,21,0.4), transparent 50%)" }} />
          <div className="relative p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/25 backdrop-blur flex items-center justify-center shadow-lg shrink-0 ring-2 ring-white/30">
              <Zap className="w-7 h-7 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-widest font-bold opacity-90">Boost Aktif!</div>
              <div className="font-black text-lg leading-tight">{activatedToast.rewardLabel}</div>
              <div className="text-xs opacity-90 mt-0.5">
                Speed {activatedToast.speedMultiplier}× sampai{" "}
                <strong>{new Date(activatedToast.endAt).toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}</strong>
              </div>
            </div>
            <button
              onClick={() => setActivatedToast(null)}
              className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0"
              aria-label="Tutup"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* === Hero balance - Telco premium dark === */}
      <Card className="overflow-hidden border-0 shadow-elev-lg">
        <div className="relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
          {/* Mesh/grid overlay */}
          <div className="absolute inset-0 opacity-30" style={{
            backgroundImage: "radial-gradient(circle at 15% 20%, rgba(56,189,248,0.35), transparent 50%), radial-gradient(circle at 85% 80%, rgba(168,85,247,0.25), transparent 50%)",
          }} />
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }} />

          <div className="relative p-6 md:p-7">
            {/* Top label row */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg ring-1 ring-amber-300/30">
                  <Zap className="h-3.5 w-3.5 text-slate-900" strokeWidth={2.5} />
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/70">JABNET Loyalty</div>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-white/50 font-mono">Speed-on-Demand</div>
            </div>

            {/* Balance - premium typography */}
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-widest text-white/60 font-semibold">Saldo Point</div>
              <div className="flex items-baseline gap-2">
                <div className="text-5xl md:text-6xl font-black tabular-nums tracking-tight-display leading-none bg-gradient-to-br from-white via-amber-100 to-amber-300 bg-clip-text text-transparent">
                  {balance.toLocaleString("id-ID")}
                </div>
                <div className="text-sm font-semibold text-white/70 uppercase tracking-wider">pts</div>
              </div>
              <div className="text-xs text-white/60 mt-1">Tukar untuk speed boost - atau simpan untuk reward selanjutnya</div>
            </div>

            {/* Lifetime stats */}
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-white/[0.07] backdrop-blur-sm border border-white/10 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-300/80 font-semibold">
                  <TrendingUp className="h-3 w-3" /> Total Earned
                </div>
                <div className="font-bold tabular-nums text-lg mt-1 text-emerald-100">+{lifetimeEarned.toLocaleString("id-ID")}</div>
              </div>
              <div className="rounded-xl bg-white/[0.07] backdrop-blur-sm border border-white/10 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-rose-300/80 font-semibold">
                  <Sparkles className="h-3 w-3" /> Sudah Ditukar
                </div>
                <div className="font-bold tabular-nums text-lg mt-1 text-rose-100">−{lifetimeRedeemed.toLocaleString("id-ID")}</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* === Active boost - live countdown === */}
      {active && (
        <Card className="overflow-hidden border-emerald-300/60 dark:border-emerald-900 shadow-elev-md">
          <div className="bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 text-white p-5 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -mr-10 -mt-10" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shadow-lg">
                  <span className="relative flex h-5 w-5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-50" />
                    <Zap className="relative h-5 w-5 text-white" strokeWidth={2.5} />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-white/80">Boost Aktif</div>
                  <div className="font-bold text-base">{active.rewardLabel}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-white/70">Sisa</div>
                  <div className="text-xl font-black tabular-nums leading-none">{fmtCountdown(activeMsLeft)}</div>
                </div>
              </div>
              <div className="w-full h-1.5 bg-white/25 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${activeProgress}%` }} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-white/80 mt-1.5">
                <span>Mulai {active.startAt ? new Date(active.startAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</span>
                <span>Sampai {active.endAt ? new Date(active.endAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* === Earn rules - clean cards === */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm tracking-tight">Cara Dapat Point</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Bayar disiplin, dapat hadiah</p>
            </div>
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="relative overflow-hidden rounded-xl border border-emerald-200 dark:border-emerald-900 bg-gradient-to-br from-emerald-50/80 to-emerald-50/30 dark:from-emerald-950/30 dark:to-emerald-950/10 p-4">
              <div className="absolute -top-4 -right-4 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 dark:text-emerald-300">Tepat Waktu</span>
                </div>
                <div className="font-black text-2xl text-emerald-800 dark:text-emerald-200 tabular-nums">+100<span className="text-sm font-bold ml-1">pts</span></div>
                <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-1.5 leading-snug">
                  Bayar sebelum / pas tanggal jatuh tempo setiap bulan
                </p>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl border border-amber-200 dark:border-amber-900 bg-gradient-to-br from-amber-50/80 to-amber-50/30 dark:from-amber-950/30 dark:to-amber-950/10 p-4">
              <div className="absolute -top-4 -right-4 w-20 h-20 bg-amber-500/10 rounded-full blur-xl" />
              <div className="relative">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-[10px] uppercase tracking-wider font-bold text-amber-700 dark:text-amber-300">Bonus Early</span>
                </div>
                <div className="font-black text-2xl text-amber-800 dark:text-amber-200 tabular-nums">+50<span className="text-sm font-bold ml-1">pts</span></div>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-1.5 leading-snug">
                  Bonus tambahan kalau bayar ≥3 hari sebelum jatuh tempo
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* === Catalog - speed boost cards (telco style) === */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-sm tracking-tight">Tukar Point Kamu</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">{catalog.length} pilihan boost speed sementara</p>
            </div>
            <Sparkles className="h-5 w-5 text-violet-500" />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {catalog.map((c: any) => {
              const canAfford = balance >= c.pointsCost;
              const blocked = !!active;
              const disabled = !canAfford || blocked;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => !disabled && setConfirmReward(c)}
                  disabled={disabled}
                  className={`group text-left rounded-xl border-2 transition-all overflow-hidden ${
                    disabled
                      ? "border-muted bg-muted/20 opacity-60 cursor-not-allowed"
                      : "border-border bg-card hover:border-sky-400 hover:shadow-elev-md cursor-pointer"
                  }`}
                >
                  {/* Header strip */}
                  <div className={`px-4 py-2.5 flex items-center justify-between ${
                    c.speedMultiplier === 3 ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white"
                    : "bg-gradient-to-r from-sky-500 to-blue-600 text-white"
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
                      <span className="font-black text-sm tabular-nums">{c.speedMultiplier}× SPEED</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold">
                      <Clock className="h-3 w-3" />
                      {c.durationHours}j
                    </div>
                  </div>
                  {/* Body */}
                  <div className="p-4 space-y-3">
                    <div>
                      <div className="font-bold text-sm leading-tight">{c.label}</div>
                      <p className="text-[11px] text-muted-foreground mt-1 leading-snug line-clamp-2">{c.description}</p>
                    </div>
                    <div className="flex items-end justify-between pt-2 border-t border-dashed">
                      <div>
                        <div className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">Biaya</div>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="font-black text-2xl tabular-nums text-amber-600 dark:text-amber-400">{c.pointsCost.toLocaleString("id-ID")}</span>
                          <span className="text-[10px] uppercase tracking-wider font-bold text-amber-600/70">pts</span>
                        </div>
                      </div>
                      {canAfford && !blocked && (
                        <div className="text-[10px] font-bold uppercase tracking-wider text-sky-600 group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-0.5">
                          Tukar <ArrowRight className="h-3 w-3" />
                        </div>
                      )}
                      {!canAfford && !blocked && (
                        <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600">
                          Kurang {(c.pointsCost - balance).toLocaleString("id-ID")}
                        </div>
                      )}
                      {blocked && (
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Boost aktif
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {active && (
            <div className="mt-3 p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200">
              Tunggu boost <strong>{active.rewardLabel}</strong> selesai sebelum redeem yang baru.
            </div>
          )}
        </CardContent>
      </Card>

      {/* === Recent redemptions === */}
      {redemptions.length > 0 && (
        <Card>
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm tracking-tight">Riwayat Redemption</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">{redemptions.length} terakhir</p>
              </div>
              <Clock className="h-5 w-5 text-sky-500" />
            </div>
            <div className="space-y-2">
              {redemptions.map((r: any) => {
                const status = r.status === "active" ? { label: "Aktif", dot: "bg-emerald-500", color: "text-emerald-700 dark:text-emerald-300" }
                  : r.status === "pending" ? { label: "Menunggu", dot: "bg-amber-500", color: "text-amber-700 dark:text-amber-300" }
                  : r.status === "expired" ? { label: "Selesai", dot: "bg-slate-400", color: "text-slate-600 dark:text-slate-400" }
                  : r.status === "rejected" ? { label: "Ditolak", dot: "bg-rose-500", color: "text-rose-700 dark:text-rose-300" }
                  : { label: "Dibatalkan", dot: "bg-slate-400", color: "text-slate-600 dark:text-slate-400" };
                return (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                    <div className={`w-2 h-2 rounded-full ${status.dot} shrink-0`} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{r.rewardLabel}</div>
                      <div className="text-[10px] text-muted-foreground font-mono-tight">
                        {new Date(r.createdAt).toLocaleString("id-ID")}
                      </div>
                    </div>
                    <div className={`text-[10px] uppercase tracking-wider font-bold ${status.color}`}>{status.label}</div>
                    <div className="font-mono font-bold tabular-nums text-amber-600 text-sm">−{r.pointsCost}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* === Point ledger === */}
      {history.length > 0 && (
        <Card>
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm tracking-tight">Aktivitas Point</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Ledger transaksi point</p>
              </div>
              <Receipt className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="divide-y">
              {history.slice(0, 12).map((h: any) => (
                <div key={h.id} className="flex items-center gap-3 py-2.5">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    h.amount > 0 ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300"
                  }`}>
                    {h.amount > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{h.notes ?? h.source.replace(/_/g, " ")}</div>
                    <div className="text-[10px] text-muted-foreground font-mono-tight">{new Date(h.createdAt).toLocaleString("id-ID")}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-mono font-black tabular-nums text-sm ${h.amount > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {h.amount > 0 ? "+" : ""}{h.amount.toLocaleString("id-ID")}
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">saldo {h.balanceAfter.toLocaleString("id-ID")}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* === Confirm dialog === */}
      <Dialog open={!!confirmReward} onOpenChange={(o) => !o && setConfirmReward(null)}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)] p-0 overflow-hidden">
          <div className={`p-5 text-white ${confirmReward?.speedMultiplier === 3 ? "bg-gradient-to-br from-violet-600 to-fuchsia-600" : "bg-gradient-to-br from-sky-500 to-blue-600"}`}>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4" strokeWidth={2.5} />
              <span className="text-[10px] uppercase tracking-widest font-bold">Konfirmasi Redeem</span>
            </div>
            <DialogTitle className="text-white text-xl font-black tracking-tight">{confirmReward?.label}</DialogTitle>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-black tabular-nums">{confirmReward?.pointsCost?.toLocaleString("id-ID")}</span>
              <span className="text-xs uppercase tracking-wider font-bold opacity-80">point</span>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="rounded-lg bg-muted/50 border p-3 text-[11px] space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">1</span>
                <span>Permintaan masuk antrian admin</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">2</span>
                <span>Boost aktif <strong>{confirmReward?.durationHours} jam</strong> sejak verifikasi</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">3</span>
                <span>Otomatis kembali ke speed normal saat selesai</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setConfirmReward(null)}>Batal</Button>
              <Button
                onClick={() => redeemMut.mutate(confirmReward.key)}
                disabled={redeemMut.isPending}
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 hover:opacity-90"
              >
                {redeemMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Tukar Sekarang
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =====================================================================
// LOYALTY TAB - JABNET SAHABAT
// =====================================================================
function LoyaltyTab({ apiFetch, qc }: any) {
  const { data: loyalty, isLoading } = useQuery<any>({
    queryKey: ["portal-loyalty"],
    queryFn: () => apiFetch("/api/portal/loyalty"),
    refetchInterval: 60_000,
  });

  const { data: topSahabat = [] } = useQuery<any[]>({
    queryKey: ["portal-loyalty-leaderboard"],
    queryFn: () => apiFetch("/api/portal/loyalty/leaderboard"),
  });

  const { data: campaignData } = useQuery<any>({
    queryKey: ["portal-loyalty-campaign"],
    queryFn: () => apiFetch("/api/portal/loyalty/campaign"),
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [refPhone, setRefPhone] = useState("");
  const [refName, setRefName] = useState("");

  const inviteMut = useMutation({
    mutationFn: (data: any) => apiFetch("/api/portal/loyalty/referrals", {
      method: "POST", body: JSON.stringify(data),
    }),
    onSuccess: () => {
      toast.success("Undangan disimpan. Bagikan kode Sahabat via WhatsApp.");
      qc.invalidateQueries({ queryKey: ["portal-loyalty"] });
      setInviteOpen(false); setRefPhone(""); setRefName("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !loyalty) return <LoadingState />;

  const { sahabat, progressToNext, ladder, discounts } = loyalty;
  const sahabatCode = sahabat?.code ?? "-";
  const pendingDiscounts = (discounts ?? []).filter((d: any) => d.status === "pending");

  const shareText = `Halo! Yuk berlangganan JABNET FTTH - internet fiber cepat & stabil di Garut.

Pakai kode *${sahabatCode}* saat daftar → kamu dapat gratis 7 hari, saya dapat Voucher Indomaret Rp 50.000.

Cek coverage & pendaftaran:
https://fiber-tools.arkanova.id/coverage-check`;
  const shareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const copyCode = () => { navigator.clipboard.writeText(sahabatCode); toast.success("Kode Sahabat disalin"); };

  const formatReward = (d: any) => {
    if (d.type === "percent") return `${d.value}%`;
    if (d.type === "free_days") {
      const v = Number(d.value);
      if (v >= 365) return `${Math.round(v / 365)} th`;
      if (v >= 30) return `${Math.round(v / 30)} bln`;
      return `${v} hr`;
    }
    if (d.type === "voucher_indomaret") return `Rp ${Number(d.value).toLocaleString("id-ID")}`;
    if (d.type === "cash_bonus") return `Rp ${Number(d.value).toLocaleString("id-ID")}`;
    if (d.type === "speed_upgrade") return `+${d.value} Mbps`;
    return String(d.value);
  };

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Seasonal campaign banner */}
      {campaignData?.isActive && campaignData.campaign && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-purple-600 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center shrink-0"><Gift className="w-5 h-5 text-white" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-widest font-semibold opacity-90">Promo Berjalan</div>
              <div className="font-bold text-base truncate">{campaignData.campaign.name}</div>
              <div className="text-xs opacity-90">
                Reward <strong>{campaignData.campaign.multiplier}x</strong> lipat sampai {new Date(campaignData.campaign.endDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hero: Sahabat level */}
      <Card className="overflow-hidden">
        <div
          className="relative p-6 md:p-8 text-white"
          style={{ background: `linear-gradient(135deg, ${sahabat.levelColor}ee 0%, ${sahabat.levelColor}aa 100%)` }}
        >
          {/* Reward art (AI-generated) — gift & gold bokeh peeking from the right */}
          <img
            src="/brand/sahabat-hero.jpg"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right opacity-30"
          />
          {/* level-color veil keeps the level label legible over the art */}
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(90deg, ${sahabat.levelColor}f2 0%, ${sahabat.levelColor}99 42%, transparent 92%)` }}
          />
          <div className="absolute inset-0 opacity-20" style={{
            backgroundImage: "radial-gradient(circle at 90% 10%, rgba(255,255,255,0.4), transparent 40%)",
          }} />

          <div className="relative z-10 flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0 shadow-lg">
                <Award className="w-8 h-8 md:w-10 md:h-10 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] md:text-xs uppercase tracking-widest font-semibold opacity-90">
                  JABNET SAHABAT
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight mt-1">
                  {sahabat.levelLabel}
                </h2>
                <div className="flex items-center gap-2 mt-2 text-xs opacity-90">
                  <span className="font-mono font-semibold">{sahabatCode}</span>
                  <span>·</span>
                  <span>Tier {sahabat.tier.toUpperCase()}</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest opacity-80">Referral Sukses</div>
              <div className="text-4xl md:text-5xl font-bold tabular-nums">{sahabat.totalSuccessfulReferrals}</div>
            </div>
          </div>

          {progressToNext ? (
            <div className="relative z-10 mt-6 p-4 rounded-xl bg-white/15 backdrop-blur">
              <div className="flex items-center justify-between text-xs mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold">
                    {progressToNext.remaining} lagi ke <strong>{progressToNext.toLabel}</strong>
                  </span>
                </div>
                <span className="font-mono text-[11px] opacity-90">{progressToNext.current}/{progressToNext.threshold}</span>
              </div>
              <div className="w-full h-2 bg-white/25 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all"
                  style={{ width: `${Math.min(100, (progressToNext.current / progressToNext.threshold) * 100)}%` }}
                />
              </div>
              <div className="mt-2 text-[11px] opacity-90">
                <Gift className="h-3 w-3 inline mr-1" />
                Reward naik level: {progressToNext.reward}
              </div>
            </div>
          ) : (
            <div className="relative z-10 mt-6 p-4 rounded-xl bg-white/15 backdrop-blur text-xs">
              <StarIcon className="h-4 w-4 inline mr-1" />
              <strong>Status Ambassador aktif</strong> - 15% revenue share untuk semua referral selanjutnya.
            </div>
          )}
        </div>
      </Card>

      {/* CTA: referral share */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <h3 className="font-semibold text-sm mb-1">Ajak Tetangga, Dapat Voucher</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Setiap tetangga yang berlangganan via kode kamu: mereka dapat <strong className="text-foreground">gratis 7 hari</strong>, kamu dapat <strong className="text-foreground">Voucher Indomaret Rp 50.000</strong>.
          </p>

          <div className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-br from-sky-50 to-violet-50 dark:from-sky-950/40 dark:to-violet-950/40 border border-sky-200/50 dark:border-sky-900/50">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Kode Sahabat</div>
              <div className="font-mono font-bold text-lg text-sky-700 dark:text-sky-300 truncate">{sahabatCode}</div>
            </div>
            <Button size="sm" variant="outline" onClick={copyCode} className="shrink-0">
              <Copy className="h-3.5 w-3.5 mr-1.5" /> Salin
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href={shareUrl} target="_blank" rel="noreferrer">
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white">
                <Share2 className="h-4 w-4 mr-1.5" /> Share WhatsApp
              </Button>
            </a>
            <Button variant="outline" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4 mr-1.5" /> Invite Manual
            </Button>
          </div>

          <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-3 text-center">
            <ReferralStat value={sahabat.totalInvited} label="Diundang" />
            <ReferralStat value={sahabat.invitedPending} label="Menunggu" tone="amber" />
            <ReferralStat value={sahabat.totalSuccessfulReferrals} label="Sukses" tone="emerald" />
          </div>
        </CardContent>
      </Card>

      {/* Pending rewards */}
      {pendingDiscounts.length > 0 && (
        <Card>
          <CardContent className="p-5 md:p-6">
            <h3 className="font-semibold text-sm mb-1 flex items-center gap-1.5">
              <Gift className="h-4 w-4 text-amber-500" /> Reward Siap Klaim
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Hubungi CS untuk klaim voucher atau pencairan bonus cash.
            </p>
            <div className="space-y-2">
              {pendingDiscounts.map((d: any) => (
                <div key={d.id} className="p-3 rounded-lg border bg-gradient-to-r from-amber-50/60 to-emerald-50/60 dark:from-amber-950/20 dark:to-emerald-950/20 border-amber-200/50 dark:border-amber-900/50">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{d.description}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                        <span>Periode {d.eligibleForPeriod ?? "-"}</span>
                        {d.expiresAt && <span>· Expires {new Date(d.expiresAt).toLocaleDateString("id-ID")}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                        {formatReward(d)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Public Leaderboard top 10 */}
      {topSahabat.length > 0 && (
        <Card>
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-sm">Top 10 Sahabat JABNET</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Mitra paling aktif ajak tetangga</p>
              </div>
              <Trophy className="h-5 w-5 text-amber-500" />
            </div>
            <div className="space-y-1.5">
              {topSahabat.map((s: any) => {
                const isMe = s.sahabatCode === sahabatCode;
                return (
                  <div
                    key={s.rank}
                    className={`flex items-center gap-3 p-2 rounded-lg ${
                      isMe ? "bg-sky-100 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-900" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0`}
                      style={{ background: s.rank === 1 ? "#f59e0b" : s.rank === 2 ? "#94a3b8" : s.rank === 3 ? "#b45309" : "#64748b" }}
                    >
                      {s.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                        {s.displayName}
                        {isMe && <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500 text-white font-bold uppercase tracking-wide">KAMU</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{s.totalRefs}</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">ref</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Level ladder */}
      <Card>
        <CardContent className="p-5 md:p-6">
          <h3 className="font-semibold text-sm mb-1">Jalur Level Sahabat</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Setiap level unlock reward lebih besar. Setelah Berlian → status Ambassador.
          </p>
          <div className="space-y-2">
            {(ladder ?? []).map((l: any, idx: number) => {
              const hit = sahabat.totalSuccessfulReferrals >= l.threshold;
              const active = sahabat.level === l.level;
              const next = ladder[idx + 1];
              const onProgressSegment = !active && !hit && idx > 0 && ladder[idx - 1] && sahabat.totalSuccessfulReferrals >= ladder[idx - 1].threshold;
              return (
                <div
                  key={l.level}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                    active
                      ? "border-current shadow-sm"
                      : hit
                      ? "border-transparent bg-muted/50"
                      : "border-dashed border-muted"
                  }`}
                  style={active ? { borderColor: l.color, background: `${l.color}14` } : {}}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
                    style={{
                      background: hit ? l.color : "transparent",
                      color: hit ? "white" : l.color,
                      border: hit ? "none" : `2px dashed ${l.color}50`,
                    }}
                  >
                    {l.threshold}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-semibold text-sm ${hit ? "" : "text-muted-foreground"}`}>{l.label}</span>
                      {l.threshold > 0 && (
                        <span className="text-[10px] font-mono text-muted-foreground">{l.threshold} ref</span>
                      )}
                      {active && (
                        <Badge style={{ background: l.color }} className="text-[9px] text-white border-0">Aktif</Badge>
                      )}
                      {hit && !active && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                          <CheckCircle2 className="h-3 w-3" /> Tercapai
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{l.reward}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-muted/50 text-[11px] text-muted-foreground flex items-start gap-2">
            <Shield className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Program Sahabat resmi PT Arkanova Cipta Inovasi. Reward dibayarkan setelah referee aktif dan bayar pertama kali.
          </div>
        </CardContent>
      </Card>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Invite Tetangga Manual</DialogTitle>
            <DialogDescription>
              Kami track nomor ini. Saat mereka daftar dan aktif, kamu otomatis dapat Voucher Indomaret Rp 50.000.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nama (opsional)</label>
              <Input placeholder="Pak Budi, Bu Yuni..." value={refName} onChange={(e) => setRefName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nomor HP *</label>
              <Input placeholder="08123456789" value={refPhone} onChange={(e) => setRefPhone(e.target.value)} className="mt-1 font-mono" />
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setInviteOpen(false)} className="flex-1">Batal</Button>
            <Button
              onClick={() => inviteMut.mutate({ phone: refPhone, name: refName })}
              disabled={!refPhone.trim() || inviteMut.isPending}
              className="flex-1 bg-sky-600 hover:bg-sky-700"
            >
              {inviteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Simpan Invite
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =====================================================================
// SHARED COMPONENTS
// =====================================================================
function LoadingState() {
  return (
    <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin mb-2" />
      <div className="text-xs">Memuat data...</div>
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="py-8 text-center">
      <div className="text-muted-foreground/50 inline-flex mb-3">{icon}</div>
      <div className="font-semibold text-sm">{title}</div>
      <div className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">{desc}</div>
    </div>
  );
}

function AlertCard({ variant, icon, title, desc, cta }: any) {
  const styles = {
    danger: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300",
    warning: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-300",
  }[variant as string] ?? "";
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${styles}`}>
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs opacity-90 mt-0.5">{desc}</div>
      </div>
      {cta && (
        <button onClick={cta.onClick} className="shrink-0 text-xs font-semibold underline hover:no-underline whitespace-nowrap">
          {cta.label}
        </button>
      )}
    </div>
  );
}

function MiniStat({ icon, label, value, mono, tone }: { icon: React.ReactNode; label: string; value: string; mono?: boolean; tone?: "good" | "warn" | "bad" | "muted" }) {
  const toneCls = tone === "good" ? "text-emerald-600 dark:text-emerald-400" :
                  tone === "warn" ? "text-amber-600 dark:text-amber-400" :
                  tone === "bad" ? "text-rose-600 dark:text-rose-400" :
                  tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-sm font-semibold mt-0.5 truncate ${mono ? "font-mono" : ""} ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}

function BigStat({ icon, label, value, mono, tone }: { icon: React.ReactNode; label: string; value: string; mono?: boolean; tone?: "sky" | "emerald" | "amber" }) {
  const toneCls = tone === "sky" ? "text-sky-600 dark:text-sky-400" :
                  tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
                  tone === "amber" ? "text-amber-600 dark:text-amber-400" : "";
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        <span className={toneCls}>{icon}</span>
        <span>{label}</span>
      </div>
      <div className={`text-sm font-bold mt-1 truncate ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function IdentityField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`text-sm font-semibold mt-0.5 truncate ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function DataField({ label, value, meta, metaTone }: { label: string; value: string; meta?: string; metaTone?: "danger" | "warn" | "muted" }) {
  const metaCls = metaTone === "danger" ? "text-rose-600" :
                  metaTone === "warn" ? "text-amber-600" :
                  "text-muted-foreground";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
      {meta && <div className={`text-[10px] mt-0.5 ${metaCls}`}>{meta}</div>}
    </div>
  );
}

function QuickAction({
  icon: Ic, label, desc, tone, onClick, badge,
}: {
  icon: any;
  label: string;
  desc: string;
  tone: "sky" | "emerald" | "amber" | "violet" | "rose";
  onClick: () => void;
  badge?: string;
}) {
  const tones: Record<string, { bg: string; icon: string; hover: string; gradient: string }> = {
    sky: {
      bg: "bg-sky-500/10",
      icon: "text-sky-600 dark:text-sky-400",
      hover: "group-hover:border-sky-300 dark:group-hover:border-sky-700",
      gradient: "from-sky-500/5 to-transparent",
    },
    emerald: {
      bg: "bg-emerald-500/10",
      icon: "text-emerald-600 dark:text-emerald-400",
      hover: "group-hover:border-emerald-300 dark:group-hover:border-emerald-700",
      gradient: "from-emerald-500/5 to-transparent",
    },
    amber: {
      bg: "bg-amber-500/10",
      icon: "text-amber-600 dark:text-amber-400",
      hover: "group-hover:border-amber-300 dark:group-hover:border-amber-700",
      gradient: "from-amber-500/5 to-transparent",
    },
    violet: {
      bg: "bg-violet-500/10",
      icon: "text-violet-600 dark:text-violet-400",
      hover: "group-hover:border-violet-300 dark:group-hover:border-violet-700",
      gradient: "from-violet-500/5 to-transparent",
    },
    rose: {
      bg: "bg-rose-500/10",
      icon: "text-rose-600 dark:text-rose-400",
      hover: "group-hover:border-rose-300 dark:group-hover:border-rose-700",
      gradient: "from-rose-500/5 to-transparent",
    },
  };
  const t = tones[tone];
  return (
    <button
      onClick={onClick}
      className={`group relative text-left p-3 md:p-4 rounded-2xl border border-border bg-card overflow-hidden hover:shadow-elev-md transition-all active:scale-[0.97] ${t.hover}`}
    >
      {/* Decorative gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${t.gradient} pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity`} />

      <div className="relative">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${t.bg} ring-1 ring-border/40`}>
            <Ic className={`h-5 w-5 ${t.icon}`} strokeWidth={2.25} />
          </div>
          {badge && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-2xs font-black bg-destructive text-destructive-foreground">
              {badge}
            </span>
          )}
        </div>
        <div className="font-bold text-sm tracking-tight text-foreground">{label}</div>
        <div className="text-2xs md:text-xs text-muted-foreground mt-0.5 line-clamp-1">{desc}</div>
      </div>
    </button>
  );
}

function BillingStatusBadge({ status, isOverdue }: { status: string; isOverdue: boolean }) {
  const cfg = isOverdue ? { label: "TERLAMBAT", cls: "bg-rose-100 text-rose-700 border-rose-200" } :
              status === "lunas" || status === "paid" ? { label: "LUNAS", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" } :
              status === "isolir" ? { label: "ISOLIR", cls: "bg-rose-100 text-rose-700 border-rose-200" } :
              { label: (status ?? "-").toUpperCase(), cls: "bg-sky-100 text-sky-700 border-sky-200" };
  return (
    <div className={`inline-flex items-center px-3 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider ${cfg.cls}`}>
      {cfg.label}
    </div>
  );
}

function ReferralStat({ value, label, tone }: { value: number; label: string; tone?: "amber" | "emerald" }) {
  const cls = tone === "amber" ? "text-amber-600 dark:text-amber-400" :
              tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
              "text-foreground";
  return (
    <div>
      <div className={`text-2xl font-bold tabular-nums ${cls}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5">{label}</div>
    </div>
  );
}
