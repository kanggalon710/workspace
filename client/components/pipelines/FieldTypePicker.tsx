import { PIPELINE_FIELD_TYPE_REGISTRY, canAddType, type FieldTypeMeta } from "@shared/pipelineFieldTypes";
import type { PipelineField, PipelineFieldType } from "@shared/schema";
import { cn } from "@/lib/utils";

/** Glyphs per field type (registry is React-free, so icons are defined here and reused by callers). */
export const FIELD_TYPE_ICONS: Record<string, string> = {
  text: "T", textarea: "¶", number: "#", currency: "Rp", date: "◷",
  dropdown: "▾", multiselect: "", checkbox: "✓", user: "◍", phone: "", url: "↗",
};

const GROUP_LABELS: Record<FieldTypeMeta["group"], string> = {
  basic: "Dasar", choice: "Pilihan", people: "Orang", special: "Khusus",
};
const GROUP_ORDER: FieldTypeMeta["group"][] = ["basic", "choice", "people", "special"];

export function FieldTypePicker({
  value,
  onChange,
  existingFields,
}: {
  value: PipelineFieldType;
  onChange: (type: PipelineFieldType) => void;
  existingFields: Pick<PipelineField, "type">[];
}) {
  const groups = GROUP_ORDER
    .map((group) => ({
      group,
      metas: Object.values(PIPELINE_FIELD_TYPE_REGISTRY).filter((m) => m.group === group),
    }))
    .filter((g) => g.metas.length > 0);

  return (
    <fieldset className="space-y-3 border-0 p-0 m-0">
      <legend className="sr-only">Tipe field</legend>
      {groups.map(({ group, metas }) => (
        <div key={group}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            {GROUP_LABELS[group]}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {metas.map((meta) => {
              const allowed = canAddType(existingFields, meta.type);
              const selected = value === meta.type;
              return (
                <button
                  key={meta.type}
                  type="button"
                  disabled={!allowed}
                  aria-pressed={selected}
                  onClick={() => onChange(meta.type)}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                    selected
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/60 hover:border-border hover:bg-muted/40",
                    !allowed && "opacity-50 cursor-not-allowed hover:bg-transparent hover:border-border/60",
                  )}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/8 text-[10px] font-bold text-primary">
                    {FIELD_TYPE_ICONS[meta.type] ?? meta.type.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium leading-tight truncate">{meta.label}</span>
                    <span className="block text-[10px] text-muted-foreground leading-tight">
                      {allowed ? meta.description : "Sudah ada - hanya boleh 1 per pipeline"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
