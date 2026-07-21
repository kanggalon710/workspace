import { useState } from "react";
import { useLocation } from "wouter";
import { usePipelines, usePipelineMutations, useTemplateMutations } from "@/hooks/usePipelines";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useAuth } from "@/context/AuthContext";
import { IconPicker, resolvePipelineIcon, pipelineTint, PIPELINE_COLOR_SWATCHES, PIPELINE_DEFAULT_COLOR } from "@/components/pipelines/pipelineIcon";
import { PipelineSettingsDialog } from "@/components/pipelines/PipelineSettingsDialog";
import { TemplatePickerDialog } from "@/components/pipelines/TemplatePickerDialog";
import type { Pipeline } from "@shared/schema";
import { Layers, Plus, MoreVertical, ArchiveRestore, LayoutTemplate, Bookmark } from "lucide-react";
import { toast } from "sonner";

/** Resolved icon chip for a pipeline card - hoisted to module scope to avoid re-creation per render. */
function CardIcon({ p }: { p: Pipeline }) {
  const Icon = resolvePipelineIcon(p.icon);
  return (
    <span
      className="flex items-center justify-center size-6 rounded-md shrink-0"
      style={{ backgroundColor: pipelineTint(p.color) }}
      aria-hidden="true"
    >
      <Icon className="size-3.5" style={{ color: p.color ?? PIPELINE_DEFAULT_COLOR }} />
    </span>
  );
}

export default function PipelinesPage() {
  const [, navigate] = useLocation();
  const { canWrite } = useAuth();
  const writable = canWrite("pipelines");

  // --- archived toggle ---
  const [showArchived, setShowArchived] = useState(false);
  const { data: pipelines, isLoading } = usePipelines(showArchived);

  const { createPipeline, updatePipeline } = usePipelineMutations();
  const { saveAs } = useTemplateMutations();

  // --- create dialog state ---
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createIcon, setCreateIcon] = useState("layers");
  const [createColor, setCreateColor] = useState(PIPELINE_DEFAULT_COLOR);

  const resetCreate = () => {
    setCreateName("");
    setCreateDesc("");
    setCreateIcon("layers");
    setCreateColor(PIPELINE_DEFAULT_COLOR);
  };

  const onCreate = async () => {
    if (!createName.trim()) return;
    try {
      const p: any = await createPipeline.mutateAsync({
        name: createName.trim(),
        description: createDesc.trim() || null,
        icon: createIcon,
        color: createColor,
      });
      toast.success("Pipeline dibuat");
      setShowCreate(false);
      resetCreate();
      if (p?.id) navigate(`/pipelines/${p.id}`);
    } catch {
      toast.error("Gagal membuat pipeline");
    }
  };

  // --- template picker dialog ---
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  // --- per-card settings dialog ---
  const [settingsFor, setSettingsFor] = useState<Pipeline | null>(null);

  // --- per-card restore guard ---
  const [restoringId, setRestoringId] = useState<number | null>(null);

  // --- save-as-template per card ---
  const [savingTemplateId, setSavingTemplateId] = useState<number | null>(null);

  const handleSaveAsTemplate = async (p: Pipeline, e: React.MouseEvent) => {
    e.stopPropagation();
    const name = window.prompt(`Simpan "${p.name}" sebagai template\n\nNama template:`, p.name);
    if (!name?.trim()) return;
    setSavingTemplateId(p.id);
    try {
      await saveAs.mutateAsync({ fromPipelineId: p.id, name: name.trim() });
      toast.success(`Template "${name.trim()}" berhasil disimpan`);
    } catch {
      toast.error("Gagal menyimpan template");
    } finally {
      setSavingTemplateId(null);
    }
  };

  const handleRestore = async (p: Pipeline, e: React.MouseEvent) => {
    e.stopPropagation();
    setRestoringId(p.id);
    try {
      await updatePipeline.mutateAsync({ id: p.id, isArchived: 0 });
      toast.success(`Pipeline "${p.name}" dipulihkan`);
    } catch {
      toast.error("Gagal memulihkan pipeline");
    } finally {
      setRestoringId(null);
    }
  };

  // Derived icon component for the create-dialog preview chip
  const CreatePreviewIcon = resolvePipelineIcon(createIcon);

  return (
    <PageContainer>
      <PageHeader
        icon={Layers}
        title="Pipelines"
        description="Kanban board kustom per mitra"
        accent="primary"
        actions={
          <div className="flex items-center gap-2">
            {/* Archive / Active toggle */}
            <Button
              type="button"
              variant={showArchived ? "outline-primary" : "ghost"}
              size="sm"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Aktif" : "Arsip"}
            </Button>

            {/* Create from template - only in active view */}
            {writable && !showArchived && (
              <Button
                type="button"
                variant="outline-primary"
                leftIcon={<LayoutTemplate className="size-4" />}
                onClick={() => setShowTemplatePicker(true)}
              >
                Buat dari Template
              </Button>
            )}

            {/* Create blank - only in active view */}
            {writable && !showArchived && (
              <Button
                type="button"
                leftIcon={<Plus className="size-4" />}
                onClick={() => setShowCreate(true)}
              >
                Pipeline Baru
              </Button>
            )}
          </div>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="h-28 animate-pulse" />
          ))}
        </div>
      ) : !pipelines?.length ? (
        <EmptyState
          icon={Layers}
          title={showArchived ? "Tidak ada pipeline diarsipkan" : "Belum ada pipeline"}
          description={
            showArchived
              ? "Belum ada pipeline yang diarsipkan."
              : "Buat pipeline pertama untuk mulai."
          }
          action={
            writable && !showArchived
              ? { label: "Pipeline Baru", onClick: () => setShowCreate(true) }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pipelines.map((p) => {
            const isArchived = p.isArchived === 1;
            const handleOpen = () => navigate(`/pipelines/${p.id}`);
            return (
              <Card
                key={p.id}
                className={`p-4 transition group ${isArchived ? "opacity-70" : "cursor-pointer hover:shadow-elev-md"}`}
                role={isArchived ? undefined : "button"}
                tabIndex={isArchived ? undefined : 0}
                aria-label={isArchived ? undefined : `Buka pipeline ${p.name}`}
                onClick={isArchived ? undefined : handleOpen}
                onKeyDown={
                  isArchived
                    ? undefined
                    : (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          if (e.key === " ") e.preventDefault();
                          handleOpen();
                        }
                      }
                }
              >
                <div className="flex items-center gap-2">
                  <CardIcon p={p} />
                  <span className="font-semibold truncate flex-1">{p.name}</span>

                  {/* Badges */}
                  {isArchived ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                      Arsip
                    </span>
                  ) : p.restricted ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 shrink-0">
                      Terbatas
                    </span>
                  ) : null}

                  {/* Kebab menu - active pipelines; for archived: Pulihkan button */}
                  {isArchived ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      leftIcon={<ArchiveRestore className="size-3.5" />}
                      loading={restoringId === p.id}
                      disabled={restoringId !== null}
                      onClick={(e) => handleRestore(p, e)}
                      aria-label={`Pulihkan pipeline ${p.name}`}
                    >
                      Pulihkan
                    </Button>
                  ) : writable ? (
                    <div className="ml-auto flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      {/* Save as template */}
                      <button
                        type="button"
                        aria-label={`Simpan pipeline ${p.name} sebagai template`}
                        className="flex items-center justify-center size-6 rounded hover:bg-accent transition-colors"
                        disabled={savingTemplateId === p.id}
                        onClick={(e) => handleSaveAsTemplate(p as Pipeline, e)}
                      >
                        {savingTemplateId === p.id ? (
                          <span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" aria-hidden="true" />
                        ) : (
                          <Bookmark className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        )}
                      </button>

                      {/* Pipeline settings */}
                      <button
                        type="button"
                        aria-label={`Pengaturan pipeline ${p.name}`}
                        className="flex items-center justify-center size-6 rounded hover:bg-accent transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSettingsFor(p as Pipeline);
                        }}
                      >
                        <MoreVertical className="size-4 text-muted-foreground" aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                </div>

                {p.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {p.description}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* -- Create dialog -- */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40"
          onClick={() => { setShowCreate(false); resetCreate(); }}
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-pipeline-heading"
            className="p-5 w-[min(32rem,calc(100vw-2rem))] max-h-[90vh] overflow-y-auto space-y-4"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Escape") { setShowCreate(false); resetCreate(); } }}
          >
            <h3 id="create-pipeline-heading" className="font-semibold text-base">Pipeline Baru</h3>

            {/* Name */}
            <div className="space-y-1">
              <label htmlFor="create-pipeline-name" className="text-sm font-medium">
                Nama Pipeline <span className="text-destructive">*</span>
              </label>
              <Input
                id="create-pipeline-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="mis. Sales Pipeline"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !createPipeline.isPending) onCreate();
                }}
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label htmlFor="create-pipeline-desc" className="text-sm font-medium">
                Deskripsi
                <span className="ml-1 text-xs text-muted-foreground font-normal">(opsional)</span>
              </label>
              <textarea
                id="create-pipeline-desc"
                value={createDesc}
                onChange={(e) => setCreateDesc(e.target.value)}
                placeholder="Deskripsi singkat pipeline..."
                rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>

            {/* Icon picker */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Ikon</p>
              <IconPicker value={createIcon} onChange={setCreateIcon} color={createColor} />
            </div>

            {/* Color picker */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Warna</p>
              <div className="flex items-center gap-2 flex-wrap">
                {PIPELINE_COLOR_SWATCHES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-label={`Warna ${s}`}
                    onClick={() => setCreateColor(s)}
                    className={`size-7 rounded-full border-2 transition-all ${
                      createColor.toLowerCase() === s.toLowerCase()
                        ? "ring-2 ring-offset-1 ring-foreground/40 border-background"
                        : "border-transparent hover:scale-110"
                    }`}
                    style={{ backgroundColor: s }}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Warna kustom"
                  value={createColor}
                  onChange={(e) => setCreateColor(e.target.value)}
                  className="size-7 rounded-full cursor-pointer border border-border/60"
                  title="Warna kustom"
                />
                {/* Preview */}
                <span
                  className="ml-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: pipelineTint(createColor), color: createColor }}
                >
                  <CreatePreviewIcon className="size-3" />
                  Preview
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => { setShowCreate(false); resetCreate(); }}
              >
                Batal
              </Button>
              <Button
                type="button"
                onClick={onCreate}
                loading={createPipeline.isPending}
                disabled={!createName.trim()}
              >
                Buat
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* -- Template picker dialog -- */}
      <TemplatePickerDialog
        open={showTemplatePicker}
        onClose={() => setShowTemplatePicker(false)}
        onCreated={(pipeline) => {
          setShowTemplatePicker(false);
          if (pipeline?.id) navigate(`/pipelines/${pipeline.id}`);
        }}
      />

      {/* -- Single PipelineSettingsDialog instance (one per card kebab) -- */}
      {settingsFor && (
        <PipelineSettingsDialog
          pipeline={settingsFor}
          open
          onClose={() => setSettingsFor(null)}
          onDeleted={() => setSettingsFor(null)}
        />
      )}
    </PageContainer>
  );
}
