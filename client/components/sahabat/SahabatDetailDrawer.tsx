import { useState, useMemo } from "react";
import { formatRupiah } from "@shared/currency";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Loader2, Trophy, Gift, Users, ArrowRight, ExternalLink, Printer, Plus,
  CheckCircle2, XCircle, Phone, MapPin, Wallet, Flame, Award, Sparkles, Shield,
} from "lucide-react";

const LEVEL_LABELS: Record<string, string> = {
  new: "Pelanggan", perunggu: "Perunggu", perak: "Perak",
  emas: "Emas", platinum: "Platinum", berlian: "Berlian", ambassador: "Ambassador",
};

const REWARD_PRESETS: Array<{
  key: string;
  label: string;
  discountType: string;
  discountValue: number;
  description: string;
  icon?: string;
}> = [
  { key: "voucher_50k",   label: "Voucher Indomaret 50K", discountType: "voucher_indomaret", discountValue: 50000,   description: "Voucher Indomaret Rp 50.000" },
  { key: "voucher_100k",  label: "Voucher Indomaret 100K", discountType: "voucher_indomaret", discountValue: 100000,  description: "Voucher Indomaret Rp 100.000" },
  { key: "voucher_200k",  label: "Voucher Indomaret 200K", discountType: "voucher_indomaret", discountValue: 200000,  description: "Voucher Indomaret Rp 200.000 - milestone" },
  { key: "free_30d",      label: "GRATIS 1 bulan",         discountType: "free_days",         discountValue: 30,       description: "Internet gratis 30 hari" },
  { key: "free_90d",      label: "GRATIS 3 bulan",         discountType: "free_days",         discountValue: 90,       description: "Internet gratis 90 hari" },
  { key: "free_365d",     label: "GRATIS 12 bulan",        discountType: "free_days",         discountValue: 365,      description: "Internet GRATIS 12 bulan - milestone Perak" },
  { key: "speed_5",       label: "Speed Boost +5 Mbps",    discountType: "speed_upgrade",      discountValue: 5,        description: "Upgrade speed +5 Mbps" },
  { key: "speed_10",      label: "Speed Boost +10 Mbps",   discountType: "speed_upgrade",      discountValue: 10,       description: "Upgrade speed +10 Mbps" },
  { key: "cash_2jt",      label: "Cash Bonus Rp 2jt",      discountType: "cash_bonus",         discountValue: 2000000,  description: "Cash bonus Rp 2.000.000 - Platinum reward" },
  { key: "percent_10",    label: "Diskon 10% sebulan",     discountType: "percent",            discountValue: 10,       description: "Diskon 10% untuk 1 periode tagihan", icon: "%" },
  { key: "percent_25",    label: "Diskon 25% sebulan",     discountType: "percent",            discountValue: 25,       description: "Diskon 25% untuk 1 periode tagihan", icon: "%" },
];

interface SahabatDetailDrawerProps {
  open: boolean;
  customerId: number | null;
  onOpenChange: (open: boolean) => void;
  onOpenKit?: (sahabat: any) => void;
}

function fmtRp(n: number | null | undefined) {
  return formatRupiah(n, "-");
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

export function SahabatDetailDrawer({ open, customerId, onOpenChange, onOpenKit }: SahabatDetailDrawerProps) {
  const qc = useQueryClient();
  const { canWrite } = useAuth();
  const canEdit = canWrite("loyalty_admin");
  const [activeTab, setActiveTab] = useState<"overview" | "referral" | "reward">("overview");
  const [rewardDialog, setRewardDialog] = useState(false);

  const { data: detail, isLoading } = useQuery<any>({
    queryKey: ["/api/loyalty/admin/sahabat", customerId],
    queryFn: () => api.get(`/loyalty/admin/sahabat/${customerId}`),
    enabled: open && !!customerId,
  });

  const [tierDialog, setTierDialog] = useState(false);

  // --- Admin Actions state -------------------------------------
  const [pointsDelta, setPointsDelta] = useState(0);
  const [pointsReason, setPointsReason] = useState("");

  const [newLevel, setNewLevel] = useState("");
  const [levelReason, setLevelReason] = useState("");

  const [newCode, setNewCode] = useState("");
  const [codeConfirmOpen, setCodeConfirmOpen] = useState(false);

  const [freezeReason, setFreezeReason] = useState("");

  const adjustPointsMut = useMutation({
    mutationFn: (data: { delta: number; reason: string }) =>
      api.post(`/loyalty/admin/sahabat/${customerId}/points-adjust`, data),
    onSuccess: () => {
      toast.success("Poin disesuaikan");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/sahabat", customerId] });
      setPointsDelta(0); setPointsReason("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal adjust"),
  });
  const setLevelMut = useMutation({
    mutationFn: (data: { level: string; reason: string }) =>
      api.post(`/loyalty/admin/sahabat/${customerId}/level`, data),
    onSuccess: () => {
      toast.success("Level diubah");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/sahabat", customerId] });
      setNewLevel(""); setLevelReason("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal set level"),
  });
  const setCodeMut = useMutation({
    mutationFn: (data: { sahabatCode: string }) =>
      api.post(`/loyalty/admin/sahabat/${customerId}/code`, data),
    onSuccess: () => {
      toast.success("Kode diubah");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/sahabat", customerId] });
      setNewCode(""); setCodeConfirmOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal set kode"),
  });
  const freezeMut = useMutation({
    mutationFn: (data: { frozen: boolean; reason?: string }) =>
      api.post(`/loyalty/admin/sahabat/${customerId}/freeze`, data),
    onSuccess: () => {
      toast.success("Status freeze diubah");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/sahabat", customerId] });
      setFreezeReason("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal toggle"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto p-0">
        {isLoading ? (
          <>
            <DialogHeader className="px-5 pt-5 pb-3 sr-only">
              <DialogTitle>Memuat detail Sahabat...</DialogTitle>
            </DialogHeader>
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </>
        ) : !detail ? (
          <>
            <DialogHeader className="px-5 pt-5 pb-3">
              <DialogTitle>Detail Sahabat</DialogTitle>
            </DialogHeader>
            <div className="p-6 text-muted-foreground text-sm">Data tidak ditemukan</div>
          </>
        ) : (
          <>
            <DialogHeader className="px-5 pt-5 pb-4 border-b bg-gradient-to-br from-rose-500 to-pink-600 text-white">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center text-2xl shrink-0">
                  {(LEVEL_LABELS[detail.loyalty?.sahabatLevel ?? "new"] ?? "?").charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="text-white text-lg">{detail.customer.name}</DialogTitle>
                  <div className="flex items-center gap-2 text-xs text-white/90 mt-1 flex-wrap">
                    <span className="font-mono">#{detail.customer.customerId}</span>
                    <span>·</span>
                    <span className="font-mono font-semibold">{detail.loyalty?.sahabatCode ?? detail.loyalty?.referralCode ?? "-"}</span>
                    <Badge className="bg-white/20 text-white border-white/30">
                      {LEVEL_LABELS[detail.loyalty?.sahabatLevel ?? "new"] ?? "Pelanggan"}
                    </Badge>
                  </div>
                </div>
              </div>
              {/* Level progress bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-white/80 mb-1">
                  <span>
                    <strong className="text-white">{detail.loyalty?.totalSuccessfulReferrals ?? 0}</strong> referral sukses
                  </span>
                  <span>
                    {detail.levelProgress?.next
                      ? <><strong>{detail.levelProgress.remainingRefs}</strong> lagi ke {LEVEL_LABELS[detail.levelProgress.next]}</>
                      : "Level maksimal"}
                  </span>
                </div>
                <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-300 transition-all" style={{ width: `${detail.levelProgress?.progressPct ?? 0}%` }} />
                </div>
              </div>
            </DialogHeader>

            {/* Quick actions */}
            <div className="px-5 py-3 border-b flex gap-2 flex-wrap bg-muted/30">
              <Button size="sm" onClick={() => setRewardDialog(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Issue Reward
              </Button>
              <Button size="sm" variant="outline" onClick={() => onOpenKit?.({
                customerName: detail.customer.name,
                sahabatCode: detail.loyalty?.sahabatCode ?? detail.loyalty?.referralCode,
                customerPhone: detail.customer.phone,
              })} className="gap-1.5">
                <Printer className="h-3.5 w-3.5" /> Kit Marketing
              </Button>
              <Button size="sm" variant="outline" onClick={() => setTierDialog(true)} className="gap-1.5">
                <Trophy className="h-3.5 w-3.5" /> Ubah Tier
              </Button>
              <Button size="sm" variant="ghost" onClick={() => window.open(`/customers?search=${detail.customer.customerId}`, "_blank")} className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> Profil Customer
              </Button>
            </div>

            {/* Tabs */}
            <div className="px-5 pt-3 border-b">
              <div className="flex gap-1">
                {([
                  { key: "overview", label: "Ringkasan" },
                  { key: "referral", label: `Referral (${detail.referralsMade?.length ?? 0})` },
                  { key: "reward", label: `Reward (${detail.rewardsReceived?.length ?? 0})` },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key as any)}
                    className={`px-3 py-2 text-xs font-semibold border-b-2 transition-colors ${
                      activeTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {activeTab === "overview" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Stat icon={<Phone className="h-3.5 w-3.5" />} label="Nomor HP" value={detail.customer.phone ?? "-"} mono />
                    <Stat icon={<MapPin className="h-3.5 w-3.5" />} label="Alamat" value={detail.customer.district ?? detail.customer.address ?? "-"} />
                    <Stat icon={<Wallet className="h-3.5 w-3.5" />} label="Tagihan Bulanan" value={fmtRp(detail.customer.billingPrice)} />
                    <Stat icon={<Flame className="h-3.5 w-3.5" />} label="Payment Streak" value={`${detail.loyalty?.onTimeStreak ?? 0} bulan`} />
                    <Stat icon={<Award className="h-3.5 w-3.5" />} label="Tenure" value={`${detail.loyalty?.tenureMonths ?? 0} bulan`} />
                    <Stat icon={<Trophy className="h-3.5 w-3.5" />} label="Longest Streak" value={`${detail.loyalty?.longestStreak ?? 0} bulan`} />
                  </div>
                  {detail.referredBy && (
                    <div className="p-3 rounded-lg border bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-900 text-xs flex items-center gap-2">
                      <Users className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                      <span className="text-muted-foreground">
                        Diajak oleh: <strong className="text-foreground">{detail.referredBy.name}</strong> <span className="font-mono">#{detail.referredBy.customerId}</span>
                      </span>
                    </div>
                  )}
                </>
              )}

              {activeTab === "referral" && (
                <div className="space-y-2">
                  {!detail.referralsMade?.length ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                      Belum ada referral
                    </div>
                  ) : (
                    detail.referralsMade.map((r: any) => (
                      <div key={r.id} className="p-3 rounded-lg border text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-semibold">{r.refereeName ?? "Tetangga"}</div>
                          <StatusBadge status={r.status} />
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
                          {r.refereePhone && <span className="font-mono">{r.refereePhone}</span>}
                          <span>· {fmtDate(r.createdAt)}</span>
                        </div>
                        {r.notes && <div className="text-[10px] text-muted-foreground italic mt-1">{r.notes}</div>}
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === "reward" && (
                <div className="space-y-2">
                  {!detail.rewardsReceived?.length ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Gift className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                      Belum ada reward
                    </div>
                  ) : (
                    detail.rewardsReceived.map((r: any) => (
                      <div key={r.id} className="p-3 rounded-lg border text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <div className="font-semibold">{r.description ?? r.discount_type}</div>
                          <Badge variant="outline" className={
                            r.status === "applied" ? "text-emerald-600 border-emerald-200"
                            : r.status === "cancelled" ? "text-rose-600 border-rose-200"
                            : "text-amber-600 border-amber-200"
                          }>
                            {r.status}
                          </Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span className="font-mono">{r.discount_type ?? r.discountType}</span>
                          <span>· nilai {r.discount_value ?? r.discountValue}</span>
                          <span>· dibuat {fmtDate(r.created_at ?? r.createdAt)}</span>
                        </div>
                        {r.notes && <div className="text-[10px] text-muted-foreground italic mt-1">{r.notes}</div>}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Admin Actions accordion (write-permission gated) */}
              {canEdit && (
                <Accordion type="single" collapsible className="mt-4 border-t pt-4">
                  <AccordionItem value="admin" className="border-b-0">
                    <AccordionTrigger className="text-sm font-medium">
                      <span className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-warning" />
                        Admin Actions
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pt-2">

                        {/* Freeze banner */}
                        {detail?.loyalty?.isFrozen === 1 && (
                          <div className="p-3 rounded-md bg-warning/10 border border-warning/30 text-warning text-sm">
                            <strong>Akun di-freeze</strong> {detail.loyalty.frozenAt ? `pada ${new Date(detail.loyalty.frozenAt).toLocaleString("id-ID")}` : ""}
                            {detail.loyalty.frozenReason && <div className="mt-1">Alasan: {detail.loyalty.frozenReason}</div>}
                          </div>
                        )}

                        {/* 1. Adjust Points */}
                        <div className="p-3 rounded-md border bg-card">
                          <h4 className="text-sm font-semibold mb-2">Adjust Points</h4>
                          <div className="text-xs text-muted-foreground mb-2">
                            Saat ini: <strong>{detail?.loyalty?.pointsBalance ?? 0}</strong> poin
                            {pointsDelta !== 0 && (
                              <> → Akan jadi: <strong>{(detail?.loyalty?.pointsBalance ?? 0) + pointsDelta}</strong></>
                            )}
                          </div>
                          <Input type="number" placeholder="Delta (+/-)" value={pointsDelta}
                            onChange={(e) => setPointsDelta(Number(e.target.value))} className="mb-2" />
                          <Textarea placeholder="Alasan (min 3 huruf)" value={pointsReason}
                            onChange={(e) => setPointsReason(e.target.value)} className="mb-2" />
                          {Math.abs(pointsDelta) > 10000 && (
                            <div className="text-xs text-warning mb-2"> Adjustment besar (&gt; 10.000 poin)</div>
                          )}
                          <Button size="sm" className="w-full"
                            disabled={pointsDelta === 0 || pointsReason.trim().length < 3}
                            loading={adjustPointsMut.isPending}
                            onClick={() => adjustPointsMut.mutate({ delta: pointsDelta, reason: pointsReason })}>
                            Adjust
                          </Button>
                        </div>

                        {/* 2. Set Level */}
                        <div className="p-3 rounded-md border bg-card">
                          <h4 className="text-sm font-semibold mb-2">Set Sahabat Level</h4>
                          <div className="text-xs text-muted-foreground mb-2">
                            Current: <strong>{detail?.loyalty?.sahabatLevel ?? "new"}</strong>
                          </div>
                          <Select value={newLevel} onValueChange={setNewLevel}>
                            <SelectTrigger className="mb-2"><SelectValue placeholder="Pilih level" /></SelectTrigger>
                            <SelectContent>
                              {["new", "perunggu", "perak", "emas", "platinum", "berlian", "ambassador"].map(l => (
                                <SelectItem key={l} value={l}>{l}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Textarea placeholder="Alasan" value={levelReason}
                            onChange={(e) => setLevelReason(e.target.value)} className="mb-2" />
                          <Button size="sm" className="w-full"
                            disabled={!newLevel || levelReason.trim().length < 3}
                            loading={setLevelMut.isPending}
                            onClick={() => setLevelMut.mutate({ level: newLevel, reason: levelReason })}>
                            Simpan Level
                          </Button>
                        </div>

                        {/* 3. Edit Sahabat Code */}
                        <div className="p-3 rounded-md border bg-card">
                          <h4 className="text-sm font-semibold mb-2">Sahabat Code</h4>
                          <div className="text-xs text-muted-foreground mb-2 font-mono-tight">
                            Current: <strong>{detail?.loyalty?.sahabatCode ?? "(belum)"}</strong>
                          </div>
                          <Input placeholder="SHB-XXX-NNN" value={newCode}
                            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                            className="mb-2 font-mono-tight" />
                          <div className="text-xs text-muted-foreground mb-2">Format: SHB-(3 huruf)-(3 digit)</div>
                          <Button size="sm" className="w-full"
                            disabled={!/^SHB-[A-Z]{3}-\d{3}$/.test(newCode)}
                            onClick={() => setCodeConfirmOpen(true)}>
                            Simpan Code
                          </Button>
                          <AlertDialog open={codeConfirmOpen} onOpenChange={setCodeConfirmOpen}>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Ubah Sahabat Code?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Kode lama <code>{detail?.loyalty?.sahabatCode ?? "-"}</code> akan diganti dengan <code>{newCode}</code>.
                                  Customer perlu diberi tahu untuk pakai kode baru.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Batal</AlertDialogCancel>
                                <AlertDialogAction onClick={() => setCodeMut.mutate({ sahabatCode: newCode })}>Ya, Ganti</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>

                        {/* 4. Freeze / Unfreeze */}
                        <div className="p-3 rounded-md border bg-card">
                          <h4 className="text-sm font-semibold mb-2">
                            {detail?.loyalty?.isFrozen === 1 ? "Unfreeze Akun" : "Freeze Akun"}
                          </h4>
                          <div className="text-xs text-muted-foreground mb-2">
                            {detail?.loyalty?.isFrozen === 1
                              ? "Aktifkan kembali - referral reward akan kembali jalan normal."
                              : "Stop reward issuance untuk akun ini (referral inbound tetap di-record tapi tidak generate voucher)."}
                          </div>
                          {detail?.loyalty?.isFrozen !== 1 && (
                            <Textarea placeholder="Alasan freeze (wajib)" value={freezeReason}
                              onChange={(e) => setFreezeReason(e.target.value)} className="mb-2" />
                          )}
                          <Button size="sm" className="w-full"
                            variant={detail?.loyalty?.isFrozen === 1 ? "default" : "destructive"}
                            disabled={detail?.loyalty?.isFrozen !== 1 && freezeReason.trim().length < 3}
                            loading={freezeMut.isPending}
                            onClick={() => freezeMut.mutate({
                              frozen: detail?.loyalty?.isFrozen !== 1,
                              reason: detail?.loyalty?.isFrozen === 1 ? undefined : freezeReason,
                            })}>
                            {detail?.loyalty?.isFrozen === 1 ? "Unfreeze" : "Freeze Akun"}
                          </Button>
                        </div>

                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>

            {/* Issue Reward Dialog */}
            <IssueRewardDialog
              open={rewardDialog}
              onOpenChange={setRewardDialog}
              customerId={detail.customer.id}
              customerName={detail.customer.name}
              onSuccess={() => {
                qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/sahabat", customerId] });
                qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/discounts"] });
                qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/summary"] });
                qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/budget"] });
              }}
            />

            {/* Tier Upgrade Dialog */}
            <TierUpgradeDialog
              open={tierDialog}
              onOpenChange={setTierDialog}
              customerId={detail.customer.id}
              customerName={detail.customer.name}
              currentTier={detail.loyalty?.sahabatTier ?? "pelanggan"}
              onSuccess={() => {
                qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/sahabat", customerId] });
                qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/summary"] });
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="p-2.5 rounded-md border bg-muted/30">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
        {icon} {label}
      </div>
      <div className={`text-sm font-semibold mt-1 ${mono ? "font-mono" : ""} truncate`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = status === "rewarded" ? "bg-emerald-100 text-emerald-700"
    : status === "registered" ? "bg-sky-100 text-sky-700"
    : status === "expired" ? "bg-slate-100 text-slate-500"
    : "bg-amber-100 text-amber-700";
  return <Badge className={`${color} border-0 text-[10px]`}>{status}</Badge>;
}

// -- Issue Reward Dialog (manual, with presets) -----------------

interface IssueRewardDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customerId: number;
  customerName: string;
  onSuccess?: () => void;
}

function IssueRewardDialog({ open, onOpenChange, customerId, customerName, onSuccess }: IssueRewardDialogProps) {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [form, setForm] = useState({
    discountType: "voucher_indomaret",
    discountValue: 0,
    description: "",
    reason: "",
    eligibleForPeriod: "",
    expiresInDays: 90,
  });

  const issueMut = useMutation({
    mutationFn: (d: any) => api.post("/loyalty/admin/discounts", { ...d, customerId }),
    onSuccess: () => {
      toast.success("Reward berhasil di-issue");
      onOpenChange(false);
      setSelectedPreset(null);
      setCustomMode(false);
      setForm({ discountType: "voucher_indomaret", discountValue: 0, description: "", reason: "", eligibleForPeriod: "", expiresInDays: 90 });
      onSuccess?.();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handlePresetClick = (preset: typeof REWARD_PRESETS[0]) => {
    setSelectedPreset(preset.key);
    setCustomMode(false);
    setForm(f => ({
      ...f,
      discountType: preset.discountType,
      discountValue: preset.discountValue,
      description: preset.description,
    }));
  };

  const handleSubmit = () => {
    if (!form.reason.trim()) {
      toast.error("Alasan wajib diisi untuk audit trail");
      return;
    }
    if (!form.discountValue || form.discountValue <= 0) {
      toast.error("Nilai reward wajib > 0");
      return;
    }
    issueMut.mutate(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Issue Reward Manual</DialogTitle>
          <DialogDescription>
            Berikan reward ad-hoc ke <strong>{customerName}</strong>. Pilih preset atau input custom.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {/* Presets */}
          <div>
            <Label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Preset
            </Label>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto border rounded-md p-1.5">
              {REWARD_PRESETS.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handlePresetClick(p)}
                  className={`text-left p-2 rounded-md text-[11px] font-medium transition-colors ${
                    selectedPreset === p.key ? "bg-primary/10 border border-primary text-primary" : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {p.icon && <span>{p.icon}</span>}
                    <span className="truncate">{p.label}</span>
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setCustomMode(true); setSelectedPreset(null); }}
              className="text-xs text-primary hover:underline mt-1.5"
            >
              + atau input custom
            </button>
          </div>

          {/* Form (show when preset selected or custom) */}
          {(selectedPreset || customMode) && (
            <div className="space-y-2.5 p-3 rounded-md border bg-muted/30">
              {customMode && (
                <>
                  <div>
                    <Label className="text-xs">Tipe Reward</Label>
                    <select
                      className="w-full border rounded-md h-9 px-2 text-sm bg-background mt-1"
                      value={form.discountType}
                      onChange={(e) => setForm(f => ({ ...f, discountType: e.target.value }))}
                    >
                      <option value="voucher_indomaret">Voucher Indomaret (Rp)</option>
                      <option value="cash_bonus">Cash Bonus (Rp)</option>
                      <option value="percent">Diskon %</option>
                      <option value="free_days">Free Days</option>
                      <option value="speed_upgrade">Speed Upgrade (Mbps)</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Nilai</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.discountValue || ""}
                      onChange={(e) => setForm(f => ({ ...f, discountValue: Number(e.target.value) }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Deskripsi</Label>
                    <Input
                      value={form.description}
                      onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Voucher khusus loyalty..."
                      className="mt-1"
                    />
                  </div>
                </>
              )}
              <div>
                <Label className="text-xs">Alasan *</Label>
                <Input
                  value={form.reason}
                  onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Goodwill customer keluhan, event hadiah, dsb..."
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Wajib - untuk audit trail.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Periode Berlaku</Label>
                  <Input
                    value={form.eligibleForPeriod}
                    onChange={(e) => setForm(f => ({ ...f, eligibleForPeriod: e.target.value }))}
                    placeholder="2026-10"
                    className="mt-1 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Expired dalam (hari)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.expiresInDays}
                    onChange={(e) => setForm(f => ({ ...f, expiresInDays: Number(e.target.value) || 90 }))}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button
              onClick={handleSubmit}
              disabled={issueMut.isPending || (!selectedPreset && !customMode)}
            >
              {issueMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Issue Reward
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// -- Tier Upgrade Dialog ------------------------------------------
interface TierUpgradeDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customerId: number;
  customerName: string;
  currentTier: string;
  onSuccess?: () => void;
}

function TierUpgradeDialog({ open, onOpenChange, customerId, customerName, currentTier, onSuccess }: TierUpgradeDialogProps) {
  const [tier, setTier] = useState<string>(currentTier);
  const [desaName, setDesaName] = useState("");
  const [bumdesPic, setBumdesPic] = useState("");
  const [bumdesPhone, setBumdesPhone] = useState("");
  const [revShare, setRevShare] = useState("10");
  const [mouUrl, setMouUrl] = useState("");

  const saveMut = useMutation({
    mutationFn: () => api.post(`/loyalty/admin/sahabat/${customerId}/tier`, {
      tier,
      metadata: tier === "desa" ? {
        desaName, bumdesPic, bumdesPhone,
        revShare: Number(revShare) || 10,
        mouUrl,
        setupAt: new Date().toISOString(),
      } : null,
    }),
    onSuccess: () => {
      toast.success("Tier Sahabat ter-update");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ubah Tier Sahabat</DialogTitle>
          <DialogDescription>
            Upgrade <strong>{customerName}</strong> ke tier kemitraan yang lebih tinggi.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-semibold mb-2 block">Pilih Tier</Label>
            <div className="grid gap-2">
              {[
                { key: "pelanggan", label: "Pelanggan (T1)", desc: "Default - auto-enroll semua customer. Voucher 50K per referral." },
                { key: "rtrw",      label: "Sahabat RT/RW (T2)", desc: "Kontrak mitra resmi. Biasanya otomatis saat capai Perunggu (5 ref)." },
                { key: "desa",      label: "Sahabat Desa (T3)", desc: "Kemitraan BUMDes. Kantor desa gratis + revenue share." },
              ].map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTier(t.key)}
                  className={`p-2.5 rounded-md border text-left transition-all ${
                    tier === t.key ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="font-semibold text-sm">{t.label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {tier === "desa" && (
            <div className="space-y-2 p-3 rounded-md border bg-emerald-50/50 dark:bg-emerald-950/20">
              <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Setup Sahabat Desa</div>
              <div>
                <Label className="text-xs">Nama Desa</Label>
                <Input value={desaName} onChange={(e) => setDesaName(e.target.value)} placeholder="Desa Cilawu" className="mt-1 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">PIC BUMDes</Label>
                  <Input value={bumdesPic} onChange={(e) => setBumdesPic(e.target.value)} placeholder="Pak Ahmad" className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">HP PIC</Label>
                  <Input value={bumdesPhone} onChange={(e) => setBumdesPhone(e.target.value)} placeholder="0812..." className="mt-1 text-sm font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Revenue Share (%)</Label>
                  <Input type="number" min={0} max={100} value={revShare} onChange={(e) => setRevShare(e.target.value)} className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">MoU URL (opsional)</Label>
                  <Input value={mouUrl} onChange={(e) => setMouUrl(e.target.value)} placeholder="drive.google.com/..." className="mt-1 text-sm" />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || tier === currentTier}>
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Simpan Tier
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
