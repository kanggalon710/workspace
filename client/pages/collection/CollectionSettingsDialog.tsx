import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { type Collection } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Clock, XCircle, Loader2, RefreshCw, Settings } from "lucide-react";

export function CollectionSettingsDialog({ open, onClose, isAdmin }: { open: boolean; onClose: () => void; isAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: settings } = useQuery<any>({
    queryKey: ["/api/collections/settings"],
    queryFn: () => api.get("/collections/settings"),
    enabled: open,
  });

  const [enabled, setEnabled] = useState(true);
  const [triggerDays, setTriggerDays] = useState("3");
  const [writeoffDays, setWriteoffDays] = useState("0");
  const [reminderH3, setReminderH3] = useState(false);

  // Pre-fill saat settings loaded (pakai useEffect, bukan useMemo, karena ada side effect)
  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled ?? true);
      setTriggerDays(String(settings.triggerDays ?? 3));
      setWriteoffDays(String(settings.writeoffDays ?? 0));
      setReminderH3(settings.reminderH3Enabled ?? false);
    }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: (data: any) => api.put("/collections/settings", data),
    onSuccess: () => {
      toast.success("Pengaturan disimpan");
      qc.invalidateQueries({ queryKey: ["/api/collections/settings"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const runNowMut = useMutation({
    mutationFn: () => api.post("/collections/run-thresholds", {}),
    onSuccess: (data: any) => {
      const opened = data?.opened ?? 0;
      const closed = data?.closed ?? 0;
      const wo = data?.writtenOff ?? 0;
      const overdue = data?.overdueMoved ?? 0;
      toast.success(`Selesai: ${opened} dibuka (isolir), ${closed} ditutup (Lunas), ${wo} write-off, ${overdue} overdue`);
      qc.invalidateQueries({ queryKey: ["/api/collections"] });
      qc.invalidateQueries({ queryKey: ["/api/collections/stats"] });
      qc.invalidateQueries({ queryKey: ["/api/collections/settings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSave = () => {
    const t = Number(triggerDays);
    const w = Number(writeoffDays);
    if (isNaN(t) || t < 0 || t > 365) return toast.error("Trigger days harus 0-365");
    if (isNaN(w) || w < 0 || w > 3650) return toast.error("Writeoff days harus 0-3650");
    saveMut.mutate({ enabled, triggerDays: t, writeoffDays: w, reminderH3Enabled: reminderH3 });
  };

  return (
    /* ============ COLLECTION SETTINGS DIALOG (parameter) ============ */
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-section="collection-settings-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            Pengaturan Parameter Collection
          </DialogTitle>
          <DialogDescription className="text-xs">
            Atur kapan pelanggan otomatis masuk collection pipeline dan policy write-off.
            {!isAdmin && <span className="text-amber-600 block mt-1">Hanya admin yang bisa ubah settings ini (read-only untuk kamu).</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-md">
            <input type="checkbox" id="colEnabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={!isAdmin} />
            <label htmlFor="colEnabled" className="flex-1 text-sm cursor-pointer">
              <div className="font-medium">Collection Auto-Trigger Aktif</div>
              <div className="text-[11px] text-muted-foreground">Matikan untuk pause auto-open collection (manual only)</div>
            </label>
          </div>

          <div className="space-y-2">
            <Label className="text-sm flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Masuk Collection setelah berapa hari overdue?
            </Label>
            <div className="flex items-center gap-2">
              <Input type="number" min="0" max="365" value={triggerDays} onChange={(e) => setTriggerDays(e.target.value)} disabled={!isAdmin} className="w-24 font-mono" />
              <span className="text-sm text-muted-foreground">hari setelah jatuh tempo</span>
            </div>
            <p className="text-[11px] text-muted-foreground bg-blue-50 dark:bg-blue-950/30 rounded p-2">
               Contoh: <strong>3 hari</strong> = pelanggan masuk collection 3 hari setelah jatuh tempo tagihan (preventif, sebelum diisolir).
              Atur 0 untuk trigger di hari yang sama.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm flex items-center gap-1.5">
              <XCircle className="h-3.5 w-3.5" />
              Auto Write-Off setelah berapa hari?
            </Label>
            <div className="flex items-center gap-2">
              <Input type="number" min="0" max="3650" value={writeoffDays} onChange={(e) => setWriteoffDays(e.target.value)} disabled={!isAdmin} className="w-24 font-mono" />
              <span className="text-sm text-muted-foreground">hari (0 = nonaktif)</span>
            </div>
            <p className="text-[11px] text-muted-foreground bg-amber-50 dark:bg-amber-950/30 rounded p-2">
               Collection yang sudah open &gt; N hari akan otomatis di-move ke stage <strong>written_off</strong>.
              Contoh: <strong>90 hari</strong> untuk cleanup pelanggan yang tidak ada harapan bayar.
              Set 0 untuk menonaktifkan (harus manual write-off).
            </p>
          </div>

          <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-md opacity-60">
            <input type="checkbox" id="reminderH3" checked={reminderH3} onChange={(e) => setReminderH3(e.target.checked)} disabled={!isAdmin} />
            <label htmlFor="reminderH3" className="flex-1 text-sm cursor-pointer">
              <div className="font-medium">Kirim Reminder WA H-3 Sebelum Jatuh Tempo</div>
              <div className="text-[11px] text-muted-foreground">Coming soon - otomatis kirim WhatsApp via MPWA pakai template "tagihan_reminder"</div>
            </label>
          </div>

          {settings?.lastRunAt && (
            <div className="text-[11px] text-muted-foreground border-t pt-2">
              Last check: {new Date(settings.lastRunAt).toLocaleString("id-ID")}
              <br />
              Last opened: {settings.lastOpenedCount ?? 0} collection(s)
            </div>
          )}

          {isAdmin && (
            <div className="border-t pt-3">
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => runNowMut.mutate()}
                disabled={runNowMut.isPending}
              >
                {runNowMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Jalankan Threshold Check Sekarang
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                Trigger manual tanpa menunggu billing sync berikutnya (test atau perbaikan operasional).
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-3 border-t">
          <Button variant="outline" onClick={onClose} className="flex-1">Tutup</Button>
          {isAdmin && (
            <Button onClick={handleSave} disabled={saveMut.isPending} className="flex-1">
              {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Simpan
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- COMPONENTS ------------------------------------------------------------

