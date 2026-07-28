/**
 * v4.2.7: TechnicianWorkPage - Structural redesign mode-based.
 *
 * State machine → render mode:
 *   open/assigned/in_progress/pending → ActiveMode    (stages + execution + CTA)
 *   resolved/closed                  → CompletedMode  (summary + read-only timeline)
 *   cancelled                        → CancelledMode  (red banner + read-only timeline)
 *
 * Ngga ada mixed state. Tiket selesai = HANYA tampilan summary. Tidak ada tombol "Selesaikan Stage" atau CTA edit.
 *
 * Pixel-match design source: mobile-teknisi.jsx (active mode) - inline styles literal.
 */

import { useState, useEffect, useMemo, useRef } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, MapPin, Phone, MessageSquare, ChevronRight, Check, Camera,
  Loader2, AlertTriangle, X, FileText, Edit3, Wifi, ScanLine, CheckCircle2,
  Clock, Star, Send, Activity as ActivityIcon, Calendar, Image as ImageIcon,
  XCircle, Award, Timer, Navigation,
} from "lucide-react";

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

type FieldType = "photo" | "checklist" | "notes" | "numeric" | "speedtest" | "barcode" | "signature" | "gps" | "eta" | "rating";
type CustomFieldType = "text" | "number" | "textarea" | "select" | "checkbox" | "date";

interface CustomField {
  key: string;
  label: string;
  type: CustomFieldType;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  options?: string[];
  unit?: string;
}

interface WorkflowStage {
  key: string;
  label: string;
  description?: string;
  fields?: FieldType[];
  customFields?: CustomField[];
  sortOrder: number;
  slaMinutes?: number;
  isFinal?: boolean;
}

interface Ticket {
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

interface Transition {
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

interface Workflow {
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

interface EvidenceItem {
  id: number;
  type: string;
  photoData?: string | null;
  hasPhoto?: boolean;
  capturedAt: string | null;
  notes: string | null;
}

interface Customer {
  id: number;
  name: string;
  customerId: string;
  address: string | null;
  phone: string | null;
}

interface Category {
  id: number;
  name: string;
  color: string | null;
  icon: string | null;
}

// -- Helpers ----------------------------------------------------------------

// v4.2.7: extract raw notes dari serialized note string (skip "Pengukuran:", "Serial:", dst)
function extractRawNote(serialized: string): string {
  const parts = serialized.split(" · ");
  // Drop parts yang punya "label:" prefix (Pengukuran/Serial/Speed/TTD/custom)
  const raw = parts.filter(p => !/:/i.test(p));
  return raw.join(" · ");
}

function fmtTimeIDN(date: string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTimeIDN(date: string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "-";
  if (seconds < 60) return `${seconds}d`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}j ${m}m` : `${h}j`;
}

function fmtSLA(sec: number, overdue: boolean): string {
  const abs = Math.abs(sec);
  const h = Math.floor(abs / 3600);
  const m = Math.floor((abs % 3600) / 60);
  const sign = overdue ? "−" : "";
  if (h > 0) return `${sign}${h}j ${m}m`;
  return `${sign}${m}m`;
}

function getGpsPosition(timeoutMs = 12000): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("GPS tidak tersedia"));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(new Error(`GPS gagal: ${err.message}`)),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

async function compressImage(file: File, maxSize = 1280, quality = 0.7): Promise<string> {
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

function useLiveCountdown(targetIso: string | null | undefined): { sec: number; overdue: boolean } {
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

export default function TechnicianWorkPage() {
  const [, params] = useRoute("/work/:id");
  const ticketId = params?.id;

  const [screen, setScreen] = useState<"list" | "stage">("list");
  const [activeStageKey, setActiveStageKey] = useState<string | null>(null);

  const { data: ticket, isLoading } = useQuery<Ticket>({
    queryKey: ["ticket-detail", ticketId],
    queryFn: () => api.get<Ticket>(`/tickets/${ticketId}`),
    enabled: !!ticketId,
    refetchInterval: 30_000,
  });
  const { data: workflow } = useQuery<Workflow>({
    queryKey: ["ticket-workflow", ticketId],
    queryFn: () => api.get<Workflow>(`/tickets/${ticketId}/workflow`),
    enabled: !!ticketId,
    refetchInterval: 15_000,
  });
  const { data: evidence = [] } = useQuery<EvidenceItem[]>({
    queryKey: ["ticket-evidence", ticketId],
    queryFn: () => api.get<EvidenceItem[]>(`/tickets/${ticketId}/evidence`),
    enabled: !!ticketId,
  });
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["ticket-categories"],
    queryFn: () => api.get<Category[]>("/ticket-categories"),
  });
  const { data: customer } = useQuery<Customer | null>({
    queryKey: ["customer-detail", ticket?.customerId],
    queryFn: async () => {
      if (!ticket?.customerId) return null;
      const all = await api.get<Customer[]>(`/customers?id=${ticket.customerId}`);
      return all.find((c) => c.id === ticket.customerId) ?? null;
    },
    enabled: !!ticket?.customerId,
  });
  // v4.2.16: tim teknisi yang bareng kerja di lapangan (lead + helpers)
  const { data: team = [] } = useQuery<Array<{ id: number; userId: number; role: string; userName: string; userRole: string; checkInAt: string | null; checkOutAt: string | null }>>({
    queryKey: ["ticket-team", ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}/team`),
    enabled: !!ticketId,
    refetchInterval: 30_000,
  });

  // Derivations (all hooks before any early return)
  const category = useMemo(() => categories.find((c) => c.id === ticket?.categoryId), [categories, ticket?.categoryId]);
  const stages = useMemo(() => (workflow?.stages ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder), [workflow]);
  const currentIdx = useMemo(() => stages.findIndex((s) => s.key === workflow?.currentStage), [stages, workflow?.currentStage]);
  const completedKeys = useMemo(() => new Set((workflow?.transitions ?? []).filter(t => t.exitedAt).map(t => t.stage)), [workflow]);

  if (isLoading || !ticket) {
    return (
      <div className="min-h-screen bg-[#f8fafc] grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const status = ticket.status ?? "open";
  const mode: "active" | "completed" | "cancelled" =
    status === "resolved" || status === "closed" ? "completed" :
    status === "cancelled" ? "cancelled" :
    "active";

  // Stage execution screen - only valid in ACTIVE mode
  if (mode === "active" && screen === "stage" && activeStageKey && ticketId) {
    const stage = stages.find((s) => s.key === activeStageKey);
    if (stage) {
      // v4.2.7: detect mode - kalau stage sudah done = edit, kalau current = advance
      const isStageDone = completedKeys.has(stage.key);
      const existingTransition = workflow?.transitions.find((t) => t.stage === stage.key);
      const execMode: "advance" | "edit" = isStageDone ? "edit" : "advance";
      return (
        <StageExecutionScreen
          ticket={ticket}
          ticketId={ticketId}
          stage={stage}
          stageIdx={stages.findIndex(s => s.key === stage.key)}
          totalStages={stages.length}
          category={category}
          mode={execMode}
          existingTransition={existingTransition}
          onBack={() => { setScreen("list"); setActiveStageKey(null); }}
          onComplete={() => { setScreen("list"); setActiveStageKey(null); }}
        />
      );
    }
  }

  // Render appropriate mode - RESPONSIVE: mobile single col, desktop 2-col with right rail
  return (
    <div className="min-h-screen" style={{ background: "#f8fafc", fontFamily: "Inter, sans-serif", color: "#0f172a" }}>
      <div className="mx-auto max-w-md md:max-w-3xl lg:max-w-6xl">
        {mode === "active" && (
          <ActiveMode
            ticket={ticket} workflow={workflow} stages={stages}
            currentIdx={currentIdx} completedKeys={completedKeys}
            category={category} customer={customer ?? undefined}
            team={team}
            ticketIdNum={ticket.id}
            onOpenStage={(key) => { setActiveStageKey(key); setScreen("stage"); }}
          />
        )}
        {mode === "completed" && (
          <CompletedMode
            ticket={ticket} workflow={workflow} stages={stages}
            transitions={workflow?.transitions ?? []}
            evidence={evidence} category={category} customer={customer ?? undefined}
          />
        )}
        {mode === "cancelled" && (
          <CancelledMode
            ticket={ticket} stages={stages} transitions={workflow?.transitions ?? []}
            evidence={evidence} category={category} customer={customer ?? undefined}
          />
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// ACTIVE MODE - open / assigned / in_progress / pending
// -------------------------------------------------------------------------

function ActiveMode({ ticket, workflow, stages, currentIdx, completedKeys, category, customer, team, ticketIdNum, onOpenStage }: {
  ticket: Ticket;
  workflow: Workflow | undefined;
  stages: WorkflowStage[];
  currentIdx: number;
  completedKeys: Set<string>;
  category: Category | undefined;
  customer: Customer | undefined;
  team: Array<{ id: number; userId: number; role: string; userName: string; userRole: string; checkInAt: string | null; checkOutAt: string | null }>;
  ticketIdNum: number;
  onOpenStage: (key: string) => void;
}) {
  // v4.2.18 (C.1): countdown pakai effectiveSlaDeadline (deadline + total pause), kalau on hold pakai snapshot value
  const slaTarget = workflow?.isOnHold ? null : (workflow?.effectiveSlaDeadline ?? ticket.slaDeadline);
  const sla = useLiveCountdown(slaTarget);
  const onHold = !!workflow?.isOnHold;
  const onHoldRemainingSec = workflow?.slaRemainingSec ?? null;
  const catColor = category?.color || "#1e40af";
  const progressPct = stages.length > 0 ? Math.round((Math.max(0, currentIdx) / stages.length) * 100) : 0;
  const currentStage = currentIdx >= 0 ? stages[currentIdx] : null;

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-30" style={{ background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", gap: 10 }}>
          <Link href="/tickets" className="hover:bg-slate-100 rounded-md" style={{ padding: 4, marginLeft: -4 }}>
            <ArrowLeft style={{ width: 18, height: 18, color: "#475569" }} />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="jbn-mono" style={{ fontSize: 13, fontWeight: 700 }}>{ticket.ticketNumber}</div>
            <div style={{ fontSize: 10, color: "#475569", marginTop: 1 }}>
              {ticket.createdAt && `Diterima ${fmtTimeIDN(ticket.createdAt)}`}
            </div>
          </div>
          {customer?.phone && (
            <a href={`tel:${customer.phone}`} className="hover:bg-slate-100 rounded-md" style={{ padding: 6 }}>
              <Phone style={{ width: 18, height: 18, color: catColor }} />
            </a>
          )}
          {customer?.phone && (
            <a href={`https://wa.me/${customer.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="hover:bg-slate-100 rounded-md" style={{ padding: 6 }}>
              <MessageSquare style={{ width: 18, height: 18, color: catColor }} />
            </a>
          )}
        </div>
      </header>

      {/* RESPONSIVE BODY: mobile single-col, desktop 2-col grid (main + right rail) */}
      <div className="p-3.5 lg:p-6 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6" style={{ paddingBottom: currentStage ? 96 : 14 }}>

        {/* MAIN CONTENT */}
        <div className="lg:order-1 space-y-3">
          {/* Customer card - mobile only (desktop pakai versi di right rail) */}
          {customer && (
            <div className="bg-white lg:hidden" style={{ borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {category && <Badge color={catColor}>{category.name}</Badge>}
                {ticket.priority && <PriorityBadge priority={ticket.priority} />}
                {ticket.status === "pending" && <Badge color="#f59e0b">PAUSED</Badge>}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{customer.name}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 4, lineHeight: 1.5 }}>
                {ticket.address ?? customer.address ?? "-"}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <a
                  href={ticket.lat && ticket.lng
                    ? `https://www.google.com/maps/dir/?api=1&destination=${ticket.lat},${ticket.lng}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ticket.address ?? customer.address ?? customer.name)}`}
                  target="_blank" rel="noreferrer"
                  className="active:scale-[0.98] transition-transform"
                  style={{ flex: 1, padding: 10, color: "#fff", borderRadius: 6, fontSize: 12, fontWeight: 600, background: catColor, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <Navigation style={{ width: 13, height: 13 }} /> Navigasi
                </a>
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} style={{ padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, display: "flex", alignItems: "center" }} className="hover:bg-slate-50">
                    <Phone style={{ width: 14, height: 14 }} />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* v4.2.16: Tim Tugas - mobile only (yang ngerjain bareng di lapangan) */}
          {team.length > 0 && (
            <div className="bg-white lg:hidden" style={{ borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "#64748b", marginBottom: 8 }}>
                Tim Tugas · {team.length} teknisi
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {team.map(m => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <div style={{
                      height: 28, width: 28, borderRadius: "50%",
                      background: m.role === "lead" ? "#f59e0b" : "#0ea5e9",
                      color: "#fff", display: "grid", placeItems: "center",
                      fontSize: 11, fontWeight: 700,
                    }}>{(m.userName || "?").charAt(0).toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{m.userName}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "#64748b" }}>
                        <span style={{
                          padding: "1px 6px", borderRadius: 3,
                          background: m.role === "lead" ? "#fef3c7" : "#dbeafe",
                          color: m.role === "lead" ? "#92400e" : "#1e3a8a",
                          fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6,
                        }}>{m.role === "lead" ? "Lead" : "Helper"}</span>
                        {m.checkInAt && <span>· in {new Date(m.checkInAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stage Saat Ini - mobile only */}
          {currentStage && (
            <div className="bg-white lg:hidden" style={{ borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
              <Label>Stage Saat Ini</Label>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{currentIdx + 1}/{stages.length} · {currentStage.label}</div>
              <div style={{ marginTop: 10, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${progressPct}%`, height: "100%", background: catColor, transition: "width 500ms" }} />
              </div>
              {workflow?.slaDeadline && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#475569" }}>Sisa SLA</span>
                  {onHold ? (
                    <span className="jbn-mono jbn-tabular" style={{ fontWeight: 700, color: "#f59e0b", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: "#f59e0b" }} />
                      ON HOLD · {onHoldRemainingSec != null ? fmtSLA(onHoldRemainingSec, onHoldRemainingSec < 0) : "-"}
                    </span>
                  ) : (
                    <span className="jbn-mono jbn-tabular" style={{ fontWeight: 700, color: sla.overdue ? "#ef4444" : "#0f172a" }}>
                      {fmtSLA(sla.sec, sla.overdue)}
                    </span>
                  )}
                </div>
              )}
              {/* v4.2.18 (C.1): Hold reason banner */}
              {onHold && workflow?.activePause && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, fontSize: 11, color: "#92400e" }}>
                  <strong>SLA di-pause:</strong> {workflow.activePause.reason.replace(/_/g, " ")}
                  {workflow.activePause.note && <> - {workflow.activePause.note}</>}
                </div>
              )}
            </div>
          )}

          {/* v4.2.18 (B.7): Action Toolbar - Hold/Resume/Reassign/Escalate/Cancel - mobile + desktop atas */}
          <div className="lg:hidden">
            <TicketActionToolbar
              ticketId={ticketIdNum}
              ticketStatus={ticket.status}
              onChange={() => { /* react-query invalidate handled inside toolbar */ }}
            />
          </div>

          {/* Stages list */}
          <div>
            <Label style={{ marginBottom: 8, padding: "0 4px" }}>Stages</Label>
            <div className="bg-white" style={{ borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
              {stages.map((s, i) => {
                const done = completedKeys.has(s.key);
                const current = i === currentIdx;
                const fieldCount = s.fields?.length ?? 0;
                // v4.2.7: Stage current → tap untuk update (advance). Stage done → tap untuk EDIT.
                const clickable = current || done;
                return (
                  <button
                    key={s.key}
                    onClick={clickable ? () => onOpenStage(s.key) : undefined}
                    disabled={!clickable}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                      textAlign: "left", border: "none",
                      background: current ? `${catColor}14` : "transparent",
                      borderTop: i ? "1px solid #e2e8f0" : "none",
                      cursor: clickable ? "pointer" : "default",
                    }}
                    className={clickable ? "active:bg-slate-50 hover:bg-slate-50/60" : ""}
                  >
                    <StageDot index={i} done={done} current={current} catColor={catColor} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: current ? 700 : 500 }}>{s.label}</div>
                      <div style={{ fontSize: 10, color: done ? "#10b981" : "#475569", marginTop: 2 }}>
                        {done ? "✓ Selesai · tap untuk edit" : current ? "Tap untuk update" : `${fieldCount} field required`}
                      </div>
                    </div>
                    {current && <ChevronRight style={{ width: 16, height: 16, color: catColor, flexShrink: 0 }} />}
                    {done && <ChevronRight style={{ width: 14, height: 14, color: "#10b981", flexShrink: 0, opacity: 0.6 }} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* v4.2.18 (B): Asset (ODP) panel - visible mobile + bottom of desktop main col */}
          {ticket.odpId && (
            <AssetPanel odpId={ticket.odpId} currentTicketId={ticketIdNum} />
          )}

          {/* v4.2.18 (B.1): Activity timeline - full audit log */}
          <ActivityTimeline ticketId={ticketIdNum} />

          {/* v4.2.18 (B.6): Internal comments / chat */}
          <TicketComments ticketId={ticketIdNum} />
        </div>

        {/* RIGHT RAIL - desktop only (lg+). Sticky-ish for action toolbar + Customer360 + Asset, scrollable for activity */}
        <aside className="hidden lg:block lg:order-2 space-y-3">
          {/* v4.2.18 (B.7): Action Toolbar di top of right rail */}
          <TicketActionToolbar
            ticketId={ticketIdNum}
            ticketStatus={ticket.status}
            onChange={() => { /* react-query invalidate handled inside toolbar */ }}
          />

          {/* v4.2.18 (B.2): Customer 360 panel */}
          {ticket.customerId && (
            <Customer360Panel customerId={ticket.customerId} currentTicketId={ticketIdNum} />
          )}

          {/* Stage Saat Ini */}
          {currentStage && (
            <div className="bg-white" style={{ borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
              <Label>Stage Saat Ini</Label>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{currentIdx + 1}/{stages.length} · {currentStage.label}</div>
              <div style={{ marginTop: 10, height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${progressPct}%`, height: "100%", background: catColor, transition: "width 500ms" }} />
              </div>
              {workflow?.slaDeadline && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: "#475569" }}>Sisa SLA</span>
                  {onHold ? (
                    <span className="jbn-mono jbn-tabular" style={{ fontWeight: 700, color: "#f59e0b", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: "#f59e0b" }} />
                      ON HOLD · {onHoldRemainingSec != null ? fmtSLA(onHoldRemainingSec, onHoldRemainingSec < 0) : "-"}
                    </span>
                  ) : (
                    <span className="jbn-mono jbn-tabular" style={{ fontWeight: 700, color: sla.overdue ? "#ef4444" : "#0f172a" }}>
                      {fmtSLA(sla.sec, sla.overdue)}
                    </span>
                  )}
                </div>
              )}
              {/* v4.2.18 (C.1): Hold reason banner */}
              {onHold && workflow?.activePause && (
                <div style={{ marginTop: 10, padding: "8px 10px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, fontSize: 11, color: "#92400e" }}>
                  <strong>SLA di-pause:</strong> {workflow.activePause.reason.replace(/_/g, " ")}
                  {workflow.activePause.note && <> - {workflow.activePause.note}</>}
                </div>
              )}
            </div>
          )}

          {/* Inline CTA (desktop only - mobile pakai sticky bottom) */}
          {currentStage && (
            <button
              onClick={() => onOpenStage(currentStage.key)}
              className="active:scale-[0.98] transition-all w-full"
              style={{
                padding: "14px 16px", borderRadius: 12, color: "#fff", fontWeight: 700,
                border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                boxShadow: "0 4px 16px rgba(15,23,42,.12)",
                background: `linear-gradient(135deg, ${catColor}, ${catColor}dd)`,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: 16, background: "rgba(255,255,255,0.2)", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {currentIdx + 1}
                </div>
                <div style={{ textAlign: "left", minWidth: 0 }}>
                  <div style={{ fontSize: 10, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Update Stage</div>
                  <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentStage.label}</div>
                </div>
              </div>
              <ChevronRight style={{ width: 18, height: 18, flexShrink: 0 }} />
            </button>
          )}
        </aside>
      </div>

      {/* MOBILE STICKY CTA - hanya muncul di mobile (lg:hidden) saat ada current stage */}
      {currentStage && (
        <div className="fixed bottom-0 left-0 right-0 z-30 lg:hidden" style={{ padding: "12px 14px", background: "linear-gradient(to top, #f8fafc, rgba(248,250,252,0.95) 60%, transparent)" }}>
          <div className="mx-auto max-w-md">
            <button
              onClick={() => onOpenStage(currentStage.key)}
              className="active:scale-[0.98] transition-all"
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 12, color: "#fff", fontWeight: 700,
                border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                boxShadow: "0 8px 24px rgba(15,23,42,.15)",
                background: `linear-gradient(135deg, ${catColor}, ${catColor}dd)`,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, background: "rgba(255,255,255,0.2)", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  {currentIdx + 1}
                </div>
                <div style={{ textAlign: "left", minWidth: 0 }}>
                  <div style={{ fontSize: 10, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Update Stage</div>
                  <div style={{ fontSize: 16, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentStage.label}</div>
                </div>
              </div>
              <ChevronRight style={{ width: 20, height: 20, flexShrink: 0 }} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// -------------------------------------------------------------------------
// COMPLETED MODE - resolved / closed
// -------------------------------------------------------------------------

function CompletedMode({ ticket, workflow, stages, transitions, evidence, category, customer }: {
  ticket: Ticket;
  workflow: Workflow | undefined;
  stages: WorkflowStage[];
  transitions: Transition[];
  evidence: EvidenceItem[];
  category: Category | undefined;
  customer: Customer | undefined;
}) {
  const catColor = category?.color || "#1e40af";

  // v4.2.18 (P1.2 + P1.5): unified duration semantics
  //   leadTime    = resolved_at - created_at   (calendar time, end-to-end)
  //   workTime    = sum(stage_completed - stage_started)  (active hands-on)
  //   completedStagesCount = stages dengan exited_at OR final stage saat ticket resolved
  const leadTimeSec = ticket.createdAt && ticket.resolvedAt
    ? Math.round((new Date(ticket.resolvedAt).getTime() - new Date(ticket.createdAt).getTime()) / 1000)
    : null;
  const workTimeSec = transitions.reduce((sum, t) => sum + (t.durationSec ?? 0), 0);
  // Counter robust: untuk resolved ticket → semua stages dengan transition counted (termasuk final yang exitedAt-nya null)
  const isResolvedOrClosed = ticket.status === "resolved" || ticket.status === "closed";
  const completedStagesCount = isResolvedOrClosed
    ? new Set(transitions.map(t => t.stage)).size  // semua stages yang pernah dimasuki
    : transitions.filter(t => t.exitedAt).length;  // active ticket: count yang sudah exit
  const totalEvidenceCount = evidence.length;

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-30" style={{ background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", gap: 10 }}>
          <Link href="/tickets" className="hover:bg-slate-100 rounded-md" style={{ padding: 4, marginLeft: -4 }}>
            <ArrowLeft style={{ width: 18, height: 18, color: "#475569" }} />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="jbn-mono" style={{ fontSize: 13, fontWeight: 700 }}>{ticket.ticketNumber}</div>
            <div style={{ fontSize: 10, color: "#10b981", marginTop: 1, fontWeight: 600 }}>
              ✓ Selesai {ticket.resolvedAt && fmtDateTimeIDN(ticket.resolvedAt)}
            </div>
          </div>
          {customer?.phone && (
            <a href={`tel:${customer.phone}`} className="hover:bg-slate-100 rounded-md" style={{ padding: 6 }}>
              <Phone style={{ width: 18, height: 18, color: "#475569" }} />
            </a>
          )}
        </div>
      </header>

      {/* Hero success banner - full-width di mobile + desktop */}
      <div className="p-3.5 lg:px-6 lg:pt-6">
        <div style={{
          borderRadius: 12, padding: 18,
          background: "linear-gradient(135deg, #10b981, #059669)",
          color: "#fff",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 24, background: "rgba(255,255,255,0.2)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Award style={{ width: 24, height: 24 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>Pekerjaan Selesai</div>
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                {category?.name ?? "Tiket"} dikerjakan tuntas
              </div>
            </div>
          </div>
          {ticket.resolution && (
            <div style={{ marginTop: 14, padding: 12, background: "rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 13, lineHeight: 1.5, backdropFilter: "blur(8px)" }}>
              <div style={{ fontSize: 10, opacity: 0.8, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>Resolusi</div>
              {ticket.resolution}
            </div>
          )}
          {/* v4.2.18 (D.4): BAST button */}
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              href={`/api/tickets/${ticket.id}/bast`}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "8px 14px", background: "rgba(255,255,255,0.2)",
                border: "1px solid rgba(255,255,255,0.4)", borderRadius: 6,
                color: "#fff", fontSize: 12, fontWeight: 600, textDecoration: "none",
                display: "inline-flex", alignItems: "center", gap: 6,
              }}
              className="hover:bg-white/30 backdrop-blur"
            >
              <FileText style={{ width: 13, height: 13 }} />
              {ticket.bastNumber ? `Print BAST · ${ticket.bastNumber}` : "Print BAST"}
            </a>
          </div>
        </div>
      </div>

      {/* RESPONSIVE BODY: mobile single-col, desktop 2-col grid */}
      <div className="px-3.5 pb-3.5 lg:px-6 lg:pb-6 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6">
        {/* MAIN CONTENT */}
        <div className="lg:order-1 space-y-3">
          {/* Customer card mobile only */}
          {customer && (
            <div className="bg-white lg:hidden" style={{ borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {category && <Badge color={catColor}>{category.name}</Badge>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{customer.name}</div>
              <div style={{ fontSize: 12, color: "#475569", marginTop: 4, lineHeight: 1.5 }}>
                {ticket.address ?? customer.address ?? "-"}
              </div>
            </div>
          )}

          {/* Time metrics: 2x2 mobile, 4-col desktop */}
          <div className="bg-white" style={{ borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "8px 14px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <Label>Statistik Pengerjaan</Label>
            </div>
            {/* v4.2.18 (A.1): banner tiket lama yang ditutup tanpa workflow lengkap */}
            {ticket.legacyResolution === 1 && (
              <div className="px-4 py-3 border-b" style={{ background: "#fef3c7", borderColor: "#fcd34d" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <AlertTriangle style={{ width: 16, height: 16, color: "#92400e", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ fontSize: 12, color: "#78350f", lineHeight: 1.5 }}>
                    <strong>Tiket lama:</strong> ditutup tanpa melalui workflow stages. Data stage tidak lengkap - counter di bawah tidak mewakili pengerjaan sebenarnya.
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4">
              <Metric label="Lead Time" value={fmtDuration(leadTimeSec)} icon={<Clock style={{ width: 14, height: 14 }} />} title="Waktu calendar end-to-end (created → resolved)" />
              <Metric label="Active Work Time" value={ticket.legacyResolution === 1 ? "-" : fmtDuration(workTimeSec)} icon={<Timer style={{ width: 14, height: 14 }} />} borderLeft title={ticket.legacyResolution === 1 ? "Tidak tersedia (workflow lama)" : "Total durasi semua stage"} />
              <Metric label="Stages Selesai" value={ticket.legacyResolution === 1 ? "-" : `${completedStagesCount} / ${stages.length}`} icon={<Check style={{ width: 14, height: 14 }} />} borderTopMobile borderLeftDesktop title={ticket.legacyResolution === 1 ? "Tidak tersedia (workflow lama)" : "Stages yang sudah dilewati / total"} />
              <Metric label="Foto Evidence" value={ticket.legacyResolution === 1 && totalEvidenceCount === 0 ? "-" : String(totalEvidenceCount)} icon={<ImageIcon style={{ width: 14, height: 14 }} />} borderTopMobile borderLeft title={ticket.legacyResolution === 1 && totalEvidenceCount === 0 ? "Workflow lama tidak mensyaratkan foto" : `Total foto bukti dari semua stage`} />
            </div>
          </div>

          {/* Stages timeline read-only */}
          <div>
            <Label style={{ marginBottom: 8, padding: "0 4px" }}>Riwayat Stages</Label>
            <div className="bg-white" style={{ borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
              {stages.map((s, i) => {
                const transition = transitions.find(t => t.stage === s.key);
                const done = !!transition?.exitedAt;
                return (
                  <div
                    key={s.key}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px",
                      borderTop: i ? "1px solid #e2e8f0" : "none",
                    }}
                  >
                    <StageDot index={i} done={done} current={false} catColor={catColor} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
                        {transition?.durationSec != null && transition.durationSec > 0 && (
                          <span className="jbn-mono jbn-tabular" style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>
                            {fmtDuration(transition.durationSec)}
                          </span>
                        )}
                      </div>
                      {transition?.exitedAt && (
                        <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
                          ✓ Selesai {fmtTimeIDN(transition.exitedAt)}
                        </div>
                      )}
                      {transition?.note && (
                        <div style={{ marginTop: 6, padding: "6px 10px", background: "#f1f5f9", borderRadius: 6, fontSize: 12, color: "#0f172a", lineHeight: 1.4 }}>
                          {transition.note}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Evidence gallery */}
          {evidence.length > 0 && (
            <div>
              <Label style={{ marginBottom: 8, padding: "0 4px" }}>Foto Evidence ({evidence.length})</Label>
              <div className="bg-white" style={{ borderRadius: 10, border: "1px solid #e2e8f0", padding: 12 }}>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-3 gap-2">
                  {evidence.map((e) => {
                    const photoUrl = (e.hasPhoto || e.photoData) ? `/api/tickets/${ticket.id}/evidence/${e.id}/photo` : null;
                    return (
                    <a
                      key={e.id}
                      href={photoUrl ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      style={{ aspectRatio: "1/1", borderRadius: 6, overflow: "hidden", background: "#f1f5f9", display: "block" }}
                      className="active:scale-95 transition-transform"
                    >
                      {photoUrl ? (
                        <img src={photoUrl} alt="evidence" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", color: "#94a3b8" }}>
                          <ImageIcon style={{ width: 18, height: 18 }} />
                        </div>
                      )}
                    </a>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT RAIL desktop only */}
        <aside className="hidden lg:block lg:order-2 space-y-3">
          <div className="lg:sticky lg:top-20 space-y-3">
            {customer && (
              <div className="bg-white" style={{ borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  {category && <Badge color={catColor}>{category.name}</Badge>}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{customer.name}</div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 4, lineHeight: 1.5 }}>
                  {ticket.address ?? customer.address ?? "-"}
                </div>
                {customer.phone && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#475569" }} className="jbn-mono">
                    {customer.phone}
                  </div>
                )}
              </div>
            )}

            <div className="bg-white" style={{ borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
              <Label>Info Penyelesaian</Label>
              <div style={{ fontSize: 13, color: "#0f172a" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ color: "#475569" }}>Selesai</span>
                  <span className="jbn-mono jbn-tabular" style={{ fontWeight: 600 }}>{ticket.resolvedAt && fmtDateTimeIDN(ticket.resolvedAt)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ color: "#475569" }}>Lead Time</span>
                  <span className="jbn-mono jbn-tabular" style={{ fontWeight: 600 }}>{fmtDuration(leadTimeSec)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ color: "#475569" }}>Active Work Time</span>
                  <span className="jbn-mono jbn-tabular" style={{ fontWeight: 600 }}>{ticket.legacyResolution === 1 ? "-" : fmtDuration(workTimeSec)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
                  <span style={{ color: "#475569" }}>Foto evidence</span>
                  <span className="jbn-mono jbn-tabular" style={{ fontWeight: 600, color: ticket.legacyResolution === 1 && evidence.length === 0 ? "#64748b" : undefined, fontStyle: ticket.legacyResolution === 1 && evidence.length === 0 ? "italic" : undefined }}>
                    {ticket.legacyResolution === 1 && evidence.length === 0 ? "Workflow lama tidak mensyaratkan foto" : `${evidence.length} foto`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

// -------------------------------------------------------------------------
// CANCELLED MODE - cancelled
// -------------------------------------------------------------------------

function CancelledMode({ ticket, stages, transitions, evidence, category, customer }: {
  ticket: Ticket;
  stages: WorkflowStage[];
  transitions: Transition[];
  evidence: EvidenceItem[];
  category: Category | undefined;
  customer: Customer | undefined;
}) {
  const catColor = category?.color || "#1e40af";

  return (
    <>
      <header className="sticky top-0 z-30" style={{ background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", alignItems: "center", padding: "12px 16px", gap: 10 }}>
          <Link href="/tickets" className="hover:bg-slate-100 rounded-md" style={{ padding: 4, marginLeft: -4 }}>
            <ArrowLeft style={{ width: 18, height: 18, color: "#475569" }} />
          </Link>
          <div style={{ flex: 1 }}>
            <div className="jbn-mono" style={{ fontSize: 13, fontWeight: 700 }}>{ticket.ticketNumber}</div>
            <div style={{ fontSize: 10, color: "#ef4444", marginTop: 1, fontWeight: 600 }}>
               Dibatalkan
            </div>
          </div>
        </div>
      </header>

      <div style={{ padding: 14 }}>
        {/* Hero red banner */}
        <div style={{ borderRadius: 12, padding: 18, marginBottom: 12, background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 24, background: "rgba(255,255,255,0.2)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <XCircle style={{ width: 24, height: 24 }} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>Tiket Dibatalkan</div>
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                Pengerjaan dihentikan
              </div>
            </div>
          </div>
          {ticket.resolution && (
            <div style={{ marginTop: 14, padding: 12, background: "rgba(255,255,255,0.15)", borderRadius: 8, fontSize: 13, lineHeight: 1.5 }}>
              <div style={{ fontSize: 10, opacity: 0.8, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>Alasan</div>
              {ticket.resolution}
            </div>
          )}
        </div>

        {/* Customer + stages - read-only same as completed mode */}
        {customer && (
          <div className="bg-white" style={{ borderRadius: 10, padding: 14, marginBottom: 12, border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              {category && <Badge color={catColor}>{category.name}</Badge>}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{customer.name}</div>
            <div style={{ fontSize: 12, color: "#475569", marginTop: 4, lineHeight: 1.5 }}>{ticket.address ?? customer.address ?? "-"}</div>
          </div>
        )}

        {transitions.length > 0 && (
          <>
            <Label style={{ marginBottom: 8, padding: "0 4px" }}>Riwayat Sebelum Dibatalkan</Label>
            <div className="bg-white" style={{ borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
              {stages.map((s, i) => {
                const transition = transitions.find(t => t.stage === s.key);
                const done = !!transition?.exitedAt;
                if (!transition) return null;
                return (
                  <div key={s.key} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderTop: i && transitions.find(t => t.stage === stages[i-1]?.key) ? "1px solid #e2e8f0" : "none" }}>
                    <StageDot index={i} done={done} current={false} catColor={catColor} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
                      {transition.exitedAt && <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>✓ {fmtTimeIDN(transition.exitedAt)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// -------------------------------------------------------------------------
// STAGE EXECUTION SCREEN - only valid in ACTIVE mode
// -------------------------------------------------------------------------

function StageExecutionScreen({ ticket, ticketId, stage, stageIdx, totalStages, category, mode, existingTransition, onBack, onComplete }: {
  ticket: Ticket;
  ticketId: string;
  stage: WorkflowStage;
  stageIdx: number;
  totalStages: number;
  category: Category | undefined;
  mode: "advance" | "edit";        // v4.2.7: advance = selesaikan stage, edit = koreksi data sudah selesai
  existingTransition?: Transition; // v4.2.7: data existing untuk pre-fill di edit mode
  onBack: () => void;
  onComplete: () => void;
}) {
  const qc = useQueryClient();
  const catColor = category?.color || "#1e40af";
  // v4.2.7: pre-fill dari existing transition metadata di edit mode
  const meta = existingTransition?.metadata ?? {};
  const isEdit = mode === "edit";

  const [photoIds, setPhotoIds] = useState<number[]>(() => existingTransition?.evidenceId ? [existingTransition.evidenceId] : []);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [numericValue, setNumericValue] = useState(() => meta.numeric?.toString() ?? "");
  const [barcodeValue, setBarcodeValue] = useState(() => meta.barcode?.toString() ?? "");
  // Notes: kalau edit, ambil dari meta.notes (tanpa serialized field) atau parse dari note
  const [notesValue, setNotesValue] = useState(() => meta.notes?.toString() ?? (isEdit && existingTransition?.note ? extractRawNote(existingTransition.note) : ""));
  const [checklistDone, setChecklistDone] = useState<Record<number, boolean>>(() => meta.checklist ?? {});
  const [signatureValue, setSignatureValue] = useState(() => meta.signature?.toString() ?? "");
  // v4.2.18 (B.5): tanda tangan canvas (data URL PNG) - disimpan di metadata.signatureImage
  const [signatureDataUrl, setSignatureDataUrl] = useState<string>(() => meta.signatureImage?.toString() ?? "");
  const [speedDownload, setSpeedDownload] = useState(() => meta.speedDownload?.toString() ?? "");
  const [speedUpload, setSpeedUpload] = useState(() => meta.speedUpload?.toString() ?? "");
  const [speedLatency, setSpeedLatency] = useState(() => meta.speedLatency?.toString() ?? "");
  const [ratingValue, setRatingValue] = useState<number>(() => Number(meta.rating ?? 0));
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(() => {
    if (existingTransition?.lat != null && existingTransition?.lng != null) {
      return { lat: existingTransition.lat, lng: existingTransition.lng };
    }
    return null;
  });
  const [gpsLoading, setGpsLoading] = useState(false);
  // Custom fields values - keyed by field.key (pre-filled dari metadata.custom kalau edit)
  const [customValues, setCustomValues] = useState<Record<string, any>>(() => meta.custom ?? {});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // v4.2.18 (D): Resolution state - hanya dipakai di stage final
  const [resolutionData, setResolutionData] = useState<ResolutionData>(() => {
    let mat: MaterialItem[] = [];
    try { if (ticket.materialUsed) mat = JSON.parse(ticket.materialUsed); } catch {}
    return {
      resolutionCode: ticket.resolutionCode ?? "",
      resolution: ticket.resolution ?? "",
      materialUsed: mat,
    };
  });

  useEffect(() => {
    if (stage.fields?.includes("gps") && !gpsCoords) {
      setGpsLoading(true);
      getGpsPosition(10000).then(setGpsCoords).catch((e) => toast.error(e.message)).finally(() => setGpsLoading(false));
    }
  }, [stage.fields]);

  const checklistItems = useMemo<string[]>(() => {
    if (!ticket.checklist) return [];
    try {
      const parsed = JSON.parse(ticket.checklist);
      if (Array.isArray(parsed)) return parsed.map((p: any) => typeof p === "string" ? p : p.item ?? "").filter(Boolean);
    } catch {}
    return [];
  }, [ticket.checklist]);

  const evidenceMut = useMutation({
    mutationFn: async (data: { type: string; photoData: string }) => {
      let lat: number | null = null, lng: number | null = null;
      try { const pos = await getGpsPosition(8000); lat = pos.lat; lng = pos.lng; } catch {}
      return api.post<{ id: number }>(`/tickets/${ticket.id}/evidence`, { ...data, lat, lng });
    },
    onSuccess: (item: any) => {
      // CRITICAL: pakai ticketId (string) yang sama dengan queryKey original, BUKAN ticket.id (number)
      qc.invalidateQueries({ queryKey: ["ticket-evidence", ticketId] });
      const id = item?.id ?? item?.data?.id;
      if (id) setPhotoIds((arr) => [...arr, id]);
    },
    onError: (e: any) => toast.error(e.message || "Upload foto gagal"),
  });

  // Build metadata + display note (untuk completion summary di list)
  function buildPayload() {
    const metadata: Record<string, any> = {};
    if (notesValue.trim()) metadata.notes = notesValue.trim();
    if (numericValue) metadata.numeric = numericValue;
    if (barcodeValue) metadata.barcode = barcodeValue;
    if (signatureValue.trim()) metadata.signature = signatureValue.trim();
    if (signatureDataUrl) metadata.signatureImage = signatureDataUrl;
    if (speedDownload) metadata.speedDownload = speedDownload;
    if (speedUpload) metadata.speedUpload = speedUpload;
    if (speedLatency) metadata.speedLatency = speedLatency;
    if (ratingValue > 0) metadata.rating = ratingValue;
    if (Object.keys(checklistDone).length > 0) metadata.checklist = checklistDone;
    const cv: Record<string, any> = {};
    for (const cf of (stage.customFields ?? [])) {
      const v = customValues[cf.key];
      if (v != null && v !== "" && v !== false) cv[cf.key] = v;
    }
    if (Object.keys(cv).length > 0) metadata.custom = cv;

    // Display note (single-line summary of fields, untuk preview di list timeline)
    const noteParts: string[] = [];
    if (notesValue.trim()) noteParts.push(notesValue.trim());
    if (numericValue) noteParts.push(`Pengukuran: ${numericValue}`);
    if (barcodeValue) noteParts.push(`Serial: ${barcodeValue}`);
    if (speedDownload && speedUpload) noteParts.push(`Speed: ${speedDownload}↓/${speedUpload}↑ Mbps`);
    if (signatureValue.trim()) noteParts.push(`TTD: ${signatureValue.trim()}`);
    for (const cf of (stage.customFields ?? [])) {
      const v = customValues[cf.key];
      if (v == null || v === "" || v === false) continue;
      const display = cf.unit ? `${v} ${cf.unit}` : String(v);
      noteParts.push(`${cf.label}: ${display}`);
    }
    const completionNote = noteParts.join(" · ").slice(0, 500);

    return { metadata, completionNote };
  }

  const advanceMut = useMutation({
    mutationFn: () => {
      const { metadata, completionNote } = buildPayload();
      const body: any = {
        note: completionNote || undefined,
        evidenceId: photoIds[0],
        lat: gpsCoords?.lat,
        lng: gpsCoords?.lng,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        forceAdvance: true,
      };
      if (stage.isFinal) {
        body.toStage = stage.key;
        // v4.2.18 (D): include resolution code + material when finalizing
        if (resolutionData.resolutionCode) body.resolutionCode = resolutionData.resolutionCode;
        if (resolutionData.resolution) body.resolution = resolutionData.resolution;
        if (resolutionData.materialUsed.length > 0) body.materialUsed = resolutionData.materialUsed;
      }
      return api.post(`/tickets/${ticket.id}/advance-stage`, body);
    },
    onSuccess: () => {
      toast.success(`✓ Stage "${stage.label}" selesai`);
      qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-workflow", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-evidence", ticketId] });
      qc.refetchQueries({ queryKey: ["ticket-detail", ticketId] });
      qc.refetchQueries({ queryKey: ["ticket-workflow", ticketId] });
      onComplete();
    },
    onError: (e: any) => toast.error(e.message || "Gagal selesaikan stage"),
  });

  // v4.2.7: edit existing transition (untuk koreksi)
  const editMut = useMutation({
    mutationFn: () => {
      const { metadata, completionNote } = buildPayload();
      return api.put(`/tickets/${ticket.id}/stages/${stage.key}/transition`, {
        note: completionNote || null,
        evidenceId: photoIds[0] ?? null,
        lat: gpsCoords?.lat ?? null,
        lng: gpsCoords?.lng ?? null,
        metadata: Object.keys(metadata).length > 0 ? metadata : null,
      });
    },
    onSuccess: () => {
      toast.success(`✓ Stage "${stage.label}" diperbarui`);
      qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-workflow", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-evidence", ticketId] });
      qc.refetchQueries({ queryKey: ["ticket-workflow", ticketId] });
      onComplete();
    },
    onError: (e: any) => toast.error(e.message || "Gagal update stage"),
  });

  async function handlePhotoCapture(file: File) {
    setPhotoUploading(true);
    try {
      const compressed = await compressImage(file, 1280, 0.72);
      setPhotoPreviews((arr) => [...arr, compressed]);
      await evidenceMut.mutateAsync({ type: `stage_${stage.key}`, photoData: compressed });
    } catch (e: any) {
      toast.error(e.message || "Gagal proses foto");
    } finally {
      setPhotoUploading(false);
    }
  }

  // v4.2.18 (B.8): konfirmasi modal sebelum submit (untuk advance/selesaikan stage)
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Build field summary untuk ConfirmStageModal
  function buildFieldSummary(): Array<{ label: string; value: string; type?: "text" | "photo" | "gps" | "signature"; filled: boolean }> {
    const required = stage.fields ?? [];
    const out: Array<{ label: string; value: string; type?: "text" | "photo" | "gps" | "signature"; filled: boolean }> = [];
    if (required.includes("photo")) {
      out.push({ label: "Foto Evidence", value: photoIds.length ? `${photoIds.length} foto terupload` : "-", type: "photo", filled: photoIds.length > 0 });
    }
    if (required.includes("numeric")) {
      out.push({ label: "Pengukuran (dBm)", value: numericValue || "-", type: "text", filled: !!numericValue });
    }
    if (required.includes("barcode")) {
      out.push({ label: "ONT Serial", value: barcodeValue || "-", type: "text", filled: !!barcodeValue });
    }
    if (required.includes("signature")) {
      const sigOk = !!(signatureValue.trim() && signatureDataUrl);
      out.push({ label: "TTD Pelanggan", value: signatureValue || "-", type: "signature", filled: sigOk });
    }
    if (required.includes("speedtest")) {
      out.push({ label: "Speed Test", value: speedDownload && speedUpload ? `${speedDownload}↓/${speedUpload}↑ Mbps` : "-", type: "text", filled: !!(speedDownload && speedUpload) });
    }
    if (required.includes("gps")) {
      out.push({ label: "GPS Lokasi", value: gpsCoords ? `${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)}` : "-", type: "gps", filled: !!gpsCoords });
    }
    if (required.includes("checklist")) {
      const total = checklistItems.length;
      const done = Object.values(checklistDone).filter(Boolean).length;
      out.push({ label: "Checklist", value: total ? `${done}/${total} item` : "-", type: "text", filled: total > 0 && done === total });
    }
    if (required.includes("rating")) {
      out.push({ label: "Rating", value: ratingValue ? `${ratingValue}/5 bintang` : "-", type: "text", filled: ratingValue > 0 });
    }
    if (notesValue.trim()) {
      out.push({ label: "Notes", value: notesValue.length > 60 ? notesValue.slice(0, 60) + "…" : notesValue, type: "text", filled: true });
    }
    // Custom fields
    for (const cf of (stage.customFields ?? [])) {
      const v = customValues[cf.key];
      const display = v == null || v === "" ? "-" : (cf.type === "checkbox" ? (v ? "✓ Ya" : "Tidak") : (cf.unit ? `${v} ${cf.unit}` : String(v)));
      const filled = cf.type === "checkbox" ? !!v : (v != null && String(v).trim() !== "");
      out.push({ label: cf.label + (cf.required ? " *" : ""), value: display, type: "text", filled: !cf.required || filled });
    }
    return out;
  }

  function validateBeforeSubmit(): string | null {
    const required = stage.fields ?? [];
    if (required.includes("photo") && photoIds.length === 0) return "Minimal 1 foto evidence wajib";
    if (required.includes("numeric") && !numericValue) return "Pengukuran wajib diisi";
    if (required.includes("barcode") && !barcodeValue) return "Scan barcode wajib";
    if (required.includes("signature") && !signatureValue.trim()) return "Nama TTD pelanggan wajib";
    if (required.includes("signature") && !signatureDataUrl) return "Tanda tangan canvas wajib";
    if (required.includes("speedtest") && (!speedDownload || !speedUpload)) return "Speed test wajib diisi";
    for (const cf of (stage.customFields ?? [])) {
      if (!cf.required) continue;
      const v = customValues[cf.key];
      if (cf.type === "checkbox") {
        if (!v) return `"${cf.label}" wajib di-centang`;
      } else if (v == null || String(v).trim() === "") {
        return `"${cf.label}" wajib diisi`;
      }
    }
    // v4.2.18 (D.1): final stage wajib pilih kode resolusi
    if (stage.isFinal && !isEdit && !resolutionData.resolutionCode) {
      return "Kode resolusi wajib dipilih untuk menutup tiket";
    }
    return null;
  }

  function handleSubmit() {
    const err = validateBeforeSubmit();
    if (err) return toast.error(err);
    // v4.2.18 (B.8): kalau mode advance (selesaikan stage), tampilkan konfirmasi modal
    if (!isEdit) {
      setConfirmOpen(true);
      return;
    }
    // edit mode → langsung mutate (tanpa konfirmasi karena reversible)
    editMut.mutate();
  }

  function handleConfirmSubmit() {
    setConfirmOpen(false);
    advanceMut.mutate();
  }

  const submitting = advanceMut.isPending || editMut.isPending;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
      <div className="mx-auto w-full max-w-md md:max-w-3xl lg:max-w-5xl" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Colored header */}
        <header style={{ background: catColor, color: "#fff", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ padding: 0, background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
            <ArrowLeft style={{ width: 18, height: 18 }} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, opacity: 0.85 }}>{isEdit ? "Edit Stage" : "Stage"} {stageIdx + 1}/{totalStages}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{stage.label}</div>
          </div>
          <span style={{ padding: "3px 8px", background: "rgba(255,255,255,0.2)", borderRadius: 999, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
            {isEdit ? "EDIT" : <><span style={{ width: 4, height: 4, borderRadius: 2, background: "#fff", animation: "pulse 1.5s infinite" }} /> ACTIVE</>}
          </span>
        </header>

        {/* Edit mode banner */}
        {isEdit && (
          <div style={{ padding: "10px 14px", background: "#fef3c7", borderBottom: "1px solid #fde68a", fontSize: 12, color: "#92400e", lineHeight: 1.4 }}>
            <strong>Mode Edit:</strong> Stage ini sudah diselesaikan. Koreksi data di bawah lalu tap <strong>"Update Stage"</strong>. Stage flow + durasi tidak berubah.
          </div>
        )}

        <div className="p-3.5 lg:p-6" style={{ flex: 1, overflow: "auto" }}>
          {stage.description && (
            <div className="bg-white" style={{ borderRadius: 10, padding: 14, marginBottom: 10, border: "1px solid #e2e8f0", fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
              {stage.description}
            </div>
          )}

          {/* FIELDS GRID - desktop pakai 2-col supaya ga waste space */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-3">



          {stage.fields?.includes("photo") && (
            <FieldCard icon={<Camera style={{ width: 14, height: 14 }} />} label="Foto Evidence" required hint={photoIds.length ? `${photoIds.length} foto` : "Min. 1 foto · multi-slot"}>
              <MultiPhotoUploader
                ticketId={ticket.id}
                slots={DEFAULT_PHOTO_SLOTS}
                onChange={(ids) => setPhotoIds(ids)}
              />
            </FieldCard>
          )}

          {stage.fields?.includes("numeric") && (
            <FieldCard icon={<Activity14 />} label="Pengukuran Redaman" required>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number" step="0.1" value={numericValue}
                  onChange={(e) => setNumericValue(e.target.value)}
                  placeholder="-21.4"
                  style={{ flex: 1, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 14, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600 }}
                />
                <span style={{ padding: "8px 12px", background: "#f1f5f9", borderRadius: 6, fontSize: 13, fontWeight: 600 }}>dBm</span>
              </div>
              {numericValue && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600 }}>
                  {parseFloat(numericValue) >= -25 && parseFloat(numericValue) <= -8 ? (
                    <span style={{ color: "#10b981" }}>● Normal range (-25 to -8 dBm)</span>
                  ) : (
                    <span style={{ color: "#f59e0b" }}>● Out of range</span>
                  )}
                </div>
              )}
            </FieldCard>
          )}

          {stage.fields?.includes("barcode") && (
            <FieldCard icon={<ScanLine style={{ width: 14, height: 14 }} />} label="Scan ONT Serial" required>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={barcodeValue}
                  onChange={(e) => setBarcodeValue(e.target.value.toUpperCase())}
                  placeholder="HWTC-XXXX-XXXX-XX"
                  style={{ flex: 1, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12, fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, textTransform: "uppercase" }}
                />
                {barcodeValue && (
                  <span style={{ padding: "8px 12px", background: "#d1fae5", borderRadius: 6, display: "flex", alignItems: "center" }}>
                    <CheckCircle2 style={{ width: 14, height: 14, color: "#10b981" }} />
                  </span>
                )}
              </div>
            </FieldCard>
          )}

          {stage.fields?.includes("speedtest") && (
            <FieldCard icon={<Wifi style={{ width: 14, height: 14 }} />} label="Speed Test" required>
              <div style={{ background: "#0f172a", color: "#fff", borderRadius: 8, padding: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                <SpeedField label="Download" value={speedDownload} onChange={setSpeedDownload} unit="Mbps" color="#10b981" />
                <SpeedField label="Upload" value={speedUpload} onChange={setSpeedUpload} unit="Mbps" color="#0ea5e9" />
                <SpeedField label="Latency" value={speedLatency} onChange={setSpeedLatency} unit="ms" color="#fff" />
              </div>
            </FieldCard>
          )}

          {stage.fields?.includes("checklist") && checklistItems.length > 0 && (
            <FieldCard icon={<CheckCircle2 style={{ width: 14, height: 14 }} />} label="Checklist" required hint={`${Object.values(checklistDone).filter(Boolean).length}/${checklistItems.length}`}>
              {checklistItems.map((item, i) => (
                <button
                  key={i}
                  onClick={() => setChecklistDone((s) => ({ ...s, [i]: !s[i] }))}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "8px 4px", border: "none", background: "none", cursor: "pointer", textAlign: "left" }}
                  className="active:bg-slate-50"
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 4,
                    background: checklistDone[i] ? "#10b981" : "#fff",
                    border: `2px solid ${checklistDone[i] ? "#10b981" : "#cbd5e1"}`,
                    display: "grid", placeItems: "center", flexShrink: 0,
                  }}>
                    {checklistDone[i] && <Check style={{ width: 12, height: 12, color: "#fff" }} strokeWidth={3} />}
                  </div>
                  <span style={{ fontSize: 13, color: checklistDone[i] ? "#94a3b8" : "#0f172a", textDecoration: checklistDone[i] ? "line-through" : "none" }}>{item}</span>
                </button>
              ))}
            </FieldCard>
          )}

          {stage.fields?.includes("gps") && (
            <FieldCard icon={<MapPin style={{ width: 14, height: 14 }} />} label="GPS Location" required hint={gpsCoords ? "Captured" : "Auto"}>
              <div style={{
                padding: "8px 12px", borderRadius: 6, fontSize: 12,
                display: "flex", alignItems: "center", gap: 10,
                background: gpsCoords ? "#d1fae5" : gpsLoading ? "#e0f2fe" : "#fef3c7",
                border: `1px solid ${gpsCoords ? "#a7f3d0" : gpsLoading ? "#bae6fd" : "#fde68a"}`,
              }}>
                {gpsLoading ? <Loader2 style={{ width: 14, height: 14, color: "#0ea5e9" }} className="animate-spin" /> :
                 gpsCoords ? <CheckCircle2 style={{ width: 14, height: 14, color: "#10b981" }} /> :
                 <AlertTriangle style={{ width: 14, height: 14, color: "#f59e0b" }} />}
                <span style={{ flex: 1, color: "#0f172a" }}>
                  {gpsLoading ? "Mengambil GPS..." :
                   gpsCoords ? <span className="jbn-mono jbn-tabular">{gpsCoords.lat.toFixed(5)}, {gpsCoords.lng.toFixed(5)}</span> :
                   "GPS belum aktif"}
                </span>
              </div>
            </FieldCard>
          )}

          {stage.fields?.includes("signature") && (
            <FieldCard icon={<Edit3 style={{ width: 14, height: 14 }} />} label="TTD Pelanggan" required>
              <input
                value={signatureValue}
                onChange={(e) => setSignatureValue(e.target.value)}
                placeholder="Nama lengkap pelanggan"
                style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, marginBottom: 8 }}
              />
              <SignaturePad
                onSave={(dataUrl) => setSignatureDataUrl(dataUrl)}
                initialDataUrl={signatureDataUrl || undefined}
                hint="Tanda tangan pelanggan di sini"
                required
              />
            </FieldCard>
          )}

          {stage.fields?.includes("rating") && (
            <FieldCard icon={<Star style={{ width: 14, height: 14 }} />} label="Rating Pelanggan" hint="Optional">
              <div style={{ display: "flex", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRatingValue(n)}
                    style={{
                      flex: 1, padding: "8px 0", borderRadius: 6,
                      border: `1px solid ${n <= ratingValue ? "#f59e0b" : "#e2e8f0"}`,
                      background: n <= ratingValue ? "#fef3c7" : "#fff",
                      cursor: "pointer", display: "grid", placeItems: "center",
                    }}
                    className="active:scale-95 transition-transform"
                  >
                    <Star style={{ width: 16, height: 16, color: n <= ratingValue ? "#f59e0b" : "#cbd5e1", fill: n <= ratingValue ? "#f59e0b" : "transparent" }} />
                  </button>
                ))}
              </div>
            </FieldCard>
          )}

          <FieldCard icon={<Edit3 style={{ width: 14, height: 14 }} />} label="Notes" hint={stage.fields?.includes("notes") ? "" : "Optional"}>
            <Textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              placeholder="Catatan tambahan untuk stage ini..."
              rows={3}
              style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: 10, fontSize: 13, fontFamily: "inherit", resize: "none" }}
            />
          </FieldCard>

          {/* v4.2.7: Custom fields - admin-defined per stage */}
          {(stage.customFields ?? []).map((cf) => (
            <CustomFieldRender
              key={cf.key}
              field={cf}
              value={customValues[cf.key]}
              onChange={(v) => setCustomValues((s) => ({ ...s, [cf.key]: v }))}
            />
          ))}
          </div>
          {/* end fields grid */}

          {/* v4.2.18 (D): Resolution form - hanya di stage final */}
          {stage.isFinal && !isEdit && (
            <div className="mt-3">
              <div className="rounded-md border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white p-4 mb-3">
                <div className="flex items-start gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                  <div>
                    <div className="text-sm font-bold text-emerald-900">Stage Final - Penyelesaian Tiket</div>
                    <div className="text-xs text-emerald-700 mt-0.5">
                      Isi kode resolusi & material sebelum tiket ditutup. Data ini akan masuk ke BAST yang bisa di-print.
                    </div>
                  </div>
                </div>
              </div>
              <ResolutionForm
                initial={resolutionData}
                onChange={setResolutionData}
              />
            </div>
          )}
        </div>

        {/* Bottom action bar */}
        <div style={{ background: "#fff", borderTop: "1px solid #e2e8f0", padding: 12, display: "flex", gap: 8 }}>
          <button
            onClick={onBack}
            disabled={advanceMut.isPending}
            style={{ padding: "12px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || photoUploading}
            style={{
              flex: 1, padding: 12,
              background: isEdit ? "#1e40af" : "#10b981",   // edit: navy, advance: emerald
              color: "#fff",
              border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? <Loader2 style={{ width: 15, height: 15 }} className="animate-spin" /> : <Check style={{ width: 15, height: 15 }} strokeWidth={3} />}
            {isEdit ? "Update Stage" : "Selesaikan Stage"}
          </button>
        </div>
      </div>

      {/* v4.2.18 (B.8): Konfirmasi sebelum selesaikan stage (irreversible by helper) */}
      <ConfirmStageModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmSubmit}
        stageName={stage.label}
        stageDescription={stage.description}
        fields={buildFieldSummary()}
        isFinalStage={!!stage.isFinal}
        isPending={advanceMut.isPending}
      />
    </div>
  );
}

// -------------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------------

function StageDot({ index, done, current, catColor }: { index: number; done: boolean; current: boolean; catColor: string }) {
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

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
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

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
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

function PriorityBadge({ priority }: { priority: string }) {
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
function CustomFieldRender({ field, value, onChange }: {
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

function FieldCard({ icon, label, required, hint, children }: {
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

function SpeedField({ label, value, onChange, unit, color }: { label: string; value: string; onChange: (v: string) => void; unit: string; color: string }) {
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

function Metric({ label, value, icon, borderTop, borderLeft, borderTopMobile, borderLeftDesktop, title }: {
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
function Activity14() { return <ActivityIcon style={{ width: 14, height: 14 }} />; }
