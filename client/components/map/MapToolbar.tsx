import React, { useState, useRef, useEffect } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Search, Radio, Box, CircleDot, Users, Landmark, Cable,
  MapPin, Layers, Map as MapIcon, ChevronUp, ChevronDown,
} from "lucide-react";
import { ASSET_COLORS } from "@/lib/assetColors";
import type { AssetType } from "@/lib/assetColors";

interface ToolbarProps {
  drawMode: AssetType | null;
  snapEnabled: boolean;
  onDrawModeChange: (mode: AssetType | null) => void;
  onSnapToggle: () => void;
  onSearchClick: () => void;
  onLayerClick: () => void;
  onMapTypeClick: () => void;
  cablePointsCount: number;
  onFinishCable: () => void;
  onUndoCable: () => void;
  onCancelDraw: () => void;
  /** Drop the toolbar to the row below when a control sits above it (the JABNET mitra selector). */
  stacked?: boolean;
}

const toolbarItems: {
  key: AssetType | "search" | "snap" | "layer" | "mapType";
  icon: any;
  label: string;
  shortLabel?: string;
  color?: string;
  separator?: boolean;
}[] = [
  { key: "search", icon: Search, label: "Cari Aset", shortLabel: "Cari" },
  { key: "pop", icon: Radio, label: "Tambah POP", shortLabel: "POP", color: ASSET_COLORS.pop.primary },
  { key: "odc", icon: Box, label: "Tambah ODC", shortLabel: "ODC", color: ASSET_COLORS.odc.primary },
  { key: "odp", icon: CircleDot, label: "Tambah ODP", shortLabel: "ODP", color: ASSET_COLORS.odp.primary },
  { key: "customer", icon: Users, label: "Tambah Pelanggan", shortLabel: "Pelanggan", color: ASSET_COLORS.customer.primary },
  { key: "pole", icon: Landmark, label: "Tambah Tiang", shortLabel: "Tiang", color: ASSET_COLORS.pole.primary },
  { key: "cable", icon: Cable, label: "Tarik Kabel", shortLabel: "Kabel", color: ASSET_COLORS.cable.primary },
  { key: "snap", icon: MapPin, label: "Snap ke Kabel", shortLabel: "Snap" },
  { key: "layer", icon: Layers, label: "Tampilkan Layer", shortLabel: "Layer", separator: true },
  { key: "mapType", icon: MapIcon, label: "Tipe Peta", shortLabel: "Peta" },
];

export function MapToolbar({
  drawMode, snapEnabled,
  onDrawModeChange, onSnapToggle,
  onSearchClick, onLayerClick, onMapTypeClick,
  cablePointsCount, onFinishCable, onUndoCable, onCancelDraw,
  stacked = false,
}: ToolbarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const handleClick = (key: string) => {
    if (key === "search") { onSearchClick(); return; }
    if (key === "layer") { onLayerClick(); return; }
    if (key === "mapType") { onMapTypeClick(); return; }
    if (key === "snap") { onSnapToggle(); return; }

    // Asset draw modes
    const assetKey = key as AssetType;
    if (drawMode === assetKey) {
      onCancelDraw();
    } else {
      onCancelDraw();
      onDrawModeChange(assetKey);
    }
  };

  const isActive = (key: string) => {
    if (key === "snap") return snapEnabled;
    return drawMode === key;
  };

  return (
    <div className={`absolute ${stacked ? "top-16" : "top-4"} left-1/2 -translate-x-1/2 z-10 hidden md:block`}>
      <TooltipProvider delayDuration={200}>
        {/* Collapse/Expand toggle */}
        <div className="flex flex-col items-center gap-1">
          <div
            className={`glass rounded-2xl shadow-lg transition-all duration-200 overflow-x-auto max-w-[90vw] md:max-w-max ${
              collapsed ? "max-h-0 opacity-0 py-0" : "max-h-24 opacity-100 py-1.5 px-2"
            }`}
          >
            <div className="flex items-center gap-0.5">
              {toolbarItems.map((item, idx) => (
                <React.Fragment key={item.key}>
                  {item.separator && (
                    <div className="w-px h-6 bg-border/50 mx-1" />
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => handleClick(item.key)}
                        className={`map-toolbar-btn ${isActive(item.key) ? "active" : ""}`}
                        style={isActive(item.key) && item.color ? { backgroundColor: item.color } : undefined}
                        aria-label={item.label}
                        title={item.label}
                      >
                        <item.icon
                          className="h-5 w-5"
                          style={
                            !isActive(item.key) && item.color
                              ? { color: item.color }
                              : isActive(item.key)
                              ? { color: "white" }
                              : undefined
                          }
                        />
                        {item.shortLabel && (
                          <span className="text-[9px] font-medium leading-none hidden md:block">
                            {item.shortLabel}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {item.label}
                      {item.key === "snap" && snapEnabled && " (ON)"}
                    </TooltipContent>
                  </Tooltip>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Toggle button */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="glass rounded-full w-7 h-7 flex items-center justify-center shadow-md hover:shadow-lg transition-all"
          >
            {collapsed ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        </div>
      </TooltipProvider>

      {/* Cable drawing controls */}
      {drawMode === "cable" && cablePointsCount > 0 && (
        <div className="glass rounded-xl shadow-lg mt-2 p-2 flex items-center gap-2 animate-pop-in">
          <span className="text-xs text-muted-foreground font-medium px-2">
            {cablePointsCount} titik
          </span>
          <button
            onClick={onFinishCable}
            className="px-3 py-1.5 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600 transition-colors"
          >
            ✓ Selesai
          </button>
          <button
            onClick={onUndoCable}
            className="px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-accent transition-colors"
          >
            ↩ Undo
          </button>
          <button
            onClick={onCancelDraw}
            className="px-3 py-1.5 rounded-lg text-destructive text-xs font-medium hover:bg-destructive/10 transition-colors"
          >
            ✕ Batal
          </button>
        </div>
      )}
    </div>
  );
}
