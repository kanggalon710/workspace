import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { ALL_FEATURES } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Plus, Edit3, Loader2, Users as UsersIcon, X, Mail, Phone, MapPin, Globe, User, Lock, Layers, Zap, Info } from "lucide-react";
import { Switch, InfoRow, FF, getInitials, slugify, fmtDate, type MitraItem, type SafeUser, type DetailTab } from "./shared";

export function MitraDetailDrawer({ mitra, canEdit, onClose, onSaved }: {
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
      <DialogContent className="max-w-2xl dialog-w max-h-[90vh] overflow-hidden flex flex-col p-0">
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
export function OverviewTab({ mitra, canEdit, onSaved }: { mitra: MitraItem; canEdit: boolean; onSaved: () => void }) {
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
export function FeaturesTab({ mitra, canEdit, onSaved }: { mitra: MitraItem; canEdit: boolean; onSaved: () => void }) {
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
export function MembersTab({ mitra, canEdit }: { mitra: MitraItem; canEdit: boolean }) {
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
