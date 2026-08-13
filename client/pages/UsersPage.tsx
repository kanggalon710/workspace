import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { ALL_PERMISSIONS, EDITOR_HIDDEN_KEYS } from "@shared/schema";

// Editor surfaces hide dead/no-effect keys (see EDITOR_HIDDEN_KEYS).
const VISIBLE_PERMISSIONS = ALL_PERMISSIONS.filter((p) => !EDITOR_HIDDEN_KEYS.has(p.key));
import { Card, CardContent } from "@/components/ui/card";
import { FullBleedPage } from "@/components/ui/full-bleed-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
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
import { toast } from "sonner";
import {
  Users as UsersIcon, UserPlus, Edit3, Trash2, KeyRound, Power, PowerOff,
  Search, Loader2, Mail, Phone, Briefcase, Building2, Hash, X, Check,
  Activity as ActivityIcon, BarChart3, Shield, ChevronRight, Clock,
  CheckCircle2, AlertCircle, MoreHorizontal, Calendar, MapPin,
  Cake, PhoneCall, FileText, Filter, ArrowUpDown, Eye, RefreshCw,
} from "lucide-react";

interface SafeUser {
  id: number; username: string; name: string;
  role: string | null; roleId: number | null;
  isActive: number | null; createdAt: string | null; lastLogin: string | null;
  email: string | null; phone: string | null; employeeId: string | null;
  position: string | null; department: string | null; branch: string | null;
  address: string | null; joinDate: string | null; birthDate: string | null;
  emergencyContact: string | null; notes: string | null;
  mitraNames?: string[];   // mitra yang bisa diakses user ini (nama saja)
}

type PermissionLevel = "none" | "read" | "write";

interface RoleItem {
  id: number; name: string; description: string | null;
  isSystem: boolean; canSeeAllData: boolean;
  permissions: Record<string, PermissionLevel>;
  userCount?: number; createdAt: string | null;
}

// -------------------------------------------------------------
const ROLE_COLORS: Record<string, string> = {
  admin:     "from-rose-500 to-red-600",
  marketing: "from-violet-500 to-purple-600",
  operator:  "from-sky-500 to-blue-600",
  teknisi:   "from-amber-500 to-orange-600",
  viewer:    "from-slate-400 to-slate-500",
};

function getRoleGradient(role: string | null): string {
  return ROLE_COLORS[role ?? "viewer"] ?? "from-slate-400 to-slate-500";
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "Belum pernah";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins}m lalu`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}j lalu`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}h lalu`;
  if (d < 30) return `${Math.floor(d / 7)}mg lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

// =====================================================================
// MAIN PAGE
// =====================================================================
export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("name");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [detailFor, setDetailFor] = useState<SafeUser | null>(null);
  const [editFor, setEditFor] = useState<SafeUser | null>(null);
  const [resetPwFor, setResetPwFor] = useState<SafeUser | null>(null);
  const [bulkAction, setBulkAction] = useState<{ type: string; payload?: any } | null>(null);

  // Toggle lintas mitra - hanya JABNET System-Admin di mitra aktif 1. Default: JABNET saja.
  const canCrossScope = !!currentUser?.isSystemAdmin && currentUser?.activeMitraId === 1;
  const [crossScope, setCrossScope] = useState(() => localStorage.getItem("users:crossScope") === "1");
  const scope = canCrossScope && crossScope ? "cross" : "own";

  const { data: users = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/users", scope],
    queryFn: () => api.get<SafeUser[]>(`/users${scope === "cross" ? "?scope=cross" : ""}`),
    refetchInterval: 60_000,
  });
  const { data: roles = [] } = useQuery<RoleItem[]>({
    queryKey: ["/api/roles"],
    queryFn: () => api.get<RoleItem[]>("/roles"),
  });

  // Filter + sort
  const filtered = useMemo(() => {
    let list = users.filter((u) => {
      if (roleFilter !== "all") {
        if (roleFilter === "no_role" && u.roleId) return false;
        if (roleFilter !== "no_role" && String(u.roleId) !== roleFilter && u.role !== roleFilter) return false;
      }
      if (statusFilter === "active" && u.isActive !== 1) return false;
      if (statusFilter === "inactive" && u.isActive === 1) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [u.name, u.username, u.email, u.phone, u.position, u.department, u.branch, u.employeeId]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      switch (sortBy) {
        case "lastLogin": return (new Date(b.lastLogin ?? 0).getTime()) - (new Date(a.lastLogin ?? 0).getTime());
        case "created": return (new Date(b.createdAt ?? 0).getTime()) - (new Date(a.createdAt ?? 0).getTime());
        case "role": return (a.role ?? "").localeCompare(b.role ?? "");
        default: return a.name.localeCompare(b.name);
      }
    });
    return list;
  }, [users, search, roleFilter, statusFilter, sortBy]);

  // Stats
  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.isActive === 1).length,
    inactive: users.filter((u) => u.isActive !== 1).length,
    admins: users.filter((u) => u.role === "admin" && u.isActive === 1).length,
  }), [users]);

  // Mutations
  const bulkMut = useMutation({
    mutationFn: (data: { action: string; userIds: number[]; payload?: any }) =>
      api.post<any>("/users/bulk-action", data),
    onSuccess: (r: any) => {
      toast.success(`${r.affected} user diupdate${r.errors?.length ? ` (${r.errors.length} gagal)` : ""}`);
      qc.invalidateQueries({ queryKey: ["/api/users"] });
      setSelectedIds(new Set());
      setBulkAction(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleAllVisible = () => {
    const visibleIds = filtered.map((u) => u.id).filter((id) => id !== currentUser?.id);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  };

  return (
    <FullBleedPage>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 md:px-6 pt-4 md:pt-6 pb-4 space-y-4 shrink-0 bg-background border-b">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 md:gap-4 min-w-0 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shadow-lg shrink-0">
              <UsersIcon className="h-5 w-5 md:h-6 md:w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Manajemen User</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1">
                <span className="hidden md:inline">Kelola akun staff, role, dan akses ke sistem JABNET.</span>
                <span className="md:hidden">Kelola akun staff & akses</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["/api/users"] })} title="Muat ulang" className="h-9 w-9 p-0 md:w-auto md:px-3">
              <RefreshCw className="h-4 w-4" />
              <span className="hidden md:inline ml-1.5">Muat Ulang</span>
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-sky-600 hover:bg-sky-700">
              <UserPlus className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Tambah User</span>
              <span className="md:hidden">Tambah</span>
            </Button>
          </div>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          <KpiTile icon={<UsersIcon className="h-4 w-4" />} label="Total User" value={stats.total} iconBg="bg-slate-500" />
          <KpiTile icon={<CheckCircle2 className="h-4 w-4" />} label="Aktif" value={stats.active} iconBg="bg-emerald-500" />
          <KpiTile icon={<PowerOff className="h-4 w-4" />} label="Nonaktif" value={stats.inactive} iconBg="bg-slate-400" />
          <KpiTile icon={<Shield className="h-4 w-4" />} label="Admin" value={stats.admins} iconBg="bg-rose-500" />
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari nama, username, email..."
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
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 md:mx-0 px-4 md:px-0 shrink-0">
            {canCrossScope && (
              <label className="flex items-center gap-2 h-9 px-3 rounded-md border border-border text-xs text-muted-foreground select-none cursor-pointer shrink-0 whitespace-nowrap">
                <Switch
                  checked={crossScope}
                  onCheckedChange={(v) => {
                    setCrossScope(v);
                    localStorage.setItem("users:crossScope", v ? "1" : "0");
                  }}
                  aria-label="Tampilkan user semua mitra"
                />
                Semua mitra
              </label>
            )}
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-32 h-9 text-xs shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Role</SelectItem>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                ))}
                <SelectItem value="no_role">Tanpa Role</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-28 h-9 text-xs shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Status</SelectItem>
                <SelectItem value="active">Aktif</SelectItem>
                <SelectItem value="inactive">Nonaktif</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-32 h-9 text-xs shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Nama A-Z</SelectItem>
                <SelectItem value="lastLogin">Login Terakhir</SelectItem>
                <SelectItem value="created">Dibuat Terbaru</SelectItem>
                <SelectItem value="role">Role</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-[var(--header-h,200px)] z-[9] px-4 md:px-6 py-2.5 bg-sky-600 text-white shadow-lg flex items-center justify-between gap-3 flex-wrap animate-in slide-in-from-top">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Check className="h-4 w-4" />
            {selectedIds.size} user dipilih
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Button size="sm" variant="secondary" className="h-8" onClick={() => bulkMut.mutate({ action: "activate", userIds: Array.from(selectedIds) })} disabled={bulkMut.isPending}>
              <Power className="h-3.5 w-3.5 mr-1" /> Aktifkan
            </Button>
            <Button size="sm" variant="secondary" className="h-8" onClick={() => bulkMut.mutate({ action: "deactivate", userIds: Array.from(selectedIds) })} disabled={bulkMut.isPending}>
              <PowerOff className="h-3.5 w-3.5 mr-1" /> Nonaktifkan
            </Button>
            <Button size="sm" variant="secondary" className="h-8" onClick={() => setBulkAction({ type: "set_role" })} disabled={bulkMut.isPending}>
              <Shield className="h-3.5 w-3.5 mr-1" /> Ganti Role
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-white hover:bg-white/15" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3.5 w-3.5 mr-1" /> Batal
            </Button>
          </div>
        </div>
      )}

      {/* User list */}
      <div className="flex-1 md:overflow-y-auto px-4 md:px-6 py-4">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <UsersIcon className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <div className="font-semibold text-sm">Tidak ada user dengan filter ini</div>
              <div className="text-xs text-muted-foreground mt-1">Coba ubah filter atau klik "Tambah User"</div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {/* Header row (desktop only) */}
              <div className="hidden md:flex items-center gap-3 px-4 py-2.5 border-b bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <div className="w-8 shrink-0">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((u) => u.id === currentUser?.id || selectedIds.has(u.id))}
                    onChange={toggleAllVisible}
                  />
                </div>
                <div className="flex-1 min-w-0">User</div>
                <div className="w-32 shrink-0">Role</div>
                <div className="w-32 shrink-0">Posisi</div>
                <div className="w-28 shrink-0">Status</div>
                <div className="w-32 shrink-0">Login Terakhir</div>
                <div className="w-12 shrink-0" />
              </div>
              {/* Rows */}
              <ul className="divide-y">
                {filtered.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === currentUser?.id}
                    isSelected={selectedIds.has(u.id)}
                    onToggleSelect={() => toggleSelect(u.id)}
                    onClick={() => setDetailFor(u)}
                    role={roles.find((r) => r.id === u.roleId)}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialogs */}
      <UserDetailDrawer
        user={detailFor} role={roles.find((r) => r.id === detailFor?.roleId)}
        roles={roles} onClose={() => setDetailFor(null)}
        onEdit={() => { setEditFor(detailFor); setDetailFor(null); }}
        onResetPassword={() => { setResetPwFor(detailFor); setDetailFor(null); }}
        onDeleted={() => { qc.invalidateQueries({ queryKey: ["/api/users"] }); setDetailFor(null); }}
        currentUserId={currentUser?.id}
      />

      <UserFormDialog
        open={createOpen} onClose={() => setCreateOpen(false)}
        roles={roles}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/users"] }); setCreateOpen(false); }}
      />

      <UserFormDialog
        open={!!editFor} onClose={() => setEditFor(null)}
        initial={editFor} roles={roles}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/users"] }); setEditFor(null); }}
      />

      <ResetPasswordDialog
        user={resetPwFor} onClose={() => setResetPwFor(null)}
        onSaved={() => setResetPwFor(null)}
      />

      <BulkRoleDialog
        open={bulkAction?.type === "set_role"}
        onClose={() => setBulkAction(null)}
        roles={roles}
        onApply={(roleId: number) => bulkMut.mutate({ action: "set_role", userIds: Array.from(selectedIds), payload: { roleId } })}
        count={selectedIds.size}
      />
    </FullBleedPage>
  );
}

// =====================================================================
// USER ROW
// =====================================================================
function UserRow({ user, isSelf, isSelected, onToggleSelect, onClick, role }: any) {
  const isActive = user.isActive === 1;
  return (
    <li
      role="button"
      tabIndex={0}
      className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer ${
        isSelected ? "bg-sky-50/50 dark:bg-sky-950/20" : ""
      }`}
      onClick={onClick}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onClick?.(); } }}
    >
      {/* Checkbox */}
      <div className="w-8 shrink-0" onClick={(e) => e.stopPropagation()}>
        {!isSelf ? (
          <input type="checkbox" checked={isSelected} onChange={onToggleSelect} />
        ) : (
          <div className="text-[9px] text-muted-foreground text-center font-semibold">SAYA</div>
        )}
      </div>

      {/* Avatar + identity */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`relative w-10 h-10 rounded-full bg-gradient-to-br ${getRoleGradient(user.role)} flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0`}>
          {getInitials(user.name)}
          {/* Status dot */}
          <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-background ${
            isActive ? "bg-emerald-500" : "bg-slate-400"
          }`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate flex items-center gap-1.5">
            {user.name}
            {isSelf && <span className="text-[9px] font-normal text-sky-600 dark:text-sky-400">(Anda)</span>}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            <span className="font-mono">@{user.username}</span>
            {user.email && <> · {user.email}</>}
          </div>
          {/* Akses mitra (nama saja) */}
          {user.mitraNames && user.mitraNames.length > 0 && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
              {user.mitraNames.map((nm: string) => (
                <span key={nm} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300">
                  {nm}
                </span>
              ))}
            </div>
          )}
          {/* Mobile: show role + status inline */}
          <div className="md:hidden flex items-center gap-2 mt-1.5 flex-wrap">
            {role && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted">
                {role.name}
              </span>
            )}
            <span className={`text-[10px] font-semibold ${isActive ? "text-emerald-600" : "text-muted-foreground"}`}>
              {isActive ? "Aktif" : "Nonaktif"}
            </span>
            <span className="text-[10px] text-muted-foreground">{fmtRelative(user.lastLogin)}</span>
          </div>
        </div>
      </div>

      {/* Role (desktop) */}
      <div className="hidden md:block w-32 shrink-0">
        {role ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-muted text-foreground">
            {role.name}
          </span>
        ) : user.role ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
            {user.role} (legacy)
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground italic">Belum di-set</span>
        )}
      </div>

      {/* Position (desktop) */}
      <div className="hidden md:block w-32 shrink-0 min-w-0">
        <div className="text-xs truncate">{user.position || "-"}</div>
        {user.department && <div className="text-[10px] text-muted-foreground truncate">{user.department}</div>}
      </div>

      {/* Status (desktop) */}
      <div className="hidden md:block w-28 shrink-0">
        {isActive ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Aktif
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Nonaktif
          </span>
        )}
      </div>

      {/* Last login (desktop) */}
      <div className="hidden md:block w-32 shrink-0 text-xs text-muted-foreground">
        {fmtRelative(user.lastLogin)}
      </div>

      {/* Chevron */}
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
    </li>
  );
}

// =====================================================================
// USER DETAIL DRAWER (right-side panel-style dialog)
// =====================================================================
type DetailTab = "overview" | "activity" | "productivity" | "permissions";

function UserDetailDrawer({ user, role, roles, onClose, onEdit, onResetPassword, onDeleted, currentUserId }: any) {
  const [tab, setTab] = useState<DetailTab>("overview");
  const isSelf = user?.id === currentUserId;

  useEffect(() => { if (user) setTab("overview"); }, [user?.id]);

  const { data: activity = [] } = useQuery<any[]>({
    queryKey: ["/api/users", user?.id, "activity"],
    queryFn: () => api.get<any[]>(`/users/${user!.id}/activity?limit=50`),
    enabled: !!user && tab === "activity",
  });

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/users", user?.id, "stats"],
    queryFn: () => api.get(`/users/${user!.id}/stats`),
    enabled: !!user && (tab === "overview" || tab === "productivity"),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/users/${user.id}`),
    onSuccess: () => { toast.success("User dihapus"); onDeleted(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!user) return null;
  const isActive = user.isActive === 1;

  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl dialog-w max-h-[90vh] overflow-hidden flex flex-col p-0">
        {/* a11y: DialogTitle/DialogDescription required by Radix; visually replaced by hero below */}
        <DialogTitle className="sr-only">Detail User: {user.name}</DialogTitle>
        <DialogDescription className="sr-only">Drawer detail untuk user {user.username}</DialogDescription>
        {/* Hero */}
        <div className={`relative p-5 md:p-6 bg-gradient-to-br ${getRoleGradient(user.role)} text-white shrink-0`}>
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/15">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center text-2xl md:text-3xl font-bold shadow-lg shrink-0">
              {getInitials(user.name)}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl md:text-2xl font-bold leading-tight truncate">{user.name}</h2>
              <div className="text-sm opacity-90 font-mono mt-0.5">@{user.username}</div>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <span className="px-2 py-0.5 bg-white/20 backdrop-blur rounded text-[10px] font-bold uppercase tracking-wider">
                  {role?.name ?? user.role ?? "no role"}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                  isActive ? "bg-emerald-400/30" : "bg-slate-400/30"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-300" : "bg-slate-300"}`} />
                  {isActive ? "AKTIF" : "NONAKTIF"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 md:px-6 pt-3 border-b shrink-0">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {([
              { key: "overview",      label: "Overview",      icon: UsersIcon },
              { key: "productivity",  label: "Produktivitas", icon: BarChart3 },
              { key: "activity",      label: "Aktivitas",     icon: ActivityIcon },
              { key: "permissions",   label: "Akses",         icon: Shield },
            ] as const).map(({ key, label, icon: Ic }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  tab === key ? "border-sky-500 text-sky-600 dark:text-sky-400" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Ic className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4">
          {tab === "overview" && <OverviewTab user={user} role={role} stats={stats} />}
          {tab === "productivity" && <ProductivityTab stats={stats} />}
          {tab === "activity" && <ActivityTab logs={activity} />}
          {tab === "permissions" && <PermissionsTab role={role} user={user} />}
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 justify-between items-center px-5 md:px-6 py-3 border-t bg-muted/20 shrink-0 flex-wrap">
          <div className="flex gap-2">
            {!isSelf && (
              <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => { if (confirm(`Hapus user "${user.name}"? Tindakan tidak bisa di-undo.`)) deleteMut.mutate(); }} disabled={deleteMut.isPending}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Hapus
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onResetPassword}>
              <KeyRound className="h-3.5 w-3.5 mr-1" /> Reset Password
            </Button>
            <Button size="sm" onClick={onEdit} className="bg-sky-600 hover:bg-sky-700">
              <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Detail Tabs ---
function OverviewTab({ user, role, stats }: any) {
  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <MiniMetric icon={<ActivityIcon className="h-3.5 w-3.5" />} label="Aksi 7H" value={stats.actions7d ?? 0} />
          <MiniMetric icon={<ActivityIcon className="h-3.5 w-3.5" />} label="Aksi 30H" value={stats.actions30d ?? 0} />
          <MiniMetric icon={<KeyRound className="h-3.5 w-3.5" />} label="Login 30H" value={stats.logins30d ?? 0} />
          <MiniMetric icon={<KeyRound className="h-3.5 w-3.5" />} label="Total Login" value={stats.totalLogins ?? 0} />
        </div>
      )}

      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Kontak</h3>
        <div className="space-y-1.5">
          <DetailRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={user.email} />
          <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={user.phone} mono />
          <DetailRow icon={<PhoneCall className="h-3.5 w-3.5" />} label="Kontak Darurat" value={user.emergencyContact} />
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Info Pekerjaan</h3>
        <div className="space-y-1.5">
          <DetailRow icon={<Hash className="h-3.5 w-3.5" />} label="ID Karyawan" value={user.employeeId} mono />
          <DetailRow icon={<Briefcase className="h-3.5 w-3.5" />} label="Posisi" value={user.position} />
          <DetailRow icon={<Building2 className="h-3.5 w-3.5" />} label="Departemen" value={user.department} />
          <DetailRow icon={<Building2 className="h-3.5 w-3.5" />} label="Akses Mitra" value={user.mitraNames && user.mitraNames.length > 0 ? user.mitraNames.join(", ") : null} />
          <DetailRow icon={<MapPin className="h-3.5 w-3.5" />} label="Cabang" value={user.branch} />
          <DetailRow icon={<Calendar className="h-3.5 w-3.5" />} label="Tgl Bergabung" value={fmtDate(user.joinDate)} />
        </div>
      </div>

      <div>
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Personal</h3>
        <div className="space-y-1.5">
          <DetailRow icon={<MapPin className="h-3.5 w-3.5" />} label="Alamat" value={user.address} />
          <DetailRow icon={<Cake className="h-3.5 w-3.5" />} label="Tgl Lahir" value={fmtDate(user.birthDate)} />
        </div>
      </div>

      {user.notes && (
        <div>
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Catatan</h3>
          <div className="p-3 rounded-lg bg-muted text-xs whitespace-pre-wrap">{user.notes}</div>
        </div>
      )}

      <div className="pt-3 border-t text-[10px] text-muted-foreground space-y-0.5">
        <div>Akun dibuat: <strong>{fmtDate(user.createdAt)}</strong></div>
        <div>Login terakhir: <strong>{fmtRelative(user.lastLogin)}</strong></div>
      </div>
    </div>
  );
}

function ProductivityTab({ stats }: any) {
  if (!stats) return <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" /></div>;
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Aktivitas</h3>
          <div className="grid grid-cols-2 gap-3">
            <BigMetric label="Aksi 7 Hari" value={stats.actions7d} sublabel={`${Math.round(stats.actions7d / 7)} aksi/hari`} tone="sky" />
            <BigMetric label="Aksi 30 Hari" value={stats.actions30d} sublabel={`${stats.logins30d} login`} tone="indigo" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Penanganan Tugas</h3>
          <div className="grid grid-cols-2 gap-3">
            <BigMetric label="Tiket Ditugaskan" value={stats.tickets?.assigned ?? 0} sublabel={`${stats.tickets?.resolved ?? 0} resolved`} tone="amber" />
            <BigMetric label="Lead Ditugaskan" value={stats.leads?.assigned ?? 0} sublabel={`${stats.leads?.won ?? 0} won`} tone="violet" />
            <BigMetric label="Collection" value={stats.collections?.assigned ?? 0} sublabel="cases assigned" tone="rose" />
            <BigMetric label="Canvassing 30H" value={stats.canvassing?.reports30d ?? 0} sublabel={`${stats.canvassing?.totalSessions ?? 0} sesi total`} tone="emerald" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityTab({ logs }: any) {
  if (!logs) return <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" /></div>;
  if (logs.length === 0) {
    return (
      <div className="py-12 text-center">
        <ActivityIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
        <div className="font-semibold text-sm">Belum ada aktivitas</div>
        <div className="text-xs text-muted-foreground mt-1">Aktivitas user akan muncul di sini</div>
      </div>
    );
  }
  return (
    <div className="space-y-1">
      {logs.map((log: any) => {
        const isLogin = log.action === "LOGIN";
        const isCreate = log.action === "CREATE";
        const isDelete = log.action === "DELETE";
        const dotColor = isLogin ? "bg-sky-500" : isCreate ? "bg-emerald-500" : isDelete ? "bg-rose-500" : "bg-slate-400";
        return (
          <div key={log.id} className="flex items-start gap-3 py-2 px-2 hover:bg-muted/30 rounded-md transition-colors">
            <div className={`w-2 h-2 rounded-full ${dotColor} mt-2 shrink-0`} />
            <div className="flex-1 min-w-0">
              <div className="text-sm">
                <span className="font-semibold">{log.action}</span>
                {log.entityType && <span className="text-muted-foreground"> · {log.entityType}</span>}
                {log.entityName && <span className="text-foreground/80"> · {log.entityName}</span>}
              </div>
              <div className="text-[10px] text-muted-foreground">{fmtRelative(log.createdAt)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Per-user "izin khusus" editor - ADD-ONLY grants on top of the role.
 *  Managed via GET/PUT /api/users/:id/permission-grants (admin only). */
function SpecialAccessEditor({ user }: { user: any }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ grants: Record<string, "read" | "write">; effective: Record<string, string>; roleName: string | null }>({
    queryKey: ["/api/users", user.id, "permission-grants"],
    queryFn: () => api.get(`/users/${user.id}/permission-grants`),
    enabled: !!user,
  });
  const [draft, setDraft] = useState<Record<string, "read" | "write">>({});
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setDraft(data?.grants ?? {}); setDirty(false); }, [data?.grants, user.id]);

  const saveMut = useMutation({
    mutationFn: () => api.put(`/users/${user.id}/permission-grants`, { grants: draft }),
    onSuccess: () => { toast.success("Izin khusus disimpan"); setDirty(false); qc.invalidateQueries({ queryKey: ["/api/users", user.id, "permission-grants"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const setLevel = (key: string, level: "read" | "write") => { setDraft((d) => ({ ...d, [key]: level })); setDirty(true); };
  const remove = (key: string) => { setDraft((d) => { const n = { ...d }; delete n[key]; return n; }); setDirty(true); };
  const add = (key: string | null) => { if (!key) return; setDraft((d) => (d[key] ? d : { ...d, [key]: "read" })); setDirty(true); };

  const grantKeys = Object.keys(draft);
  const labelOf = (k: string) => ALL_PERMISSIONS.find((p) => p.key === k)?.label ?? k;
  const options = VISIBLE_PERMISSIONS.filter((p) => !draft[p.key]).map((p) => ({ value: p.key, label: `${p.label} · ${p.group}` }));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <KeyRound className="h-5 w-5 text-violet-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">Akses Khusus</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Beri fitur ekstra di luar role user ini. Bersifat <strong>menambah</strong> — tidak bisa mengurangi akses yang sudah diberi role.
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="text-xs text-muted-foreground px-1">Memuat…</div>
        ) : (
          <>
            {grantKeys.length === 0 ? (
              <div className="text-xs text-muted-foreground rounded-md bg-muted/40 px-3 py-2">Belum ada izin khusus untuk user ini.</div>
            ) : (
              <div className="space-y-1">
                {grantKeys.map((k) => (
                  <div key={k} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-md bg-muted/40">
                    <div className="min-w-0">
                      <div className="text-sm truncate">{labelOf(k)}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{k}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {(["read", "write"] as const).map((lvl) => (
                        <button key={lvl} type="button" onClick={() => setLevel(k, lvl)}
                          className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                            draft[k] === lvl
                              ? (lvl === "write" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300")
                              : "text-muted-foreground hover:bg-muted"}`}>
                          {lvl === "write" ? "FULL" : "READ"}
                        </button>
                      ))}
                      <button type="button" onClick={() => remove(k)} title="Hapus izin"
                        className="p-1 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Combobox options={options} value="" onChange={add} placeholder="+ Tambah fitur…" searchPlaceholder="Cari fitur…" />
              </div>
              <Button size="sm" disabled={!dirty || saveMut.isPending} loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
                Simpan
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PermissionsTab({ role, user }: any) {
  const groups = Array.from(new Set(VISIBLE_PERMISSIONS.map((p) => p.group)));
  const grantedCount = role ? Object.values(role.permissions ?? {}).filter((v) => v !== "none").length : 0;

  return (
    <div className="space-y-4">
      {user && <SpecialAccessEditor user={user} />}

      {!role ? (
        <div className="py-8 text-center">
          <Shield className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
          <div className="font-semibold text-sm">Belum ada role yang di-assign</div>
          <div className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">Edit user dan pilih role untuk melihat permissions dari role.</div>
        </div>
      ) : (
      <>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-sky-500 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{role.name}</div>
              {role.description && <div className="text-xs text-muted-foreground mt-0.5">{role.description}</div>}
              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                <span><strong className="text-foreground">{grantedCount}</strong> dari {ALL_PERMISSIONS.length} fitur</span>
                {role.canSeeAllData && (
                  <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded font-semibold">
                    Supervisor (lihat semua data)
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {groups.map((group) => {
        const items = VISIBLE_PERMISSIONS.filter((p) => p.group === group);
        const hasAny = items.some((i) => (role.permissions[i.key] ?? "none") !== "none");
        if (!hasAny) return null;
        return (
          <div key={group}>
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">{group}</h3>
            <div className="space-y-1">
              {items.map((p) => {
                const lvl = role.permissions[p.key] ?? "none";
                if (lvl === "none") return null;
                return (
                  <div key={p.key} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-md bg-muted/40">
                    <span className="text-sm">{p.label}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      lvl === "write" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                    }`}>
                      {lvl === "write" ? "READ + WRITE" : "READ ONLY"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      </>
      )}
    </div>
  );
}

// =====================================================================
// FORM DIALOGS
// =====================================================================
function UserFormDialog({ open, onClose, initial, roles, onSaved }: any) {
  const isEdit = !!initial;
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (open) {
      if (initial) {
        setForm({
          name: initial.name, username: initial.username, email: initial.email ?? "",
          phone: initial.phone ?? "", roleId: initial.roleId ?? "",
          isActive: initial.isActive !== 0,
          position: initial.position ?? "", department: initial.department ?? "",
          branch: initial.branch ?? "", employeeId: initial.employeeId ?? "",
          address: initial.address ?? "", joinDate: initial.joinDate ?? "",
          birthDate: initial.birthDate ?? "", emergencyContact: initial.emergencyContact ?? "",
          notes: initial.notes ?? "", password: "",
        });
      } else {
        setForm({
          name: "", username: "", email: "", phone: "", roleId: "",
          isActive: true, position: "", department: "", branch: "",
          employeeId: "", address: "", joinDate: "", birthDate: "",
          emergencyContact: "", notes: "", password: "",
        });
      }
    }
  }, [open, initial?.id]);

  const mut = useMutation({
    mutationFn: (data: any) => isEdit
      ? api.put(`/users/${initial.id}`, data)
      : api.post(`/users`, data),
    onSuccess: () => { toast.success(isEdit ? "User diupdate" : "User dibuat"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.name?.trim() || !form.username?.trim()) { toast.error("Nama dan username wajib"); return; }
    if (!isEdit && (!form.password || form.password.length < 6)) { toast.error("Password min 6 karakter"); return; }
    if (!form.roleId) { toast.error("Pilih role dulu"); return; }
    const payload: any = { ...form };
    payload.roleId = Number(form.roleId);
    payload.isActive = form.isActive ? 1 : 0;
    if (isEdit && !payload.password) delete payload.password;
    mut.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl dialog-w max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 md:px-6 pt-5 md:pt-6 pb-3 border-b shrink-0">
          <DialogTitle>{isEdit ? "Edit User" : "Tambah User Baru"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update informasi user, role, dan status." : "Buat akun staff baru dengan role dan akses."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 md:px-6 py-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Nama Lengkap *" value={form.name ?? ""} onChange={(v) => setForm({ ...form, name: v })} placeholder="John Doe" />
            <FormField label="Username *" value={form.username ?? ""} onChange={(v) => setForm({ ...form, username: v })} placeholder="johndoe" mono />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Password" value={form.password ?? ""} onChange={(v) => setForm({ ...form, password: v })} placeholder={isEdit ? "Kosongkan jika tidak ganti" : "Min 6 karakter"} type="password" />
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role *</label>
              <Select value={String(form.roleId ?? "")} onValueChange={(v) => setForm({ ...form, roleId: v })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih role" /></SelectTrigger>
                <SelectContent>
                  {roles.map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name} {r.userCount > 0 && <span className="text-muted-foreground text-[10px] ml-1">({r.userCount} user)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Email" value={form.email ?? ""} onChange={(v) => setForm({ ...form, email: v })} placeholder="staff@jabnet.id" type="email" />
            <FormField label="Phone" value={form.phone ?? ""} onChange={(v) => setForm({ ...form, phone: v })} placeholder="08123456789" mono />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="ID Karyawan" value={form.employeeId ?? ""} onChange={(v) => setForm({ ...form, employeeId: v })} placeholder="EMP-001" mono />
            <FormField label="Posisi" value={form.position ?? ""} onChange={(v) => setForm({ ...form, position: v })} placeholder="Teknisi Lapangan" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Departemen" value={form.department ?? ""} onChange={(v) => setForm({ ...form, department: v })} placeholder="Operations" />
            <FormField label="Cabang" value={form.branch ?? ""} onChange={(v) => setForm({ ...form, branch: v })} placeholder="Garut Pusat" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Tgl Bergabung" value={form.joinDate ?? ""} onChange={(v) => setForm({ ...form, joinDate: v })} type="date" />
            <FormField label="Tgl Lahir" value={form.birthDate ?? ""} onChange={(v) => setForm({ ...form, birthDate: v })} type="date" />
          </div>

          <FormField label="Alamat" value={form.address ?? ""} onChange={(v) => setForm({ ...form, address: v })} placeholder="Jl. ..." />
          <FormField label="Kontak Darurat" value={form.emergencyContact ?? ""} onChange={(v) => setForm({ ...form, emergencyContact: v })} placeholder="Nama + nomor" />

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Catatan</label>
            <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="mt-1 text-sm" />
          </div>

          <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30">
            <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
            <div>
              <div className="font-semibold text-sm">Akun Aktif</div>
              <div className="text-[10px] text-muted-foreground">User bisa login dan akses sistem</div>
            </div>
          </label>
        </div>

        <div className="flex gap-2 justify-end px-5 md:px-6 py-3 border-t bg-muted/20 shrink-0">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSubmit} disabled={mut.isPending} className="bg-sky-600 hover:bg-sky-700">
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Simpan Perubahan" : "Buat User"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose, onSaved }: any) {
  const [pw, setPw] = useState("");
  useEffect(() => { if (user) setPw(""); }, [user?.id]);

  const mut = useMutation({
    mutationFn: () => api.put(`/users/${user.id}`, { password: pw }),
    onSuccess: () => { toast.success("Password di-reset"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!user) return null;
  return (
    <AlertDialog open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset Password</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 pt-1">
              <div className="text-sm">User: <strong className="text-foreground">{user.name}</strong> (@{user.username})</div>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password baru (min 6 karakter)" autoFocus />
              <p className="text-[10px] text-muted-foreground">Beritahu user password barunya secara aman.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={() => mut.mutate()} disabled={pw.length < 6 || mut.isPending} className="bg-amber-600 hover:bg-amber-700">
            Reset Password
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BulkRoleDialog({ open, onClose, roles, onApply, count }: any) {
  const [roleId, setRoleId] = useState<string>("");
  useEffect(() => { if (open) setRoleId(""); }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ganti Role untuk {count} User</DialogTitle>
          <DialogDescription>
            Pilih role baru. Akan diterapkan ke semua user yang dipilih.
          </DialogDescription>
        </DialogHeader>
        <Select value={roleId} onValueChange={setRoleId}>
          <SelectTrigger><SelectValue placeholder="Pilih role" /></SelectTrigger>
          <SelectContent>
            {roles.map((r: any) => (
              <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={() => onApply(Number(roleId))} disabled={!roleId} className="bg-sky-600 hover:bg-sky-700">
            Terapkan ke {count} user
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// SHARED COMPONENTS
// =====================================================================
function KpiTile({ icon, label, value, iconBg }: any) {
  return (
    <Card>
      <CardContent className="p-3 md:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
            <div className="text-2xl md:text-3xl font-bold tabular-nums mt-1">{value?.toLocaleString("id-ID") ?? 0}</div>
          </div>
          <div className={`w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center text-white shadow-sm shrink-0 ${iconBg}`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ icon, label, value }: any) {
  return (
    <div className="p-2.5 rounded-lg bg-muted/40 border">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {icon} {label}
      </div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function BigMetric({ label, value, sublabel, tone }: any) {
  const colors: Record<string, string> = {
    sky: "text-sky-600 dark:text-sky-400",
    indigo: "text-indigo-600 dark:text-indigo-400",
    amber: "text-amber-600 dark:text-amber-400",
    violet: "text-violet-600 dark:text-violet-400",
    rose: "text-rose-600 dark:text-rose-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
  };
  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums mt-1 ${colors[tone] ?? ""}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sublabel}</div>
    </div>
  );
}

function DetailRow({ icon, label, value, mono }: any) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0 grid grid-cols-3 gap-2">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className={`col-span-2 text-sm break-words ${mono ? "font-mono" : ""} ${value ? "" : "text-muted-foreground italic"}`}>
          {value || "-"}
        </div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, type = "text", mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; mono?: boolean }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`mt-1 ${mono ? "font-mono" : ""}`} />
    </div>
  );
}
