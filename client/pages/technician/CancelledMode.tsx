import { Link } from "wouter";
import { ArrowLeft, XCircle } from "lucide-react";

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
import { extractRawNote, fmtTimeIDN, fmtDateTimeIDN, fmtDuration, fmtSLA, getGpsPosition, compressImage, useLiveCountdown, StageDot, Label, Badge, PriorityBadge, CustomFieldRender, FieldCard, SpeedField, Metric, Activity14, type FieldType, type CustomFieldType, type CustomField, type WorkflowStage, type Ticket, type Transition, type Workflow, type EvidenceItem, type Customer, type Category } from "./shared";

export function CancelledMode({ ticket, stages, transitions, evidence, category, customer }: {
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
      {/* ==== technician-cancelled-header: ticket number + cancelled marker ==== */}
      <header data-section="technician-cancelled-header" className="sticky top-0 z-30" style={{ background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
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
        {/* ==== technician-cancelled-hero: red cancelled banner + reason ==== */}
        <div data-section="technician-cancelled-hero" style={{ borderRadius: 12, padding: 18, marginBottom: 12, background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff" }}>
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
            {/* ==== technician-cancelled-stages: read-only history before cancellation ==== */}
            <Label style={{ marginBottom: 8, padding: "0 4px" }}>Riwayat Sebelum Dibatalkan</Label>
            <div data-section="technician-cancelled-stages" className="bg-white" style={{ borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
              {stages.map((s, i) => {
                const transition = transitions.find(t => t.stage === s.key);
                const done = !!transition?.exitedAt;
                if (!transition) return null;
                return (
                  <div key={s.key} data-section="technician-cancelled-stage" data-stage={s.key} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderTop: i && transitions.find(t => t.stage === stages[i-1]?.key) ? "1px solid #e2e8f0" : "none" }}>
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

