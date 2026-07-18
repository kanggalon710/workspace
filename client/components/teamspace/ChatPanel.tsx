/** Teamspace Fase 2 — Chat Grup tim (FR-5xx): bubble WA-style, lampiran, panel Media.
 *  Realtime via polling 5s (pause-on-blur otomatis) — sesuai NFR-002 (cPanel, no WS). */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTeamChat, useChatMedia, useChatMutations, useChatReadStates } from "@/hooks/useTeamspace";
import { useAssignableUsers } from "@/hooks/usePipelines";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MessageCircle, Send, Paperclip, Images, Trash2, FileText, Download, X, Mic, Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";

interface Props {
  teamId: number;
  canManage: boolean;
  active: boolean;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(iso: string): string {
  const d = new Date(iso); const now = new Date();
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return "Hari Ini";
  const yesterday = new Date(now.getTime() - 86400_000);
  if (sameDay(d, yesterday)) return "Kemarin";
  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" });
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatPanel({ teamId, canManage, active }: Props) {
  const { user } = useAuth();
  const { data: messages, isLoading } = useTeamChat(teamId, active);
  const { data: readStates } = useChatReadStates(teamId, active);
  const m = useChatMutations(teamId);
  // Read-by gaya Cicle: anggota lain yang lastReadChatAt-nya >= waktu pesan sudah membacanya
  // (ISO string sebanding leksikografis). Nama ditampilkan di pesan terakhir milik sendiri.
  const readersFor = (iso: string) =>
    (readStates ?? []).filter((r) => r.userId !== user?.id && r.lastReadChatAt != null && r.lastReadChatAt >= iso);
  const lastMineId = useMemo(() => {
    for (let i = (messages ?? []).length - 1; i >= 0; i--) {
      const msg = (messages ?? [])[i];
      if (msg.senderId === user?.id && !msg.deletedAt) return msg.id;
    }
    return null;
  }, [messages, user?.id]);
  const { data: users } = useAssignableUsers();
  const nameOf = useMemo(() => {
    const map = new Map((users ?? []).map((u: any) => [u.id, u.name || u.username]));
    return (id: number) => map.get(id) ?? `#${id}`;
  }, [users]);

  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [showMedia, setShowMedia] = useState(false);
  const [mediaTab, setMediaTab] = useState<"media" | "docs">("media");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  // ── Voice note (BUG-011 / FR-502) — MediaRecorder browser ──
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRef = useRef(false);

  const stopTracks = () => recorderRef.current?.stream.getTracks().forEach((t) => t.stop());

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Chrome/Firefox → webm; Safari → mp4 (m4a). Ext harus cocok dgn attachmentRules.
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      discardRef.current = false;
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stopTracks();
        if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
        setRecording(false); setRecordSec(0);
        if (discardRef.current || chunksRef.current.length === 0) return;
        const type = rec.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        const voice = new File([blob], `pesan-suara-${Date.now()}.${ext}`, { type });
        try {
          await m.sendMessage.mutateAsync({ body: "", file: voice });
        } catch (e: any) {
          toast.error(e?.message || "Gagal mengirim pesan suara");
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true); setRecordSec(0);
      recordTimerRef.current = setInterval(() => setRecordSec((s) => s + 1), 1000);
    } catch {
      toast.error("Mikrofon tidak tersedia — izinkan akses mic di browser");
    }
  };

  const finishRecording = (discard: boolean) => {
    discardRef.current = discard;
    recorderRef.current?.stop();
  };

  // Bersihkan recorder saat panel unmount.
  useEffect(() => () => {
    discardRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
  }, []);

  const { data: media } = useChatMedia(teamId, showMedia);

  // Auto-scroll ke bawah saat pesan baru + tandai terbaca.
  useEffect(() => {
    const count = messages?.length ?? 0;
    if (count !== lastCountRef.current) {
      lastCountRef.current = count;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      });
      if (active && count > 0) m.markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length, active]);

  const send = async () => {
    const body = draft.trim();
    if (!body && !file) return;
    try {
      await m.sendMessage.mutateAsync({ body, file });
      setDraft("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengirim pesan");
    }
  };

  const isImage = (mime: string | null) => Boolean(mime?.startsWith("image/"));

  return (
    <div className="flex h-[calc(100vh-16rem)] min-h-[420px] flex-col rounded-xl border bg-card">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <MessageCircle className="size-3.5" /> Chat Grup
        </span>
        <Button type="button" variant="ghost" size="xs" leftIcon={<Images className="size-3.5" />} onClick={() => setShowMedia(true)}>
          Media
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className={`h-10 w-2/3 animate-pulse rounded-2xl bg-muted ${i % 2 ? "ml-auto" : ""}`} />)}</div>
        ) : (messages ?? []).length === 0 ? (
          <EmptyState icon={MessageCircle} size="sm" title="Belum ada pesan" description="Mulai percakapan tim di sini — pesan tersimpan permanen." />
        ) : (
          (messages ?? []).map((msg, i) => {
            const prev = (messages ?? [])[i - 1];
            const mine = msg.senderId === user?.id;
            const readers = mine && !msg.deletedAt ? readersFor(msg.createdAt) : [];
            const newDay = !prev || fmtDay(prev.createdAt) !== fmtDay(msg.createdAt);
            const sameSender = prev && prev.senderId === msg.senderId && !newDay;
            return (
              <div key={msg.id}>
                {newDay && (
                  <div className="my-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-medium text-muted-foreground">{fmtDay(msg.createdAt)}</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className={`group flex ${mine ? "justify-end" : "justify-start"} ${sameSender ? "mt-0.5" : "mt-2"}`}>
                  <div className={`relative max-w-[80%] rounded-2xl px-3 py-1.5 ${mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"}`}>
                    {!mine && !sameSender && (
                      <p className="text-[10px] font-bold text-primary">{nameOf(msg.senderId)}</p>
                    )}
                    {msg.deletedAt ? (
                      <p className="text-xs italic opacity-60">Pesan dihapus</p>
                    ) : (
                      <>
                        {msg.attachmentPath && (
                          msg.attachmentMime?.startsWith("audio/") ? (
                            <div className="my-1 flex items-center gap-1.5">
                              <Mic className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                              <audio controls preload="metadata" src={`/api/teamspace/chat/${msg.id}/attachment`} className="h-9 max-w-56" />
                            </div>
                          ) : isImage(msg.attachmentMime) ? (
                            <a href={`/api/teamspace/chat/${msg.id}/attachment`} target="_blank" rel="noreferrer">
                              <img
                                src={`/api/teamspace/chat/${msg.id}/attachment`}
                                alt={msg.attachmentName ?? "gambar"}
                                className="my-1 max-h-52 max-w-full rounded-lg"
                                loading="lazy"
                              />
                            </a>
                          ) : (
                            <a
                              href={`/api/teamspace/chat/${msg.id}/attachment?download=1`}
                              className={`my-1 flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${mine ? "border-white/30" : ""}`}
                            >
                              <FileText className="size-4 shrink-0" />
                              <span className="min-w-0 flex-1 truncate">{msg.attachmentName}</span>
                              <Download className="size-3.5 shrink-0" />
                            </a>
                          )
                        )}
                        {msg.body && <p className="whitespace-pre-wrap break-words text-sm">{msg.body}</p>}
                      </>
                    )}
                    <p className={`mt-0.5 flex items-center justify-end gap-1 text-right text-[9px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {fmtTime(msg.createdAt)}
                      {mine && !msg.deletedAt && (readers.length > 0 ? (
                        <CheckCheck className="size-3" aria-label={`Dibaca oleh ${readers.map((r) => r.name).join(", ")}`} />
                      ) : (
                        <Check className="size-3 opacity-60" aria-label="Terkirim" />
                      ))}
                    </p>
                    {!msg.deletedAt && (mine || canManage) && (
                      <button
                        type="button"
                        aria-label="Hapus pesan"
                        onClick={() => m.deleteMessage.mutate(msg.id)}
                        className={`absolute -top-1.5 ${mine ? "-left-1.5" : "-right-1.5"} hidden size-5 items-center justify-center rounded-full bg-background text-muted-foreground shadow ring-1 ring-border hover:text-destructive group-hover:flex`}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
                {mine && msg.id === lastMineId && readers.length > 0 && (
                  <p className="mt-0.5 text-right text-[9px] text-muted-foreground" title={readers.map((r) => r.name).join(", ")}>
                    Dibaca oleh {readers.slice(0, 3).map((r) => r.name.split(" ")[0]).join(", ")}{readers.length > 3 ? ` +${readers.length - 3}` : ""}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t p-2.5">
        {file && (
          <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs">
            <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="shrink-0 text-muted-foreground">{fmtSize(file.size)}</span>
            <button type="button" aria-label="Batalkan lampiran" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
              <X className="size-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        )}
        {recording ? (
          /* Mode rekam voice note (BUG-011): timer + batal + kirim */
          <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
            <span className="size-2.5 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
            <span className="text-xs font-semibold text-destructive tabular-nums">
              Merekam… {String(Math.floor(recordSec / 60)).padStart(2, "0")}:{String(recordSec % 60).padStart(2, "0")}
            </span>
            <span className="flex-1" />
            <Button type="button" variant="ghost" size="xs" onClick={() => finishRecording(true)}>Batal</Button>
            <Button type="button" size="sm" leftIcon={<Send className="size-3.5" />} onClick={() => finishRecording(false)}>
              Kirim
            </Button>
          </div>
        ) : (
          <div className="flex items-end gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Lampirkan file" onClick={() => fileInputRef.current?.click()}>
              <Paperclip className="size-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Rekam pesan suara" title="Rekam pesan suara" onClick={startRecording}>
              <Mic className="size-4" />
            </Button>
            <Input
              placeholder="Tulis pesan…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <Button type="button" size="icon" aria-label="Kirim" loading={m.sendMessage.isPending} onClick={send} disabled={!draft.trim() && !file}>
              <Send className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Panel Media (FR-504) */}
      {showMedia && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowMedia(false); }}>
          <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[85vh] overflow-hidden flex flex-col">
            <DialogTitle>Media & Dokumen Chat</DialogTitle>
            <div className="flex gap-1.5">
              {(["media", "docs"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMediaTab(t)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${mediaTab === t ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {t === "media" ? "Media" : "Dokumen"}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto">
              {mediaTab === "media" ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {(media ?? []).filter((x) => isImage(x.attachmentMime)).map((x) => (
                    <a key={x.id} href={`/api/teamspace/chat/${x.id}/attachment`} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-lg bg-muted">
                      <img src={`/api/teamspace/chat/${x.id}/attachment`} alt={x.attachmentName ?? ""} className="h-full w-full object-cover" loading="lazy" />
                    </a>
                  ))}
                  {(media ?? []).filter((x) => isImage(x.attachmentMime)).length === 0 && (
                    <p className="col-span-3 py-6 text-center text-xs text-muted-foreground">Belum ada gambar di chat ini.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(media ?? []).filter((x) => !isImage(x.attachmentMime)).map((x) => (
                    <a key={x.id} href={`/api/teamspace/chat/${x.id}/attachment?download=1`} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs hover:bg-muted">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{x.attachmentName}</span>
                      <span className="shrink-0 text-muted-foreground">{fmtSize(x.attachmentSize)}</span>
                      <Download className="size-3.5 shrink-0 text-muted-foreground" />
                    </a>
                  ))}
                  {(media ?? []).filter((x) => !isImage(x.attachmentMime)).length === 0 && (
                    <p className="py-6 text-center text-xs text-muted-foreground">Belum ada dokumen di chat ini.</p>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
