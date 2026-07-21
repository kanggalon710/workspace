// Shared types, helpers, dan config untuk fitur Tickets / Work Order.
// Dipakai bersama oleh TicketingPage + komponen turunannya (KanbanView, StatsCard, dst.)
// supaya tidak ada definisi tipe/konstanta yang terduplikasi antar file.
import { Plus, ArrowRight, UserPlus, MessageSquare, Calendar } from "lucide-react";

// -- Types ----------------------------------------------------------------
export interface TicketCategory {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
  isActive: number | null;
  sortOrder: number | null;
  createdAt: string | null;
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  categoryId: number | null;
  customerId: number | null;
  title: string;
  description: string | null;
  priority: string | null;
  status: string | null;
  assignedTo: number | null;
  createdBy: number;
  scheduledDate: string | null;
  scheduledTime: string | null;
  deadline: string | null;
  slaDeadline: string | null;
  // enriched server-side di list endpoint (hindari fetch seluruh tabel customers/users)
  customerName?: string | null;
  customerCode?: string | null;
  assigneeName?: string | null;
  estimatedDuration: number | null;
  actualDuration: number | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  odpId: number | null;
  resolution: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface TicketActivity {
  id: number;
  ticketId: number;
  userId: number;
  type: string;
  content: string | null;
  createdAt: string;
}

export interface TicketWithActivities extends Ticket {
  activities: TicketActivity[];
}

export interface SafeUser {
  id: number;
  username: string;
  name: string;
  role: string;
}

export interface Customer {
  id: number;
  name: string;
  customerId: string;
  address: string | null;
  phone: string | null;
  [key: string]: any;
}

export interface TicketStats {
  open: number;
  inProgress: number;
  pending: number;
  resolvedThisMonth: number;
  total: number;
}

// -- Helpers --------------------------------------------------------------
export function formatDuration(minutes: number | null): string {
  if (!minutes) return "-";
  if (minutes < 60) return `${minutes} menit`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} jam ${m} menit` : `${h} jam`;
}

export function formatDate(date: string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(date: string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** v4.2.4: SLA countdown badge tone. */
export function slaTone(slaDeadline: string | null | undefined): { tone: "ok" | "caution" | "warning" | "danger" | "expired" | null; remainingMs: number | null; label: string | null } {
  if (!slaDeadline) return { tone: null, remainingMs: null, label: null };
  const remaining = new Date(slaDeadline).getTime() - Date.now();
  if (remaining <= 0) return { tone: "expired", remainingMs: remaining, label: "SLA TERLEWAT" };
  const mins = Math.floor(remaining / 60000);
  let label: string;
  if (mins < 60) label = `${mins}m`;
  else {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    label = m > 0 ? `${h}j ${m}m` : `${h}j`;
  }
  let tone: "ok" | "caution" | "warning" | "danger";
  if (mins < 30) tone = "danger";
  else if (mins < 120) tone = "warning";
  else if (mins < 360) tone = "caution";
  else tone = "ok";
  return { tone, remainingMs: remaining, label };
}

// -- Config ---------------------------------------------------------------
export const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Rendah", color: "bg-gray-100 text-gray-700" },
  medium: { label: "Sedang", color: "bg-blue-100 text-blue-700" },
  high: { label: "Tinggi", color: "bg-orange-100 text-orange-700" },
  urgent: { label: "Urgent", color: "bg-red-100 text-red-700" },
};

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "bg-blue-100 text-blue-700" },
  assigned: { label: "Ditugaskan", color: "bg-cyan-100 text-cyan-700" },
  in_progress: { label: "Dikerjakan", color: "bg-orange-100 text-orange-700" },
  pending: { label: "Tertunda", color: "bg-amber-100 text-amber-700" },
  resolved: { label: "Selesai", color: "bg-green-100 text-green-700" },
  closed: { label: "Ditutup", color: "bg-gray-100 text-gray-600" },
};

export const ACTIVITY_ICON_CONFIG: Record<string, { icon: any; color: string }> = {
  created: { icon: Plus, color: "text-green-600 bg-green-50" },
  status_change: { icon: ArrowRight, color: "text-blue-600 bg-blue-50" },
  assigned: { icon: UserPlus, color: "text-purple-600 bg-purple-50" },
  note: { icon: MessageSquare, color: "text-gray-600 bg-gray-100" },
  schedule_change: { icon: Calendar, color: "text-amber-600 bg-amber-50" },
};

export const DURATION_OPTIONS = [
  { value: "30", label: "30 menit" },
  { value: "60", label: "1 jam" },
  { value: "120", label: "2 jam" },
  { value: "180", label: "3 jam" },
  { value: "240", label: "4 jam" },
  { value: "480", label: "8 jam" },
  { value: "custom", label: "Kustom..." },
];
