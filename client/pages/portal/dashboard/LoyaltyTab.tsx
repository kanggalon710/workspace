import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Award, Loader2, CheckCircle2, Copy, Share2, Gift, Shield, UserPlus, Star as StarIcon, Trophy } from "lucide-react";
import { LoadingState, ReferralStat } from "./shared";

export function LoyaltyTab({ apiFetch, qc }: any) {
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
