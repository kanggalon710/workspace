import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Search, X, ArrowUp, ArrowDown, SlidersHorizontal } from "lucide-react";
import type { DateRange } from "./boardCardMeta";
import { filterableFields, sortableFields } from "@shared/pipelineFieldTypes";
import type { PipelineField } from "@shared/schema";

export type DateField = "created" | "updated";

export function BoardFilters({
  search,
  onSearch,
  dateField,
  onDateField,
  range,
  onRange,
  assigneeId = null,
  onAssignee,
  assigneeOptions,
  fields = [],
  filterFieldId = null,
  onFilterField,
  filterValue = "",
  onFilterValue,
  sortFieldId = null,
  onSortField,
  sortDir = "asc",
  onSortDirToggle,
  visibleCount,
  onReset,
}: {
  search: string;
  onSearch: (v: string) => void;
  dateField: DateField;
  onDateField: (v: DateField) => void;
  range: DateRange;
  onRange: (r: DateRange) => void;
  assigneeId?: number | null;
  onAssignee?: (id: number | null) => void;
  assigneeOptions?: ComboboxOption[];
  fields?: PipelineField[];
  filterFieldId?: number | null;
  onFilterField?: (id: number | null) => void;
  filterValue?: string;
  onFilterValue?: (v: string) => void;
  sortFieldId?: number | null;
  onSortField?: (id: number | null) => void;
  sortDir?: "asc" | "desc";
  onSortDirToggle?: () => void;
  visibleCount?: number;
  onReset?: () => void;
}) {
  const preset = typeof range === "string" ? range : "custom";
  const custom = typeof range === "object" ? range : { from: "", to: "" };
  const filterable = filterableFields(fields);
  const sortable = sortableFields(fields);
  const filterField = filterFieldId == null ? undefined : fields.find((f) => f.id === filterFieldId);
  const sortActive = sortFieldId != null && sortable.some((f) => f.id === sortFieldId);
  const anyActive =
    search !== "" || preset !== "all" || assigneeId != null || !!filterField || sortActive;
  // Mobile: filter lanjutan dilipat di balik tombol toggle supaya header board tidak
  // memakan layar (board harus tetap terlihat). ≥sm selalu terbuka (perilaku lama).
  const [expanded, setExpanded] = useState(false);
  const advancedActiveCount =
    (preset !== "all" ? 1 : 0) + (assigneeId != null ? 1 : 0) + (filterField ? 1 : 0) + (sortActive ? 1 : 0);

  // Arah sort selalu tersedia: kalau field kustom dipilih → A–Z/Z–A; kalau tidak, arah
  // berlaku untuk sort tanggal (Dibuat/Update terakhir) → Baru→Lama / Lama→Baru.
  // asc = terbaru dulu untuk tanggal (lihat compareByDate di boardCardMeta).
  const asc = sortDir === "asc";
  const dirToggle = sortActive
    ? { icon: asc ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />,
        label: asc ? "A–Z" : "Z–A",
        aria: asc ? "Ganti ke urut turun (Z–A)" : "Ganti ke urut naik (A–Z)" }
    : { icon: asc ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" />,
        label: asc ? "Baru → Lama" : "Lama → Baru",
        aria: asc ? "Ganti ke terlama dulu" : "Ganti ke terbaru dulu" };

  return (
    // Mobile-first: one wrapping row. Search is full-width on mobile (own line), then each control
    // takes only the width it needs (bounded wrappers) so filters never stretch full-width and wrap
    // neatly. On desktop everything sits inline in a balanced, content-sized row.
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search — shares the first row with the mobile filter toggle, compact on desktop */}
        <div className="flex-1 min-w-0 sm:flex-none sm:w-56">
          <Input
            inputSize="sm"
            placeholder="Cari kartu…"
            aria-label="Cari kartu"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            leftIcon={<Search className="size-3.5" />}
            rightIcon={
              search ? (
                <button
                  type="button"
                  aria-label="Hapus pencarian"
                  onClick={() => onSearch("")}
                  className="pointer-events-auto rounded hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : undefined
            }
            className="w-full"
          />
        </div>
        {/* Mobile-only: toggle filter lanjutan (badge = jumlah filter aktif) */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label="Tampilkan filter lanjutan"
          className="sm:hidden inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-xs font-medium shrink-0 hover:bg-muted/40 active:scale-95 transition-all"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          Filter
          {advancedActiveCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
              {advancedActiveCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter lanjutan — mobile dilipat (toggle di atas), ≥sm selalu tampil */}
      <div className={`${expanded ? "flex" : "hidden"} sm:flex flex-wrap items-center gap-2`}>
        {/* Urut by tanggal (Dibuat / Update terakhir) + arah — selalu aktif, jadi mengganti
            pilihan ini langsung mengubah urutan kartu di tiap kolom. */}
        <div className="flex items-center gap-1.5">
          <div className="w-32 sm:w-36">
            <Combobox
              options={[
                { value: "created", label: "Dibuat" },
                { value: "updated", label: "Update terakhir" },
              ]}
              value={dateField}
              onChange={(v) => onDateField((v as DateField) || "created")}
              clearable={false}
              size="sm"
              aria-label="Urutkan kartu berdasarkan tanggal"
            />
          </div>
          {onSortDirToggle && (
            <button
              type="button"
              onClick={onSortDirToggle}
              aria-label={dirToggle.aria}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-input px-2.5 text-xs font-medium shrink-0 hover:bg-muted/40 active:scale-95 transition-all"
            >
              {dirToggle.icon}
              <span>{dirToggle.label}</span>
            </button>
          )}
        </div>
        <div className="w-32 sm:w-36">
          <Combobox
            options={[
              { value: "all", label: "Semua waktu" },
              { value: "7d", label: "7 hari" },
              { value: "30d", label: "30 hari" },
              { value: "custom", label: "Custom…" },
            ]}
            value={preset}
            onChange={(v) =>
              onRange(v === "custom" ? { from: "", to: "" } : ((v as DateRange) || "all"))
            }
            clearable={false}
            size="sm"
          />
        </div>
        {assigneeOptions && onAssignee && (
          <div className="w-36 sm:w-40">
            <Combobox
              options={assigneeOptions}
              value={assigneeId == null ? "" : String(assigneeId)}
              onChange={(v) => onAssignee(v ? Number(v) : null)}
              placeholder="Assignee"
              searchPlaceholder="Cari user…"
              size="sm"
            />
          </div>
        )}
        {filterable.length > 0 && onFilterField && (
          <>
            <div className="w-36 sm:w-40">
              <Combobox
                options={filterable.map((f) => ({ value: String(f.id), label: f.label }))}
                value={filterFieldId == null ? "" : String(filterFieldId)}
                onChange={(v) => { onFilterField(v ? Number(v) : null); onFilterValue?.(""); }}
                placeholder="Filter field…"
                searchPlaceholder="Cari field…"
                size="sm"
              />
            </div>
            {filterField && onFilterValue && (
              <div className="w-36 sm:w-40">
                <FieldFilterValue
                  field={filterField}
                  value={filterValue}
                  onChange={onFilterValue}
                  userOptions={assigneeOptions}
                />
              </div>
            )}
          </>
        )}
        {/* Sort by field kustom — opsional, meng-override sort tanggal di atas. Arahnya
            dipakai bersama tombol arah di grup tanggal (label berubah jadi A–Z/Z–A). */}
        {sortable.length > 0 && onSortField && (
          <div className="w-36 sm:w-40">
            <Combobox
              options={sortable.map((f) => ({ value: String(f.id), label: f.label }))}
              value={sortFieldId == null ? "" : String(sortFieldId)}
              onChange={(v) => onSortField(v ? Number(v) : null)}
              placeholder="Urutkan…"
              searchPlaceholder="Cari field…"
              size="sm"
            />
          </div>
        )}
        {preset === "custom" && (
          <div className="flex items-center gap-1">
            <Input
              inputSize="sm"
              type="date"
              value={custom.from}
              aria-label="Dari tanggal"
              onChange={(e) => onRange({ from: e.target.value, to: custom.to })}
              className="w-36"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <Input
              inputSize="sm"
              type="date"
              value={custom.to}
              aria-label="Sampai tanggal"
              onChange={(e) => onRange({ from: custom.from, to: e.target.value })}
              className="w-36"
            />
          </div>
        )}
      </div>

      {/* Active-filter affordance */}
      {anyActive && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {typeof visibleCount === "number" && <span>{visibleCount} kartu</span>}
          {onReset && (
            <button type="button" onClick={onReset} className="underline hover:text-foreground">
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FieldFilterValue({
  field,
  value,
  onChange,
  userOptions,
}: {
  field: PipelineField;
  value: string;
  onChange: (v: string) => void;
  userOptions?: ComboboxOption[];
}) {
  if (field.type === "checkbox") {
    return (
      <Combobox
        size="sm"
        options={[{ value: "1", label: "Ya" }, { value: "0", label: "Tidak" }]}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        placeholder="Nilai"
      />
    );
  }
  if (field.type === "user") {
    return (
      <Combobox
        size="sm"
        options={userOptions ?? []}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        placeholder="Pilih user"
        searchPlaceholder="Cari user…"
      />
    );
  }
  if (field.type === "dropdown" || field.type === "multiselect") {
    let opts: string[] = [];
    try { opts = field.options ? (JSON.parse(field.options) as string[]) : []; } catch { opts = []; }
    return (
      <Combobox
        size="sm"
        options={opts.map((o) => ({ value: o, label: o }))}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        placeholder="Pilih nilai"
        searchPlaceholder="Cari…"
      />
    );
  }
  return (
    <Input
      inputSize="sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Nilai"
      className="w-full"
    />
  );
}
