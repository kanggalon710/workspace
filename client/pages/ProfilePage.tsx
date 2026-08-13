import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { roleLabel } from "@/lib/roleLabel";
import {
  User as UserIcon, Save, Loader2, KeyRound, Eye, EyeOff,
  Calendar, Clock, Shield, ShieldCheck, MapPinned, Star,
  CheckCircle2, AlertTriangle, CircleUser, Mail, Phone, MapPin,
  Briefcase, Building2, Hash, Cake, PhoneCall, Pencil, X,
  FileText, CircleCheck, Info,
  Camera, Trash2, Send, Copy, ExternalLink, Unlink, Zap,
} from "lucide-react";

interface MeResponse {
  id: number;
  username: string;
  name: string;
  role: string | null;
  roleName?: string | null;
  isActive: number | null;
  createdAt: string | null;
  lastLogin: string | null;
  email: string | null;
  phone: string | null;
  employeeId: string | null;
  position: string | null;
  department: string | null;
  branch: string | null;
  address: string | null;
  joinDate: string | null;
  birthDate: string | null;
  emergencyContact: string | null;
  notes: string | null;
  hasPhoto?: boolean;
  photoUrl?: string | null;
  telegramChatId?: string | null;
  telegramUsername?: string | null;
  telegramLinkedAt?: string | null;
  telegramPrefs?: string | null;
}

// Telegram event keys (harus sync dengan server/telegram.ts TELEGRAM_EVENT_DEFAULTS)
const TELEGRAM_EVENTS: { key: string; label: string }[] = [
  { key: "lead_assigned", label: "Lead baru di-assign ke saya" },
  { key: "lead_hot", label: "Lead pindah ke stage Hot / Won" },
  { key: "canvassing_report", label: "Canvassing report baru di area saya" },
  { key: "sahabat_referral", label: "Referral Sahabat baru" },
  { key: "collection_promise", label: "Janji bayar jatuh tempo / diupdate" },
  { key: "ticket_assigned", label: "Ticket baru di-assign ke saya" },
];

/**
 * Resize image ke max 256x256 square + JPEG quality 0.85.
 * Return data URL, ~50-150KB typical.
 */
async function resizeImageToDataUrl(file: File, maxSize = 256, quality = 0.85): Promise<string> {
  if (!/^image\/(jpeg|jpg|png|webp)$/.test(file.type)) {
    throw new Error("Format harus JPG, PNG, atau WebP");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Gagal baca file"));
    r.onload = () => resolve(String(r.result));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onerror = () => reject(new Error("File bukan gambar valid"));
    i.onload = () => resolve(i);
    i.src = dataUrl;
  });
  // Crop to square (center)
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = maxSize;
  canvas.height = maxSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak didukung di browser ini");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
  return canvas.toDataURL("image/jpeg", quality);
}

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: any; desc: string }> = {
  "System-Admin": { label: "System Admin",         color: "text-destructive",      icon: ShieldCheck, desc: "Akses cross-tenant (JABNET pusat)" },
  "Admin":        { label: "Admin",                color: "text-blue-600 dark:text-blue-400",    icon: Shield,      desc: "Akses penuh di satu mitra" },
  admin:          { label: "Administrator (legacy)", color: "text-destructive",     icon: ShieldCheck, desc: "Legacy admin - akan diganti System-Admin" },
  "Administrator":{ label: "Administrator (legacy)", color: "text-destructive",     icon: ShieldCheck, desc: "Legacy admin - akan diganti System-Admin" },
  operator:      { label: "Operator",              color: "text-blue-600 dark:text-blue-400",    icon: Shield,      desc: "Kelola aset jaringan FTTH" },
  marketing:     { label: "Marketing",             color: "text-purple-600 dark:text-purple-400", icon: MapPinned,  desc: "Canvassing & lead sales" },
  marketing_spv: { label: "Marketing SPV",         color: "text-pink-600 dark:text-pink-400",    icon: Star,        desc: "Supervisor marketing team" },
  viewer:        { label: "Viewer",                color: "text-muted-foreground",    icon: Eye,         desc: "Akses baca saja" },
};

function formatDate(iso: string | null, withTime = false): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    return d.toLocaleString("id-ID", {
      day: "2-digit", month: "short", year: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    });
  } catch { return "-"; }
}

function relativeTime(iso: string | null): string {
  if (!iso) return "-";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "baru saja";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} menit lalu`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs} jam lalu`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} hari lalu`;
    return formatDate(iso);
  } catch { return "-"; }
}

// -- Compact stat item used in hero strip --
function StatItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="text-sm font-semibold text-foreground mt-1.5 truncate" title={value}>
        {value}
      </p>
    </div>
  );
}

// -- Clean field row: icon · label · value (strict vertical rhythm) --
function FieldRow({
  icon: Icon, label, value, mono = false,
}: { icon: any; label: string; value: string | null; mono?: boolean }) {
  const filled = !!value && value !== "-";
  return (
    <div className="flex items-center gap-3 py-3 px-1 first:pt-1 last:pb-1">
      <div className="w-9 h-9 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0 grid grid-cols-1">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">
          {label}
        </span>
        <span
          className={`text-sm mt-1.5 leading-tight truncate ${
            filled ? "text-foreground font-medium" : "text-muted-foreground/50 italic font-normal"
          } ${mono ? "font-mono" : ""}`}
          title={filled ? (value as string) : undefined}
        >
          {filled ? value : "Belum diisi"}
        </span>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, updateCachedUser } = useAuth();
  const queryClient = useQueryClient();

  const { data: me, isLoading } = useQuery<MeResponse>({
    queryKey: ["/api/auth/me"],
    queryFn: () => api.get<MeResponse>("/auth/me"),
  });

  // -- Edit mode (whole form) --
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", address: "",
    birthDate: "", emergencyContact: "",
  });

  useEffect(() => {
    if (me && editMode) {
      setForm({
        name: me.name ?? "",
        email: me.email ?? "",
        phone: me.phone ?? "",
        address: me.address ?? "",
        birthDate: me.birthDate ?? "",
        emergencyContact: me.emergencyContact ?? "",
      });
    }
  }, [me, editMode]);

  const updateMut = useMutation({
    mutationFn: (patch: Partial<typeof form>) => api.patch<MeResponse>("/auth/me", patch),
    onSuccess: (data) => {
      toast.success("Profil berhasil diperbarui");
      updateCachedUser({ name: data.name });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setEditMode(false);
    },
    onError: (e: any) => toast.error(e.message || "Gagal memperbarui profil"),
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Nama wajib diisi");
    const patch: Partial<typeof form> = {};
    if (form.name !== (me?.name ?? "")) patch.name = form.name.trim();
    if (form.email !== (me?.email ?? "")) patch.email = form.email.trim();
    if (form.phone !== (me?.phone ?? "")) patch.phone = form.phone.trim();
    if (form.address !== (me?.address ?? "")) patch.address = form.address.trim();
    if (form.birthDate !== (me?.birthDate ?? "")) patch.birthDate = form.birthDate;
    if (form.emergencyContact !== (me?.emergencyContact ?? "")) patch.emergencyContact = form.emergencyContact.trim();
    if (Object.keys(patch).length === 0) {
      toast.info("Tidak ada perubahan");
      setEditMode(false);
      return;
    }
    updateMut.mutate(patch);
  };

  // -- Profile completeness --
  const completeness = useMemo(() => {
    if (!me) return { percent: 0, done: 0, total: 6, missing: [] as string[] };
    const fields = [
      { key: "email", label: "Email", val: me.email },
      { key: "phone", label: "No. HP", val: me.phone },
      { key: "birthDate", label: "Tanggal lahir", val: me.birthDate },
      { key: "address", label: "Alamat", val: me.address },
      { key: "emergencyContact", label: "Kontak darurat", val: me.emergencyContact },
      { key: "name", label: "Nama", val: me.name },
    ];
    const done = fields.filter(f => !!f.val).length;
    return {
      percent: Math.round((done / fields.length) * 100),
      done,
      total: fields.length,
      missing: fields.filter(f => !f.val).map(f => f.label),
    };
  }, [me]);

  // -- Change password --
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const pwStrength = useMemo(() => {
    const p = newPw;
    if (!p) return null;
    const checks = {
      length: p.length >= 8,
      upper: /[A-Z]/.test(p),
      lower: /[a-z]/.test(p),
      digit: /[0-9]/.test(p),
    };
    const score = Object.values(checks).filter(Boolean).length;
    return { checks, score };
  }, [newPw]);

  const pwMut = useMutation({
    mutationFn: (d: { currentPassword: string; newPassword: string }) =>
      api.post<{ message: string }>("/auth/change-password", d),
    onSuccess: () => {
      toast.success("Password berhasil diubah");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    },
    onError: (e: any) => toast.error(e.message || "Gagal mengubah password"),
  });

  // -- Photo upload --
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoMut = useMutation({
    mutationFn: (photoUrl: string | null) => api.put<{ hasPhoto: boolean }>("/auth/me/photo", { photoUrl }),
    onSuccess: (data) => {
      toast.success(data.hasPhoto ? "Foto profil berhasil disimpan" : "Foto profil dihapus");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      updateCachedUser({ hasPhoto: data.hasPhoto, avatarVersion: Date.now(), photoUrl: null });
    },
    onError: (e: any) => toast.error(e.message || "Gagal upload foto"),
  });
  const handlePhotoFile = async (file: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("File max 10MB (akan auto-resize ke 256x256)");
    setPhotoUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await photoMut.mutateAsync(dataUrl);
    } catch (e: any) {
      toast.error(e.message || "Gagal proses foto");
    } finally {
      setPhotoUploading(false);
    }
  };

  // -- Telegram pairing --
  const [tgPairing, setTgPairing] = useState<{ code: string; botUsername: string; deepLink: string | null; expiresAt: number } | null>(null);
  const [tgBusy, setTgBusy] = useState(false);
  useEffect(() => {
    if (!tgPairing) return;
    const t = setInterval(() => {
      if (Date.now() > tgPairing.expiresAt) setTgPairing(null);
    }, 1000);
    return () => clearInterval(t);
  }, [tgPairing]);
  // Poll /auth/me setiap 3 detik saat pairing dialog aktif - deteksi chatId muncul
  useEffect(() => {
    if (!tgPairing || me?.telegramChatId) return;
    const t = setInterval(() => queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }), 3000);
    return () => clearInterval(t);
  }, [tgPairing, me?.telegramChatId, queryClient]);
  useEffect(() => {
    // Auto-close pairing dialog saat terdeteksi tersambung
    if (tgPairing && me?.telegramChatId) {
      toast.success("Telegram berhasil tersambung!");
      setTgPairing(null);
    }
  }, [me?.telegramChatId, tgPairing]);

  const handleTgConnect = async () => {
    setTgBusy(true);
    try {
      const r: any = await api.post("/auth/me/telegram/pair/request", {});
      setTgPairing({
        code: r.code,
        botUsername: r.botUsername,
        deepLink: r.deepLink,
        expiresAt: Date.now() + (r.expiresInSec ?? 300) * 1000,
      });
    } catch (e: any) {
      toast.error(e.message || "Telegram belum dikonfigurasi admin");
    } finally {
      setTgBusy(false);
    }
  };
  const handleTgDisconnect = async () => {
    if (!confirm("Putuskan koneksi Telegram? Kamu tidak akan terima notifikasi lagi.")) return;
    setTgBusy(true);
    try {
      await api.delete("/auth/me/telegram");
      toast.success("Telegram terputus");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    } catch (e: any) {
      toast.error(e.message || "Gagal putuskan");
    } finally {
      setTgBusy(false);
    }
  };

  // Parse & update Telegram prefs
  const tgPrefs = useMemo(() => {
    const base: Record<string, boolean> = Object.fromEntries(TELEGRAM_EVENTS.map(e => [e.key, true]));
    if (me?.telegramPrefs) {
      try {
        const parsed = JSON.parse(me.telegramPrefs);
        for (const k of Object.keys(parsed)) base[k] = parsed[k] !== false;
      } catch { /* ignore */ }
    }
    return base;
  }, [me?.telegramPrefs]);
  const prefsMut = useMutation({
    mutationFn: (prefs: Record<string, boolean>) => api.put<{ prefs: any }>("/auth/me/telegram/prefs", { prefs }),
    onSuccess: () => {
      toast.success("Preferensi notifikasi tersimpan");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (e: any) => toast.error(e.message || "Gagal simpan"),
  });
  const togglePref = (key: string) => {
    prefsMut.mutate({ ...tgPrefs, [key]: !tgPrefs[key] });
  };

  const submitPasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPw || !newPw || !confirmPw) return toast.error("Semua field password wajib diisi");
    if (newPw !== confirmPw) return toast.error("Konfirmasi password tidak cocok");
    if (pwStrength && pwStrength.score < 4) return toast.error("Password baru belum memenuhi semua kriteria keamanan");
    pwMut.mutate({ currentPassword: currentPw, newPassword: newPw });
  };

  // Prefer the dynamic role name (covers custom per-mitra roles); ROLE_CONFIG is keyed by
  // both roleName ("Admin", "System-Admin") and legacy users.role ("operator", "marketing").
  const roleKey = roleLabel(me ?? user) || "operator";
  const roleInfo = ROLE_CONFIG[roleKey as keyof typeof ROLE_CONFIG]
    ?? { label: roleKey, color: "text-blue-600 dark:text-blue-400", icon: Shield, desc: "" };
  const RoleIcon = roleInfo.icon;
  const displayName = me?.name ?? user?.name ?? "";
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join("") || "?";

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <div className="h-8 w-48 bg-muted rounded animate-pulse mb-6" />
        <div className="h-48 bg-muted rounded-xl animate-pulse mb-5" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="h-96 bg-muted rounded-xl animate-pulse" />
          <div className="h-96 bg-muted rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    /* profile-page: root container */
    <div data-section="profile-page" className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      {/* ==== profile-header: page title / description ==== */}
      <header data-section="profile-header" className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CircleUser className="h-5 w-5 text-primary" />
            <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">Profil Saya</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Kelola data pribadi, informasi tim, dan keamanan akun Anda.
          </p>
        </div>
      </header>

      {/* ==== profile-hero: identity / cover card ==== */}
      <Card data-section="profile-hero" className="overflow-hidden border-border/60 shadow-sm">
        {/* Cover band - avatar floats here, no text overlap */}
        <div className="relative h-28 md:h-32 bg-gradient-to-br from-primary via-primary/80 to-primary/40">
          {/* Decorative glows */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.18),transparent_55%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_70%,rgba(255,255,255,0.10),transparent_50%)]" />
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5 blur-2xl" />
          <div className="absolute bottom-0 right-1/3 w-16 h-16 rounded-full bg-white/10 blur-xl" />

          {/* ==== profile-avatar: floating avatar + upload ==== */}
          <div data-section="profile-avatar" className="absolute -bottom-10 md:-bottom-12 left-5 md:left-6">
            <div className="relative group">
              <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-background to-muted border-4 border-background shadow-xl overflow-hidden ring-1 ring-border">
                {me?.hasPhoto ? (
                  <img src={`/api/users/${me.id}/photo?v=${user?.avatarVersion ?? 0}`} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl md:text-3xl font-bold text-primary">
                    {initials}
                  </div>
                )}
                {photoUploading && (
                  <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                )}
              </div>
              <label
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-primary-foreground shadow-lg border-2 border-background flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors"
                title="Ganti foto profil"
              >
                <Camera className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handlePhotoFile(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {me?.hasPhoto && (
                <button
                  type="button"
                  onClick={() => { if (confirm("Hapus foto profil?")) photoMut.mutate(null); }}
                  className="absolute top-0 right-0 w-6 h-6 rounded-full bg-destructive text-destructive-foreground shadow border-2 border-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/90"
                  title="Hapus foto"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Top-right role chip on cover */}
          <div className="absolute top-3 right-4 hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm border border-white/25">
            <RoleIcon className="h-3 w-3 text-white" />
            <span className="text-[11px] font-semibold text-white">{roleInfo.label}</span>
          </div>
        </div>

        {/* Content sits cleanly on white below the cover */}
        <div className="px-5 md:px-6 pt-12 md:pt-14 pb-5 md:pb-6">
          {/* Name + meta row, indented past floating avatar on md+ */}
          <div className="md:pl-[7.5rem] flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl md:text-2xl font-bold text-foreground truncate leading-tight">
                {displayName || "-"}
              </h2>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                @{me?.username ?? user?.username}
              </p>
              <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                <Badge variant="outline" className={`${roleInfo.color} border-current/30 text-[10px] h-5 px-2 sm:hidden`}>
                  <RoleIcon className="h-2.5 w-2.5 mr-1" />
                  {roleInfo.label}
                </Badge>
                {me?.isActive ? (
                  <Badge variant="outline" className="text-[10px] h-5 px-2 border-success/30 text-success bg-success/5">
                    <CheckCircle2 className="h-2.5 w-2.5 mr-1" /> Akun Aktif
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] h-5 px-2 border-warning/30 text-warning bg-warning/5">
                    <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Nonaktif
                  </Badge>
                )}
                {me?.position && (
                  <Badge variant="outline" className="text-[10px] h-5 px-2 border-border text-muted-foreground">
                    <Briefcase className="h-2.5 w-2.5 mr-1" /> {me.position}
                  </Badge>
                )}
                {me?.branch && (
                  <Badge variant="outline" className="text-[10px] h-5 px-2 border-border text-muted-foreground">
                    <Building2 className="h-2.5 w-2.5 mr-1" /> {me.branch}
                  </Badge>
                )}
              </div>
              {roleInfo.desc && (
                <p className="text-[11px] text-muted-foreground/80 mt-2 italic">
                  {roleInfo.desc}
                </p>
              )}
            </div>
          </div>

          {/* ==== profile-hero-stats: stats + completeness strip ==== */}
          <div data-section="profile-hero-stats" className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4 pt-5 border-t border-border/60">
            <StatItem icon={Calendar} label="Bergabung" value={formatDate(me?.createdAt ?? null)} />
            <StatItem icon={Clock} label="Login Terakhir" value={relativeTime(me?.lastLogin ?? null)} />
            <StatItem icon={Building2} label="Cabang" value={me?.branch || "-"} />
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">
                <CircleCheck className="h-3 w-3" /> Kelengkapan
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      completeness.percent >= 100 ? "bg-success" :
                      completeness.percent >= 66 ? "bg-primary" :
                      completeness.percent >= 33 ? "bg-warning" : "bg-destructive"
                    }`}
                    style={{ width: `${completeness.percent}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-foreground tabular-nums">{completeness.percent}%</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ==== profile-data-grid: personal + team data ==== */}
      <div data-section="profile-data-grid" className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* ==== profile-personal: Data Pribadi ==== */}
        <Card data-section="profile-personal" className="border-border/60 flex flex-col">
          <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 space-y-0">
            <div className="min-w-0">
              <CardTitle className="text-base flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-primary" /> Data Pribadi
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Informasi kontak & identitas - dapat Anda ubah sendiri
              </CardDescription>
            </div>
            {!editMode && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditMode(true)}
                className="gap-1.5 shrink-0 h-8"
              >
                <Pencil className="h-3.5 w-3.5" /> Ubah
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex-1">
            {editMode ? (
              /* profile-personal-form: edit personal data */
              <form data-section="profile-personal-form" onSubmit={handleSave} className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Nama Lengkap <span className="text-destructive">*</span></Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    maxLength={60}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="nama@jabnet.id"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">No. HP / WhatsApp</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="08123456789"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Tanggal Lahir</Label>
                  <Input
                    type="date"
                    value={form.birthDate}
                    onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Alamat Domisili</Label>
                  <Textarea
                    rows={2}
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Jl. Ahmad Yani No. 123, Garut"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Kontak Darurat</Label>
                  <Input
                    value={form.emergencyContact}
                    onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                    placeholder="Nama - 08xxx"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit" size="sm" disabled={updateMut.isPending} className="gap-1.5">
                    {updateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Simpan Perubahan
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditMode(false)}
                    disabled={updateMut.isPending}
                    className="gap-1.5"
                  >
                    <X className="h-3.5 w-3.5" /> Batal
                  </Button>
                </div>
              </form>
            ) : (
              <div data-section="profile-personal-fields" className="divide-y divide-border/60">
                <FieldRow icon={UserIcon} label="Nama Lengkap" value={me?.name ?? null} />
                <FieldRow icon={Mail} label="Email" value={me?.email ?? null} />
                <FieldRow icon={Phone} label="No. HP / WhatsApp" value={me?.phone ?? null} mono />
                <FieldRow icon={Cake} label="Tanggal Lahir" value={me?.birthDate ? formatDate(me.birthDate) : null} />
                <FieldRow icon={MapPin} label="Alamat Domisili" value={me?.address ?? null} />
                <FieldRow icon={PhoneCall} label="Kontak Darurat" value={me?.emergencyContact ?? null} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ==== profile-employment: Data Tim / Kepegawaian ==== */}
        <Card data-section="profile-employment" className="border-border/60 flex flex-col">
          <CardHeader className="pb-2 space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary" /> Data Tim & Jabatan
            </CardTitle>
            <CardDescription className="mt-1 text-xs flex items-center gap-1">
              <Info className="h-3 w-3" />
              Dikelola admin - hubungi admin untuk perubahan
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="divide-y divide-border/60">
              <FieldRow icon={Hash} label="NIK / Employee ID" value={me?.employeeId ?? null} mono />
              <FieldRow icon={Briefcase} label="Jabatan" value={me?.position ?? null} />
              <FieldRow icon={Building2} label="Departemen / Divisi" value={me?.department ?? null} />
              <FieldRow icon={MapPinned} label="Cabang / Area" value={me?.branch ?? null} />
              <FieldRow icon={Calendar} label="Bergabung Tim" value={me?.joinDate ? formatDate(me.joinDate) : null} />
              <FieldRow icon={Shield} label="Role Sistem" value={roleInfo.label} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ==== profile-admin-notes: Catatan dari Admin (jika ada) ==== */}
      {me?.notes && (
        <Card data-section="profile-admin-notes" className="border-border/60 bg-muted/30">
          <CardHeader className="pb-2 space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Catatan dari Admin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{me.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* ==== profile-security: Keamanan / Ubah Password ==== */}
      <Card data-section="profile-security" className="border-border/60">
        <CardHeader className="pb-2 space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" /> Keamanan - Ubah Password
          </CardTitle>
          <CardDescription className="mt-1 text-xs">
            Gunakan password yang kuat untuk melindungi akun Anda
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form data-section="profile-password-form" onSubmit={submitPasswordChange} className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs font-medium">Password Saat Ini</Label>
              <div className="relative">
                <Input
                  type={showCurrent ? "text" : "password"}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                  tabIndex={-1}
                >
                  {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Password Baru</Label>
              <div className="relative">
                <Input
                  type={showNew ? "text" : "password"}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  autoComplete="new-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                  tabIndex={-1}
                >
                  {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Konfirmasi Password Baru</Label>
              <Input
                type={showNew ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Ketik ulang password baru"
                autoComplete="new-password"
              />
            </div>

            {pwStrength && (
              <div className="md:col-span-2 space-y-2">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i < pwStrength.score
                          ? pwStrength.score <= 2
                            ? "bg-destructive"
                            : pwStrength.score === 3
                            ? "bg-warning"
                            : "bg-success"
                          : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
                <ul className="grid grid-cols-2 md:grid-cols-4 gap-x-3 gap-y-1 text-[11px]">
                  <li className={pwStrength.checks.length ? "text-success" : "text-muted-foreground"}>
                    {pwStrength.checks.length ? "✓" : "○"} Min. 8 karakter
                  </li>
                  <li className={pwStrength.checks.upper ? "text-success" : "text-muted-foreground"}>
                    {pwStrength.checks.upper ? "✓" : "○"} Huruf besar
                  </li>
                  <li className={pwStrength.checks.lower ? "text-success" : "text-muted-foreground"}>
                    {pwStrength.checks.lower ? "✓" : "○"} Huruf kecil
                  </li>
                  <li className={pwStrength.checks.digit ? "text-success" : "text-muted-foreground"}>
                    {pwStrength.checks.digit ? "✓" : "○"} Angka
                  </li>
                </ul>
              </div>
            )}

            {confirmPw && confirmPw !== newPw && (
              <p className="md:col-span-2 text-[11px] text-destructive">
                Konfirmasi password tidak cocok
              </p>
            )}

            <div className="md:col-span-2">
              <Button
                type="submit"
                disabled={pwMut.isPending || !currentPw || !newPw || !confirmPw}
                className="gap-2"
              >
                {pwMut.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Menyimpan…</>
                ) : (
                  <><KeyRound className="h-4 w-4" />Ubah Password</>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ==== profile-telegram: Integrasi Telegram ==== */}
      <Card data-section="profile-telegram" className="border-border/60">
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2 space-y-0">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4 text-sky-500" /> Integrasi Telegram
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Terima notifikasi langsung di Telegram - lead baru, canvassing, ticket, dan lainnya.
            </CardDescription>
          </div>
          {me?.telegramChatId ? (
            <Badge className="bg-success/15 text-success border-success/30">
              <CheckCircle2 className="h-3 w-3 mr-1" />Tersambung
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              <Info className="h-3 w-3 mr-1" />Belum tersambung
            </Badge>
          )}
        </CardHeader>
        <CardContent className="pt-3 space-y-4">
          {!me?.telegramChatId && !tgPairing && (
            /* profile-telegram-connect: prompt to connect */
            <div data-section="profile-telegram-connect" className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-lg border bg-muted/30">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">Hubungkan akun Telegram</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Klik tombol di samping → dapat kode 6-digit → kirim ke bot JABNET.
                </p>
              </div>
              <Button onClick={handleTgConnect} disabled={tgBusy} size="sm" className="gap-2 shrink-0">
                {tgBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Connect Telegram
              </Button>
            </div>
          )}

          {tgPairing && !me?.telegramChatId && (
            /* profile-telegram-pairing: active pairing code panel */
            <div data-section="profile-telegram-pairing" className="p-4 rounded-lg border-2 border-primary/40 bg-primary/5 space-y-3">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Pairing aktif - kirim kode ini ke bot</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Expired dalam{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {Math.max(0, Math.ceil((tgPairing.expiresAt - Date.now()) / 1000))} detik
                    </span>
                  </p>
                </div>
                <button
                  onClick={() => setTgPairing(null)}
                  className="text-muted-foreground hover:text-foreground"
                  title="Batal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex items-center justify-center py-2">
                <div className="text-3xl md:text-4xl font-black font-mono tabular-nums tracking-[0.25em] text-primary">
                  {tgPairing.code}
                </div>
              </div>

              <div className="rounded-md bg-background border p-3 space-y-2 text-xs">
                <p className="font-semibold">Cara hubungkan:</p>
                <ol className="list-decimal ml-5 space-y-1 text-muted-foreground">
                  <li>Buka Telegram → cari bot{" "}
                    {tgPairing.botUsername ? (
                      <span className="font-mono text-foreground">@{tgPairing.botUsername}</span>
                    ) : (
                      <span className="italic">(belum diset admin)</span>
                    )}
                  </li>
                  <li>Kirim pesan: <code className="font-mono bg-muted px-1.5 py-0.5 rounded">/start {tgPairing.code}</code></li>
                  <li>Tunggu beberapa detik - halaman ini akan update otomatis.</li>
                </ol>
                <div className="flex gap-2 pt-1 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(`/start ${tgPairing.code}`);
                      toast.success("Perintah disalin");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Salin /start {tgPairing.code}
                  </Button>
                  {tgPairing.deepLink && (
                    <a href={tgPairing.deepLink} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Buka Telegram
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {me?.telegramChatId && (
            <>
              {/* ==== profile-telegram-connected: linked account summary ==== */}
              <div data-section="profile-telegram-connected" className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {me.telegramUsername || "Telegram terhubung"}
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                      chat_id: {me.telegramChatId}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tersambung sejak {formatDate(me.telegramLinkedAt ?? null, true)}
                  </p>
                </div>
                <Button
                  onClick={handleTgDisconnect}
                  disabled={tgBusy}
                  variant="outline"
                  size="sm"
                  className="gap-2 shrink-0 text-destructive hover:text-destructive"
                >
                  {tgBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
                  Putuskan
                </Button>
              </div>

              {/* ==== profile-telegram-prefs: notification event toggles ==== */}
              <div data-section="profile-telegram-prefs" className="space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Event yang dinotifikasi</p>
                <div className="grid gap-2">
                  {TELEGRAM_EVENTS.map((ev) => (
                    <label
                      key={ev.key}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-md border bg-card hover:bg-muted/30 cursor-pointer"
                    >
                      <span className="text-sm">{ev.label}</span>
                      <input
                        type="checkbox"
                        checked={tgPrefs[ev.key] !== false}
                        onChange={() => togglePref(ev.key)}
                        className="w-4 h-4 accent-primary cursor-pointer"
                      />
                    </label>
                  ))}
                </div>
                {prefsMut.isPending && (
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Menyimpan...
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
