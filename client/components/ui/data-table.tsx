import { useState, useMemo, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type RowSelectionState,
} from "@tanstack/react-table";
import {
  ChevronDown, ChevronUp, ChevronsUpDown,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Search, Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonTable } from "@/components/ui/skeleton";

export type { ColumnDef };

interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  /** Global search enabled. Default: true. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Page size options. Default: [10, 20, 50, 100]. */
  pageSizeOptions?: number[];
  /** Initial page size. Default: 20. */
  initialPageSize?: number;
  /** Loading state. */
  loading?: boolean;
  /** Extra content in the toolbar (filters, actions). */
  toolbarActions?: ReactNode;
  /** Enable row selection (with checkbox column). */
  enableRowSelection?: boolean;
  /** Row click handler. */
  onRowClick?: (row: TData) => void;
  /** Empty state customization. */
  emptyTitle?: string;
  emptyDescription?: string;
  /** Apply sticky header when scrolling. Default: true. */
  stickyHeader?: boolean;
  className?: string;
}

/**
 * DataTable — generic table with sorting, pagination, global search, loading & empty states.
 * Built on @tanstack/react-table. Uses existing Input, Button, EmptyState components.
 *
 * @example
 * const columns: ColumnDef<User>[] = [
 *   { accessorKey: "name", header: "Nama" },
 *   { accessorKey: "email", header: "Email" },
 *   { accessorKey: "role", header: "Role", cell: ({ row }) => <StatusBadge ... /> },
 * ];
 * <DataTable columns={columns} data={users} searchPlaceholder="Cari user..." />
 */
export function DataTable<TData>({
  columns,
  data,
  searchable = true,
  searchPlaceholder = "Cari...",
  pageSizeOptions = [10, 20, 50, 100],
  initialPageSize = 20,
  loading = false,
  toolbarActions,
  onRowClick,
  emptyTitle = "Belum ada data",
  emptyDescription = "Data akan muncul di sini setelah tersedia.",
  stickyHeader = true,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters, rowSelection, globalFilter },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize: initialPageSize },
    },
  });

  const rows = table.getRowModel().rows;
  const totalRows = table.getFilteredRowModel().rows.length;
  const colCount = useMemo(() => columns.length, [columns]);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toolbar */}
      {(searchable || toolbarActions) && (
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
          {searchable && (
            <Input
              leftIcon={<Search />}
              placeholder={searchPlaceholder}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="md:max-w-xs"
              inputSize="md"
            />
          )}
          {toolbarActions && (
            <div className="flex items-center gap-2 md:ml-auto flex-wrap">{toolbarActions}</div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden bg-card">
        {loading ? (
          <SkeletonTable rows={8} cols={colCount} className="border-0 rounded-none" />
        ) : rows.length === 0 ? (
          <div className="border-t border-border/60">
            <EmptyState
              icon={Inbox}
              title={globalFilter ? "Tidak ada hasil" : emptyTitle}
              description={
                globalFilter
                  ? `Pencarian "${globalFilter}" tidak menghasilkan apa-apa. Coba kata kunci lain.`
                  : emptyDescription
              }
              size="md"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className={cn(stickyHeader && "sticky top-0 z-10")}>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-border bg-muted/40">
                    {hg.headers.map((header) => {
                      const sortable = header.column.getCanSort();
                      const sort = header.column.getIsSorted();
                      return (
                        <th
                          key={header.id}
                          className={cn(
                            "px-4 py-2.5 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground",
                            sortable && "cursor-pointer select-none hover:text-foreground"
                          )}
                          onClick={sortable ? header.column.getToggleSortingHandler() : undefined}
                          style={{ width: header.column.columnDef.size }}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>
                              {header.isPlaceholder
                                ? null
                                : flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            {sortable && (
                              <span className="shrink-0">
                                {sort === "asc" ? (
                                  <ChevronUp className="h-3 w-3 text-primary" />
                                ) : sort === "desc" ? (
                                  <ChevronDown className="h-3 w-3 text-primary" />
                                ) : (
                                  <ChevronsUpDown className="h-3 w-3 opacity-40" />
                                )}
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border/60 transition-colors",
                      onRowClick ? "cursor-pointer hover:bg-accent/40" : "hover:bg-muted/20",
                      row.getIsSelected() && "bg-primary/5"
                    )}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-2.5 text-foreground">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalRows > 0 && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              Menampilkan{" "}
              <span className="font-semibold text-foreground tabular-nums">
                {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
                –
                {Math.min(
                  (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                  totalRows
                )}
              </span>{" "}
              dari{" "}
              <span className="font-semibold text-foreground tabular-nums">{totalRows}</span> baris
            </span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="h-7 rounded border border-input bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}/hal
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              aria-label="Halaman pertama"
            >
              <ChevronsLeft />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Halaman sebelumnya"
            >
              <ChevronLeft />
            </Button>
            <span className="px-2 tabular-nums">
              Hal{" "}
              <span className="font-semibold text-foreground">
                {table.getState().pagination.pageIndex + 1}
              </span>{" "}
              / {table.getPageCount() || 1}
            </span>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Halaman berikutnya"
            >
              <ChevronRight />
            </Button>
            <Button
              size="icon-sm"
              variant="outline"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              aria-label="Halaman terakhir"
            >
              <ChevronsRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
