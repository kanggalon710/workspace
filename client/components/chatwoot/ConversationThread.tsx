import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  useChatwootMessages, useChatwootStatus, useSendChatwootMessage, useSendChatwootAttachment,
  useChatwootAgents, useSetConversationStatus, useAssignConversation, useChatwootCannedResponses,
} from "@/hooks/useChatwoot";
import { useAuth } from "@/context/AuthContext";
import { compressImage } from "@/lib/imageCompress";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { MessageSquare, ExternalLink, Send, Paperclip, X } from "lucide-react";
import { chatwootConversationUrl } from "@shared/chatwootLinks";
import type { ConversationSummary } from "@/lib/chatwoot";
import { AgentSelector } from "./AgentSelector";

const STATUSES: { key: "open" | "pending" | "resolved"; label: string }[] = [
  { key: "open", label: "Buka" },
  { key: "pending", label: "Pending" },
  { key: "resolved", label: "Selesai" },
];

/** Kontrol status + assign (Batch 2e) - self-hide tanpa izin write / Chatwoot mati. */
function ConversationControls({ conversation }: { conversation: ConversationSummary }) {
  const { canWrite } = useAuth();
  const writeOk = canWrite("chatwoot");
  const { data: status } = useChatwootStatus();
  const configured = !!status?.enabled && !!status?.configured;
  const { data: agentData } = useChatwootAgents(writeOk && configured);
  const setStatus = useSetConversationStatus();
  const assign = useAssignConversation();

  if (!writeOk || !configured) return null;
  const agents = agentData?.agents ?? [];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex rounded-lg border border-border/60 overflow-hidden">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ conversationId: conversation.id, status: s.key }, {
              onSuccess: () => toast.success(`Status: ${s.label}`),
              onError: (e: any) => toast.error(e.message || "Gagal ubah status"),
            })}
            className={`px-2 py-1 text-[11px] font-medium transition-colors ${
              conversation.status === s.key ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="min-w-[160px]">
        <AgentSelector
          agents={agents}
          value={conversation.assigneeId != null ? String(conversation.assigneeId) : null}
          onChange={(agentId) => assign.mutate(
            { conversationId: conversation.id, assigneeId: agentId ? Number(agentId) : null },
            { onSuccess: () => toast.success(agentId ? "Agent di-assign" : "Assign dihapus"), onError: (e: any) => toast.error(e.message || "Gagal assign") },
          )}
        />
      </div>
    </div>
  );
}

/** Tanggal lokal (id-ID) untuk pemisah hari di thread. */
function dayLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Composer balasan - self-hide bila Chatwoot mati/tak terkonfigurasi atau tanpa izin write. */
function MessageComposer({ conversationId }: { conversationId: number }) {
  const { canWrite } = useAuth();
  const { data: status } = useChatwootStatus();
  const send = useSendChatwootMessage(conversationId);
  const sendAtt = useSendChatwootAttachment(conversationId);
  const writeOk = canWrite("chatwoot");
  const composerReady = !!status?.enabled && !!status?.configured && writeOk;
  const { data: cannedData } = useChatwootCannedResponses(composerReady);
  const [text, setText] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [files, setFiles] = useState<{ dataUrl: string; filename: string }[]>([]);
  const [cannedDismissed, setCannedDismissed] = useState(false);
  const [cannedIdx, setCannedIdx] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  if (!composerReady) return null;

  const pending = send.isPending || sendAtt.isPending;

  // Slash-command canned responses: ketik "/" di awal → tampilkan & filter by short_code/isi.
  const allCanned = cannedData?.cannedResponses ?? [];
  const cannedQuery = !cannedDismissed && text.startsWith("/") ? text.slice(1).toLowerCase() : null;
  const cannedMatches = cannedQuery != null
    ? allCanned.filter((c) => c.shortCode.toLowerCase().includes(cannedQuery) || c.content.toLowerCase().includes(cannedQuery)).slice(0, 8)
    : [];
  const cannedOpen = cannedMatches.length > 0;
  const safeIdx = Math.min(cannedIdx, cannedMatches.length - 1);

  const pickCanned = (i: number) => {
    const c = cannedMatches[i];
    if (!c) return;
    setText(c.content);
    setCannedDismissed(true);
    setCannedIdx(0);
    requestAnimationFrame(() => textRef.current?.focus());
  };

  const onPickFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    for (const f of Array.from(list).slice(0, 5)) {
      try {
        const r = await compressImage(f);
        setFiles((prev) => [...prev, { dataUrl: r.dataUrl, filename: f.name }].slice(0, 5));
      } catch (e: any) { toast.error(e.message || "Gagal proses gambar"); }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = () => {
    const content = text.trim();
    if (!content && !files.length) return;
    const reset = () => { setText(""); setFiles([]); };
    if (files.length) {
      sendAtt.mutate({ content, isPrivate, attachments: files }, {
        onSuccess: reset,
        onError: (e: any) => toast.error(e.message || "Gagal mengirim lampiran"),
      });
    } else {
      send.mutate({ content, isPrivate }, {
        onSuccess: () => setText(""),
        onError: (e: any) => toast.error(e.message || "Gagal mengirim"),
      });
    }
  };

  return (
    <form className="pt-2 mt-2 border-t border-border/40 space-y-1.5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px]">
              {f.filename}
              <button type="button" aria-label="Hapus lampiran" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        {cannedOpen && (
          <ul
            role="listbox"
            aria-label="Canned response"
            className="absolute bottom-full mb-1 left-0 right-0 z-20 max-h-56 overflow-y-auto rounded-lg border border-border bg-popover shadow-elev-md py-1"
          >
            <li className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Canned response - ↑↓ pilih, ⏎/Tab sisip, Esc tutup</li>
            {cannedMatches.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === safeIdx}>
                <button
                  type="button"
                  onMouseEnter={() => setCannedIdx(i)}
                  onClick={() => pickCanned(i)}
                  className={`w-full text-left px-3 py-1.5 ${i === safeIdx ? "bg-accent" : "hover:bg-accent/60"}`}
                >
                  <span className="font-mono-tight text-xs text-primary">/{c.shortCode}</span>
                  <span className="block text-xs text-muted-foreground truncate">{c.content}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={textRef}
          value={text}
          onChange={(e) => { setText(e.target.value); setCannedIdx(0); setCannedDismissed(false); }}
          onKeyDown={(e) => {
            if (cannedOpen) {
              if (e.key === "ArrowDown") { e.preventDefault(); setCannedIdx((i) => Math.min(i + 1, cannedMatches.length - 1)); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setCannedIdx((i) => Math.max(i - 1, 0)); return; }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); pickCanned(safeIdx); return; }
              if (e.key === "Tab") { e.preventDefault(); pickCanned(safeIdx); return; }
              if (e.key === "Escape") { e.preventDefault(); setCannedDismissed(true); return; }
            }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          rows={2}
          placeholder={isPrivate ? "Catatan internal (tidak terkirim ke pelanggan)…" : "Tulis balasan… ( / untuk canned response · Enter kirim · Shift+Enter baris baru)"}
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Catatan internal
          </label>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
          <Button type="button" variant="ghost" size="xs" onClick={() => fileRef.current?.click()} title="Lampirkan gambar">
            <Paperclip className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
        <Button type="submit" size="sm" loading={pending} disabled={!text.trim() && !files.length}>
          <Send className="size-3.5 mr-1" aria-hidden="true" /> Kirim
        </Button>
      </div>
    </form>
  );
}

export function ConversationThread({ conversationId, conversation }: { conversationId: number | null; conversation?: ConversationSummary }) {
  const { data, isLoading } = useChatwootMessages(conversationId);
  const { data: status } = useChatwootStatus();

  if (conversationId == null) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Pilih percakapan"
        description="Pilih percakapan untuk melihat pesan."
      />
    );
  }

  const messages = data?.messages ?? [];
  const convUrl = chatwootConversationUrl(status?.baseUrl, status?.accountId, conversationId);
  let lastDay = "";

  return (
    <div className="flex flex-col h-full">
      {/* Header: status + assign (Batch 2e) + deep-link ke Chatwoot */}
      <header className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-border/40">
        <span className="text-xs font-semibold text-muted-foreground">Percakapan #{conversationId}</span>
        <div className="flex flex-wrap items-center gap-2">
          {conversation && <ConversationControls conversation={conversation} />}
          {convUrl && (
            <Button type="button" variant="ghost" size="xs" onClick={() => window.open(convUrl, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="size-3.5 mr-1" aria-hidden="true" /> Buka di Chatwoot
            </Button>
          )}
        </div>
      </header>

      <section aria-label="Thread pesan" className="space-y-2 overflow-y-auto flex-1">
        {isLoading ? (
          <SkeletonList count={5} />
        ) : !messages.length ? (
          <EmptyState icon={MessageSquare} title="Belum ada pesan" />
        ) : (
          messages.map((m) => {
            const mine = m.type === "outgoing" || m.type === "private";
            const day = dayLabel(m.createdAt);
            const showDay = day && day !== lastDay;
            if (showDay) lastDay = day;

            return (
              <div key={m.id}>
                {showDay && (
                  <div className="text-center my-2">
                    <span className="text-[10px] text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">{day}</span>
                  </div>
                )}

                {m.type === "activity" ? (
                  <div className="text-center text-[10px] text-muted-foreground py-1">{m.content}</div>
                ) : (
                  <article className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        m.type === "private"
                          ? "bg-warning/15 text-foreground border border-warning/30"
                          : mine
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
                      {m.attachments.map((a, i) => (
                        <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="block text-xs underline mt-1">
                          Lampiran ({a.type})
                        </a>
                      ))}
                      <div className="text-[10px] opacity-70 mt-1">
                        {m.senderName ?? ""}
                        {m.createdAt ? ` · ${new Date(m.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : ""}
                      </div>
                    </div>
                  </article>
                )}
              </div>
            );
          })
        )}
      </section>

      <MessageComposer conversationId={conversationId} />
    </div>
  );
}
