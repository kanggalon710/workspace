/** Teamspace Fase 2 - Dokumen & File tim (FR-9xx): folder tree via breadcrumb,
 *  upload file (drag & drop / picker), dokumen markdown dengan preview. */
import { useMemo, useRef, useState } from "react";
import { useTeamDocs, useDocsMutations } from "@/hooks/useTeamspace";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AssigneePicker } from "@/components/pipelines/AssigneePicker";
import { FolderClosed, FolderPlus, FileText, FilePlus2, Upload, ChevronRight, Home, Download, Archive, Lock, Trash2, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { miniMarkdown } from "@/lib/miniMarkdown";
import type { TeamDocument, TeamFolder } from "@shared/schema";

interface Props {
  teamId: number;
  canManage: boolean;
  active: boolean;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocsPanel({ teamId, canManage, active }: Props) {
  const { user } = useAuth();
  const { data, isLoading } = useTeamDocs(teamId, active);
  const m = useDocsMutations(teamId);

  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const folders = data?.folders ?? [];
  const breadcrumb = useMemo(() => {
    const chain: TeamFolder[] = [];
    let cur = folders.find((f) => f.id === currentFolderId);
    while (cur) { chain.unshift(cur); cur = folders.find((f) => f.id === cur!.parentFolderId); }
    return chain;
  }, [folders, currentFolderId]);

  const subFolders = folders.filter((f) => (f.parentFolderId ?? null) === currentFolderId);
  const docs = (data?.documents ?? []).filter((d) => (d.folderId ?? null) === currentFolderId);
  const files = (data?.files ?? []).filter((f) => (f.folderId ?? null) === currentFolderId);
  const empty = subFolders.length === 0 && docs.length === 0 && files.length === 0;

  const upload = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    try {
      await m.uploadFiles.mutateAsync({ files: arr, folderId: currentFolderId });
      toast.success(`${arr.length} file diunggah`);
    } catch (e: any) {
      toast.error(e?.message || "Upload gagal");
    }
  };

  // -- Folder baru --
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [folderName, setFolderName] = useState("");
  const createFolder = async () => {
    if (!folderName.trim()) return;
    try {
      await m.createFolder.mutateAsync({ name: folderName.trim(), parentFolderId: currentFolderId });
      setFolderName(""); setNewFolderMode(false);
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat folder");
    }
  };

  // -- Editor dokumen --
  const [docOpen, setDocOpen] = useState<TeamDocument | "new" | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docConfidential, setDocConfidential] = useState(false);
  const [docRecipients, setDocRecipients] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);

  const openNewDoc = () => {
    setDocOpen("new"); setDocTitle(""); setDocContent(""); setDocConfidential(false); setDocRecipients([]); setPreview(false);
  };
  const openDoc = (d: TeamDocument & { recipientIds?: number[] }) => {
    setDocOpen(d); setDocTitle(d.title); setDocContent(d.content ?? "");
    setDocConfidential(d.isConfidential === 1);
    setDocRecipients((d.recipientIds ?? []).map(String));
    setPreview(true);   // buka dalam mode baca dulu
  };
  const canEditDoc = docOpen !== null && docOpen !== "new"
    ? (docOpen.createdBy === user?.id || canManage) : true;

  const saveDoc = async () => {
    if (!docTitle.trim()) return;
    const payload = {
      title: docTitle.trim(), content: docContent,
      isConfidential: docConfidential,
      recipientIds: docRecipients.map(Number),
      folderId: currentFolderId,
    };
    try {
      if (docOpen === "new") await m.createDocument.mutateAsync(payload);
      else if (docOpen) await m.updateDocument.mutateAsync({ id: docOpen.id, ...payload });
      toast.success("Dokumen disimpan");
      setDocOpen(null);
    } catch (e: any) {
      toast.error(e?.message || "Gagal menyimpan dokumen");
    }
  };

  return (
    <div
      className={`space-y-3 rounded-xl ${dragOver ? "ring-2 ring-primary ring-offset-2" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); }}
    >
      {/* Toolbar + breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex min-w-0 items-center gap-1 text-xs" aria-label="Breadcrumb folder">
          <button type="button" onClick={() => setCurrentFolderId(null)}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${currentFolderId == null ? "font-bold" : "text-muted-foreground hover:bg-muted"}`}>
            <Home className="size-3.5" /> Berkas
          </button>
          {breadcrumb.map((f) => (
            <span key={f.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
              <button type="button" onClick={() => setCurrentFolderId(f.id)}
                className={`truncate rounded px-1.5 py-0.5 ${f.id === currentFolderId ? "font-bold" : "text-muted-foreground hover:bg-muted"}`}>
                {f.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) upload(e.target.files); e.target.value = ""; }} />
          <Button type="button" variant="ghost" size="xs" leftIcon={<FolderPlus className="size-3.5" />} onClick={() => setNewFolderMode(true)}>Folder</Button>
          <Button type="button" variant="outline-primary" size="xs" leftIcon={<FilePlus2 className="size-3.5" />} onClick={openNewDoc}>Dokumen</Button>
          <Button type="button" size="xs" leftIcon={<Upload className="size-3.5" />} loading={m.uploadFiles.isPending} onClick={() => fileInputRef.current?.click()}>Upload</Button>
        </div>
      </div>

      {newFolderMode && (
        <div className="flex gap-1.5">
          <Input inputSize="sm" placeholder="Nama folder baru" value={folderName} autoFocus
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setNewFolderMode(false); }} />
          <Button type="button" size="sm" onClick={createFolder} loading={m.createFolder.isPending} disabled={!folderName.trim()}>Buat</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setNewFolderMode(false)}>Batal</Button>
        </div>
      )}

      {/* Isi folder */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : empty ? (
        <EmptyState
          icon={FolderClosed}
          title="Folder ini kosong"
          description="Seret & lepas file ke sini, atau buat dokumen baru dengan editor bawaan."
        />
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {subFolders.map((f) => (
            <div key={`folder-${f.id}`} className="group flex items-center gap-3 px-3.5 py-2.5">
              <FolderClosed className="size-4.5 shrink-0 text-warning" />
              <button type="button" className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline" onClick={() => setCurrentFolderId(f.id)}>
                {f.name}
              </button>
              {(canManage || f.createdBy === user?.id) && (
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Hapus folder"
                  className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                  onClick={() => m.deleteFolder.mutate(f.id, {
                    onError: (e: any) => toast.error(e?.message || "Gagal menghapus folder"),
                  })}>
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
          {docs.map((d) => (
            <div key={`doc-${d.id}`} className="group flex items-center gap-3 px-3.5 py-2.5">
              <FileText className="size-4.5 shrink-0 text-primary" />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openDoc(d)}>
                <p className="truncate text-sm font-medium hover:underline">
                  {d.title}
                  {d.isConfidential === 1 && <Lock className="ml-1 inline size-3 text-warning" aria-label="Rahasia" />}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Dokumen · diperbarui {new Date(d.updatedAt ?? d.createdAt).toLocaleDateString("id-ID")}
                </p>
              </button>
              {(canManage || d.createdBy === user?.id) && (
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Arsipkan dokumen"
                  className="text-muted-foreground opacity-0 hover:text-warning group-hover:opacity-100"
                  onClick={() => m.archiveDocument.mutate({ id: d.id, archived: true }, { onSuccess: () => toast.success("Dokumen diarsipkan") })}>
                  <Archive className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
          {files.map((f) => (
            <div key={`file-${f.id}`} className="group flex items-center gap-3 px-3.5 py-2.5">
              <FileText className="size-4.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.fileName}</p>
                <p className="text-[10px] text-muted-foreground">{fmtSize(f.sizeBytes)} · {new Date(f.createdAt).toLocaleDateString("id-ID")}</p>
              </div>
              <a href={`/api/teamspace/files/${f.id}/raw?download=1`} aria-label={`Unduh ${f.fileName}`}
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                <Download className="size-4" />
              </a>
              {(canManage || f.uploadedBy === user?.id) && (
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Arsipkan file"
                  className="text-muted-foreground opacity-0 hover:text-warning group-hover:opacity-100"
                  onClick={() => m.archiveFile.mutate({ id: f.id, archived: true }, { onSuccess: () => toast.success("File diarsipkan") })}>
                  <Archive className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Editor / viewer dokumen (FR-901b/902) */}
      {docOpen !== null && (
        <Dialog open onOpenChange={(o) => { if (!o) setDocOpen(null); }}>
          <DialogContent className="max-w-2xl dialog-w max-h-[90vh] overflow-hidden flex flex-col">
            <DialogTitle className="sr-only">{docOpen === "new" ? "Dokumen Baru" : docTitle}</DialogTitle>
            <div className="flex items-center gap-2 pr-8">
              <Input
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="Judul dokumen"
                disabled={!canEditDoc}
                className="border-0 px-0 text-base font-semibold shadow-none focus-visible:ring-0"
              />
              {canEditDoc && (
                <Button type="button" variant="ghost" size="xs"
                  leftIcon={preview ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
                  onClick={() => setPreview((v) => !v)}>
                  {preview ? "Edit" : "Preview"}
                </Button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {preview ? (
                <div
                  className="prose prose-sm max-w-none text-sm [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-bold [&_ul]:list-disc [&_ul]:pl-5"
                  // Konten di-escape dulu di miniMarkdown sebelum transformasi - aman dari injeksi.
                  dangerouslySetInnerHTML={{ __html: miniMarkdown(docContent || "*Dokumen kosong*") }}
                />
              ) : (
                <Textarea
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  placeholder={"Tulis dengan markdown sederhana:\n# Judul\n## Sub judul\n**tebal** *miring* `kode`\n- daftar poin"}
                  rows={14}
                  className="font-mono-tight text-xs"
                  disabled={!canEditDoc}
                />
              )}
            </div>
            {canEditDoc && (
              <div className="shrink-0 space-y-3 border-t pt-3">
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">Rahasia</p>
                    <p className="text-[10px] text-muted-foreground">Hanya penerima terpilih + pembuat yang bisa membuka</p>
                  </div>
                  <Switch checked={docConfidential} onCheckedChange={setDocConfidential} />
                </div>
                {docConfidential && (
                  <AssigneePicker mode="multi" showSourceToggle={false} value={docRecipients} onChange={setDocRecipients} />
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDocOpen(null)}>Tutup</Button>
                  <Button onClick={saveDoc} loading={m.createDocument.isPending || m.updateDocument.isPending} disabled={!docTitle.trim()}>
                    Simpan Dokumen
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
