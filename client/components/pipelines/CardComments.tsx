// SoC: typed comment composer + timeline for a pipeline card.
// Type metadata from shared/cardCommentTypes; attachments rendered via AttachmentGallery.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Phone, MessageSquare, MapPin, Activity, Paperclip, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AttachmentGallery } from "./AttachmentGallery";
import { CARD_COMMENT_TYPES, cardCommentType } from "@shared/cardCommentTypes";
import type { CardDetail } from "@/hooks/usePipelines";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText, Phone, MessageSquare, MapPin, Activity,
};

function TypeIcon({ type }: { type?: string }) {
  const meta = cardCommentType(type);
  const Cmp = ICONS[meta.icon] ?? FileText;
  return <Cmp className={`size-3.5 shrink-0 ${meta.color}`} />;
}

export function CardComments({ comments, canComment, onSend, sending }: {
  comments: CardDetail["comments"];
  canComment: boolean;
  onSend: (args: { body: string; type: string; files: File[] }) => Promise<void>;
  sending: boolean;
}): JSX.Element {
  const [type, setType] = useState("note");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!body.trim() && files.length === 0) { toast.error("Komentar atau lampiran wajib diisi"); return; }
    try {
      await onSend({ body: body.trim(), type, files });
      setBody(""); setFiles([]); setType("note");
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengirim");
    }
  };

  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Komentar</h4>

      <div className="space-y-3">
        {comments.map((c) => {
          const meta = cardCommentType(c.type);
          return (
            <div key={c.id} className="rounded-lg border border-border/40 bg-muted/30 p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
                <TypeIcon type={c.type} />
                <span className="font-medium text-foreground">{meta.label}</span>
                <span>·</span>
                <span>{c.authorName ?? "Pengguna"}</span>
                <span>·</span>
                <span>{new Date(c.createdAt).toLocaleString("id-ID")}</span>
              </div>
              {c.body && c.body !== "(lampiran)" && <p className="text-sm whitespace-pre-wrap">{c.body}</p>}
              {c.photoPath && (
                <a href={`/api/pipelines/cards/comments/${c.id}/photo`} target="_blank" rel="noreferrer" className="mt-1 block">
                  <img src={`/api/pipelines/cards/comments/${c.id}/photo`} alt="Foto" loading="lazy"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    className="max-h-40 rounded border border-border/50" />
                </a>
              )}
              {c.attachments && c.attachments.length > 0 && (
                <div className="mt-1.5"><AttachmentGallery items={c.attachments} /></div>
              )}
            </div>
          );
        })}
        {comments.length === 0 && <p className="text-xs text-muted-foreground">Belum ada komentar.</p>}
      </div>

      {canComment && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-1.5">
            <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipe entri"
              className="h-9 shrink-0 rounded-md border border-input bg-transparent px-2 text-xs">
              {CARD_COMMENT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <Input inputSize="sm" value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="Tulis catatan…" aria-label="Isi komentar" />
            <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} aria-label="Lampirkan">
              <Paperclip className="size-4" />
            </Button>
            <Button type="button" size="sm" loading={sending} onClick={submit}>
              <Send className="size-4 mr-1" /> Kirim
            </Button>
            <input ref={inputRef} type="file" multiple className="hidden"
              accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.zip"
              onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          </div>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f, i) => (
                <span key={i} className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-2xs">
                  {f.name}
                  <button aria-label="Buang" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    <X className="size-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
