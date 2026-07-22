/**
 * v4.2.19: Audience Builder - rule-based filter UI dengan live preview
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Users, Loader2 } from "lucide-react";

export interface AudienceRule {
  field: string;
  op: string;
  value?: any;
}

export interface AudienceFilter {
  combine: "all" | "any";
  rules: AudienceRule[];
}

interface FieldOption {
  field: string;
  column: string;
  type: "string" | "number" | "date";
}

interface OperatorOption { op: string; label: string; }

export function AudienceBuilder({
  value, onChange, showPreview = true,
}: {
  value: AudienceFilter;
  onChange: (filter: AudienceFilter) => void;
  showPreview?: boolean;
}) {
  const { data: meta } = useQuery<{ fields: FieldOption[]; operators: OperatorOption[] }>({
    queryKey: ["broadcast-audience-fields"],
    queryFn: () => api.get("/broadcast/audience-fields"),
  });

  const previewMut = useMutation({
    mutationFn: (filter: AudienceFilter) => api.post<{ count: number; sample: any[] }>("/broadcast/audience-preview", { filter }),
  });

  const [debouncedFilter, setDebouncedFilter] = useState(value);
  useEffect(() => {
    if (!showPreview) return;
    const t = setTimeout(() => {
      if (value.rules.length > 0) {
        setDebouncedFilter(value);
        previewMut.mutate(value);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [value, showPreview]);

  function update(patch: Partial<AudienceFilter>) {
    onChange({ ...value, ...patch });
  }
  function updateRule(idx: number, patch: Partial<AudienceRule>) {
    const rules = value.rules.map((r, i) => i === idx ? { ...r, ...patch } : r);
    update({ rules });
  }
  function addRule() {
    if (!meta?.fields[0]) return;
    update({ rules: [...value.rules, { field: meta.fields[0].field, op: "eq", value: "" }] });
  }
  function removeRule(idx: number) {
    update({ rules: value.rules.filter((_, i) => i !== idx) });
  }

  function operatorNeedsValue(op: string): boolean {
    return !["is_empty", "not_empty"].includes(op);
  }

  return (
    <div className="space-y-3">
      {/* Combine */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cocokkan</span>
        <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
          {(["all", "any"] as const).map(c => (
            <button
              key={c}
              onClick={() => update({ combine: c })}
              className={`px-3 py-1 rounded font-bold uppercase tracking-wider ${
                value.combine === c ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {c === "all" ? "SEMUA (AND)" : "SALAH SATU (OR)"}
            </button>
          ))}
        </div>
      </div>

      {/* Rules */}
      <div className="space-y-1.5">
        {value.rules.map((rule, idx) => {
          const fopt = meta?.fields.find(f => f.field === rule.field);
          const needsValue = operatorNeedsValue(rule.op);
          return (
            <div key={idx} className="grid grid-cols-12 gap-1.5 items-center rounded-md bg-muted/30 p-1.5">
              <select
                value={rule.field}
                onChange={(e) => updateRule(idx, { field: e.target.value, value: "" })}
                className="col-span-4 px-2 py-1.5 rounded border bg-background text-xs"
              >
                {meta?.fields.map(f => (
                  <option key={f.field} value={f.field}>{f.field}</option>
                ))}
              </select>
              <select
                value={rule.op}
                onChange={(e) => updateRule(idx, { op: e.target.value })}
                className="col-span-3 px-1.5 py-1.5 rounded border bg-background text-xs"
              >
                {meta?.operators.map(o => (
                  <option key={o.op} value={o.op}>{o.label}</option>
                ))}
              </select>
              {needsValue ? (
                rule.op === "in" || rule.op === "not_in" ? (
                  <Input
                    placeholder="value1,value2,value3"
                    value={Array.isArray(rule.value) ? rule.value.join(",") : (rule.value ?? "")}
                    onChange={(e) => updateRule(idx, { value: e.target.value.split(",").map(v => v.trim()).filter(Boolean) })}
                    className="col-span-4 text-xs h-8"
                  />
                ) : (
                  <Input
                    type={fopt?.type === "number" || rule.op === "lte_days" || rule.op === "gte_days" || rule.op === "lte_days_ago" || rule.op === "gte_days_ago" ? "number" : fopt?.type === "date" ? "date" : "text"}
                    value={rule.value ?? ""}
                    onChange={(e) => updateRule(idx, { value: e.target.value })}
                    className="col-span-4 text-xs h-8"
                    placeholder={fopt?.type === "number" ? "0" : ""}
                  />
                )
              ) : (
                <div className="col-span-4 text-[10px] text-muted-foreground italic px-2">tidak butuh value</div>
              )}
              <button
                onClick={() => removeRule(idx)}
                className="col-span-1 h-8 grid place-items-center text-rose-600 hover:bg-rose-50 rounded"
                title="Hapus rule"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        <Button size="xs" variant="ghost-primary" onClick={addRule} leftIcon={<Plus className="h-3 w-3" />}>
          Tambah Rule
        </Button>
      </div>

      {/* Preview */}
      {showPreview && (
        <div className="rounded-md border bg-card p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-bold uppercase tracking-wider">Preview Audience</span>
            </div>
            {previewMut.isPending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          {previewMut.data ? (
            <>
              <div className="text-2xl font-black tabular-nums">
                {previewMut.data.count}
                <span className="text-xs font-bold text-muted-foreground ml-2">pelanggan match</span>
              </div>
              {previewMut.data.sample.length > 0 && (
                <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                  <div className="font-bold uppercase tracking-wider mb-1">Sample (10 teratas):</div>
                  {previewMut.data.sample.map((s: any) => (
                    <div key={s.id} className="flex items-center gap-2">
                      <span className="font-mono shrink-0">#{s.customerId}</span>
                      <span className="min-w-0 flex-1 truncate">{s.name}</span>
                      <span className="shrink-0 text-[10px]">{s.district ?? "-"}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : value.rules.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">Tambah minimal 1 rule untuk preview.</div>
          ) : (
            <div className="text-xs text-muted-foreground italic">Evaluating...</div>
          )}
        </div>
      )}
    </div>
  );
}
