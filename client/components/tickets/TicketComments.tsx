/**
 * v4.2.18 (B.6): TicketComments — internal chat per tiket
 * Support: @mention user JABNET, internal-only flag, soft delete.
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { formatRelative } from "@/lib/dateFormat";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MessageSquare, Send, Trash2, Loader2, AtSign, Lock } from "lucide-react";

interface Comment {
  id: number;
  ticketId: number;
  authorId: number;
  authorName: string | null;
  authorRole: string | null;
  content: string;
  mentions: string | null;
  isInternal: number;
  createdAt: string;
  editedAt: string | null;
}

interface UserItem {
  id: number;
  name: string;
  username: string;
}

export function TicketComments({ ticketId }: { ticketId: number }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [content, setContent] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [selectedMentions, setSelectedMentions] = useState<Set<number>>(new Set());

  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ["ticket-comments", ticketId],
    queryFn: () => api.get(`/tickets/${ticketId}/comments`),
    enabled: !!ticketId,
    refetchInterval: 30_000,
  });

  const { data: users = [] } = useQuery<UserItem[]>({
    queryKey: ["users-list-mention"],
    queryFn: () => api.get(`/users`),
    enabled: mentionOpen,
  });

  const filteredUsers = useMemo(() => {
    if (!mentionQuery) return users.slice(0, 8);
    const q = mentionQuery.toLowerCase();
    return users.filter(u => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)).slice(0, 8);
  }, [users, mentionQuery]);

  const sendMut = useMutation({
    mutationFn: () => api.post(`/tickets/${ticketId}/comments`, {
      content,
      mentions: Array.from(selectedMentions),
      isInternal: true,
    }),
    onSuccess: () => {
      setContent("");
      setSelectedMentions(new Set());
      qc.invalidateQueries({ queryKey: ["ticket-comments", ticketId] });
      qc.invalidateQueries({ queryKey: ["ticket-activities", ticketId] });
      toast.success("Komentar terkirim");
    },
    onError: (e: any) => toast.error(e.message || "Gagal kirim"),
  });

  const deleteMut = useMutation({
    mutationFn: (commentId: number) => api.delete(`/tickets/${ticketId}/comments/${commentId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket-comments", ticketId] }),
    onError: (e: any) => toast.error(e.message),
  });

  function handleContentChange(val: string) {
    setContent(val);
    // Detect @mention
    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1) {
      const after = val.slice(lastAt + 1);
      // Check if no space yet (still typing mention)
      if (!/\s/.test(after) && after.length < 30) {
        setMentionQuery(after);
        setMentionOpen(true);
        return;
      }
    }
    setMentionOpen(false);
  }

  function pickMention(u: UserItem) {
    const lastAt = content.lastIndexOf("@");
    if (lastAt === -1) return;
    setContent(content.slice(0, lastAt) + `@${u.username} `);
    setSelectedMentions(new Set([...selectedMentions, u.id]));
    setMentionOpen(false);
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2">
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Komentar Internal</span>
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">{comments.length}</span>
        <Lock className="w-3 h-3 text-muted-foreground ml-auto" />
        <span className="text-[10px] text-muted-foreground italic">Tim only</span>
      </div>

      {/* Comments list */}
      <div className="divide-y max-h-[400px] overflow-y-auto">
        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          </div>
        ) : comments.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Belum ada komentar. Mulai diskusi tim di sini.
          </div>
        ) : (
          comments.map(c => (
            <div key={c.id} className="px-4 py-2.5 hover:bg-muted/20 group">
              <div className="flex items-start gap-2">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 grid place-items-center text-white text-[10px] font-bold shrink-0">
                  {(c.authorName || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-foreground">{c.authorName ?? `User #${c.authorId}`}</span>
                    {c.authorRole && (
                      <span className="text-[9px] uppercase tracking-wider font-bold px-1 rounded bg-zinc-100 text-zinc-700">{c.authorRole}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground" title={c.createdAt}>{formatRelative(c.createdAt)}</span>
                  </div>
                  <p className="text-sm text-foreground/90 mt-0.5 whitespace-pre-wrap leading-relaxed">{c.content}</p>
                </div>
                {(user?.id === c.authorId || user?.role === "admin" || user?.role === "Administrator" /* legacy */ || user?.role === "System-Admin" || user?.role === "Admin") && (
                  <button
                    onClick={() => { if (confirm("Hapus komentar?")) deleteMut.mutate(c.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-100 text-rose-600 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Composer */}
      <div className="border-t p-3 relative">
        <Textarea
          value={content}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Tulis komentar... (ketik @ untuk mention teknisi lain)"
          rows={2}
          className="text-sm resize-none"
        />
        {/* @mention dropdown */}
        {mentionOpen && filteredUsers.length > 0 && (
          <div className="absolute z-10 bottom-full left-3 right-3 mb-1 rounded-md border bg-card shadow-lg overflow-hidden max-h-[200px] overflow-y-auto">
            {filteredUsers.map(u => (
              <button
                key={u.id}
                onClick={() => pickMention(u)}
                className="w-full px-3 py-2 text-left hover:bg-muted text-xs flex items-center gap-2"
              >
                <AtSign className="w-3 h-3 text-muted-foreground" />
                <span className="font-mono">{u.username}</span>
                <span className="text-muted-foreground">— {u.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            {selectedMentions.size > 0 && <><AtSign className="w-3 h-3" />{selectedMentions.size} mention</>}
          </span>
          <Button size="sm" disabled={!content.trim() || sendMut.isPending} onClick={() => sendMut.mutate()}>
            {sendMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Send className="w-3.5 h-3.5 mr-1" />}
            Kirim
          </Button>
        </div>
      </div>
    </div>
  );
}
