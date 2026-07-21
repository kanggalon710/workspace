import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Shield, Wrench, Megaphone, Wallet, Eye, Users, Star, KeyRound,
  Loader2, type LucideIcon,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/AuthContext";
import { ALL_PERMISSION_KEYS, type PermissionLevel } from "@shared/schema";
import { PermissionMatrixEditor } from "@/components/roles/PermissionMatrixEditor";
import { useRolePresetMutations, type RolePresetDTO } from "@/hooks/useRolePresets";

export const ICONS: Record<string, LucideIcon> = {
  shield: Shield,
  wrench: Wrench,
  megaphone: Megaphone,
  wallet: Wallet,
  eye: Eye,
  users: Users,
  star: Star,
  key: KeyRound,
};

const COLORS = ["primary", "success", "warning", "danger", "info", "violet", "neutral"];
const COLOR_BG: Record<string, string> = {
  primary: "bg-primary/15", success: "bg-success/15", warning: "bg-warning/15",
  danger: "bg-destructive/15", info: "bg-info/15", violet: "bg-violet-500/15", neutral: "bg-muted",
};

function emptyPermissions(): Record<string, PermissionLevel> {
  const m: Record<string, PermissionLevel> = {};
  for (const k of ALL_PERMISSION_KEYS) m[k] = "none";
  return m;
}

interface Props {
  open: boolean;
  onClose: () => void;
  initial?: RolePresetDTO | null;
  onSaved: () => void;
}

export function RolePresetDialog({ open, onClose, initial, onSaved }: Props) {
  const { user } = useAuth();
  const isEdit = !!initial;
  const isSystem = initial?.isSystem === 1;
  const canEditMatrix = !isSystem || !!user?.isSystemAdmin;
  const canUseGlobal = !!user?.isSystemAdmin && user?.activeMitraId === 1;

  const { create, update, setDefault } = useRolePresetMutations();
  const saving = create.isPending || update.isPending || setDefault.isPending;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("shield");
  const [color, setColor] = useState("primary");
  const [scope, setScope] = useState<"tenant" | "global">("tenant");
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [permissions, setPermissions] = useState<Record<string, PermissionLevel>>(emptyPermissions());

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setDescription(initial.description ?? "");
      setIcon(initial.icon ?? "shield");
      setColor(initial.color ?? "primary");
      setScope(initial.scope);
      setIsActive(initial.isActive === 1);
      setIsDefault(initial.isDefault === 1);
      setPermissions({ ...emptyPermissions(), ...initial.permissions });
    } else {
      setName("");
      setDescription("");
      setIcon("shield");
      setColor("primary");
      setScope("tenant");
      setIsActive(true);
      setIsDefault(false);
      setPermissions(emptyPermissions());
    }
  }, [open, initial?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { toast.error("Nama minimal 2 karakter"); return; }
    try {
      if (isEdit && initial) {
        await update.mutateAsync({
          id: initial.id,
          name: name.trim(),
          description: description.trim() || null,
          icon,
          color,
          isActive: isActive ? 1 : 0,
          permissions,
        });
        // PUT doesn't set default - use the dedicated endpoint when toggled on.
        if (isDefault && initial.isDefault !== 1) {
          await setDefault.mutateAsync(initial.id);
        }
        toast.success("Preset diupdate");
      } else {
        await create.mutateAsync({
          name: name.trim(),
          description: description.trim() || null,
          icon,
          color,
          scope,
          isActive: isActive ? 1 : 0,
          isDefault: isDefault ? 1 : 0,
          permissions,
        });
        toast.success("Preset dibuat");
      }
      onSaved();
    } catch (err: any) {
      toast.error(err?.message || "Gagal menyimpan preset");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[92vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 md:px-6 pt-5 md:pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-violet-500" />
            {isEdit ? `Edit Preset: ${initial?.name}` : "Buat Preset Role"}
          </DialogTitle>
          <DialogDescription>
            {isSystem
              ? "Preset bawaan sistem - permission hanya bisa diubah oleh platform owner."
              : "Preset jadi template cepat saat membuat role baru."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4 space-y-4">
            {/* Name */}
            <div>
              <label htmlFor="preset-name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nama Preset *</label>
              <Input
                id="preset-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Teknisi, SPV Marketing, Read Only…"
                disabled={isSystem}
                className="mt-1"
              />
            </div>

            {/* Description */}
            <div>
              <label htmlFor="preset-desc" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deskripsi</label>
              <Textarea
                id="preset-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Untuk apa preset ini dipakai?"
                rows={2}
                className="mt-1 text-sm"
              />
            </div>

            {/* Icon */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ikon</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {Object.entries(ICONS).map(([key, I]) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={key}
                    onClick={() => setIcon(key)}
                    className={`size-9 rounded-md border flex items-center justify-center transition-all ${
                      icon === key ? "border-primary bg-primary/10 ring-2 ring-primary/40" : "border-border hover:bg-muted"
                    }`}
                  >
                    <I className="size-4" />
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Warna</label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => setColor(c)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      color === c ? "border-foreground" : "border-border"
                    } ${COLOR_BG[c] ?? "bg-muted"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Scope */}
            <div>
              <label htmlFor="preset-scope" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cakupan</label>
              <select
                id="preset-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value as "tenant" | "global")}
                disabled={isEdit || !canUseGlobal}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <option value="tenant">Tenant (hanya mitra ini)</option>
                {canUseGlobal && <option value="global">Global (semua mitra)</option>}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {isEdit ? "Cakupan tidak bisa diubah setelah preset dibuat." : "Global hanya tersedia untuk platform owner."}
              </p>
            </div>

            {/* Active + Default */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer hover:bg-muted/30">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="mt-0.5" />
                <div>
                  <div className="font-semibold text-sm">Aktif</div>
                  <div className="text-[11px] text-muted-foreground">Tampil sebagai pilihan saat buat role.</div>
                </div>
              </label>
              <label className="flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer hover:bg-muted/30">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="mt-0.5" />
                <div>
                  <div className="font-semibold text-sm flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-amber-500" /> Default</div>
                  <div className="text-[11px] text-muted-foreground">Dipakai otomatis untuk role baru.</div>
                </div>
              </label>
            </div>

            {/* Permission matrix */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Permissions</label>
              <div className="mt-2">
                <PermissionMatrixEditor
                  value={permissions}
                  onChange={setPermissions}
                  disabled={!canEditMatrix}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end px-5 md:px-6 py-3 border-t bg-muted/20 shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={saving} className="bg-violet-600 hover:bg-violet-700">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEdit ? "Simpan Perubahan" : "Buat Preset"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
