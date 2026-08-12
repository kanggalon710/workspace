import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, ChevronDown, ChevronUp, Filter, Building2, Home } from "lucide-react";
import { type DistrictSummary } from "./shared";

export function DistrictCard({
  d, isExpanded, onToggle, onFilterDistrict, onFilterVillage,
}: {
  d: DistrictSummary; isExpanded: boolean; onToggle: () => void;
  onFilterDistrict: (district: string) => void; onFilterVillage: (district: string, village: string) => void;
}) {
  const activePct = d.total > 0 ? Math.round((d.active / d.total) * 100) : 0;
  const suspendedPct = d.total > 0 ? Math.round((d.suspended / d.total) * 100) : 0;

  return (
    <div className="rounded-xl border overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/30 transition-colors">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0">
          <MapPin className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{d.district || "Tanpa Kecamatan"}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">{d.villages.length} desa</Badge>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground">{d.total} pelanggan</span>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] text-muted-foreground">{d.active}</span>
            </div>
            {d.suspended > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                <span className="text-[10px] text-muted-foreground">{d.suspended}</span>
              </div>
            )}
          </div>
          {/* Mini progress bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden mt-1.5 bg-muted">
            {activePct > 0 && <div className="h-full bg-green-500" style={{ width: `${activePct}%` }} />}
            {suspendedPct > 0 && <div className="h-full bg-yellow-500" style={{ width: `${suspendedPct}%` }} />}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(e) => { e.stopPropagation(); onFilterDistrict(d.district); }}>
            <Filter className="h-3 w-3 mr-1" /> Filter
          </Button>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {isExpanded && (
        <div className="border-t px-3 py-2 space-y-1 bg-muted/20">
          <div className="flex items-center gap-1.5 sm:gap-4 px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="flex-1 min-w-0">Desa / Kelurahan</span>
            <span className="w-9 sm:w-14 text-center shrink-0">Total</span>
            <span className="w-9 sm:w-14 text-center shrink-0">Aktif</span>
            <span className="w-9 sm:w-14 text-center shrink-0">Isolir</span>
            <span className="w-11 sm:w-14 shrink-0"></span>
          </div>
          {d.villages.sort((a, b) => b.total - a.total).map(v => (
            <div key={v.name} className="flex items-center gap-1.5 sm:gap-4 px-2 py-1.5 rounded-lg hover:bg-muted/50 transition-colors">
              <span className="flex-1 min-w-0 text-xs font-medium truncate">{v.name || "Tidak diketahui"}</span>
              <span className="w-9 sm:w-14 text-center text-xs font-bold shrink-0">{v.total}</span>
              <span className="w-9 sm:w-14 text-center text-xs text-green-600 font-medium shrink-0">{v.active}</span>
              <span className="w-9 sm:w-14 text-center text-xs text-yellow-600 font-medium shrink-0">{v.suspended > 0 ? v.suspended : "-"}</span>
              <Button variant="ghost" size="sm" className="h-6 w-11 sm:w-14 px-1 text-[10px] shrink-0"
                onClick={() => onFilterVillage(d.district, v.name)}>
                Lihat
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-1.5 sm:gap-4 px-2 py-1.5 border-t mt-1">
            <span className="flex-1 min-w-0 text-xs font-bold">Total</span>
            <span className="w-9 sm:w-14 text-center text-xs font-bold shrink-0">{d.total}</span>
            <span className="w-9 sm:w-14 text-center text-xs font-bold text-green-600 shrink-0">{d.active}</span>
            <span className="w-9 sm:w-14 text-center text-xs font-bold text-yellow-600 shrink-0">{d.suspended > 0 ? d.suspended : "-"}</span>
            <span className="w-11 sm:w-14 shrink-0"></span>
          </div>
          {/* Type breakdown */}
          <div className="flex gap-3 px-2 pt-1">
            <div className="flex items-center gap-1.5">
              <Home className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Rumahan: {d.rumahan}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Bisnis: {d.bisnis}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== EXPORT HELPER ====================

