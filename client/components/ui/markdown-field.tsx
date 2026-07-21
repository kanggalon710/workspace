/** MarkdownField - editor teks ringan dengan toolbar (bold/italic/list/heading/link)
 *  + toggle Preview, tanpa dependency berat (Tiptap). Menyimpan via onSave saat blur
 *  atau saat berpindah ke Preview. Menjawab BUG-002: deskripsi kartu tugas butuh
 *  rich text terstruktur (heading, list, bold, link) untuk instruksi kerja. */
import { useEffect, useRef, useState } from "react";
import { Bold, Italic, List, Heading, Link2, Eye, Pencil } from "lucide-react";
import { miniMarkdown } from "@/lib/miniMarkdown";

interface Props {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  onSave: (text: string) => void;
}

export function MarkdownField({ value, disabled, placeholder, rows = 4, onSave }: Props) {
  const [draft, setDraft] = useState(value ?? "");
  const [preview, setPreview] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const savedRef = useRef(value ?? "");

  // Re-sync HANYA saat value berubah dari luar (kartu lain dimuat ke modal yang sama),
  // bukan echo dari save kita sendiri (value akan menyusul savedRef setelah refetch).
  useEffect(() => {
    if ((value ?? "") !== savedRef.current) { setDraft(value ?? ""); savedRef.current = value ?? ""; setPreview(false); }
  }, [value]);

  const save = () => {
    if (draft !== savedRef.current) { savedRef.current = draft; onSave(draft); }
  };

  /** Sisipkan/wrap sintaks markdown pada seleksi aktif. */
  const wrap = (before: string, after = before, blockPrefix?: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const sel = draft.slice(start, end);
    let next: string; let caret: number;
    if (blockPrefix != null) {
      // prefix per-baris (list / heading)
      const lineStart = draft.lastIndexOf("\n", start - 1) + 1;
      next = draft.slice(0, lineStart) + blockPrefix + draft.slice(lineStart);
      caret = end + blockPrefix.length;
    } else {
      next = draft.slice(0, start) + before + sel + after + draft.slice(end);
      caret = start + before.length + sel.length + after.length;
    }
    setDraft(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret); });
  };

  const btn = "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-40";

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-0.5 border-b px-1.5 py-1">
        <button type="button" className={btn} disabled={disabled || preview} aria-label="Tebal" title="Tebal" onClick={() => wrap("**")}><Bold className="size-3.5" /></button>
        <button type="button" className={btn} disabled={disabled || preview} aria-label="Miring" title="Miring" onClick={() => wrap("*")}><Italic className="size-3.5" /></button>
        <button type="button" className={btn} disabled={disabled || preview} aria-label="Judul" title="Judul" onClick={() => wrap("", "", "## ")}><Heading className="size-3.5" /></button>
        <button type="button" className={btn} disabled={disabled || preview} aria-label="Daftar" title="Daftar" onClick={() => wrap("", "", "- ")}><List className="size-3.5" /></button>
        <button type="button" className={btn} disabled={disabled || preview} aria-label="Tautan" title="Tautan" onClick={() => wrap("[", "](https://)")}><Link2 className="size-3.5" /></button>
        <span className="flex-1" />
        <button type="button" className={`${btn} px-2 w-auto gap-1 text-[10px]`} disabled={disabled} aria-label={preview ? "Edit" : "Preview"}
          onClick={() => { if (!preview) save(); setPreview((v) => !v); }}>
          {preview ? <><Pencil className="size-3" /> Edit</> : <><Eye className="size-3" /> Preview</>}
        </button>
      </div>
      {preview ? (
        <div
          className="prose prose-sm max-w-none px-3 py-2 text-sm [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:text-base [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-bold [&_h3]:text-xs [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: miniMarkdown(draft || "*Belum ada deskripsi*") }}
        />
      ) : (
        <textarea
          ref={ref}
          value={draft}
          disabled={disabled}
          placeholder={placeholder ?? "Deskripsi / catatan - dukung markdown: **tebal** *miring* `kode` # judul - daftar [teks](https://…)"}
          rows={rows}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          className="w-full resize-y bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-60"
        />
      )}
    </div>
  );
}
