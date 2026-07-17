// ==================== CENTRALIZED ASSET COLORS ====================
// Single source of truth for asset type colors used across the entire application.

import {
  Radio, Box, CircleDot, Users, Landmark, Cable,
} from "lucide-react";

export type AssetType = "pop" | "odc" | "odp" | "customer" | "pole" | "cable";

export const ASSET_COLORS = {
  pop: { primary: "#EF4444", stroke: "#B91C1C", bg: "bg-red-500/10", text: "text-red-500", label: "POP" },
  odc: { primary: "#3B82F6", stroke: "#1D4ED8", bg: "bg-blue-500/10", text: "text-blue-500", label: "ODC" },
  odp: { primary: "#22C55E", stroke: "#15803D", bg: "bg-green-500/10", text: "text-green-500", label: "ODP" },
  customer: { primary: "#A855F7", stroke: "#7E22CE", bg: "bg-purple-500/10", text: "text-purple-500", label: "Pelanggan (Billing)" },
  customerStatic: { primary: "#F59E0B", stroke: "#B45309", bg: "bg-amber-500/10", text: "text-amber-500", label: "Pelanggan (Verified)" },
  pole: { primary: "#6B7280", stroke: "#374151", bg: "bg-gray-500/10", text: "text-gray-500", label: "Tiang" },
  cable: { primary: "#F97316", stroke: "#EA580C", bg: "bg-orange-500/10", text: "text-orange-500", label: "Kabel" },
} as const;

// Map marker config (scale = pixel radius for Google Maps Symbol)
export const ASSET_MARKER_CONFIG: Record<Exclude<AssetType, "cable"> | "customerStatic", {
  color: string; stroke: string; scale: number; mobileScale: number; label: string; icon: any;
}> = {
  pop:      { color: ASSET_COLORS.pop.primary,      stroke: ASSET_COLORS.pop.stroke,      scale: 10, mobileScale: 14, label: "POP",       icon: Radio },
  odc:      { color: ASSET_COLORS.odc.primary,      stroke: ASSET_COLORS.odc.stroke,      scale: 8,  mobileScale: 12, label: "ODC",       icon: Box },
  odp:      { color: ASSET_COLORS.odp.primary,      stroke: ASSET_COLORS.odp.stroke,      scale: 6,  mobileScale: 10, label: "ODP",       icon: CircleDot },
  customer:       { color: ASSET_COLORS.customer.primary,       stroke: ASSET_COLORS.customer.stroke,       scale: 5,  mobileScale: 9,  label: "Pelanggan", icon: Users },
  customerStatic: { color: ASSET_COLORS.customerStatic.primary, stroke: ASSET_COLORS.customerStatic.stroke, scale: 6,  mobileScale: 10, label: "Pelanggan (Verified)", icon: Users },
  pole:     { color: ASSET_COLORS.pole.primary,      stroke: ASSET_COLORS.pole.stroke,      scale: 5,  mobileScale: 9,  label: "Tiang",     icon: Landmark },
};

export const CABLE_COLORS: Record<string, string> = {
  feeder: "#EF4444",
  distribution: "#3B82F6",
  drop: "#22C55E",
};

// Google Maps dark mode style
export const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
  { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
  { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
];

// ODP port utilization color scale
// 0% = red (kosong), lalu naik ke orange → amber → hijau → biru (penuh)
export function odpUsageColor(pct: number): { color: string; stroke: string; label: string } {
  if (pct <= 0)        return { color: "#EF4444", stroke: "#B91C1C", label: "Kosong" };
  if (pct < 34)        return { color: "#F97316", stroke: "#C2410C", label: "Sedikit" };
  if (pct < 67)        return { color: "#F59E0B", stroke: "#B45309", label: "Setengah" };
  if (pct < 100)       return { color: "#22C55E", stroke: "#15803D", label: "Hampir Penuh" };
  return               { color: "#3B82F6", stroke: "#1D4ED8", label: "Penuh" };
}

// Helper: create circle icon for Google Maps Marker
export function dotIcon(color: string, stroke: string, scale: number): google.maps.Symbol {
  return {
    path: 0 as any, // google.maps.SymbolPath.CIRCLE = 0
    scale,
    fillColor: color,
    fillOpacity: 0.95,
    strokeColor: stroke,
    strokeWeight: 1.5,
  };
}
