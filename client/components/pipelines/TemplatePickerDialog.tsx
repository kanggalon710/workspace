import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePipelineTemplates, useTemplateMutations, type PipelineTemplate } from "@/hooks/usePipelines";
import { resolvePipelineIcon, pipelineTint, PIPELINE_DEFAULT_COLOR } from "@/components/pipelines/pipelineIcon";
import { LayoutTemplate, X, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Pipeline } from "@shared/schema";

function parseDefinitionCounts(definition: string): { stages: number; fields: number } {
  try {
    const def = JSON.parse(definition);
    return {
      stages: Array.isArray(def.stages) ? def.stages.length : 0,
      fields: Array.isArray(def.fields) ? def.fields.length : 0,
    };
  } catch {
    return { stages: 0, fields: 0 };
  }
}

function TemplateRow({
  tpl,
  selected,
  onSelect,
  onDelete,
  deleting,
}: {
  tpl: PipelineTemplate;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const Icon = resolvePipelineIcon(tpl.icon);
  const color = tpl.color ?? PIPELINE_DEFAULT_COLOR;
  const { stages, fields } = parseDefinitionCounts(tpl.definition);

  return (
    <button
      type="button"
      aria-selected={selected}
      aria-label={`Pilih template ${tpl.name}`}
      onClick={onSelect}
      className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all ${
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border/60 hover:border-border hover:bg-accent/50"
      }`}
    >
      {/* icon chip */}
      <span
        className="flex items-center justify-center size-8 rounded-lg shrink-0"
        style={{ backgroundColor: pipelineTint(color) }}
        aria-hidden="true"
      >
        <Icon className="size-4" style={{ color }} />
      </span>

      {/* text */}
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">{tpl.name}</span>
          {tpl.isBuiltin === 1 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 shrink-0">
              Bawaan
            </span>
          )}
        </span>
        <span className="text-xs text-muted-foreground">
          {stages} tahap · {fields} field
        </span>
      </span>

      {/* selected checkmark */}
      {selected && (
        <Check className="size-4 text-primary shrink-0" aria-hidden="true" />
      )}

      {/* delete button for non-builtin */}
      {tpl.isBuiltin !== 1 && (
        <span
          role="button"
          tabIndex={0}
          aria-label={`Hapus template ${tpl.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }
          }}
          className="ml-1 flex items-center justify-center size-6 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
        >
          {deleting ? (
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          ) : (
            <X className="size-3" aria-hidden="true" />
          )}
        </span>
      )}
    </button>
  );
}

export function TemplatePickerDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (pipeline: Pipeline) => void;
}) {
  const { data: templates, isLoading } = usePipelineTemplates();
  const { apply, remove } = useTemplateMutations();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const selectedTemplate = templates?.find((t) => t.id === selectedId) ?? null;

  const handleSelect = (tpl: PipelineTemplate) => {
    setSelectedId(tpl.id);
    if (!newName || newName === templates?.find((t) => t.id === selectedId)?.name) {
      setNewName(tpl.name);
    }
  };

  const handleCreate = async () => {
    if (!selectedId || !newName.trim()) return;
    try {
      const pipeline = await apply.mutateAsync({ id: selectedId, name: newName.trim() }) as Pipeline;
      toast.success(`Pipeline "${pipeline.name}" dibuat dari template`);
      onCreated(pipeline);
      // reset
      setSelectedId(null);
      setNewName("");
    } catch {
      toast.error("Gagal membuat pipeline dari template");
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Hapus template "${name}"?`)) return;
    setDeletingId(id);
    try {
      await remove.mutateAsync(id);
      toast.success(`Template "${name}" dihapus`);
      if (selectedId === id) {
        setSelectedId(null);
        setNewName("");
      }
    } catch {
      toast.error("Gagal menghapus template");
    } finally {
      setDeletingId(null);
    }
  };

  const handleClose = () => {
    if (apply.isPending) return;
    setSelectedId(null);
    setNewName("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-lg dialog-w max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <LayoutTemplate className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-base">Buat dari Template</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pilih template untuk membuat pipeline baru
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Template list */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-2">Template Tersedia</legend>
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : !templates?.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Belum ada template tersedia.
              </p>
            ) : (
              <div className="space-y-1.5" role="listbox" aria-label="Daftar template pipeline">
                {templates.map((tpl) => (
                  <TemplateRow
                    key={tpl.id}
                    tpl={tpl}
                    selected={selectedId === tpl.id}
                    onSelect={() => handleSelect(tpl)}
                    onDelete={() => handleDelete(tpl.id, tpl.name)}
                    deleting={deletingId === tpl.id}
                  />
                ))}
              </div>
            )}
          </fieldset>

          {/* New pipeline name */}
          <div className="space-y-1.5">
            <label htmlFor="template-pipeline-name" className="text-sm font-medium">
              Nama Pipeline Baru <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <Input
              id="template-pipeline-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={selectedTemplate ? selectedTemplate.name : "mis. Pipeline Saya"}
              disabled={!selectedId}
              onKeyDown={(e) => {
                if (e.key === "Enter" && selectedId && newName.trim() && !apply.isPending) {
                  handleCreate();
                }
              }}
              aria-describedby={!selectedId ? "template-name-hint" : undefined}
            />
            {!selectedId && (
              <p id="template-name-hint" className="text-xs text-muted-foreground">
                Pilih template terlebih dahulu
              </p>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-5 pt-3 border-t flex justify-end gap-2 shrink-0">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClose}
            disabled={apply.isPending}
          >
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleCreate}
            loading={apply.isPending}
            disabled={!selectedId || !newName.trim() || apply.isPending}
          >
            Buat Pipeline
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
