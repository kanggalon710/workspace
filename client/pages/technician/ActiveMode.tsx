import { Link } from "wouter";
import { api } from "@/lib/api";
import { ArrowLeft, Phone, MessageSquare, ChevronRight, Navigation } from "lucide-react";

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

export function ActiveMode({ ticket, workflow, stages, currentIdx, completedKeys, category, customer, team, ticketIdNum, onOpenStage }: {
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
      {/* ==== technician-active-header: ticket number + call/WA quick actions ==== */}
      <header data-section="technician-active-header" className="sticky top-0 z-30" style={{ background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
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

      {/* ==== technician-active-body: responsive grid (main col + right rail) ==== */}
      <div data-section="technician-active-body" className="p-3.5 lg:p-6 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6" style={{ paddingBottom: currentStage ? 96 : 14 }}>

        {/* ==== technician-active-main: primary work column ==== */}
        <div data-section="technician-active-main" className="lg:order-1 space-y-3">
          {/* ==== technician-customer-card: customer + navigation (mobile only) ==== */}
          {customer && (
            <div data-section="technician-customer-card" className="bg-white lg:hidden" style={{ borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
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

          {/* ==== technician-team: field crew (lead + helpers), mobile only ==== */}
          {team.length > 0 && (
            <div data-section="technician-team" className="bg-white lg:hidden" style={{ borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: "#64748b", marginBottom: 8 }}>
                Tim Tugas · {team.length} teknisi
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {team.map(m => (
                  <div key={m.id} data-section="technician-team-member" data-member-id={m.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
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

          {/* ==== technician-current-stage: progress + SLA countdown (mobile only) ==== */}
          {currentStage && (
            <div data-section="technician-current-stage" className="bg-white lg:hidden" style={{ borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
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

          {/* ==== technician-actions-mobile: Hold/Resume/Reassign/Escalate/Cancel toolbar ==== */}
          <div data-section="technician-actions-mobile" className="lg:hidden">
            <TicketActionToolbar
              ticketId={ticketIdNum}
              ticketStatus={ticket.status}
              onChange={() => { /* react-query invalidate handled inside toolbar */ }}
            />
          </div>

          {/* ==== technician-stages: tappable workflow stage ladder ==== */}
          <div data-section="technician-stages">
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
                    data-section="technician-stage"
                    data-stage={s.key}
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

        {/* ==== technician-right-rail: desktop aside (toolbar + Customer360 + current stage + CTA) ==== */}
        <aside data-section="technician-right-rail" className="hidden lg:block lg:order-2 space-y-3">
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

          {/* ==== technician-current-stage-desktop: progress + SLA in right rail ==== */}
          {currentStage && (
            <div data-section="technician-current-stage-desktop" className="bg-white" style={{ borderRadius: 10, padding: 14, border: "1px solid #e2e8f0" }}>
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

          {/* ==== technician-cta-desktop: inline update-stage CTA (right rail) ==== */}
          {currentStage && (
            <button
              data-section="technician-cta-desktop"
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

      {/* ==== technician-cta-mobile: sticky bottom update-stage CTA (mobile only) ==== */}
      {currentStage && (
        <div data-section="technician-cta-mobile" className="fixed bottom-0 left-0 right-0 z-30 lg:hidden" style={{ padding: "12px 14px", background: "linear-gradient(to top, #f8fafc, rgba(248,250,252,0.95) 60%, transparent)" }}>
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

