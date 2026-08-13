import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Receipt, Loader2, CheckCircle2, TrendingUp, Clock, Zap, ArrowRight, XCircle, Sparkles } from "lucide-react";
import { LoadingState } from "./shared";

export function PointsTab({ apiFetch, qc }: any) {
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
        <DialogContent className="max-w-sm dialog-w p-0 overflow-hidden">
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
