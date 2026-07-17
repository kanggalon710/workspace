import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Heart, Trophy, Gift, Users, TrendingUp, CheckCircle2, XCircle, Loader2,
  RefreshCw, Phone, Calendar, Star, AlertTriangle, DollarSign, UserPlus,
  Crown, Home as HomeIcon, Sparkles, Flame, Search, Filter, BarChart3,
  Award, ChevronRight, ArrowUp, Zap, Info, Plus, Printer, Wallet, ShieldAlert,
  Settings, Pencil, Trash2, Clock, ArrowRight, MoreHorizontal,
} from "lucide-react";
import { SahabatKitDialog } from "@/components/sahabat/SahabatKitDialog";
import { SahabatDetailDrawer } from "@/components/sahabat/SahabatDetailDrawer";

type Tab = "summary" | "discounts" | "leaderboard" | "referrals" | "points";

// Sahabat level config — sesuai program JABNET Sahabat
const LEVEL_CFG: Record<string, { label: string; emoji: string; color: string; bg: string; threshold: number; hex: string }> = {
  new:       { label: "Pelanggan",    emoji: "👋", color: "text-slate-700 dark:text-slate-300",  bg: "bg-slate-100 dark:bg-slate-900",     threshold: 0,   hex: "#64748b" },
  perunggu:  { label: "Perunggu",     emoji: "🥉", color: "text-amber-800 dark:text-amber-200",  bg: "bg-amber-100 dark:bg-amber-950/40",  threshold: 5,   hex: "#b45309" },
  perak:     { label: "Perak",        emoji: "🥈", color: "text-slate-700 dark:text-slate-200",  bg: "bg-slate-200 dark:bg-slate-800/40",  threshold: 10,  hex: "#94a3b8" },
  emas:      { label: "Emas",         emoji: "🥇", color: "text-yellow-700 dark:text-yellow-200",bg: "bg-yellow-100 dark:bg-yellow-950/40",threshold: 20,  hex: "#f59e0b" },
  platinum:  { label: "Platinum",     emoji: "💎", color: "text-blue-700 dark:text-blue-200",    bg: "bg-blue-100 dark:bg-blue-950/40",    threshold: 30,  hex: "#3b82f6" },
  berlian:   { label: "Berlian",      emoji: "👑", color: "text-purple-700 dark:text-purple-200",bg: "bg-purple-100 dark:bg-purple-950/40",threshold: 50,  hex: "#a855f7" },
  ambassador:{ label: "Ambassador",   emoji: "🌟", color: "text-pink-700 dark:text-pink-200",    bg: "bg-pink-100 dark:bg-pink-950/40",    threshold: 100, hex: "#ec4899" },
};

// Legacy tenure badge — display sekunder
const BADGE_CFG: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  tetangga: { label: "<1 thn", emoji: "🌱", color: "text-slate-700 dark:text-slate-300", bg: "bg-slate-100 dark:bg-slate-900" },
  keluarga: { label: "1-3 thn", emoji: "🏠", color: "text-sky-700 dark:text-sky-300", bg: "bg-sky-50 dark:bg-sky-950/40" },
  sahabat:  { label: "3-5 thn", emoji: "⭐", color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-50 dark:bg-amber-950/40" },
  abadi:    { label: "5+ thn",  emoji: "👑", color: "text-yellow-700 dark:text-yellow-300", bg: "bg-yellow-100 dark:bg-yellow-950/40" },
};

const SOURCE_LABELS: Record<string, string> = {
  ref_voucher_50k:           "Voucher Indomaret 50K (ref sukses)",
  ref_bill_75k:              "Potongan Tagihan 75K (ref)",
  ref_speed_boost_5mbps:     "Upgrade +5 Mbps (3 ref)",
  referral_referee_welcome:  "Welcome 7 hari (referee baru)",
  sahabat_perunggu:          "🥉 Milestone Perunggu (5 ref)",
  sahabat_perak:             "🥈 Milestone Perak (10 ref)",
  sahabat_emas:              "🥇 Milestone Emas (20 ref)",
  sahabat_platinum:          "💎 Milestone Platinum (30 ref)",
  sahabat_berlian:           "👑 Milestone Berlian (50 ref)",
  // Legacy (tidak di-generate lagi)
  streak_3: "Streak 3 Bulan (legacy)",
  streak_6: "Streak 6 Bulan (legacy)",
  streak_12: "🎉 Anniversary (legacy)",
  streak_24: "🏆 Pelanggan Setia (legacy)",
  referral_referrer: "Referral Pengundang (legacy)",
  referral_referee: "Referral Referee (legacy)",
  seasonal: "Bonus Musiman",
};

function fmtRewardValue(d: any): string {
  if (d.discountType === "percent") return `${d.discountValue}%`;
  if (d.discountType === "free_days") {
    const v = Number(d.discountValue);
    if (v >= 365) return `${Math.round(v / 365)} thn gratis`;
    if (v >= 30) return `${Math.round(v / 30)} bln gratis`;
    return `${v} hari gratis`;
  }
  if (d.discountType === "voucher_indomaret") return `Rp ${Number(d.discountValue).toLocaleString("id-ID")}`;
  if (d.discountType === "cash_bonus") return `Rp ${Number(d.discountValue).toLocaleString("id-ID")}`;
  if (d.discountType === "speed_upgrade") return `+${d.discountValue} Mbps`;
  return String(d.discountValue);
}

const REFERRAL_STATUS_LABELS: Record<string, string> = {
  invited: "Diundang",
  registered: "Terdaftar",
  rewarded: "Reward Diberikan",
  expired: "Expired",
};

function fmtRp(n: number | null | undefined) {
  return n ? `Rp ${n.toLocaleString("id-ID")}` : "—";
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtRelative(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}j lalu`;
  return `${Math.floor(h / 24)}h lalu`;
}

export default function LoyaltyAdminPage() {
  const { canWrite } = useAuth();
  const canEdit = canWrite("loyalty_admin");
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("summary");
  const [discountStatus, setDiscountStatus] = useState<"pending" | "applied" | "cancelled">("pending");
  const [applyFor, setApplyFor] = useState<any | null>(null);
  const [invoiceRef, setInvoiceRef] = useState("");
  const [cancelFor, setCancelFor] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [editDiscountFor, setEditDiscountFor] = useState<any | null>(null);
  const [deleteDiscountFor, setDeleteDiscountFor] = useState<any | null>(null);
  const [editDiscountForm, setEditDiscountForm] = useState({ discountType: "", discountValue: 0, source: "", description: "" });
  const [deleteDiscountReason, setDeleteDiscountReason] = useState("");
  const [showConcept, setShowConcept] = useState(false);
  const [kitFor, setKitFor] = useState<any | null>(null);
  const [drawerFor, setDrawerFor] = useState<number | null>(null);
  const [showDeletedDiscounts, setShowDeletedDiscounts] = useState(false);
  const [showDeletedReferrals, setShowDeletedReferrals] = useState(false);
  const [showDeletedRedemptions, setShowDeletedRedemptions] = useState(false);

  const { data: summary } = useQuery<any>({
    queryKey: ["/api/loyalty/admin/summary"],
    queryFn: () => api.get("/loyalty/admin/summary"),
    refetchInterval: 60_000,
  });

  const { data: discounts = [], isLoading: discountsLoading } = useQuery<any[]>({
    queryKey: ["/api/loyalty/admin/discounts", discountStatus, showDeletedDiscounts],
    queryFn: () => api.get<any[]>(`/loyalty/admin/discounts?status=${discountStatus}${showDeletedDiscounts ? "&includeDeleted=true" : ""}`),
    enabled: tab === "discounts",
    refetchInterval: 30_000,
  });

  const { data: leaderboard = [], isLoading: lbLoading } = useQuery<any[]>({
    queryKey: ["/api/loyalty/admin/leaderboard"],
    queryFn: () => api.get<any[]>("/loyalty/admin/leaderboard?limit=30"),
    enabled: tab === "leaderboard" || tab === "summary",
  });

  const { data: referrals = [], isLoading: refLoading } = useQuery<any[]>({
    queryKey: ["/api/loyalty/admin/referrals", showDeletedReferrals],
    queryFn: () => api.get<any[]>(`/loyalty/admin/referrals?limit=200${showDeletedReferrals ? "&includeDeleted=true" : ""}`),
    enabled: tab === "referrals",
  });

  const { data: pointsStats } = useQuery<any>({
    queryKey: ["/api/loyalty/admin/points/stats"],
    queryFn: () => api.get("/loyalty/admin/points/stats"),
    refetchInterval: 30_000,
  });

  const applyMut = useMutation({
    mutationFn: (data: { id: number; invoiceRef?: string }) =>
      api.post(`/loyalty/admin/discounts/${data.id}/apply`, { invoiceRef: data.invoiceRef }),
    onSuccess: () => {
      toast.success("Diskon berhasil di-apply");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/discounts"] });
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/summary"] });
      setApplyFor(null); setInvoiceRef("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: (data: { id: number; reason?: string }) =>
      api.post(`/loyalty/admin/discounts/${data.id}/cancel`, { reason: data.reason }),
    onSuccess: () => {
      toast.success("Diskon dibatalkan");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/discounts"] });
      setCancelFor(null); setCancelReason("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editDiscountMut = useMutation({
    mutationFn: (data: { id: number; patch: any }) =>
      api.put(`/loyalty/admin/discounts/${data.id}`, data.patch),
    onSuccess: () => {
      toast.success("Diskon diperbarui");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/discounts"] });
      setEditDiscountFor(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal update"),
  });

  const deleteDiscountMut = useMutation({
    mutationFn: (data: { id: number; reason?: string }) =>
      api.delete(`/loyalty/admin/discounts/${data.id}`, { reason: data.reason }),
    onSuccess: () => {
      toast.success("Diskon dihapus");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/discounts"] });
      setDeleteDiscountFor(null);
      setDeleteDiscountReason("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal hapus"),
  });

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden bg-slate-50/40 dark:bg-slate-950/40">
      {/* Compact header */}
      <div className="px-4 md:px-6 pt-3 md:pt-4 space-y-3 md:space-y-4 shrink-0 bg-background border-b">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-sm shrink-0">
              <Award className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg md:text-xl font-bold tracking-tight">JABNET Sahabat</h1>
                <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 rounded">Program Resmi</span>
              </div>
            </div>
          </div>
          <div className="flex gap-1.5 items-center shrink-0">
            <Button size="sm" variant="ghost" onClick={() => setShowConcept(v => !v)} title="Bagaimana cara kerja referral?" className="h-8 w-8 p-0">
              <Info className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["/api/loyalty"] })} className="h-8">
              <RefreshCw className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Muat Ulang</span>
            </Button>
          </div>
        </div>

        {/* Concept explainer (collapsible) */}
        {showConcept && (
          <Card className="border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-900">
            <CardContent className="p-3 md:p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-sky-600 shrink-0" />
                <h3 className="font-semibold text-sm">Bagaimana referral terintegrasi dengan pelanggan?</h3>
                <button onClick={() => setShowConcept(false)} className="ml-auto text-muted-foreground hover:text-foreground">
                  <XCircle className="h-4 w-4" />
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-3 text-xs">
                <div className="rounded-md border bg-background p-3">
                  <div className="flex items-center gap-1.5 font-semibold text-sky-700 dark:text-sky-300 mb-1.5">
                    <Zap className="h-3.5 w-3.5" /> Jalur Otomatis (System)
                  </div>
                  <ol className="space-y-1 text-muted-foreground list-decimal ml-4">
                    <li>Pelanggan dapat <strong>kode Sahabat</strong> otomatis (<code className="font-mono text-[10px]">SHB-KEC-NNN</code>) di portal pelanggan.</li>
                    <li>Share kode ke tetangga via WA / omongan.</li>
                    <li>Tetangga daftar internet di <code className="font-mono text-[10px]">billing.jabnet.id</code> — tulis kode ref.</li>
                    <li>Billing sync detect customer baru → auto-link ke referrer (match HP).</li>
                    <li>Saat bayar pertama → reward <strong>Voucher Rp 50K</strong> cair otomatis ke pengundang.</li>
                  </ol>
                </div>
                <div className="rounded-md border bg-background p-3">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-300 mb-1.5">
                    <UserPlus className="h-3.5 w-3.5" /> Jalur Manual (Admin)
                  </div>
                  <ol className="space-y-1 text-muted-foreground list-decimal ml-4">
                    <li>Admin terima info via telepon/WA/ketemu langsung: "Pak A mau refer Pak B".</li>
                    <li>Klik <strong>Catat Referral</strong> di tab Referral → pilih Pak A → isi nama &amp; HP Pak B.</li>
                    <li>Baris masuk antrian dengan status <em>Diundang</em>.</li>
                    <li>Saat Pak B daftar di billing.jabnet.id, admin klik tombol <strong>Link</strong> untuk hubungkan.</li>
                    <li>Flow reward selanjutnya sama seperti jalur otomatis.</li>
                  </ol>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 rounded border bg-amber-50 dark:bg-amber-950/20 text-[11px]">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-muted-foreground">
                  <strong className="text-foreground">Satu entry, dua jalur:</strong> kedua jalur menyimpan ke tabel yang sama — jadi walau awalnya manual, sistem tetap tracking progress level & milestone bonus seperti referral otomatis.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Executive KPI cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              icon={<Users className="h-5 w-5" />}
              iconBg="bg-indigo-500"
              label="Referral Sukses"
              value={summary.referrals.totalSuccessful}
              trend={`Top mitra: ${summary.referrals.topReferrals} ref`}
            />
            <KpiCard
              icon={<Gift className="h-5 w-5" />}
              iconBg="bg-emerald-500"
              label="Reward Antrian"
              value={summary.discounts.pending}
              trend={`${summary.discounts.applied} sudah disalurkan`}
              alert={summary.discounts.pending > 0}
            />
            <KpiCard
              icon={<UserPlus className="h-5 w-5" />}
              iconBg="bg-amber-500"
              label="Invite Menunggu"
              value={summary.referrals.pending}
              trend={`${summary.referrals.converted} sudah convert`}
            />
            <KpiCard
              icon={<Zap className="h-5 w-5" />}
              iconBg="bg-sky-500"
              label="Pembayaran Disiplin"
              value={summary.payments.totalOnTime}
              trend={`Rekor streak: ${summary.payments.topStreak} bulan`}
            />
          </div>
        )}

        {/* Segmented tab nav */}
        <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-full md:w-fit overflow-x-auto -mx-1">
          {([
            { key: "summary", label: "Ringkasan", icon: BarChart3, badge: null as number | null },
            { key: "discounts", label: "Antrian Reward", icon: Gift, badge: summary?.discounts?.pending ?? null },
            { key: "points", label: "Speed Boost", icon: Zap, badge: pointsStats?.pending ?? null },
            { key: "leaderboard", label: "Top Sahabat", icon: Trophy, badge: null as number | null },
            { key: "referrals", label: "Referral", icon: Users, badge: summary?.referrals?.pending ?? null },
          ]).map(({ key, label, icon: Ic, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key as Tab)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                tab === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Ic className="h-3.5 w-3.5" />
              {label}
              {badge != null && badge > 0 && (
                <span className={`ml-0.5 h-4 min-w-4 px-1 flex items-center justify-center rounded text-[9px] font-bold ${
                  tab === key ? "bg-rose-500 text-white" : "bg-muted-foreground/20"
                }`}>{badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 kanban-scrollbar">
        {tab === "summary" && <SummaryTab summary={summary} leaderboard={leaderboard} canEdit={canEdit} />}

        {tab === "discounts" && (
          <div className="space-y-3">
            {/* Segmented filter + show-deleted toggle */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
                {([
                  { key: "pending", label: "Menunggu" },
                  { key: "applied", label: "Sudah Diberikan" },
                  { key: "cancelled", label: "Dibatalkan" },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setDiscountStatus(key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                      discountStatus === key
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={showDeletedDiscounts}
                  onCheckedChange={setShowDeletedDiscounts}
                  id="show-deleted-discounts"
                />
                <label
                  htmlFor="show-deleted-discounts"
                  className="text-xs text-muted-foreground cursor-pointer select-none"
                >
                  Tampilkan terhapus
                </label>
              </div>
            </div>

            {discountsLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : discounts.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Gift className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                  <div className="font-semibold text-sm">Tidak ada reward {discountStatus === "pending" ? "menunggu" : discountStatus === "applied" ? "yang sudah diberikan" : "yang dibatalkan"}</div>
                  <div className="text-xs text-muted-foreground mt-1">Reward baru akan muncul di sini otomatis</div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {discounts.map((d) => (
                  <DiscountRow key={d.id} d={d} canEdit={canEdit}
                    onApply={() => { setApplyFor(d); setInvoiceRef(""); }}
                    onCancel={() => { setCancelFor(d); setCancelReason(""); }}
                    onEdit={() => {
                      setEditDiscountFor(d);
                      setEditDiscountForm({
                        discountType: d.discountType ?? "",
                        discountValue: d.discountValue ?? 0,
                        source: d.source ?? "",
                        description: d.description ?? "",
                      });
                    }}
                    onDelete={() => { setDeleteDiscountFor(d); setDeleteDiscountReason(""); }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "leaderboard" && (
          <LeaderboardTable leaderboard={leaderboard} loading={lbLoading} onKit={(l: any) => setKitFor(l)} onOpenDetail={(id: number) => setDrawerFor(id)} />
        )}

        {tab === "referrals" && (
          <ReferralsTable
            referrals={referrals}
            loading={refLoading}
            showDeleted={showDeletedReferrals}
            onShowDeletedChange={setShowDeletedReferrals}
          />
        )}

        {tab === "points" && (
          <PointRedemptionsTab
            canEdit={canEdit}
            stats={pointsStats}
            showDeleted={showDeletedRedemptions}
            onShowDeletedChange={setShowDeletedRedemptions}
          />
        )}
      </div>

      {/* Apply dialog */}
      <Dialog open={!!applyFor} onOpenChange={(o) => !o && setApplyFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Terapkan Diskon</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1 pt-1">
                <div>{applyFor?.customerName} — {applyFor?.description}</div>
                <div className="text-xs"><strong>{applyFor ? fmtRewardValue({ discountType: applyFor.discountType, discountValue: applyFor.discountValue }) : "—"}</strong> untuk periode {applyFor?.eligibleForPeriod ?? "—"}</div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Referensi Invoice (opsional)</Label>
              <Input
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                placeholder="No invoice, catatan potongan, dsb..."
                className="text-sm mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Isi agar mudah di-cross-check dengan billing.jabnet.id. Diskon akan tercatat sebagai sudah diterapkan.
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setApplyFor(null)}>Batal</Button>
              <Button
                className="flex-1"
                onClick={() => applyMut.mutate({ id: applyFor.id, invoiceRef: invoiceRef.trim() || undefined })}
                disabled={applyMut.isPending}
              >
                {applyMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Konfirmasi Apply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sahabat Kit dialog — marketing material generator */}
      <SahabatKitDialog
        open={!!kitFor}
        onOpenChange={(o) => !o && setKitFor(null)}
        sahabat={kitFor ? {
          customerName: kitFor.customerName,
          sahabatCode: kitFor.sahabatCode ?? kitFor.customerBillingId ?? "-",
          customerPhone: kitFor.customerPhone,
        } : null}
      />

      {/* Sahabat Detail Drawer */}
      <SahabatDetailDrawer
        open={!!drawerFor}
        customerId={drawerFor}
        onOpenChange={(o) => !o && setDrawerFor(null)}
        onOpenKit={(s) => setKitFor(s)}
      />

      {/* Cancel dialog */}
      <AlertDialog open={!!cancelFor} onOpenChange={(o) => !o && setCancelFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan Diskon?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-1">
                <div>{cancelFor?.customerName} — {cancelFor?.description}</div>
                <div className="text-xs"><strong>{cancelFor ? fmtRewardValue({ discountType: cancelFor.discountType, discountValue: cancelFor.discountValue }) : "—"}</strong> untuk periode {cancelFor?.eligibleForPeriod ?? "—"}</div>
                <Input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Alasan (dispute, customer pindah, dll)"
                  className="text-sm mt-2"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancelMut.mutate({ id: cancelFor.id, reason: cancelReason.trim() || undefined })}
              className="bg-red-500 hover:bg-red-600"
            >
              Ya, Batalkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit discount dialog */}
      <Dialog open={!!editDiscountFor} onOpenChange={(o) => !o && setEditDiscountFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Diskon</DialogTitle>
            <DialogDescription>
              Hanya diskon status &lsquo;pending&rsquo; yang bisa di-edit.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Tipe</Label>
              <Select
                value={editDiscountForm.discountType}
                onValueChange={(v) => setEditDiscountForm(f => ({ ...f, discountType: v }))}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="voucher_indomaret">Voucher Indomaret (Rp)</SelectItem>
                  <SelectItem value="free_days">Gratis hari (jumlah hari)</SelectItem>
                  <SelectItem value="percent">Persen diskon (%)</SelectItem>
                  <SelectItem value="cash_bonus">Cash bonus (Rp)</SelectItem>
                  <SelectItem value="speed_upgrade">Speed upgrade (Mbps)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Nilai</Label>
              <Input
                type="number"
                className="mt-1"
                value={editDiscountForm.discountValue}
                onChange={(e) => setEditDiscountForm(f => ({ ...f, discountValue: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label className="text-xs">Source</Label>
              <Input
                className="mt-1"
                value={editDiscountForm.source}
                onChange={(e) => setEditDiscountForm(f => ({ ...f, source: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Deskripsi</Label>
              <Textarea
                className="mt-1"
                value={editDiscountForm.description}
                onChange={(e) => setEditDiscountForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditDiscountFor(null)}>Batal</Button>
              <Button
                className="flex-1"
                loading={editDiscountMut.isPending}
                onClick={() => editDiscountMut.mutate({ id: editDiscountFor.id, patch: editDiscountForm })}
              >
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete discount dialog */}
      <AlertDialog open={!!deleteDiscountFor} onOpenChange={(o) => !o && setDeleteDiscountFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Diskon?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-1">
                <div>
                  Diskon <strong>Rp {deleteDiscountFor?.discountValue?.toLocaleString("id-ID") ?? "-"}</strong> akan disembunyikan dari list.
                </div>
                <div className="text-xs">Soft delete — masih bisa di-restore via SQL admin kalau perlu.</div>
                <Textarea
                  placeholder="Alasan hapus (opsional)"
                  value={deleteDiscountReason}
                  onChange={(e) => setDeleteDiscountReason(e.target.value)}
                  className="text-sm mt-2"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteDiscountMut.mutate({ id: deleteDiscountFor.id, reason: deleteDiscountReason.trim() || undefined })}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Components ──────────────────────────────────────────────────────

function KpiCard({
  icon, iconBg, label, value, trend, alert,
}: { icon: React.ReactNode; iconBg: string; label: string; value: number; trend?: string; alert?: boolean }) {
  return (
    <Card className={`relative overflow-hidden ${alert ? "ring-1 ring-emerald-500/30" : ""}`} title={trend}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</div>
            <div className="text-2xl font-bold tabular-nums mt-0.5 tracking-tight leading-none">{Number(value ?? 0).toLocaleString("id-ID")}</div>
          </div>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white shadow-sm ${iconBg}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryTab({ summary, leaderboard, canEdit }: any) {
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
  const budgetColor = budgetUtilization >= 90 ? "bg-rose-500" : budgetUtilization >= 70 ? "bg-amber-500" : "bg-emerald-500";

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
                  {campaign?.isActive ? `🎉 Campaign Aktif: ${campaign.campaign?.name}` : "Seasonal Campaign"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {campaign?.isActive
                    ? `${campaign.campaign?.multiplier}x multiplier · ${new Date(campaign.campaign.startDate).toLocaleDateString("id-ID", { day: "numeric", month: "short" })} – ${new Date(campaign.campaign.endDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}`
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
                  <Wallet className="h-4 w-4 text-emerald-500" /> Budget Program Bulan Ini
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
                  <div className="p-2 rounded-md border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900">
                    <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-semibold">Applied</div>
                    <div className="text-lg font-bold tabular-nums mt-0.5 text-emerald-700 dark:text-emerald-300">{fmtRp(budget.appliedTotal)}</div>
                    <div className="text-[10px] text-muted-foreground">{budget.appliedCount} tersalurkan</div>
                  </div>
                  <div className="p-2 rounded-md border bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
                    <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-400 font-semibold">Pending</div>
                    <div className="text-lg font-bold tabular-nums mt-0.5 text-amber-700 dark:text-amber-300">{fmtRp(budget.pendingTotal)}</div>
                    <div className="text-[10px] text-muted-foreground">{budget.pendingCount} menunggu</div>
                  </div>
                  <div className="p-2 rounded-md border bg-sky-50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-900">
                    <div className="text-[10px] uppercase tracking-wider text-sky-700 dark:text-sky-400 font-semibold">Limit</div>
                    <div className="text-lg font-bold tabular-nums mt-0.5 text-sky-700 dark:text-sky-300">
                      {budget.limitMonthly > 0 ? fmtRp(budget.limitMonthly) : "—"}
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
                      <p className="text-[11px] text-rose-600 mt-1 font-medium flex items-center gap-1">
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
        <Card className="border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
                <ShieldAlert className="h-4 w-4" /> Referral Mencurigakan ({fraud.length})
              </h3>
              <span className="text-[10px] text-muted-foreground">Tinjau manual sebelum reward cair</span>
            </div>
            <div className="space-y-2">
              {fraud.slice(0, 5).map((f: any, i: number) => (
                <div key={`${f.referralId}-${i}`} className="flex items-start gap-2 p-2 rounded-md border bg-background text-xs">
                  <span className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                    f.severity === "high" ? "bg-rose-500" : f.severity === "medium" ? "bg-amber-500" : "bg-slate-400"
                  }`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{f.reason}</div>
                    <div className="text-muted-foreground mt-0.5">
                      {f.referrerName} → {f.refereeName ?? "—"}
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
                { label: "Terdaftar", value: funnel.funnel.registered, pct: funnel.funnel.invitedToRegisteredPct, color: "bg-amber-500" },
                { label: "Reward Cair", value: funnel.funnel.rewarded, pct: funnel.funnel.overallConversionPct, color: "bg-emerald-500" },
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
                        <div className="bg-emerald-500 flex items-center justify-end px-1.5 text-white text-[10px] font-semibold" style={{ width: `${c.invited > 0 ? (c.rewarded / c.invited) * 100 : 0}%` }}>
                          {c.rewarded > 0 ? c.rewarded : ""}
                        </div>
                        <div className="bg-amber-400" style={{ width: `${c.invited > 0 ? ((c.registered - c.rewarded) / c.invited) * 100 : 0}%` }} />
                        <div className="bg-sky-400" style={{ width: `${c.invited > 0 ? ((c.invited - c.registered) / c.invited) * 100 : 0}%` }} />
                      </div>
                      <div className="w-20 text-right font-mono tabular-nums text-[11px]">
                        <strong>{c.invited}</strong> inv · <span className="text-emerald-600">{c.conversionPct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-2">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-sm" /> Rewarded</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-amber-400 rounded-sm" /> Registered</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 bg-sky-400 rounded-sm" /> Invited only</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sahabat Level — bar chart style */}
      {summary?.byLevel && (
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-sm">Distribusi Level Sahabat</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{totalLevelCount.toLocaleString("id-ID")} pelanggan aktif · 7 level</p>
              </div>
              <Crown className="h-5 w-5 text-amber-500" />
            </div>

            {/* Level rows with progress bars */}
            <div className="space-y-2">
              {LEVEL_ORDER.map((key) => {
                const cfg = LEVEL_CFG[key];
                const count = summary.byLevel?.[key] ?? 0;
                const pct = totalLevelCount > 0 ? (count / totalLevelCount) * 100 : 0;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-lg shrink-0" style={{ background: `${cfg.hex}22` }}>
                      {cfg.emoji}
                    </div>
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
                <p className="text-xs text-muted-foreground mt-0.5">3 tingkat kemitraan — auto-upgrade saat Perunggu</p>
              </div>
              <Star className="h-5 w-5 text-amber-500" />
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
              <Trophy className="h-5 w-5 text-amber-500" />
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
                        <span className="flex items-center gap-0.5">{lvl.emoji} {lvl.label}</span>
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
                    <div className="text-2xl mb-1">{cfg.emoji}</div>
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

function TierCard({ num, name, count, desc, tone, badge }: {
  num: number; name: string; count: number; desc: string; tone: "slate" | "indigo" | "emerald"; badge?: string;
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800",
    indigo: "bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900",
    emerald: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900",
  };
  const dotTones: Record<string, string> = {
    slate: "bg-slate-500", indigo: "bg-indigo-500", emerald: "bg-emerald-500",
  };
  return (
    <div className={`p-4 rounded-xl border ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-white text-[11px] font-bold ${dotTones[tone]}`}>
          T{num}
        </div>
        <div className="font-semibold text-sm">{name}</div>
      </div>
      <div className="text-3xl font-bold tabular-nums">{count}</div>
      <div className="text-[10px] text-muted-foreground mt-1 leading-snug">{desc}</div>
      {badge && (
        <div className="mt-2 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground border-t pt-2">
          {badge}
        </div>
      )}
    </div>
  );
}

function DiscountRow({ d, canEdit, onApply, onCancel, onEdit, onDelete }: any) {
  const lvl = LEVEL_CFG[d.sahabatLevel ?? "new"] ?? LEVEL_CFG.new;
  const isExpired = d.expiresAt && new Date(d.expiresAt).getTime() < Date.now();
  const isDeleted = !!d.deletedAt;
  const rewardValueStr = fmtRewardValue(d);
  const isPercent = d.discountType === "percent";
  const isVoucher = d.discountType === "voucher_indomaret" || d.discountType === "cash_bonus";
  return (
    <Card className={`hover:shadow-sm transition-all ${isDeleted ? "opacity-50 line-through" : isExpired ? "opacity-60" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-sm">{d.customerName}</span>
              <span className="text-xs text-muted-foreground font-mono">#{d.customerBillingId}</span>
              {d.sahabatCode && (
                <span className="inline-flex items-center px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 rounded text-[10px] font-mono font-semibold">
                  {d.sahabatCode}
                </span>
              )}
              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${lvl.bg} ${lvl.color}`}>
                {lvl.emoji} {lvl.label}
              </span>
              {isDeleted && (
                <span className="no-underline ml-1 text-[10px] px-1.5 py-0.5 rounded-md bg-destructive/15 text-destructive font-semibold">
                  Dihapus
                </span>
              )}
            </div>
            <div className="text-sm text-foreground/80 mt-1">{d.description}</div>
            <div className="flex items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Periode {d.eligibleForPeriod ?? "—"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                {SOURCE_LABELS[d.source] ?? d.source}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                Ref sukses: <strong className="text-indigo-600 dark:text-indigo-400">{d.totalSuccessfulReferrals ?? 0}</strong>
              </span>
              {isPercent && d.billingPrice && (
                <span>
                  Tagihan <strong>{fmtRp(d.billingPrice)}</strong> → hemat <strong className="text-emerald-600">{fmtRp(Math.round(d.billingPrice * d.discountValue / 100))}</strong>
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0 border-l pl-4">
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap tabular-nums">{rewardValueStr}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">
              {isVoucher ? "Voucher/Cash" : isPercent ? (d.discountValue === 100 ? "GRATIS" : "Diskon") : d.discountType.replace(/_/g, " ")}
            </div>
          </div>
        </div>

      {d.status === "pending" && (
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t">
          {isExpired ? (
            <span className="text-xs text-rose-600 font-medium inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Expired {fmtDate(d.expiresAt)}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              Expires: <strong className="text-foreground">{fmtDate(d.expiresAt)}</strong>
              {d.customerPhone && <> · <a href={`tel:${d.customerPhone}`} className="hover:underline text-sky-600">{d.customerPhone}</a></>}
            </span>
          )}
          {canEdit && (
            <div className="flex gap-2 items-center">
              <Button size="icon-xs" variant="ghost" onClick={onEdit} title="Edit diskon">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={onDelete}
                disabled={d.status === "applied"}
                title={d.status === "applied" ? "Sudah dipakai customer, tidak bisa dihapus" : "Hapus diskon"}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
              <Button size="sm" variant="outline" onClick={onCancel} className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40">Batalkan</Button>
              <Button size="sm" onClick={onApply} className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Apply
              </Button>
            </div>
          )}
        </div>
      )}
      {d.status === "applied" && (
        <div className="mt-3 pt-3 border-t text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
          <span className="flex-1">
            Applied oleh <strong className="text-foreground">{d.appliedByName ?? "—"}</strong> · {fmtDate(d.appliedAt)}
            {d.invoiceRef && <span> · Ref: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">{d.invoiceRef}</code></span>}
          </span>
          {canEdit && (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onDelete}
              disabled
              title="Sudah dipakai customer, tidak bisa dihapus"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      )}
      {d.status === "cancelled" && (
        <div className="mt-3 pt-3 border-t text-[11px] text-rose-600 flex items-center gap-2">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            Dibatalkan {fmtDate(d.appliedAt ?? d.createdAt)}
            {d.invoiceRef && <span> · {d.invoiceRef}</span>}
          </span>
          {canEdit && (
            <Button
              size="icon-xs"
              variant="ghost"
              onClick={onDelete}
              title="Hapus diskon"
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      )}
      </CardContent>
    </Card>
  );
}

function LeaderboardTable({ leaderboard, loading, onKit, onOpenDetail }: any) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim() || !leaderboard) return leaderboard ?? [];
    const q = search.toLowerCase();
    return leaderboard.filter((l: any) =>
      l.customerName?.toLowerCase().includes(q)
      || l.sahabatCode?.toLowerCase().includes(q)
      || l.customerBillingId?.toLowerCase().includes(q)
    );
  }, [leaderboard, search]);
  const data = filtered;
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!leaderboard?.length) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <Trophy className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <div className="font-semibold text-sm">Belum ada data Sahabat</div>
          <div className="text-xs text-muted-foreground mt-1">Data akan tampil setelah ada referral sukses pertama</div>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Cari nama / kode Sahabat / ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-left text-muted-foreground border-b">
            <tr>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px] w-12">Rank</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Pelanggan</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Kode</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Ref Sukses</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Level</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Streak</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">On-time/Telat</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Tenure</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px] text-right">Tagihan</th>
              <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {data.map((l: any, i: number) => {
              const lvl = LEVEL_CFG[l.sahabatLevel ?? "new"] ?? LEVEL_CFG.new;
              const tn = BADGE_CFG[l.tenureBadge] ?? BADGE_CFG.tetangga;
              return (
                <tr key={l.customerId} className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onOpenDetail?.(l.customerId)}>
                  <td className="py-3 px-4">
                    {i < 3 ? (
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shadow-sm"
                        style={{ background: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : "#b45309" }}
                      >
                        {i + 1}
                      </div>
                    ) : (
                      <span className="text-muted-foreground font-mono pl-2">#{i + 1}</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="font-semibold text-sm">{l.customerName}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">#{l.customerBillingId}</div>
                  </td>
                  <td className="py-3 px-4">
                    {l.sahabatCode ? (
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold">
                        {l.sahabatCode}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-base font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{l.totalSuccessfulReferrals}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${lvl.bg} ${lvl.color}`}>
                      {lvl.emoji} {lvl.label}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-orange-600 tabular-nums">{l.currentStreak}</td>
                  <td className="py-3 px-4 text-right text-[11px] tabular-nums">
                    <span className="text-emerald-600">{l.totalOnTime}</span>
                    <span className="text-muted-foreground mx-0.5">/</span>
                    <span className="text-rose-500">{l.totalLate}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                      <span>{tn.emoji}</span>
                      <span className="font-mono">{l.tenureMonths}m</span>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums text-[11px] font-medium">{fmtRp(l.billingPrice)}</td>
                  <td className="py-3 px-4">
                    <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1" onClick={(e) => { e.stopPropagation(); onKit?.(l); }}>
                      <Printer className="h-3 w-3" /> Kit
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
    </div>
  );
}

function ReferralsTable({ referrals, loading, showDeleted, onShowDeletedChange }: any) {
  const qc = useQueryClient();
  const { canWrite } = useAuth();
  const canEdit = canWrite("loyalty_admin");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerStatusFilter, setCustomerStatusFilter] = useState<"all" | "belum_daftar" | "aktif" | "non_aktif">("all");
  const [linkFor, setLinkFor] = useState<any | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [manualDialog, setManualDialog] = useState(false);
  const [manualForm, setManualForm] = useState({ referrerCustomerId: 0, referrerName: "", refereeName: "", refereePhone: "", notes: "" });
  const [referrerSearch, setReferrerSearch] = useState("");
  const [editFor, setEditFor] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ refereeName: "", refereePhone: "", notes: "" });
  const [deleteFor, setDeleteFor] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const editMut = useMutation({
    mutationFn: (data: { id: number; patch: any }) =>
      api.put(`/loyalty/admin/referrals/${data.id}`, data.patch),
    onSuccess: () => {
      toast.success("Referral diperbarui");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/referrals"] });
      setEditFor(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal update"),
  });

  const deleteMut = useMutation({
    mutationFn: (data: { id: number; reason?: string }) =>
      api.delete(`/loyalty/admin/referrals/${data.id}`, { reason: data.reason }),
    onSuccess: () => {
      toast.success("Referral dihapus");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/referrals"] });
      setDeleteFor(null);
      setDeleteReason("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal hapus"),
  });
  const filtered = useMemo(() => {
    let rows = referrals;
    if (customerStatusFilter !== "all") {
      rows = rows.filter((r: any) => r.refereeStatus === customerStatusFilter);
    }
    if (statusFilter !== "all") {
      rows = rows.filter((r: any) => r.status === statusFilter);
    }
    return rows;
  }, [referrals, customerStatusFilter, statusFilter]);

  // Customer search for linking + manual create
  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["customers"],
    queryFn: () => api.get<any[]>("/customers"),
    staleTime: 60_000,
    enabled: !!linkFor || manualDialog,
  });

  const matchingReferrers = useMemo(() => {
    if (!referrerSearch || referrerSearch.length < 2) return [];
    const q = referrerSearch.toLowerCase();
    return customers.filter((c: any) => {
      return c.name?.toLowerCase().includes(q)
        || c.customerId?.toLowerCase().includes(q)
        || (c.phone ?? "").replace(/[\s-+]/g, "").includes(q.replace(/[\s-+]/g, ""));
    }).slice(0, 8);
  }, [referrerSearch, customers]);

  const createManualMut = useMutation({
    mutationFn: (payload: { referrerCustomerId: number; refereeName: string; refereePhone?: string; notes?: string }) =>
      api.post("/loyalty/admin/referrals", payload),
    onSuccess: () => {
      toast.success("Referral offline berhasil dicatat");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/referrals"] });
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/summary"] });
      setManualDialog(false);
      setManualForm({ referrerCustomerId: 0, referrerName: "", refereeName: "", refereePhone: "", notes: "" });
      setReferrerSearch("");
    },
    onError: (e: any) => toast.error(e.message || "Gagal mencatat referral"),
  });
  const matchingCustomers = useMemo(() => {
    if (!customerSearch || customerSearch.length < 2) return [];
    const q = customerSearch.toLowerCase();
    return customers.filter((c: any) => {
      const nameMatch = c.name?.toLowerCase().includes(q);
      const idMatch = c.customerId?.toLowerCase().includes(q);
      const phoneMatch = c.phone?.replace(/[\s-+]/g, "").includes(q.replace(/[\s-+]/g, ""));
      return nameMatch || idMatch || phoneMatch;
    }).slice(0, 10);
  }, [customerSearch, customers]);

  const linkMut = useMutation({
    mutationFn: (data: { referralId: number; customerId: number }) =>
      api.post(`/loyalty/admin/referrals/${data.referralId}/link`, { customerId: data.customerId }),
    onSuccess: () => {
      toast.success("Referral berhasil di-link ke customer");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/referrals"] });
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/summary"] });
      setLinkFor(null); setCustomerSearch("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      {/* Primary filter — Status Pelanggan (segmented control) */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit overflow-x-auto no-scrollbar">
        {([
          { key: "all",          label: "Semua" },
          { key: "belum_daftar", label: "Belum daftar" },
          { key: "aktif",        label: "Aktif" },
          { key: "non_aktif",    label: "Non-aktif" },
        ] as const).map((opt) => {
          const count = opt.key === "all"
            ? referrals.length
            : referrals.filter((r: any) => r.refereeStatus === opt.key).length;
          return (
            <button
              key={opt.key}
              onClick={() => setCustomerStatusFilter(opt.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all whitespace-nowrap ${
                customerStatusFilter === opt.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
              <span className="ml-1 opacity-60 font-normal">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Secondary filter row — Status Referral dropdown + toggle + CTA */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground select-none">Status Referral:</label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua ({referrals.length})</SelectItem>
              {(["invited", "registered", "rewarded", "expired"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {REFERRAL_STATUS_LABELS[s] ?? s} ({referrals.filter((r: any) => r.status === s).length})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              checked={!!showDeleted}
              onCheckedChange={onShowDeletedChange}
              id="show-deleted-referrals"
            />
            <label
              htmlFor="show-deleted-referrals"
              className="text-xs text-muted-foreground cursor-pointer select-none"
            >
              Tampilkan terhapus
            </label>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => setManualDialog(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Catat Referral
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <div className="font-semibold text-sm">
              {customerStatusFilter === "belum_daftar" && "Semua referee sudah jadi pelanggan"}
              {customerStatusFilter === "aktif" && "Belum ada referee yang aktif sebagai pelanggan"}
              {customerStatusFilter === "non_aktif" && "Tidak ada referee yang isolir/terminated"}
              {customerStatusFilter === "all" && "Belum ada referral"}
            </div>
            <div className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
              {customerStatusFilter === "all"
                ? "Referral akan muncul dari dua jalur: otomatis saat pelanggan share kode Sahabat ke tetangga, atau manual kalau admin catat referral dari obrolan offline."
                : "Coba ubah filter status di atas atau toggle 'Tampilkan terhapus' kalau perlu lihat data yang sudah dihapus."}
            </div>
            {canEdit && customerStatusFilter === "all" && (
              <Button size="sm" onClick={() => setManualDialog(true)} className="mt-4 gap-1.5">
                <Plus className="h-4 w-4" /> Catat Referral Offline
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Pengundang</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Kode Sahabat</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Tetangga Diundang</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Status Pelanggan</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Status</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Tanggal</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Terdaftar?</th>
                  <th className="py-3 px-4 font-semibold uppercase tracking-wider text-[10px]">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => {
                  const statusColor = r.status === "rewarded" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : r.status === "registered" ? "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                    : r.status === "expired" ? "bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
                  const isDeleted = !!r.deletedAt;
                  return (
                    <tr key={r.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${isDeleted ? "opacity-50 line-through" : ""}`}>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-sm">{r.referrerName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">#{r.referrerBillingId}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold">
                          {r.referralCode}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm font-medium">{r.refereeName ?? "—"}</div>
                        {r.refereePhone && <div className="text-[10px] text-muted-foreground font-mono">{r.refereePhone}</div>}
                      </td>
                      <td className="py-3 px-4">
                        {r.refereeStatus === "belum_daftar" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <UserPlus className="h-3 w-3" />
                            Belum daftar
                          </span>
                        )}
                        {r.refereeStatus === "aktif" && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                              Aktif
                            </span>
                            {r.refereeCustomerName && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]">
                                {r.refereeCustomerName}
                                {r.refereeBillingId && <span className="font-mono ml-1">#{r.refereeBillingId}</span>}
                              </div>
                            )}
                          </div>
                        )}
                        {r.refereeStatus === "non_aktif" && (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                              Non-aktif
                            </span>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {r.refereeIsIsolir
                                ? "Isolir"
                                : r.refereeCustomerStatusRaw && r.refereeCustomerStatusRaw !== "active"
                                  ? r.refereeCustomerStatusRaw
                                  : "—"}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor}`}>
                          {REFERRAL_STATUS_LABELS[r.status] ?? r.status}
                        </span>
                        {isDeleted && (
                          <span className="no-underline ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md bg-destructive/15 text-destructive font-semibold">
                            Dihapus
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-[11px]">{fmtRelative(r.createdAt)}</td>
                      <td className="py-3 px-4">
                        {r.refereeCustomerId ? (
                          <div>
                            <div className="text-emerald-600 dark:text-emerald-400 text-sm font-medium inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> {r.refereeCustomerName}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">#{r.refereeBillingId}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[11px] italic">Belum daftar</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          {!r.refereeCustomerId && canEdit && r.status === "invited" && (
                            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => { setLinkFor(r); setCustomerSearch(""); }}>
                              <UserPlus className="h-3 w-3 mr-1" /> Link
                            </Button>
                          )}
                          {canEdit && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon-xs" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  disabled={r.status === "rewarded"}
                                  onClick={() => {
                                    setEditFor(r);
                                    setEditForm({
                                      refereeName: r.refereeName ?? "",
                                      refereePhone: r.refereePhone ?? "",
                                      notes: r.notes ?? "",
                                    });
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={r.status === "rewarded"}
                                  className="text-destructive"
                                  onClick={() => { setDeleteFor(r); setDeleteReason(""); }}
                                >
                                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Hapus
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Manual create referral dialog (offline entry) */}
      <Dialog open={manualDialog} onOpenChange={(o) => { if (!o) { setManualDialog(false); setReferrerSearch(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Catat Referral Offline</DialogTitle>
            <DialogDescription>
              Input referral dari obrolan telepon/WA/ketemu langsung. Baris akan masuk dengan status <em>Diundang</em> — nanti bisa di-<strong>Link</strong> ke customer saat tetangga daftar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Step 1: Pilih Referrer */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center">1</span>
                Pilih Pengundang
              </Label>
              {manualForm.referrerCustomerId > 0 ? (
                <div className="flex items-center justify-between p-2.5 rounded-md border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{manualForm.referrerName}</div>
                    <div className="text-[10px] text-muted-foreground">Customer #{manualForm.referrerCustomerId}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => {
                    setManualForm(f => ({ ...f, referrerCustomerId: 0, referrerName: "" }));
                    setReferrerSearch("");
                  }}>
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <Input
                    value={referrerSearch}
                    onChange={(e) => setReferrerSearch(e.target.value)}
                    placeholder="Cari nama / ID / HP pengundang (min 2 karakter)"
                    className="text-sm"
                    autoFocus
                  />
                  {matchingReferrers.length > 0 && (
                    <div className="border rounded-md max-h-40 overflow-y-auto">
                      {matchingReferrers.map((c: any) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setManualForm(f => ({ ...f, referrerCustomerId: c.id, referrerName: c.name }));
                            setReferrerSearch("");
                          }}
                          className="w-full text-left px-3 py-2 border-b last:border-0 hover:bg-muted/50 text-xs"
                        >
                          <div className="font-semibold">{c.name}</div>
                          <div className="text-[10px] text-muted-foreground">#{c.customerId} · {c.phone ?? "no phone"}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  {referrerSearch.length >= 2 && matchingReferrers.length === 0 && (
                    <p className="text-[11px] text-muted-foreground italic">Tidak ada customer match</p>
                  )}
                </>
              )}
            </div>

            {/* Step 2: Input Referee */}
            <div className="space-y-3 pt-2 border-t">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold inline-flex items-center justify-center">2</span>
                Data Tetangga yang Direfer
              </Label>
              <div className="space-y-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">Nama Lengkap *</Label>
                  <Input
                    value={manualForm.refereeName}
                    onChange={(e) => setManualForm(f => ({ ...f, refereeName: e.target.value }))}
                    placeholder="Nama tetangga yang mau dijadikan pelanggan"
                    className="text-sm mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Nomor HP <span className="text-muted-foreground/60">(opsional tapi disarankan)</span></Label>
                  <Input
                    value={manualForm.refereePhone}
                    onChange={(e) => setManualForm(f => ({ ...f, refereePhone: e.target.value }))}
                    placeholder="08xxxxxxxxxx"
                    className="text-sm mt-1 font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground/80 mt-1">
                    HP dipakai untuk auto-link saat customer baru terdaftar dengan HP yang sama.
                  </p>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Catatan <span className="text-muted-foreground/60">(opsional)</span></Label>
                  <Input
                    value={manualForm.notes}
                    onChange={(e) => setManualForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Via telpon, WA, ketemu langsung, dsb..."
                    className="text-sm mt-1"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" className="flex-1" onClick={() => setManualDialog(false)}>Batal</Button>
              <Button
                className="flex-1"
                disabled={!manualForm.referrerCustomerId || !manualForm.refereeName.trim() || createManualMut.isPending}
                onClick={() => {
                  createManualMut.mutate({
                    referrerCustomerId: manualForm.referrerCustomerId,
                    refereeName: manualForm.refereeName.trim(),
                    refereePhone: manualForm.refereePhone.trim() || undefined,
                    notes: manualForm.notes.trim() || undefined,
                  });
                }}
              >
                {createManualMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Simpan Referral
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Link referee dialog */}
      <Dialog open={!!linkFor} onOpenChange={(o) => !o && setLinkFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hubungkan ke Customer</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1 pt-1 text-xs">
                <div>Referral: <strong>{linkFor?.referralCode}</strong></div>
                <div>Pengundang: {linkFor?.referrerName}</div>
                <div>Tetangga diundang: {linkFor?.refereeName ?? "—"} ({linkFor?.refereePhone ?? "—"})</div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Cari customer (nama / ID / phone)</Label>
              <Input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Min 2 karakter..."
                className="text-sm mt-1"
                autoFocus
              />
            </div>
            {matchingCustomers.length > 0 && (
              <div className="border rounded-md max-h-64 overflow-y-auto">
                {matchingCustomers.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => linkMut.mutate({ referralId: linkFor.id, customerId: c.id })}
                    disabled={linkMut.isPending}
                    className="w-full text-left px-3 py-2 border-b last:border-0 hover:bg-muted/50 disabled:opacity-50 text-xs"
                  >
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      #{c.customerId} · {c.phone ?? "no phone"}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {customerSearch.length >= 2 && matchingCustomers.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">Tidak ada customer match</p>
            )}
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setLinkFor(null)}>Tutup</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit referral dialog */}
      <Dialog open={!!editFor} onOpenChange={(o) => !o && setEditFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Referral</DialogTitle>
            <DialogDescription>
              Edit info referee. Tidak bisa edit kalau status sudah &lsquo;rewarded&rsquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nama Referee</Label>
              <Input
                className="mt-1"
                value={editForm.refereeName}
                onChange={(e) => setEditForm(f => ({ ...f, refereeName: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Nomor HP</Label>
              <Input
                className="mt-1 font-mono"
                value={editForm.refereePhone}
                onChange={(e) => setEditForm(f => ({ ...f, refereePhone: e.target.value }))}
              />
            </div>
            <div>
              <Label className="text-xs">Catatan</Label>
              <Textarea
                className="mt-1"
                value={editForm.notes}
                onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditFor(null)}>Batal</Button>
              <Button
                className="flex-1"
                loading={editMut.isPending}
                onClick={() => editMut.mutate({ id: editFor.id, patch: editForm })}
              >
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete referral confirm */}
      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Referral?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-1">
                <div>
                  Referral ke <strong>{deleteFor?.refereeName ?? "-"}</strong> akan disembunyikan (soft delete).
                </div>
                <Textarea
                  placeholder="Alasan hapus (opsional)"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  className="text-sm mt-2"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMut.mutate({ id: deleteFor.id, reason: deleteReason.trim() || undefined })}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// POINT REDEMPTIONS TAB — Speed-on-Demand admin verification
// ═══════════════════════════════════════════════════════════════
function PointRedemptionsTab({ canEdit, stats, showDeleted, onShowDeletedChange }: { canEdit: boolean; stats: any; showDeleted: boolean; onShowDeletedChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [verifyFor, setVerifyFor] = useState<any | null>(null);
  const [rejectFor, setRejectFor] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [editFor, setEditFor] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ speedMultiplier: 2, durationHours: 6, pointsCost: 0, notes: "" });
  const [deleteFor, setDeleteFor] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const { data: redemptions = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/loyalty/admin/points/redemptions", statusFilter, showDeleted],
    queryFn: () => api.get<any[]>(`/loyalty/admin/points/redemptions?status=${statusFilter}${showDeleted ? "&includeDeleted=true" : ""}`),
    refetchInterval: 30_000,
  });

  const verifyMut = useMutation({
    mutationFn: (data: { id: number; notes?: string }) =>
      api.post(`/loyalty/admin/points/redemptions/${data.id}/verify`, { notes: data.notes }),
    onSuccess: (r: any) => {
      const endAt = r?.data?.endAt ?? r?.endAt;
      const endTxt = endAt ? new Date(endAt).toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }) : "-";
      toast.success(`Boost diaktivasi · expired ${endTxt} · cek tab Aktif`, { duration: 6000 });
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/redemptions"] });
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/stats"] });
      setVerifyFor(null); setVerifyNotes("");
      // Auto-switch ke filter active biar admin langsung lihat hasilnya
      setStatusFilter("active");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: (data: { id: number; reason: string }) =>
      api.post(`/loyalty/admin/points/redemptions/${data.id}/reject`, { reason: data.reason }),
    onSuccess: () => {
      toast.success("Redemption ditolak. Point sudah dikembalikan.");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/redemptions"] });
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/stats"] });
      setRejectFor(null); setRejectReason("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) =>
      api.post(`/loyalty/admin/points/redemptions/${id}/cancel`, { reason: "cancelled by admin" }),
    onSuccess: () => {
      toast.success("Boost dihentikan & point dikembalikan");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/redemptions"] });
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/stats"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const editMut = useMutation({
    mutationFn: (data: { id: number; patch: any }) =>
      api.put(`/loyalty/admin/points/redemptions/${data.id}`, data.patch),
    onSuccess: () => {
      toast.success("Redemption diperbarui");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/redemptions"] });
      setEditFor(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal update"),
  });

  const deleteMut = useMutation({
    mutationFn: (data: { id: number; reason?: string }) =>
      api.delete(`/loyalty/admin/points/redemptions/${data.id}`, { reason: data.reason }),
    onSuccess: (resp: any) => {
      toast.success(resp?.refunded ? "Redemption dihapus + poin di-refund" : "Redemption dihapus");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/redemptions"] });
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/stats"] });
      setDeleteFor(null);
      setDeleteReason("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Gagal hapus"),
  });

  const expireMut = useMutation({
    mutationFn: () => api.post("/loyalty/admin/points/redemptions/expire-overdue", {}),
    onSuccess: (r: any) => {
      const expired = r?.expired ?? 0;
      const failed = r?.revertFailed ?? 0;
      if (failed > 0) {
        toast.warning(`${expired} expired, ${failed} gagal revert MikroTik (auto-retry tiap 1 menit)`);
      } else {
        toast.success(`${expired} redemption di-expire & rolled back ke profile asli`);
      }
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/redemptions"] });
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/redemptions/health"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Health: redemption yang gagal revert MikroTik
  const { data: health } = useQuery<{ overdueCount: number; criticalCount: number; items: any[] }>({
    queryKey: ["/api/loyalty/admin/points/redemptions/health"],
    queryFn: () => api.get("/loyalty/admin/points/redemptions/health"),
    refetchInterval: 30_000,
  });

  // Force expire dialog
  const [forceExpireFor, setForceExpireFor] = useState<any | null>(null);
  const [forceExpireReason, setForceExpireReason] = useState("");
  const forceExpireMut = useMutation({
    mutationFn: (data: { id: number; reason: string }) =>
      api.post(`/loyalty/admin/points/redemptions/${data.id}/force-expire`, { reason: data.reason }),
    onSuccess: () => {
      toast.success("Redemption di-force expire. Pastikan profile MikroTik sudah benar.");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/redemptions"] });
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/redemptions/health"] });
      setForceExpireFor(null); setForceExpireReason("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Pengaturan Point dialog
  const [configDialog, setConfigDialog] = useState(false);

  // Backfill loyalty points
  const [backfillDialog, setBackfillDialog] = useState(false);
  const { data: backfillPreview, refetch: refetchPreview } = useQuery<any>({
    queryKey: ["/api/loyalty/admin/points/backfill/preview"],
    queryFn: () => api.get("/loyalty/admin/points/backfill/preview"),
    enabled: backfillDialog,
  });
  const backfillMut = useMutation({
    mutationFn: () => api.post("/loyalty/admin/points/backfill", {}),
    onSuccess: (r: any) => {
      toast.success(`${r?.granted ?? 0} customer dapat ${(r?.totalPointsGranted ?? 0).toLocaleString("id-ID")} pts loyalty`);
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/stats"] });
      setBackfillDialog(false);
      refetchPreview();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {/* Health alert — kalau ada redemption gagal revert MikroTik */}
      {health && health.overdueCount > 0 && (
        <div className={`rounded-lg border p-4 ${
          health.criticalCount > 0
            ? "bg-rose-50/80 dark:bg-rose-950/30 border-rose-300 dark:border-rose-900"
            : "bg-amber-50/70 dark:bg-amber-950/25 border-amber-300 dark:border-amber-900"
        }`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
              health.criticalCount > 0 ? "bg-rose-500" : "bg-amber-500"
            }`}>
              <AlertTriangle className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-bold text-sm ${
                health.criticalCount > 0 ? "text-rose-900 dark:text-rose-200" : "text-amber-900 dark:text-amber-200"
              }`}>
                {health.criticalCount > 0
                  ? `🚨 ${health.criticalCount} redemption CRITICAL — gagal revert MikroTik 5×+`
                  : `⚠️ ${health.overdueCount} redemption gagal auto-revert MikroTik`}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Customer masih dapat boost speed sampai MikroTik bisa di-revert. Worker auto-retry tiap 1 menit.
                Kalau MikroTik sudah di-set manual via WinBox, gunakan tombol <strong>Force Expire</strong> di redemption tersebut.
              </div>
              <div className="mt-3 space-y-1.5">
                {health.items.slice(0, 5).map((it: any) => (
                  <div key={it.id} className="flex items-center gap-2 text-xs flex-wrap">
                    <span className="font-mono text-muted-foreground">#{it.customerBillingId}</span>
                    <span className="font-semibold">{it.customerName}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{it.rewardLabel}</span>
                    <span className={`px-1.5 py-0 rounded text-[10px] font-mono font-bold ${
                      it.revertAttempts >= 5 ? "bg-rose-200 text-rose-900" : "bg-amber-200 text-amber-900"
                    }`}>
                      {it.revertAttempts}× gagal
                    </span>
                    {it.revertError && (
                      <span className="text-muted-foreground italic truncate max-w-[280px]" title={it.revertError}>
                        — {it.revertError}
                      </span>
                    )}
                  </div>
                ))}
                {health.items.length > 5 && (
                  <div className="text-xs text-muted-foreground italic">+ {health.items.length - 5} lagi…</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI bar — telco mature, numbers carry the design */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-y sm:divide-y-0">
          <StatTile
            label="Pending"
            value={stats?.pending ?? 0}
            dot={(stats?.pending ?? 0) > 0 ? "amber" : null}
            active={statusFilter === "pending"}
            onClick={() => setStatusFilter("pending")}
          />
          <StatTile
            label="Aktif"
            value={stats?.active ?? 0}
            dot={(stats?.active ?? 0) > 0 ? "emerald" : null}
            active={statusFilter === "active"}
            onClick={() => setStatusFilter("active")}
          />
          <StatTile
            label="Selesai"
            value={stats?.expired ?? 0}
            active={statusFilter === "expired"}
            onClick={() => setStatusFilter("expired")}
          />
          <StatTile
            label="Ditolak"
            value={stats?.rejected ?? 0}
            dot={(stats?.rejected ?? 0) > 0 ? "rose" : null}
            active={statusFilter === "rejected"}
            onClick={() => setStatusFilter("rejected")}
          />
          <StatTile
            label="Pts Bulan Ini"
            value={stats?.pointsThisMonth ?? 0}
            sublabel="redeemed"
          />
        </div>
      </div>

      {/* Action bar — segmented filter + proper toolbar buttons */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 p-1 bg-muted/60 rounded-lg w-fit overflow-x-auto">
          {(["pending", "active", "expired", "rejected", "cancelled", "all"] as const).map((s) => {
            const dot = s === "pending" && (stats?.pending ?? 0) > 0 ? "bg-amber-500"
              : s === "active" && (stats?.active ?? 0) > 0 ? "bg-emerald-500"
              : s === "rejected" && (stats?.rejected ?? 0) > 0 ? "bg-rose-500"
              : null;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                  statusFilter === s
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
                {s === "all" ? "Semua" : s === "pending" ? "Pending" : s === "active" ? "Aktif" : s === "expired" ? "Selesai" : s === "rejected" ? "Ditolak" : "Dibatal"}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              checked={!!showDeleted}
              onCheckedChange={onShowDeletedChange}
              id="show-deleted-redemptions"
            />
            <label
              htmlFor="show-deleted-redemptions"
              className="text-xs text-muted-foreground cursor-pointer select-none"
            >
              Tampilkan terhapus
            </label>
          </div>
          {canEdit && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setConfigDialog(true)} className="gap-1.5 h-8">
                <Settings className="h-3.5 w-3.5" /> Pengaturan
              </Button>
              <Button size="sm" variant="outline" onClick={() => setBackfillDialog(true)} className="gap-1.5 h-8">
                <Sparkles className="h-3.5 w-3.5" /> Backfill
              </Button>
              <Button size="sm" variant="outline" onClick={() => expireMut.mutate()} disabled={expireMut.isPending} className="gap-1.5 h-8">
                {expireMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Expire Overdue
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Config dialog */}
      {configDialog && (
        <PointConfigDialog onClose={() => setConfigDialog(false)} />
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : redemptions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Zap className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
            <div className="font-semibold text-sm">Tidak ada redemption {statusFilter !== "all" ? statusFilter : ""}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Customer akan request boost dari portal pelanggan setelah cukup point
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="divide-y">
            {redemptions.map((r: any) => {
              const statusMap: Record<string, { label: string; dotColor: string; textColor: string }> = {
                pending:   { label: "Menunggu",   dotColor: "bg-amber-500",   textColor: "text-amber-700 dark:text-amber-300" },
                active:    { label: "Aktif",      dotColor: "bg-emerald-500", textColor: "text-emerald-700 dark:text-emerald-300" },
                expired:   { label: "Selesai",    dotColor: "bg-zinc-400",    textColor: "text-zinc-600 dark:text-zinc-400" },
                rejected:  { label: "Ditolak",    dotColor: "bg-rose-500",    textColor: "text-rose-700 dark:text-rose-300" },
                cancelled: { label: "Dibatalkan", dotColor: "bg-zinc-400",    textColor: "text-zinc-600 dark:text-zinc-400" },
              };
              const status = statusMap[r.status] ?? statusMap.expired;
              // Live countdown
              let activeRemaining: string | null = null;
              let almostExpired = false;
              if (r.status === "active" && r.endAt) {
                const msLeft = new Date(r.endAt).getTime() - Date.now();
                if (msLeft > 0) {
                  const totalSec = Math.floor(msLeft / 1000);
                  const h = Math.floor(totalSec / 3600);
                  const m = Math.floor((totalSec % 3600) / 60);
                  activeRemaining = h > 0 ? `${h}h ${m}m` : `${m}m`;
                  almostExpired = msLeft < 3600_000;
                } else {
                  activeRemaining = "overdue";
                  almostExpired = true;
                }
              }
              const isActive = r.status === "active";
              const isDeleted = !!r.deletedAt;
              return (
                <div
                  key={r.id}
                  className={`relative px-5 py-4 flex items-start gap-4 transition-colors ${
                    isDeleted
                      ? "opacity-50 line-through"
                      : almostExpired
                      ? "bg-gradient-to-r from-amber-50/70 to-transparent dark:from-amber-950/20"
                      : isActive
                      ? "bg-gradient-to-r from-emerald-50/40 to-transparent dark:from-emerald-950/10 hover:from-emerald-50/60"
                      : "hover:bg-muted/30"
                  }`}
                >
                  {/* Left accent strip */}
                  {(almostExpired || isActive) && (
                    <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${almostExpired ? "bg-amber-500" : "bg-emerald-500"}`} />
                  )}

                  {/* Status indicator column */}
                  <div className="pt-1 shrink-0 w-24">
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-card border">
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dotColor} shrink-0 ${isActive ? "animate-pulse" : ""}`} />
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${status.textColor}`}>{status.label}</span>
                    </div>
                    {isDeleted && (
                      <div className="no-underline mt-1 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-destructive/15 text-destructive">
                        Dihapus
                      </div>
                    )}
                    {activeRemaining && (
                      <div className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                        almostExpired
                          ? "bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold"
                          : "bg-muted text-foreground"
                      }`}>
                        <Clock className="h-2.5 w-2.5" /> {activeRemaining}
                      </div>
                    )}
                  </div>

                  {/* Customer + reward */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">{r.customerName}</span>
                      <span className="text-[11px] font-mono text-muted-foreground">#{r.customerBillingId}</span>
                      {r.customerPackage && (
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0">
                          {r.customerPackage}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                      <Zap className={`h-3.5 w-3.5 ${r.speedMultiplier >= 3 ? "text-violet-600" : "text-sky-600"}`} strokeWidth={2} />
                      <span className="font-medium text-sm text-foreground">{r.rewardLabel}</span>
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/30 text-[10px] font-mono font-semibold text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/60">
                        −{r.pointsCost.toLocaleString("id-ID")} pts
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1" title="Dibuat">
                        <Calendar className="h-3 w-3" /> {fmtDate(r.createdAt)}
                      </span>
                      {r.startAt && (
                        <span className="inline-flex items-center gap-1" title="Diaktivasi">
                          <ArrowRight className="h-3 w-3" /> aktif {fmtDate(r.startAt)}
                        </span>
                      )}
                      {r.endAt && (
                        <span className="inline-flex items-center gap-1 text-foreground/70" title="Berakhir">
                          <Clock className="h-3 w-3" /> {fmtDate(r.endAt)}
                        </span>
                      )}
                      {r.verifiedBy && (
                        <span className="inline-flex items-center gap-1" title="Diverifikasi oleh admin">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> admin #{r.verifiedBy}
                        </span>
                      )}
                      {r.customerPhone && (
                        <a href={`tel:${r.customerPhone}`} className="inline-flex items-center gap-1 text-primary hover:underline tabular-nums">
                          <Phone className="h-3 w-3" /> {r.customerPhone}
                        </a>
                      )}
                    </div>
                    {(r.rejectionReason || r.notes) && (
                      <div className="mt-2 inline-flex items-start gap-2 text-[11px] px-2.5 py-1.5 rounded-md bg-muted/40 border max-w-full">
                        {r.rejectionReason ? (
                          <>
                            <XCircle className="h-3 w-3 text-rose-500 mt-0.5 shrink-0" />
                            <span className="text-rose-700 dark:text-rose-400"><strong>Ditolak:</strong> {r.rejectionReason}</span>
                          </>
                        ) : (
                          <>
                            <Info className="h-3 w-3 text-sky-500 mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">{r.notes}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {canEdit && (
                    <div className="flex gap-1.5 shrink-0 pt-0.5 items-center">
                      {r.status === "pending" && (
                        <>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            title="Edit"
                            onClick={() => {
                              setEditFor(r);
                              setEditForm({
                                speedMultiplier: r.speedMultiplier ?? 2,
                                durationHours: r.durationHours ?? 6,
                                pointsCost: r.pointsCost ?? 0,
                                notes: r.notes ?? "",
                              });
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setRejectFor(r); setRejectReason(""); }}
                            className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-200/60 dark:border-rose-900/60"
                          >
                            Tolak
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => { setVerifyFor(r); setVerifyNotes(""); }}
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Verify
                          </Button>
                        </>
                      )}
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        disabled={r.status === "active"}
                        title={r.status === "active" ? "Boost masih jalan — cancel dulu" : "Hapus"}
                        onClick={() => { setDeleteFor(r); setDeleteReason(""); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                      {r.status === "active" && (
                        <>
                          {/* Force Expire — hanya muncul kalau revertAttempts > 0 (artinya overdue + gagal revert) */}
                          {(r.revertAttempts ?? 0) > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setForceExpireFor(r); setForceExpireReason(""); }}
                              className="h-8 text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border-amber-300 dark:border-amber-900"
                              title={`Auto-revert gagal ${r.revertAttempts}× — force expire setelah benerin profile manual`}
                            >
                              <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Force Expire
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { if (confirm(`Hentikan boost ${r.rewardLabel} untuk ${r.customerName}? Point akan dikembalikan + profile MikroTik di-revert ke ${r.originalPppProfile ?? "asli"}.`)) cancelMut.mutate(r.id); }}
                            className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-200/60 dark:border-rose-900/60"
                          >
                            Hentikan
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Verify dialog */}
      <Dialog open={!!verifyFor} onOpenChange={(o) => !o && setVerifyFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verify & Aktivasi Boost</DialogTitle>
            <DialogDescription asChild>
              <div className="text-xs pt-1 space-y-1">
                <div>{verifyFor?.customerName} — <span className="font-mono">#{verifyFor?.customerBillingId}</span></div>
                <div className="font-semibold text-foreground">{verifyFor?.rewardLabel} · {verifyFor?.durationHours}h durasi</div>
                <div>Setelah verify, boost akan aktif {verifyFor?.durationHours} jam dari sekarang.</div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-2.5 rounded-md bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 text-xs">
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">✓ Auto-MikroTik aktif</p>
              <p className="text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                Saat verify, sistem otomatis: (1) ganti PPP profile customer ke <strong>boost {verifyFor?.speedMultiplier}×</strong>,
                (2) disconnect session paksa supaya profile baru efektif segera, (3) auto-revert ke profile asli
                {verifyFor?.durationHours} jam kemudian. Kalau MikroTik offline saat verify, kamu akan lihat warning + bisa retry manual.
              </p>
            </div>
            <div>
              <Label className="text-xs">Catatan (opsional)</Label>
              <Input
                value={verifyNotes}
                onChange={(e) => setVerifyNotes(e.target.value)}
                placeholder="catatan internal admin"
                className="text-sm mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setVerifyFor(null)}>Batal</Button>
              <Button
                onClick={() => verifyMut.mutate({ id: verifyFor.id, notes: verifyNotes.trim() || undefined })}
                disabled={verifyMut.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {verifyMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Aktivasi Boost
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Force Expire dialog — admin override saat MikroTik tidak bisa di-revert otomatis */}
      <Dialog open={!!forceExpireFor} onOpenChange={(o) => !o && setForceExpireFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" /> Force Expire Redemption
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-xs pt-1 space-y-1">
                <div>{forceExpireFor?.customerName} — <span className="font-mono">#{forceExpireFor?.customerBillingId}</span></div>
                <div className="font-semibold text-foreground">{forceExpireFor?.rewardLabel}</div>
                {(forceExpireFor?.revertAttempts ?? 0) > 0 && (
                  <div className="text-rose-600 dark:text-rose-400">
                    Auto-revert sudah gagal {forceExpireFor?.revertAttempts}× — error terakhir: <em>{forceExpireFor?.revertError}</em>
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-900 text-xs">
              <p className="font-bold text-amber-900 dark:text-amber-200">⚠️ Force expire = bypass revert MikroTik</p>
              <p className="text-amber-800/90 dark:text-amber-300/90 mt-1">
                Hanya gunakan kalau kamu <strong>sudah set profile manual lewat WinBox</strong> ke <code className="font-mono bg-amber-200/60 dark:bg-amber-900/60 px-1 rounded">{forceExpireFor?.originalPppProfile ?? "profile asli"}</code>.
                Tindakan ini akan di-log di audit trail dengan alasan kamu.
              </p>
            </div>
            <div>
              <Label className="text-xs">Alasan (wajib — audit trail)</Label>
              <Input
                value={forceExpireReason}
                onChange={(e) => setForceExpireReason(e.target.value)}
                placeholder="Sudah set profile manual via WinBox / MikroTik replaced / dst"
                className="text-sm mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setForceExpireFor(null)}>Batal</Button>
              <Button
                onClick={() => {
                  if (!forceExpireReason.trim()) {
                    toast.error("Alasan wajib diisi untuk audit trail");
                    return;
                  }
                  forceExpireMut.mutate({ id: forceExpireFor.id, reason: forceExpireReason.trim() });
                }}
                disabled={forceExpireMut.isPending || !forceExpireReason.trim()}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {forceExpireMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Force Expire
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Backfill loyalty points dialog */}
      <Dialog open={backfillDialog} onOpenChange={setBackfillDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" /> Backfill Loyalty Points
            </DialogTitle>
            <DialogDescription>
              Berikan point loyalty awal ke customer existing berdasarkan tenure (kapan bergabung — auto parse dari customer ID format <code className="font-mono text-[10px] bg-muted px-1 rounded">MMYYNNNNN</code>).
              Idempotent — customer yang sudah pernah di-backfill akan di-skip.
            </DialogDescription>
          </DialogHeader>
          {backfillPreview ? (
            <div className="space-y-3">
              {/* Tier formula */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(backfillPreview.byTier ?? {}).map(([tier, info]: any) => (
                  <div key={tier} className="rounded-md border p-2.5 bg-muted/30">
                    <div className="font-semibold text-[11px] truncate">{tier}</div>
                    <div className="flex items-baseline gap-1.5 mt-1">
                      <span className="text-lg font-bold tabular-nums text-emerald-600">{info.count}</span>
                      <span className="text-[10px] text-muted-foreground">customer</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/60 p-2.5">
                  <div className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-300">Akan Dapat</div>
                  <div className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300 mt-0.5">{(backfillPreview.eligibleCount ?? 0).toLocaleString("id-ID")}</div>
                  <div className="text-[10px] text-muted-foreground">customer</div>
                </div>
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/60 p-2.5">
                  <div className="text-[10px] uppercase font-bold text-amber-700 dark:text-amber-300">Total Pts</div>
                  <div className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-300 mt-0.5">{(backfillPreview.totalPointsToGrant ?? 0).toLocaleString("id-ID")}</div>
                  <div className="text-[10px] text-muted-foreground">akan dikeluarkan</div>
                </div>
                <div className="rounded-md bg-slate-50 dark:bg-slate-900 border p-2.5">
                  <div className="text-[10px] uppercase font-bold text-slate-700 dark:text-slate-300">Sudah Dapat</div>
                  <div className="text-xl font-bold tabular-nums text-slate-700 dark:text-slate-300 mt-0.5">{(backfillPreview.alreadyGrantedCount ?? 0).toLocaleString("id-ID")}</div>
                  <div className="text-[10px] text-muted-foreground">customer (skip)</div>
                </div>
              </div>

              {/* Sample preview */}
              {backfillPreview.samples?.length > 0 && (
                <div>
                  <Label className="text-xs font-semibold">Sample 10 customer:</Label>
                  <div className="mt-1.5 max-h-48 overflow-y-auto border rounded-md">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 text-left">
                        <tr>
                          <th className="px-2 py-1.5 font-semibold">Customer</th>
                          <th className="px-2 py-1.5 font-semibold text-right">Tenure</th>
                          <th className="px-2 py-1.5 font-semibold text-right">Pts</th>
                          <th className="px-2 py-1.5 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {backfillPreview.samples.map((s: any) => (
                          <tr key={s.customerId} className="border-t">
                            <td className="px-2 py-1.5">
                              <div className="font-medium truncate max-w-[180px]">{s.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">#{s.customerId}</div>
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{s.tenureMonths}m</td>
                            <td className="px-2 py-1.5 text-right tabular-nums font-bold text-emerald-600">+{s.points.toLocaleString("id-ID")}</td>
                            <td className="px-2 py-1.5 text-[10px]">
                              {s.alreadyGranted ? <span className="text-muted-foreground">sudah</span> : <span className="text-emerald-600 font-semibold">eligible</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Formula */}
              <div className="rounded-md border bg-sky-50/50 dark:bg-sky-950/20 p-3 text-[11px] space-y-1">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-sky-500" /> Formula Loyalty Tier
                </p>
                <ul className="space-y-0.5 ml-4 list-disc text-muted-foreground">
                  <li>&lt; 6 bulan → 0 pts (cuma earn dari bayar tepat waktu)</li>
                  <li>6 - 11 bulan → <strong className="text-foreground">250 pts</strong> apresiasi awal</li>
                  <li>12 - 23 bulan → <strong className="text-foreground">1.000 pts</strong></li>
                  <li>24 - 35 bulan → <strong className="text-foreground">2.500 pts</strong></li>
                  <li>36 - 59 bulan → <strong className="text-foreground">5.000 pts</strong></li>
                  <li>60+ bulan → <strong className="text-foreground">10.000 pts</strong> premium loyalist 5+ tahun</li>
                </ul>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setBackfillDialog(false)}>Batal</Button>
                <Button
                  onClick={() => backfillMut.mutate()}
                  disabled={backfillMut.isPending || (backfillPreview.eligibleCount ?? 0) === 0}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 text-white border-0 hover:opacity-90"
                >
                  {backfillMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Apply Backfill ({(backfillPreview.eligibleCount ?? 0).toLocaleString("id-ID")} customer)
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit redemption dialog */}
      <Dialog open={!!editFor} onOpenChange={(o) => !o && setEditFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Redemption</DialogTitle>
            <DialogDescription>Hanya status &lsquo;pending&rsquo; yang bisa di-edit.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Speed multiplier (x)</Label>
              <Input
                type="number"
                className="mt-1"
                value={editForm.speedMultiplier}
                onChange={(e) => setEditForm(f => ({ ...f, speedMultiplier: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label className="text-xs">Durasi (jam)</Label>
              <Input
                type="number"
                className="mt-1"
                value={editForm.durationHours}
                onChange={(e) => setEditForm(f => ({ ...f, durationHours: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label className="text-xs">Biaya poin</Label>
              <Input
                type="number"
                className="mt-1"
                value={editForm.pointsCost}
                onChange={(e) => setEditForm(f => ({ ...f, pointsCost: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label className="text-xs">Catatan</Label>
              <Textarea
                className="mt-1"
                value={editForm.notes}
                onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditFor(null)}>Batal</Button>
              <Button
                className="flex-1"
                loading={editMut.isPending}
                onClick={() => editMut.mutate({ id: editFor.id, patch: editForm })}
              >
                Simpan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete redemption confirm */}
      <AlertDialog open={!!deleteFor} onOpenChange={(o) => !o && setDeleteFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Redemption?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 pt-1">
                <div>
                  {deleteFor?.status === "pending"
                    ? "Status 'pending' — poin akan otomatis di-refund saat hapus."
                    : "Row akan disembunyikan dari list (soft delete)."}
                </div>
                <Textarea
                  placeholder="Alasan hapus (opsional)"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  className="text-sm mt-2"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteMut.mutate({ id: deleteFor.id, reason: deleteReason.trim() || undefined })}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectFor} onOpenChange={(o) => !o && setRejectFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak Redemption</DialogTitle>
            <DialogDescription asChild>
              <div className="text-xs pt-1">
                {rejectFor?.customerName} — {rejectFor?.rewardLabel}.
                Point ({rejectFor?.pointsCost}) akan dikembalikan ke saldo customer.
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Alasan Tolak *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Customer terdeteksi fraud / package tidak support / dll"
                rows={2}
                className="mt-1 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setRejectFor(null)}>Batal</Button>
              <Button
                variant="destructive"
                onClick={() => rejectMut.mutate({ id: rejectFor.id, reason: rejectReason.trim() || "rejected" })}
                disabled={rejectMut.isPending || !rejectReason.trim()}
              >
                {rejectMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Tolak & Refund
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * StatTile — telco mature design: numbers carry the design.
 * Flat surface, monochrome, status via small dot, single accent on hover/active.
 */
function StatTile({
  label, value, sublabel, dot, active, onClick,
}: {
  label: string;
  value: number;
  sublabel?: string;
  dot?: "amber" | "emerald" | "rose" | null;
  active?: boolean;
  onClick?: () => void;
}) {
  const dotColor = dot === "amber" ? "bg-amber-500"
    : dot === "emerald" ? "bg-emerald-500"
    : dot === "rose" ? "bg-rose-500"
    : "";
  const interactive = !!onClick;
  const cls = `relative px-4 py-3 text-left transition-colors ${
    interactive ? "cursor-pointer hover:bg-muted/40" : ""
  } ${active ? "bg-muted/60" : ""}`;
  const Inner = (
    <>
      {active && <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-primary rounded-r" />}
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />}
        <span>{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tabular-nums tracking-tight leading-none text-foreground">
          {Number(value).toLocaleString("id-ID")}
        </span>
        {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
      </div>
    </>
  );
  if (interactive) {
    return <button onClick={onClick} type="button" className={cls}>{Inner}</button>;
  }
  return <div className={cls}>{Inner}</div>;
}

// ═══════════════════════════════════════════════════════════════
// POINT CONFIG DIALOG — admin customize earn rules + catalog
// ═══════════════════════════════════════════════════════════════
type RewardItem = {
  key: string;
  label: string;
  description: string;
  pointsCost: number;
  speedMultiplier: number;
  durationHours: number;
  emoji: string;
};

const EMOJI_PRESETS = ["⚡", "🚀", "💎", "👑", "🔥", "⭐", "🎯", "💰", "🎁", "🏆", "✨", "💫"];

function PointConfigDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"earn" | "catalog" | "mikrotik">("earn");

  const { data: config, isLoading } = useQuery<any>({
    queryKey: ["/api/loyalty/admin/points/config"],
    queryFn: () => api.get("/loyalty/admin/points/config"),
  });

  // Earn rules state
  const [earnOnTime, setEarnOnTime] = useState(100);
  const [earnEarly, setEarnEarly] = useState(50);
  const [earnEarlyDays, setEarnEarlyDays] = useState(3);
  // Catalog state
  const [catalog, setCatalog] = useState<RewardItem[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draftReward, setDraftReward] = useState<RewardItem | null>(null);
  // Initial sync from server
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!config || hydrated) return;
    setEarnOnTime(config.earnOnTimePts ?? 100);
    setEarnEarly(config.earnEarlyBonusPts ?? 50);
    setEarnEarlyDays(config.earnEarlyDaysThreshold ?? 3);
    if (Array.isArray(config.catalog) && config.catalog.length > 0) {
      setCatalog(config.catalog);
    } else {
      // Default catalog kalau belum ada di settings
      setCatalog([
        { key: "boost_2x_6h",  label: "Speed 2× — 6 jam",   description: "Pakai untuk meeting, download kerjaan, atau streaming sebentar.", pointsCost: 50,  speedMultiplier: 2, durationHours: 6,  emoji: "⚡" },
        { key: "boost_2x_24h", label: "Speed 2× — 24 jam",  description: "Cocok untuk weekend gaming atau movie marathon.",                pointsCost: 150, speedMultiplier: 2, durationHours: 24, emoji: "🚀" },
        { key: "boost_3x_6h",  label: "Speed 3× — 6 jam",   description: "Boost maksimal singkat, untuk download besar urgent.",            pointsCost: 250, speedMultiplier: 3, durationHours: 6,  emoji: "💎" },
        { key: "boost_3x_24h", label: "Speed 3× — 24 jam",  description: "Boost maksimal seharian.",                                         pointsCost: 600, speedMultiplier: 3, durationHours: 24, emoji: "👑" },
      ]);
    }
    setHydrated(true);
  }, [config, hydrated]);

  const saveMut = useMutation({
    mutationFn: () => api.put("/loyalty/admin/points/config", {
      earnOnTimePts: earnOnTime,
      earnEarlyBonusPts: earnEarly,
      earnEarlyDaysThreshold: earnEarlyDays,
      catalog,
    }),
    onSuccess: () => {
      toast.success("Pengaturan point tersimpan");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/points/config"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSaveDraft = () => {
    if (!draftReward) return;
    if (!draftReward.key.trim() || !draftReward.label.trim()) {
      toast.error("Key + Label wajib");
      return;
    }
    if (!/^[a-z0-9_]+$/.test(draftReward.key)) {
      toast.error("Key cuma huruf kecil + angka + underscore");
      return;
    }
    // Cek duplicate key (kecuali kalau edit row yg sama)
    const dupIdx = catalog.findIndex(r => r.key === draftReward.key);
    if (dupIdx !== -1 && dupIdx !== editingIdx) {
      toast.error(`Key "${draftReward.key}" sudah dipakai`);
      return;
    }
    if (editingIdx === -1) {
      // Add new
      setCatalog([...catalog, draftReward]);
    } else if (editingIdx != null) {
      // Edit existing
      const next = [...catalog];
      next[editingIdx] = draftReward;
      setCatalog(next);
    }
    setEditingIdx(null);
    setDraftReward(null);
  };

  const handleDelete = (idx: number) => {
    if (!confirm(`Hapus reward "${catalog[idx].label}"?`)) return;
    setCatalog(catalog.filter((_, i) => i !== idx));
  };

  const totalConfigured = catalog.length;
  const totalPotentialMonthlyEarn = earnOnTime + earnEarly;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Settings className="h-4 w-4 text-foreground" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold tracking-tight">
                Pengaturan Loyalty Point
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Customize earn rules dan reward catalog. Perubahan berlaku langsung setelah disimpan.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading || !hydrated ? (
          <div className="p-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>
        ) : (
          <>
            {/* Tab nav — clean underline style */}
            <div className="px-6 border-b">
              <div className="flex gap-6">
                {([
                  { key: "earn", label: "Earn Rules", count: totalPotentialMonthlyEarn, suffix: "pts/bulan max" },
                  { key: "catalog", label: "Catalog Reward", count: totalConfigured, suffix: "reward" },
                  { key: "mikrotik", label: "MikroTik Auto-Boost", count: 0, suffix: "" },
                ] as const).map(({ key, label, count, suffix }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`relative py-3 text-sm transition-colors ${
                      activeTab === key
                        ? "text-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground font-medium"
                    }`}
                  >
                    <div className="flex items-baseline gap-2">
                      <span>{label}</span>
                      {suffix && (
                        <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                          {count.toLocaleString("id-ID")} {suffix}
                        </span>
                      )}
                    </div>
                    {activeTab === key && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* ───────── EARN RULES — clean form ───────── */}
              {activeTab === "earn" && (
                <div className="space-y-6">
                  {/* Section header */}
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Aturan Pemberian Point</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Auto-jalan saat billing sync detect payment. Idempotent per pembayaran.
                    </p>
                  </div>

                  {/* Form rows — flat, label-led */}
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-6 pb-5 border-b">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">Bayar tepat waktu</div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          Point yang diberikan saat customer bayar sebelum atau pada tanggal jatuh tempo.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Input
                          type="number"
                          min={0}
                          max={10000}
                          value={earnOnTime}
                          onChange={(e) => setEarnOnTime(Math.max(0, Number(e.target.value) || 0))}
                          className="text-base font-semibold tabular-nums w-24 text-right"
                        />
                        <span className="text-xs text-muted-foreground font-medium w-8">pts</span>
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-6 pb-5 border-b">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">Bonus bayar early</div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          Bonus tambahan jika customer bayar minimal <strong className="text-foreground">{earnEarlyDays}</strong> hari sebelum jatuh tempo.
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Input
                          type="number"
                          min={0}
                          max={10000}
                          value={earnEarly}
                          onChange={(e) => setEarnEarly(Math.max(0, Number(e.target.value) || 0))}
                          className="text-base font-semibold tabular-nums w-24 text-right"
                        />
                        <span className="text-xs text-muted-foreground font-medium w-8">pts</span>
                      </div>
                    </div>

                    <div className="flex items-start justify-between gap-6">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">Threshold hari early</div>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          Berapa hari minimum sebelum jatuh tempo untuk dianggap "early payment".
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Input
                          type="number"
                          min={1}
                          max={28}
                          value={earnEarlyDays}
                          onChange={(e) => setEarnEarlyDays(Math.max(1, Number(e.target.value) || 1))}
                          className="text-base font-semibold tabular-nums w-24 text-right"
                        />
                        <span className="text-xs text-muted-foreground font-medium w-8">hari</span>
                      </div>
                    </div>
                  </div>

                  {/* Outcome panel */}
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Maksimum earn per pelanggan</div>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-2xl font-bold tabular-nums tracking-tight">{totalPotentialMonthlyEarn.toLocaleString("id-ID")}</span>
                          <span className="text-xs text-muted-foreground">pts/bulan</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Per tahun</div>
                        <div className="mt-1 text-base font-semibold tabular-nums">
                          {(totalPotentialMonthlyEarn * 12).toLocaleString("id-ID")} pts
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ───────── CATALOG — table-style list ───────── */}
              {activeTab === "catalog" && (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold tracking-tight">Catalog Reward</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Reward yang bisa di-redeem customer. Edit untuk event/promo, perubahan langsung berlaku.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setEditingIdx(-1);
                        setDraftReward({ key: "", label: "", description: "", pointsCost: 100, speedMultiplier: 2, durationHours: 6, emoji: "⚡" });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border bg-card hover:bg-muted/40 shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={1.75} /> Tambah reward
                    </button>
                  </div>

                  {catalog.length === 0 ? (
                    <div className="rounded-lg border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
                      Belum ada reward. Klik "Tambah reward" untuk mulai.
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-card overflow-hidden">
                      <div className="divide-y">
                        {catalog.map((r, idx) => (
                          <div
                            key={r.key + idx}
                            className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                              editingIdx === idx ? "bg-primary/5" : "hover:bg-muted/30"
                            }`}
                          >
                            <div className="w-8 text-center text-base shrink-0 select-none">{r.emoji}</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-2">
                                <span className="font-medium text-sm text-foreground">{r.label}</span>
                                <span className="text-[10px] font-mono text-muted-foreground">{r.key}</span>
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{r.description}</div>
                            </div>
                            <div className="hidden sm:flex items-center gap-5 shrink-0 text-[11px]">
                              <div className="text-right">
                                <div className="font-semibold tabular-nums">{r.pointsCost.toLocaleString("id-ID")}</div>
                                <div className="text-muted-foreground">pts cost</div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold tabular-nums">{r.speedMultiplier}×</div>
                                <div className="text-muted-foreground">speed</div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold tabular-nums">{r.durationHours}h</div>
                                <div className="text-muted-foreground">durasi</div>
                              </div>
                            </div>
                            <div className="flex gap-0.5 shrink-0">
                              <button
                                onClick={() => { setEditingIdx(idx); setDraftReward({ ...r }); }}
                                className="w-7 h-7 rounded-md hover:bg-muted/60 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                              </button>
                              <button
                                onClick={() => handleDelete(idx)}
                                className="w-7 h-7 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 inline-flex items-center justify-center text-muted-foreground hover:text-rose-600"
                                title="Hapus"
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Draft reward editor */}
                  {draftReward && (
                    <Card className="border-2 border-primary bg-primary/5">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-sm flex items-center gap-1.5">
                            <Pencil className="h-3.5 w-3.5" />
                            {editingIdx === -1 ? "Reward Baru" : `Edit: ${catalog[editingIdx!]?.label}`}
                          </h4>
                          <button onClick={() => { setDraftReward(null); setEditingIdx(null); }} className="text-muted-foreground hover:text-foreground">
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Key (unique, lowercase + underscore)</Label>
                            <Input
                              value={draftReward.key}
                              onChange={(e) => setDraftReward({ ...draftReward, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                              placeholder="boost_5x_1h"
                              className="font-mono text-sm mt-1"
                              disabled={editingIdx !== -1}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Emoji</Label>
                            <div className="flex items-center gap-1 mt-1">
                              <Input
                                value={draftReward.emoji}
                                onChange={(e) => setDraftReward({ ...draftReward, emoji: e.target.value })}
                                placeholder="⚡"
                                className="text-2xl text-center w-16 shrink-0"
                                maxLength={4}
                              />
                              <div className="flex flex-wrap gap-1">
                                {EMOJI_PRESETS.map(e => (
                                  <button
                                    key={e}
                                    type="button"
                                    onClick={() => setDraftReward({ ...draftReward, emoji: e })}
                                    className="w-7 h-7 rounded hover:bg-muted text-lg"
                                  >
                                    {e}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs">Label (judul reward)</Label>
                          <Input
                            value={draftReward.label}
                            onChange={(e) => setDraftReward({ ...draftReward, label: e.target.value })}
                            placeholder="Speed 5× — 1 jam Promo Spesial"
                            className="mt-1"
                          />
                        </div>

                        <div>
                          <Label className="text-xs">Deskripsi (tampil di portal pelanggan)</Label>
                          <Textarea
                            value={draftReward.description}
                            onChange={(e) => setDraftReward({ ...draftReward, description: e.target.value })}
                            placeholder="Boost extra spesial untuk event Lebaran 2026"
                            rows={2}
                            className="mt-1 text-sm"
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs">Cost (pts)</Label>
                            <Input
                              type="number"
                              min={1}
                              value={draftReward.pointsCost}
                              onChange={(e) => setDraftReward({ ...draftReward, pointsCost: Math.max(1, Number(e.target.value) || 1) })}
                              className="font-mono mt-1"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Multiplier</Label>
                            <select
                              value={draftReward.speedMultiplier}
                              onChange={(e) => setDraftReward({ ...draftReward, speedMultiplier: Number(e.target.value) })}
                              className="w-full border rounded-md h-9 px-2 text-sm bg-background mt-1"
                            >
                              {[2, 3, 4, 5, 10].map(m => <option key={m} value={m}>{m}× speed</option>)}
                            </select>
                          </div>
                          <div>
                            <Label className="text-xs">Durasi (jam)</Label>
                            <Input
                              type="number"
                              min={1}
                              max={720}
                              value={draftReward.durationHours}
                              onChange={(e) => setDraftReward({ ...draftReward, durationHours: Math.max(1, Number(e.target.value) || 1) })}
                              className="font-mono mt-1"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t">
                          <Button variant="outline" size="sm" onClick={() => { setDraftReward(null); setEditingIdx(null); }}>Batal</Button>
                          <Button size="sm" onClick={handleSaveDraft}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Apply ke Catalog
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Tips — quiet, monochrome */}
                  <div className="text-[11px] text-muted-foreground leading-relaxed border-l-2 border-muted pl-3 ml-1">
                    <strong className="text-foreground/80">Tips:</strong>{" "}
                    Untuk event (Lebaran, 17an), turunin pointsCost atau tambah reward khusus.
                    Durasi 1-3 jam cocok untuk reward kecil yang gampang dijangkau.
                    Aktifkan MikroTik Auto-Boost di tab sebelah supaya redeem otomatis ganti profile.
                  </div>
                </div>
              )}

              {/* ───────── MIKROTIK AUTO-BOOST ───────── */}
              {activeTab === "mikrotik" && <MikrotikBoostConfigPanel />}
            </div>

            {/* Footer save — quiet, no gradient */}
            <div className="px-6 py-4 border-t flex justify-between items-center">
              <div className="text-xs text-muted-foreground">
                {draftReward ? (
                  <span className="text-amber-700 dark:text-amber-400">Ada perubahan reward yang belum di-apply</span>
                ) : (
                  <>{totalConfigured} reward · {totalPotentialMonthlyEarn} pts/bulan max</>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>Tutup</Button>
                <Button
                  size="sm"
                  onClick={() => saveMut.mutate()}
                  disabled={saveMut.isPending || !!draftReward}
                >
                  {saveMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                  Simpan
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// MIKROTIK AUTO-BOOST CONFIG — toggle + profile pattern + test
// ═══════════════════════════════════════════════════════════════
function MikrotikBoostConfigPanel() {
  const qc = useQueryClient();
  const { data: config, isLoading } = useQuery<any>({
    queryKey: ["/api/loyalty/admin/mikrotik-boost/config"],
    queryFn: () => api.get("/loyalty/admin/mikrotik-boost/config"),
  });

  const [autoEnabled, setAutoEnabled] = useState(true);
  const [pattern, setPattern] = useState("{base}-boost-{multiplier}x");
  const [profileMapText, setProfileMapText] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (config && !hydrated) {
      setAutoEnabled(config.autoEnabled ?? true);
      setPattern(config.pattern ?? "{base}-boost-{multiplier}x");
      if (config.profileMap) {
        try { setProfileMapText(JSON.stringify(config.profileMap, null, 2)); } catch { /* ignore */ }
      }
      setHydrated(true);
    }
  }, [config, hydrated]);

  const saveMut = useMutation({
    mutationFn: () => {
      const body: any = {
        autoEnabled,
        pattern: pattern.trim(),
      };
      const trimmed = profileMapText.trim();
      if (trimmed) {
        try {
          body.profileMap = JSON.parse(trimmed);
        } catch {
          throw new Error("Profile map JSON tidak valid");
        }
      } else {
        body.profileMap = "";
      }
      return api.put("/loyalty/admin/mikrotik-boost/config", body);
    },
    onSuccess: () => {
      toast.success("Konfigurasi MikroTik tersimpan");
      qc.invalidateQueries({ queryKey: ["/api/loyalty/admin/mikrotik-boost/config"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Test apply boost
  const [testCustomerId, setTestCustomerId] = useState("");
  const [testMultiplier, setTestMultiplier] = useState(2);
  const testMut = useMutation({
    mutationFn: () => api.post("/loyalty/admin/mikrotik-boost/test", { customerId: Number(testCustomerId), multiplier: testMultiplier }),
    onSuccess: (r: any) => {
      if (r.success) {
        toast.success(`Test sukses: ${r.boostedProfile} di router ${r.routerName}. Auto-revert dalam 5 detik.`, { duration: 7000 });
      } else {
        toast.error(`Test gagal: ${r.error}`, { duration: 7000 });
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !hydrated) {
    return <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">MikroTik Auto-Boost</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Saat customer redeem boost, sistem otomatis ganti PPP profile di router → customer langsung dapat speed baru tanpa perlu admin verify manual.
        </p>
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-lg border">
        <div className="min-w-0">
          <div className="text-sm font-medium">Auto-aktivasi via MikroTik</div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            ON: redeem langsung active (sistem update PPP profile + disconnect session). OFF: redeem masuk antrian pending — admin verify manual.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAutoEnabled(!autoEnabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            autoEnabled ? "bg-primary" : "bg-muted-foreground/30"
          }`}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${autoEnabled ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {/* Pattern */}
      <div className="pb-5 border-b">
        <Label className="text-sm font-medium">Pattern nama profile boost</Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2 leading-relaxed">
          Template nama PPP profile yang dipakai saat boost aktif. Variable: <code className="font-mono bg-muted px-1 rounded">{`{base}`}</code> = nama profile sekarang, <code className="font-mono bg-muted px-1 rounded">{`{multiplier}`}</code> = angka multiplier (2 atau 3).
        </p>
        <Input
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          className="font-mono text-sm"
          placeholder="{base}-boost-{multiplier}x"
        />
        <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
          <div>Contoh: profile <code className="font-mono">MOON-30M</code> + boost 2× → akan cari profile <code className="font-mono">MOON-30M-boost-2x</code></div>
          <div>Pastikan profile boost-nya sudah dibuat manual di MikroTik dengan rate-limit 2× / 3× speed asli.</div>
        </div>
      </div>

      {/* Profile map override (advanced) */}
      <div className="pb-5 border-b">
        <Label className="text-sm font-medium">Profile map override (opsional)</Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2 leading-relaxed">
          Override pattern untuk paket spesifik. JSON: <code className="font-mono text-[10px]">{"{ \"NAMA_PAKET\": { \"2\": \"profile-2x\", \"3\": \"profile-3x\" } }"}</code>.
          Kosongkan kalau pakai pattern saja.
        </p>
        <Textarea
          value={profileMapText}
          onChange={(e) => setProfileMapText(e.target.value)}
          rows={6}
          className="font-mono text-xs"
          placeholder='{ "MOON": { "2": "MOON-BOOST-2X", "3": "MOON-BOOST-3X" } }'
        />
      </div>

      {/* Test apply */}
      <div className="pb-5 border-b">
        <Label className="text-sm font-medium">Test aplikasikan boost (dry-run)</Label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2 leading-relaxed">
          Test apply boost ke 1 customer untuk verifikasi setup MikroTik. Auto-revert dalam 5 detik supaya tidak ganggu service.
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={testCustomerId}
            onChange={(e) => setTestCustomerId(e.target.value)}
            placeholder="Customer ID (numeric)"
            className="text-sm"
            type="number"
          />
          <select
            value={testMultiplier}
            onChange={(e) => setTestMultiplier(Number(e.target.value))}
            className="h-9 px-2 border rounded-md text-sm bg-background"
          >
            <option value={2}>2× test</option>
            <option value={3}>3× test</option>
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => testMut.mutate()}
            disabled={testMut.isPending || !testCustomerId}
          >
            {testMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Test
          </Button>
        </div>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
        >
          {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Simpan Konfigurasi MikroTik
        </Button>
      </div>

      {/* Quick reference */}
      <div className="rounded-lg border bg-muted/20 p-3 text-[11px] text-muted-foreground leading-relaxed space-y-1.5">
        <div className="font-semibold text-foreground/80 flex items-center gap-1.5">
          <Info className="h-3 w-3" /> Persiapan di MikroTik
        </div>
        <ol className="list-decimal ml-4 space-y-0.5">
          <li>Buka WinBox → PPP → Profiles → klik <strong>+</strong></li>
          <li>Buat profile boost untuk tiap paket (e.g. <code className="font-mono">MOON-30M-boost-2x</code> dengan rate-limit 60M/60M kalau paket asli 30M/30M)</li>
          <li>Save tiap profile, pastikan nama match dengan pattern di atas</li>
          <li>Test dengan tombol Test di atas — kalau sukses, customer langsung bisa redeem otomatis</li>
        </ol>
      </div>
    </div>
  );
}

