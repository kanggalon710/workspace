import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormSection } from "@/components/ui/form-field";
import { usePipelineMutations } from "@/hooks/usePipelines";
import { IconPicker, pipelineTint, PIPELINE_COLOR_SWATCHES, PIPELINE_DEFAULT_COLOR } from "@/components/pipelines/pipelineIcon";
import type { Pipeline } from "@shared/schema";
import { Settings2, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function PipelineSettingsDialog({
  pipeline,
  open,
  onClose,
  onDeleted,
}: {
  pipeline: Pipeline;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const m = usePipelineMutations(pipeline.id);

  const busy = m.updatePipeline.isPending || m.archivePipeline.isPending || m.deletePipeline.isPending;

  const [name, setName] = useState(pipeline.name);
  const [description, setDescription] = useState(pipeline.description ?? "");
  const [icon, setIcon] = useState(pipeline.icon ?? "layers");
  const [color, setColor] = useState(pipeline.color ?? PIPELINE_DEFAULT_COLOR);
  const [confirmText, setConfirmText] = useState("");

  // Re-seed state whenever the pipeline prop changes or the dialog opens
  useEffect(() => {
    if (open) {
      setName(pipeline.name);
      setDescription(pipeline.description ?? "");
      setIcon(pipeline.icon ?? "layers");
      setColor(pipeline.color ?? PIPELINE_DEFAULT_COLOR);
      setConfirmText("");
    }
  }, [open, pipeline]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Nama pipeline tidak boleh kosong");
      return;
    }
    try {
      await m.updatePipeline.mutateAsync({
        id: pipeline.id,
        name: name.trim(),
        description: description.trim() || null,
        icon,
        color,
      });
      toast.success("Pipeline berhasil diperbarui");
      onClose();
    } catch {
      toast.error("Gagal memperbarui pipeline");
    }
  };

  const dismissAfterRemoval = (msg: string) => { toast.success(msg); onClose(); onDeleted?.(); };

  const handleArchive = async () => {
    try {
      await m.archivePipeline.mutateAsync(pipeline.id);
      dismissAfterRemoval(`Pipeline "${pipeline.name}" diarsipkan`);
    } catch {
      toast.error("Gagal mengarsipkan pipeline");
    }
  };

  const handleDelete = async () => {
    try {
      await m.deletePipeline.mutateAsync(pipeline.id);
      dismissAfterRemoval(`Pipeline "${pipeline.name}" dihapus permanen`);
    } catch {
      toast.error("Gagal menghapus pipeline");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-lg dialog-w max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: pipelineTint(color) }}
            >
              <Settings2 className="h-4 w-4" style={{ color }} />
            </div>
            <div>
              <DialogTitle className="text-base">Pengaturan Pipeline</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Edit identitas, ikon, dan warna pipeline
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSave}>
            {/* Identity section */}
            <div className="px-6 py-5 space-y-4">
              <FormSection
                title="Identitas"
                description="Nama dan deskripsi yang muncul di daftar pipeline"
              >
                <FormField label="Nama Pipeline" htmlFor="pipeline-name" required>
                  <Input
                    id="pipeline-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="mis. Sales Pipeline"
                  />
                </FormField>

                <FormField
                  label="Deskripsi"
                  htmlFor="pipeline-description"
                  hint="Opsional - jelaskan tujuan pipeline ini"
                >
                  <textarea
                    id="pipeline-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Deskripsi singkat pipeline..."
                    rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  />
                </FormField>
              </FormSection>
            </div>

            {/* Icon section */}
            <div className="px-6 pb-5 border-t pt-5">
              <FormSection
                title="Ikon"
                description="Pilih ikon yang mewakili pipeline"
              >
                <IconPicker value={icon} onChange={setIcon} color={color} />
              </FormSection>
            </div>

            {/* Color section */}
            <div className="px-6 pb-5 border-t pt-5">
              <FormSection
                title="Warna"
                description="Warna aksen yang ditampilkan di header dan ikon"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {PIPELINE_COLOR_SWATCHES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-label={`Warna ${s}`}
                      onClick={() => setColor(s)}
                      className={`size-7 rounded-full border-2 transition-all ${
                        color.toLowerCase() === s.toLowerCase()
                          ? "ring-2 ring-offset-1 ring-foreground/40 border-background"
                          : "border-transparent hover:scale-110"
                      }`}
                      style={{ backgroundColor: s }}
                    />
                  ))}
                  <input
                    type="color"
                    aria-label="Warna kustom"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="size-7 rounded-full cursor-pointer border border-border/60"
                    title="Warna kustom"
                  />
                  {/* Preview chip */}
                  <span
                    className="ml-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: pipelineTint(color), color }}
                  >
                    Preview
                  </span>
                </div>
              </FormSection>
            </div>

            {/* Save button */}
            <div className="px-6 pb-5 flex justify-end">
              <Button
                type="submit"
                loading={m.updatePipeline.isPending}
                disabled={busy || !name.trim()}
              >
                Simpan Perubahan
              </Button>
            </div>
          </form>

          {/* Danger zone */}
          <div className="px-6 pb-6 border-t pt-5">
            <FormSection
              title="Zona Berbahaya"
              description="Tindakan berikut tidak dapat dibatalkan dengan mudah"
            >
              {/* Archive */}
              <div className="rounded-lg border border-border/60 p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium">Arsipkan Pipeline</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Pipeline disembunyikan dari daftar aktif tetapi data tetap tersimpan. Bisa dipulihkan kapan saja.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<Archive className="h-3.5 w-3.5" />}
                  loading={m.archivePipeline.isPending}
                  disabled={busy}
                  onClick={handleArchive}
                >
                  Arsipkan Pipeline
                </Button>
              </div>

              {/* Permanent delete */}
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium text-destructive">Hapus Permanen</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Semua stage, kartu, field, dan data pipeline akan dihapus secara permanen. Tindakan ini{" "}
                    <span className="font-semibold text-destructive">tidak dapat dipulihkan</span>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="delete-confirm"
                    className="text-sm font-medium leading-none"
                  >
                    Ketik{" "}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs font-semibold">
                      {pipeline.name}
                    </code>{" "}
                    untuk mengonfirmasi
                  </label>
                  <Input
                    id="delete-confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={pipeline.name}
                    className="border-destructive/40 focus-visible:ring-destructive/40"
                  />
                </div>

                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                  disabled={busy || confirmText !== pipeline.name}
                  loading={m.deletePipeline.isPending}
                  onClick={handleDelete}
                >
                  Hapus Permanen
                </Button>
              </div>
            </FormSection>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
