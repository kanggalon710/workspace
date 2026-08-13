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

import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Loader2 } from "lucide-react";

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
import { ActiveMode } from "./technician/ActiveMode";
import { CompletedMode } from "./technician/CompletedMode";
import { CancelledMode } from "./technician/CancelledMode";
import { StageExecutionScreen } from "./technician/StageExecutionScreen";
import { extractRawNote, fmtTimeIDN, fmtDateTimeIDN, fmtDuration, fmtSLA, getGpsPosition, compressImage, useLiveCountdown, StageDot, Label, Badge, PriorityBadge, CustomFieldRender, FieldCard, SpeedField, Metric, Activity14, type FieldType, type CustomFieldType, type CustomField, type WorkflowStage, type Ticket, type Transition, type Workflow, type EvidenceItem, type Customer, type Category } from "./technician/shared";

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
    /* technician-page: root shell, dispatches active/completed/cancelled mode */
    <div data-section="technician-page" className="min-h-screen" style={{ background: "#f8fafc", fontFamily: "Inter, sans-serif", color: "#0f172a" }}>
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

