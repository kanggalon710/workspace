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
      className="absolute bottom-16 right-16 z-50 glass rounded-xl shadow-xl animate-pop-in max-md:fixed max-md:bottom-auto max-md:top-14 max-md:right-4 max-md:left-auto max-md:z-[55]"
    >
      <div className="p-3 space-y-1" style={{ minWidth: 180 }}>
        <div className="flex items-center justify-between px-1 mb-2">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Tipe Peta
          </p>
          <button onClick={onClose} className="md:hidden text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {MAP_TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              onSelect(t.key);
              onClose();
            }}
            className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-xs transition-all hover:bg-accent ${
              mapType === t.key ? "bg-primary/10 font-semibold" : ""
            }`}
          >
            <t.icon
              className="h-4 w-4 shrink-0"
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
