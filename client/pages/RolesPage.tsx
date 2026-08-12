import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { ALL_PERMISSIONS, ALL_PERMISSION_KEYS, EDITOR_HIDDEN_KEYS } from "@shared/schema";

// Preview surfaces hide dead/no-effect keys (see EDITOR_HIDDEN_KEYS).
const VISIBLE_PERMISSIONS = ALL_PERMISSIONS.filter((p) => !EDITOR_HIDDEN_KEYS.has(p.key));
import { resolveDefaultPreset } from "@shared/rolePresets";
import { useApplicablePresets } from "@/hooks/useRolePresets";
import { PermissionMatrixEditor, LEVEL_CFG } from "@/components/roles/PermissionMatrixEditor";
import { RolePresetDialog, ICONS as PRESET_ICONS } from "@/components/roles/RolePresetDialog";
import { useManageablePresets, useRolePresetMutations, type RolePresetDTO } from "@/hooks/useRolePresets";
import { EmptyState } from "@/components/ui/empty-state";
import { FullBleedPage } from "@/components/ui/full-bleed-page";
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
import { toast } from "sonner";
import {
  ShieldCheck, Lock, Eye, Plus, Edit3, Trash2,
  Users as UsersIcon, Loader2, Crown, Check, X, Shield, ChevronRight,
  RefreshCw, Sparkles, AlertCircle, Star, Globe, Power, Layers,
} from "lucide-react";

type PermissionLevel = "none" | "read" | "write";

interface RoleItem {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  canSeeAllData: boolean;
  permissions: Record<string, PermissionLevel>;
  userCount?: number;
  createdAt: string | null;
  updatedAt: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function permStats(perms: Record<string, PermissionLevel>) {
  let none = 0, read = 0, write = 0;
  for (const k of ALL_PERMISSION_KEYS) {
    const v = perms[k] ?? "none";
    if (v === "write") write++;
    else if (v === "read") read++;
    else none++;
  }
  return { none, read, write, granted: read + write };
}

// =====================================================================
export default function RolesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [previewFor, setPreviewFor] = useState<RoleItem | null>(null);
  const [editFor, setEditFor] = useState<RoleItem | null>(null);
  const [deleteFor, setDeleteFor] = useState<RoleItem | null>(null);
  const [usersForRole, setUsersForRole] = useState<RoleItem | null>(null);
  const [view, setView] = useState<"roles" | "presets">("roles");
  const [presetDialog, setPresetDialog] = useState<{ open: boolean; initial: RolePresetDTO | null }>({ open: false, initial: null });
  const [deletePreset, setDeletePreset] = useState<RolePresetDTO | null>(null);
  const canManage = !!user?.isSystemAdmin || user?.roleName === "Admin" || user?.roleName === "System-Admin" || user?.role === "admin" || user?.role === "Administrator";

  const { data: roles = [], isLoading } = useQuery<RoleItem[]>({
    queryKey: ["/api/roles"],
    queryFn: () => api.get<RoleItem[]>("/roles"),
    refetchInterval: 60_000,
  });

  const { data: presets = [] } = useManageablePresets(view === "presets" && canManage);
  const presetMut = useRolePresetMutations();

  const totalUsers = roles.reduce((sum, r) => sum + (r.userCount ?? 0), 0);
  const systemRoles = roles.filter((r) => r.isSystem).length;
  const customRoles = roles.length - systemRoles;

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/roles/${id}`),
    onSuccess: () => {
      toast.success("Role dihapus. User di-reassign ke Read Only.");
      qc.invalidateQueries({ queryKey: ["/api/roles"] });
      setDeleteFor(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Access guard AFTER all hooks (Rules of Hooks: hooks must run unconditionally every render).
  if (user?.role !== "admin" && !user?.isSystemAdmin) {
    return (
      <div className="p-8 text-center">
        <Lock className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
        <h2 className="text-xl font-semibold">Akses Ditolak</h2>
        <p className="text-sm text-muted-foreground mt-1">Halaman ini hanya untuk administrator.</p>
      </div>
    );
  }

  return (
    <FullBleedPage>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 md:px-6 pt-4 md:pt-6 pb-4 space-y-4 shrink-0 bg-background border-b">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 md:gap-4 min-w-0 flex-1">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shrink-0">
              <ShieldCheck className="h-5 w-5 md:h-6 md:w-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">Manajemen Role & Akses</h1>
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5 md:mt-1">
                <span className="hidden md:inline">Definisikan role + permission per fitur (read/write). User akan dapat akses sesuai role yang di-assign.</span>
                <span className="md:hidden">Role + permission per fitur</span>
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: view === "presets" ? ["/api/role-presets"] : ["/api/roles"] })} className="h-9 w-9 p-0 md:w-auto md:px-3">
              <RefreshCw className="h-4 w-4" />
              <span className="hidden md:inline ml-1.5">Muat Ulang</span>
            </Button>
            {view === "roles" ? (
              <Button size="sm" onClick={() => setCreateOpen(true)} className="bg-violet-600 hover:bg-violet-700">
                <Plus className="h-4 w-4 md:mr-1.5" />
                <span className="hidden md:inline">Buat Role Baru</span>
                <span className="md:hidden">Buat</span>
              </Button>
            ) : (
              <Button size="sm" onClick={() => setPresetDialog({ open: true, initial: null })} className="bg-violet-600 hover:bg-violet-700">
                <Plus className="h-4 w-4 md:mr-1.5" />
                <span className="hidden md:inline">Buat Preset</span>
                <span className="md:hidden">Buat</span>
              </Button>
            )}
          </div>
        </div>

        {/* Segmented toggle: Role | Preset */}
        {canManage && (
          <nav role="tablist" aria-label="Tampilan" className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/50 border w-fit">
            <button
              type="button"
              role="tab"
              aria-selected={view === "roles"}
              onClick={() => setView("roles")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                view === "roles" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Shield className="h-3.5 w-3.5" /> Role
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "presets"}
              onClick={() => setView("presets")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                view === "presets" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <Layers className="h-3.5 w-3.5" /> Preset
            </button>
          </nav>
        )}

        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          <KpiTile icon={<Shield className="h-4 w-4" />} label="Total Role" value={roles.length} iconBg="bg-violet-500" />
          <KpiTile icon={<Crown className="h-4 w-4" />} label="System Role" value={systemRoles} iconBg="bg-amber-500" />
          <KpiTile icon={<Sparkles className="h-4 w-4" />} label="Custom Role" value={customRoles} iconBg="bg-sky-500" />
          <KpiTile icon={<UsersIcon className="h-4 w-4" />} label="Total User" value={totalUsers} iconBg="bg-emerald-500" />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 md:overflow-y-auto px-4 md:px-6 py-4">
        {view === "presets" ? (
          presets.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="Belum ada preset"
              description="Buat preset untuk mempercepat pembuatan role baru."
              action={{ label: "Buat Preset", onClick: () => setPresetDialog({ open: true, initial: null }) }}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {presets.map((p) => (
                <PresetCard
                  key={p.id}
                  preset={p}
                  busy={presetMut.update.isPending || presetMut.setDefault.isPending}
                  onToggleActive={() => presetMut.update.mutate({ id: p.id, isActive: p.isActive ? 0 : 1 })}
                  onSetDefault={() => presetMut.setDefault.mutate(p.id)}
                  onEdit={() => setPresetDialog({ open: true, initial: p })}
                  onDelete={() => setDeletePreset(p)}
                />
              ))}
            </div>
          )
        ) : isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : roles.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Shield className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
              <div className="font-semibold text-sm">Belum ada role</div>
              <div className="text-xs text-muted-foreground mt-1">Klik "Buat" untuk mulai</div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {roles.map((r) => (
              <RoleCard
                key={r.id}
                role={r}
                onPreview={() => setPreviewFor(r)}
                onEdit={() => setEditFor(r)}
                onDelete={() => setDeleteFor(r)}
                onViewUsers={() => setUsersForRole(r)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <RolePreviewDialog role={previewFor} onClose={() => setPreviewFor(null)} onEdit={() => { setEditFor(previewFor); setPreviewFor(null); }} />

      <RoleFormDialog
        open={createOpen} onClose={() => setCreateOpen(false)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/roles"] }); setCreateOpen(false); }}
      />

      <RoleFormDialog
        open={!!editFor} onClose={() => setEditFor(null)}
        initial={editFor}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["/api/roles"] }); setEditFor(null); }}
      />

      <AlertDialog open={!!deleteFor} onOpenChange={(o) => { if (!o) setDeleteFor(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Role "{deleteFor?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFor?.userCount && deleteFor.userCount > 0
                ? <span><strong>{deleteFor.userCount} user</strong> yang punya role ini akan otomatis di-reassign ke Read Only. Tindakan ini tidak bisa di-undo.</span>
                : "Role ini tidak dipakai user. Aman untuk dihapus."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteFor && deleteMut.mutate(deleteFor.id)} className="bg-rose-600 hover:bg-rose-700">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RoleUsersDialog role={usersForRole} onClose={() => setUsersForRole(null)} />

      <RolePresetDialog
        open={presetDialog.open}
        initial={presetDialog.initial}
        onClose={() => setPresetDialog({ open: false, initial: null })}
        onSaved={() => setPresetDialog({ open: false, initial: null })}
      />

      <AlertDialog open={!!deletePreset} onOpenChange={(o) => { if (!o) setDeletePreset(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Preset "{deletePreset?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Preset ini akan dihapus permanen. Role yang sudah dibuat dari preset ini tidak terpengaruh.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletePreset) {
                  presetMut.remove.mutate(deletePreset.id, {
                    onSuccess: () => toast.success("Preset dihapus"),
                    onError: (e: any) => toast.error(e.message),
                  });
                }
                setDeletePreset(null);
              }}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FullBleedPage>
  );
}

// =====================================================================
// PRESET CARD
// =====================================================================
function PresetCard({ preset, busy, onToggleActive, onSetDefault, onEdit, onDelete }: {
  preset: RolePresetDTO;
  busy: boolean;
  onToggleActive: () => void;
  onSetDefault: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = (preset.icon && PRESET_ICONS[preset.icon]) || Shield;
  const granted = ALL_PERMISSION_KEYS.reduce((n, k) => n + ((preset.permissions[k] ?? "none") !== "none" ? 1 : 0), 0);
  const isSystem = preset.isSystem === 1;
  const isActive = preset.isActive === 1;
  const isDefault = preset.isDefault === 1;
  return (
    <Card className={`hover:shadow-md transition-shadow ${isActive ? "" : "opacity-70"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-bold text-sm truncate">{preset.name}</h3>
                {isDefault && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
              </div>
              {preset.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{preset.description}</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <Badge variant={preset.scope === "global" ? "default" : "secondary"} className="text-[10px] gap-1">
            {preset.scope === "global" ? <Globe className="h-3 w-3" /> : <UsersIcon className="h-3 w-3" />}
            {preset.scope === "global" ? "Global" : "Tenant"}
          </Badge>
          {isSystem && (
            <Badge variant="outline" className="text-[10px] gap-1"><Lock className="h-3 w-3" /> Sistem</Badge>
          )}
          <span className="text-[10px] text-muted-foreground ml-auto tabular-nums">{granted} / {ALL_PERMISSION_KEYS.length} fitur</span>
        </div>

        <div className="flex gap-1.5 pt-2 border-t">
          <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={onToggleActive} disabled={busy}>
            <Power className="h-3 w-3 mr-1" /> {isActive ? "Nonaktif" : "Aktifkan"}
          </Button>
          {!isDefault && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onSetDefault} disabled={busy}>
              <Star className="h-3 w-3 mr-1" /> Default
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={onEdit}>
            <Edit3 className="h-3.5 w-3.5" />
          </Button>
          {!isSystem && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// ROLE CARD
// =====================================================================
function RoleCard({ role, onPreview, onEdit, onDelete, onViewUsers }: any) {
  const { user } = useAuth();
  const stats = useMemo(() => permStats(role.permissions), [role.permissions]);
  const pct = (stats.granted / ALL_PERMISSION_KEYS.length) * 100;
  // Role Admin bawaan terkunci: hanya platform owner (System-Admin) yang boleh edit. Admin mitra: read-only.
  const isLockedAdmin = role.isSystem && (role.name === "Admin" || role.name === "System-Admin" || role.name === "Administrator");
  const canEdit = !isLockedAdmin || !!user?.isSystemAdmin;
  return (
    <Card className={`hover:shadow-md transition-shadow ${role.name === "System-Admin" ? "border-red-500/40 bg-red-50/30 dark:bg-red-950/10" : ""}`}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              role.name === "System-Admin" ? "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400" :
              role.isSystem ? "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400" : "bg-violet-100 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400"
            }`}>
              {role.name === "System-Admin" ? <ShieldCheck className="h-4 w-4" /> : role.isSystem ? <Crown className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm truncate">{role.name}</h3>
                {role.name === "System-Admin" && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded">
                    SYSTEM
                  </span>
                )}
                {role.isSystem && role.name !== "System-Admin" && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
                    SYSTEM
                  </span>
                )}
                {role.canSeeAllData && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400" title="Supervisor - bisa lihat data semua user">
                    SUPERVISOR
                  </span>
                )}
              </div>
              {role.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{role.description}</p>}
            </div>
          </div>
        </div>

        {/* User count */}
        <button
          onClick={onViewUsers}
          className="w-full flex items-center justify-between p-2 rounded-md bg-muted/30 hover:bg-muted transition-colors mb-3 group"
        >
          <div className="flex items-center gap-2">
            <UsersIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs">
              <strong className="text-foreground tabular-nums">{role.userCount ?? 0}</strong> user
            </span>
          </div>
          <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Permissions summary bar */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground font-semibold">PERMISSIONS</span>
            <span className="text-muted-foreground tabular-nums">{stats.granted} / {ALL_PERMISSION_KEYS.length}</span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500" style={{ width: `${(stats.write / ALL_PERMISSION_KEYS.length) * 100}%` }} />
            <div className="h-full bg-sky-500" style={{ width: `${(stats.read / ALL_PERMISSION_KEYS.length) * 100}%` }} />
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {stats.write} full
            </span>
            <span className="inline-flex items-center gap-1 text-sky-600">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-500" /> {stats.read} read
            </span>
            <span className="text-muted-foreground ml-auto tabular-nums">{pct.toFixed(0)}%</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5 pt-2 border-t">
          <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={onPreview}>
            <Eye className="h-3 w-3 mr-1" /> {canEdit ? "Preview" : "Lihat"}
          </Button>
          {canEdit && (
            <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={onEdit}>
              <Edit3 className="h-3 w-3 mr-1" /> Edit
            </Button>
          )}
          {!role.isSystem && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// PREVIEW DIALOG - read-only view of all permissions per group
// =====================================================================
function RolePreviewDialog({ role, onClose, onEdit }: any) {
  if (!role) return null;
  const groups = Array.from(new Set(VISIBLE_PERMISSIONS.map((p) => p.group)));
  const stats = permStats(role.permissions);
  return (
    <Dialog open={!!role} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <div className="px-5 md:px-6 pt-5 md:pt-6 pb-4 border-b shrink-0 bg-gradient-to-br from-violet-500 to-purple-700 text-white">
          <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-white/15">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl md:text-2xl font-bold">{role.name}</h2>
            {role.isSystem && (
              <span className="px-1.5 py-0.5 bg-white/20 rounded text-[10px] font-bold uppercase tracking-widest">SYSTEM</span>
            )}
          </div>
          {role.description && <p className="text-sm opacity-90">{role.description}</p>}
          <div className="flex items-center gap-4 mt-3 text-xs">
            <span><strong className="text-base tabular-nums">{stats.granted}</strong>/{ALL_PERMISSION_KEYS.length} fitur</span>
            <span><strong className="text-base tabular-nums">{stats.write}</strong> full access</span>
            <span><strong className="text-base tabular-nums">{stats.read}</strong> read only</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4 space-y-4">
          {role.canSeeAllData && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Mode Supervisor aktif</strong> - role ini bisa melihat data semua user (bukan hanya datanya sendiri).
              </div>
            </div>
          )}

          {groups.map((group) => {
            const items = VISIBLE_PERMISSIONS.filter((p) => p.group === group);
            const granted = items.filter((i) => (role.permissions[i.key] ?? "none") !== "none");
            return (
              <div key={group}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{group}</h3>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{granted.length}/{items.length}</span>
                </div>
                <div className="space-y-1">
                  {items.map((p) => {
                    const lvl = (role.permissions[p.key] ?? "none") as PermissionLevel;
                    const cfg = LEVEL_CFG[lvl];
                    return (
                      <div key={p.key} className={`flex items-center justify-between gap-2 py-1.5 px-3 rounded-md ${
                        lvl === "none" ? "opacity-50" : "bg-muted/30"
                      }`}>
                        <span className="text-sm">{p.label}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 justify-end px-5 md:px-6 py-3 border-t bg-muted/20 shrink-0">
          <Button variant="outline" onClick={onClose}>Tutup</Button>
          <Button onClick={onEdit} className="bg-violet-600 hover:bg-violet-700">
            <Edit3 className="h-3.5 w-3.5 mr-1.5" /> Edit Role
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// FORM DIALOG (create + edit) - group-by-group permission matrix
// =====================================================================
function RoleFormDialog({ open, onClose, initial, onSaved }: any) {
  const isEdit = !!initial;
  const isSystem = initial?.isSystem ?? false;
  const { user } = useAuth();
  const { data: applicablePresets = [] } = useApplicablePresets();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [canSeeAllData, setCanSeeAllData] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, PermissionLevel>>({});
  const defaultAppliedRef = useRef(false);

  useEffect(() => {
    if (open) {
      defaultAppliedRef.current = false;
      if (initial) {
        setName(initial.name);
        setDescription(initial.description ?? "");
        setCanSeeAllData(initial.canSeeAllData);
        setPermissions({ ...initial.permissions });
      } else {
        setName("");
        setDescription("");
        setCanSeeAllData(false);
        const empty: Record<string, PermissionLevel> = {};
        for (const k of ALL_PERMISSION_KEYS) empty[k] = "none";
        setPermissions(empty);
      }
    }
  }, [open, initial?.id]);

  // Pre-apply the resolved default preset on a NEW role form, once presets have loaded.
  // Runs at most once per open so it never clobbers the user's edits.
  useEffect(() => {
    if (!open || initial || defaultAppliedRef.current || applicablePresets.length === 0) return;
    const def = resolveDefaultPreset(
      applicablePresets.map((p) => ({ id: p.id, scope: p.scope, mitraId: p.mitraId, isActive: p.isActive, isDefault: p.isDefault, permissions: p.permissions })),
      user?.activeMitraId ?? 1,
    );
    if (def) setPermissions({ ...def.permissions });
    defaultAppliedRef.current = true;
  }, [open, initial, applicablePresets, user?.activeMitraId]);

  const mut = useMutation({
    mutationFn: (data: any) => isEdit ? api.put(`/roles/${initial.id}`, data) : api.post(`/roles`, data),
    onSuccess: () => { toast.success(isEdit ? "Role diupdate" : "Role dibuat"); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!name.trim() || name.trim().length < 2) { toast.error("Nama minimal 2 karakter"); return; }
    mut.mutate({ name: name.trim(), description: description.trim(), canSeeAllData, permissions });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 md:px-6 pt-5 md:pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? <Edit3 className="h-5 w-5 text-violet-500" /> : <Plus className="h-5 w-5 text-violet-500" />}
            {isEdit ? `Edit Role: ${initial.name}` : "Buat Role Baru"}
          </DialogTitle>
          <DialogDescription>
            {isSystem
              ? "Role bawaan - nama tidak bisa diubah, tapi permissions bisa di-tune."
              : "Definisikan permission per fitur. User akan dapat akses sesuai role yang dipilih."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4 space-y-4">
          {/* Basic info */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nama Role *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Teknisi Senior, SPV Marketing, dll" disabled={isSystem} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deskripsi</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Apa peran dan tanggung jawab role ini?" rows={2} className="mt-1 text-sm" />
            </div>
            <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30">
              <input type="checkbox" checked={canSeeAllData} onChange={(e) => setCanSeeAllData(e.target.checked)} className="mt-0.5" disabled={isSystem && (initial?.name === "System-Admin" || initial?.name === "Admin")} />
              <div>
                <div className="font-semibold text-sm flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-amber-500" /> Mode Supervisor
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Role ini bisa <strong>melihat data semua user</strong> (bukan cuma datanya sendiri). Cocok untuk SPV/manajer.
                </div>
              </div>
            </label>
          </div>

          {/* Quick presets */}
          {!isEdit && (
            <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 border border-sky-200/50 dark:border-sky-900/50">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-3.5 w-3.5 text-sky-600" />
                <span className="text-xs font-semibold">Quick Presets</span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {applicablePresets.length === 0 && (
                  <span className="text-[11px] text-muted-foreground">Belum ada preset.</span>
                )}
                {applicablePresets.map((p) => (
                  <Button key={p.id} size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPermissions({ ...p.permissions })}>
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const s = permStats(permissions);
            return (
              <p className="text-xs text-muted-foreground px-1">
                <strong className="tabular-nums text-foreground">{s.granted}</strong> dari {ALL_PERMISSION_KEYS.length} fitur diberikan akses
                <span className="ml-2">({s.write} full · {s.read} read · {s.none} none)</span>
              </p>
            );
          })()}
          <PermissionMatrixEditor
            value={permissions}
            onChange={setPermissions}
            disabled={isSystem && (initial?.name === "System-Admin" || initial?.name === "Admin")}
          />
        </div>

        <div className="flex gap-2 justify-end px-5 md:px-6 py-3 border-t bg-muted/20 shrink-0">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSubmit} disabled={mut.isPending} className="bg-violet-600 hover:bg-violet-700">
            {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Simpan Perubahan" : "Buat Role"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// USERS-IN-ROLE DIALOG
// =====================================================================
function RoleUsersDialog({ role, onClose }: any) {
  const { data: users = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/roles", role?.id, "users"],
    queryFn: () => api.get<any[]>(`/roles/${role.id}/users`),
    enabled: !!role,
  });

  if (!role) return null;
  return (
    <Dialog open={!!role} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[80vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 md:px-6 pt-5 md:pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5 text-violet-500" />
            User dengan Role "{role.name}"
          </DialogTitle>
          <DialogDescription>
            {users.length} user assigned · klik untuk lihat detail
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : users.length === 0 ? (
            <div className="py-12 text-center px-4">
              <UsersIcon className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
              <div className="font-semibold text-sm">Belum ada user dengan role ini</div>
              <div className="text-xs text-muted-foreground mt-1">Assign user via halaman User Management</div>
            </div>
          ) : (
            <ul className="divide-y">
              {users.map((u) => (
                <li key={u.id} className="px-4 py-3 hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {u.name.split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm truncate">{u.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">@{u.username} · {u.position ?? "-"}</div>
                    </div>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${u.isActive === 1 ? "bg-emerald-500" : "bg-slate-400"}`} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
