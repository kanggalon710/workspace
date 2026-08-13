import { Link } from "wouter";
import { api } from "@/lib/api";
import { ArrowLeft, Phone, Check, AlertTriangle, FileText, Clock, Image as ImageIcon, Award, Timer } from "lucide-react";

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

export function CompletedMode({ ticket, workflow, stages, transitions, evidence, category, customer }: {
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
      {/* ==== technician-completed-header: ticket number + resolved timestamp ==== */}
      <header data-section="technician-completed-header" className="sticky top-0 z-30" style={{ background: "#fff", borderBottom: "1px solid #e2e8f0" }}>
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

      {/* ==== technician-completed-hero: success banner + resolution + BAST print ==== */}
      <div className="p-3.5 lg:px-6 lg:pt-6">
        <div data-section="technician-completed-hero" style={{
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

          {/* ==== technician-completed-stats: lead/work time + stages + evidence metrics ==== */}
          <div data-section="technician-completed-stats" className="bg-white" style={{ borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
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

          {/* ==== technician-completed-stages: read-only stage history timeline ==== */}
          <div data-section="technician-completed-stages">
            <Label style={{ marginBottom: 8, padding: "0 4px" }}>Riwayat Stages</Label>
            <div className="bg-white" style={{ borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden" }}>
              {stages.map((s, i) => {
                const transition = transitions.find(t => t.stage === s.key);
                const done = !!transition?.exitedAt;
                return (
                  <div
                    key={s.key}
                    data-section="technician-completed-stage"
                    data-stage={s.key}
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

          {/* ==== technician-evidence: completed-ticket photo evidence gallery ==== */}
          {evidence.length > 0 && (
            <div data-section="technician-evidence">
              <Label style={{ marginBottom: 8, padding: "0 4px" }}>Foto Evidence ({evidence.length})</Label>
              <div className="bg-white" style={{ borderRadius: 10, border: "1px solid #e2e8f0", padding: 12 }}>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-3 gap-2">
                  {evidence.map((e) => {
                    const photoUrl = (e.hasPhoto || e.photoData) ? `/api/tickets/${ticket.id}/evidence/${e.id}/photo` : null;
                    return (
                    <a
                      key={e.id}
                      data-section="technician-evidence-item"
                      data-evidence-id={e.id}
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

        {/* ==== technician-completed-right-rail: customer + resolution summary aside ==== */}
        <aside data-section="technician-completed-right-rail" className="hidden lg:block lg:order-2 space-y-3">
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

