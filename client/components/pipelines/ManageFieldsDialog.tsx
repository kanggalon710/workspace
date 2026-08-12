import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogSizeToggle, useDialogSize } from "@/components/ui/dialog-size-toggle";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField, FormSection } from "@/components/ui/form-field";
import { useFields, usePipeline, usePipelineMutations, useRoles } from "@/hooks/usePipelines";
import { getFieldTypeMeta } from "@shared/pipelineFieldTypes";
import { FieldTypePicker, FIELD_TYPE_ICONS } from "@/components/pipelines/FieldTypePicker";
import type { PipelineField, PipelineFieldType } from "@shared/schema";
import { Trash2, Plus, GripVertical, Settings2, ChevronUp, ChevronDown, Eye, Star, Pencil, X, Shield } from "lucide-react";
import { reorderByDrag, moveByOffset } from "@/components/pipelines/stageReorder";
import { toast } from "sonner";
import { ConditionsBuilder, type DraftCondition } from "@/components/pipelines/ConditionsBuilder";
import { parseFieldRules, type FieldRuleCondition } from "@shared/fieldRules";
import { parseFieldPerms, type FieldAccessLevel } from "@shared/fieldPermissions";

/** Convert a saved FieldRuleCondition → DraftCondition for the builder UI. */
function toDraft(c: FieldRuleCondition): DraftCondition {
  return {
    source: c.source ?? "field",
    fieldId: c.fieldId ?? "",
    op: c.op,
    value: c.value ?? "",
  };
}

/** Convert DraftCondition[][] → clean FieldRuleCondition[][] for the payload.
 *  Drops incomplete rows (field rows with no fieldId, stage rows with no value). */
function toRuleGroups(draft: DraftCondition[][]): FieldRuleCondition[][] {
  const out: FieldRuleCondition[][] = [];
  for (const group of draft) {
    const grp: FieldRuleCondition[] = [];
    for (const row of group) {
      if (row.source === "stage") {
        if (!row.value) continue; // no stage selected - skip
        grp.push({ source: "stage", op: row.op, value: row.value });
      } else {
        if (row.fieldId === "") continue; // no field selected - skip
        const needsVal = row.op !== "empty" && row.op !== "not_empty";
        if (needsVal && !row.value) continue; // op needs a value but none given - skip
        grp.push({ source: "field", fieldId: Number(row.fieldId), op: row.op, value: row.value });
      }
    }
    if (grp.length > 0) out.push(grp);
  }
  return out;
}

export function ManageFieldsDialog({
  pipelineId,
  open,
  onClose,
}: {
  pipelineId: number;
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useDialogSize("dialogSize:fields");
  const { data: fields } = useFields(open ? pipelineId : null);
  const { data: pipeline } = usePipeline(open ? pipelineId : null);
  const { data: roles = [] } = useRoles();
  const m = usePipelineMutations(pipelineId);

  const stages = (pipeline?.stages ?? []).map((s) => ({ id: s.id, label: s.label }));

  // -- form state (shared by create + edit) ------------------------------------
  const [editingId, setEditingId] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<PipelineFieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [required, setRequired] = useState(false);
  const [showOnCard, setShowOnCard] = useState(false);
  const [assigneeMultiple, setAssigneeMultiple] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);

  // -- rule sections state ------------------------------------------------------
  const [visibleWhen, setVisibleWhen] = useState<DraftCondition[][]>([]);
  const [requiredWhen, setRequiredWhen] = useState<DraftCondition[][]>([]);
  const [showVisibility, setShowVisibility] = useState(false);
  const [showRequired, setShowRequired] = useState(false);

  // -- per-role access state ----------------------------------------------------
  const [fieldPerms, setFieldPerms] = useState<Record<number, FieldAccessLevel>>({});
  const [showFieldPerms, setShowFieldPerms] = useState(false);

  const needsOptions = getFieldTypeMeta(type)?.hasOptions ?? false;

  const resetForm = () => {
    setEditingId(null);
    setLabel("");
    setOptionsText("");
    setRequired(false);
    setShowOnCard(false);
    setType("text");
    setAssigneeMultiple(false);
    setVisibleWhen([]);
    setRequiredWhen([]);
    setShowVisibility(false);
    setShowRequired(false);
    setFieldPerms({});
    setShowFieldPerms(false);
  };

  /** Populate form from an existing field for editing. */
  const startEdit = (f: PipelineField) => {
    setEditingId(f.id);
    setLabel(f.label);
    setType((f.type as PipelineFieldType) ?? "text");
    setRequired(f.required === 1);
    setShowOnCard(f.showOnCard === 1);
    // Assignee multiple
    try {
      const cfg = f.config ? JSON.parse(f.config) : {};
      setAssigneeMultiple(!!cfg?.multiple);
      // Options: not applicable to edit (options are immutable after creation in current UI)
    } catch { setAssigneeMultiple(false); }
    setOptionsText(""); // options not editable post-create via this form

    // Hydrate rule conditions
    const { visibleWhen: vw, requiredWhen: rw } = parseFieldRules(f.config ?? null);
    const vwDraft = vw.map((g) => g.map(toDraft));
    const rwDraft = rw.map((g) => g.map(toDraft));
    setVisibleWhen(vwDraft);
    setRequiredWhen(rwDraft);
    setShowVisibility(vwDraft.length > 0);
    setShowRequired(rwDraft.length > 0);

    // Hydrate per-role access
    const fp = parseFieldPerms(f.config ?? null);
    setFieldPerms(fp);
    setShowFieldPerms(Object.keys(fp).length > 0);
  };

  /** Build the config JSON for the payload, preserving existing keys. */
  const buildConfig = (existingConfig: string | null | undefined): string | null => {
    let base: Record<string, unknown> = {};
    try { if (existingConfig) base = JSON.parse(existingConfig); } catch { /* ignore */ }

    // Apply assignee multiple
    if (type === "user") base.multiple = assigneeMultiple;
    else delete base.multiple;

    // Apply rule groups
    const vw = toRuleGroups(visibleWhen);
    const rw = toRuleGroups(requiredWhen);
    if (vw.length > 0) base.visibleWhen = vw; else delete base.visibleWhen;
    if (rw.length > 0) base.requiredWhen = rw; else delete base.requiredWhen;

    // Apply per-role field permissions
    const fp = Object.fromEntries(Object.entries(fieldPerms).filter(([, v]) => v));
    if (Object.keys(fp).length > 0) base.fieldPerms = fp; else delete base.fieldPerms;

    const keys = Object.keys(base);
    // Return null (not undefined) so an edit that clears all rules actually persists the cleared
    // config - updateField skips `config: undefined` but writes `config: null`.
    if (keys.length === 0) return null;
    return JSON.stringify(base);
  };

  const add = async () => {
    if (!label.trim()) {
      toast.error("Nama field tidak boleh kosong");
      return;
    }
    let options: string[] | undefined;
    if (needsOptions) {
      const parsed = optionsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsed.length === 0) {
        toast.error("Isi opsi terlebih dahulu (pisahkan dengan koma)");
        return;
      }
      options = parsed;
    }
    try {
      const config = buildConfig(undefined);
      await m.createField.mutateAsync({
        label: label.trim(),
        type,
        options,
        required,
        showOnCard,
        config,
      });
      toast.success(`Field "${label.trim()}" berhasil ditambahkan`);
      resetForm();
    } catch {
      toast.error("Gagal menambahkan field");
    }
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    if (!label.trim()) {
      toast.error("Nama field tidak boleh kosong");
      return;
    }
    try {
      // Get the current field to preserve its existing config keys
      const existing = (fields ?? []).find((f) => f.id === editingId);
      const config = buildConfig(existing?.config);
      await m.updateField.mutateAsync({
        fieldId: editingId,
        label: label.trim(),
        required,
        showOnCard,
        config,
      });
      toast.success(`Field "${label.trim()}" diperbarui`);
      resetForm();
    } catch {
      toast.error("Gagal memperbarui field");
    }
  };

  const handleToggleShowOnCard = async (fieldId: number, checked: boolean) => {
    try {
      await m.updateField.mutateAsync({ fieldId, showOnCard: checked });
    } catch {
      toast.error("Gagal memperbarui field");
    }
  };

  const handleDelete = async (fieldId: number, fieldLabel: string) => {
    if (
      !confirm(
        `Hapus field "${fieldLabel}"?\n\nSemua nilai yang tersimpan pada kartu akan ikut terhapus secara permanen.`
      )
    )
      return;
    try {
      await m.deleteField.mutateAsync(fieldId);
      if (editingId === fieldId) resetForm();
      toast.success(`Field "${fieldLabel}" dihapus`);
    } catch {
      toast.error("Gagal menghapus field");
    }
  };

  const fieldIds = (fields ?? []).map((x) => x.id);

  /** Fields available for rule conditions when creating/editing.
   *  Exclude the field being edited (a field cannot reference itself). */
  const otherFields = editingId != null
    ? (fields ?? []).filter((f) => f.id !== editingId)
    : (fields ?? []);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetForm(); onClose(); } }}>
      <DialogContent className={cn(dialog.sizeClass, "overflow-hidden flex flex-col p-0")}>
        <DialogSizeToggle size={dialog.size} onCycle={dialog.cycle} />
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Settings2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">Kelola Field Kustom</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tambah, edit, atau hapus field pada pipeline ini
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {/* Existing fields list */}
          <div className="px-6 py-4">
            <FormSection
              title="Field yang Ada"
              description={
                fields?.length
                  ? `${fields.length} field terdaftar`
                  : undefined
              }
            >
              {(fields ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 py-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    Belum ada field kustom. Tambahkan di bawah.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(fields ?? []).map((f, idx) => (
                    <div
                      key={f.id}
                      draggable={editingId == null}
                      onDragStart={() => setDragId(f.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragId != null && dragId !== f.id) m.reorderFields.mutate(reorderByDrag(fieldIds, dragId, f.id));
                        setDragId(null);
                      }}
                      onDragEnd={() => setDragId(null)}
                      className={`group flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 shadow-elev-sm transition-shadow hover:shadow-elev-md ${editingId === f.id ? "border-primary/50 ring-1 ring-primary/40" : "border-border/60"}`}
                    >
                      {/* Drag handle */}
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors" />

                      {/* Reorder arrows (mobile + keyboard accessible) */}
                      <div className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          aria-label="Naikkan posisi"
                          disabled={idx === 0}
                          onClick={() => m.reorderFields.mutate(moveByOffset(fieldIds, f.id, -1))}
                          className="p-1 text-muted-foreground/50 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          aria-label="Turunkan posisi"
                          disabled={idx === fieldIds.length - 1}
                          onClick={() => m.reorderFields.mutate(moveByOffset(fieldIds, f.id, 1))}
                          className="p-1 text-muted-foreground/50 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Type badge */}
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/8 text-[10px] font-bold text-primary">
                        {FIELD_TYPE_ICONS[f.type] ?? f.type.slice(0, 2).toUpperCase()}
                      </div>

                      {/* Label + meta */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-tight truncate">
                          {f.label}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                            {getFieldTypeMeta(f.type)?.label ?? f.type}
                          </span>
                          {f.required === 1 && (
                            <span className="text-[10px] text-destructive bg-destructive/8 px-1.5 py-0.5 rounded">
                              Wajib
                            </span>
                          )}
                          {f.showOnCard === 1 && (
                            <span className="text-[10px] text-info bg-info/10 px-1.5 py-0.5 rounded">
                              Di kartu
                            </span>
                          )}
                          {(() => {
                            const { visibleWhen: vw, requiredWhen: rw } = parseFieldRules(f.config ?? null);
                            return (
                              <>
                                {vw.length > 0 && (
                                  <span className="text-[10px] text-violet-600 bg-violet-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                    <Eye className="h-2.5 w-2.5" /> Aturan tampil
                                  </span>
                                )}
                                {rw.length > 0 && (
                                  <span className="text-[10px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                    <Star className="h-2.5 w-2.5" /> Aturan wajib
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      {/* Show on card toggle */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-muted-foreground hidden sm:block">
                          Kartu
                        </span>
                        <Switch
                          checked={f.showOnCard === 1}
                          onCheckedChange={(c) => handleToggleShowOnCard(f.id, c)}
                        />
                      </div>

                      {/* Edit button */}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary hover:bg-primary/10"
                        onClick={() => {
                          if (editingId === f.id) resetForm();
                          else startEdit(f);
                        }}
                        aria-label={editingId === f.id ? "Batal edit" : "Edit field"}
                      >
                        {editingId === f.id ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                      </Button>

                      {/* Delete button */}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Hapus field"
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(f.id, f.label)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </FormSection>
          </div>

          {/* Add new / edit field form */}
          <div className="px-6 pb-6 border-t pt-5">
            <FormSection
              title={editingId != null ? "Edit Field" : "Tambah Field Baru"}
              description={
                editingId != null
                  ? `Mengedit: ${(fields ?? []).find((f) => f.id === editingId)?.label ?? ""}`
                  : "Isi detail di bawah lalu klik Tambah Field"
              }
            >
              <FormField label="Nama Field" htmlFor="field-label" required>
                <Input
                  id="field-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="mis. Estimasi Biaya"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (editingId != null) saveEdit(); else add();
                    }
                  }}
                />
              </FormField>

              {/* Type picker only shown for new fields */}
              {editingId == null && (
                <FormField label="Tipe Data">
                  <FieldTypePicker
                    value={type}
                    onChange={(t) => setType(t)}
                    existingFields={fields ?? []}
                  />
                </FormField>
              )}

              {type === "user" && (
                <fieldset className="space-y-1.5 border-0 p-0 m-0">
                  <legend className="text-xs font-medium mb-1">Penugasan</legend>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                      <input
                        type="radio"
                        name="assignee-cardinality"
                        checked={!assigneeMultiple}
                        onChange={() => setAssigneeMultiple(false)}
                      />
                      Tunggal (1 orang)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                      <input
                        type="radio"
                        name="assignee-cardinality"
                        checked={assigneeMultiple}
                        onChange={() => setAssigneeMultiple(true)}
                      />
                      Banyak orang
                    </label>
                  </div>
                </fieldset>
              )}

              {needsOptions && editingId == null && (
                <FormField
                  label="Opsi"
                  htmlFor="field-options"
                  hint="Pisahkan setiap opsi dengan koma. Contoh: Rendah, Sedang, Tinggi"
                  required
                >
                  <Input
                    id="field-options"
                    value={optionsText}
                    onChange={(e) => setOptionsText(e.target.value)}
                    placeholder="Opsi A, Opsi B, Opsi C"
                  />
                </FormField>
              )}

              {/* Toggles */}
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg bg-muted/30 border border-border/40 px-4 py-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <Switch checked={required} onCheckedChange={setRequired} />
                  <div>
                    <div className="text-sm font-medium leading-tight">Wajib diisi</div>
                    <div className="text-[10px] text-muted-foreground">
                      Ditandai "wajib diisi" jika kosong (tidak memblokir simpan)
                    </div>
                  </div>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <Switch checked={showOnCard} onCheckedChange={setShowOnCard} />
                  <div>
                    <div className="text-sm font-medium leading-tight">Tampilkan di kartu</div>
                    <div className="text-[10px] text-muted-foreground">
                      Nilai muncul di tampilan Kanban
                    </div>
                  </div>
                </label>
              </div>

              {/* -- Visibility rule section ----------------------------------- */}
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => setShowVisibility((v) => !v)}
                >
                  <div className="flex items-center gap-2">
                    <Eye className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                    <span className="text-xs font-semibold text-foreground">Aturan Tampil (Visibility)</span>
                    {visibleWhen.length > 0 && (
                      <span className="text-[10px] text-violet-600 bg-violet-500/10 px-1.5 py-0.5 rounded">
                        {visibleWhen.length} grup aktif
                      </span>
                    )}
                  </div>
                  {showVisibility ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                {showVisibility && (
                  <div className="px-3 py-3 border-t border-border/40 bg-background">
                    <p className="text-[10px] text-muted-foreground mb-2">
                      Field hanya ditampilkan saat kondisi berikut terpenuhi. Kosongkan untuk selalu tampil.
                    </p>
                    <ConditionsBuilder
                      fields={otherFields}
                      stages={stages}
                      value={visibleWhen}
                      onChange={setVisibleWhen}
                    />
                  </div>
                )}
              </div>

              {/* -- Required rule section ------------------------------------- */}
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => setShowRequired((v) => !v)}
                >
                  <div className="flex items-center gap-2">
                    <Star className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="text-xs font-semibold text-foreground">Aturan Wajib (Required When)</span>
                    {requiredWhen.length > 0 && (
                      <span className="text-[10px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                        {requiredWhen.length} grup aktif
                      </span>
                    )}
                  </div>
                  {showRequired ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                {showRequired && (
                  <div className="px-3 py-3 border-t border-border/40 bg-background">
                    <p className="text-[10px] text-muted-foreground mb-2">
                      Field diwajibkan saat kondisi berikut terpenuhi (memblokir simpan kartu). Kosongkan untuk menggunakan toggle wajib statis di atas.
                    </p>
                    <ConditionsBuilder
                      fields={otherFields}
                      stages={stages}
                      value={requiredWhen}
                      onChange={setRequiredWhen}
                    />
                  </div>
                )}
              </div>

              {/* -- Per-role access section ----------------------------------- */}
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                  onClick={() => setShowFieldPerms((v) => !v)}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                    <span className="text-xs font-semibold text-foreground">Akses per Role</span>
                    {Object.keys(fieldPerms).length > 0 && (
                      <span className="text-[10px] text-sky-600 bg-sky-500/10 px-1.5 py-0.5 rounded">
                        {Object.keys(fieldPerms).length} role diatur
                      </span>
                    )}
                  </div>
                  {showFieldPerms ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                {showFieldPerms && (
                  <div className="px-3 py-3 border-t border-border/40 bg-background space-y-2">
                    <p className="text-[10px] text-muted-foreground">
                      Default = ikut izin pipeline. Admin selalu bisa edit.
                    </p>
                    {roles.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Memuat role...</p>
                    ) : (
                      roles.map((role) => (
                        <div key={role.id} className="flex items-center justify-between gap-3">
                          <span className="text-xs text-foreground truncate flex-1">{role.name}</span>
                          <select
                            aria-label={`Akses untuk role ${role.name}`}
                            value={fieldPerms[role.id] ?? ""}
                            onChange={(e) => {
                              const val = e.target.value as FieldAccessLevel | "";
                              setFieldPerms((prev) => {
                                const next = { ...prev };
                                if (val === "") delete next[role.id];
                                else next[role.id] = val;
                                return next;
                              });
                            }}
                            className="text-xs rounded border border-border/60 bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 shrink-0"
                          >
                            <option value="">Default (warisi)</option>
                            <option value="hidden">Hidden</option>
                            <option value="view">View</option>
                            <option value="edit">Edit</option>
                          </select>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {editingId != null ? (
                  <>
                    <Button
                      leftIcon={<Pencil className="h-4 w-4" />}
                      onClick={saveEdit}
                      loading={m.updateField.isPending}
                      disabled={!label.trim()}
                      className="w-full sm:w-auto"
                    >
                      Simpan Perubahan
                    </Button>
                    <Button type="button" variant="ghost" onClick={resetForm}>
                      Batal
                    </Button>
                  </>
                ) : (
                  <Button
                    leftIcon={<Plus className="h-4 w-4" />}
                    onClick={add}
                    loading={m.createField.isPending}
                    disabled={!label.trim()}
                    className="w-full sm:w-auto"
                  >
                    Tambah Field
                  </Button>
                )}
              </div>
            </FormSection>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
