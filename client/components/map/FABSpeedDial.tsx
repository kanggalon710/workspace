import React, { useState } from "react";
import { Plus, X, Radio, Box, CircleDot, User, Landmark, Waves, type LucideIcon } from "lucide-react";
import { ASSET_COLORS, ASSET_MARKER_CONFIG } from "@/lib/assetColors";
import type { AssetType } from "@/lib/assetColors";

interface FABSpeedDialProps {
  onSelectMode: (mode: AssetType) => void;
  drawMode: AssetType | null;
  onCancel: () => void;
}

const dialItems: { key: Exclude<AssetType, "cable">; Icon: LucideIcon }[] = [
  { key: "pop", Icon: Radio },
  { key: "odc", Icon: Box },
  { key: "odp", Icon: CircleDot },
  { key: "customer", Icon: User },
  { key: "pole", Icon: Landmark },
];

export function FABSpeedDial({ onSelectMode, drawMode, onCancel }: FABSpeedDialProps) {
  const [expanded, setExpanded] = useState(false);

  const handleMainClick = () => {
    if (drawMode) {
      onCancel();
      setExpanded(false);
    } else {
      setExpanded(!expanded);
    }
  };

  const handleItemClick = (key: AssetType) => {
    onSelectMode(key);
    setExpanded(false);
  };

  return (
    <div className="absolute bottom-6 right-3 z-40 flex flex-col items-end gap-2 md:hidden">
      {/* Speed dial items */}
      {expanded && !drawMode && (
        <div className="flex flex-col-reverse gap-2 animate-fade-in mb-1 items-end">
          {/* Cable special button */}
          <div className="flex items-center gap-2">
            <span className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[10px] font-semibold px-2 py-1 rounded-md shadow-sm border dark:border-slate-700">
              Tarik Kabel
            </span>
            <button
              onClick={() => handleItemClick("cable")}
              className="w-8 h-8 rounded-full shadow-md flex items-center justify-center text-white transition-all active:scale-90"
              style={{ backgroundColor: ASSET_COLORS.cable.primary }}
            >
              <Waves className="w-3.5 h-3.5" />
            </button>
          </div>
          {dialItems.map((item, idx) => (
            <div key={item.key} className="flex items-center gap-2" style={{ animationDelay: `${idx * 30}ms` }}>
              <span className="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-[10px] font-semibold px-2 py-1 rounded-md shadow-sm border dark:border-slate-700">
                {ASSET_MARKER_CONFIG[item.key].label}
              </span>
              <button
                onClick={() => handleItemClick(item.key)}
                className="w-8 h-8 rounded-full shadow-md flex items-center justify-center text-white transition-all active:scale-90"
                style={{ backgroundColor: ASSET_COLORS[item.key].primary }}
                title={ASSET_MARKER_CONFIG[item.key].label}
              >
                <item.Icon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main FAB - smaller on mobile */}
      <button
        onClick={handleMainClick}
        className="w-10 h-10 rounded-full bg-primary text-white shadow-lg flex items-center justify-center transition-all duration-200 active:scale-90"
        style={drawMode ? { backgroundColor: ASSET_COLORS[drawMode]?.primary || "#EF4444" } : undefined}
      >
        {drawMode ? (
          <X className="h-4 w-4" />
        ) : expanded ? (
          <X className="h-4 w-4 transition-transform rotate-45" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
      </button>

      {/* Mode label */}
      {drawMode && (
        <div
          className="px-2 py-0.5 rounded-full text-white text-[9px] font-bold shadow-md animate-pop-in"
          style={{ backgroundColor: ASSET_COLORS[drawMode]?.primary || "#666" }}
        >
          {ASSET_MARKER_CONFIG[drawMode as keyof typeof ASSET_MARKER_CONFIG]?.label || "Kabel"}
        </div>
      )}
    </div>
  );
}
