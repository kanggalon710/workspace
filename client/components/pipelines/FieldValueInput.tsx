import { lazy, Suspense } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import type { PipelineField } from "@shared/schema";
import { isMultiUser } from "@shared/pipelineFieldTypes";
import { PhoneActions } from "@/components/pipelines/PhoneActions";
import { AssigneePicker } from "./AssigneePicker";

// Lazy: pulls in @react-google-maps (maps-vendor chunk) only when a coordinate field is rendered,
// keeping it out of the board's hot-path bundle.
const CoordinateInput = lazy(() =>
  import("@/components/pipelines/CoordinateInput").then((m) => ({ default: m.CoordinateInput })),
);

function parseOptions(f: PipelineField): string[] {
  if (!f.options) return [];
  try {
    const a = JSON.parse(f.options);
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}

export function FieldValueInput({
  field,
  value,
  onChange,
  disabled,
}: {
  field: PipelineField;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const opts = parseOptions(field);

  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <Input
          type="number"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "currency":
      return (
        <Input
          type="number"
          leftIcon={<span className="text-xs font-medium">Rp</span>}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "date":
      return (
        <Input
          type="date"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "phone":
      return (
        <div className="space-y-1.5">
          <Input
            type="tel"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
          {value.trim() !== "" && <PhoneActions value={value} />}
        </div>
      );

    case "url":
      return (
        <Input
          type="url"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "coordinate":
      return (
        <Suspense fallback={<Input value={value} disabled readOnly placeholder="Memuat peta…" />}>
          <CoordinateInput value={value} disabled={disabled} onChange={onChange} />
        </Suspense>
      );

    case "checkbox":
      return (
        <Switch
          checked={value === "1"}
          disabled={disabled}
          onCheckedChange={(c) => onChange(c ? "1" : "0")}
        />
      );

    case "dropdown":
      return (
        <Combobox
          options={opts.map((o) => ({ value: o, label: o }))}
          value={value}
          onChange={(v) => onChange(v)}
          placeholder="Pilih…"
          disabled={disabled}
        />
      );

    case "multiselect":
      return (
        <MultiSelect
          options={opts}
          value={value}
          disabled={disabled}
          onChange={onChange}
        />
      );

    case "user":
      return isMultiUser(field) ? (
        <UserMultiSelect value={value} disabled={disabled} onChange={onChange} />
      ) : (
        <UserSelect value={value} disabled={disabled} onChange={onChange} />
      );

    case "text":
    default:
      return (
        <Input
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

function MultiSelect({
  options,
  value,
  onChange,
  disabled,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  let selected: string[] = [];
  try {
    const a = JSON.parse(value || "[]");
    selected = Array.isArray(a) ? a.map(String) : [];
  } catch {
    selected = [];
  }

  const toggle = (o: string) => {
    const next = selected.includes(o)
      ? selected.filter((s) => s !== o)
      : [...selected, o];
    onChange(JSON.stringify(next));
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          type="button"
          key={o}
          disabled={disabled}
          onClick={() => toggle(o)}
          className={`text-xs px-2 py-1 rounded-full border transition-colors ${
            selected.includes(o)
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-muted text-muted-foreground border-transparent hover:border-border"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {o}
        </button>
      ))}
      {options.length === 0 && (
        <span className="text-xs text-muted-foreground">Belum ada opsi</span>
      )}
    </div>
  );
}

function UserMultiSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  let selected: string[] = [];
  try { const a = JSON.parse(value || "[]"); selected = Array.isArray(a) ? a.map(String) : []; } catch { selected = []; }
  return (
    <AssigneePicker
      mode="multi"
      disabled={disabled}
      value={selected}
      onChange={(next) => onChange(next.length ? JSON.stringify(next) : "")}
    />
  );
}

function UserSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return <AssigneePicker mode="single" value={value} onChange={onChange} disabled={disabled} placeholder="Pilih user…" />;
}
