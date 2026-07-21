import { Combobox } from "@/components/ui/combobox";

interface MapMitraSelectorProps {
  mitraOptions: Array<{ id: number; name: string }>;
  viewMitraId: number;
  ownMitraId: number;
  /** True when viewing another mitra's data (read-only). */
  viewingOther: boolean;
  /** A search / layer / map-type panel is open - hide on mobile so it can't overlap that panel. */
  panelOpen: boolean;
  onChange: (mitraId: number) => void;
}

/**
 * "Data mitra" switcher - JABNET owner only. Lets the system admin view another mitra's
 * network data (read-only). Positioned to never collide with the map's other top controls:
 *  - Mobile: second row, centered (row 1 holds the menu + utility buttons). Hidden while a
 *    search/layer/map-type panel is open, since those panels occupy the same row.
 *  - Desktop: top-center, first row - the MapToolbar is offset to the row below it (its
 *    `stacked` prop), so the two never overlap.
 */
export function MapMitraSelector({
  mitraOptions, viewMitraId, ownMitraId, viewingOther, panelOpen, onChange,
}: MapMitraSelectorProps) {
  return (
    <section
      aria-label="Pilih data mitra"
      className={`absolute left-1/2 top-16 -translate-x-1/2 md:top-3 z-[45] flex items-center gap-2 max-w-[calc(100vw-1rem)] rounded-lg bg-card/95 px-2 py-1.5 shadow-elev-md backdrop-blur ${panelOpen ? "max-md:hidden" : ""}`}
    >
      <span className="pl-1 text-[11px] font-semibold text-muted-foreground whitespace-nowrap">Data mitra:</span>
      <div className="w-36 sm:w-44">
        <Combobox
          options={mitraOptions.map((m) => ({
            value: String(m.id),
            label: m.id === ownMitraId ? `${m.name} (saya)` : m.name,
          }))}
          value={String(viewMitraId)}
          onChange={(v) => { if (v) onChange(Number(v)); }}
          searchPlaceholder="Cari mitra..."
        />
      </div>
      {viewingOther && (
        <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          Read-only
        </span>
      )}
    </section>
  );
}
