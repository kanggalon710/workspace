/**
 * v4.2.18 (B.8): ConfirmStageModal - konfirmasi sebelum "Selesaikan Stage"
 * (action irreversible by Helper)
 */

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CheckCircle2, AlertTriangle, Camera, FileText, MapPin, Edit3 } from "lucide-react";
import { Loader2 } from "lucide-react";

interface FieldSummary {
  label: string;
  value: string;
  type?: "text" | "photo" | "gps" | "signature";
  filled: boolean;
}

export function ConfirmStageModal({
  open, onClose, onConfirm,
  stageName, stageDescription, fields,
  isFinalStage = false, isPending = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  stageName: string;
  stageDescription?: string;
  fields: FieldSummary[];
  isFinalStage?: boolean;
  isPending?: boolean;
}) {
  const allFilled = fields.every(f => f.filled);
  const missing = fields.filter(f => !f.filled);

  function getIcon(type?: string) {
    if (type === "photo") return <Camera className="w-3 h-3 text-purple-600" />;
    if (type === "gps") return <MapPin className="w-3 h-3 text-sky-600" />;
    if (type === "signature") return <Edit3 className="w-3 h-3 text-indigo-600" />;
    return <FileText className="w-3 h-3 text-zinc-600" />;
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isPending) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isFinalStage ? (
              <><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Selesaikan Tiket?</>
            ) : (
              <><CheckCircle2 className="w-5 h-5 text-blue-600" /> Selesaikan Stage?</>
            )}
          </DialogTitle>
          <DialogDescription>
            {isFinalStage
              ? `Stage final "${stageName}" - setelah ini tiket akan ditutup dan customer dapat survey kepuasan.`
              : `Stage "${stageName}" akan ditandai selesai. Lanjut ke stage berikutnya.`}
          </DialogDescription>
        </DialogHeader>

        {stageDescription && (
          <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground italic border">
            {stageDescription}
          </div>
        )}

        {/* Field summary */}
        <div className="space-y-1.5 my-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Ringkasan Data</div>
          {fields.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Tidak ada field yang perlu diisi untuk stage ini.</p>
          ) : (
            <div className="rounded-md border divide-y">
              {fields.map((f, i) => (
                <div key={i} className="px-3 py-2 flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">{getIcon(f.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground/80">{f.label}</span>
                      {f.filled ? (
                        <span className="text-[9px] uppercase tracking-wider font-bold px-1 py-0 rounded bg-emerald-100 text-emerald-700">✓ TERISI</span>
                      ) : (
                        <span className="text-[9px] uppercase tracking-wider font-bold px-1 py-0 rounded bg-rose-100 text-rose-700"> KOSONG</span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{f.value || "-"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {!allFilled && missing.length > 0 && (
          <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-800">
              <strong>{missing.length} field belum terisi:</strong> {missing.map(m => m.label).join(", ")}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Batal</Button>
          <Button
            onClick={onConfirm}
            disabled={!allFilled || isPending}
            className={isFinalStage ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            {isFinalStage ? "Ya, Selesaikan Tiket" : "Ya, Selesaikan Stage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
