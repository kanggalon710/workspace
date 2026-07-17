/**
 * v4.2.18 (B.7): TicketActionToolbar
 * 4 action buttons di header tiket:
 *   - Hold (pause SLA) dengan reason modal
 *   - Reassign Lead dengan reason
 *   - Escalate ke supervisor
 *   - Cancel ticket dengan reason
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Pause, Play, UserCheck, AlertTriangle, XCircle, Loader2 } from "lucide-react";

const HOLD_REASONS = [
  { value: "WAIT_CUSTOMER",  label: "Menunggu Customer (akses, konfirmasi)" },
  { value: "WAIT_MATERIAL",  label: "Menunggu Material (kabel, splitter, ONT)" },
  { value: "WAIT_3RD_PARTY", label: "Menunggu Pihak Ke-3 (PLN, vendor, dll)" },
  { value: "OUT_OF_HOURS",   label: "Diluar Jam Kerja" },
  { value: "OTHER",          label: "Lainnya" },
];

interface TeamMember { id: number; userId: number; userName: string; role: string; }

export function TicketActionToolbar({ ticketId, ticketStatus, onChange }: {
  ticketId: number;
  ticketStatus: string | null;
  onChange?: () => void;
}) {
  const qc = useQueryClient();
  const isResolved = ticketStatus === "resolved" || ticketStatus === "closed" || ticketStatus === "cancelled";

  // Active pause check
  const { data: pauseData } = useQuery<{ activePause: any | null; totalPauseSec: number }>({
    queryKey: ["ticket-pauses", ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}/pauses`),
    enabled: !!ticketId,
    refetchInterval: 30_000,
  });

  const isOnHold = !!pauseData?.activePause;

  // Modal states
  const [holdOpen, setHoldOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  // Hold form
  const [holdReason, setHoldReason] = useState("WAIT_CUSTOMER");
  const [holdNote, setHoldNote] = useState("");

  // Reassign form
  const [newLeadId, setNewLeadId] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const { data: users = [] } = useQuery<Array<{ id: number; name: string; role: string }>>({
    queryKey: ["users-list"],
    queryFn: () => api.get(`/users`),
    enabled: reassignOpen,
  });

  // Escalate form
  const [escalateNote, setEscalateNote] = useState("");
  const [raisePriority, setRaisePriority] = useState(true);

  // Cancel form
  const [cancelReason, setCancelReason] = useState("");

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ticket-detail", ticketId] });
    qc.invalidateQueries({ queryKey: ["ticket-pauses", ticketId] });
    qc.invalidateQueries({ queryKey: ["ticket-activities", ticketId] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    if (onChange) onChange();
  };

  const holdMut = useMutation({
    mutationFn: () => api.post(`/tickets/${ticketId}/hold`, { reason: holdReason, note: holdNote }),
    onSuccess: () => { toast.success("Tiket di-hold, SLA timer paused"); setHoldOpen(false); setHoldNote(""); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const resumeMut = useMutation({
    mutationFn: () => api.post(`/tickets/${ticketId}/resume`, {}),
    onSuccess: () => { toast.success("Tiket di-resume, SLA timer berjalan kembali"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const reassignMut = useMutation({
    mutationFn: () => api.post(`/tickets/${ticketId}/assign`, { assignedTo: Number(newLeadId) }),
    onSuccess: () => { toast.success("Lead baru di-assign"); setReassignOpen(false); setNewLeadId(""); setReassignReason(""); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const escalateMut = useMutation({
    mutationFn: () => api.post(`/tickets/${ticketId}/escalate`, { note: escalateNote, raisePriority }),
    onSuccess: () => { toast.success("Tiket di-escalate ke supervisor"); setEscalateOpen(false); setEscalateNote(""); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: () => api.post(`/tickets/${ticketId}/cancel`, { reason: cancelReason }),
    onSuccess: () => { toast.success("Tiket di-cancel"); setCancelOpen(false); setCancelReason(""); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isResolved) return null;

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        {isOnHold ? (
          <Button size="sm" variant="outline" className="text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => resumeMut.mutate()} disabled={resumeMut.isPending}>
            {resumeMut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            Resume Tiket
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setHoldOpen(true)}>
            <Pause className="w-3.5 h-3.5 mr-1" /> Hold
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setReassignOpen(true)}>
          <UserCheck className="w-3.5 h-3.5 mr-1" /> Reassign
        </Button>
        <Button size="sm" variant="outline" className="text-orange-700 border-orange-300 hover:bg-orange-50" onClick={() => setEscalateOpen(true)}>
          <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Escalate
        </Button>
        <Button size="sm" variant="outline" className="text-rose-700 border-rose-300 hover:bg-rose-50" onClick={() => setCancelOpen(true)}>
          <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
        </Button>
      </div>

      {/* HOLD modal */}
      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pause className="w-4 h-4 text-amber-500" /> Hold Tiket</DialogTitle>
            <DialogDescription>SLA timer akan paused selama tiket di-hold. Resume manual saat lanjut kerja.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Alasan Hold</Label>
              <Select value={holdReason} onValueChange={setHoldReason}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOLD_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Catatan (opsional)</Label>
              <Textarea value={holdNote} onChange={(e) => setHoldNote(e.target.value)} rows={2} className="mt-1.5" placeholder="Detail kondisi yang menyebabkan hold..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHoldOpen(false)}>Batal</Button>
            <Button onClick={() => holdMut.mutate()} disabled={holdMut.isPending} className="bg-amber-600 hover:bg-amber-700 text-white">
              {holdMut.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Hold Sekarang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REASSIGN modal */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserCheck className="w-4 h-4" /> Reassign Lead</DialogTitle>
            <DialogDescription>Ganti teknisi lead. Lead lama otomatis demote jadi helper.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Pilih Lead Baru</Label>
              <Select value={newLeadId} onValueChange={setNewLeadId}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pilih teknisi..." /></SelectTrigger>
                <SelectContent>
                  {users.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.role})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Alasan (opsional)</Label>
              <Textarea value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} rows={2} className="mt-1.5" placeholder="Misal: lead asli sakit, beban kerja terlalu tinggi..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReassignOpen(false)}>Batal</Button>
            <Button onClick={() => reassignMut.mutate()} disabled={reassignMut.isPending || !newLeadId}>
              {reassignMut.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ESCALATE modal */}
      <Dialog open={escalateOpen} onOpenChange={setEscalateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600"><AlertTriangle className="w-4 h-4" /> Escalate ke Supervisor</DialogTitle>
            <DialogDescription>Notifikasi Telegram + in-app ke supervisor. Bisa naikkan prioritas otomatis.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Catatan untuk Supervisor</Label>
              <Textarea value={escalateNote} onChange={(e) => setEscalateNote(e.target.value)} rows={3} className="mt-1.5" placeholder="Jelaskan kenapa perlu escalation..." />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={raisePriority} onChange={(e) => setRaisePriority(e.target.checked)} className="w-4 h-4" />
              <span>Naikkan prioritas otomatis (medium → high → urgent)</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEscalateOpen(false)}>Batal</Button>
            <Button onClick={() => escalateMut.mutate()} disabled={escalateMut.isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
              {escalateMut.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Escalate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CANCEL modal */}
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600"><XCircle className="w-4 h-4" /> Cancel Tiket</DialogTitle>
            <DialogDescription>Tiket akan ditutup tanpa resolusi normal. Tidak bisa di-undo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Alasan Cancel <span className="text-rose-500">*</span></Label>
              <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} className="mt-1.5" placeholder="Wajib diisi: kenapa tiket di-cancel..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Batal</Button>
            <Button onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending || !cancelReason.trim()} className="bg-rose-600 hover:bg-rose-700 text-white">
              {cancelMut.isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}Cancel Tiket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
