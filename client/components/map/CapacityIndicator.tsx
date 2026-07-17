/** Progress bar utilisasi ODP + angka used/total + persen (theme-aware, reusable). */
export function CapacityIndicator({ used, total, pct }: { used: number; total: number; pct: number }) {
  const barCls = pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-warning" : "bg-success";
  const txtCls = pct >= 90 ? "text-destructive" : pct >= 70 ? "text-warning" : "text-success";
  return (
    <div aria-label={`Utilisasi ${pct}%`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Utilisasi</span>
        <span className={`text-sm font-extrabold tabular-nums ${txtCls}`}>{used} / {total} · {pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-all ${barCls}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between mt-1 text-[11px] text-muted-foreground">
        <span><strong className="text-foreground">{used}</strong> terpakai</span>
        <span><strong className={txtCls}>{Math.max(0, total - used)}</strong> tersedia</span>
      </div>
    </div>
  );
}
