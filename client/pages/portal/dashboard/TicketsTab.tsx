import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Clock, Inbox, Plus } from "lucide-react";
import { LoadingState } from "./shared";

export function TicketsTab({ tickets, apiFetch, qc }: any) {
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");

  const createMut = useMutation({
    mutationFn: (data: any) => apiFetch("/api/portal/tickets", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      toast.success("Tiket berhasil dilaporkan. Tim kami akan segera memproses.");
      setFormOpen(false); setTitle(""); setDesc("");
      qc.invalidateQueries({ queryKey: ["portal-tickets"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const STATUS_CFG: Record<string, { label: string; color: string }> = {
    open: { label: "Baru", color: "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" },
    assigned: { label: "Ditugaskan", color: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
    in_progress: { label: "Ditangani", color: "bg-warning/15 text-warning" },
    resolved: { label: "Selesai", color: "bg-success/15 text-success" },
    closed: { label: "Ditutup", color: "bg-muted text-muted-foreground" },
  };

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Header + action */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Pusat Bantuan</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Lapor kendala, pertanyaan, atau permintaan layanan</p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="bg-sky-600 hover:bg-sky-700">
          <Plus className="h-4 w-4 mr-1.5" /> Lapor Baru
        </Button>
      </div>

      {/* Tickets list */}
      {!tickets ? (
        <LoadingState />
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="p-10">
            <EmptyState
              icon={Inbox}
              title="Belum Ada Tiket"
              description="Semua laporan akan tampil di sini. Klik 'Lapor Baru' untuk membuat tiket pertama."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t: any) => {
            const cfg = STATUS_CFG[t.status] ?? { label: t.status, color: "bg-muted" };
            return (
              <Card key={t.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[10px] font-mono font-semibold text-muted-foreground">#{t.ticketNumber}</span>
                        <Badge className={`text-[10px] border-0 ${cfg.color}`}>{cfg.label}</Badge>
                      </div>
                      <h4 className="font-semibold text-sm">{t.title}</h4>
                      {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                      <div className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(t.createdAt).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md dialog-w max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lapor Kendala Baru</DialogTitle>
            <DialogDescription>
              Jelaskan kendala secara spesifik agar tim support bisa segera membantu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Judul</label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Internet lambat sejak pagi" maxLength={100} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deskripsi</label>
              <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ceritakan detail kendala..." rows={4} maxLength={1000} className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">{desc.length}/1000 karakter</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Batal</Button>
            <Button
              onClick={() => createMut.mutate({ title: title.trim(), description: desc.trim() })}
              disabled={!title.trim() || createMut.isPending}
              className="bg-sky-600 hover:bg-sky-700"
            >
              {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Kirim Laporan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// =====================================================================
// POINTS TAB - Speed-on-Demand (Telco Premium)
// =====================================================================
