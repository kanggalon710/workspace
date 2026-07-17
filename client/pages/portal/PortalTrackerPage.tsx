/**
 * v4.2.6: PortalTrackerPage — Customer Tracker (mobile)
 *
 * Implementasi visual dari design "Jabnet Work Order" customer-tracker.jsx:
 * 1. Hero gradient navy → blue: brand mark + ticket ID + headline status + progress bar + ETA
 * 2. Teknisi card: avatar + name + team + rating + chat/call icons (round buttons)
 * 3. Vertical timeline dengan stages — pulse ring di stage aktif, last update card with photos
 * 4. Reschedule button (dashed border)
 * 5. Chat overlay dengan message bubbles
 *
 * Source: /api/portal/tickets/:id/track
 */

import { useState, useMemo, useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Bell, Star, MessageSquare, Phone, Clock, Calendar,
  Check, Send, Loader2, Image as ImageIcon, X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface Stage {
  key: string;
  label: string;
  description?: string;
  fields?: string[];
  sortOrder: number;
  isFinal?: boolean;
}

interface Transition {
  stage: string;
  label: string;
  enteredAt: string;
  exitedAt: string | null;
  durationSec: number | null;
  note: string | null;
  evidenceId: number | null;
}

interface TrackerData {
  ticket: {
    id: number;
    ticketNumber: string;
    title: string;
    description: string | null;
    status: string | null;
    currentStage: string | null;
    slaDeadline: string | null;
    scheduledDate: string | null;
    scheduledTime: string | null;
    resolvedAt: string | null;
    createdAt: string | null;
  };
  category: { id: number; name: string; color: string | null } | null;
  stages: Stage[];
  transitions: Transition[];
  evidence: Array<{ id: number; type: string; photoData: string | null; capturedAt: string | null }>;
  lead: { name: string; username: string; phone: string | null; rating: number } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtTime(date: string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateTime(date: string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map(s => s[0]).join("").toUpperCase();
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function PortalTrackerPage() {
  const [, params] = useRoute("/portal/track/:id");
  const ticketId = params?.id;
  const [chatOpen, setChatOpen] = useState(false);

  const { data, isLoading } = useQuery<TrackerData>({
    queryKey: ["portal-tracker", ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/portal/tickets/${ticketId}/track`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.data ?? json;
    },
    enabled: !!ticketId,
    refetchInterval: 15_000,
  });

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-[#f8fafc] grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const { ticket, category, stages, transitions, evidence, lead } = data;
  const sortedStages = stages.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const completedKeys = new Set(transitions.filter(t => t.exitedAt).map(t => t.stage));
  const currentIdx = sortedStages.findIndex(s => s.key === ticket.currentStage);
  const isCompleted = !!ticket.resolvedAt;
  const progressPct = isCompleted
    ? 100
    : sortedStages.length > 0 ? Math.round((Math.max(0, currentIdx) / sortedStages.length) * 100) : 0;

  const catColor = category?.color || "#1e40af";

  // Headline
  const headline = isCompleted
    ? "Pengerjaan sudah selesai"
    : currentIdx >= 0 && sortedStages[currentIdx]
    ? `Teknisi sedang ${sortedStages[currentIdx].label.toLowerCase()}`
    : "Tiket sedang diproses";

  // Latest update transition (current stage)
  const currentTransition = ticket.currentStage ? transitions.find(t => t.stage === ticket.currentStage) : null;
  const currentStageEvidence = currentTransition?.evidenceId
    ? evidence.filter(e => e.id === currentTransition.evidenceId)
    : evidence.filter(e => e.type === `stage_${ticket.currentStage}` || e.type === `checkpoint_progress`).slice(0, 3);

  return (
    <div className="min-h-screen bg-[#f8fafc] max-w-md mx-auto" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Hero gradient */}
      <header
        className="px-5 pt-5 pb-6 text-white relative"
        style={{ background: `linear-gradient(135deg, ${catColor}, ${catColor}dd 60%, #3b82f6)` }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Link href="/portal/dashboard" className="p-1 -ml-1 rounded-md hover:bg-white/10">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="w-7 h-7 rounded-md bg-white/20 grid place-items-center text-sm font-bold">J</div>
          <span className="text-[13px] font-semibold">Jabnet</span>
          <div className="flex-1" />
          <Bell className="h-[18px] w-[18px]" />
        </div>

        <div className="text-[11px] opacity-80 uppercase tracking-wider font-semibold">
          {category?.name ?? "Work Order"} · {ticket.ticketNumber}
        </div>
        <div className="text-[22px] font-bold mt-1 leading-tight">
          {headline}
        </div>

        <div className="mt-3.5 p-3 rounded-[10px] bg-white/15 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] opacity-90">Progress</span>
            <span className="text-[11px] font-bold">
              {isCompleted ? "Selesai" : `Stage ${Math.max(0, currentIdx) + 1} dari ${sortedStages.length}`}
            </span>
          </div>
          <div className="h-1.5 bg-white/25 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {(ticket.scheduledTime || ticket.slaDeadline) && (
            <div className="mt-2.5 text-[11px] flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {ticket.slaDeadline ? (
                <>Estimasi selesai pukul <strong>{fmtTime(ticket.slaDeadline)}</strong></>
              ) : ticket.scheduledTime ? (
                <>Jadwal pukul <strong>{ticket.scheduledTime.slice(0, 5)}</strong></>
              ) : null}
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="px-3.5 py-3.5 space-y-3">
        {/* Teknisi card */}
        {lead && (
          <div className="bg-white rounded-xl p-3.5 border border-[#e2e8f0]">
            <div className="flex items-center gap-3">
              <div
                className="h-12 w-12 rounded-full grid place-items-center text-white font-bold text-base shrink-0"
                style={{ background: `linear-gradient(135deg, ${catColor}, ${catColor}cc)` }}
              >
                {getInitials(lead.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-900 truncate">{lead.name}</div>
                <div className="text-[11px] text-slate-500">Teknisi Jabnet</div>
                {lead.rating > 0 && (
                  <div className="text-[11px] mt-0.5 flex items-center gap-1">
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    <strong>{lead.rating.toFixed(1)}</strong>
                    <span className="text-slate-400">· berpengalaman</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setChatOpen(true)}
                className="w-10 h-10 rounded-full text-white grid place-items-center active:scale-95 transition-transform"
                style={{ background: catColor }}
              >
                <MessageSquare className="h-4 w-4" />
              </button>
              {lead.phone && (
                <a
                  href={`tel:${lead.phone}`}
                  className="w-10 h-10 rounded-full bg-emerald-500 text-white grid place-items-center active:scale-95 transition-transform"
                >
                  <Phone className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        )}

        {/* Vertical timeline */}
        <div className="bg-white rounded-xl p-4 border border-[#e2e8f0]">
          <div className="text-[13px] font-bold text-slate-900 mb-3.5">
            {category?.name === "Pemasangan Baru" ? "Tahapan Pemasangan" :
             category?.name === "Gangguan" ? "Tahapan Penanganan" :
             "Tahapan Pengerjaan"}
          </div>
          <div className="relative">
            {sortedStages.map((s, i) => {
              const done = completedKeys.has(s.key);
              const current = i === currentIdx && !isCompleted;
              const transition = transitions.find(t => t.stage === s.key);
              const isLast = i === sortedStages.length - 1;
              return (
                <div key={s.key} className={cn("flex gap-3 relative", !isLast && "pb-3.5")}>
                  {/* Vertical connector line */}
                  {!isLast && (
                    <div
                      className="absolute left-[11px] top-6 bottom-0 w-0.5"
                      style={{ background: done ? "var(--jbn-success)" : "var(--jbn-border)" }}
                    />
                  )}

                  {/* Dot */}
                  <div
                    className="w-6 h-6 rounded-full grid place-items-center shrink-0 z-10 relative"
                    style={{
                      background: done ? "var(--jbn-success)" : current ? catColor : "#fff",
                      border: `2px solid ${done ? "var(--jbn-success)" : current ? catColor : "var(--jbn-border)"}`,
                    }}
                  >
                    {done ? (
                      <Check className="h-[11px] w-[11px] text-white" strokeWidth={3.5} />
                    ) : current ? (
                      <span className="w-2 h-2 rounded-full bg-white" />
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400">{i + 1}</span>
                    )}
                    {current && (
                      <span
                        className="absolute -inset-1.5 rounded-full"
                        style={{
                          border: `2px solid ${catColor}`,
                          opacity: 0.3,
                          animation: "jbn-pulse-ring 2s infinite",
                        }}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className={cn(
                      "text-[13px] text-slate-900",
                      current ? "font-bold" : done ? "font-semibold" : "font-medium",
                      !done && !current && "text-slate-500",
                    )}>
                      {s.label}
                    </div>
                    {(done || current) && (
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {done && transition?.exitedAt && <>✓ Selesai {fmtTime(transition.exitedAt)}</>}
                        {current && transition?.enteredAt && <>● Sedang dikerjakan · sejak {fmtTime(transition.enteredAt)}</>}
                      </div>
                    )}
                    {/* Update card di stage saat ini */}
                    {current && (
                      <div className="mt-2 p-2.5 rounded-lg bg-sky-50 border border-sky-100">
                        <div className="text-[11px] text-slate-700 leading-relaxed">
                          <strong>Update terbaru:</strong> {s.description || "Sedang dikerjakan oleh teknisi."}
                          {transition?.note && <div className="mt-1">{transition.note}</div>}
                        </div>
                        {currentStageEvidence.length > 0 && (
                          <div className="flex gap-1.5 mt-2">
                            {currentStageEvidence.slice(0, 2).map((e) => (
                              <a
                                key={e.id}
                                href={e.photoData ?? "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="w-9 h-9 rounded overflow-hidden bg-slate-200 active:scale-95 transition-transform"
                              >
                                {e.photoData ? (
                                  <img src={e.photoData} alt="evidence" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full grid place-items-center" style={{ background: `linear-gradient(135deg, ${catColor}40, ${catColor}aa)` }}>
                                    <ImageIcon className="h-3 w-3 text-white opacity-80" />
                                  </div>
                                )}
                              </a>
                            ))}
                            {currentStageEvidence.length > 2 && (
                              <div className="flex-1 px-2 py-1.5 bg-white rounded text-[11px] text-slate-500 grid place-items-center">
                                + {currentStageEvidence.length - 2} foto
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Reschedule button */}
        {!isCompleted && (
          <button className="w-full py-3 bg-white border border-dashed border-slate-300 rounded-xl text-xs font-semibold text-slate-500 flex items-center justify-center gap-1.5 active:bg-slate-50 transition-colors">
            <Calendar className="h-3.5 w-3.5" /> Perlu reschedule? Tap di sini
          </button>
        )}

        {/* Done banner */}
        {isCompleted && (
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200 flex items-start gap-3">
            <div className="h-9 w-9 rounded-full bg-emerald-500 grid place-items-center shrink-0">
              <Check className="h-4 w-4 text-white" strokeWidth={3} />
            </div>
            <div>
              <div className="font-bold text-emerald-900">Pengerjaan selesai</div>
              <div className="text-xs text-emerald-700 mt-0.5">
                {ticket.resolvedAt && fmtDateTime(ticket.resolvedAt)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat overlay */}
      {chatOpen && lead && (
        <ChatOverlay technicianName={lead.name} onClose={() => setChatOpen(false)} />
      )}
    </div>
  );
}

// ── Chat overlay (placeholder UI — mock conversation) ──────────────────────

function ChatOverlay({ technicianName, onClose }: { technicianName: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-white max-w-md mx-auto flex flex-col" style={{ fontFamily: "Inter, sans-serif" }}>
      <header className="px-4 py-3 border-b border-[#e2e8f0] flex items-center gap-3">
        <button onClick={onClose} className="p-1 -ml-1 rounded-md hover:bg-slate-100">
          <ArrowLeft className="h-[18px] w-[18px]" />
        </button>
        <div
          className="h-9 w-9 rounded-full grid place-items-center text-white font-bold text-xs"
          style={{ background: "linear-gradient(135deg, #1e40af, #3b82f6)" }}
        >
          {getInitials(technicianName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold truncate">{technicianName}</div>
          <div className="text-[10px] text-emerald-500">● Online</div>
        </div>
        <button className="p-1 rounded-md hover:bg-slate-100">
          <Phone className="h-[18px] w-[18px] text-slate-700" />
        </button>
      </header>

      <div className="flex-1 p-4 bg-[#f8fafc] overflow-auto flex flex-col gap-2.5">
        <ChatBubble text={`Halo Pak/Bu, saya ${technicianName.split(" ")[0]} teknisi Jabnet. Saya akan menangani tiket Anda 🙏`} them />
        <ChatBubble text="Baik mas, saya tunggu" me />
        <ChatBubble text="Saya sudah sampai dan sedang memulai pengerjaan" them />
        <div className="text-[10px] text-slate-400 text-center my-2">— Mock conversation untuk demo —</div>
      </div>

      <div className="p-3 bg-white border-t border-[#e2e8f0] flex gap-2 items-center">
        <input
          placeholder="Tulis pesan…"
          className="flex-1 px-3.5 py-2.5 border border-[#e2e8f0] rounded-full text-[13px] outline-none focus:border-sky-400"
        />
        <button className="w-9 h-9 rounded-full bg-[#1e40af] text-white grid place-items-center">
          <Send className="h-[14px] w-[14px]" />
        </button>
      </div>
    </div>
  );
}

function ChatBubble({ text, me, them }: { text: string; me?: boolean; them?: boolean }) {
  return (
    <div
      className={cn(
        "max-w-[78%] px-3 py-2 rounded-2xl text-xs leading-relaxed",
        me ? "self-end bg-[#1e40af] text-white" : "self-start bg-white border border-[#e2e8f0] text-slate-800",
      )}
    >
      {text}
    </div>
  );
}
