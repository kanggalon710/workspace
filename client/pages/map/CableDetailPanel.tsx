import { useCableCoreByCable } from "@/hooks/useAssets";
import { Cable } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

// Extracted components
import { MapToolbar } from "@/components/map/MapToolbar";
import { MapSearchBar } from "@/components/map/MapSearchBar";
import { MapLayerPanel } from "@/components/map/MapLayerPanel";
import { MapTypeSelector } from "@/components/map/MapTypeSelector";
import { MapCameraControls } from "@/components/map/MapCameraControls";
import { MapInfoWindowContent } from "@/components/map/MapInfoWindow";
import { OdpDetailPanel } from "@/components/map/OdpDetailPanel";
import { MapMitraSelector } from "@/components/map/MapMitraSelector";
import { MapUtilityButtons } from "@/components/map/MapUtilityButtons";
import { FABSpeedDial } from "@/components/map/FABSpeedDial";
import { BottomSheet } from "@/components/shared/BottomSheet";

// Shared asset config
import {
  ASSET_COLORS, ASSET_MARKER_CONFIG, CABLE_COLORS, DARK_MAP_STYLE,
  dotIcon, odpUsageColor,
  type AssetType,
} from "@/lib/assetColors";
import { GARUT_CENTER, DEFAULT_ZOOM, SNAP_THRESHOLD_METERS, haversineMeters, nearestOnSegment, findSnapPoint, type SnapResult, type QuickFormProps } from "./shared";

export function CableDetailPanel({ cableId, cableName, onClose }: { cableId: number; cableName: string; onClose: () => void }) {
  const { data: cores, isLoading } = useCableCoreByCable(cableId);
  const colorMap: Record<string, string> = {
    "biru": "#3B82F6", "orange": "#F97316", "hijau": "#22C55E", "coklat": "#92400E",
    "abu-abu": "#9CA3AF", "putih": "#E5E7EB", "merah": "#EF4444", "hitam": "#1F2937",
    "kuning": "#EAB308", "ungu": "#8B5CF6", "pink": "#EC4899", "tosca": "#14B8A6",
  };

  const stats = cores ? {
    total: cores.length,
    available: cores.filter(c => c.status === "available").length,
    used: cores.filter(c => c.status === "used").length,
    reserved: cores.filter(c => c.status === "reserved").length,
    broken: cores.filter(c => c.status === "broken").length,
  } : null;

  const tubeGroups = cores ? cores.reduce((acc, core) => {
    if (!acc[core.tubeNumber]) acc[core.tubeNumber] = { color: core.tubeColor, cores: [] };
    acc[core.tubeNumber].cores.push(core);
    return acc;
  }, {} as Record<number, { color: string; cores: typeof cores }>) : {};

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md dialog-w max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cable className="h-4 w-4 text-orange-500" />{cableName}
          </DialogTitle>
          <DialogDescription>Detail core fiber optik</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Memuat data core...</p>
        ) : !cores || cores.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <p>Belum ada data core.</p>
            <p className="text-xs mt-1">Buka Core Manager untuk generate core kabel ini.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-success/10 rounded p-2"><div className="text-lg font-bold text-success">{stats!.available}</div><div className="text-[10px] text-muted-foreground">Tersedia</div></div>
              <div className="bg-destructive/10 rounded p-2"><div className="text-lg font-bold text-destructive">{stats!.used}</div><div className="text-[10px] text-muted-foreground">Terpakai</div></div>
              <div className="bg-warning/10 rounded p-2"><div className="text-lg font-bold text-warning">{stats!.reserved}</div><div className="text-[10px] text-muted-foreground">Reserved</div></div>
              <div className="bg-muted rounded p-2"><div className="text-lg font-bold text-muted-foreground">{stats!.broken}</div><div className="text-[10px] text-muted-foreground">Rusak</div></div>
            </div>
            {Object.entries(tubeGroups).map(([tubeNum, tube]) => (
              <div key={tubeNum} className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: colorMap[tube.color] || "#ccc" }} />
                  Tube {tubeNum} ({tube.color})
                </div>
                <div className="grid grid-cols-6 gap-1">
                  {tube.cores.map((core) => {
                    const statusColor = core.status === "available" ? "bg-success" : core.status === "used" ? "bg-destructive" : core.status === "reserved" ? "bg-warning" : "bg-muted-foreground";
                    return (
                      <div key={core.id} className={`aspect-square rounded-sm flex items-center justify-center text-[9px] font-mono text-white ${statusColor}`} title={`Core ${core.coreNumber} (${core.coreColor}) - ${core.status}`}>
                        {core.coreNumber}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ==================== MAIN MAP PAGE ====================

