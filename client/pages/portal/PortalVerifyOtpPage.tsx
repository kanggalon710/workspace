import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { usePortalAuth } from "@/context/CustomerPortalAuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2, ArrowLeft, RefreshCw, AlertCircle, MessageCircle,
  Radio, CheckCircle2, ShieldCheck,
} from "lucide-react";

interface OtpPending {
  otpSessionId: number;
  phoneMasked: string;
  customerId: string;
  ttlSec: number;
  startedAt: number;
  devMode?: boolean;
  debugOtp?: string;
}

export default function PortalVerifyOtpPage() {
  const [, setLocation] = useLocation();
  const { verifyOtp, requestOtp, isAuthenticated } = usePortalAuth();
  const [pending, setPending] = useState<OtpPending | null>(null);
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [remainingSec, setRemainingSec] = useState(0);
  const [resendCountdown, setResendCountdown] = useState(60);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (isAuthenticated) { setLocation("/portal/dashboard"); return; }
    const raw = sessionStorage.getItem("portal_otp_pending");
    if (!raw) { setLocation("/portal/login"); return; }
    try {
      const p = JSON.parse(raw) as OtpPending;
      setPending(p);
      const elapsed = Math.floor((Date.now() - p.startedAt) / 1000);
      setRemainingSec(Math.max(0, p.ttlSec - elapsed));
    } catch {
      setLocation("/portal/login");
    }
  }, [setLocation, isAuthenticated]);

  useEffect(() => {
    const t = setInterval(() => {
      setRemainingSec((s) => Math.max(0, s - 1));
      setResendCountdown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { inputsRef.current[0]?.focus(); }, [pending]);

  const handleInput = (idx: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[idx] = digit;
    setCode(next);
    if (digit && idx < 5) inputsRef.current[idx + 1]?.focus();
    if (next.every((d) => d.length === 1)) submitCode(next.join(""));
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) inputsRef.current[idx - 1]?.focus();
    if (e.key === "ArrowLeft" && idx > 0) inputsRef.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < 5) inputsRef.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (paste.length === 6) {
      e.preventDefault();
      setCode(paste.split(""));
      submitCode(paste);
    }
  };

  const submitCode = async (fullCode: string) => {
    if (!pending || fullCode.length !== 6) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      await verifyOtp(pending.otpSessionId, fullCode);
      sessionStorage.removeItem("portal_otp_pending");
      setSuccess(true);
      setTimeout(() => {
        toast.success("Login berhasil");
        setLocation("/portal/dashboard");
      }, 600);
    } catch (err: any) {
      setErrorMsg(err.message || "Kode OTP salah");
      setCode(["", "", "", "", "", ""]);
      inputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pending || resendCountdown > 0) return;
    setResending(true);
    try {
      const result = await requestOtp(pending.customerId);
      const newPending: OtpPending = {
        otpSessionId: result.otpSessionId,
        phoneMasked: result.phoneMasked,
        customerId: pending.customerId,
        ttlSec: result.ttlSec,
        startedAt: Date.now(),
        devMode: result.devMode,
        debugOtp: result.debugOtp,
      };
      sessionStorage.setItem("portal_otp_pending", JSON.stringify(newPending));
      setPending(newPending);
      setRemainingSec(result.ttlSec);
      setResendCountdown(60);
      setCode(["", "", "", "", "", ""]);
      setErrorMsg(null);
      if (result.devMode) toast.success(`OTP baru (DEV): ${result.debugOtp}`, { duration: 10000 });
      else toast.success("Kode OTP baru dikirim");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResending(false);
    }
  };

  if (!pending) return null;

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const expired = remainingSec === 0;
  const ttlProgress = pending ? Math.min(100, Math.max(0, (remainingSec / pending.ttlSec) * 100)) : 0;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-background relative overflow-hidden">
      {/* Backdrop — subtle gradient mesh for premium feel */}
      <div className="absolute inset-0 bg-mesh opacity-50 lg:opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/85 to-background" />
      <div className="absolute inset-0 bg-dot-pattern opacity-30" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand header */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-elev-lg ring-4 ring-sky-500/10">
              <Radio className="h-6 w-6 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-black text-lg tracking-tight-display leading-none">JABNET</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-[0.15em] font-semibold">
                Fiber to the Home
              </div>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-card border border-border shadow-elev-lg p-6 md:p-7">
          {/* Success state */}
          {success ? (
            <div className="py-8 text-center animate-fade-in">
              <div className="relative inline-flex">
                <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={2.5} />
                </div>
                <div className="absolute inset-0 rounded-full bg-success/20 animate-ping" />
              </div>
              <h3 className="text-xl font-black text-foreground mt-4 tracking-tight">Verifikasi Berhasil</h3>
              <p className="text-sm text-muted-foreground mt-1">Mengalihkan ke dashboard...</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-2xs font-semibold uppercase tracking-wider mb-3">
                  <MessageCircle className="h-3 w-3" />
                  Kode dikirim via WhatsApp
                </div>
                <h2 className="text-2xl font-black tracking-tight-display text-foreground">
                  Masukkan Kode OTP
                </h2>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  6 digit kode dikirim ke
                  <br />
                  <span className="font-mono-tight font-bold text-foreground">{pending.phoneMasked}</span>
                </p>

                {pending.devMode && pending.debugOtp && (
                  <div className="mt-3 inline-flex items-center gap-2 text-xs text-warning bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      DEV:{" "}
                      <code className="font-mono-tight font-black text-warning">
                        {pending.debugOtp}
                      </code>
                    </span>
                  </div>
                )}
              </div>

              {/* Error alert */}
              {errorMsg && (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm animate-fade-in"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">Kode tidak cocok</div>
                    <div className="text-destructive/80 text-xs mt-0.5">{errorMsg}</div>
                  </div>
                </div>
              )}

              {/* OTP input boxes */}
              <div className="flex justify-center gap-2 mb-5" onPaste={handlePaste}>
                {code.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputsRef.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handleInput(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    disabled={loading || expired}
                    aria-label={`Digit ke-${i + 1}`}
                    className={`w-11 h-14 sm:w-12 sm:h-16 text-center text-2xl font-black font-mono-tight rounded-xl border-2 transition-all focus:outline-none disabled:opacity-40 bg-background
                      ${d
                        ? "border-primary text-primary shadow-elev-md ring-2 ring-primary/20 scale-105"
                        : "border-border focus:border-primary focus:ring-4 focus:ring-primary/15"
                      }`}
                  />
                ))}
              </div>

              {loading && (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Memverifikasi kode...</span>
                </div>
              )}

              {/* Countdown with progress bar */}
              <div className="mb-5">
                <div className="flex items-center justify-between text-2xs font-semibold uppercase tracking-wider mb-1.5">
                  <span className="text-muted-foreground">Masa berlaku kode</span>
                  <span className={`font-mono-tight tabular-nums ${expired ? "text-destructive" : remainingSec < 60 ? "text-warning" : "text-foreground"}`}>
                    {expired ? "EXPIRED" : fmt(remainingSec)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      expired
                        ? "bg-destructive"
                        : ttlProgress < 20
                          ? "bg-warning"
                          : "bg-gradient-to-r from-sky-500 to-primary"
                    }`}
                    style={{ width: `${ttlProgress}%` }}
                  />
                </div>
              </div>

              {/* Resend */}
              <Button
                type="button"
                variant="outline"
                onClick={handleResend}
                disabled={resending || resendCountdown > 0}
                size="lg"
                className="w-full"
                loading={resending}
                leftIcon={resending || resendCountdown > 0 ? undefined : <RefreshCw />}
              >
                {resending
                  ? "Mengirim ulang..."
                  : resendCountdown > 0
                  ? `Kirim ulang dalam ${resendCountdown}s`
                  : "Kirim Kode Ulang"}
              </Button>
            </>
          )}
        </div>

        {/* Back + Safety */}
        {!success && (
          <>
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem("portal_otp_pending");
                  setLocation("/portal/login");
                }}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="h-3 w-3" /> Ganti Customer ID
              </button>
            </div>

            <div className="mt-5 flex items-center justify-center gap-1.5 text-2xs text-muted-foreground">
              <ShieldCheck className="h-3 w-3 text-success" />
              <span>Sesi aman · enkripsi end-to-end · auto-timeout</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
