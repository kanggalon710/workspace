import { Search, Layers, Map as MapIcon } from "lucide-react";

interface MapUtilityButtonsProps {
  onSearchClick: () => void;
  onLayerClick: () => void;
  onMapTypeClick: () => void;
}

/**
 * Mobile-only map utility buttons (search / layer / map-type), docked top-right.
 * Desktop exposes the same actions through the MapToolbar, so this is `md:hidden`.
 * DRY: the three buttons share one markup template driven by a config list.
 */
export function MapUtilityButtons({ onSearchClick, onLayerClick, onMapTypeClick }: MapUtilityButtonsProps) {
  const buttons = [
    { key: "search", icon: Search, label: "Cari aset", onClick: onSearchClick },
    { key: "layer", icon: Layers, label: "Tampilkan layer", onClick: onLayerClick },
    { key: "maptype", icon: MapIcon, label: "Tipe peta", onClick: onMapTypeClick },
  ];

  return (
    <nav aria-label="Utilitas peta" className="fixed top-4 right-4 z-[60] flex items-center gap-2 md:hidden">
      {buttons.map(({ key, icon: Icon, label, onClick }) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          aria-label={label}
          title={label}
          data-mobile-btn={key}
          className="flex h-9 w-9 items-center justify-center rounded-full glass shadow-lg transition-transform active:scale-95"
        >
          <Icon className="h-4 w-4 text-foreground" />
        </button>
      ))}
    </nav>
  );
}
