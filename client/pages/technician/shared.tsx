import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Check, Edit3, Activity as ActivityIcon } from "lucide-react";

// v4.2.18 (B): wired panels for ticket detail
import { Customer360Panel } from "@/components/tickets/Customer360Panel";
import { AssetPanel } from "@/components/tickets/AssetPanel";
import { ActivityTimeline } from "@/components/tickets/ActivityTimeline";
import { TicketComments } from "@/components/tickets/TicketComments";
import { TicketActionToolbar } from "@/components/tickets/TicketActionToolbar";
import { ConfirmStageModal } from "@/components/tickets/ConfirmStageModal";
import { MultiPhotoUploader, DEFAULT_PHOTO_SLOTS } from "@/components/tickets/MultiPhotoUploader";
import { SignaturePad } from "@/components/tickets/SignaturePad";
import { ResolutionForm, type ResolutionData, type MaterialItem } from "@/components/tickets/ResolutionForm";

// -- Types ------------------------------------------------------------------

export type FieldType = "photo" | "checklist" | "notes" | "numeric" | "speedtest" | "barcode" | "signature" | "gps" | "eta" | "rating";
export type CustomFieldType = "text" | "number" | "textarea" | "select" | "checkbox" | "date";

export interface CustomField {
  key: string;
  label: string;
  type: CustomFieldType;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: string[];
  unit?: string;
}

export interface WorkflowStage {
  key: string;
  label: string;
  description?: string;
  fields?: FieldType[];
  customFields?: CustomField[];
  sortOrder: number;
  slaMinutes?: number;
  isFinal?: boolean;
}

export interface Ticket {
  id: number;
  ticketNumber: string;
  categoryId: number | null;
  customerId: number | null;
  odpId?: number | null;
  title: string;
  description: string | null;
  priority: string | null;
  status: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  currentStage: string | null;
  stageEnteredAt: string | null;
  slaDeadline: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolution: string | null;
  // v4.2.18 (D): resolution code + material + BAST
  resolutionCode?: string | null;
  materialUsed?: string | null;       // JSON string array
  bastNumber?: string | null;
  bastPdfUrl?: string | null;
  createdAt: string | null;
  checklist: string | null;
  actualDuration?: number | null;
  // v4.2.18 (A.1): tiket lama yang ditutup tanpa workflow stages
  legacyResolution?: number | null;
}

export interface Transition {
  stage: string;
  label: string;
  enteredAt: string;
  exitedAt: string | null;
  durationSec: number | null;
  note: string | null;
  evidenceId: number | null;
  lat?: number | null;
  lng?: number | null;
  metadata?: Record<string, any> | null;  // v4.2.7: structured field values
}

export interface Workflow {
  currentStage: string | null;
  stageEnteredAt: string | null;
  stages: WorkflowStage[];
  transitions: Transition[];
  slaDeadline: string | null;
  // v4.2.18 (C.1): pause-aware SLA fields
  effectiveSlaDeadline?: string | null;
  slaRemainingSec: number | null;
  slaOverdue: boolean;
  isOnHold?: boolean;
  activePause?: { id: number; reason: string; note: string | null; startedAt: string } | null;
  totalPauseSec?: number;
}

export interface EvidenceItem {
  id: number;
  type: string;
  photoData?: string | null;
  hasPhoto?: boolean;
  capturedAt: string | null;
  notes: string | null;
}

export interface Customer {
  id: number;
  name: string;
  customerId: string;
  address: string | null;
  phone: string | null;
}

export interface Category {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
}

// -- Helpers ----------------------------------------------------------------

// v4.2.7: extract raw notes dari serialized note string (skip "Pengukuran:", "Serial:", dst)
export function extractRawNote(serialized: string): string {
  const parts = serialized.split(" · ");
  // Drop parts yang punya "label:" prefix (Pengukuran/Serial/Speed/TTD/custom)
  const raw = parts.filter(p => !/:/i.test(p));
  return raw.join(" · ");
}

export function fmtTimeIDN(date: string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDateTimeIDN(date: string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "-";
  if (seconds < 60) return `${seconds}d`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}j ${m}m` : `${h}j`;
}

export function fmtSLA(sec: number, overdue: boolean): string {
  const abs = Math.abs(sec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const sign = overdue ? "−" : "";
  if (h > 0) return `${sign}${h}j ${m}m`;
  return `${sign}${m}m`;
}

export function getGpsPosition(timeoutMs = 12000): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("GPS tidak tersedia"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(`GPS gagal: ${err.message}`)),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

export async function compressImage(file: File, maxSize = 1280, quality = 0.7): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Gagal baca file"));
    reader.readAsDataURL(file);
  });
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width = Math.round(width * ratio); height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function useLiveCountdown(targetIso: string | null | undefined): { sec: number; overdue: boolean } {
  const [val, setVal] = useState({ sec: 0, overdue: false });
  useEffect(() => {
    if (!targetIso) return;
    const target = new Date(targetIso).getTime();
    const tick = () => {
      const diff = Math.round((target - Date.now()) / 1000);
      setVal({ sec: diff, overdue: diff < 0 });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return val;
}

// -- Main ------------------------------------------------------------------


export function StageDot({ index, done, current, catColor }: { index: number; done: boolean; current: boolean; catColor: string }) {
  return (
    <div style={{
      width: 24, height: 24, borderRadius: 12,
      background: done ? "#10b981" : current ? catColor : "#fff",
      border: `2px solid ${done ? "#10b981" : current ? catColor : "#e2e8f0"}`,
      display: "grid", placeItems: "center",
      fontSize: 11, fontWeight: 700,
      color: done || current ? "#fff" : "#94a3b8",
      flexShrink: 0,
    }}>
      {done ? <Check style={{ width: 11, height: 11 }} strokeWidth={3.5} /> : index + 1}
    </div>
  );
}

export function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, color: "#475569",
      textTransform: "uppercase", letterSpacing: 0.6,
      marginBottom: 4,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
      padding: "3px 8px", borderRadius: 4,
      background: `${color}15`, color,
    }}>
      {children}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const config: Record<string, { bg: string; color: string }> = {
    urgent: { bg: "#fee2e2", color: "#b91c1c" },
    high:   { bg: "#ffedd5", color: "#c2410c" },
    medium: { bg: "#dbeafe", color: "#1d4ed8" },
    low:    { bg: "#f1f5f9", color: "#475569" },
  };
  const c = config[priority] ?? config.medium;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5,
      padding: "3px 8px", borderRadius: 4,
      background: c.bg, color: c.color,
    }}>
      {priority}
    </span>
  );
}

// v4.2.7: Generic renderer untuk admin-defined custom fields
export function CustomFieldRender({ field, value, onChange }: {
  field: CustomField;
  value: any;
  onChange: (v: any) => void;
}) {
  return (
    <FieldCard
      icon={<Edit3 style={{ width: 14, height: 14 }} />}
      label={field.label}
      required={field.required}
      hint={field.hint}
    >
      {field.type === "text" && (
        <input
          type="text"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13 }}
        />
      )}
      {field.type === "number" && (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number" step="0.01"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            style={{ flex: 1, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}
          />
          {field.unit && (
            <span style={{ padding: "8px 12px", background: "#f1f5f9", borderRadius: 6, fontSize: 13, fontWeight: 600 }}>{field.unit}</span>
          )}
        </div>
      )}
      {field.type === "textarea" && (
        <Textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: 10, fontSize: 13, fontFamily: "inherit", resize: "none" }}
        />
      )}
      {field.type === "select" && (
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, background: "#fff" }}
        >
          <option value="">- pilih -</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}
      {field.type === "checkbox" && (
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <span style={{ fontSize: 13, fontWeight: 500 }}>{field.placeholder ?? "Centang kalau ya"}</span>
        </label>
      )}
      {field.type === "date" && (
        <input
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, fontFamily: '"JetBrains Mono", monospace' }}
        />
      )}
    </FieldCard>
  );
}

export function FieldCard({ icon, label, required, hint, children }: {
  icon: React.ReactNode;
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white" style={{ borderRadius: 10, padding: 12, marginBottom: 10, border: "1px solid #e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: "#475569", display: "flex" }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>
          {label} {required && <span style={{ color: "#ef4444" }}>*</span>}
        </span>
        {hint && <span style={{ fontSize: 10, color: "#94a3b8" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function SpeedField({ label, value, onChange, unit, color }: { label: string; value: string; onChange: (v: string) => void; unit: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>{label}</div>
      <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 4 }}>
        <input
          type="number" step="0.1" value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          style={{ background: "transparent", color, fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums", outline: "none", border: "none", width: "100%", minWidth: 0 }}
        />
        <span style={{ fontSize: 9, color: "#94a3b8", flexShrink: 0 }}>{unit}</span>
      </div>
    </div>
  );
}

export function Metric({ label, value, icon, borderTop, borderLeft, borderTopMobile, borderLeftDesktop, title }: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  borderTop?: boolean;
  borderLeft?: boolean;
  borderTopMobile?: boolean;
  borderLeftDesktop?: boolean;
  title?: string;
}) {
  return (
    <div
      className={cn(
        borderTopMobile && "border-t lg:border-t-0",
        borderLeftDesktop && "lg:border-l",
      )}
      title={title}
      style={{
        padding: "12px 14px",
        borderTop: borderTop ? "1px solid #e2e8f0" : undefined,
        borderLeft: borderLeft ? "1px solid #e2e8f0" : undefined,
        borderColor: "#e2e8f0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#94a3b8", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {icon}<span>{label}</span>
      </div>
      <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// Inline 14px Activity icon as helper (lucide Activity)
export function Activity14() { return <ActivityIcon style={{ width: 14, height: 14 }} />; }
