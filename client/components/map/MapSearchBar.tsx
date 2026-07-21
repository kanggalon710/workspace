import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Search, X, Radio, Box, CircleDot, User, Landmark, Waves, MapPin, type LucideIcon } from "lucide-react";
import { ASSET_COLORS } from "@/lib/assetColors";
import { useMapCustomerSearch } from "@/hooks/useOdpDetail";

interface SearchResult {
  id: number;
  name: string;
  code: string;
  type: "pop" | "odc" | "odp" | "customer" | "pole" | "cable";
  lat?: number | null;
  lng?: number | null;
  /** Relasi pelanggan→ODP (untuk chip "ODP …" + zoom ke ODP). */
  odpId?: number | null;
}

interface MapSearchBarProps {
  visible: boolean;
  onClose: () => void;
  onResultClick: (result: SearchResult) => void;
  /** Zoom ke ODP + buka panel detail-nya (dari chip relasi di hasil pelanggan). */
  onOpenOdp?: (odpId: number) => void;
  data: {
    pops: any[];
    odcs: any[];
    odps: any[];
    customers: any[];
    poles: any[];
    cables: any[];
  } | null;
}

const TYPE_ICONS: Record<string, LucideIcon> = {
  pop: Radio,
  odc: Box,
  odp: CircleDot,
  customer: User,
  pole: Landmark,
  cable: Waves,
};

export function MapSearchBar({ visible, onClose, onResultClick, onOpenOdp, data }: MapSearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Server-backed customer search (pelanggan di luar viewport) — debounce 300ms
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query), 300);
    return () => clearTimeout(t);
  }, [query]);
  const { data: serverHits } = useMapCustomerSearch(visible ? debouncedQ : "");
  const odpById = useMemo(() => new Map<number, any>((data?.odps ?? []).map((o: any) => [o.id, o])), [data?.odps]);

  // Focus on show & keyboard shortcut "/"
  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        if (!visible) return;
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible]);

  // Search logic
  const doSearch = useCallback((q: string) => {
    if (!q.trim() || !data) { setResults([]); return; }
    const lower = q.toLowerCase();
    const found: SearchResult[] = [];

    const search = <T extends { id: number; name: string; code: string; lat?: number | null; lng?: number | null }>(
      items: T[],
      type: SearchResult["type"],
    ) => {
      for (const item of items) {
        if (found.length >= 20) break;
        if (
          item.name?.toLowerCase().includes(lower) ||
          item.code?.toLowerCase().includes(lower) ||
          (item as any).customerId?.toLowerCase?.().includes(lower)
        ) {
          found.push({ id: item.id, name: item.name, code: item.code ?? (item as any).customerId, type, lat: item.lat, lng: item.lng, odpId: (item as any).odpId ?? null });
        }
      }
    };

    search(data.pops, "pop");
    search(data.odcs, "odc");
    search(data.odps, "odp");
    search(data.customers, "customer");
    search(data.poles, "pole");
    search(data.cables, "cable");

    setResults(found);
    setSelectedIdx(-1);
  }, [data]);

  useEffect(() => {
    doSearch(query);
  }, [query, doSearch]);

  // Gabung hasil lokal + hasil server (pelanggan di luar viewport), dedupe by id.
  const merged = useMemo(() => {
    const localCustomerIds = new Set(results.filter((r) => r.type === "customer").map((r) => r.id));
    const extra: SearchResult[] = (serverHits?.customers ?? [])
      .filter((c) => !localCustomerIds.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, code: c.customerId, type: "customer" as const, lat: c.lat, lng: c.lng, odpId: c.odpId }));
    return [...results, ...extra].slice(0, 25);
  }, [results, serverHits]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setQuery("");
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, merged.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && selectedIdx >= 0 && merged[selectedIdx]) {
      onResultClick(merged[selectedIdx]);
      setQuery("");
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed top-14 left-4 z-[55] w-[calc(100vw-2rem)] md:absolute md:top-4 md:left-4 md:w-80 md:max-w-md md:z-[40]">
      <div className="relative">
        <div className="glass rounded-xl shadow-lg flex items-center px-3 gap-2">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Cari ODP, ODC, Pelanggan, Tiang..."
            className="flex-1 bg-transparent border-0 outline-none py-2.5 text-sm placeholder:text-muted-foreground/60"
          />
          {query && (
            <button onClick={() => { setQuery(""); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground ml-1">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results dropdown */}
        {merged.length > 0 && (
          <div className="map-search-dropdown">
            {merged.map((r, idx) => {
              const relOdp = r.type === "customer" && r.odpId != null ? odpById.get(r.odpId) : null;
              return (
                <button
                  key={`${r.type}-${r.id}`}
                  onClick={() => { onResultClick(r); setQuery(""); }}
                  className={`map-search-item w-full text-left ${idx === selectedIdx ? "bg-accent" : ""}`}
                >
                  {(() => { const Icon = TYPE_ICONS[r.type] || MapPin; return <Icon className="size-4 text-muted-foreground" />; })()}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-[10px] text-muted-foreground">{r.code} · {ASSET_COLORS[r.type]?.label || r.type}</p>
                  </div>
                  {/* Relasi pelanggan→ODP: chip zoom ke ODP + buka detail */}
                  {relOdp && onOpenOdp && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); onOpenOdp(r.odpId!); setQuery(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onOpenOdp(r.odpId!); setQuery(""); } }}
                      className="shrink-0 rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success hover:bg-success/20 cursor-pointer"
                      title="Zoom ke ODP & buka detail"
                    >
                      ODP {relOdp.code || relOdp.name}
                    </span>
                  )}
                  {!relOdp && r.lat && r.lng && (
                    <span className="text-[9px] text-muted-foreground font-mono shrink-0">
                      {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {query && merged.length === 0 && (
          <div className="map-search-dropdown py-6 text-center text-sm text-muted-foreground">
            Tidak ditemukan aset untuk "{query}"
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      <div className="flex items-center gap-2 mt-1.5 px-1">
        <kbd className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border font-mono">/</kbd>
        <span className="text-[9px] text-muted-foreground">fokus pencarian</span>
        <kbd className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border font-mono ml-2">Esc</kbd>
        <span className="text-[9px] text-muted-foreground">tutup</span>
      </div>
    </div>
  );
}
