import { useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

export interface AssigneeFilterOption {
  value: number;
  label: string;
}

interface AssigneeMultiFilterProps {
  options: AssigneeFilterOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  label?: string;
  placeholder?: string;
  emptyText?: string;
  className?: string;
}

/**
 * AssigneeMultiFilter - searchable multi-select for filtering cards by one or more
 * assigned staff (PIC). Multi-select is OR/ANY: a card matches if it's assigned to
 * any of the selected people, not all of them. Shared across Leads, Collections, and
 * the generic Pipeline/Teamspace board filter bars - see shared/cardAssignees.ts for
 * the matching predicate each host page applies with the resulting id list.
 */
export function AssigneeMultiFilter({
  options,
  selectedIds,
  onChange,
  label = "PIC",
  placeholder = "Cari staf…",
  emptyText = "Tidak ada staf.",
  className,
}: AssigneeMultiFilterProps) {
  const [open, setOpen] = useState(false);

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((v) => v !== id) : [...selectedIds, id]);
  };

  const triggerText =
    selectedIds.length === 0
      ? label
      : selectedIds.length === 1
        ? `${label}: ${options.find((o) => o.value === selectedIds[0])?.label ?? "1 dipilih"}`
        : `${label}: ${selectedIds.length} dipilih`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          className={cn(
            "inline-flex items-center justify-between gap-2 h-8 pl-3 pr-2.5 rounded-lg border border-border bg-card text-xs font-semibold text-foreground",
            "hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            selectedIds.length === 0 && "text-muted-foreground font-medium",
            className,
          )}
        >
          <span className="truncate">{triggerText}</span>
          <span className="flex items-center gap-1 shrink-0">
            {selectedIds.length > 0 && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
                aria-label={`Hapus filter ${label}`}
                className="h-5 w-5 rounded flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 border-border/60" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList style={{ maxHeight: 260 }}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selectedIds.includes(option.value);
                return (
                  <CommandItem
                    key={option.value}
                    // append option.value: cmdk dedupes items by their `value` string, so
                    // duplicate labels would collide (selecting one selects both) without it.
                    value={`${option.label} ${option.value}`}
                    // Toggle instead of the single-select Combobox pattern, and deliberately
                    // do NOT close the popover - multiple staff are picked in one interaction.
                    onSelect={() => toggle(option.value)}
                  >
                    <Checkbox checked={isSelected} readOnly tabIndex={-1} className="pointer-events-none" />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {selectedIds.length > 0 && (
            <div className="border-t border-border/60 p-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full text-left px-2 py-1 text-xs text-muted-foreground hover:text-foreground underline"
              >
                Bersihkan
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
