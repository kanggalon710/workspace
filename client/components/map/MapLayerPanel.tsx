import React from "react";
import { X } from "lucide-react";
import { ASSET_COLORS } from "@/lib/assetColors";

interface MapLayerPanelProps {
  visible: boolean;
  onClose: () => void;
  layers: Record<string, boolean>;
  showLabels: boolean;
  showHierarchyLines: boolean;
  /** Default detail saat klik ODP: true = pelanggan + ACS, false = info ODP saja (lebih cepat). */
  odpFullDetail: boolean;
  onToggleLayer: (key: string) => void;
  onToggleLabels: () => void;
  onToggleHierarchy: () => void;
  onToggleOdpDetail: () => void;
}

const layerItems = [
  { key: "pop", label: "POP", color: ASSET_COLORS.pop.primary },
  { key: "odc", label: "ODC", color: ASSET_COLORS.odc.primary },
  { key: "odp", label: "ODP", color: ASSET_COLORS.odp.primary },
  { key: "customer", label: "Pelanggan", color: ASSET_COLORS.customer.primary },
  { key: "pole", label: "Tiang", color: ASSET_COLORS.pole.primary },
  { key: "cable", label: "Kabel", color: ASSET_COLORS.cable.primary },
];

/** Baris toggle checkbox (DRY - dipakai Label Nama, Garis Hirarki, Detail ODP). */
function CheckRow({ checked, label, hint, onToggle }: { checked: boolean; label: string; hint?: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className="flex items-start gap-2.5 w-full px-2 py-1.5 rounded-lg text-xs transition-all hover:bg-accent text-left"
    >
      <div className={`w-3 h-3 mt-0.5 rounded-sm border-2 shrink-0 flex items-center justify-center transition-colors ${
        checked ? "bg-primary border-primary" : "border-muted-foreground"
      }`}>
        {checked && <div className="w-1.5 h-1 bg-white rounded-sm" />}
      </div>
      <span className="flex-1">
        <span className={checked ? "" : "text-muted-foreground"}>{label}</span>
        {hint && <span className="block text-[9px] text-muted-foreground/70 leading-tight mt-0.5">{hint}</span>}
      </span>
    </button>
  );
}

export function MapLayerPanel({
  visible, onClose, layers, showLabels, showHierarchyLines, odpFullDetail,
  onToggleLayer, onToggleLabels, onToggleHierarchy, onToggleOdpDetail,
}: MapLayerPanelProps) {
  if (!visible) return null;

  return (
    <div
      className="absolute bottom-16 right-4 z-50 glass rounded-xl shadow-xl animate-pop-in max-md:fixed max-md:bottom-auto max-md:top-14 max-md:right-4 max-md:z-[55]"
      style={{ minWidth: 180 }}
    >
      <div className="p-3 space-y-1">
        <div className="flex items-center justify-between px-1 mb-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Layer Aset
          </p>
          <button onClick={onClose} className="md:hidden text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {layerItems.map((item) => (
          <button
            key={item.key}
            onClick={() => onToggleLayer(item.key)}
            className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-xs transition-all hover:bg-accent"
          >
            <div
              className="w-3 h-3 rounded-full shrink-0 transition-opacity"
              style={{ backgroundColor: item.color, opacity: layers[item.key] ? 1 : 0.25 }}
            />
            <span className={`flex-1 text-left ${layers[item.key] ? "" : "text-muted-foreground line-through opacity-50"}`}>
              {item.label}
            </span>
            {layers[item.key] && (
              <span className="text-[9px] text-green-500 font-bold">ON</span>
            )}
          </button>
        ))}

        <div className="border-t border-border/50 my-2" />

        <CheckRow checked={showLabels} label="Label Nama" onToggle={onToggleLabels} />
        <CheckRow checked={showHierarchyLines} label="Garis Hirarki" onToggle={onToggleHierarchy} />
        <CheckRow
          checked={odpFullDetail}
          label="Detail ODP lengkap"
          hint={odpFullDetail ? "Klik ODP: muat pelanggan + ACS" : "Klik ODP: info ringkas (lebih cepat)"}
          onToggle={onToggleOdpDetail}
        />
      </div>
    </div>
  );
}
