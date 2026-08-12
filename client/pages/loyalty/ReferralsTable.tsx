import { useState, useMemo } from "react";
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
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Users, CheckCircle2, XCircle, Loader2, UserPlus, Plus, Pencil, Trash2, MoreHorizontal } from "lucide-react";
import { REFERRAL_STATUS_LABELS, fmtRelative } from "./shared";

export function ReferralsTable({ referrals, loading, showDeleted, onShowDeletedChange }: any) {
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
      {/* Primary filter - Status Pelanggan (segmented control) */}
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

      {/* Secondary filter row - Status Referral dropdown + toggle + CTA */}
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
                        <div className="text-sm font-medium">{r.refereeName ?? "-"}</div>
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
                                  : "-"}
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
                                <Button size="icon-xs" variant="ghost" aria-label="Menu aksi"><MoreHorizontal className="h-4 w-4" /></Button>
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
              Input referral dari obrolan telepon/WA/ketemu langsung. Baris akan masuk dengan status <em>Diundang</em> - nanti bisa di-<strong>Link</strong> ke customer saat tetangga daftar.
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
                <div>Tetangga diundang: {linkFor?.refereeName ?? "-"} ({linkFor?.refereePhone ?? "-"})</div>
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

// ===============================================================
// POINT REDEMPTIONS TAB - Speed-on-Demand admin verification
// ===============================================================
