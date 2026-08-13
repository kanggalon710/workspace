import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trophy, TrendingUp, XCircle, Loader2, Star, AlertTriangle, Crown, Home as HomeIcon, Flame, Info, Wallet, ShieldAlert } from "lucide-react";
import { SahabatBadge, type SahabatTier } from "@/components/illustrations";
import { LEVEL_CFG, BADGE_CFG, fmtRp } from "./shared";
import { TierCard } from "./tiles";

export function SummaryTab({ summary, leaderboard, canEdit }: any) {
  const LEVEL_ORDER: Array<keyof typeof LEVEL_CFG> = ["new", "perunggu", "perak", "emas", "platinum", "berlian", "ambassador"];
  const totalLevelCount = LEVEL_ORDER.reduce((sum, k) => sum + (summary?.byLevel?.[k] ?? 0), 0) || 1;
  const qc = useQueryClient();
  const { data: budget } = useQuery<any>({
    queryKey: ["/api/loyalty/admin/budget"],
    queryFn: () => api.get("/loyalty/admin/budget"),
    refetchInterval: 60_000,
  });
  const { data: fraud = [] } = useQuery<any[]>({
    queryKey: ["/api/loyalty/admin/fraud-checks"],
    queryFn: () => api.get<any[]>("/loyalty/admin/fraud-checks"),
    refetchInterval: 300_000,
  });
  const { data: funnel } = useQuery<any>({
    queryKey: ["/api/loyalty/admin/funnel"],
    queryFn: () => api.get("/loyalty/admin/funnel"),
    refetchInterval: 300_000,
  });
  const { data: campaign, refetch: refetchCampaign } = useQuery<any>({
    queryKey: ["/api/loyalty/admin/campaign"],
    queryFn: () => api.get("/loyalty/admin/campaign"),
  });
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: "", startDate: "", endDate: "", multiplier: 2, description: "" });
  const campaignMut = useMutation({
    mutationFn: (payload: any) => api.put("/loyalty/admin/campaign", payload),
    onSuccess: () => { toast.success("Campaign tersimpan"); refetchCampaign(); setCampaignDialog(false); },
    onError: (e: any) => toast.error(e.message),
  });
  const clearCampaignMut = useMutation({
    mutationFn: () => api.delete("/loyalty/admin/campaign"),
    onSuccess: () => { toast.success("Campaign di-clear"); refetchCampaign(); },
    onError: (e: any) => toast.error(e.message),
  });
  const [editLimit, setEditLimit] = useState(false);
  const [limitInput, setLimitInput] = useState("");
  useEffect(() => { if (budget?.limitMonthly != null) setLimitInput(String(budget.limitMonthly)); }, [budget?.limitMonthly]);
  const saveLimitMut = useMutation({
    mutationFn: (limitMonthly: number) => api.put("/loyalty/admin/budget/config", { limitMonthly }),
    onSuccess: () => {
      toast.success("Budget limit tersimpan");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/budget"] });
      setEditLimit(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const budgetUtilization = budget?.limitMonthly > 0 ? (budget.issuedTotal / budget.limitMonthly) * 100 : 0;
  const budgetColor = budgetUtilization >= 90 ? "bg-destructive" : budgetUtilization >= 70 ? "bg-warning" : "bg-success";

  return (
    <div className="space-y-4">
      {/* Seasonal Campaign banner + config */}
      <Card className={campaign?.isActive ? "border-violet-300 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/40 dark:to-fuchsia-950/40 dark:border-violet-900" : ""}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <Flame className={`h-4 w-4 ${campaign?.isActive ? "text-fuchsia-600 dark:text-fuchsia-400" : "text-muted-foreground"}`} />
              <div className="min-w-0">
                <h3 className="font-semibold text-sm">
                  {campaign?.isActive ? ` Campaign Aktif: ${campaign.campaign?.name}` : "Seasonal Campaign"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {campaign?.isActive
                    ? `${campaign.campaign?.multiplier}x multiplier · ${new Date(campaign.campaign.startDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} - ${new Date(campaign.campaign.endDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`
                    : "Pasang multiplier reward untuk periode tertentu (Lebaran, Agustusan, dsb)"}
                </p>
                {campaign?.campaign?.description && (
                  <p className="text-[11px] text-muted-foreground/80 italic mt-1">{campaign.campaign.description}</p>
                )}
              </div>
            </div>
            {canEdit && (
              <div className="flex gap-1.5 shrink-0">
                {campaign?.isActive && (
                  <Button size="sm" variant="outline" onClick={() => {
                    if (confirm("Hentikan campaign ini?")) clearCampaignMut.mutate();
                  }}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> Stop
                  </Button>
                )}
                <Button size="sm" variant={campaign?.isActive ? "ghost" : "default"} onClick={() => {
                  const c = campaign?.campaign;
                  setCampaignForm(c
                    ? { name: c.name, startDate: c.startDate, endDate: c.endDate, multiplier: c.multiplier, description: c.description || "" }
                    : { name: "", startDate: "", endDate: "", multiplier: 2, description: "" });
                  setCampaignDialog(true);
                }}>
                  {campaign?.isActive ? "Edit" : "+ Buat Campaign"}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Budget Tracker Widget */}
      {budget && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <Wallet className="h-4 w-4 text-success" /> Budget Program Bulan Ini
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(budget.period?.from).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
                </p>
              </div>
              {canEdit && !editLimit && (
                <Button size="sm" variant="outline" onClick={() => setEditLimit(true)}>
                  Set Limit
                </Button>
              )}
            </div>
            {editLimit ? (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label className="text-xs">Limit Bulanan (Rp)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={limitInput}
                    onChange={(e) => setLimitInput(e.target.value)}
                    placeholder="10000000"
                    className="mt-1"
                  />
                </div>
                <Button size="sm" onClick={() => saveLimitMut.mutate(Number(limitInput) || 0)} disabled={saveLimitMut.isPending}>
                  Simpan
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditLimit(false)}>Batal</Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div className="p-2 rounded-md border bg-muted/30">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Issued</div>
                    <div className="text-lg font-bold tabular-nums mt-0.5">{fmtRp(budget.issuedTotal)}</div>
                    <div className="text-[10px] text-muted-foreground">{budget.issuedCount} reward</div>
                  </div>
                  <div className="p-2 rounded-md border bg-success/10 border-success/30">
                    <div className="text-[10px] uppercase tracking-wider text-success font-semibold">Applied</div>
                    <div className="text-lg font-bold tabular-nums mt-0.5 text-success">{fmtRp(budget.appliedTotal)}</div>
                    <div className="text-[10px] text-muted-foreground">{budget.appliedCount} tersalurkan</div>
                  </div>
                  <div className="p-2 rounded-md border bg-warning/10 border-warning/30">
                    <div className="text-[10px] uppercase tracking-wider text-warning font-semibold">Pending</div>
                    <div className="text-lg font-bold tabular-nums mt-0.5 text-warning">{fmtRp(budget.pendingTotal)}</div>
                    <div className="text-[10px] text-muted-foreground">{budget.pendingCount} menunggu</div>
                  </div>
                  <div className="p-2 rounded-md border bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-900">
                    <div className="text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-400 font-semibold">Limit</div>
                    <div className="text-lg font-bold tabular-nums mt-0.5 text-sky-700 dark:text-sky-300">
                      {budget.limitMonthly > 0 ? fmtRp(budget.limitMonthly) : "-"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {budget.limitMonthly > 0 ? `sisa ${fmtRp(Math.max(0, budget.limitMonthly - budget.issuedTotal))}` : "belum di-set"}
                    </div>
                  </div>
                </div>
                {budget.limitMonthly > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="font-semibold">Utilisasi</span>
                      <span className="tabular-nums">{budgetUtilization.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full transition-all ${budgetColor}`} style={{ width: `${Math.min(100, budgetUtilization)}%` }} />
                    </div>
                    {budgetUtilization >= 90 && (
                      <p className="text-[11px] text-destructive mt-1 font-medium flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Hampir mencapai limit bulan ini!
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Fraud Guard */}
      {fraud.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-1.5 text-destructive">
                <ShieldAlert className="h-4 w-4" /> Referral Mencurigakan ({fraud.length})
              </h3>
              <span className="text-[10px] text-muted-foreground">Tinjau manual sebelum reward cair</span>
            </div>
            <div className="space-y-2">
              {fraud.slice(0, 5).map((f: any, i: number) => (
                <div key={`${f.referralId}-${i}`} className="flex items-start gap-2 p-2 rounded-md border bg-background text-xs">
                  <span className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                    f.severity === "high" ? "bg-destructive" : f.severity === "medium" ? "bg-warning" : "bg-muted"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{f.reason}</div>
                    <div className="text-muted-foreground mt-0.5">
                      {f.referrerName} → {f.refereeName ?? "-"}
                      {f.refereePhone && <> · <span className="font-mono">{f.refereePhone}</span></>}
                    </div>
                    {f.detail && <div className="text-[10px] text-muted-foreground italic mt-0.5">{f.detail}</div>}
                  </div>
                </div>
              ))}
              {fraud.length > 5 && (
                <div className="text-[11px] text-muted-foreground text-center pt-1">
                  + {fraud.length - 5} lainnya
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Funnel + Cohort */}
      {funnel && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <TrendingUp className="h-4 w-4 text-indigo-500" /> Funnel Konversi Referral
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {funnel.avgDaysToReward != null ? `Rata-rata ${funnel.avgDaysToReward} hari dari invite → reward cair` : "Belum ada data reward"}
                </p>
              </div>
            </div>
            {/* 3-stage funnel */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: "Diundang", value: funnel.funnel.invited, pct: 100, color: "bg-sky-500" },
                { label: "Terdaftar", value: funnel.funnel.registered, pct: funnel.funnel.invitedToRegisteredPct, color: "bg-warning" },
                { label: "Reward Cair", value: funnel.funnel.rewarded, pct: funnel.funnel.overallConversionPct, color: "bg-success" },
              ].map(s => (
                <div key={s.label} className="p-3 rounded-md border bg-muted/30">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{s.label}</div>
                  <div className="text-2xl font-bold tabular-nums mt-0.5">{s.value}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${s.color}`} style={{ width: `${s.pct}%` }} />
                    </div>
                    <span className="text-[10px] font-mono">{s.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
            {/* Cohort bar chart */}
            {funnel.cohorts?.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Cohort (6 bulan terakhir)</div>
                <div className="space-y-1.5">
                  {funnel.cohorts.map((c: any) => (
                    <div key={c.month} className="flex items-center gap-2 text-xs">
                      <div className="w-16 font-mono text-muted-foreground">{c.month}</div>
                      <div className="flex-1 h-5 bg-muted rounded overflow-hidden flex">
                        <div className="bg-success flex items-center justify-end px-1.5 text-white text-[10px] font-semibold" style={{ width: `${c.invited > 0 ? (c.rewarded / c.invited) * 100 : 0}%` }}>
                          {c.rewarded > 0 ? c.rewarded : ""}
                        </div>
                        <div className="bg-warning" style={{ width: `${c.invited > 0 ? ((c.registered - c.rewarded) / c.invited) * 100 : 0}%` }} />
                        <div className="bg-sky-400" style={{ width: `${c.invited > 0 ? ((c.invited - c.registered) / c.invited) * 100 : 0}%` }} />
                      </div>
                      <div className="w-20 text-right font-mono tabular-nums text-[11px]">
                        <strong>{c.invited}</strong> inv · <span className="text-success">{c.conversionPct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-2">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-success rounded-sm" /> Rewarded</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-warning rounded-sm" /> Registered</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-sky-400 rounded-sm" /> Invited only</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sahabat Level - bar chart style */}
      {summary?.byLevel && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-sm">Distribusi Level Sahabat</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{totalLevelCount.toLocaleString("id-ID")} pelanggan aktif · 7 level</p>
              </div>
              <Crown className="h-5 w-5 text-warning" />
            </div>

            {/* Level rows with progress bars */}
            <div className="space-y-2">
              {LEVEL_ORDER.map((key) => {
                const cfg = LEVEL_CFG[key];
                const count = summary.byLevel?.[key] ?? 0;
                const pct = totalLevelCount > 0 ? (count / totalLevelCount) * 100 : 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <SahabatBadge tier={key as SahabatTier} className="w-8 h-8 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold">{cfg.label}</span>
                        <span className="tabular-nums">
                          <strong>{count}</strong>
                          <span className="text-muted-foreground ml-1.5 text-[10px]">({pct.toFixed(1)}%)</span>
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full transition-all rounded-full"
                          style={{ width: `${pct}%`, background: cfg.hex }}
                        />
                      </div>
                    </div>
                    <div className="w-12 text-right text-[10px] text-muted-foreground font-mono shrink-0">
                      ≥{cfg.threshold}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tier breakdown */}
      {summary?.byTier && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-sm">Struktur Tier Mitra</h3>
                <p className="text-xs text-muted-foreground mt-0.5">3 tingkat kemitraan - auto-upgrade saat Perunggu</p>
              </div>
              <Star className="h-5 w-5 text-warning" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <TierCard
                num={1} name="Pelanggan"
                count={summary.byTier.pelanggan ?? 0}
                desc="Auto-enroll untuk semua customer. Setiap referral sukses = Voucher Indomaret Rp 50.000."
                tone="slate"
              />
              <TierCard
                num={2} name="Sahabat RT/RW"
                count={summary.byTier.rtrw ?? 0}
                desc="Upgrade otomatis saat mencapai level Perunggu (5 referral). Kontrak mitra resmi."
                tone="indigo"
                badge="Level ≥ Perunggu"
              />
              <TierCard
                num={3} name="Sahabat Desa"
                count={summary.byTier.desa ?? 0}
                desc="Kemitraan BUMDes. Kantor desa gratis + 10% revenue share."
                tone="emerald"
                badge="Manual setup"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Sahabat leaderboard preview */}
      {leaderboard && leaderboard.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-sm">Top 5 Sahabat</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Berdasar total referral sukses</p>
              </div>
              <Trophy className="h-5 w-5 text-warning" />
            </div>
            <div className="space-y-2">
              {leaderboard.slice(0, 5).map((l: any, i: number) => {
                const lvl = LEVEL_CFG[l.sahabatLevel] ?? LEVEL_CFG.new;
                const rankColors = ["#f59e0b", "#94a3b8", "#b45309", "#64748b", "#64748b"];
                return (
                  <div key={l.customerId} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 transition-colors">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shadow-sm"
                      style={{ background: rankColors[i] }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{l.customerName}</div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <span className="font-mono">{l.sahabatCode ?? l.customerBillingId}</span>
                        <span>·</span>
                        <span className="flex items-center gap-0.5">{lvl.label}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xl font-bold text-indigo-600 tabular-nums">{l.totalSuccessfulReferrals}</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wider">ref</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Campaign dialog */}
      <Dialog open={campaignDialog} onOpenChange={setCampaignDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Seasonal Campaign</DialogTitle>
            <DialogDescription>
              Set multiplier reward untuk periode tertentu (e.g. 2x voucher selama Lebaran).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nama Campaign</Label>
              <Input value={campaignForm.name} onChange={(e) => setCampaignForm(f => ({ ...f, name: e.target.value }))} placeholder="Promo Lebaran 2026" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tanggal Mulai</Label>
                <Input type="date" value={campaignForm.startDate} onChange={(e) => setCampaignForm(f => ({ ...f, startDate: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Tanggal Akhir</Label>
                <Input type="date" value={campaignForm.endDate} onChange={(e) => setCampaignForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Multiplier</Label>
              <Input type="number" min={1} max={10} step={0.5} value={campaignForm.multiplier} onChange={(e) => setCampaignForm(f => ({ ...f, multiplier: Number(e.target.value) || 1 }))} className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">1.5 = 50% bonus · 2 = double · 3 = triple</p>
            </div>
            <div>
              <Label className="text-xs">Deskripsi (opsional)</Label>
              <Input value={campaignForm.description} onChange={(e) => setCampaignForm(f => ({ ...f, description: e.target.value }))} placeholder="Pesan promo untuk admin" className="mt-1" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setCampaignDialog(false)}>Batal</Button>
              <Button onClick={() => campaignMut.mutate(campaignForm)} disabled={campaignMut.isPending || !campaignForm.name || !campaignForm.startDate || !campaignForm.endDate}>
                {campaignMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tenure info (collapsed secondary) */}
      {summary?.byTenure && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-sm">Loyalitas Lama Berlangganan</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Info sekunder untuk insight retensi</p>
              </div>
              <HomeIcon className="h-5 w-5 text-sky-500" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(summary.byTenure).map(([key, count]: [string, any]) => {
                const cfg = BADGE_CFG[key];
                if (!cfg) return null;
                return (
                  <div key={key} className="text-center p-3 rounded-lg border bg-muted/20">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{cfg.label}</div>
                    <div className="text-lg font-bold mt-0.5 tabular-nums">{count}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

