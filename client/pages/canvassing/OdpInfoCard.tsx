import { X, CircleDot } from "lucide-react";
import { T, type Odp, type Lead } from "./shared";

export function OdpInfoCard({ odp, onClose }: { odp: Odp; onClose: () => void }) {
  const used = odp.usedCapacity ?? 0;
  const total = odp.capacity ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const barColor = pct >= 100 ? "#EF4444" : pct >= 75 ? "#F59E0B" : "#22C55E";
  const statusText = pct >= 100 ? "Penuh" : pct >= 75 ? "Hampir Penuh" : "Tersedia";
  const statusColor = pct >= 100 ? "#EF4444" : pct >= 75 ? "#F59E0B" : "#22C55E";

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 md:absolute md:top-4 pointer-events-auto">
      <div className="rounded-2xl shadow-2xl min-w-[240px] max-w-[300px] overflow-hidden"
        style={{ background: T.bg }}>
        {/* Header with gradient */}
        <div className="px-4 py-3 flex items-center gap-3"
          style={{ background: `linear-gradient(135deg, ${T.deep}, ${T.container})` }}>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <CircleDot className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-white leading-tight truncate">{odp.name}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: statusColor }}>
              {statusText}
            </p>
          </div>
          <button onClick={onClose}
            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            <X className="h-3 w-3 text-white" />
          </button>
        </div>
        {/* Content */}
        <div className="px-4 py-3 space-y-2.5">
          {total > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: T.outline }}>Port Terpakai</span>
                <span className="text-sm font-bold" style={{ color: T.deep }}>{used}/{total}</span>
              </div>
              <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: T.surfaceHi }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: T.secondary }}>Sisa {total - used} port</span>
                <span className="text-xs font-bold" style={{ color: statusColor }}>{pct}%</span>
              </div>
            </>
          ) : (
            <p className="text-xs italic text-center py-2" style={{ color: T.secondary }}>Info kapasitas tidak tersedia</p>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Add Lead Form ---------------------------------------------------------
