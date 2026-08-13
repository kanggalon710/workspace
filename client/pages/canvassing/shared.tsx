import { Home, Building2, GraduationCap, Briefcase, HelpCircle, AlertTriangle, EyeOff, WifiOff, Shield, Star, MessageSquare } from "lucide-react";

// -- Terra Design Tokens --------------------------------------------------
export const T = {
  bg: "#faf9f8", deep: "#350800", secondary: "#755750", accent: "#ff5f2e",
  surface: "#f4f3f2", surfaceHi: "#e9e8e7", outline: "#827472",
  outlineV: "#d3c3c0", textSoft: "#504442", container: "#591300",
};

// -- Types ------------------------------------------------------------------
export interface Odp { id: number; name: string; lat?: number; lng?: number; capacity?: number; usedCapacity?: number; }
export interface Session {
  id: number; userId: number; userName?: string; userInitial?: string;
  name?: string; status: string; startedAt: string;
  leadCount?: number; centerLat?: number; centerLng?: number;
}
export interface Lead { id: number; name: string; category?: string; lat?: number; lng?: number; stage: string; createdAt: string; }
export interface FieldLog {
  id: number; sessionId: number; userId: number; type: string;
  title: string; description?: string | null;
  lat?: number | null; lng?: number | null;
  odpId?: number | null; severity: string; createdAt: string;
}

// -- Config ----------------------------------------------------------------
export const LOG_TYPES = [
  { key: "area_sepi", label: "Area Sepi", icon: EyeOff, color: "#6B7280", desc: "Tidak ada calon pelanggan" },
  { key: "akses_sulit", label: "Akses Sulit", icon: AlertTriangle, color: "#F59E0B", desc: "Jalan rusak, gang sempit" },
  { key: "kompetitor", label: "Kompetitor", icon: Shield, color: "#EF4444", desc: "Ada ISP lain dominan" },
  { key: "infrastruktur", label: "Infrastruktur", icon: WifiOff, color: "#8B5CF6", desc: "ODP jauh, kabel belum" },
  { key: "potensi_tinggi", label: "Potensi Tinggi", icon: Star, color: "#22C55E", desc: "Area potensial prospek" },
  { key: "lainnya", label: "Lainnya", icon: MessageSquare, color: "#3B82F6", desc: "Catatan umum lapangan" },
];
export const LOG_TYPE_MAP = Object.fromEntries(LOG_TYPES.map(t => [t.key, t]));
export const SEVERITY_OPTIONS = [
  { key: "info", label: "Info", color: "#3B82F6" },
  { key: "warning", label: "Perhatian", color: "#F59E0B" },
  { key: "critical", label: "Kritis", color: "#EF4444" },
];

export const CAT_ICONS: Record<string, any> = { rumahan: Home, bisnis: Briefcase, perkantoran: Building2, sekolah: GraduationCap, lainnya: HelpCircle };
export const CAT_COLORS: Record<string, string> = { rumahan: "#22C55E", bisnis: "#F59E0B", perkantoran: "#3B82F6", sekolah: "#8B5CF6", lainnya: "#6B7280" };
export const TEAM_COLORS = ["#3B82F6","#EF4444","#8B5CF6","#F59E0B","#EC4899","#14B8A6"];

// -- Helpers ----------------------------------------------------------------
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
export function findNearestOdp(lat: number, lng: number, odps: Odp[]) {
  let nearest: Odp | null = null; let minDist = Infinity;
  for (const o of odps) {
    if (!o.lat || !o.lng) continue;
    const d = haversine(lat, lng, o.lat, o.lng);
    if (d < minDist) { minDist = d; nearest = o; }
  }
  return nearest ? { odp: nearest, distance: minDist } : null;
}
export function formatDuration(startedAt: string) {
  const mins = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}j${mins % 60}m`;
}
export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

// -- Custom Confirm Dialog -------------------------------------------------
