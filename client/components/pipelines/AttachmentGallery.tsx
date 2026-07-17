// SoC: presentational image-grid + file-chip list for card attachments.
// Reused by CardAttachments (card-level) and CardComments (per-entry).
import { FileText, FileSpreadsheet, FileArchive, Download, Trash2 } from "lucide-react";
import { formatBytes } from "@/lib/imageCompress";
import type { CardAttachment } from "@/hooks/usePipelines";

function FileIcon({ name }: { name: string }) {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "xlsx") return <FileSpreadsheet className="size-5 text-success" />;
  if (ext === "zip") return <FileArchive className="size-5 text-warning" />;
  return <FileText className="size-5 text-muted-foreground" />;
}

export function AttachmentGallery({ items, canDelete, onDelete }: {
  items: CardAttachment[];
  canDelete?: (a: CardAttachment) => boolean;
  onDelete?: (id: number) => void;
}): JSX.Element | null {
  if (!items.length) return null;
  const images = items.filter((a) => a.kind === "image");
  const files = items.filter((a) => a.kind !== "image");
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((a) => (
            <div key={a.id} className="group relative">
              <a href={`/api/pipelines/attachments/${a.id}/raw`} target="_blank" rel="noreferrer">
                <img src={`/api/pipelines/attachments/${a.id}/raw`} alt={a.fileName}
                  className="aspect-square w-full rounded-md object-cover border border-border/40" />
              </a>
              {canDelete?.(a) && onDelete && (
                <button aria-label="Hapus" onClick={() => onDelete(a.id)}
                  className="absolute top-1 right-1 rounded bg-background/80 p-1 opacity-0 group-hover:opacity-100">
                  <Trash2 className="size-3.5 text-destructive" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {files.map((a) => (
        <div key={a.id} className="flex items-center gap-2 rounded-md border border-border/40 px-2.5 py-1.5">
          <FileIcon name={a.fileName} />
          <span className="flex-1 min-w-0 truncate text-xs">{a.fileName}</span>
          <span className="text-2xs text-muted-foreground shrink-0">{formatBytes(a.sizeBytes)}</span>
          <a href={`/api/pipelines/attachments/${a.id}/raw?download=1`}
            className="text-muted-foreground hover:text-foreground" aria-label="Unduh">
            <Download className="size-4" />
          </a>
          {canDelete?.(a) && onDelete && (
            <button aria-label="Hapus" onClick={() => onDelete(a.id)}
              className="text-muted-foreground hover:text-destructive">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
