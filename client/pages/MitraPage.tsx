import { useMemo, useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { ALL_FEATURES } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { toast } from "sonner";
import {
  Building2, Plus, Edit3, Trash2, Power, PowerOff, Search, Loader2,
  Users as UsersIcon, CheckCircle2, XCircle, RefreshCw, X, ChevronRight,
  Mail, Phone, MapPin, Globe, User, Lock, Layers, Zap, Info,
} from "lucide-react";

// --- Types ---
interface MitraItem {
  id: number;
  slug: string | null;
  displayName: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  district: string | null;
  primaryContactName: string | null;
  primaryContactPhone: string | null;
  logoUrl: string | null;
  features: Record<string, boolean>;
  isActive: number | null;
  customerCount: number;
  userCount: number;
  notes?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface SafeUser {
  id: number; username: string; name: string;
  role: string | null; roleId: number | null;
  isActive: number | null;
}

// --- Helpers ---
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function slugify(val: string): string {
  return val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// =======================================================================
// SWITCH COMPONENT (inline - no separate file needed)
// =======================================================================
function Switch({ checked, onCheckedChange, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-sky-600" : "bg-slate-200 dark:bg-slate-700"
      }`}
    >
      <SwitchPrimitive.Thumb
        className={`pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-md ring-0 transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </SwitchPrimitive.Root>
  );
}

// =======================================================================
// MAIN PAGE
// =======================================================================
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
    <div className="flex flex-col min-h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)] md:overflow-hidden bg-slate-50/40 dark:bg-slate-950/40 -m-4 md:-m-6 -mt-4 md:-mt-6 pb-20 md:pb-0">
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
    </div>
  );
}

// =======================================================================
// MITRA CARD
// =======================================================================
function MitraCard({ mitra, canEdit, onClick, onToggleActive, onDelete }: {
  mitra: MitraItem;
  canEdit: boolean;
  onClick: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const isActive = mitra.isActive === 1;
  const featuresEnabled = Object.values(mitra.features ?? {}).filter(Boolean).length;
  const totalFeatures = ALL_FEATURES.length;

  return (
    <Card
      className={`group cursor-pointer hover:shadow-md transition-all duration-200 ${
        !isActive ? "opacity-60" : ""
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Logo / avatar */}
          <div className="shrink-0 w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-700 flex items-center justify-center text-white font-bold text-lg shadow-sm ring-2 ring-white/10">
            {mitra.logoUrl ? (
              <img src={mitra.logoUrl} alt={mitra.name} className="w-full h-full object-cover" />
            ) : (
              getInitials(mitra.displayName || mitra.name)
            )}
          </div>
          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="font-bold text-sm leading-tight truncate">
              {mitra.displayName || mitra.name}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground mt-0.5 truncate">
              {mitra.slug ?? "-"}
            </div>
            <div className="mt-1">
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                isActive
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}>
                <span className={`w-1 h-1 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
                {isActive ? "Aktif" : "Nonaktif"}
              </span>
            </div>
          </div>
          {/* Chevron */}
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground group-hover:translate-x-0.5 transition-all mt-1" />
        </div>

        {/* Mini stats */}
        <div className="grid grid-cols-3 gap-2">
          <MiniStat icon={<UsersIcon className="h-3 w-3" />} label="Pelanggan" value={mitra.customerCount} />
          <MiniStat icon={<User className="h-3 w-3" />} label="User" value={mitra.userCount} />
          <MiniStat icon={<Zap className="h-3 w-3" />} label="Fitur" value={`${featuresEnabled}/${totalFeatures}`} />
        </div>

        {/* District / location */}
        {mitra.district && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{mitra.district}</span>
          </div>
        )}

        {/* Action buttons */}
        {canEdit && (
          <div className="flex gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] flex-1" onClick={onClick}>
              <Edit3 className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={`h-7 px-2 text-[11px] ${isActive ? "text-amber-600 hover:text-amber-700" : "text-emerald-600 hover:text-emerald-700"}`}
              onClick={onToggleActive}
            >
              {isActive ? <PowerOff className="h-3 w-3" /> : <Power className="h-3 w-3" />}
            </Button>
            {mitra.id !== 1 && (
              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] text-destructive hover:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="flex flex-col items-center p-2 rounded-lg bg-muted/40 border gap-0.5">
      <div className="flex items-center gap-1 text-muted-foreground">{icon}</div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
    </div>
  );
}

// =======================================================================
// DETAIL DRAWER
// =======================================================================
type DetailTab = "overview" | "features" | "members";

function MitraDetailDrawer({ mitra, canEdit, onClose, onSaved }: {
  mitra: MitraItem | null;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const qc = useQueryClient();

  useEffect(() => { if (mitra) setTab("overview"); }, [mitra?.id]);

  if (!mitra) return null;

  return (
    <Dialog open={!!mitra} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* Hero */}
        <div className="relative p-5 md:p-6 bg-gradient-to-br from-violet-600 to-indigo-800 text-white shrink-0">
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/15">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-2xl md:text-3xl font-bold shadow-lg shrink-0 overflow-hidden ring-2 ring-white/20">
              {mitra.logoUrl ? (
                <img src={mitra.logoUrl} alt={mitra.name} className="w-full h-full object-cover" />
              ) : (
                getInitials(mitra.displayName || mitra.name)
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl md:text-2xl font-bold leading-tight truncate">{mitra.displayName || mitra.name}</h2>
              <div className="text-sm opacity-90 font-mono mt-0.5">{mitra.slug ?? "no-slug"}</div>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                  mitra.isActive === 1 ? "bg-emerald-400/30" : "bg-slate-400/30"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${mitra.isActive === 1 ? "bg-emerald-300" : "bg-slate-300"}`} />
                  {mitra.isActive === 1 ? "AKTIF" : "NONAKTIF"}
                </span>
                <span className="px-2 py-0.5 bg-white/20 rounded text-[10px] font-bold">
                  {mitra.customerCount} pelanggan
                </span>
                <span className="px-2 py-0.5 bg-white/20 rounded text-[10px] font-bold">
                  {mitra.userCount} user
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 md:px-6 pt-3 border-b shrink-0">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {([
              { key: "overview", label: "Overview", icon: Building2 },
              { key: "features", label: "Fitur", icon: Zap },
              { key: "members", label: "Anggota", icon: UsersIcon },
            ] as const).map(({ key, label, icon: Ic }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  tab === key
                    ? "border-violet-500 text-violet-600 dark:text-violet-400"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Ic className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4">
          {tab === "overview" && (
            <OverviewTab mitra={mitra} canEdit={canEdit} onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/mitras"] }); }} />
          )}
          {tab === "features" && (
            <FeaturesTab mitra={mitra} canEdit={canEdit} onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/mitras"] }); }} />
          )}
          {tab === "members" && (
            <MembersTab mitra={mitra} canEdit={canEdit} />
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-between items-center px-5 md:px-6 py-3 border-t bg-muted/20 shrink-0 flex-wrap">
          <div className="text-[10px] text-muted-foreground">
            ID: <span className="font-mono">{mitra.id}</span>
            {mitra.createdAt && <> · Dibuat: <strong>{fmtDate(mitra.createdAt)}</strong></>}
          </div>
          <Button size="sm" variant="outline" onClick={onClose}>Tutup</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Overview Tab (inline edit form) ---
function OverviewTab({ mitra, canEdit, onSaved }: { mitra: MitraItem; canEdit: boolean; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: mitra.name ?? "",
    displayName: mitra.displayName ?? "",
    slug: mitra.slug ?? "",
    phone: mitra.phone ?? "",
    email: mitra.email ?? "",
    address: mitra.address ?? "",
    district: mitra.district ?? "",
    primaryContactName: mitra.primaryContactName ?? "",
    primaryContactPhone: mitra.primaryContactPhone ?? "",
    logoUrl: mitra.logoUrl ?? "",
    notes: mitra.notes ?? "",
  });
  const [editing, setEditing] = useState(false);

  // Reset when mitra changes
  useEffect(() => {
    setForm({
      name: mitra.name ?? "",
      displayName: mitra.displayName ?? "",
      slug: mitra.slug ?? "",
      phone: mitra.phone ?? "",
      email: mitra.email ?? "",
      address: mitra.address ?? "",
      district: mitra.district ?? "",
      primaryContactName: mitra.primaryContactName ?? "",
      primaryContactPhone: mitra.primaryContactPhone ?? "",
      logoUrl: mitra.logoUrl ?? "",
      notes: mitra.notes ?? "",
    });
    setEditing(false);
  }, [mitra.id]);

  const mut = useMutation({
    mutationFn: (data: Partial<typeof form>) => api.put<any>(`/mitras/${mitra.id}`, data),
    onSuccess: () => { toast.success("Mitra berhasil diupdate"); setEditing(false); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!form.name.trim()) { toast.error("Nama wajib diisi"); return; }
    mut.mutate(form);
  };

  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  if (!editing) {
    // Read-only view
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-1.5">
          <InfoRow icon={<Building2 className="h-3.5 w-3.5" />} label="Nama Resmi" value={mitra.name} />
          <InfoRow icon={<Globe className="h-3.5 w-3.5" />} label="Nama Tampilan" value={mitra.displayName} />
          <InfoRow icon={<Layers className="h-3.5 w-3.5" />} label="Slug" value={mitra.slug} mono />
          <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="Telepon" value={mitra.phone} mono />
          <InfoRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={mitra.email} />
          <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Kecamatan" value={mitra.district} />
          <InfoRow icon={<MapPin className="h-3.5 w-3.5" />} label="Alamat" value={mitra.address} />
          <InfoRow icon={<User className="h-3.5 w-3.5" />} label="PIC" value={mitra.primaryContactName} />
          <InfoRow icon={<Phone className="h-3.5 w-3.5" />} label="HP PIC" value={mitra.primaryContactPhone} mono />
          {mitra.logoUrl && (
            <InfoRow icon={<Globe className="h-3.5 w-3.5" />} label="Logo URL" value={mitra.logoUrl} />
          )}
        </div>
        {mitra.notes && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Catatan</div>
            <div className="p-3 rounded-lg bg-muted text-xs whitespace-pre-wrap">{mitra.notes}</div>
          </div>
        )}
        {canEdit && (
          <Button size="sm" onClick={() => setEditing(true)} className="bg-violet-600 hover:bg-violet-700 mt-2">
            <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Edit Info
          </Button>
        )}
      </div>
    );
  }

  // Edit form
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FF label="Nama Resmi *" value={form.name} onChange={set("name")} placeholder="PT Mitra Fiber Garut" />
        <FF label="Nama Tampilan" value={form.displayName} onChange={set("displayName")} placeholder="Mitra Garut" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FF label="Slug" value={form.slug} onChange={(v) => set("slug")(slugify(v))} placeholder="mitra-garut" mono />
        <FF label="Telepon" value={form.phone} onChange={set("phone")} placeholder="08123456789" mono />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FF label="Email" value={form.email} onChange={set("email")} placeholder="contact@mitra.id" />
        <FF label="Kecamatan / Wilayah" value={form.district} onChange={set("district")} placeholder="Cilawu, Garut" />
      </div>
      <FF label="Alamat" value={form.address} onChange={set("address")} placeholder="Jl. ..." />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FF label="PIC (Kontak Utama)" value={form.primaryContactName} onChange={set("primaryContactName")} placeholder="Nama lengkap" />
        <FF label="HP PIC" value={form.primaryContactPhone} onChange={set("primaryContactPhone")} placeholder="08xxx" mono />
      </div>
      <FF label="Logo URL (opsional)" value={form.logoUrl} onChange={set("logoUrl")} placeholder="https://..." />
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Catatan</label>
        <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={3} className="mt-1 text-sm" placeholder="Informasi tambahan tentang mitra ini..." />
      </div>
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Batal</Button>
        <Button size="sm" onClick={handleSave} disabled={mut.isPending} className="bg-violet-600 hover:bg-violet-700">
          {mut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Simpan Perubahan
        </Button>
      </div>
    </div>
  );
}

// --- Features Tab ---
function FeaturesTab({ mitra, canEdit, onSaved }: { mitra: MitraItem; canEdit: boolean; onSaved: () => void }) {
  const [features, setFeatures] = useState<Record<string, boolean>>({ ...mitra.features });
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => { setFeatures({ ...mitra.features }); }, [mitra.id]);

  const mut = useMutation({
    mutationFn: ({ key, val }: { key: string; val: boolean }) => {
      setSavingKey(key);
      return api.put<any>(`/mitras/${mitra.id}`, { features: { [key]: val } });
    },
    onSuccess: (_, { key, val }) => {
      setFeatures((f) => ({ ...f, [key]: val }));
      setSavingKey(null);
      toast.success(`Fitur "${key}" ${val ? "diaktifkan" : "dinonaktifkan"}`);
      onSaved();
    },
    onError: (e: any) => { setSavingKey(null); toast.error(e.message); },
  });

  const handleToggle = (key: string, val: boolean) => {
    if (!canEdit) return;
    mut.mutate({ key, val });
  };

  const enabledCount = Object.values(features).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          <span className="font-semibold text-foreground">{enabledCount}</span> dari {ALL_FEATURES.length} fitur aktif
        </div>
        {!canEdit && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Lock className="h-3 w-3" /> Hanya baca
          </div>
        )}
      </div>

      <div className="space-y-2">
        {ALL_FEATURES.map((f) => {
          const isOn = !!features[f.key];
          const saving = savingKey === f.key && mut.isPending;
          return (
            <div
              key={f.key}
              className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-colors ${
                isOn ? "bg-violet-50 border-violet-200 dark:bg-violet-950/20 dark:border-violet-800/50" : "bg-muted/20"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${isOn ? "text-foreground" : "text-muted-foreground"}`}>
                  {f.label}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground/70 mt-0.5">{f.key}</div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <Switch
                  checked={isOn}
                  onCheckedChange={(val) => handleToggle(f.key, val)}
                  disabled={!canEdit || mut.isPending}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Members Tab ---
function MembersTab({ mitra, canEdit }: { mitra: MitraItem; canEdit: boolean }) {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const [addUserId, setAddUserId] = useState<string>("");
  const [addRoleId, setAddRoleId] = useState<string>("");
  const [pendingUserId, setPendingUserId] = useState<number | null>(null);

  const { data: members = [], isLoading: loadingMembers } = useQuery<any[]>({
    queryKey: ["/api/mitras", mitra.id, "users"],
    queryFn: async () => {
      // Fetch members from user_mitras via GET /api/mitras/:id
      const detail = await api.get<any>(`/mitras/${mitra.id}`);
      return (detail as any).members ?? [];
    },
    retry: false,
  });

  const { data: allUsers = [] } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
    queryFn: () => api.get<SafeUser[]>("/users"),
    enabled: canEdit,
  });

  const { data: roles = [] } = useQuery<{ id: number; name: string; isSystem: boolean }[]>({
    queryKey: ["/api/roles"],
    queryFn: () => api.get<{ id: number; name: string; isSystem: boolean }[]>("/roles"),
    enabled: canEdit,
  });

  // Roles available for this mitra: hide System-Admin if not mitra=1
  const availableRoles = useMemo(
    () => roles.filter((r) => mitra.id === 1 ? true : r.name !== "System-Admin"),
    [roles, mitra.id],
  );

  // Default to "Admin" role when roles load
  useEffect(() => {
    if (availableRoles.length > 0 && !addRoleId) {
      const adminRole = availableRoles.find((r) => r.name === "Admin");
      if (adminRole) setAddRoleId(String(adminRole.id));
    }
  }, [availableRoles, addRoleId]);

  const addMut = useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number }) =>
      api.post<any>(`/mitras/${mitra.id}/users`, { userId, roleId }),
    onSuccess: () => {
      toast.success("User ditambahkan ke mitra");
      setAddUserId("");
      setAddRoleId("");
      qc.invalidateQueries({ queryKey: ["/api/mitras", mitra.id, "users"] });
      qc.invalidateQueries({ queryKey: ["/api/mitras"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (userId: number) => api.delete<any>(`/mitras/${mitra.id}/users/${userId}`),
    onSuccess: () => {
      toast.success("User dihapus dari mitra");
      qc.invalidateQueries({ queryKey: ["/api/mitras", mitra.id, "users"] });
      qc.invalidateQueries({ queryKey: ["/api/mitras"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateRoleMut = useMutation({
    mutationFn: async ({ userId, roleId }: { userId: number; roleId: number }) => {
      setPendingUserId(userId);
      return api.patch<any>(`/mitras/${mitra.id}/members/${userId}`, { roleId });
    },
    onSuccess: () => {
      toast.success("Role di-update");
      qc.invalidateQueries({ queryKey: ["/api/mitras", mitra.id, "users"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Gagal update role"),
    onSettled: () => setPendingUserId(null),
  });

  // Non-member users available for adding
  const memberIds = new Set((members as any[]).map((m: any) => m.userId ?? m.id));
  const availableUsers = allUsers.filter((u) => !memberIds.has(u.id) && u.isActive === 1);

  return (
    <div className="space-y-4">
      {/* Onboarding tip - visible only in edit mode */}
      {canEdit && (
        <div className="flex gap-2 items-start p-3 rounded-lg border bg-violet-50/30 border-violet-200 dark:bg-violet-950/20 dark:border-violet-800/50">
          <Info className="h-4 w-4 text-violet-600 dark:text-violet-300 shrink-0 mt-0.5" />
          <div className="text-xs text-violet-900/90 dark:text-violet-200/90 leading-relaxed">
            <span className="font-semibold">Tips:</span> Setiap mitra wajib punya minimal 1 user dengan role <strong>Admin</strong> sebagai entry point. Khusus mitra <strong>JABNET (mitra=1)</strong>, role yang dimaksud adalah <strong>System-Admin</strong> (cross-tenant). Mitra baru tidak bisa diakses tanpa Admin assigned.
          </div>
        </div>
      )}

      {/* Add member (edit mode only) */}
      {canEdit && (
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <Select value={addUserId} onValueChange={setAddUserId}>
            <SelectTrigger className="flex-1 min-w-0 h-9 text-sm">
              <SelectValue placeholder="Pilih user untuk ditambahkan..." />
            </SelectTrigger>
            <SelectContent>
              {availableUsers.length === 0 ? (
                <SelectItem value="__none" disabled>Semua user sudah menjadi anggota</SelectItem>
              ) : (
                availableUsers.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name} <span className="text-muted-foreground text-xs">@{u.username}</span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Select value={addRoleId} onValueChange={setAddRoleId}>
            <SelectTrigger className="w-[140px] shrink-0 h-9 text-sm">
              <SelectValue placeholder="Role..." />
            </SelectTrigger>
            <SelectContent>
              {availableRoles.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.name}
                  {r.name === "System-Admin" && (
                    <span className="ml-1 text-[10px] text-destructive"></span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => {
              if (addUserId && addUserId !== "__none" && addRoleId) {
                addMut.mutate({ userId: Number(addUserId), roleId: Number(addRoleId) });
              }
            }}
            disabled={!addUserId || addUserId === "__none" || !addRoleId || addMut.isPending}
            className="h-9 bg-violet-600 hover:bg-violet-700 shrink-0"
          >
            {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      )}

      {/* Member list */}
      {loadingMembers ? (
        <div className="py-8 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
        </div>
      ) : (members as any[]).length === 0 ? (
        <div className="py-10 text-center">
          <UsersIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
          <div className="font-semibold text-sm">Belum ada anggota</div>
          <div className="text-xs text-muted-foreground mt-1">
            {canEdit ? "Tambah user via dropdown di atas" : "Mitra ini belum memiliki anggota"}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {(members as any[]).map((m: any) => {
            const userId = m.userId ?? m.id;
            const name = m.userName ?? m.name ?? `User #${userId}`;
            const username = m.username ?? "";
            const isPrimary = m.isPrimary === 1 || m.isPrimary === true;
            // Per-membership role takes precedence; fallback to global role
            const currentMemberRoleId: number | null = m.memberRoleId ?? m.globalRoleId ?? null;
            const currentRoleName: string = m.roleName ?? m.role ?? "";
            // Can edit role: System-Admin can always; at mitra=1 require System-Admin; other mitras require canEdit
            const canEditRole = canEdit && (mitra.id === 1 ? !!currentUser?.isSystemAdmin : true);
            return (
              <div key={userId} className="flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-muted/40 transition-colors border">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {getInitials(name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                    {name}
                    {isPrimary && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 uppercase tracking-wider">
                        Utama
                      </span>
                    )}
                  </div>
                  {username && <div className="text-xs text-muted-foreground font-mono">@{username}</div>}
                </div>
                {/* Role selector per row */}
                {canEditRole ? (
                  <Select
                    value={currentMemberRoleId ? String(currentMemberRoleId) : ""}
                    onValueChange={(v) =>
                      updateRoleMut.mutate({ userId, roleId: Number(v) })
                    }
                    disabled={pendingUserId === userId}
                  >
                    <SelectTrigger className="w-[130px] h-7 text-xs shrink-0">
                      <SelectValue placeholder="Pilih role" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)} className="text-xs">
                          {r.name}
                          {r.name === "System-Admin" && (
                            <span className="ml-1 text-[10px] text-destructive"></span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  currentRoleName && (
                    <span className="text-xs text-muted-foreground shrink-0 px-2 py-0.5 rounded bg-muted/60 border">
                      {currentRoleName}
                    </span>
                  )
                )}
                {canEdit && (
                  <button
                    onClick={() => removeMut.mutate(userId)}
                    disabled={removeMut.isPending}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    title="Hapus dari mitra"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =======================================================================
// CREATE DIALOG (2-step wizard)
// =======================================================================
const EMPTY_MITRA_FORM = { name: "", slug: "", displayName: "", phone: "", primaryContactName: "", primaryContactPhone: "", district: "", address: "", email: "", notes: "" };
const EMPTY_ADMIN_FORM = { username: "", name: "", email: "", phone: "", password: "", passwordConfirm: "" };

function MitraCreateDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ ...EMPTY_MITRA_FORM });
  const [adminForm, setAdminForm] = useState({ ...EMPTY_ADMIN_FORM });
  const [adminErrors, setAdminErrors] = useState<Record<string, string>>({});

  // Reset all wizard state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep(1);
      setForm({ ...EMPTY_MITRA_FORM });
      setAdminForm({ ...EMPTY_ADMIN_FORM });
      setAdminErrors({});
    }
  }, [open]);

  // Auto-gen slug from name (only if slug not yet manually set)
  useEffect(() => {
    if (form.name && !form.slug) {
      setForm((f) => ({ ...f, slug: slugify(f.name) }));
    }
  }, [form.name]);

  // Auto-suggest username when entering step 2
  useEffect(() => {
    if (step === 2 && !adminForm.username && form.slug) {
      setAdminForm((prev) => ({
        ...prev,
        username: `${form.slug.replace(/-/g, "_")}_admin`,
      }));
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const mut = useMutation({
    mutationFn: (data: any) => api.post<any>("/mitras", data),
    onSuccess: (data: any) => {
      const adminUsername = data?.adminUser?.username ?? "?";
      toast.success(`Mitra dibuat - Admin: ${adminUsername} bisa login sekarang`);
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  function validateStep1AndNext() {
    if (!form.name.trim()) { toast.error("Nama mitra wajib diisi"); return; }
    if (!form.slug.trim() || !/^[a-z0-9-]+$/.test(form.slug)) {
      toast.error("Slug harus kebab-case (huruf kecil, angka, dash)");
      return;
    }
    if (!form.phone.trim()) { toast.error("Telepon wajib diisi"); return; }
    setStep(2);
  }

  function validateAdminForm(): boolean {
    const errs: Record<string, string> = {};
    if (!adminForm.username.trim()) errs.username = "Wajib";
    else if (adminForm.username.length < 3) errs.username = "Min 3 karakter";
    else if (!/^[a-zA-Z0-9_-]+$/.test(adminForm.username)) errs.username = "Hanya huruf, angka, _, -";
    if (!adminForm.name.trim()) errs.name = "Wajib";
    if (!adminForm.password) errs.password = "Wajib";
    else if (adminForm.password.length < 8) errs.password = "Min 8 karakter";
    if (adminForm.password !== adminForm.passwordConfirm) errs.passwordConfirm = "Tidak cocok";
    setAdminErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validateAdminForm()) return;
    mut.mutate({
      ...form,
      admin: {
        username: adminForm.username,
        name: adminForm.name,
        email: adminForm.email || undefined,
        phone: adminForm.phone || undefined,
        password: adminForm.password,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 md:px-6 pt-5 md:pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-violet-500" />
            {step === 1 ? "Tambah Mitra Baru" : "Tambah Mitra - Step 2/2"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Daftarkan tenant mitra baru ke platform JABNET. Logo URL bisa diatur setelah mitra dibuat."
              : "Akun Administrator mitra (wajib - sebagai entry point login)."}
          </DialogDescription>
          {/* Step indicator */}
          <div className="flex gap-1.5 pt-1">
            <div className={`h-1 w-8 rounded-full transition-colors ${step >= 1 ? "bg-violet-500" : "bg-muted"}`} />
            <div className={`h-1 w-8 rounded-full transition-colors ${step >= 2 ? "bg-violet-500" : "bg-muted"}`} />
          </div>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3 px-5 md:px-6 py-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FF
                label="Nama Resmi *"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v, slug: slugify(v) }))}
                placeholder="PT Mitra Fiber..."
              />
              <FF
                label="Slug (URL-safe)"
                value={form.slug}
                onChange={(v) => set("slug")(slugify(v))}
                placeholder="mitra-garut"
                mono
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FF label="Nama Tampilan" value={form.displayName} onChange={set("displayName")} placeholder="Mitra Garut" />
              <FF label="Telepon *" value={form.phone} onChange={set("phone")} placeholder="08123456789" mono />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FF label="PIC / Kontak Utama" value={form.primaryContactName} onChange={set("primaryContactName")} placeholder="Nama PIC" />
              <FF label="No. HP PIC" value={form.primaryContactPhone} onChange={set("primaryContactPhone")} placeholder="08123456789" mono />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FF label="Kecamatan / Wilayah" value={form.district} onChange={set("district")} placeholder="Cilawu, Garut" />
              <FF label="Email" value={form.email} onChange={set("email")} placeholder="kontak@mitra.id" />
            </div>

            <FF label="Alamat" value={form.address} onChange={set("address")} placeholder="Jl. Contoh No. 1, Garut" />

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Catatan (opsional)</label>
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes")(e.target.value)}
                rows={2}
                className="mt-1 text-sm"
                placeholder="Informasi tambahan..."
              />
            </div>

            <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/50 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Semua fitur diaktifkan secara default.</span>{" "}
              Atur fitur per-mitra di tab "Fitur" setelah mitra dibuat.
            </div>
          </div>
        ) : (
          <div className="space-y-3 px-5 md:px-6 py-4 overflow-y-auto flex-1">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200">
              Setiap mitra wajib punya 1 Admin sebagai entry point. Password yang Anda set di sini bisa digunakan langsung untuk login.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FF
                  label="Username *"
                  value={adminForm.username}
                  onChange={(v) => setAdminForm((p) => ({ ...p, username: v }))}
                  placeholder="e.g. asaka_admin"
                  mono
                />
                {adminErrors.username && <div className="text-xs text-red-500 mt-1">{adminErrors.username}</div>}
              </div>
              <div>
                <FF
                  label="Nama Lengkap *"
                  value={adminForm.name}
                  onChange={(v) => setAdminForm((p) => ({ ...p, name: v }))}
                  placeholder="Admin Mitra Asaka"
                />
                {adminErrors.name && <div className="text-xs text-red-500 mt-1">{adminErrors.name}</div>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FF
                label="Email (opsional)"
                value={adminForm.email}
                onChange={(v) => setAdminForm((p) => ({ ...p, email: v }))}
                placeholder="admin@mitra.id"
                type="email"
              />
              <FF
                label="Phone (opsional - MPWA OTP)"
                value={adminForm.phone}
                onChange={(v) => setAdminForm((p) => ({ ...p, phone: v }))}
                placeholder="08123456789"
                mono
              />
            </div>

            <div>
              <FF
                label="Password * (min 8)"
                value={adminForm.password}
                onChange={(v) => setAdminForm((p) => ({ ...p, password: v }))}
                placeholder="••••••••"
                type="password"
              />
              {adminErrors.password && <div className="text-xs text-red-500 mt-1">{adminErrors.password}</div>}
            </div>

            <div>
              <FF
                label="Konfirmasi Password *"
                value={adminForm.passwordConfirm}
                onChange={(v) => setAdminForm((p) => ({ ...p, passwordConfirm: v }))}
                placeholder="••••••••"
                type="password"
              />
              {adminErrors.passwordConfirm && <div className="text-xs text-red-500 mt-1">{adminErrors.passwordConfirm}</div>}
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-between px-5 md:px-6 py-3 border-t bg-muted/20 shrink-0">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          {step === 1 ? (
            <Button
              onClick={validateStep1AndNext}
              disabled={!form.name.trim() || !form.slug.trim() || !form.phone.trim()}
              className="bg-violet-600 hover:bg-violet-700"
            >
              Lanjut ke Admin →
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>← Kembali</Button>
              <Button onClick={handleSubmit} disabled={mut.isPending} className="bg-violet-600 hover:bg-violet-700">
                {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Buat Mitra + Admin
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =======================================================================
// SHARED MICRO-COMPONENTS
// =======================================================================
function KpiTile({ icon, label, value, iconBg }: { icon: React.ReactNode; label: string; value: number; iconBg: string }) {
  return (
    <Card>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className="text-2xl md:text-3xl font-bold tabular-nums mt-1">{value.toLocaleString("id-ID")}</div>
          </div>
          <div className={`w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0 ${iconBg}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="text-muted-foreground mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0 grid grid-cols-3 gap-2">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className={`col-span-2 text-sm break-words ${mono ? "font-mono" : ""} ${value ? "" : "text-muted-foreground italic"}`}>
          {value || "-"}
        </div>
      </div>
    </div>
  );
}

function FF({ label, value, onChange, placeholder, type = "text", mono }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}
