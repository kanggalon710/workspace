import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { FullBleedPage } from "@/components/ui/full-bleed-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Building2, Plus, Search, Loader2, Users as UsersIcon, CheckCircle2, XCircle, RefreshCw, X, User } from "lucide-react";
import { MitraCard } from "./mitra/MitraCard";
import { MitraDetailDrawer } from "./mitra/MitraDetailDrawer";
import { MitraCreateDialog } from "./mitra/MitraCreateDialog";
import { KpiTile, type MitraItem } from "./mitra/shared";

export default function MitraPage() {
  const { canWrite } = useAuth();
  const canEdit = canWrite("mitra_admin");
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailFor, setDetailFor] = useState<MitraItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MitraItem | null>(null);

  const { data: mitras = [], isLoading, isError, refetch } = useQuery<MitraItem[]>({
    queryKey: ["/api/mitras", showInactive],
    queryFn: () => api.get<MitraItem[]>(`/mitras?includeInactive=${showInactive}`),
    refetchInterval: 120_000,
  });

  // Stats
  const stats = useMemo(() => ({
    active: mitras.filter((m) => m.isActive === 1).length,
    inactive: mitras.filter((m) => m.isActive !== 1).length,
    totalCustomers: mitras.reduce((s, m) => s + (m.customerCount ?? 0), 0),
    totalUsers: mitras.reduce((s, m) => s + (m.userCount ?? 0), 0),
  }), [mitras]);

  // Filter
  const filtered = useMemo(() => {
    if (!search) return mitras;
    const q = search.toLowerCase();
    return mitras.filter((m) => {
      const hay = [m.name, m.displayName, m.slug, m.district, m.email].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [mitras, search]);

  // Toggle active/inactive mitra
  const toggleActiveMut = useMutation({
    mutationFn: (m: MitraItem) => api.put<any>(`/mitras/${m.id}`, { isActive: m.isActive === 1 ? 0 : 1 }),
    onSuccess: (_, m) => {
      toast.success(m.isActive === 1 ? `${m.name} dinonaktifkan` : `${m.name} diaktifkan`);
      qc.invalidateQueries({ queryKey: ["/api/mitras"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Soft delete
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete<any>(`/mitras/${id}`),
    onSuccess: (_, id) => {
      toast.success("Mitra dinonaktifkan");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["/api/mitras"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <FullBleedPage>
      {/* -- Header -- */}
      <div className="sticky top-0 z-10 px-4 md:px-6 pt-4 md:pt-6 pb-4 space-y-4 shrink-0 bg-background border-b">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 md:gap-4 min-w-0 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-700 flex items-center justify-center shadow-lg shrink-0">
              <Building2 className="h-5 w-5 md:h-6 md:w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Kelola Mitra</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                <span className="hidden md:inline">Manajemen tenant mitra JABNET - CRUD, feature flags, dan membership.</span>
                <span className="md:hidden">Manajemen tenant mitra</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => refetch()} title="Muat ulang" className="h-9 w-9 p-0 md:w-auto md:px-3">
              <RefreshCw className="h-4 w-4" />
              <span className="hidden md:inline ml-1.5">Muat Ulang</span>
            </Button>
            {canEdit && (
              <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-violet-600 hover:bg-violet-700">
                <Plus className="h-4 w-4 md:mr-1.5" />
                <span className="hidden md:inline">Tambah Mitra</span>
                <span className="md:hidden">Tambah</span>
              </Button>
            )}
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          <KpiTile icon={<CheckCircle2 className="h-4 w-4" />} label="Mitra Aktif" value={stats.active} iconBg="bg-emerald-500" />
          <KpiTile icon={<XCircle className="h-4 w-4" />} label="Tidak Aktif" value={stats.inactive} iconBg="bg-slate-400" />
          <KpiTile icon={<UsersIcon className="h-4 w-4" />} label="Total Pelanggan" value={stats.totalCustomers} iconBg="bg-sky-500" />
          <KpiTile icon={<User className="h-4 w-4" />} label="Total User" value={stats.totalUsers} iconBg="bg-violet-500" />
        </div>

        {/* Search + filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari nama, slug, kecamatan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none px-3 h-9 rounded-md border bg-background hover:bg-muted/50 transition-colors shrink-0">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="accent-violet-600"
            />
            <span className="text-xs font-medium">Tampilkan tidak aktif</span>
          </label>
        </div>
      </div>

      {/* -- Content -- */}
      <div className="flex-1 md:overflow-y-auto px-4 md:px-6 py-4">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-3 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-muted shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-4 bg-muted rounded w-2/3" />
                      <div className="h-3 bg-muted rounded w-1/3" />
                    </div>
                  </div>
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-4/5" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <Card>
            <CardContent className="py-16 text-center">
              <XCircle className="h-12 w-12 text-destructive/50 mx-auto mb-3" />
              <div className="font-semibold text-sm">Gagal memuat data mitra</div>
              <div className="text-xs text-muted-foreground mt-1 mb-4">Periksa koneksi atau coba muat ulang</div>
              <Button size="sm" variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Coba Lagi
              </Button>
            </CardContent>
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <div className="font-semibold text-sm">
                {search ? "Tidak ada mitra yang cocok dengan pencarian" : "Belum ada mitra terdaftar"}
              </div>
              <div className="text-xs text-muted-foreground mt-1 mb-4">
                {search ? "Coba ubah kata kunci pencarian" : "Tambah mitra pertama untuk mulai"}
              </div>
              {canEdit && !search && (
                <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-violet-600 hover:bg-violet-700">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Tambah Mitra
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((m) => (
              <MitraCard
                key={m.id}
                mitra={m}
                canEdit={canEdit}
                onClick={() => setDetailFor(m)}
                onToggleActive={() => toggleActiveMut.mutate(m)}
                onDelete={() => setDeleteTarget(m)}
              />
            ))}
          </div>
        )}
      </div>

      {/* -- Dialogs -- */}
      <MitraDetailDrawer
        mitra={detailFor}
        canEdit={canEdit}
        onClose={() => setDetailFor(null)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/mitras"] }); setDetailFor(null); }}
      />

      <MitraCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/mitras"] }); setCreateOpen(false); }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Nonaktifkan Mitra?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                Mitra <strong className="text-foreground">{deleteTarget?.name}</strong> akan dinonaktifkan (soft delete).
                Data pelanggan dan konfigurasi tetap tersimpan. Mitra dapat diaktifkan kembali kapan saja.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              disabled={deleteMut.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Nonaktifkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FullBleedPage>
  );
}

// =======================================================================
// MITRA CARD
// =======================================================================
