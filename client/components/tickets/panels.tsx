import { useState, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { KanbanView } from "@/components/tickets/KanbanView";
import { type Ticket, type TicketActivity, type SafeUser, STATUS_CONFIG } from "@/components/tickets/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Dialog } from "@/components/ui/dialog";
import { Plus, UserPlus, Loader2, Trash2, X, FileText, Camera, MapPin, Flag } from "lucide-react";

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground text-xs block">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

// v4.2.4: Workflow section di Detail Dialog admin - vertical stage timeline + per-stage durasi
export function WorkflowSection({ ticketId }: { ticketId: number }) {
  const { data: workflow } = useQuery<{
    currentStage: string | null;
    stageEnteredAt: string | null;
    stages: Array<{ key: string; label: string; color?: string; sortOrder: number; isFinal?: boolean }>;
    transitions: Array<{ stage: string; label: string; enteredAt: string; exitedAt: string | null; durationSec: number | null; note: string | null; byUserId: number }>;
  }>({
    queryKey: ["ticket-workflow-admin", ticketId],
    queryFn: () => api.get<any>(`/tickets/${ticketId}/workflow`),
    enabled: !!ticketId,
    refetchInterval: 30_000,
  });

  if (!workflow || workflow.stages.length === 0) return null;

  const sorted = [...workflow.stages].sort((a, b) => a.sortOrder - b.sortOrder);
  const completedKeys = new Set(workflow.transitions.filter(t => t.exitedAt).map(t => t.stage));

  function fmtDur(sec: number | null): string {
    if (sec == null || sec < 0) return "-";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}j ${m}m`;
    if (m > 0) return `${m}m`;
    return `${sec}s`;
  }

  return (
    /* ==== Ticket workflow-progress timeline ==== */
    <div data-section="ticket-workflow-timeline" className="mt-4 rounded-lg border bg-gradient-to-br from-zinc-50/50 to-transparent overflow-hidden">
      <div className="px-4 py-2 border-b bg-muted/40 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Workflow Progress</span>
        <span className="text-[10px] text-muted-foreground">
          {completedKeys.size} / {sorted.length} stage selesai
        </span>
      </div>
      <div className="px-4 py-3 space-y-1">
        {sorted.map((stage, idx) => {
          const transition = workflow.transitions.find(t => t.stage === stage.key);
          const isCompleted = completedKeys.has(stage.key);
          const isActive = workflow.currentStage === stage.key;
          const isFuture = !isCompleted && !isActive;
          return (
            <div key={stage.key} className={cn(
              "flex items-start gap-3 py-1.5",
              isActive && "rounded-md -mx-2 px-2 bg-warning/60",
            )}>
              <div className={cn(
                "h-6 w-6 rounded-full grid place-items-center shrink-0 mt-0.5 font-mono text-[10px] font-bold",
                isCompleted && "bg-success text-white",
                isActive && "ring-2 ring-warning animate-pulse",
                isFuture && "bg-muted text-muted-foreground border border-border",
              )} style={{ backgroundColor: isActive ? (stage.color ?? "#F59E0B") : undefined, color: isActive ? "white" : undefined }}>
                {isCompleted ? "✓" : idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn(
                    "text-sm font-semibold",
                    isFuture && "text-muted-foreground",
                  )}>{stage.label}</span>
                  {stage.isFinal && <Badge variant="outline" className="text-[9px] uppercase tracking-wider px-1 py-0 font-bold">Final</Badge>}
                  {isActive && <Badge className="text-[9px] uppercase tracking-wider px-1.5 py-0 font-bold bg-warning text-white border-0">Aktif</Badge>}
                  {transition?.durationSec != null && <span className="text-[10px] font-mono tabular-nums text-muted-foreground">· {fmtDur(transition.durationSec)}</span>}
                </div>
                {transition?.note && (
                  <div className="text-xs text-muted-foreground mt-0.5 italic">{transition.note}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function parseActivityContent(act: TicketActivity): string {
  if (!act.content) return "\u2014";
  if (act.type === "status_change") {
    try {
      const data = JSON.parse(act.content);
      const from = STATUS_CONFIG[data.from]?.label ?? data.from;
      const to = STATUS_CONFIG[data.to]?.label ?? data.to;
      return `Status diubah dari ${from} ke ${to}`;
    } catch {
      return act.content;
    }
  }
  if (act.type === "assigned") {
    try {
      const data = JSON.parse(act.content);
      return `Ditugaskan ke ${data.assigneeName ?? data.assignedTo ?? act.content}`;
    } catch {
      return act.content;
    }
  }
  return act.content;
}

// -- Category Management Dialog ---------------------------------------------

// v4.2.4: Workflow presets - sinkron dengan backend WORKFLOW_PRESETS di shared/schema.ts
export const FRONTEND_WORKFLOW_PRESETS: Record<string, { label: string; description: string; stages: Array<{ key: string; label: string; color: string; sortOrder: number; slaMinutes?: number; isFinal?: boolean; requiresPhoto?: boolean; requiresGps?: boolean; requiresNote?: boolean; requiresSignature?: boolean; description?: string; icon?: string }> }> = {
  gangguan: {
    label: "Gangguan",
    description: "Diagnose-first workflow untuk perbaikan jaringan",
    stages: [
      { key: "prep", label: "Persiapan Alat", icon: "PackageCheck", color: "#0EA5E9", sortOrder: 1, slaMinutes: 15 },
      { key: "travel", label: "Perjalanan", icon: "Navigation", color: "#8B5CF6", sortOrder: 2, slaMinutes: 45, requiresGps: true },
      { key: "diagnose", label: "Diagnosa", icon: "Stethoscope", color: "#F59E0B", sortOrder: 3, slaMinutes: 30, requiresPhoto: true, requiresNote: true },
      { key: "repair", label: "Perbaikan", icon: "Wrench", color: "#EF4444", sortOrder: 4, slaMinutes: 90, requiresPhoto: true },
      { key: "verify", label: "Test Sinyal", icon: "Activity", color: "#22C55E", sortOrder: 5, slaMinutes: 15, requiresPhoto: true },
      { key: "done", label: "Selesai", icon: "Flag", color: "#10B981", sortOrder: 6, isFinal: true, requiresNote: true },
    ],
  },
  install: {
    label: "Pemasangan Baru",
    description: "Survey → install → activate → handover dengan TTD pelanggan",
    stages: [
      { key: "survey", label: "Survey Lokasi", icon: "MapPin", color: "#06B6D4", sortOrder: 1, slaMinutes: 60, requiresPhoto: true, requiresGps: true },
      { key: "prep", label: "Siapkan ONT+Kabel", icon: "PackageCheck", color: "#0EA5E9", sortOrder: 2, slaMinutes: 30, requiresPhoto: true },
      { key: "pull_cable", label: "Tarik Kabel", icon: "Cable", color: "#8B5CF6", sortOrder: 3, slaMinutes: 120, requiresPhoto: true },
      { key: "install", label: "Pasang ONT", icon: "Router", color: "#F59E0B", sortOrder: 4, slaMinutes: 60, requiresPhoto: true },
      { key: "activate", label: "Aktivasi", icon: "Wifi", color: "#22C55E", sortOrder: 5, slaMinutes: 30, requiresPhoto: true },
      { key: "handover", label: "Serah Terima", icon: "FileCheck", color: "#10B981", sortOrder: 6, isFinal: true, requiresSignature: true, requiresNote: true },
    ],
  },
  migrasi: {
    label: "Migrasi/Relokasi",
    description: "Pindah ODP atau ganti paket dengan foto before/after",
    stages: [
      { key: "prep", label: "Persiapan", icon: "PackageCheck", color: "#0EA5E9", sortOrder: 1, slaMinutes: 20 },
      { key: "travel", label: "Perjalanan", icon: "Navigation", color: "#8B5CF6", sortOrder: 2, slaMinutes: 45, requiresGps: true },
      { key: "before", label: "Foto Awal", icon: "Camera", color: "#F59E0B", sortOrder: 3, slaMinutes: 10, requiresPhoto: true },
      { key: "execute", label: "Eksekusi", icon: "Wrench", color: "#EF4444", sortOrder: 4, slaMinutes: 90, requiresPhoto: true },
      { key: "verify", label: "Test & Aktivasi", icon: "Activity", color: "#22C55E", sortOrder: 5, slaMinutes: 20, requiresPhoto: true },
      { key: "done", label: "Selesai", icon: "Flag", color: "#10B981", sortOrder: 6, isFinal: true, requiresNote: true },
    ],
  },
  survey: {
    label: "Survey/Maintenance",
    description: "Workflow ringkas untuk survey atau preventive maintenance",
    stages: [
      { key: "travel", label: "Perjalanan", icon: "Navigation", color: "#8B5CF6", sortOrder: 1, slaMinutes: 60, requiresGps: true },
      { key: "survey", label: "Survey Onsite", icon: "MapPin", color: "#0EA5E9", sortOrder: 2, slaMinutes: 30, requiresPhoto: true, requiresGps: true },
      { key: "report", label: "Buat Laporan", icon: "FileText", color: "#22C55E", sortOrder: 3, isFinal: true, requiresNote: true },
    ],
  },
};


export function TeamPanel({
  teamMembers, userMap, onAdd, onRemove, onClose, isAdding,
}: {
  teamMembers: Array<{ id: number; userId: number; role: string; userName: string; userRole: string; checkInAt: string | null; checkOutAt: string | null }>;
  userMap: Map<number, SafeUser>;
  onAdd: (userId: number, role: "lead" | "helper") => void;
  onRemove: (memberId: number) => void;
  onClose: () => void;
  isAdding: boolean;
}) {
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<"lead" | "helper">("helper");

  const memberUserIds = new Set(teamMembers.map(m => m.userId));
  const availableUsers = Array.from(userMap.values()).filter(u => !memberUserIds.has(u.id));
  const hasLead = teamMembers.some(m => m.role === "lead");

  function handleAdd() {
    if (!newUserId) return;
    onAdd(Number(newUserId), newRole);
    setNewUserId("");
  }

  return (
    /* ==== Ticket team panel (lead + helpers) ==== */
    <div data-section="ticket-team-panel" className="rounded-lg bg-purple-50 border border-purple-200 mt-2 overflow-hidden">
      <div className="px-3 py-2 bg-purple-100/60 border-b border-purple-200 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <UserPlus className="w-3.5 h-3.5 text-purple-700" />
          <span className="text-xs font-bold uppercase tracking-wider text-purple-900">Tim Tugas</span>
          <span className="text-[10px] text-purple-700">·</span>
          <span className="text-[10px] text-purple-700">{teamMembers.length} teknisi</span>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} className="h-6 w-6 p-0 text-purple-700"><X className="w-3.5 h-3.5" /></Button>
      </div>

      {/* List existing members */}
      {teamMembers.length > 0 && (
        <div className="px-3 py-2 space-y-1.5 border-b border-purple-200">
          {teamMembers.map(m => (
            <div key={m.id} className="flex items-center gap-2 bg-white rounded-md px-2.5 py-1.5 border border-purple-100">
              <div className={cn(
                "h-6 w-6 rounded-full grid place-items-center text-[10px] font-bold shrink-0",
                m.role === "lead" ? "bg-warning text-white" : "bg-sky-100 text-sky-700",
              )}>{(m.userName || "?").charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{m.userName}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className={cn(
                    "px-1 py-0 rounded text-[9px] uppercase tracking-wider font-bold",
                    m.role === "lead" ? "bg-warning/15 text-warning" : "bg-sky-100 text-sky-800",
                  )}>{m.role === "lead" ? "Lead" : "Helper"}</span>
                  {m.checkInAt && <span>· in {new Date(m.checkInAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>}
                  {m.checkOutAt && <span>· out {new Date(m.checkOutAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Keluarkan ${m.userName} dari tim?`)) onRemove(m.id); }} className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add new member */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        <Select value={newUserId} onValueChange={setNewUserId}>
          <SelectTrigger className="flex-1 bg-white h-9"><SelectValue placeholder="Pilih teknisi..." /></SelectTrigger>
          <SelectContent>
            {availableUsers.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground italic">Semua user sudah masuk tim</div>
            ) : availableUsers.map(u => (
              <SelectItem key={u.id} value={String(u.id)}>{u.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={newRole} onValueChange={(v) => setNewRole(v as "lead" | "helper")}>
          <SelectTrigger className="w-[110px] bg-white h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="lead" disabled={hasLead}>Lead {hasLead ? "(sudah ada)" : ""}</SelectItem>
            <SelectItem value="helper">Helper</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleAdd} disabled={!newUserId || isAdding} className="h-9">
          {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      <p className="px-3 pb-2 text-[10px] text-purple-700/70">
         Lead = supervisor (boleh close tiket). Helper = teknisi pendamping. Semua anggota tim akan bisa update stage + upload foto.
      </p>
    </div>
  );
}

// -------------------------------------------------------------------------
// v4.2.16: EvidencePanel - upload foto bukti (sebelum/proses/sesudah)
// -------------------------------------------------------------------------

export const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  before: "Sebelum",
  during: "Proses",
  after: "Sesudah",
  power_meter: "Power Meter",
  ont_serial: "Serial ONT",
  signature: "TTD",
};

async function compressImageToBase64(file: File, maxSize = 1280, quality = 0.7): Promise<string> {
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

export function EvidencePanel({
  ticketId, evidence, onUpload, isUploading,
}: {
  ticketId: number | null;
  evidence: Array<{ id: number; type: string; photoData?: string | null; hasPhoto?: boolean; capturedAt: string | null; capturedBy: number | null; notes: string | null }>;
  onUpload: (data: { type: string; photoData: string; notes?: string }) => void;
  isUploading: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingType, setPendingType] = useState<string>("during");
  const [processingFile, setProcessingFile] = useState(false);

  async function handleFile(file: File) {
    setProcessingFile(true);
    try {
      const compressed = await compressImageToBase64(file, 1280, 0.72);
      onUpload({ type: pendingType, photoData: compressed });
    } catch (e: any) {
      toast.error(e.message || "Gagal proses foto");
    } finally {
      setProcessingFile(false);
    }
  }

  return (
    /* ==== Ticket evidence panel (foto bukti) ==== */
    <div data-section="ticket-evidence-panel" className="rounded-lg border bg-card overflow-hidden mt-4">
      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Foto Bukti</span>
          <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{evidence.length}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Select value={pendingType} onValueChange={setPendingType}>
            <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(EVIDENCE_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={processingFile || isUploading} className="h-7 text-xs">
            {(processingFile || isUploading) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5 mr-1" /> Upload</>}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          />
        </div>
      </div>

      {evidence.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-muted-foreground">
          Belum ada foto. Upload foto bukti pengerjaan (sebelum/proses/sesudah).
        </div>
      ) : (
        <div className="p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {evidence.map(e => {
            const photoUrl = (e.hasPhoto || e.photoData) ? `/api/tickets/${ticketId}/evidence/${e.id}/photo` : undefined;
            return (
            <a
              key={e.id}
              data-section="ticket-evidence-item"
              data-evidence-id={e.id}
              href={photoUrl}
              target="_blank"
              rel="noreferrer"
              className="block aspect-square rounded-md overflow-hidden border bg-muted relative group"
              title={`${EVIDENCE_TYPE_LABELS[e.type] || e.type} · ${e.capturedAt ? new Date(e.capturedAt).toLocaleString("id-ID") : ""}`}
            >
              {photoUrl && <img src={photoUrl} alt="evidence" className="w-full h-full object-cover" />}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-1">
                {EVIDENCE_TYPE_LABELS[e.type] || e.type}
              </div>
            </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// v4.2.16: TechnicianWorkloadPanel - laporan distribusi tiket per teknisi
// -------------------------------------------------------------------------

export interface TechnicianWorkload {
  userId: number;
  userName: string;
  userRole: string;
  totalAssigned: number;
  asLead: number;
  asHelper: number;
  open: number;
  inProgress: number;
  pending: number;
  resolvedThisMonth: number;
  avgWorkMinutes: number | null;
}

export interface CsatStat {
  userId: number; userName: string;
  totalResponses: number; avgRating: number;
  positiveCount: number; negativeCount: number;
}

export function TechnicianWorkloadPanel() {
  const [expanded, setExpanded] = useState(false);
  const { data: workload = [], isLoading } = useQuery<TechnicianWorkload[]>({
    queryKey: ["ticket-workload-by-technician"],
    queryFn: () => api.get("/tickets/workload-by-technician"),
    refetchInterval: 60_000,
  });
  // v4.2.17: CSAT aggregate per teknisi
  const { data: csatStats = [] } = useQuery<CsatStat[]>({
    queryKey: ["ticket-csat-by-technician"],
    queryFn: () => api.get("/tickets/csat-by-technician"),
    refetchInterval: 60_000,
  });
  const csatByUser = useMemo(() => {
    const m = new Map<number, CsatStat>();
    for (const c of csatStats) m.set(c.userId, c);
    return m;
  }, [csatStats]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-4 px-4 flex items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading workload teknisi...
        </CardContent>
      </Card>
    );
  }
  if (workload.length === 0) {
    return null; // jangan tampil kalau belum ada teknisi yang assign
  }

  const totalActive = workload.reduce((sum, w) => sum + w.open + w.inProgress + w.pending, 0);
  const visible = expanded ? workload : workload.slice(0, 6);
  const hasMore = workload.length > 6;

  return (
    /* ==== Ticket workload-by-technician panel ==== */
    <Card data-section="ticket-workload-panel">
      <CardContent className="p-0">
        <div className="px-4 py-2.5 border-b bg-gradient-to-r from-purple-50/60 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">Tiket per Teknisi</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {workload.length} teknisi · {totalActive} tiket aktif
            </span>
          </div>
          {hasMore && (
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-purple-700 hover:underline font-semibold">
              {expanded ? "Tampilkan lebih sedikit" : `Lihat semua (${workload.length})`}
            </button>
          )}
        </div>
        <div className="divide-y">
          {visible.map((w) => {
            const activeTotal = w.open + w.inProgress + w.pending;
            const initials = (w.userName || "?").split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div key={w.userId} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 grid place-items-center text-white text-xs font-bold shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold truncate">{w.userName}</span>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0 rounded bg-muted text-foreground font-bold">{w.userRole}</span>
                    {w.asLead > 0 && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0 rounded bg-warning/15 text-warning font-bold">
                        {w.asLead} Lead
                      </span>
                    )}
                    {w.asHelper > 0 && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0 rounded bg-sky-100 text-sky-800 font-bold">
                        {w.asHelper} Helper
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums flex-wrap">
                    <span><strong className="text-foreground">{w.totalAssigned}</strong> total</span>
                    {activeTotal > 0 && <span className="text-orange-700"><strong>{activeTotal}</strong> aktif</span>}
                    {w.resolvedThisMonth > 0 && <span className="text-success"><strong>{w.resolvedThisMonth}</strong> selesai bulan ini</span>}
                    {w.avgWorkMinutes !== null && <span className="text-muted-foreground/70">avg {w.avgWorkMinutes}m/tiket</span>}
                    {/* v4.2.17: CSAT score */}
                    {(() => {
                      const csat = csatByUser.get(w.userId);
                      if (!csat || csat.totalResponses === 0) return null;
                      const tone = csat.avgRating >= 4.2 ? "text-success bg-success/10 border-success/30" : csat.avgRating >= 3.5 ? "text-warning bg-warning/10 border-warning/30" : "text-destructive bg-destructive/10 border-destructive/30";
                      return (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0 rounded border ${tone}`} title={`${csat.totalResponses} respons · ${csat.positiveCount} positif · ${csat.negativeCount} negatif`}>
                           {csat.avgRating.toFixed(1)} <span className="text-muted-foreground">({csat.totalResponses})</span>
                        </span>
                      );
                    })()}
                  </div>
                </div>
                {/* Mini bar - proporsi status */}
                {activeTotal > 0 && (
                  <div className="hidden md:flex items-center gap-0.5 shrink-0">
                    {w.open > 0 && (
                      <div title={`${w.open} open/assigned`} className="h-6 bg-blue-400 rounded-sm" style={{ width: Math.max(8, (w.open / activeTotal) * 80) }} />
                    )}
                    {w.inProgress > 0 && (
                      <div title={`${w.inProgress} dikerjakan`} className="h-6 bg-orange-400 rounded-sm" style={{ width: Math.max(8, (w.inProgress / activeTotal) * 80) }} />
                    )}
                    {w.pending > 0 && (
                      <div title={`${w.pending} pending`} className="h-6 bg-warning rounded-sm" style={{ width: Math.max(8, (w.pending / activeTotal) * 80) }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// -- v4.2.18 (F.1): Kanban View --------------------------------------------
// KanbanView dipindah ke ./components/tickets/KanbanView (di-import di atas).
