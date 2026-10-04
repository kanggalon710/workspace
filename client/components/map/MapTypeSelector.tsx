import React from "react";
import { Map as MapIcon, Satellite, Mountain, Layers, X } from "lucide-react";

const MAP_TYPES = [
  { key: "roadmap", label: "Peta", icon: MapIcon },
  { key: "satellite", label: "Satelit", icon: Satellite },
  { key: "hybrid", label: "Hybrid", icon: Layers },
  { key: "terrain", label: "Terrain", icon: Mountain },
] as const;

interface MapTypeSelectorProps {
  visible: boolean;
  onClose: () => void;
  mapType: string;
  onSelect: (type: string) => void;
}

export function MapTypeSelector({ visible, onClose, mapType, onSelect }: MapTypeSelectorProps) {
  if (!visible) return null;

  return (
    <div
      className="fixed top-14 right-4 z-[55] md:absolute md:top-auto md:bottom-16 md:right-16 md:z-50 glass rounded-xl shadow-xl animate-pop-in"
    >
      <div className="p-3 space-y-1" style={{ minWidth: 180 }}>
        <div className="flex items-center justify-between px-1 mb-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Tipe Peta
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pilihan tipe peta"
            className="md:hidden inline-flex items-center justify-center w-11 h-11 -m-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {MAP_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              onSelect(t.key);
              onClose();
            }}
            aria-pressed={mapType === t.key}
            className={`flex items-center gap-2.5 w-full px-2 py-1.5 min-h-11 md:min-h-0 rounded-lg text-xs transition-all hover:bg-accent ${
              mapType === t.key ? "bg-primary/10 font-semibold" : ""
            }`}
          >
            <t.icon
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
              style={{ color: mapType === t.key ? "hsl(var(--primary))" : undefined }}
            />
            <span className="flex-1 text-left">{t.label}</span>
            {mapType === t.key && (
              <span className="text-[9px] text-primary font-bold">ON</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
