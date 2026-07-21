/** Teamspace - Pengumuman per-tim (BUG-004 / FR-601..603): manager kirim pengumuman
 * internal bertarget ke anggota timnya, dengan opsi Rahasia + selesai otomatis.
 * Beda dari /announcements company-wide (changelog sistem). */
import { useMemo, useState } from "react";
import { useTeamAnnouncements, useTeamAnnouncementMutations, type TeamAnnouncementRow } from "@/hooks/useTeamspace";
import { useAssignableUsers } from "@/hooks/usePipelines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AssigneePicker } from "@/components/pipelines/AssigneePicker";
import { Megaphone, Plus, Lock, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  teamId: number;
  canManage: boolean;
  active: boolean;
}

export function AnnouncementsPanel({ teamId, canManage, active }: Props) {
  const { data: items, isLoading } = useTeamAnnouncements(teamId, active);
  const m = useTeamAnnouncementMutations(teamId);
  const { data: users } = useAssignableUsers();
  const nameOf = useMemo(() => {
    const map = new Map((users ?? []).map((u: any) => [u.id, u.name || u.username]));
    return (id: number) => map.get(id) ?? `#${id}`;
  }, [users]);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [confidential, setConfidential] = useState(false);
  const [expiry, setExpiry] = useState<"" | "1" | "3" | "7">("");

  const submit = async () => {
    if (!title.trim() || !content.trim()) return;
    if (confidential && recipients.length === 0) { toast.error("Pengumuman Rahasia butuh minimal satu penerima"); return; }
    try {
      await m.create.mutateAsync({
        title: title.trim(), content: content.trim(),
        isConfidential: confidential, recipientIds: recipients.map(Number),
        expiresInDays: expiry ? Number(expiry) : null,
      });
      toast.success("Pengumuman terkirim");
      setShowForm(false);
      setTitle(""); setContent(""); setRecipients([]); setConfidential(false); setExpiry("");
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengirim pengumuman");
    }
  };

  const remove = async (a: TeamAnnouncementRow) => {
    try { await m.remove.mutateAsync(a.id); toast.success("Pengumuman dihapus"); }
    catch (e: any) { toast.error(e?.message || "Gagal menghapus"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Pengumuman internal tim - bisa bertarget ke anggota tertentu & rahasia.</p>
        {canManage && (
          <Button type="button" size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setShowForm(true)}>
            Buat Pengumuman
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : (items ?? []).length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Belum ada pengumuman tim"
          description={canManage
            ? 'Contoh: "Cuti bersama Jumat depan", "SOP baru penanganan gangguan" - kirim langsung ke anggota tim.'
            : "Manager tim belum membuat pengumuman."}
        />
      ) : (
        <div className="space-y-2">
          {(items ?? []).map((a) => (
            <Card key={a.id} variant="elevated" padding="sm" className={a.isExpired ? "opacity-60" : ""}>
              <div className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10" aria-hidden="true">
                  <Megaphone className="size-4.5 text-primary" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-sm font-semibold">{a.title}</h3>
                    {a.isConfidential === 1 && <StatusBadge variant="warning" label="Rahasia" size="sm" appearance="subtle" />}
                    {a.isExpired && <StatusBadge variant="neutral" label="Selesai" size="sm" appearance="subtle" />}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{a.content}</p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    <span>{nameOf(a.authorId)}</span>
                    <span>· {a.publishedAt ? new Date(a.publishedAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "draft"}</span>
                    {a.isConfidential === 1 && a.recipientIds.length > 0 && <span className="inline-flex items-center gap-0.5"><Lock className="size-2.5" /> {a.recipientIds.length} penerima</span>}
                    {a.expiresAt && !a.isExpired && <span className="inline-flex items-center gap-0.5"><Clock className="size-2.5" /> berlaku s/d {new Date(a.expiresAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span>}
                  </p>
                </div>
                {canManage && (
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Hapus pengumuman"
                    className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => remove(a)}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showForm && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowForm(false); }}>
          <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
            <DialogTitle>Buat Pengumuman Tim</DialogTitle>
            <div className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="ann-title">Judul <span className="text-destructive">*</span></label>
                <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="cth: Cuti bersama Idul Adha" autoFocus maxLength={200} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="ann-content">Isi <span className="text-destructive">*</span></label>
                <Textarea id="ann-content" rows={4} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Detail pengumuman untuk anggota tim…" />
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium">Penerima (opsional)</span>
                <AssigneePicker mode="multi" showSourceToggle={false} value={recipients} onChange={setRecipients} />
                <p className="mt-1 text-[10px] text-muted-foreground">Kosong = semua anggota tim. Terisi = hanya penerima terpilih yang dinotifikasi.</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div>
                    <p className="text-xs font-medium"> Rahasia</p>
                    <p className="text-[10px] text-muted-foreground">Hanya penerima yang bisa melihat</p>
                  </div>
                  <Switch checked={confidential} onCheckedChange={setConfidential} />
                </div>
                <div>
                  <span className="mb-1 block text-xs font-medium">Selesai otomatis</span>
                  <Select value={expiry || "none"} onValueChange={(v) => setExpiry(v === "none" ? "" : (v as any))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Manual</SelectItem>
                      <SelectItem value="1">1 hari</SelectItem>
                      <SelectItem value="3">3 hari</SelectItem>
                      <SelectItem value="7">7 hari</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
                <Button onClick={submit} loading={m.create.isPending} disabled={!title.trim() || !content.trim()}>
                  Kirim Pengumuman
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
