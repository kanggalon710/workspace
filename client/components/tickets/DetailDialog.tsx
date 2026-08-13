import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type Ticket, type TicketCategory, type TicketWithActivities, type SafeUser, type Customer, formatDuration, formatDate, formatDateTime, slaTone, PRIORITY_CONFIG, STATUS_CONFIG, ACTIVITY_ICON_CONFIG } from "@/components/tickets/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Clock, CheckCircle2, Pause, ArrowRight, UserPlus, Loader2, Trash2, X } from "lucide-react";
import { InfoRow, WorkflowSection, TeamPanel, EvidencePanel, parseActivityContent } from "@/components/tickets/panels";

export function DetailDialog({ ticketId, onClose, categories, customerMap, userMap, onEdit, onDelete }: {
  ticketId: number | null;
  onClose: () => void;
  categories: TicketCategory[];
  customerMap: Map<number, Customer>;
  userMap: Map<number, SafeUser>;
  onEdit: (t: Ticket) => void;
  onDelete: (id: number) => void;
}) {
  const qc = useQueryClient();
  const [noteText, setNoteText] = useState("");
  const [resolutionText, setResolutionText] = useState("");
  const [actualDuration, setActualDuration] = useState("");
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [showAssignForm, setShowAssignForm] = useState(false);

  const { data: detail, isLoading } = useQuery<TicketWithActivities>({
    queryKey: ["ticket-detail", ticketId],
    queryFn: () => api.get<TicketWithActivities>(`/tickets/${ticketId}`),
    enabled: ticketId !== null,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    qc.invalidateQueries({ queryKey: ["ticket-stats"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const statusMut = useMutation({
    mutationFn: (body: { status: string; resolution?: string; actualDuration?: number }) =>
      api.post(`/tickets/${ticketId}/status`, body),
    onSuccess: () => { invalidateAll(); toast.success("Status diperbarui"); setShowResolveForm(false); },
    onError: (e: any) => toast.error(e.message),
  });

  const assignMut = useMutation({
    mutationFn: (body: { assignedTo: number }) =>
      api.post(`/tickets/${ticketId}/assign`, body),
    onSuccess: () => { invalidateAll(); toast.success("Petugas ditugaskan"); setShowAssignForm(false); setAssignUserId(""); },
    onError: (e: any) => toast.error(e.message),
  });

  // v4.2.16: Team - multi-technician (lead + helpers untuk kerja barengan di lapangan)
  const { data: teamMembers = [] } = useQuery<Array<{ id: number; userId: number; role: string; userName: string; userRole: string; checkInAt: string | null; checkOutAt: string | null }>>({
    queryKey: ["ticket-team", ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}/team`),
    enabled: ticketId !== null,
    refetchInterval: 30_000,
  });
  const addTeamMut = useMutation({
    mutationFn: (body: { userId: number; role: "lead" | "helper" }) =>
      api.post(`/tickets/${ticketId}/team`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket-team", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Anggota tim ditambahkan");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const removeTeamMut = useMutation({
    mutationFn: (memberId: number) => api.delete(`/tickets/${ticketId}/team/${memberId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket-team", ticketId] });
      toast.success("Anggota tim dihapus");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // v4.2.16: Evidence (foto bukti)
  const { data: evidence = [] } = useQuery<Array<{ id: number; type: string; photoData?: string | null; hasPhoto?: boolean; capturedAt: string | null; capturedBy: number | null; notes: string | null; lat: number | null; lng: number | null }>>({
    queryKey: ["ticket-evidence", ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}/evidence`),
    enabled: ticketId !== null,
  });
  const evidenceMut = useMutation({
    mutationFn: (body: { type: string; photoData: string; notes?: string; lat?: number; lng?: number }) =>
      api.post(`/tickets/${ticketId}/evidence`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ticket-evidence", ticketId] });
      toast.success("Foto berhasil diupload");
    },
    onError: (e: any) => toast.error(e.message || "Upload foto gagal"),
  });

  const noteMut = useMutation({
    mutationFn: (body: { content: string }) =>
      api.post(`/tickets/${ticketId}/activity`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] }); setNoteText(""); toast.success("Catatan ditambahkan"); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!ticketId) return null;

  const t = detail;
  const cat = t?.categoryId ? categories.find((c) => c.id === t.categoryId) : null;
  const cust = t?.customerId ? customerMap.get(t.customerId) : null;
  const assignee = t?.assignedTo ? userMap.get(t.assignedTo) : null;
  const creator = t ? userMap.get(t.createdBy) : null;
  const st = STATUS_CONFIG[t?.status ?? "open"] ?? STATUS_CONFIG.open;
  const pri = PRIORITY_CONFIG[t?.priority ?? "medium"] ?? PRIORITY_CONFIG.medium;

  return (
    <Dialog open={ticketId !== null} onOpenChange={(v) => { if (!v) onClose(); }}>
      {/* ==== Ticket detail dialog ==== */}
      <DialogContent data-section="ticket-detail-dialog" className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {isLoading || !t ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-500">Memuat detail...</span>
          </div>
        ) : (
          <>
            <DialogHeader className="pb-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="font-mono text-sm font-bold text-blue-600">{t.ticketNumber}</span>
                <Badge className={cn("border-0 text-xs", st.color)}>{st.label}</Badge>
                <Badge className={cn("border-0 text-xs", pri.color)}>{pri.label}</Badge>
                {cat && (
                  <Badge className="border-0 text-xs" style={{ backgroundColor: (cat.color ?? "#6B7280") + "20", color: cat.color ?? "#6B7280" }}>
                    {cat.name}
                  </Badge>
                )}
                {/* v4.2.4: SLA badge */}
                {(t.slaDeadline ?? t.deadline) && t.status !== "resolved" && t.status !== "closed" && (() => {
                  const sla = slaTone(t.slaDeadline ?? t.deadline);
                  if (!sla.tone) return null;
                  const cls =
                    sla.tone === "expired" ? "bg-rose-200 text-rose-900 border-rose-400" :
                    sla.tone === "danger" ? "bg-rose-100 text-rose-700 border-rose-200" :
                    sla.tone === "warning" ? "bg-amber-100 text-amber-700 border-amber-200" :
                    sla.tone === "caution" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                    "bg-emerald-100 text-emerald-700 border-emerald-200";
                  return (
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-mono tabular-nums font-bold", cls)}>
                      <Clock className="h-3 w-3" /> SLA {sla.label}
                    </span>
                  );
                })()}
              </div>
              <DialogTitle className="text-xl">{t.title}</DialogTitle>
              {t.description && (
                <DialogDescription className="mt-1 whitespace-pre-wrap">{t.description}</DialogDescription>
              )}
            </DialogHeader>

            {/* v4.2.4: Workflow stages timeline */}
            <WorkflowSection ticketId={t.id} />

            {/* v4.2.16: Foto Bukti - upload + gallery */}
            <EvidencePanel
              ticketId={ticketId}
              evidence={evidence}
              onUpload={(data) => evidenceMut.mutate(data)}
              isUploading={evidenceMut.isPending}
            />

            {/* ==== Ticket detail info grid ==== */}
            <div data-section="ticket-detail-info" className="grid grid-cols-2 gap-x-6 gap-y-3 mt-4 text-sm">
              <InfoRow label="Pelanggan" value={cust ? `${cust.name} (${cust.customerId})` : "\u2014"} />
              <InfoRow
                label="Tim Tugas"
                value={
                  teamMembers.length > 0
                    ? teamMembers.map(m => `${m.userName}${m.role === "lead" ? " (Lead)" : ""}`).join(", ")
                    : (assignee?.name ?? "\u2014")
                }
              />
              <InfoRow label="Jadwal" value={t.scheduledDate ? `${formatDate(t.scheduledDate)}${t.scheduledTime ? ` ${t.scheduledTime.slice(0, 5)}` : ""}` : "\u2014"} />
              <InfoRow label="Estimasi" value={formatDuration(t.estimatedDuration)} />
              <InfoRow label="Deadline" value={formatDate(t.deadline)} />
              <InfoRow label="Dibuat oleh" value={creator?.name ?? "\u2014"} />
              <InfoRow label="Dibuat pada" value={formatDateTime(t.createdAt)} />
              <InfoRow label="Alamat" value={t.address ?? "\u2014"} />
              {t.resolution && <InfoRow label="Resolusi" value={t.resolution} />}
              {t.actualDuration && <InfoRow label="Durasi Aktual" value={formatDuration(t.actualDuration)} />}
            </div>

            {/* ==== Ticket detail status action buttons ==== */}
            <div data-section="ticket-detail-actions" className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t">
              <span className="text-sm font-medium text-gray-500 mr-1">Aksi:</span>

              {/* v4.2.16: Tim Tugas - buka kapan aja, bukan cuma open/assigned */}
              <Button size="sm" variant="outline" onClick={() => setShowAssignForm(!showAssignForm)}>
                <UserPlus className="w-3.5 h-3.5 mr-1" />
                Tim Tugas
                {teamMembers.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold tabular-nums">
                    {teamMembers.length}
                  </span>
                )}
              </Button>

              {(t.status === "open" || t.status === "assigned") && (
                <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ status: "in_progress" })}>
                  <ArrowRight className="w-3.5 h-3.5 mr-1" /> Mulai Kerjakan
                </Button>
              )}
              {t.status === "in_progress" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ status: "pending" })}>
                    <Pause className="w-3.5 h-3.5 mr-1" /> Tandai Tertunda
                  </Button>
                  <Button size="sm" variant="default" onClick={() => setShowResolveForm(!showResolveForm)}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Selesai
                  </Button>
                </>
              )}
              {t.status === "pending" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ status: "in_progress" })}>
                    <ArrowRight className="w-3.5 h-3.5 mr-1" /> Lanjutkan
                  </Button>
                  <Button size="sm" variant="default" onClick={() => setShowResolveForm(!showResolveForm)}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Selesai
                  </Button>
                </>
              )}
              {t.status === "resolved" && (
                <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ status: "closed" })}>
                  <X className="w-3.5 h-3.5 mr-1" /> Tutup Tiket
                </Button>
              )}

              <div className="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => onEdit(t)}>Edit</Button>
              <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => onDelete(t.id)}>
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Hapus
              </Button>
            </div>

            {/* v4.2.16: Tim Tugas - multi-teknisi (lead + helpers untuk kerja barengan) */}
            {showAssignForm && (
              <TeamPanel
                teamMembers={teamMembers}
                userMap={userMap}
                onAdd={(userId, role) => addTeamMut.mutate({ userId, role })}
                onRemove={(memberId) => removeTeamMut.mutate(memberId)}
                onClose={() => setShowAssignForm(false)}
                isAdding={addTeamMut.isPending}
              />
            )}

            {/* Resolve inline form */}
            {showResolveForm && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 space-y-3 mt-2">
                <div className="space-y-1.5">
                  <Label className="text-sm">Catatan Resolusi</Label>
                  <Textarea value={resolutionText} onChange={(e) => setResolutionText(e.target.value)} placeholder="Jelaskan penyelesaian..." rows={2} className="bg-white" />
                </div>
                <div className="flex items-center flex-wrap gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Durasi Aktual (menit)</Label>
                    <Input type="number" min={1} value={actualDuration} onChange={(e) => setActualDuration(e.target.value)} className="w-[140px] bg-white" placeholder="menit" />
                  </div>
                  <div className="flex items-center gap-2 mt-5">
                    <Button size="sm" disabled={statusMut.isPending} onClick={() => {
                      statusMut.mutate({
                        status: "resolved",
                        resolution: resolutionText || undefined,
                        actualDuration: actualDuration ? Number(actualDuration) : undefined,
                      });
                    }}>
                      {statusMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Konfirmasi Selesai"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowResolveForm(false)}>Batal</Button>
                  </div>
                </div>
              </div>
            )}

            {/* ==== Ticket activity timeline ==== */}
            <div data-section="ticket-activity-timeline" className="mt-5 pt-4 border-t">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Riwayat Aktivitas</h3>
              {(t.activities?.length ?? 0) === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">Belum ada aktivitas</p>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {[...t.activities].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((act) => {
                    const cfg = ACTIVITY_ICON_CONFIG[act.type] ?? ACTIVITY_ICON_CONFIG.note;
                    const ActIcon = cfg.icon;
                    const actUser = userMap.get(act.userId);
                    const parsed = parseActivityContent(act);
                    return (
                      <div key={act.id} data-section="ticket-activity-item" data-activity-id={act.id} className="flex gap-3 items-start">
                        <div className={cn("p-1.5 rounded-full mt-0.5 shrink-0", cfg.color)}>
                          <ActIcon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">{actUser?.name ?? "Sistem"}</span>
                            <span className="text-xs text-gray-400">{formatDateTime(act.createdAt)}</span>
                          </div>
                          <p className="text-sm text-gray-600 mt-0.5">{parsed}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ==== Ticket add-note composer ==== */}
            <div data-section="ticket-add-note" className="mt-4 pt-3 border-t">
              <Label className="text-sm font-medium mb-1.5 block">Tambah Catatan</Label>
              <div className="flex gap-2">
                <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Tulis catatan..." rows={2} className="flex-1" />
                <Button className="self-end" disabled={!noteText.trim() || noteMut.isPending} onClick={() => noteMut.mutate({ content: noteText.trim() })}>
                  {noteMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Tambah Catatan"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

