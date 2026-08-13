import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Phone, Calendar, AlertTriangle, Sparkles, Zap, Info, Settings, Pencil, Trash2, Clock, ArrowRight } from "lucide-react";
import { fmtDate } from "./shared";
import { StatTile } from "./tiles";
import { PointConfigDialog } from "./PointConfigDialog";

export function PointRedemptionsTab({ canEdit, stats, showDeleted, onShowDeletedChange }: { canEdit: boolean; stats: any; showDeleted: boolean; onShowDeletedChange: (v: boolean) => void }) {
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
      {/* Health alert - kalau ada redemption gagal revert MikroTik */}
      {health && health.overdueCount > 0 && (
        <div className={`rounded-lg border p-4 ${
          health.criticalCount > 0
            ? "bg-destructive/10 border-destructive/30"
            : "bg-warning/10 border-warning/30"
        }`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
              health.criticalCount > 0 ? "bg-destructive" : "bg-warning"
            }`}>
              <AlertTriangle className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <div className={`font-bold text-sm ${
                health.criticalCount > 0 ? "text-destructive" : "text-warning"
              }`}>
                {health.criticalCount > 0
                  ? ` ${health.criticalCount} redemption CRITICAL - gagal revert MikroTik 5×+`
                  : ` ${health.overdueCount} redemption gagal auto-revert MikroTik`}
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
                      it.revertAttempts >= 5 ? "bg-destructive/25 text-destructive" : "bg-warning/25 text-warning"
                    }`}>
                      {it.revertAttempts}× gagal
                    </span>
                    {it.revertError && (
                      <span className="text-muted-foreground italic truncate max-w-[280px]" title={it.revertError}>
                        - {it.revertError}
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

      {/* KPI bar - telco mature, numbers carry the design */}
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

      {/* Action bar - segmented filter + proper toolbar buttons */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 p-1 bg-muted/60 rounded-lg w-fit overflow-x-auto">
          {(["pending", "active", "expired", "rejected", "cancelled", "all"] as const).map((s) => {
            const dot = s === "pending" && (stats?.pending ?? 0) > 0 ? "bg-warning"
              : s === "active" && (stats?.active ?? 0) > 0 ? "bg-success"
              : s === "rejected" && (stats?.rejected ?? 0) > 0 ? "bg-destructive"
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
                pending:   { label: "Menunggu",   dotColor: "bg-warning",   textColor: "text-warning" },
                active:    { label: "Aktif",      dotColor: "bg-success", textColor: "text-success" },
                expired:   { label: "Selesai",    dotColor: "bg-muted",    textColor: "text-muted-foreground" },
                rejected:  { label: "Ditolak",    dotColor: "bg-destructive",    textColor: "text-destructive" },
                cancelled: { label: "Dibatalkan", dotColor: "bg-muted",    textColor: "text-muted-foreground" },
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
                  className={`relative px-5 py-4 flex items-start gap-4 flex-wrap transition-colors ${
                    isDeleted
                      ? "opacity-50 line-through"
                      : almostExpired
                      ? "bg-gradient-to-r from-amber-50/70 to-transparent"
                      : isActive
                      ? "bg-gradient-to-r from-emerald-50/40 to-transparent hover:from-emerald-50/60"
                      : "hover:bg-muted/30"
                  }`}
                >
                  {/* Left accent strip */}
                  {(almostExpired || isActive) && (
                    <div className={`absolute left-0 top-3 bottom-3 w-1 rounded-r ${almostExpired ? "bg-warning" : "bg-success"}`} />
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
                          ? "bg-warning/15 text-warning font-bold"
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
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-warning/10 text-[10px] font-mono font-semibold text-warning border border-warning/30">
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
                          <CheckCircle2 className="h-3 w-3 text-success" /> admin #{r.verifiedBy}
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
                            <XCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                            <span className="text-destructive"><strong>Ditolak:</strong> {r.rejectionReason}</span>
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
                    <div className="flex gap-1.5 shrink-0 pt-0.5 items-center flex-wrap w-full sm:w-auto justify-end sm:justify-start">
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
                            className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                          >
                            Tolak
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => { setVerifyFor(r); setVerifyNotes(""); }}
                            className="h-8 text-xs bg-success hover:brightness-95 text-white"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Verify
                          </Button>
                        </>
                      )}
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        disabled={r.status === "active"}
                        title={r.status === "active" ? "Boost masih jalan - cancel dulu" : "Hapus"}
                        onClick={() => { setDeleteFor(r); setDeleteReason(""); }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                      {r.status === "active" && (
                        <>
                          {/* Force Expire - hanya muncul kalau revertAttempts > 0 (artinya overdue + gagal revert) */}
                          {(r.revertAttempts ?? 0) > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setForceExpireFor(r); setForceExpireReason(""); }}
                              className="h-8 text-xs text-warning hover:text-warning hover:bg-warning/10 border-warning/30"
                              title={`Auto-revert gagal ${r.revertAttempts}× - force expire setelah benerin profile manual`}
                            >
                              <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Force Expire
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { if (confirm(`Hentikan boost ${r.rewardLabel} untuk ${r.customerName}? Point akan dikembalikan + profile MikroTik di-revert ke ${r.originalPppProfile ?? "asli"}.`)) cancelMut.mutate(r.id); }}
                            className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
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
                <div>{verifyFor?.customerName} - <span className="font-mono">#{verifyFor?.customerBillingId}</span></div>
                <div className="font-semibold text-foreground">{verifyFor?.rewardLabel} · {verifyFor?.durationHours}h durasi</div>
                <div>Setelah verify, boost akan aktif {verifyFor?.durationHours} jam dari sekarang.</div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-2.5 rounded-md bg-success/10 border border-success/30 text-xs">
              <p className="font-semibold text-success">✓ Auto-MikroTik aktif</p>
              <p className="text-success/80 mt-0.5">
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
                className="bg-success hover:brightness-95"
              >
                {verifyMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Aktivasi Boost
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Force Expire dialog - admin override saat MikroTik tidak bisa di-revert otomatis */}
      <Dialog open={!!forceExpireFor} onOpenChange={(o) => !o && setForceExpireFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" /> Force Expire Redemption
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-xs pt-1 space-y-1">
                <div>{forceExpireFor?.customerName} - <span className="font-mono">#{forceExpireFor?.customerBillingId}</span></div>
                <div className="font-semibold text-foreground">{forceExpireFor?.rewardLabel}</div>
                {(forceExpireFor?.revertAttempts ?? 0) > 0 && (
                  <div className="text-destructive">
                    Auto-revert sudah gagal {forceExpireFor?.revertAttempts}× - error terakhir: <em>{forceExpireFor?.revertError}</em>
                  </div>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-2.5 rounded-md bg-warning/10 border border-warning/30 text-xs">
              <p className="font-bold text-warning"> Force expire = bypass revert MikroTik</p>
              <p className="text-warning/90 mt-1">
                Hanya gunakan kalau kamu <strong>sudah set profile manual lewat WinBox</strong> ke <code className="font-mono bg-warning/25 px-1 rounded">{forceExpireFor?.originalPppProfile ?? "profile asli"}</code>.
                Tindakan ini akan di-log di audit trail dengan alasan kamu.
              </p>
            </div>
            <div>
              <Label className="text-xs">Alasan (wajib - audit trail)</Label>
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
                className="bg-warning hover:brightness-95 text-white"
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
              <Sparkles className="h-5 w-5 text-warning" /> Backfill Loyalty Points
            </DialogTitle>
            <DialogDescription>
              Berikan point loyalty awal ke customer existing berdasarkan tenure (kapan bergabung - auto parse dari customer ID format <code className="font-mono text-[10px] bg-muted px-1 rounded">MMYYNNNNN</code>).
              Idempotent - customer yang sudah pernah di-backfill akan di-skip.
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
                      <span className="text-lg font-bold tabular-nums text-success">{info.count}</span>
                      <span className="text-[10px] text-muted-foreground">customer</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                <div className="rounded-md bg-success/10 border border-success/30 p-2.5">
                  <div className="text-[10px] uppercase font-bold text-success">Akan Dapat</div>
                  <div className="text-xl font-bold tabular-nums text-success mt-0.5">{(backfillPreview.eligibleCount ?? 0).toLocaleString("id-ID")}</div>
                  <div className="text-[10px] text-muted-foreground">customer</div>
                </div>
                <div className="rounded-md bg-warning/10 border border-warning/30 p-2.5">
                  <div className="text-[10px] uppercase font-bold text-warning">Total Pts</div>
                  <div className="text-xl font-bold tabular-nums text-warning mt-0.5">{(backfillPreview.totalPointsToGrant ?? 0).toLocaleString("id-ID")}</div>
                  <div className="text-[10px] text-muted-foreground">akan dikeluarkan</div>
                </div>
                <div className="rounded-md bg-muted/50 border p-2.5">
                  <div className="text-[10px] uppercase font-bold text-foreground">Sudah Dapat</div>
                  <div className="text-xl font-bold tabular-nums text-foreground mt-0.5">{(backfillPreview.alreadyGrantedCount ?? 0).toLocaleString("id-ID")}</div>
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
                            <td className="px-2 py-1.5 text-right tabular-nums font-bold text-success">+{s.points.toLocaleString("id-ID")}</td>
                            <td className="px-2 py-1.5 text-[10px]">
                              {s.alreadyGranted ? <span className="text-muted-foreground">sudah</span> : <span className="text-success font-semibold">eligible</span>}
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
                    ? "Status 'pending' - poin akan otomatis di-refund saat hapus."
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
                {rejectFor?.customerName} - {rejectFor?.rewardLabel}.
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
 * StatTile - telco mature design: numbers carry the design.
 * Flat surface, monochrome, status via small dot, single accent on hover/active.
 */
