import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Trash2 } from "lucide-react";
import type { PipelineField, RuleConditionOp } from "@shared/schema";
import { COLLECTION_ATTRS } from "@shared/collectionMetrics";
import { LEAD_CONDITION_ATTRS } from "@shared/leadConditions";

export type DraftCondition = { source?: "field" | "stage" | "billing" | "lead"; fieldId: number | ""; attr?: string; op: RuleConditionOp; value: string };

const OPS: { value: RuleConditionOp; label: string }[] = [
  { value: "eq", label: "sama dengan" },
  { value: "neq", label: "tidak sama dengan" },
  { value: "contains", label: "berisi" },
  { value: "gt", label: "lebih dari" },
  { value: "lt", label: "kurang dari" },
  { value: "empty", label: "kosong" },
  { value: "not_empty", label: "tidak kosong" },
];

/** Ops allowed for stage conditions (backend rejects others). */
const STAGE_OPS: { value: RuleConditionOp; label: string }[] = [
  { value: "eq", label: "sama dengan" },
  { value: "neq", label: "tidak sama dengan" },
];

const NEEDS_VALUE = (op: RuleConditionOp) => op !== "empty" && op !== "not_empty";

export function ConditionsBuilder({
  fields,
  stages,
  value,
  onChange,
  leadMode,
}: {
  fields: PipelineField[];
  /** When provided, each row shows a source selector ("Field" | "Stage") and stage rows use a stage dropdown. */
  stages?: { id: number; label: string }[];
  value: DraftCondition[][];
  onChange: (next: DraftCondition[][]) => void;
  /** When true: source locked to "lead"; rows pick a lead attribute instead of field/stage/billing. */
  leadMode?: boolean;
}) {
  const hasStages = stages != null;
  const freshRow = (): DraftCondition => leadMode
    ? { source: "lead", fieldId: "", attr: LEAD_CONDITION_ATTRS[0].key, op: LEAD_CONDITION_ATTRS[0].ops[0], value: "" }
    : { source: hasStages ? "field" : undefined, fieldId: "", op: "eq", value: "" };
  const setGroup = (gi: number, next: DraftCondition[]) =>
    onChange(value.map((g, idx) => (idx === gi ? next : g)));
  const setRow = (gi: number, ri: number, patch: Partial<DraftCondition>) =>
    setGroup(gi, value[gi].map((row, idx) => (idx === ri ? { ...row, ...patch } : row)));
  const addRow = (gi: number) => setGroup(gi, [...value[gi], freshRow()]);
  const removeRow = (gi: number, ri: number) => {
    const next = value[gi].filter((_, idx) => idx !== ri);
    if (next.length === 0) onChange(value.filter((_, idx) => idx !== gi)); // drop now-empty group
    else setGroup(gi, next);
  };
  const addGroup = () => onChange([...value, [freshRow()]]);
  const removeGroup = (gi: number) => onChange(value.filter((_, idx) => idx !== gi));

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">
        Syarat (opsional) - cocok jika SALAH SATU grup terpenuhi
      </div>
      {value.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="text-[10px] font-semibold text-muted-foreground/70 my-1 text-center">ATAU</div>}
          <fieldset className="rounded-lg border border-border/60 p-2 space-y-1.5 m-0">
            <legend className="text-[10px] uppercase tracking-wide text-muted-foreground/70 px-1">
              Grup #{gi + 1} - semua harus terpenuhi (DAN)
            </legend>
            {group.map((row, ri) => {
              const isStageRow = !leadMode && hasStages && row.source === "stage";
              const isBillingRow = !leadMode && row.source === "billing";
              const leadAttr = leadMode ? LEAD_CONDITION_ATTRS.find((a) => a.key === row.attr) : undefined;
              const opsForRow = leadMode
                ? (leadAttr ? leadAttr.ops.map((op) => OPS.find((o) => o.value === op)!) : OPS)
                : (isStageRow ? STAGE_OPS : OPS);
              return (
                <div key={`cond-${gi}-${ri}-${row.fieldId}-${row.source}`} className="flex flex-wrap items-center gap-1.5">
                  {leadMode ? (
                    /* Lead mode: single attr selector replaces source/field/billing controls */
                    <div className="flex-1 min-w-[6rem] sm:min-w-[8rem]">
                      <Combobox
                        options={LEAD_CONDITION_ATTRS.map((a) => ({ value: a.key, label: a.label }))}
                        value={row.attr ?? ""}
                        onChange={(v) => {
                          const a = LEAD_CONDITION_ATTRS.find((x) => x.key === v);
                          setRow(gi, ri, { source: "lead", fieldId: "", attr: v || undefined, op: a ? a.ops[0] : "eq", value: "" });
                        }}
                        placeholder="Atribut lead…" clearable={false}
                      />
                    </div>
                  ) : (
                    <>
                      {/* Source selector - Field / Billing always; Stage only when stages provided */}
                      <div className="w-24 shrink-0">
                        <Combobox
                          options={[
                            { value: "field", label: "Field" },
                            ...(hasStages ? [{ value: "stage", label: "Stage" }] : []),
                            { value: "billing", label: "Billing" },
                          ]}
                          value={row.source ?? "field"}
                          onChange={(v) => {
                            const src = (v || "field") as "field" | "stage" | "billing";
                            if (src === "stage") setRow(gi, ri, { source: "stage", fieldId: "", attr: undefined, op: "eq", value: "" });
                            else if (src === "billing") setRow(gi, ri, { source: "billing", fieldId: "", attr: COLLECTION_ATTRS[0].key, op: "gt", value: "" });
                            else setRow(gi, ri, { source: "field", fieldId: "", attr: undefined, op: "eq", value: "" });
                          }}
                          clearable={false}
                        />
                      </div>
                      {/* Field dropdown - hidden for stage + billing rows */}
                      {!isStageRow && !isBillingRow && (
                        <div className="flex-1 min-w-[6rem] sm:min-w-[8rem]">
                          <Combobox
                            options={fields.map((f) => ({ value: String(f.id), label: f.label }))}
                            value={row.fieldId === "" ? "" : String(row.fieldId)}
                            onChange={(v) => setRow(gi, ri, { fieldId: v ? Number(v) : "" })}
                            placeholder="Field…" searchPlaceholder="Cari field…"
                          />
                        </div>
                      )}
                      {/* Billing attribute dropdown */}
                      {isBillingRow && (
                        <div className="flex-1 min-w-[6rem] sm:min-w-[8rem]">
                          <Combobox
                            options={COLLECTION_ATTRS.map((a) => ({ value: a.key, label: a.label }))}
                            value={row.attr ?? ""}
                            onChange={(v) => setRow(gi, ri, { attr: v || undefined })}
                            placeholder="Atribut…" clearable={false}
                          />
                        </div>
                      )}
                    </>
                  )}
                  <div className="w-full sm:w-44 shrink-0">
                    <Combobox
                      options={opsForRow.map((o) => ({ value: o.value, label: o.label }))}
                      value={row.op}
                      onChange={(v) => setRow(gi, ri, { op: (v || "eq") as RuleConditionOp })}
                      placeholder="Operator…" clearable={false}
                    />
                  </div>
                  {/* Value input: stage dropdown for stage rows, free text otherwise (lead rows use text input; odpId hides via NEEDS_VALUE) */}
                  {isStageRow ? (
                    <div className="flex-1 min-w-[6rem] sm:min-w-[8rem]">
                      <Combobox
                        options={(stages ?? []).map((s) => ({ value: String(s.id), label: s.label }))}
                        value={row.value}
                        onChange={(v) => setRow(gi, ri, { value: v ?? "" })}
                        placeholder="Stage…" searchPlaceholder="Cari stage…"
                      />
                    </div>
                  ) : (
                    NEEDS_VALUE(row.op) && (
                      <div className="flex-1 min-w-[6rem] sm:min-w-[8rem]">
                        <Input value={row.value} onChange={(e) => setRow(gi, ri, { value: e.target.value })} placeholder="Nilai…" />
                      </div>
                    )
                  )}
                  <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" aria-label="Hapus syarat" onClick={() => removeRow(gi, ri)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              );
            })}
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => addRow(gi)}>+ Tambah syarat</Button>
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" aria-label="Hapus grup" onClick={() => removeGroup(gi)}>Hapus grup</Button>
            </div>
          </fieldset>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={addGroup}>+ Tambah grup (ATAU)</Button>
    </div>
  );
}
