import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional secondary text (e.g., role, location). */
  description?: string;
  /** Optional icon before label. */
  icon?: React.ReactNode;
  /** Disable selection of this option. */
  disabled?: boolean;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Allow clearing the value. Default: true. */
  clearable?: boolean;
  /** Disable the whole control. */
  disabled?: boolean;
  /** Input size. Default: md. */
  size?: "sm" | "md" | "lg";
  /** Error state. */
  error?: boolean;
  className?: string;
  /** Max height of popup list. Default: 260px. */
  maxHeight?: number;
}

const sizeMap = {
  sm: "h-8 text-xs px-2.5",
  md: "h-10 text-sm px-3",
  lg: "h-11 text-sm px-3.5",
};

/**
 * Combobox — searchable select. Great for ODP/router/customer pickers.
 *
 * @example
 * const [odpId, setOdpId] = useState<string>();
 * <Combobox
 *   options={odps.map(o => ({ value: String(o.id), label: o.name, description: o.district }))}
 *   value={odpId}
 *   onChange={setOdpId}
 *   placeholder="Pilih ODP..."
 *   searchPlaceholder="Cari ODP..."
 * />
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Pilih...",
  searchPlaceholder = "Cari...",
  emptyText = "Tidak ada hasil.",
  clearable = true,
  disabled,
  size = "md",
  error,
  className,
  maxHeight = 260,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex items-center justify-between gap-2 w-full rounded-md border bg-background shadow-elev-sm transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0",
            "disabled:cursor-not-allowed disabled:opacity-50",
            sizeMap[size],
            error
              ? "border-destructive/60 focus-visible:ring-destructive/30"
              : "border-input hover:border-border focus-visible:ring-primary/20 focus-visible:border-primary",
            !selected && "text-muted-foreground/60",
            className
          )}
        >
          <span className="flex items-center gap-2 min-w-0 flex-1">
            {selected?.icon && <span className="shrink-0">{selected.icon}</span>}
            <span className="truncate text-left">
              {selected ? selected.label : placeholder}
            </span>
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {clearable && selected && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange?.("");
                }}
                className="h-5 w-5 rounded flex items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground"
                aria-label="Hapus pilihan"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="min-w-[var(--radix-popover-trigger-width)] w-fit max-w-[min(22rem,calc(100vw-2rem))] p-0 border-border/60"
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList style={{ maxHeight }}>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <CommandItem
                    key={option.value}
                    // append option.value: cmdk dedupes items by their `value` string,
                    // so duplicate labels collide (select-one-selects-both); the id keeps each distinct.
                    value={`${option.label} ${option.description || ""} ${option.value}`}
                    disabled={option.disabled}
                    onSelect={() => {
                      onChange?.(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-1 h-3.5 w-3.5 shrink-0",
                        isSelected ? "opacity-100 text-primary" : "opacity-0"
                      )}
                    />
                    {option.icon && <span className="shrink-0">{option.icon}</span>}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="truncate">{option.label}</span>
                      {option.description && (
                        <span className="text-2xs text-muted-foreground truncate">
                          {option.description}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
