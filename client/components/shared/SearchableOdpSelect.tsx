import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

/**
 * SearchableOdpSelect - dropdown ODP dengan search/find.
 *
 * Dipakai di semua tempat yang butuh pilih ODP (customer edit, map edit,
 * customer filter, add form, dsb) biar tim tidak perlu scroll panjang.
 *
 * Fitur:
 * - Search input auto-focus saat buka
 * - Multi-token filter ("cah 03" → match "ODP-CAH-03")
 * - Keyboard: ↑↓ Enter Esc
 * - Click outside = tutup
 * - "(tidak ada)" option untuk null/clear
 */
export function SearchableOdpSelect({
  value,
  onChange,
  odps,
  placeholder = "- Pilih ODP -",
  nullLabel = "(tidak ada)",
  allowNull = true,
  disabled = false,
  className = "",
}: {
  value: number | null;
  onChange: (id: number | null) => void;
  odps: Array<{ id: number; name: string; code?: string | null }>;
  placeholder?: string;
  nullLabel?: string;
  allowNull?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => (value != null ? odps.find((o) => o.id === value) : null),
    [value, odps],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return odps;
    const q = query.toLowerCase().trim();
    const tokens = q.split(/\s+/).filter(Boolean);
    return odps.filter((o) => {
      const hay = `${o.name ?? ""} ${o.code ?? ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [query, odps]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setHighlightIdx(0);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlightIdx}"]`);
    (el as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open]);

  useEffect(() => { setHighlightIdx(0); }, [query]);

  const commit = (id: number | null) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const nullItemOffset = allowNull ? 1 : 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIdx((i) => Math.min(i + 1, filtered.length)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (allowNull && highlightIdx === 0) commit(null);
      else {
        const item = filtered[highlightIdx - nullItemOffset];
        if (item) commit(item.id);
      }
    } else if (e.key === "Escape") { e.preventDefault(); setOpen(false); setQuery(""); }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={selected ? "truncate" : "text-muted-foreground"}>
          {selected ? `${selected.name}${selected.code ? ` (${selected.code})` : ""}` : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover text-popover-foreground shadow-md">
          <div className="flex items-center border-b px-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Cari ODP - ketik nama atau kode..."
              className="flex h-9 w-full rounded-md bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setQuery(""); inputRef.current?.focus(); }}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Hapus pencarian"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div ref={listRef} className="max-h-[280px] overflow-y-auto p-1">
            {allowNull && (
              <div
                data-idx={0}
                onClick={() => commit(null)}
                onMouseEnter={() => setHighlightIdx(0)}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer ${highlightIdx === 0 ? "bg-accent text-accent-foreground" : ""}`}
              >
                <div className="w-4 flex justify-center">{value === null && <Check className="h-3.5 w-3.5" />}</div>
                <span className="text-muted-foreground italic">{nullLabel}</span>
              </div>
            )}
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                Tidak ada ODP yang match "<span className="font-mono">{query}</span>"
              </div>
            ) : (
              filtered.map((o, i) => {
                const idx = i + nullItemOffset;
                const active = highlightIdx === idx;
                const checked = value === o.id;
                return (
                  <div
                    key={o.id}
                    data-idx={idx}
                    onClick={() => commit(o.id)}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer ${active ? "bg-accent text-accent-foreground" : ""}`}
                  >
                    <div className="w-4 flex justify-center">{checked && <Check className="h-3.5 w-3.5" />}</div>
                    <span className="flex-1 truncate">{o.name}</span>
                    {o.code && <span className="text-[10px] text-muted-foreground font-mono shrink-0">{o.code}</span>}
                  </div>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t px-2 py-1 text-[10px] text-muted-foreground">
            <span>{filtered.length} dari {odps.length} ODP</span>
            <span className="font-mono">↑↓ Enter • Esc tutup</span>
          </div>
        </div>
      )}
    </div>
  );
}
