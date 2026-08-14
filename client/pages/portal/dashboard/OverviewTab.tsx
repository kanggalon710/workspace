import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wifi, Activity, Receipt, Power, Award, AlertTriangle, ChevronRight, RefreshCw, Signal, Globe, Clock, Zap, ArrowRight, XCircle, HeadphonesIcon } from "lucide-react";
import { FEATURE_BILLING_ENABLED, LoadingState, AlertCard, MiniStat, IdentityField, QuickAction } from "./shared";

export function OverviewTab({ me, billing, loyalty, meLoading, onRefresh, setTab, firstName }: any) {
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
            className={`absolute top-0 left-0 right-0 h-1 ${online ? "bg-success" : "bg-muted-foreground/40"}`}
          />
          <CardContent className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${online ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status Koneksi
                </span>
              </div>
              <button onClick={onRefresh} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>

            <div className="flex items-baseline gap-3">
              <h2 className={`text-3xl md:text-4xl font-bold tracking-tight ${online ? "text-success" : "text-muted-foreground"}`}>
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
            <div className={`absolute top-0 left-0 right-0 h-1 ${isOverdue ? "bg-destructive" : isDueSoon ? "bg-warning" : "bg-info"}`} />
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
                    <span className="text-destructive font-semibold">Lewat {Math.abs(daysUntilDue!)} hari</span>
                  ) : isDueSoon ? (
                    <span className="text-warning font-semibold">Jatuh tempo {daysUntilDue} hari lagi</span>
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
                className="shrink-0 p-2 rounded-lg bg-card shadow-sm hover:shadow-md transition-shadow"
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
