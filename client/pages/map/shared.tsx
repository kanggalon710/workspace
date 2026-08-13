

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

export const GARUT_CENTER = { lat: -7.22, lng: 107.90 };
export const DEFAULT_ZOOM = 13;

// ==================== GEOMETRY UTILITIES ====================

export const SNAP_THRESHOLD_METERS = 60;

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const sinA = Math.sin(dLat / 2), sinB = Math.sin(dLng / 2);
  const aa = sinA * sinA + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * sinB * sinB;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

export function nearestOnSegment(
  P: { lat: number; lng: number },
  A: { lat: number; lng: number },
  B: { lat: number; lng: number },
): { point: { lat: number; lng: number }; t: number } {
  const cosLat = Math.cos(A.lat * Math.PI / 180);
  const px = (P.lng - A.lng) * cosLat, py = P.lat - A.lat;
  const bx = (B.lng - A.lng) * cosLat, by = B.lat - A.lat;
  const lenSq = bx * bx + by * by;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / lenSq));
  return { point: { lat: A.lat + t * (B.lat - A.lat), lng: A.lng + t * (B.lng - A.lng) }, t };
}

export interface SnapResult {
  point: { lat: number; lng: number };
  cableId: number;
  cableName: string;
  cableType: string;
  distMeters: number;
}

export function findSnapPoint(
  clicked: { lat: number; lng: number },
  cables: Array<{ id: number; name: string; cableType: string | null; pathCoordinates: string | null }>,
  parseFn: (s: string | null) => { lat: number; lng: number }[],
  threshold: number,
): SnapResult | null {
  let best: SnapResult | null = null;
  for (const cable of cables) {
    const path = parseFn(cable.pathCoordinates);
    if (path.length < 2) continue;
    for (let i = 0; i < path.length - 1; i++) {
      const { point } = nearestOnSegment(clicked, path[i], path[i + 1]);
      const dist = haversineMeters(clicked, point);
      if (dist < threshold && (!best || dist < best.distMeters)) {
        best = { point, cableId: cable.id, cableName: cable.name, cableType: cable.cableType || "feeder", distMeters: dist };
      }
    }
  }
  return best;
}

// ==================== ASSET QUICK FORM ====================

export interface QuickFormProps {
  type: Exclude<AssetType, "cable">;
  lat: number;
  lng: number;
  district?: string;
  village?: string;
  address?: string;
  isEdit?: boolean;
  initialData?: any;
  onSubmit: (data: any, isEdit?: boolean, id?: number) => void;
  onCancel: () => void;
  isPending: boolean;
  pops?: any[];
  odcs?: any[];
  odps?: any[];
  hideOdpDropdown?: boolean;
}

