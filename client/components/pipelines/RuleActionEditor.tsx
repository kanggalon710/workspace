// SoC: single-action editor - given an ActionDraft and catalogues, renders the
// right fields for the action type and emits changes via onChange.
// Each create_card action fetches its OWN target pipeline inside this component
// so multiple actions with different targets can coexist in the same rule form.
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { FormField } from "@/components/ui/form-field";
import { usePipeline, usePipelineMutations } from "@/hooks/usePipelines";
import { AssigneePicker } from "./AssigneePicker";
import { NotifyConfigFields } from "./NotifyConfigFields";
import type { ActionDraft } from "./ruleFormState";

export function RuleActionEditor(props: {
  value: ActionDraft;
  onChange: (next: ActionDraft) => void;
  sourceFields: { id: number; label: string; type: string; options?: string | null }[];
  selfStages: { id: number; label: string }[];
  allPipelines: { id: number; name: string }[];
  staffUsers: { id: number; name?: string | null; username?: string }[];
}): JSX.Element {
  const { value, onChange, sourceFields, selfStages, allPipelines, staffUsers } = props;

  // Per-action target pipeline fetch - each action owns its own query so
  // two create_card actions can target different pipelines simultaneously.
  const targetPipe = usePipeline(value.targetPipelineId ? Number(value.targetPipelineId) : null).data;
  const targetMutations = usePipelineMutations(
    value.targetPipelineId ? Number(value.targetPipelineId) : undefined,
  );
  const targetFields = targetPipe?.fields ?? [];

  // -- helpers -----------------------------------------------------------------

  const patch = (partial: Partial<ActionDraft>) => onChange({ ...value, ...partial });

  const addMapRow = () =>
    patch({ maps: [...value.maps, { sourceFieldId: "", targetFieldId: "" }] });

  const setMapRow = (
    i: number,
    p: Partial<{ sourceFieldId: number | ""; targetFieldId: number | "" }>,
  ) => patch({ maps: value.maps.map((row, idx) => (idx === i ? { ...row, ...p } : row)) });

  const removeMapRow = (i: number) =>
    patch({ maps: value.maps.filter((_, idx) => idx !== i) });

  const createInTarget = async (i: number, sourceFieldId: number) => {
    const sf = sourceFields.find((f) => f.id === sourceFieldId);
    if (!sf || !value.targetPipelineId) return;
    try {
      const created: any = await targetMutations.createField.mutateAsync({
        label: sf.label,
        type: sf.type,
        options: sf.options ? JSON.parse(sf.options) : undefined,
      });
      if (created?.id) setMapRow(i, { targetFieldId: created.id });
      toast.success(`Field "${sf.label}" dibuat di target`);
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat field di target");
    }
  };

  // -- render -------------------------------------------------------------------

  return (
    <div className="space-y-3">
      {/* Action-type selector */}
      <FormField label="Aksi" htmlFor="rule-action-type" required>
        <Combobox
          options={[
            { value: "create_card", label: "Buat kartu di pipeline lain" },
            { value: "move_linked", label: "Pindahkan kartu tertaut (pipeline lain)" },
            { value: "set_field_linked", label: "Set field di kartu tertaut (pipeline lain)" },
            { value: "assign_linked", label: "Sinkron assignee ke kartu tertaut" },
            { value: "set_field", label: "Set nilai field (kartu ini)" },
            { value: "move_stage", label: "Pindahkan kartu (stage lain)" },
            { value: "assign", label: "Tugaskan kartu (assignee)" },
            { value: "notify", label: "Kirim notifikasi (bell/webhook)" },
          ]}
          value={value.actionType}
          onChange={(v) => patch({ actionType: (v || "create_card") as ActionDraft["actionType"] })}
          placeholder="Pilih aksi…"
          clearable={false}
        />
      </FormField>

      {/* -- create_card -------------------------------------------------------- */}
      {value.actionType === "create_card" && (
        <>
          <FormField
            label="Buat kartu di pipeline"
            htmlFor="rule-target-pipeline"
            required
          >
            <Combobox
              options={allPipelines.map((p) => ({ value: String(p.id), label: p.name }))}
              value={value.targetPipelineId}
              onChange={(v) => patch({ targetPipelineId: v, targetStageId: "" })}
              placeholder="Pilih pipeline tujuan…"
              searchPlaceholder="Cari pipeline…"
              clearable={false}
            />
          </FormField>

          <FormField
            label="Di stage"
            htmlFor="rule-target-stage"
            required
          >
            <Combobox
              options={(targetPipe?.stages ?? []).map((s) => ({
                value: String(s.id),
                label: s.label,
              }))}
              value={value.targetStageId}
              onChange={(v) => patch({ targetStageId: v })}
              placeholder={value.targetPipelineId ? "Pilih stage target…" : "Pilih pipeline dulu…"}
              searchPlaceholder="Cari stage…"
              clearable={false}
              disabled={!value.targetPipelineId}
            />
          </FormField>

          <FormField label="Tautkan sebagai (opsional)" htmlFor="rule-relation-type"
            hint="Kosong = kartu independen. Pilih relasi agar kartu baru tertaut ke entitas yang sama (muncul di 'Kartu Terkait').">
            <Combobox
              options={[
                { value: "", label: "Tidak tertaut" },
                { value: "mirror", label: "Mirror" },
                { value: "duplicate", label: "Duplikat" },
                { value: "linked", label: "Tertaut" },
                { value: "child", label: "Turunan" },
              ]}
              value={value.relationType}
              onChange={(v) => patch({ relationType: v })}
              placeholder="Tidak tertaut"
            />
          </FormField>
          {value.relationType && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={value.reuseExisting} onCheckedChange={(c) => patch({ reuseExisting: c })} />
              Gunakan kartu tertaut yang sudah ada (jangan buat duplikat)
            </label>
          )}

          <FormField
            label="Judul kartu baru"
            htmlFor={`rule-title-template-${props.value._key}`}
            hint="{title} akan diganti judul kartu sumber. Kosongkan untuk menyalin judul."
          >
            <Input
              id={`rule-title-template-${props.value._key}`}
              value={value.titleTemplate}
              onChange={(e) => patch({ titleTemplate: e.target.value })}
              placeholder="Contoh: [Follow-up] {title}"
            />
          </FormField>

          {/* Field mapping section */}
          {value.targetPipelineId && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Pemetaan field (opsional)</div>
              {value.maps.map((row, i) => {
                const sf = sourceFields.find((f) => f.id === Number(row.sourceFieldId));
                const compatTargets = sf
                  ? targetFields.filter((f) => f.type === sf.type)
                  : [];
                return (
                  <div key={`map-${i}-${row.sourceFieldId}-${row.targetFieldId}`} className="flex flex-wrap items-center gap-1">
                    <div className="flex-1 min-w-0">
                      <Combobox
                        options={sourceFields.map((f) => ({ value: String(f.id), label: f.label }))}
                        value={row.sourceFieldId === "" ? "" : String(row.sourceFieldId)}
                        onChange={(v) =>
                          setMapRow(i, {
                            sourceFieldId: v ? Number(v) : "",
                            targetFieldId: "",
                          })
                        }
                        placeholder="Field sumber…"
                      />
                    </div>
                    <span className="text-muted-foreground shrink-0">→</span>
                    <div className="flex-1 min-w-0">
                      <Combobox
                        options={compatTargets.map((f) => ({ value: String(f.id), label: f.label }))}
                        value={row.targetFieldId === "" ? "" : String(row.targetFieldId)}
                        onChange={(v) => setMapRow(i, { targetFieldId: v ? Number(v) : "" })}
                        placeholder="Field target…"
                      />
                    </div>
                    {sf && compatTargets.length === 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={() => createInTarget(i, sf.id)}
                        loading={targetMutations.createField.isPending}
                      >
                        + Buat di target
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0"
                      onClick={() => removeMapRow(i)}
                      aria-label="Hapus pemetaan"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              <Button type="button" variant="ghost" size="sm" onClick={addMapRow}>
                + Tambah pemetaan
              </Button>
            </div>
          )}

          {/* Copy assignee toggle */}
          <div className="flex items-center gap-3 rounded-lg bg-muted/30 border border-border/40 px-4 py-3">
            <Switch
              checked={value.copyAssignee}
              onCheckedChange={(checked) => patch({ copyAssignee: checked })}
            />
            <div>
              <div className="text-sm font-medium leading-tight">Salin assignee</div>
              <div className="text-[10px] text-muted-foreground">
                Kartu baru akan ditugaskan ke orang yang sama dengan kartu sumber
              </div>
            </div>
          </div>
        </>
      )}

      {/* -- move_linked ------------------------------------------------------- */}
      {value.actionType === "move_linked" && (
        <>
          <FormField label="Pindahkan kartu tertaut di pipeline" htmlFor="rule-ml-pipeline" required>
            <Combobox
              options={allPipelines.map((p) => ({ value: String(p.id), label: p.name }))}
              value={value.targetPipelineId}
              onChange={(v) => patch({ targetPipelineId: v, targetStageId: "" })}
              placeholder="Pilih pipeline tujuan…"
              searchPlaceholder="Cari pipeline…"
              clearable={false}
            />
          </FormField>
          <FormField label="Ke stage" htmlFor="rule-ml-stage" required>
            <Combobox
              options={(targetPipe?.stages ?? []).map((s) => ({ value: String(s.id), label: s.label }))}
              value={value.targetStageId}
              onChange={(v) => patch({ targetStageId: v })}
              placeholder={value.targetPipelineId ? "Pilih stage target…" : "Pilih pipeline dulu…"}
              searchPlaceholder="Cari stage…"
              clearable={false}
              disabled={!value.targetPipelineId}
            />
          </FormField>
          <p className="text-2xs text-muted-foreground">
            Mencari kartu di pipeline tujuan yang berbagi entitas (master) dengan kartu ini, lalu memindahkannya ke stage tsb.
          </p>
        </>
      )}

      {/* -- set_field_linked --------------------------------------------------- */}
      {value.actionType === "set_field_linked" && (
        <>
          <FormField label="Set field di kartu tertaut di pipeline" htmlFor="rule-sfl-pipeline" required>
            <Combobox
              options={allPipelines.map((p) => ({ value: String(p.id), label: p.name }))}
              value={value.targetPipelineId}
              onChange={(v) => patch({ targetPipelineId: v })}
              placeholder="Pilih pipeline tujuan…"
              searchPlaceholder="Cari pipeline…"
              clearable={false}
            />
          </FormField>
          {value.targetPipelineId && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">Pemetaan field (sumber → kartu tertaut)</div>
              {value.maps.map((row, i) => {
                const sf = sourceFields.find((f) => f.id === Number(row.sourceFieldId));
                const compatTargets = sf ? targetFields.filter((f) => f.type === sf.type) : [];
                return (
                  <div key={`sfl-${i}-${row.sourceFieldId}-${row.targetFieldId}`} className="flex flex-wrap items-center gap-1">
                    <div className="flex-1 min-w-0">
                      <Combobox
                        options={sourceFields.map((f) => ({ value: String(f.id), label: f.label }))}
                        value={row.sourceFieldId === "" ? "" : String(row.sourceFieldId)}
                        onChange={(v) => setMapRow(i, { sourceFieldId: v ? Number(v) : "", targetFieldId: "" })}
                        placeholder="Field sumber…"
                      />
                    </div>
                    <span className="text-muted-foreground shrink-0">→</span>
                    <div className="flex-1 min-w-0">
                      <Combobox
                        options={compatTargets.map((f) => ({ value: String(f.id), label: f.label }))}
                        value={row.targetFieldId === "" ? "" : String(row.targetFieldId)}
                        onChange={(v) => setMapRow(i, { targetFieldId: v ? Number(v) : "" })}
                        placeholder="Field tertaut…"
                      />
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" className="shrink-0" onClick={() => removeMapRow(i)} aria-label="Hapus pemetaan">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              <Button type="button" variant="ghost" size="sm" onClick={addMapRow}>+ Tambah pemetaan</Button>
            </div>
          )}
        </>
      )}

      {/* -- assign_linked ------------------------------------------------------ */}
      {value.actionType === "assign_linked" && (
        <>
          <FormField label="Sinkron assignee ke kartu tertaut di pipeline" htmlFor="rule-al-pipeline" required>
            <Combobox
              options={allPipelines.map((p) => ({ value: String(p.id), label: p.name }))}
              value={value.targetPipelineId}
              onChange={(v) => patch({ targetPipelineId: v })}
              placeholder="Pilih pipeline tujuan…"
              searchPlaceholder="Cari pipeline…"
              clearable={false}
            />
          </FormField>
          <p className="text-2xs text-muted-foreground">
            Assignee utama kartu ini disalin ke kartu tertaut (master sama) di pipeline tsb. Dijalankan via trigger "Saat assignee berubah".
          </p>
        </>
      )}

      {/* -- set_field ---------------------------------------------------------- */}
      {value.actionType === "set_field" && (
        <>
          <FormField label="Set field" htmlFor="rule-set-field" required>
            <Combobox
              options={sourceFields.map((f) => ({ value: String(f.id), label: f.label }))}
              value={value.setFieldId}
              onChange={(v) => patch({ setFieldId: v })}
              placeholder="Pilih field…"
              searchPlaceholder="Cari field…"
              clearable={false}
            />
          </FormField>
          <FormField
            label="Nilai"
            htmlFor={`rule-set-value-${props.value._key}`}
            hint="Untuk field pilihan, ketik salah satu opsi persis."
          >
            <Input
              id={`rule-set-value-${props.value._key}`}
              value={value.setFieldValue}
              onChange={(e) => patch({ setFieldValue: e.target.value })}
              placeholder="Nilai field…"
            />
          </FormField>
        </>
      )}

      {/* -- move_stage --------------------------------------------------------- */}
      {value.actionType === "move_stage" && (
        <FormField label="Pindahkan ke stage" htmlFor="rule-move-stage" required>
          <Combobox
            options={selfStages.map((s) => ({ value: String(s.id), label: s.label }))}
            value={value.moveStageId}
            onChange={(v) => patch({ moveStageId: v })}
            placeholder="Pilih stage tujuan…"
            searchPlaceholder="Cari stage…"
            clearable={false}
          />
        </FormField>
      )}

      {/* -- assign ------------------------------------------------------------- */}
      {value.actionType === "assign" && (
        <FormField
          label="Tugaskan ke"
          htmlFor="rule-assign-user"
          hint="Kosongkan untuk menghapus assignee."
        >
          <AssigneePicker
            mode="single"
            value={value.assignUserId}
            onChange={(v) => patch({ assignUserId: v })}
            placeholder="Pilih user (atau kosongkan)…"
          />
        </FormField>
      )}

      {/* -- notify ------------------------------------------------------------- */}
      {value.actionType === "notify" && (
        <NotifyConfigFields
          value={value}
          onChange={patch}
          users={staffUsers}
          keyPrefix={value._key}
          assigneeLabel="Assignee kartu"
        />
      )}
    </div>
  );
}
