import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GoogleMap, Marker, Circle, MarkerClusterer } from "@react-google-maps/api";
import { useGoogleMaps } from "@/context/GoogleMapsContext";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
  Play, Square, Plus, Home, Building2, GraduationCap,
  Briefcase, HelpCircle, Navigation2, X, Clock,
  Users, CheckCircle2, AlertTriangle, MapPin, CircleDot,
  FileText, Eye, EyeOff, Wifi, WifiOff, Shield, Star,
  TrendingDown, Zap, MessageSquare, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LEAD_CATEGORY_LABELS, type LeadCategory } from "../../shared/schema";
import { dotIcon, odpUsageColor } from "@/lib/assetColors";
import { reverseGeocode } from "@/lib/geocode";
import { compressImage, formatBytes } from "@/lib/imageCompress";

// -- Terra Design Tokens --------------------------------------------------
const T = {
  bg: "#faf9f8", deep: "#350800", secondary: "#755750", accent: "#ff5f2e",
  surface: "#f4f3f2", surfaceHi: "#e9e8e7", outline: "#827472",
  outlineV: "#d3c3c0", textSoft: "#504442", container: "#591300",
};

// -- Types ------------------------------------------------------------------
interface Odp { id: number; name: string; lat?: number; lng?: number; capacity?: number; usedCapacity?: number; }
interface Session {
  id: number; userId: number; userName?: string; userInitial?: string;
  name?: string; status: string; startedAt: string;
  leadCount?: number; centerLat?: number; centerLng?: number;
}
interface Lead { id: number; name: string; category?: string; lat?: number; lng?: number; stage: string; createdAt: string; }
interface FieldLog {
  id: number; sessionId: number; userId: number; type: string;
  title: string; description?: string | null;
  lat?: number | null; lng?: number | null;
  odpId?: number | null; severity: string; createdAt: string;
}

// -- Config ----------------------------------------------------------------
const LOG_TYPES = [
  { key: "area_sepi", label: "Area Sepi", icon: EyeOff, color: "#6B7280", desc: "Tidak ada calon pelanggan" },
  { key: "akses_sulit", label: "Akses Sulit", icon: AlertTriangle, color: "#F59E0B", desc: "Jalan rusak, gang sempit" },
  { key: "kompetitor", label: "Kompetitor", icon: Shield, color: "#EF4444", desc: "Ada ISP lain dominan" },
  { key: "infrastruktur", label: "Infrastruktur", icon: WifiOff, color: "#8B5CF6", desc: "ODP jauh, kabel belum" },
  { key: "potensi_tinggi", label: "Potensi Tinggi", icon: Star, color: "#22C55E", desc: "Area potensial prospek" },
  { key: "lainnya", label: "Lainnya", icon: MessageSquare, color: "#3B82F6", desc: "Catatan umum lapangan" },
];
const LOG_TYPE_MAP = Object.fromEntries(LOG_TYPES.map(t => [t.key, t]));
const SEVERITY_OPTIONS = [
  { key: "info", label: "Info", color: "#3B82F6" },
  { key: "warning", label: "Perhatian", color: "#F59E0B" },
  { key: "critical", label: "Kritis", color: "#EF4444" },
];

const CAT_ICONS: Record<string, any> = { rumahan: Home, bisnis: Briefcase, perkantoran: Building2, sekolah: GraduationCap, lainnya: HelpCircle };
const CAT_COLORS: Record<string, string> = { rumahan: "#22C55E", bisnis: "#F59E0B", perkantoran: "#3B82F6", sekolah: "#8B5CF6", lainnya: "#6B7280" };
const TEAM_COLORS = ["#3B82F6","#EF4444","#8B5CF6","#F59E0B","#EC4899","#14B8A6"];

// -- Helpers ----------------------------------------------------------------
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
function findNearestOdp(lat: number, lng: number, odps: Odp[]) {
  let nearest: Odp | null = null; let minDist = Infinity;
  for (const o of odps) {
    if (!o.lat || !o.lng) continue;
    const d = haversine(lat, lng, o.lat, o.lng);
    if (d < minDist) { minDist = d; nearest = o; }
  }
  return nearest ? { odp: nearest, distance: minDist } : null;
}
function formatDuration(startedAt: string) {
  const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}j${mins % 60}m`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

// -- Custom Confirm Dialog -------------------------------------------------
function ConfirmDialog({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="rounded-2xl shadow-2xl p-6 w-[85%] max-w-sm mx-auto" style={{ background: T.bg }}>
        <p className="text-sm font-medium text-center mb-5" style={{ color: T.deep }}>{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-2.5 text-sm rounded-xl font-medium"
            style={{ background: T.surfaceHi, color: T.secondary }}>
            Batal
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 text-sm rounded-xl font-medium text-white"
            style={{ background: "#EF4444" }}>
            Ya, Akhiri
          </button>
        </div>
      </div>
    </div>
  );
}

// -- Terra ODP Info Card ---------------------------------------------------
function OdpInfoCard({ odp, onClose }: { odp: Odp; onClose: () => void }) {
  const used = odp.usedCapacity ?? 0;
  const total = odp.capacity ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const barColor = pct >= 100 ? "#EF4444" : pct >= 75 ? "#F59E0B" : "#22C55E";
  const statusText = pct >= 100 ? "Penuh" : pct >= 75 ? "Hampir Penuh" : "Tersedia";
  const statusColor = pct >= 100 ? "#EF4444" : pct >= 75 ? "#F59E0B" : "#22C55E";

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 md:absolute md:top-4 pointer-events-auto">
      <div className="rounded-2xl shadow-2xl min-w-[240px] max-w-[300px] overflow-hidden"
        style={{ background: T.bg }}>
        {/* Header with gradient */}
        <div className="px-4 py-3 flex items-center gap-3"
          style={{ background: `linear-gradient(135deg, ${T.deep}, ${T.container})` }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <CircleDot className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-white leading-tight truncate">{odp.name}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: statusColor }}>
              {statusText}
            </p>
          </div>
          <button onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <X className="h-3 w-3 text-white" />
          </button>
        </div>
        {/* Content */}
        <div className="px-4 py-3 space-y-2.5">
          {total > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.outline }}>Port Terpakai</span>
                <span className="text-sm font-bold" style={{ color: T.deep }}>{used}/{total}</span>
              </div>
              <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: T.surfaceHi }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: T.secondary }}>Sisa {total - used} port</span>
                <span className="text-xs font-bold" style={{ color: statusColor }}>{pct}%</span>
              </div>
            </>
          ) : (
            <p className="text-xs italic text-center py-2" style={{ color: T.secondary }}>Info kapasitas tidak tersedia</p>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Add Lead Form ---------------------------------------------------------
function AddLeadForm({ lat, lng, odps, sessionId, onSave, onCancel, isSaving }: {
  lat: number; lng: number; odps: Odp[]; sessionId: number;
  onSave: (data: any) => void; onCancel: () => void; isSaving: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [category, setCategory] = useState<LeadCategory>("rumahan");
  const [notes, setNotes] = useState("");
  const nearest = findNearestOdp(lat, lng, odps);
  const isFar = nearest && nearest.distance > 500;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="rounded-t-2xl md:rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-auto overflow-y-auto max-h-[90vh]" style={{ background: T.bg }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: T.accent + "15" }}>
              <Plus className="h-4 w-4" style={{ color: T.accent }} />
            </div>
            <h3 className="font-bold text-sm" style={{ color: T.deep }}>Tambah Prospek</h3>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg" style={{ background: T.surfaceHi }}>
            <X className="h-4 w-4" style={{ color: T.secondary }} />
          </button>
        </div>
        {nearest && (
          <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2 mb-3"
            style={{
              background: isFar ? "#F59E0B12" : "#22C55E12",
              border: `1px solid ${isFar ? "#F59E0B30" : "#22C55E30"}`,
              color: isFar ? "#B45309" : "#15803D",
            }}>
            {isFar ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
            {nearest.odp.name} - {nearest.distance}m
          </div>
        )}
        <div className="space-y-3">
          <input autoFocus type="text" placeholder="Nama prospek *"
            value={name} onChange={e => setName(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2"
            style={{ background: T.surface, border: "none", color: T.textSoft }} />
          <input type="tel" placeholder="No. HP (opsional)"
            value={phone} onChange={e => setPhone(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2"
            style={{ background: T.surface, border: "none", color: T.textSoft }} />
          <div className="grid grid-cols-5 gap-1.5">
            {(Object.keys(CAT_COLORS) as LeadCategory[]).map(cat => {
              const Icon = CAT_ICONS[cat];
              const active = category === cat;
              return (
                <button key={cat} onClick={() => setCategory(cat)}
                  className="flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                  style={active
                    ? { background: T.accent + "15", color: T.accent, border: `1px solid ${T.accent}30` }
                    : { background: T.surface, color: T.secondary, border: "1px solid transparent" }
                  }>
                  <Icon className="h-3.5 w-3.5" />
                  {LEAD_CATEGORY_LABELS[cat].split("/")[0].slice(0, 5)}
                </button>
              );
            })}
          </div>
          <textarea rows={2} placeholder="Catatan (opsional)"
            value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2"
            style={{ background: T.surface, border: "none", color: T.textSoft }} />
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!name.trim()) return toast.error("Nama wajib diisi");
                // Reverse geocode untuk auto-fill district + village (non-blocking, 2.5s timeout)
                let district: string | undefined; let village: string | undefined; let address: string | undefined;
                try {
                  const geoPromise = reverseGeocode(lat, lng);
                  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 2500));
                  const geo = await Promise.race([geoPromise, timeout]);
                  if (geo) {
                    district = geo.district || undefined;
                    village = geo.village || undefined;
                    address = geo.formatted || undefined;
                  }
                } catch { /* diam - save tetap jalan */ }
                onSave({
                  name: name.trim(), phone: phone.trim() || undefined,
                  category, notes: notes.trim() || undefined,
                  lat, lng, source: "canvassing", canvassingSessionId: sessionId,
                  odpId: nearest?.odp.id, distanceMeters: nearest?.distance,
                  district, village, address,
                });
              }}
              disabled={isSaving}
              className="flex-1 py-2.5 text-sm text-white rounded-xl font-bold disabled:opacity-50"
              style={{ background: T.accent }}
            >
              {isSaving ? "Menyimpan..." : "Simpan Prospek"}
            </button>
            <button onClick={onCancel}
              className="px-4 py-2.5 text-sm rounded-xl font-medium"
              style={{ background: T.surfaceHi, color: T.secondary }}>
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Field Report Form (BI) ------------------------------------------------
function FieldReportForm({ lat, lng, odps, sessionId, onSave, onCancel, isSaving }: {
  lat: number; lng: number; odps: Odp[]; sessionId: number;
  onSave: (data: any) => void; onCancel: () => void; isSaving: boolean;
}) {
  const [logType, setLogType] = useState("area_sepi");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("info");
  const [photoData, setPhotoData] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const nearest = findNearestOdp(lat, lng, odps);

  // Auto-generate title based on type
  useEffect(() => {
    const cfg = LOG_TYPE_MAP[logType];
    if (cfg) setTitle(cfg.label);
  }, [logType]);

  const [photoCompressing, setPhotoCompressing] = useState(false);
  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset biar bisa pilih file sama lagi
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("File harus berupa gambar");
      return;
    }
    // Auto-compress tanpa ada batasan size - user kasih foto 20MB pun oke,
    // akan otomatis di-resize ke 1280px + JPEG q=0.72 (~200KB)
    setPhotoCompressing(true);
    try {
      const result = await compressImage(file);
      setPhotoData(result.dataUrl);
      // Info saja kalau hasil kecil banget (bukan error)
      const ratio = result.originalBytes > 0
        ? Math.round((1 - result.compressedBytes / result.originalBytes) * 100)
        : 0;
      if (ratio > 30) {
        toast.success(`Foto di-compress ${formatBytes(result.originalBytes)} → ${formatBytes(result.compressedBytes)}`, { duration: 2000 });
      }
    } catch (err: any) {
      toast.error(err?.message || "Gagal proses foto");
    } finally {
      setPhotoCompressing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="rounded-t-2xl md:rounded-2xl shadow-2xl p-5 w-full max-w-sm mx-auto overflow-y-auto max-h-[90vh]"
        style={{ background: T.bg }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "#3B82F615" }}>
              <FileText className="h-4 w-4" style={{ color: "#3B82F6" }} />
            </div>
            <div>
              <h3 className="font-bold text-sm" style={{ color: T.deep }}>Laporan Lapangan</h3>
              <p className="text-[10px]" style={{ color: T.secondary }}>Catat kondisi area untuk analisis</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg" style={{ background: T.surfaceHi }}>
            <X className="h-4 w-4" style={{ color: T.secondary }} />
          </button>
        </div>

        {/* Nearest ODP indicator */}
        {nearest && (
          <div className="flex items-center gap-2 text-xs rounded-xl px-3 py-2 mb-3"
            style={{ background: T.surface, color: T.secondary }}>
            <CircleDot className="h-3.5 w-3.5 shrink-0" style={{ color: T.accent }} />
            <span>ODP terdekat: <strong style={{ color: T.deep }}>{nearest.odp.name}</strong> ({nearest.distance}m)</span>
          </div>
        )}

        <div className="space-y-3">
          {/* Log type selector */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: T.outline }}>Jenis Laporan</p>
            <div className="grid grid-cols-3 gap-2">
              {LOG_TYPES.map(lt => {
                const Icon = lt.icon;
                const active = logType === lt.key;
                return (
                  <button key={lt.key} onClick={() => { setLogType(lt.key); setTitle(lt.label); }}
                    className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-center transition-all"
                    style={active
                      ? { background: lt.color + "15", border: `1px solid ${lt.color}30`, color: lt.color }
                      : { background: T.surface, border: "1px solid transparent", color: T.secondary }
                    }>
                    <Icon className="h-4 w-4" />
                    <span className="text-[9px] font-bold uppercase tracking-widest leading-tight">{lt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Severity */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: T.outline }}>Tingkat</p>
            <div className="flex gap-2">
              {SEVERITY_OPTIONS.map(s => (
                <button key={s.key} onClick={() => setSeverity(s.key)}
                  className="flex-1 py-2 text-xs font-bold rounded-xl transition-all text-center"
                  style={severity === s.key
                    ? { background: s.color, color: "white" }
                    : { background: T.surface, color: T.secondary }
                  }>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <input type="text" placeholder="Judul laporan *"
            value={title} onChange={e => setTitle(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2"
            style={{ background: T.surface, border: "none", color: T.textSoft }} />

          {/* Description */}
          <textarea rows={3} placeholder="Deskripsi kondisi area, permasalahan yang ditemui, saran..."
            value={description} onChange={e => setDescription(e.target.value)}
            className="w-full text-sm rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2"
            style={{ background: T.surface, border: "none", color: T.textSoft }} />

          {/* Photo capture - realtime camera OR pick from gallery (auto-compress) */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: T.outline }}>
              Bukti Foto {photoData ? "✓" : "(opsional)"}
            </p>
            {photoCompressing ? (
              <div className="w-full h-48 rounded-xl flex flex-col items-center justify-center gap-2 animate-pulse" style={{ background: T.surface }}>
                <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: T.outlineV, borderTopColor: T.accent }} />
                <span className="text-[11px]" style={{ color: T.secondary }}>Memproses foto...</span>
              </div>
            ) : photoData ? (
              <div className="relative">
                <img src={photoData} alt="Bukti laporan" className="w-full h-48 object-cover rounded-xl" />
                <button
                  onClick={() => setPhotoData(null)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm text-white flex items-center justify-center hover:bg-red-500"
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="absolute bottom-2 right-2 text-[10px] bg-black/60 backdrop-blur-sm text-white rounded-full px-3 py-1.5 font-bold uppercase tracking-widest hover:bg-black/80"
                  type="button"
                >
                  Foto Ulang
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  type="button"
                  className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border-2 border-dashed transition-colors hover:bg-accent/10"
                  style={{ borderColor: T.outlineV, color: T.accent }}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Kamera</span>
                </button>
                <button
                  onClick={() => galleryInputRef.current?.click()}
                  type="button"
                  className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-xl border-2 border-dashed transition-colors hover:bg-accent/10"
                  style={{ borderColor: T.outlineV, color: T.secondary }}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Galeri</span>
                </button>
              </div>
            )}
            {/* Hidden inputs - camera uses capture="environment" (back camera), gallery tanpa capture */}
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
            <input ref={galleryInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!title.trim()) return toast.error("Judul wajib diisi");
                onSave({
                  sessionId, type: logType, title: title.trim(),
                  description: description.trim() || undefined,
                  lat, lng, odpId: nearest?.odp.id, severity,
                  photoData: photoData || undefined,
                });
              }}
              disabled={isSaving}
              className="flex-1 py-2.5 text-sm text-white rounded-xl font-bold disabled:opacity-50"
              style={{ background: "#3B82F6" }}
            >
              {isSaving ? "Menyimpan..." : "Simpan Laporan"}
            </button>
            <button onClick={onCancel}
              className="px-4 py-2.5 text-sm rounded-xl font-medium"
              style={{ background: T.surfaceHi, color: T.secondary }}>
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- Main Page --------------------------------------------------------------
export default function CanvassingPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { isLoaded } = useGoogleMaps();
  const mapRef = useRef<google.maps.Map | null>(null);

  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationAccuracy, setLocationAccuracy] = useState<number | null>(null); // meters
  const [pendingCoord, setPendingCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingReportCoord, setPendingReportCoord] = useState<{ lat: number; lng: number } | null>(null);
  // Restore last map center dari localStorage supaya habis logout/refresh tidak balik ke Garkot
  const [mapCenter, setMapCenter] = useState(() => {
    try {
      const saved = localStorage.getItem("canvassing_last_center");
      if (saved) {
        const p = JSON.parse(saved);
        if (typeof p.lat === "number" && typeof p.lng === "number") return p;
      }
    } catch { /* ignore */ }
    return { lat: -7.2195, lng: 107.9047 }; // fallback: Garut kota
  });
  const [showTeam, setShowTeam] = useState(false);
  const [selectedOdp, setSelectedOdp] = useState<Odp | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [mapBounds, setMapBounds] = useState<{ n: number; s: number; e: number; w: number } | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [sideTab, setSideTab] = useState<"leads" | "logs">("leads");

  // Force re-render every 30s to update duration display
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Persist mapCenter ke localStorage (debounced via change detection)
  useEffect(() => {
    try {
      localStorage.setItem("canvassing_last_center", JSON.stringify(mapCenter));
    } catch { /* ignore quota */ }
  }, [mapCenter.lat, mapCenter.lng]);

  // --- CONTINUOUS GPS WATCH --------------------------------------------
  // watchPosition terus aktif, update myLocation + accuracy.
  // FIRST LOCK: auto-pan map sekali ke posisi aktual user (bukan Garkot default).
  const firstGpsLockRef = useRef(false);
  useEffect(() => {
    if (!navigator.geolocation) return;
    let watchId: number | null = null;
    const startWatch = () => {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMyLocation(c);
          setLocationAccuracy(pos.coords.accuracy);
          // First GPS lock: pan map ke posisi user supaya peta tidak stuck di Garkot
          if (!firstGpsLockRef.current) {
            firstGpsLockRef.current = true;
            setMapCenter(c);
            mapRef.current?.panTo(c);
            const currentZoom = mapRef.current?.getZoom() ?? 15;
            if (currentZoom < 15) mapRef.current?.setZoom(16);
          }
        },
        (err) => {
          console.warn("[canvassing] watchPosition error:", err.message);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 20000,
        },
      );
    };
    startWatch();
    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // -- Queries --
  const { data: mySession, isLoading: sessionLoading } = useQuery<Session | null>({
    queryKey: ["canvassing_active"],
    queryFn: () => api.get<Session | null>("/marketing/canvassing/active"),
    refetchInterval: 15000, retry: 1,
  });

  const { data: teamSessions = [] } = useQuery<Session[]>({
    queryKey: ["canvassing_active_all"],
    queryFn: () => api.get<Session[]>("/marketing/canvassing/active-all"),
    refetchInterval: 30000, retry: 1,
  });

  const { data: odps = [] } = useQuery<Odp[]>({
    queryKey: ["odps"],
    queryFn: () => api.get<Odp[]>("/odps"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: myLeads = [] } = useQuery<Lead[]>({
    queryKey: ["leads_canvassing", mySession?.id],
    queryFn: () => api.get<Lead[]>("/marketing/leads?source=canvassing"),
    enabled: !!mySession,
    refetchInterval: 30000,
  });

  const { data: fieldLogs = [] } = useQuery<FieldLog[]>({
    queryKey: ["canvassing_logs", mySession?.id],
    queryFn: () => api.get<FieldLog[]>(`/marketing/canvassing/logs?sessionId=${mySession!.id}`),
    enabled: !!mySession,
    refetchInterval: 30000,
  });

  // Zoom-adaptive ODP rendering + mobile optimization
  const [mapZoom, setMapZoom] = useState(15);
  const allValidOdps = useMemo(() => odps.filter(o => o.lat && o.lng), [odps]);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const isOverview = mapZoom <= (isMobile ? 14 : 13); // Mobile: cluster earlier
  const MAX_MOBILE_MARKERS = 25; // Cap markers on mobile for performance

  const visibleOdps = useMemo(() => {
    if (isOverview) return allValidOdps; // Clustered - safe even with 150+
    if (!mapBounds) return allValidOdps.slice(0, isMobile ? 15 : 30);
    const pad = isMobile ? 0.002 : 0.003; // Smaller pad on mobile
    const filtered = allValidOdps.filter(o =>
      o.lat! >= mapBounds.s - pad && o.lat! <= mapBounds.n + pad &&
      o.lng! >= mapBounds.w - pad && o.lng! <= mapBounds.e + pad
    );
    return isMobile ? filtered.slice(0, MAX_MOBILE_MARKERS) : filtered;
  }, [allValidOdps, mapBounds, isOverview, isMobile]);

  // -- Mutations --
  const startSession = useMutation({
    mutationFn: (data: any) => api.post("/marketing/canvassing/start", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["canvassing_active"] });
      qc.invalidateQueries({ queryKey: ["canvassing_active_all"] });
      toast.success("Sesi dimulai!");
    },
    onError: (e: any) => toast.error(e.message ?? "Gagal mulai sesi"),
  });

  const endSession = useMutation({
    mutationFn: (id: number) => api.post(`/marketing/canvassing/end/${id}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["canvassing_active"] });
      qc.invalidateQueries({ queryKey: ["canvassing_active_all"] });
      setPendingCoord(null); setPendingReportCoord(null); setConfirmEnd(false);
      toast.success("Sesi selesai");
    },
    onError: (e: any) => toast.error(e.message ?? "Gagal akhiri sesi"),
  });

  const createLead = useMutation({
    mutationFn: (data: any) => api.post("/marketing/leads", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads_canvassing"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["canvassing_active"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["marketing_dashboard"] });
      setPendingCoord(null);
      toast.success("Prospek tersimpan!");
    },
    onError: (e: any) => toast.error(e.message ?? "Gagal simpan"),
  });

  const createLog = useMutation({
    mutationFn: (data: any) => api.post("/marketing/canvassing/logs", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["canvassing_logs", mySession?.id] });
      setPendingReportCoord(null);
      toast.success("Laporan tersimpan!");
    },
    onError: (e: any) => toast.error(e.message ?? "Gagal simpan laporan"),
  });

  // -- GPS (locateMe = manual refresh dari button "Lokasi Saya") --
  const locateMe = useCallback((onSuccess?: (c: { lat: number; lng: number }) => void) => {
    if (!navigator.geolocation) { toast.error("GPS tidak didukung browser ini"); return; }
    // Kalau watch sudah ada myLocation, pakai itu instant (jangan delay UI)
    if (myLocation) {
      setMapCenter(myLocation);
      mapRef.current?.panTo(myLocation); mapRef.current?.setZoom(16);
      onSuccess?.(myLocation);
      return;
    }
    // Fallback: one-shot GPS dengan timeout pendek (3s) + cache 10s supaya cepat
    navigator.geolocation.getCurrentPosition(
      pos => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLocation(c); setLocationAccuracy(pos.coords.accuracy); setMapCenter(c);
        mapRef.current?.panTo(c); mapRef.current?.setZoom(16);
        onSuccess?.(c);
      },
      err => {
        toast.error("GPS gagal: " + (err.message ?? "Cek izin lokasi"));
        onSuccess?.(undefined as any); // JANGAN fallback ke Garkot - biarkan caller decide
      },
      { enableHighAccuracy: true, timeout: 3000, maximumAge: 10000 },
    );
  }, [myLocation]);

  // Handle Check-in & Mulai - FAST PATH: pakai myLocation dari watch (yang sudah terus aktif)
  // kalau belum ada, tunggu max 2.5s baru start tanpa coords.
  const handleStart = () => {
    const name = `Canvassing ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}`;

    // Fast path: watchPosition sudah set myLocation → start immediately
    if (myLocation) {
      startSession.mutate({ name, centerLat: myLocation.lat, centerLng: myLocation.lng });
      return;
    }

    // Fallback: tidak ada GPS yet - try one-shot dengan timeout 2.5s, lalu start tanpa coords
    let started = false;
    const doStart = (center?: { lat: number; lng: number }) => {
      if (started) return; started = true;
      startSession.mutate({ name, centerLat: center?.lat, centerLng: center?.lng });
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setMyLocation(c); setLocationAccuracy(pos.coords.accuracy);
          doStart(c);
        },
        () => doStart(),
        { enableHighAccuracy: true, timeout: 2500, maximumAge: 10000 },
      );
      // Hard fallback 3s - jangan biarin user nunggu > 3 detik
      setTimeout(() => doStart(), 3000);
    } else {
      doStart();
    }
  };

  const handleMapClick = useCallback(() => { setSelectedOdp(null); }, []);

  // GPS-based action triggers - FAST PATH: langsung pakai myLocation dari watchPosition
  // (continuously aktif). Cuma fallback ke one-shot getCurrentPosition kalau myLocation
  // belum tersedia. Gak pakai loading state lagi kalau ada myLocation.
  const getGpsAndOpen = useCallback((setter: (c: { lat: number; lng: number }) => void, loadingSetter: (v: boolean) => void) => {
    if (!mySession) return;

    // FAST PATH: watchPosition sudah maintain myLocation → open form instantly
    if (myLocation) {
      setter(myLocation);
      return;
    }

    // Fallback: tidak ada GPS yet - try quick one-shot (2s) dengan cached result
    loadingSetter(true);
    const fallback = (mySession.centerLat && mySession.centerLng)
      ? { lat: mySession.centerLat, lng: mySession.centerLng }
      : mapCenter;
    if (!navigator.geolocation) { loadingSetter(false); setter(fallback); return; }
    let done = false;
    // Hard cap 2 detik - user tidak perlu nunggu lama
    const timer = setTimeout(() => {
      if (!done) { done = true; loadingSetter(false); setter(fallback); }
    }, 2000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return; done = true; clearTimeout(timer);
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyLocation(c); setLocationAccuracy(pos.coords.accuracy);
        loadingSetter(false); setter(c);
      },
      () => { if (done) return; done = true; clearTimeout(timer); loadingSetter(false); setter(fallback); },
      { enableHighAccuracy: true, timeout: 2000, maximumAge: 10000 },
    );
  }, [mySession, myLocation, mapCenter]);

  const handleAddProspect = useCallback(() => getGpsAndOpen(setPendingCoord, setAddLoading), [getGpsAndOpen]);
  const handleAddReport = useCallback(() => getGpsAndOpen(setPendingReportCoord, setReportLoading), [getGpsAndOpen]);

  // Show all leads from this session (not just today) - session may span multiple days
  const sessionLeads = myLeads.filter(l =>
    l.createdAt && mySession?.startedAt && l.createdAt >= mySession.startedAt
  );
  const otherSessions = teamSessions.filter(s => s.userId !== user?.id);
  // fieldLogs already filtered by sessionId on server - show all
  const sessionLogs = fieldLogs;

  return (
    <div className="relative flex-1 min-h-0" style={{ height: '100%' }}>
      {/* ================ MAP ================ */}
      <div className="fixed inset-0 md:absolute md:inset-0">
        {!isLoaded ? (
          <div className="h-full flex items-center justify-center" style={{ background: T.surface }}>
            <div className="flex items-center gap-3" style={{ color: T.secondary }}>
              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: T.outlineV, borderTopColor: T.accent }} />
              <span className="text-sm">Memuat peta...</span>
            </div>
          </div>
        ) : (
          <GoogleMap
            mapContainerClassName="h-full w-full"
            center={undefined}
            zoom={15}
            onClick={handleMapClick}
            onLoad={m => { mapRef.current = m; m.setCenter(mapCenter); }}
            onIdle={() => {
              const m = mapRef.current;
              if (!m) return;
              const z = m.getZoom();
              if (z !== undefined) setMapZoom(z);
              const b = m.getBounds();
              if (b) {
                const ne = b.getNorthEast(); const sw = b.getSouthWest();
                setMapBounds({ n: ne.lat(), s: sw.lat(), e: ne.lng(), w: sw.lng() });
              }
            }}
            options={{ fullscreenControl: false, streetViewControl: false, mapTypeControl: false, zoomControl: false }}
          >
            {/* ODP markers - clustered when zoomed out, individual when zoomed in */}
            {isOverview ? (
              <MarkerClusterer options={{ maxZoom: isMobile ? 15 : 14, gridSize: isMobile ? 60 : 50 }}>
                {(clusterer) => (
                  <>
                    {visibleOdps.map(odp => {
                      const pct = odp.capacity ? Math.round(((odp.usedCapacity ?? 0) / odp.capacity) * 100) : 0;
                      const { color, stroke } = odpUsageColor(pct);
                      return (
                        <Marker key={`o-${odp.id}`}
                          position={{ lat: odp.lat!, lng: odp.lng! }}
                          icon={dotIcon(color, stroke, isMobile ? 6 : 8)}
                          title={`${odp.name} (${odp.usedCapacity ?? 0}/${odp.capacity ?? 8})`}
                          zIndex={3} clusterer={clusterer}
                          onClick={() => setSelectedOdp(odp)}
                        />
                      );
                    })}
                  </>
                )}
              </MarkerClusterer>
            ) : (
              visibleOdps.map(odp => {
                const pct = odp.capacity ? Math.round(((odp.usedCapacity ?? 0) / odp.capacity) * 100) : 0;
                const { color, stroke } = odpUsageColor(pct);
                return (
                  <Marker key={`o-${odp.id}`}
                    position={{ lat: odp.lat!, lng: odp.lng! }}
                    icon={dotIcon(color, stroke, isMobile ? 8 : 10)}
                    title={odp.name} zIndex={3}
                    onClick={() => setSelectedOdp(odp)}
                  />
                );
              })
            )}

            {/* Field log markers */}
            {sessionLogs.filter(l => l.lat && l.lng).map(log => {
              const cfg = LOG_TYPE_MAP[log.type];
              const color = cfg?.color ?? "#6B7280";
              return (
                <Marker key={`log-${log.id}`}
                  position={{ lat: log.lat!, lng: log.lng! }}
                  icon={{
                    path: "M-1,-1 L1,-1 L1,1 L-1,1 Z",
                    scale: 7, fillColor: color, fillOpacity: 0.9,
                    strokeColor: "#fff", strokeWeight: 2, rotation: 45,
                  }}
                  title={log.title} zIndex={4}
                />
              );
            })}

            {/* Team sessions - circle coverage 150m + marker bulat 10px supaya
                admin bisa LIHAT tim di peta + area kerja mereka */}
            {otherSessions.flatMap((s, i) => s.centerLat && s.centerLng ? [
              <Circle key={`t-c-${s.id}`}
                center={{ lat: s.centerLat, lng: s.centerLng }} radius={150}
                options={{
                  fillColor: TEAM_COLORS[i % TEAM_COLORS.length], fillOpacity: 0.10,
                  strokeColor: TEAM_COLORS[i % TEAM_COLORS.length], strokeOpacity: 0.55, strokeWeight: 2,
                  clickable: false,
                }}
              />,
              <Marker key={`t-m-${s.id}`}
                position={{ lat: s.centerLat, lng: s.centerLng }}
                icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 10,
                  fillColor: TEAM_COLORS[i % TEAM_COLORS.length], fillOpacity: 1,
                  strokeColor: "#fff", strokeWeight: 3 }}
                title={`Tim: ${(s as any).userName ?? "anggota"}`}
                zIndex={5}
              />,
            ] : [])}

            {/* My session - coverage circle 150m + marker (supaya admin sejawat lihat
                area kerja kita + supaya tim sendiri tau titik awal sesi) */}
            {mySession?.centerLat && mySession?.centerLng && (
              <>
                <Circle center={{ lat: mySession.centerLat, lng: mySession.centerLng }} radius={150}
                  options={{
                    fillColor: "#22C55E", fillOpacity: 0.10,
                    strokeColor: "#16A34A", strokeOpacity: 0.70, strokeWeight: 2,
                    clickable: false,
                  }}
                />
                <Marker position={{ lat: mySession.centerLat, lng: mySession.centerLng }}
                  icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 7,
                    fillColor: "#16A34A", fillOpacity: 0.85,
                    strokeColor: "#fff", strokeWeight: 2 }}
                  title="Titik awal sesi" zIndex={7}
                />
              </>
            )}

            {/* My GPS accuracy circle - tipis, ukuran sesuai accuracy sebenarnya */}
            {myLocation && locationAccuracy && locationAccuracy < 200 && (
              <Circle center={myLocation} radius={locationAccuracy}
                options={{ fillColor: "#3B82F6", fillOpacity: 0.08,
                  strokeColor: "#3B82F6", strokeOpacity: 0.35, strokeWeight: 1,
                  clickable: false }}
              />
            )}

            {/* My GPS dot - titik real-time, lebih besar + shadow biar visible */}
            {myLocation && (
              <Marker position={myLocation}
                icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 11,
                  fillColor: "#3B82F6", fillOpacity: 1, strokeColor: "#fff", strokeWeight: 4 }}
                title={`Posisi saya${locationAccuracy ? ` (±${Math.round(locationAccuracy)}m)` : ""}`}
                zIndex={10}
              />
            )}

            {/* Today's leads */}
            {sessionLeads.filter(l => l.lat && l.lng).map(lead => (
              <Marker key={`l-${lead.id}`}
                position={{ lat: lead.lat!, lng: lead.lng! }}
                icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 7,
                  fillColor: CAT_COLORS[lead.category ?? "lainnya"] ?? "#6B7280",
                  fillOpacity: 0.9, strokeColor: "#fff", strokeWeight: 2 }}
                title={lead.name} zIndex={5}
              />
            ))}
          </GoogleMap>
        )}
      </div>

      {/* ================ ODP INFO CARD (Terra) ================ */}
      {selectedOdp && <OdpInfoCard odp={selectedOdp} onClose={() => setSelectedOdp(null)} />}

      {/* ================ GPS BUTTON ================ */}
      <button onClick={() => locateMe()}
        className="fixed bottom-36 left-3 z-30 w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all md:absolute md:bottom-6 md:left-3"
        style={{ background: T.bg }}>
        <Navigation2 className="h-4 w-4" style={{ color: T.accent }} />
      </button>

      {/* GPS loading */}
      {(addLoading || reportLoading) && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-30 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 whitespace-nowrap md:absolute"
          style={{ background: T.accent }}>
          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Mendapatkan lokasi GPS...
        </div>
      )}

      {/* ================ TEAM popup (mobile) ================ */}
      {showTeam && otherSessions.length > 0 && (
        <div className="fixed bottom-36 left-0 right-0 z-40 px-3 md:hidden">
          <div className="rounded-2xl shadow-xl p-3 space-y-2" style={{ background: T.bg }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold flex items-center gap-1.5" style={{ color: T.deep }}>
                <Users className="h-3.5 w-3.5" style={{ color: T.accent }} /> Tim Aktif
              </p>
              <button onClick={() => setShowTeam(false)}>
                <X className="h-3.5 w-3.5" style={{ color: T.secondary }} />
              </button>
            </div>
            {otherSessions.map((s, i) => (
              <div key={s.id}
                onClick={() => { if (s.centerLat && s.centerLng) { setMapCenter({ lat: s.centerLat, lng: s.centerLng }); mapRef.current?.panTo({ lat: s.centerLat!, lng: s.centerLng! }); mapRef.current?.setZoom(16); setShowTeam(false); } }}
                className="flex items-center gap-2.5 cursor-pointer p-2 rounded-xl" style={{ background: T.surface }}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                  style={{ background: TEAM_COLORS[i % TEAM_COLORS.length] }}>
                  {s.userInitial ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: T.deep }}>{s.userName}</p>
                  <p className="text-[10px]" style={{ color: T.secondary }}>{formatDuration(s.startedAt)} · {s.leadCount ?? 0} prospek</p>
                </div>
                <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: T.outlineV }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ================ MOBILE BOTTOM STRIP ================ */}
      <div className="fixed bottom-0 left-0 right-0 z-30 md:hidden">
        {!mySession && !sessionLoading ? (
          <div className="px-4 py-3" style={{ background: T.bg, borderTop: `1px solid ${T.outlineV}30` }}>
            <button onClick={handleStart} disabled={startSession.isPending}
              className="w-full flex items-center justify-center gap-2 py-3.5 text-white rounded-xl text-sm font-bold disabled:opacity-60 shadow-lg"
              style={{ background: `linear-gradient(135deg, ${T.deep}, ${T.container})` }}>
              {startSession.isPending
                ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Play className="h-4 w-4" />}
              {startSession.isPending ? "Memulai..." : "Mulai Canvassing"}
            </button>
          </div>
        ) : mySession ? (
          <div className="backdrop-blur-sm px-3 py-2.5 space-y-2"
            style={{ background: `${T.bg}F0`, borderTop: `1px solid ${T.outlineV}30` }}>
            {/* Status bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs font-bold" style={{ color: T.deep }}>{mySession.name}</span>
                <span className="text-[10px] flex items-center gap-0.5" style={{ color: T.secondary }}>
                  <Clock className="h-3 w-3" />{formatDuration(mySession.startedAt)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px]" style={{ color: T.secondary }}>
                <span><strong style={{ color: T.deep }}>{sessionLeads.length}</strong> prospek</span>
                {sessionLogs.length > 0 && <span><strong style={{ color: T.deep }}>{sessionLogs.length}</strong> laporan</span>}
                {otherSessions.length > 0 && (
                  <button onClick={() => setShowTeam(v => !v)} className="flex items-center gap-0.5" style={{ color: T.accent }}>
                    <Users className="h-3.5 w-3.5" /><span>{otherSessions.length}</span>
                  </button>
                )}
              </div>
            </div>
            {/* Action buttons - 2 main + end */}
            <div className="flex gap-2">
              <button onClick={handleAddProspect}
                disabled={addLoading || createLead.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold disabled:opacity-60"
                style={{ background: T.accent + "15", color: T.accent, border: `1px solid ${T.accent}25` }}>
                {addLoading
                  ? <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: T.accent + "30", borderTopColor: T.accent }} />
                  : <Plus className="h-4 w-4" />}
                Prospek
              </button>
              <button onClick={handleAddReport}
                disabled={reportLoading || createLog.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold disabled:opacity-60"
                style={{ background: "#3B82F615", color: "#3B82F6", border: "1px solid #3B82F625" }}>
                {reportLoading
                  ? <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor: "#3B82F630", borderTopColor: "#3B82F6" }} />
                  : <FileText className="h-4 w-4" />}
                Laporan
              </button>
              <button onClick={() => setConfirmEnd(true)}
                disabled={endSession.isPending}
                className="px-3 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                style={{ background: "#EF444415", color: "#EF4444", border: "1px solid #EF444425" }}>
                <Square className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 flex items-center justify-center" style={{ background: T.bg, borderTop: `1px solid ${T.outlineV}30` }}>
            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: T.outlineV, borderTopColor: T.accent }} />
          </div>
        )}
      </div>

      {/* ================ DESKTOP RIGHT SIDEBAR ================ */}
      <div className="hidden md:flex md:absolute md:right-0 md:top-0 md:bottom-0 md:w-80 flex-col overflow-hidden z-20"
        style={{ background: T.bg, borderLeft: `1px solid ${T.outlineV}30` }}>
        {/* Header */}
        <div className="p-4 shrink-0" style={{ background: T.surface, borderBottom: `1px solid ${T.outlineV}20` }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-sm" style={{ color: T.deep }}>Canvassing</p>
              <p className="text-[10px]" style={{ color: T.secondary }}>
                {mySession ? "Sesi aktif" : "Belum ada sesi"}
              </p>
            </div>
            {mySession && (
              <span className="text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded"
                style={{ background: "#22C55E15", color: "#22C55E" }}>
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                {formatDuration(mySession.startedAt)}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* No session */}
          {!mySession && !sessionLoading && (
            <div className="rounded-2xl p-5 text-center space-y-3" style={{ background: T.surface, border: `2px dashed ${T.outlineV}` }}>
              <p className="text-sm font-bold" style={{ color: T.deep }}>Mulai Canvassing</p>
              <p className="text-xs" style={{ color: T.secondary }}>Check-in GPS untuk tandai area</p>
              <button onClick={handleStart} disabled={startSession.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-white rounded-xl text-sm font-bold disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${T.deep}, ${T.container})` }}>
                {startSession.isPending
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Play className="h-4 w-4" />}
                {startSession.isPending ? "Memulai..." : "Check-in & Mulai"}
              </button>
            </div>
          )}

          {/* Active session */}
          {mySession && (
            <div className="space-y-3">
              {/* Session info card */}
              <div className="rounded-xl p-3" style={{ background: "#22C55E10", border: "1px solid #22C55E20" }}>
                <p className="text-xs font-bold" style={{ color: "#15803D" }}>{mySession.name}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px]" style={{ color: "#22C55E" }}>{formatDuration(mySession.startedAt)} berjalan</span>
                  <span className="text-[10px]" style={{ color: "#22C55E" }}>{sessionLeads.length} prospek · {sessionLogs.length} laporan</span>
                </div>
              </div>

              {/* Two action buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={handleAddProspect}
                  disabled={addLoading || createLead.isPending}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-bold disabled:opacity-60 transition-all hover:shadow-md"
                  style={{ background: T.accent + "10", color: T.accent, border: `1px solid ${T.accent}20` }}>
                  {addLoading
                    ? <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: T.accent + "30", borderTopColor: T.accent }} />
                    : <Plus className="h-5 w-5" />}
                  Tambah Prospek
                </button>
                <button onClick={handleAddReport}
                  disabled={reportLoading || createLog.isPending}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-bold disabled:opacity-60 transition-all hover:shadow-md"
                  style={{ background: "#3B82F610", color: "#3B82F6", border: "1px solid #3B82F620" }}>
                  {reportLoading
                    ? <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "#3B82F630", borderTopColor: "#3B82F6" }} />
                    : <FileText className="h-5 w-5" />}
                  Laporan Area
                </button>
              </div>

              {/* End session */}
              <button onClick={() => setConfirmEnd(true)}
                disabled={endSession.isPending}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
                style={{ background: "#EF444410", color: "#EF4444", border: "1px solid #EF444420" }}>
                <Square className="h-4 w-4" /> Akhiri Sesi
              </button>
            </div>
          )}

          {/* Tabs: Leads / Logs */}
          {mySession && (
            <div className="flex gap-1 p-0.5 rounded-xl" style={{ background: T.surfaceHi }}>
              <button onClick={() => setSideTab("leads")}
                className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all"
                style={sideTab === "leads" ? { background: "white", color: T.deep } : { color: T.secondary }}>
                Prospek ({sessionLeads.length})
              </button>
              <button onClick={() => setSideTab("logs")}
                className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all"
                style={sideTab === "logs" ? { background: "white", color: T.deep } : { color: T.secondary }}>
                Laporan ({sessionLogs.length})
              </button>
            </div>
          )}

          {/* Leads list */}
          {mySession && sideTab === "leads" && sessionLeads.length > 0 && (
            <div className="space-y-1.5">
              {sessionLeads.slice(0, 12).map(l => {
                const Icon = CAT_ICONS[l.category ?? "lainnya"];
                const color = CAT_COLORS[l.category ?? "lainnya"];
                return (
                  <div key={l.id}
                    onClick={() => { if (l.lat && l.lng) { setMapCenter({ lat: l.lat, lng: l.lng }); mapRef.current?.panTo({ lat: l.lat!, lng: l.lng! }); mapRef.current?.setZoom(18); } }}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer transition-all"
                    style={{ background: "white" }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: color + "15" }}>
                      <Icon className="h-3.5 w-3.5" style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: T.deep }}>{l.name}</p>
                      <p className="text-[10px]" style={{ color: T.secondary }}>{fmtTime(l.createdAt)}</p>
                    </div>
                    <ChevronRight className="h-3 w-3 shrink-0" style={{ color: T.outlineV }} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Logs list */}
          {mySession && sideTab === "logs" && sessionLogs.length > 0 && (
            <div className="space-y-1.5">
              {sessionLogs.map(log => {
                const cfg = LOG_TYPE_MAP[log.type] ?? LOG_TYPES[5];
                const Icon = cfg.icon;
                const sevColor = SEVERITY_OPTIONS.find(s => s.key === log.severity)?.color ?? "#3B82F6";
                return (
                  <div key={log.id}
                    onClick={() => { if (log.lat && log.lng) { setMapCenter({ lat: log.lat, lng: log.lng }); mapRef.current?.panTo({ lat: log.lat!, lng: log.lng! }); mapRef.current?.setZoom(18); } }}
                    className="p-3 rounded-xl cursor-pointer transition-all"
                    style={{ background: "white" }}>
                    <div className="flex items-center gap-2.5 mb-1">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: cfg.color + "15" }}>
                        <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate" style={{ color: T.deep }}>{log.title}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                            style={{ background: sevColor + "15", color: sevColor }}>
                            {SEVERITY_OPTIONS.find(s => s.key === log.severity)?.label}
                          </span>
                          <span className="text-[10px]" style={{ color: T.secondary }}>{fmtTime(log.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    {log.description && (
                      <p className="text-[11px] ml-9 mt-0.5 line-clamp-2" style={{ color: T.secondary }}>{log.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state for tabs */}
          {mySession && sideTab === "leads" && sessionLeads.length === 0 && (
            <div className="text-center py-6">
              <Plus className="h-8 w-8 mx-auto mb-2" style={{ color: T.outlineV }} />
              <p className="text-xs" style={{ color: T.secondary }}>Belum ada prospek hari ini</p>
            </div>
          )}
          {mySession && sideTab === "logs" && sessionLogs.length === 0 && (
            <div className="text-center py-6">
              <FileText className="h-8 w-8 mx-auto mb-2" style={{ color: T.outlineV }} />
              <p className="text-xs" style={{ color: T.secondary }}>Belum ada laporan hari ini</p>
            </div>
          )}

          {/* Team */}
          {otherSessions.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5" style={{ color: T.outline }}>
                <Users className="h-3.5 w-3.5" /> Tim Aktif ({otherSessions.length})
              </p>
              {otherSessions.map((s, i) => (
                <div key={s.id}
                  onClick={() => { if (s.centerLat && s.centerLng) { setMapCenter({ lat: s.centerLat, lng: s.centerLng }); mapRef.current?.panTo({ lat: s.centerLat!, lng: s.centerLng! }); mapRef.current?.setZoom(16); } }}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl cursor-pointer mb-1.5"
                  style={{ background: "white" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ background: TEAM_COLORS[i % TEAM_COLORS.length] }}>
                    {s.userInitial ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: T.deep }}>{s.userName}</p>
                    <p className="text-[10px]" style={{ color: T.secondary }}>{formatDuration(s.startedAt)} · {s.leadCount ?? 0} prospek</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ================ FORMS & DIALOGS ================ */}
      {pendingCoord && mySession && (
        <AddLeadForm
          lat={pendingCoord.lat} lng={pendingCoord.lng}
          odps={odps} sessionId={mySession.id}
          onSave={data => createLead.mutate(data)}
          onCancel={() => setPendingCoord(null)}
          isSaving={createLead.isPending}
        />
      )}

      {pendingReportCoord && mySession && (
        <FieldReportForm
          lat={pendingReportCoord.lat} lng={pendingReportCoord.lng}
          odps={odps} sessionId={mySession.id}
          onSave={data => createLog.mutate(data)}
          onCancel={() => setPendingReportCoord(null)}
          isSaving={createLog.isPending}
        />
      )}

      {confirmEnd && mySession && (
        <ConfirmDialog
          message="Akhiri sesi canvassing ini? Data prospek dan laporan tetap tersimpan."
          onConfirm={() => endSession.mutate(mySession.id)}
          onCancel={() => setConfirmEnd(false)}
        />
      )}
    </div>
  );
}
