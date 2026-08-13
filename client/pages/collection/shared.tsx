import { createContext, useContext } from "react";
import { formatRupiah } from "@shared/currency";
import { COLLECTION_OWNER_DIVISIONS, type Collection, type CollectionStageRow } from "@shared/schema";
import { AlertTriangle, MessageSquare, User as UserIcon, CheckCircle2, Calendar, DollarSign, PhoneCall, StickyNote, ArrowRight, Navigation } from "lucide-react";

/** Aktif jika kolom active null/1 (0 = nonaktif). Toleran data lama tanpa kolom. */
export const isStageActive = (s: any): boolean => Number(s?.active ?? 1) !== 0;
/** Daftar divisi spesifik yang bisa dipilih (tanpa "all" - itu diwakili toggle "Semua Divisi"). */
export const SELECTABLE_OWNER_DIVISIONS = COLLECTION_OWNER_DIVISIONS.filter((o) => o.value !== "all");

// Stage value sekarang dinamis (custom per-mitra) - sekadar string key.
export type CollectionStage = string;


// -- Stage metadata context (dinamis per-mitra) ------------------------------
export interface StageHelpers {
  stages: CollectionStageRow[];
  label: (key: string) => string;
  color: (key: string) => string;
  role: (key: string) => string;
}
export const StageCtx = createContext<StageHelpers>({
  stages: [], label: (k) => k, color: () => "#6B7280", role: () => "none",
});
export const useStages = () => useContext(StageCtx);

export interface Assignee { userId: number; userName: string; username: string; }

export interface CollectionWithCustomer extends Collection {
  activities?: any[];
  assignees?: Assignee[];
  customerName?: string;
  customerPhone?: string | null;
  customerIdDisplay?: string;
  pppoeUsername?: string | null;
  overdue?: boolean;                          // dihitung server (lewat tenggat) - untuk badge
  overdueReason?: "promise" | "sla" | null;
}

export const fmtRp = (n: number | null | undefined) => formatRupiah(n, "-");

export const fmtDate = (s: string | null | undefined) => {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return s; }
};

/** ISO/tanggal → "YYYY-MM-DD" untuk <input type="date">. Kosong bila tak valid. */
export const toDateInput = (s: string | null | undefined): string => {
  if (!s) return "";
  const str = String(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const d = new Date(str);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

export const daysSince = (iso: string | null | undefined): number => {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
};

export const ACTIVITY_CFG: Record<string, { label: string; icon: any; color: string }> = {
  note: { label: "Catatan", icon: StickyNote, color: "#6B7280" },
  call: { label: "Telepon", icon: PhoneCall, color: "#3B82F6" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, color: "#22C55E" },
  visit: { label: "Kunjungan", icon: Navigation, color: "#8B5CF6" },
  stage_change: { label: "Pindah Stage", icon: ArrowRight, color: "#F59E0B" },
  issue_set: { label: "Kendala", icon: AlertTriangle, color: "#DC2626" },
  promise_made: { label: "Janji Bayar", icon: Calendar, color: "#F59E0B" },
  auto_opened: { label: "Sistem: Isolir", icon: AlertTriangle, color: "#EF4444" },
  auto_closed: { label: "Sistem: Lunas", icon: CheckCircle2, color: "#22C55E" },
  payment_detected: { label: "Pembayaran", icon: DollarSign, color: "#22C55E" },
  assigned: { label: "Ditugaskan", icon: UserIcon, color: "#6366F1" },
};

/** division: undefined = board penuh (Keuangan/Finance). "cs"/"marketing" = view ter-scope
 * SOP delegasi - hanya menampilkan kartu di stage milik divisi tsb (cross-check delegasi). */
