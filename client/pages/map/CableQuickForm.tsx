import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cable, X, Check } from "lucide-react";

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

export function CableQuickForm({ points, onSubmit, onCancel, isPending }: {
  points: [number, number][];
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [formData, setFormData] = useState<Record<string, any>>({ status: "active", cableType: "feeder", totalCore: 12, totalTube: 1 });
  const set = (key: string, value: any) => setFormData((p) => ({ ...p, [key]: value }));

  const calcLength = () => {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      const [lat1, lng1] = points[i - 1];
      const [lat2, lng2] = points[i];
      total += haversineMeters({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
    }
    return Math.round(total);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ ...formData, pathCoordinates: JSON.stringify(points), lengthMeters: calcLength() });
  };

  return (
    <Card className="w-80 shadow-xl border-2 border-orange-500 animate-pop-in">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Cable className="h-4 w-4 text-orange-500" />
          Simpan Kabel
        </CardTitle>
        <p className="text-xs text-muted-foreground">{points.length} titik | ~{calcLength()}m</p>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nama</Label>
              <Input className="h-7 text-xs" required placeholder="Kabel feeder..." onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Kode</Label>
              <Input className="h-7 text-xs" required placeholder="KBL-001" onChange={(e) => set("code", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Tipe</Label>
              <select className="flex h-7 w-full rounded border border-input bg-transparent px-2 text-xs" defaultValue="feeder" onChange={(e) => set("cableType", e.target.value)}>
                <option value="feeder">Feeder</option>
                <option value="distribution">Distribusi</option>
                <option value="drop">Drop</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Core</Label>
              <Input className="h-7 text-xs" type="number" defaultValue={12} onChange={(e) => set("totalCore", Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Tube</Label>
              <Input className="h-7 text-xs" type="number" defaultValue={1} onChange={(e) => set("totalTube", Number(e.target.value))} />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" className="flex-1 h-7 text-xs" disabled={isPending}>
              <Check className="h-3 w-3 mr-1" />
              {isPending ? "..." : "Simpan Kabel"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ==================== CABLE DETAIL PANEL ====================

