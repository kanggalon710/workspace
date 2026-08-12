import { Database, Users, CheckCircle2, XCircle, Wallet, TrendingUp } from "lucide-react";
import { formatRupiah } from "@shared/currency";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { useCollectionMetrics } from "@/hooks/usePipelines";

const rupiah = (n: number) => formatRupiah(n);

export function CollectionMetricsDialog({ pipelineId, open, onClose }: { pipelineId: number; open: boolean; onClose: () => void }) {
  const { data: m, isLoading } = useCollectionMetrics(pipelineId, open);
  const maxAging = m ? Math.max(1, ...m.aging.map((b) => b.count)) : 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b shrink-0"><DialogTitle>Metrik Collection</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isLoading ? (
            <div className="h-40 animate-pulse rounded bg-muted" />
          ) : !m || m.totalCards === 0 ? (
            <EmptyState icon={Database} title="Belum ada data collection" description="Belum ada kartu collection di pipeline ini." />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <StatTile icon={Database} label="Total Kartu" value={m.totalCards} accent="neutral" />
                <StatTile icon={Users} label="Aktif" value={m.activeCount} accent="info" />
                <StatTile icon={CheckCircle2} label="Lunas" value={m.paidCount} accent="success" />
                <StatTile icon={XCircle} label="Write-Off" value={m.writeoffCount} accent="danger" />
                <StatTile icon={Wallet} label="Outstanding" value={rupiah(m.totalOutstanding)} accent="warning" />
                <StatTile icon={TrendingUp} label="Success Rate" value={m.successRate == null ? "-" : `${Math.round(m.successRate * 100)}%`} accent="primary" />
              </div>

              <section>
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Aging (kartu aktif)</h4>
                <div className="space-y-1.5">
                  {m.aging.map((b) => (
                    <div key={b.label} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs text-muted-foreground">{b.label}</span>
                      <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                        <div className="h-full bg-primary/70" style={{ width: `${(b.count / maxAging) * 100}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums">{b.count}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Per Stage</h4>
                <ul className="space-y-1">
                  {m.byStage.map((s) => (
                    <li key={s.stageId} className="flex items-center justify-between text-sm">
                      <span className="truncate">{s.label}</span>
                      <span className="font-medium tabular-nums">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
