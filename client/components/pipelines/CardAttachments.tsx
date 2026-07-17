import { useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCardAttachments, useUploadAttachments, useDeleteAttachment, type CardAttachment } from "@/hooks/usePipelines";
import { AttachmentGallery } from "./AttachmentGallery";

function currentUserId(): number {
  try { return JSON.parse(localStorage.getItem("ftth_user") || "{}")?.id ?? 0; } catch { return 0; }
}


export function CardAttachments({ cardId, writable, isAdmin }: {
  cardId: number; writable: boolean; isAdmin: boolean;
}): JSX.Element {
  const { data: items = [], isLoading } = useCardAttachments(cardId);
  const upload = useUploadAttachments(cardId);
  const del = useDeleteAttachment(cardId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const me = currentUserId();

  const doUpload = (files: FileList | null) => {
    if (!files || !files.length) return;
    upload.mutate(Array.from(files), {
      onError: (e: any) => toast.error(e?.message || "Upload gagal"),
      onSuccess: () => toast.success("File terunggah"),
    });
  };

  const canDelete = (a: CardAttachment) => writable && (a.uploadedBy === me || isAdmin);

  const doDelete = (id: number) =>
    del.mutate(id, { onError: (e: any) => toast.error(e?.message || "Gagal menghapus") });

  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
        <Paperclip className="size-3.5" /> Lampiran
      </h4>

      {writable && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); doUpload(e.dataTransfer.files); }}
          className={`mb-3 rounded-lg border border-dashed px-4 py-3 text-center text-xs transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-border/60"}`}
        >
          <input ref={inputRef} type="file" multiple className="hidden"
            accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.zip"
            onChange={(e) => { doUpload(e.target.files); e.target.value = ""; }} />
          <Button type="button" variant="ghost" size="sm" loading={upload.isPending}
            onClick={() => inputRef.current?.click()}>
            <Upload className="size-4 mr-1.5" /> Pilih file atau tarik ke sini
          </Button>
          <p className="mt-1 text-muted-foreground">Maks 25 MB · jpg, png, webp, pdf, docx, xlsx, zip</p>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Memuat…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Belum ada lampiran.</p>
      ) : (
        <AttachmentGallery items={items} canDelete={canDelete} onDelete={doDelete} />
      )}
    </section>
  );
}
