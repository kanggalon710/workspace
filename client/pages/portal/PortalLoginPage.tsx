import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { usePortalAuth } from "@/context/CustomerPortalAuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2, ArrowRight, AlertCircle, Shield, Zap, HeadphonesIcon, Wifi,
  MessageCircle, Lock, CheckCircle2, Radio, Sparkles,
} from "lucide-react";

/**
 * Portal Pelanggan - Login Screen (Premium Mobile-First)
 * Telco-grade hero dengan gradient mesh, trust signals, dan UX terfokus.
 */
export default function PortalLoginPage() {
  const [, setLocation] = useLocation();
  const { requestOtp, isAuthenticated } = usePortalAuth();
  const [customerId, setCustomerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) setLocation("/portal/dashboard");
  }, [isAuthenticated, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cid = customerId.trim();
    if (!cid) { setErrorMsg("Customer ID wajib diisi"); return; }
    if (cid.length < 3) { setErrorMsg("Customer ID minimal 3 karakter"); return; }

    setLoading(true);
    try {
      const result = await requestOtp(cid);
      sessionStorage.setItem("portal_otp_pending", JSON.stringify({
        otpSessionId: result.otpSessionId,
        phoneMasked: result.phoneMasked,
        customerId: cid,
        ttlSec: result.ttlSec,
        startedAt: Date.now(),
        devMode: result.devMode,
        debugOtp: result.debugOtp,
      }));

      if (result.devMode) {
        toast.success(`Kode OTP (DEV): ${result.debugOtp}`, { duration: 10000 });
      } else if (result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success(`Kode OTP dikirim ke ${result.phoneMasked}`);
      }
      setLocation("/portal/verify");
    } catch (err: any) {
      setErrorMsg(err.message || "Gagal mengirim OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      {/* --- LEFT / TOP: Hero (mobile: top gradient band · desktop: full left pane) --- */}
      <aside className="relative overflow-hidden text-white lg:w-1/2 lg:min-h-screen bg-mesh">
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-grid-pattern opacity-30" />
        {/* Gradient veil */}
        <div className="absolute inset-0 bg-gradient-to-br from-sidebar/95 via-sidebar/80 to-transparent" />

        <div className="relative z-10 flex flex-col justify-between px-6 pt-8 pb-6 lg:p-12 xl:p-16 min-h-[320px] lg:min-h-screen">
          {/* Top - Brand */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-elev-lg ring-1 ring-white/20">
              <Radio className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-black text-lg tracking-tight-display leading-none">JABNET</div>
              <div className="text-[10px] text-white/50 uppercase tracking-[0.15em] font-semibold mt-0.5">
                Fiber to the Home
              </div>
            </div>
          </div>

          {/* Middle - Hero message */}
          <div className="py-8 lg:py-0 max-w-lg">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm mb-5">
              <Sparkles className="h-3 w-3 text-sky-200" />
              <span className="text-2xs font-semibold tracking-wider uppercase text-white/90">
                Portal Pelanggan
              </span>
            </div>

            <h1 className="text-3xl lg:text-5xl font-black leading-[1.05] tracking-tight-display">
              Internet Cepat<br />
              <span className="text-gradient-brand">dalam Genggaman</span>
            </h1>
            <p className="text-white/60 mt-3 text-sm lg:text-base leading-relaxed max-w-md">
              Pantau koneksi real-time, bayar tagihan, kelola WiFi, dan dapatkan bonus dari
              <span className="text-sky-200 font-semibold"> Program Sahabat JABNET</span>.
            </p>

            {/* Feature pills - desktop only */}
            <div className="hidden lg:grid grid-cols-2 gap-3 mt-8 max-w-md">
              <FeaturePill icon={Zap} label="Live Traffic 24/7" />
              <FeaturePill icon={Wifi} label="Kelola WiFi Sendiri" />
              <FeaturePill icon={Shield} label="Aman & Terenkripsi" />
              <FeaturePill icon={HeadphonesIcon} label="CS Responsif" />
            </div>
          </div>

          {/* Bottom - Trust & company (desktop only) */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-3 gap-6 pb-6 border-b border-white/10">
              <TrustStat value="10,000+" label="Pelanggan Aktif" />
              <TrustStat value="99.9%" label="Uptime Jaringan" />
              <TrustStat value="24/7" label="Support Teknis" />
            </div>
            <div className="flex items-center justify-between gap-4 pt-5 text-xs text-white/40">
              <span>PT Arkanova Cipta Inovasi · Garut</span>
              <span className="flex items-center gap-1.5">
                <Lock className="h-3 w-3" /> SSL 256-bit
              </span>
            </div>
          </div>
        </div>

        {/* Mobile bottom gradient fade to form */}
        <div className="lg:hidden absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent to-background pointer-events-none" />
      </aside>

      {/* --- RIGHT / BOTTOM: Form --- */}
      <main className="relative flex-1 flex items-start lg:items-center justify-center p-6 pt-4 lg:p-12 -mt-8 lg:mt-0">
        <div className="w-full max-w-sm relative z-10">
          {/* Mobile elevated card */}
          <div className="lg:hidden rounded-2xl bg-card border border-border shadow-elev-lg p-6 mb-4">
            <LoginForm
              customerId={customerId}
              setCustomerId={setCustomerId}
              loading={loading}
              errorMsg={errorMsg}
              onSubmit={handleSubmit}
            />
          </div>

          {/* Desktop: no wrapper card */}
          <div className="hidden lg:block">
            <LoginForm
              customerId={customerId}
              setCustomerId={setCustomerId}
              loading={loading}
              errorMsg={errorMsg}
              onSubmit={handleSubmit}
            />
          </div>

          {/* Mobile feature strip */}
          <div className="lg:hidden grid grid-cols-2 gap-2 mt-4">
            <MobileFeature icon={Zap} label="Live Traffic" />
            <MobileFeature icon={Shield} label="Aman & Terenkripsi" />
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-border text-center space-y-2">
            <p className="text-xs text-muted-foreground">
              Lupa Customer ID?{" "}
              <a
                href="https://wa.me/6282180009030?text=Halo%20JABNET%2C%20saya%20lupa%20Customer%20ID"
                className="text-primary font-semibold hover:underline inline-flex items-center gap-1"
              >
                <MessageCircle className="h-3 w-3" />
                Hubungi CS
              </a>
            </p>
          </div>

          {/* Mobile footer */}
          <div className="lg:hidden mt-6 flex items-center justify-center gap-1.5 text-2xs text-muted-foreground">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success pulse-ring-success" />
            <span>Layanan operasional</span>
            <span className="mx-1">·</span>
            <span className="font-mono-tight">v4.2.1</span>
          </div>
        </div>
      </main>
    </div>
  );
}

// --- Subcomponents ---

function LoginForm({
  customerId,
  setCustomerId,
  loading,
  errorMsg,
  onSubmit,
}: {
  customerId: string;
  setCustomerId: (v: string) => void;
  loading: boolean;
  errorMsg: string | null;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <>
      <div className="mb-6">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-2xs font-semibold uppercase tracking-wider mb-3">
          <CheckCircle2 className="h-3 w-3" />
          Akses Portal
        </div>
        <h2 className="text-2xl lg:text-3xl font-black tracking-tight-display leading-tight text-foreground">
          Halo, Pelanggan JABNET!
        </h2>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Masukkan Customer ID untuk mengirim kode verifikasi via WhatsApp.
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm animate-fade-in"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">Tidak bisa kirim OTP</div>
            <div className="text-destructive/80 text-xs mt-0.5">{errorMsg}</div>
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="customerId"
            className="text-xs font-semibold text-foreground uppercase tracking-wider"
          >
            Customer ID
          </label>
          <div className="relative">
            <input
              id="customerId"
              type="text"
              inputMode="numeric"
              placeholder="Contoh: 052500015"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value.replace(/[^\w-]/g, ""))}
              autoFocus
              autoComplete="username"
              disabled={loading}
              className="w-full h-14 px-4 rounded-xl border-2 border-input bg-background text-foreground text-center text-xl font-black font-mono-tight tracking-[0.2em] placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:tracking-normal placeholder:text-base focus:outline-none focus:ring-4 focus:ring-primary/20 focus:border-primary transition-all shadow-elev-sm disabled:opacity-50"
            />
            {customerId.length >= 3 && !loading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
            )}
          </div>
          <p className="text-2xs text-muted-foreground leading-relaxed">
            Customer ID tertera di <span className="font-semibold text-foreground">kartu pelanggan</span> atau <span className="font-semibold text-foreground">tagihan bulanan</span>.
          </p>
        </div>

        <Button
          type="submit"
          disabled={loading}
          variant="gradient"
          size="lg"
          className="w-full h-12 text-sm font-bold shadow-elev-md hover:shadow-elev-lg"
          loading={loading}
          rightIcon={loading ? undefined : <ArrowRight />}
        >
          {loading ? "Mengirim Kode..." : "Kirim Kode OTP"}
        </Button>
      </form>
    </>
  );
}

function FeaturePill({ icon: Icon, label }: { icon: typeof Wifi; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
      <Icon className="h-3.5 w-3.5 text-sky-300 shrink-0" strokeWidth={2.25} />
      <span className="text-xs font-medium text-white/80 truncate">{label}</span>
    </div>
  );
}

function MobileFeature({ icon: Icon, label }: { icon: typeof Wifi; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-muted border border-border">
      <div className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
      </div>
      <span className="text-xs font-semibold text-foreground truncate">{label}</span>
    </div>
  );
}

function TrustStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-2xl xl:text-3xl font-black tabular-nums tracking-tight text-white">
        {value}
      </div>
      <div className="text-2xs text-white/50 uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}
