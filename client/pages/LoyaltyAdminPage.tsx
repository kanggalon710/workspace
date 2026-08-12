import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trophy, Gift, Users, XCircle, Loader2, RefreshCw, AlertTriangle, UserPlus, BarChart3, Award, Zap, Info } from "lucide-react";
import { SahabatKitDialog } from "@/components/sahabat/SahabatKitDialog";
import { SahabatDetailDrawer } from "@/components/sahabat/SahabatDetailDrawer";
import { type Tab, fmtRewardValue } from "./loyalty/shared";
import { KpiCard } from "./loyalty/tiles";
import { SummaryTab } from "./loyalty/SummaryTab";
import { DiscountRow } from "./loyalty/DiscountRow";
import { LeaderboardTable } from "./loyalty/LeaderboardTable";
import { ReferralsTable } from "./loyalty/ReferralsTable";
import { PointRedemptionsTab } from "./loyalty/PointRedemptionsTab";

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
                    <li>Tetangga daftar internet di <code className="font-mono text-[10px]">billing.jabnet.id</code> - tulis kode ref.</li>
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
                  <strong className="text-foreground">Satu entry, dua jalur:</strong> kedua jalur menyimpan ke tabel yang sama - jadi walau awalnya manual, sistem tetap tracking progress level & milestone bonus seperti referral otomatis.
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
        {tab === "summary" && (
          <>
            {/* Sahabat reward hero strip (AI-generated), full-bleed, fades into page */}
            <div className="relative -mt-4 -mx-4 md:-mx-6 mb-4 h-24 md:h-32 overflow-hidden">
              <img src="/brand/sahabat-hero.jpg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-right" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/30 to-transparent" />
            </div>
            <SummaryTab summary={summary} leaderboard={leaderboard} canEdit={canEdit} />
          </>
        )}

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
                <div>{applyFor?.customerName} - {applyFor?.description}</div>
                <div className="text-xs"><strong>{applyFor ? fmtRewardValue({ discountType: applyFor.discountType, discountValue: applyFor.discountValue }) : "-"}</strong> untuk periode {applyFor?.eligibleForPeriod ?? "-"}</div>
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

      {/* Sahabat Kit dialog - marketing material generator */}
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
                <div>{cancelFor?.customerName} - {cancelFor?.description}</div>
                <div className="text-xs"><strong>{cancelFor ? fmtRewardValue({ discountType: cancelFor.discountType, discountValue: cancelFor.discountValue }) : "-"}</strong> untuk periode {cancelFor?.eligibleForPeriod ?? "-"}</div>
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
                <div className="text-xs">Soft delete - masih bisa di-restore via SQL admin kalau perlu.</div>
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
