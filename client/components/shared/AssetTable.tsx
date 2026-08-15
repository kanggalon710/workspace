import { useState, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Pencil, Trash2, Search, MapPin, LayoutGrid, LayoutList,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Download,
  Filter, CheckSquare, Square, X,
} from "lucide-react";
import { getStatusBadgeVariant } from "@/lib/utils";
import { toast } from "sonner";

export interface ColumnDef<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
}

interface AssetTableProps<T extends { id: number; status?: string | null; lat?: number | null; lng?: number | null }> {
  title: string;
  description: string;
  data: T[] | undefined;
  isLoading: boolean;
  columns: ColumnDef<T>[];
  renderForm: (
    item: T | null,
    onSubmit: (data: any) => void,
    isPending: boolean
  ) => React.ReactNode;
  onCreate: (data: any) => Promise<any>;
  onUpdate: (id: number, data: any) => Promise<any>;
  onDelete: (id: number) => Promise<any>;
  /** Render a card view for each item (if provided, enables table/card toggle) */
  renderCard?: (item: T, onEdit: () => void, onDelete: () => void) => React.ReactNode;
  /** Optional additional filter dropdowns */
  filters?: FilterConfig[];
  /** Column keys whose cells become clickable and open the edit modal (opt-in per page). */
  editOnClickKeys?: string[];
}

const PAGE_SIZES = [10, 25, 50, 100];

export function AssetTable<T extends { id: number; status?: string | null; lat?: number | null; lng?: number | null }>({
  title, description, data, isLoading, columns,
  renderForm, onCreate, onUpdate, onDelete, renderCard, filters, editOnClickKeys,
}: AssetTableProps<T>) {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<T | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const tableContainerRef = useRef<HTMLDivElement>(null);

  // -- Filtered data --
  const filtered = useMemo(() => {
    if (!data) return [];
    let result = data.filter((item) => {
      const str = JSON.stringify(item).toLowerCase();
      return str.includes(search.toLowerCase());
    });

    // Apply dropdown filters
    Object.entries(activeFilters).forEach(([key, value]) => {
      if (value && value !== "__all__") {
        result = result.filter((item) => String((item as any)[key] ?? "").toLowerCase() === value.toLowerCase());
      }
    });

    // Sort
    if (sortKey) {
      result = [...result].sort((a, b) => {
        const av = (a as any)[sortKey] ?? "";
        const bv = (b as any)[sortKey] ?? "";
        if (typeof av === "number" && typeof bv === "number") {
          return sortDir === "asc" ? av - bv : bv - av;
        }
        const sa = String(av).toLowerCase();
        const sb = String(bv).toLowerCase();
        return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
      });
    }

    return result;
  }, [data, search, sortKey, sortDir, activeFilters]);

  // -- Pagination --
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // Reset page on search change
  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleCreate = async (formData: any) => {
    setIsPending(true);
    try {
      await onCreate(formData);
      toast.success(`${title} berhasil ditambahkan`);
      setFormOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Gagal menambahkan data");
    } finally {
      setIsPending(false);
    }
  };

  const handleUpdate = async (formData: any) => {
    if (!editItem) return;
    setIsPending(true);
    try {
      await onUpdate(editItem.id, formData);
      toast.success(`${title} berhasil diupdate`);
      setEditItem(null);
    } catch (e: any) {
      toast.error(e.message || "Gagal mengupdate data");
    } finally {
      setIsPending(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    try {
      await onDelete(deleteId);
      toast.success(`${title} berhasil dihapus`);
    } catch (e: any) {
      toast.error(e.message || "Gagal menghapus data");
    } finally {
      setDeleteId(null);
    }
  };

  const viewOnMap = (item: T) => {
    if (item.lat && item.lng) {
      const typeMap: Record<string, string> = { "POP": "pop", "ODC": "odc", "ODP": "odp", "Pelanggan": "customer", "Tiang": "pole" };
      const type = typeMap[title] || "odp";
      const code = (item as any).code || (item as any).customerId || "";
      setLocation(`/map?lat=${item.lat}&lng=${item.lng}&z=20&type=${type}&code=${code}`);
    } else {
      toast.info("Aset ini belum memiliki koordinat di peta");
    }
  };

  // -- Export CSV --
  const exportCSV = () => {
    if (!filtered.length) return;
    const headers = columns.map(c => c.label);
    const rows = filtered.map(item => columns.map(col => String((item as any)[col.key] ?? "")));
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s/g, "_")}_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Data berhasil diexport ke CSV");
  };

  // -- Bulk Actions --
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedData.map(i => i.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(`Hapus ${selectedIds.size} item yang dipilih? Tindakan ini tidak bisa dibatalkan.`);
    if (!confirmed) return;
    let success = 0;
    for (const id of selectedIds) {
      try { await onDelete(id); success++; } catch {}
    }
    setSelectedIds(new Set());
    toast.success(`${success} item berhasil dihapus`);
  };

  const exportSelectedCSV = () => {
    const selected = filtered.filter(item => selectedIds.has(item.id));
    if (!selected.length) return;
    const headers = columns.map(c => c.label);
    const rows = selected.map(item => columns.map(col => String((item as any)[col.key] ?? "")));
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.toLowerCase().replace(/\s/g, "_")}_selected_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${selected.length} item diexport ke CSV`);
  };

  const hasActiveFilters = Object.values(activeFilters).some(v => v && v !== "__all__");

  // -- Virtualization --
  const rowVirtualizer = useVirtualizer({
    count: paginatedData.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 53,
    overscan: 5,
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground text-sm mt-1">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} className="h-8 text-xs gap-1">
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button onClick={() => setFormOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            Tambah {title}
          </Button>
        </div>
      </div>

      {/* Search + Filters + View Toggle */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          {renderCard && (
            <div className="flex items-center border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("table")}
                className={`p-2 transition-colors ${viewMode === "table" ? "bg-primary text-white" : "hover:bg-accent"}`}
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("card")}
                className={`p-2 transition-colors ${viewMode === "card" ? "bg-primary text-white" : "hover:bg-accent"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Multi-Filter Row */}
        {filters && filters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {filters.map(f => (
              <select
                key={f.key}
                value={activeFilters[f.key] || "__all__"}
                onChange={(e) => {
                  setActiveFilters(prev => ({ ...prev, [f.key]: e.target.value }));
                  setCurrentPage(1);
                }}
                className="bg-transparent border rounded-md px-2 py-1 text-xs h-7"
              >
                <option value="__all__">{f.label}</option>
                {f.options.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            ))}
            {hasActiveFilters && (
              <button
                onClick={() => { setActiveFilters({}); setCurrentPage(1); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* -- Bulk Action Bar -- */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <span className="text-sm font-medium">{selectedIds.size} item dipilih</span>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={exportSelectedCSV}>
              <Download className="h-3 w-3" /> Export
            </Button>
            <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={handleBulkDelete}>
              <Trash2 className="h-3 w-3" /> Hapus
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
              Batal
            </Button>
          </div>
        </div>
      )}

      {/* -- CARD VIEW -- */}
      {viewMode === "card" && renderCard ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-4 animate-pulse">
                <div className="h-20 bg-muted rounded" />
              </div>
            ))
          ) : paginatedData.length === 0 ? (
            <div className="col-span-full py-12 text-center text-muted-foreground">
              <p className="text-lg font-medium mb-1">Tidak ada data ditemukan</p>
              <p className="text-sm">Coba ubah kata pencarian atau tambah data baru</p>
            </div>
          ) : (
            paginatedData.map((item) => (
              <div key={item.id}>
                {renderCard(item, () => setEditItem(item), () => setDeleteId(item.id))}
              </div>
            ))
          )}
        </div>
      ) : (
        /* -- TABLE VIEW -- */
        <div ref={tableContainerRef} className="rounded-lg border overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar relative">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background z-20 shadow-sm">
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-3 w-8">
                  <button onClick={toggleSelectAll} className="flex items-center justify-center">
                    {selectedIds.size === paginatedData.length && paginatedData.length > 0
                      ? <CheckSquare className="h-4 w-4 text-primary" />
                      : <Square className="h-4 w-4 text-muted-foreground" />}
                  </button>
                </th>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap ${col.sortable !== false ? "cursor-pointer select-none hover:text-foreground transition-colors" : ""}`}
                    onClick={() => col.sortable !== false && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.sortable !== false && sortKey === col.key && (
                        sortDir === "asc"
                          ? <ChevronUp className="h-3 w-3" />
                          : <ChevronDown className="h-3 w-3" />
                      )}
                    </div>
                  </th>
                ))}
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    <td className="px-3 py-3"><div className="h-4 skeleton w-4" /></td>
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3">
                        <div className="h-4 skeleton w-24" />
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="h-4 skeleton w-16 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                        <Search className="h-7 w-7 text-muted-foreground/50" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-foreground">Tidak ada data ditemukan</p>
                        <p className="text-sm text-muted-foreground mt-1">Coba ubah kata pencarian atau filter, atau tambah data baru.</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setFormOpen(true)} className="mt-2">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Tambah {title}
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
                <>
                  {rowVirtualizer.getVirtualItems().length > 0 && (
                    <tr>
                      <td colSpan={columns.length + 2} style={{ height: `${rowVirtualizer.getVirtualItems()[0].start}px`, padding: 0, border: 0 }} />
                    </tr>
                  )}
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const item = paginatedData[virtualRow.index];
                    return (
                      <tr
                        key={item.id}
                        ref={rowVirtualizer.measureElement}
                        data-index={virtualRow.index}
                        className={`border-b transition-colors ${selectedIds.has(item.id) ? 'bg-primary/5' : 'hover:bg-muted/30'}`}
                      >
                    <td className="px-3 py-3 w-8 text-center shrink-0">
                      <button onClick={() => toggleSelect(item.id)} className="flex items-center justify-center w-full h-full">
                        {selectedIds.has(item.id)
                          ? <CheckSquare className="h-4 w-4 text-primary" />
                          : <Square className="h-4 w-4 text-muted-foreground hover:text-foreground" />}
                      </button>
                    </td>
                    {columns.map((col) => {
                      const content = col.render ? col.render(item) : (
                        col.key === "status" ? (
                          <Badge variant={getStatusBadgeVariant((item as any)[col.key] || "active")}>
                            {(item as any)[col.key] || "active"}
                          </Badge>
                        ) : (
                          String((item as any)[col.key] ?? "-")
                        )
                      );
                      const clickable = editOnClickKeys?.includes(col.key);
                      return (
                        <td key={col.key} className="px-4 py-3 whitespace-nowrap overflow-hidden text-ellipsis align-middle">
                          {clickable ? (
                            <button
                              type="button"
                              onClick={() => setEditItem(item)}
                              title={`Edit ${title}`}
                              className="text-left font-medium text-primary hover:underline focus-visible:underline"
                            >
                              {content}
                            </button>
                          ) : content}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right whitespace-nowrap align-middle">
                      <div className="flex items-center justify-end gap-1">
                        {/* View on Map */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => viewOnMap(item)}
                          title="Lihat di Peta"
                          className="text-primary hover:text-primary"
                        >
                          <MapPin className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit aset"
                          onClick={() => setEditItem(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Hapus aset"
                          onClick={() => setDeleteId(item.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                    );
                  })}
                  {rowVirtualizer.getVirtualItems().length > 0 && (
                    <tr>
                      <td colSpan={columns.length + 2} style={{ height: `${rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end}px`, padding: 0, border: 0 }} />
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* -- Pagination -- */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Total: {filtered.length} data</span>
          <span>|</span>
          <span>Per halaman:</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
            className="bg-transparent border rounded px-1.5 py-0.5 text-xs"
          >
            {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-xs px-2 min-w-[80px] text-center">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tambah {title}</DialogTitle>
            <DialogDescription>Isi form di bawah untuk menambah data baru</DialogDescription>
          </DialogHeader>
          {renderForm(null, handleCreate, isPending)}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {title}</DialogTitle>
            <DialogDescription>Ubah data {title.toLowerCase()}</DialogDescription>
          </DialogHeader>
          {renderForm(editItem, handleUpdate, isPending)}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus {title}?</AlertDialogTitle>
            <AlertDialogDescription>
              Data yang dihapus tidak dapat dikembalikan. Apakah Anda yakin?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
