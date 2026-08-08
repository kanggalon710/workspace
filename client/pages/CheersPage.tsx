/** Teamspace Fase 3 - Cheers / apresiasi antar-rekan (FR-1203):
 * kirim kudos, riwayat diterima/dikirim, leaderboard 30 hari. */
import { useMemo, useState } from "react";
import { useCheers, useCheersLeaderboard, useCheerMutations } from "@/hooks/useTeamspace";
import { useAssignableUsers } from "@/hooks/usePipelines";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer, PageSection } from "@/components/ui/page-container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { Combobox } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { PartyPopper, Send, Trophy, Inbox, SendHorizontal } from "lucide-react";
import { toast } from "sonner";

export default function CheersPage() {
  const [box, setBox] = useState<"received" | "sent">("received");
  const { data: rows, isLoading, refetch, isRefetching } = useCheers(box);
  const { data: leaderboard } = useCheersLeaderboard();
  const { sendCheer } = useCheerMutations();
  const { data: users } = useAssignableUsers();
  const nameOf = useMemo(() => {
    const map = new Map((users ?? []).map((u: any) => [u.id, u.name || u.username]));
    return (id: number) => map.get(id) ?? `#${id}`;
  }, [users]);

  const [showSend, setShowSend] = useState(false);
  const [toUser, setToUser] = useState("");
  const [message, setMessage] = useState("");

  const submit = async () => {
    if (!toUser || !message.trim()) return;
    try {
      await sendCheer.mutateAsync({ toUserId: Number(toUser), message: message.trim() });
      toast.success("Cheers terkirim");
      setShowSend(false);
      setToUser(""); setMessage("");
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengirim cheers");
    }
  };

  return (
    <PageContainer>
      <PageHeader
        icon={PartyPopper}
        title="Cheers"
        description="Apresiasi antar-rekan - rayakan kerja bagus, bukan hanya angka"
        accent="rose"
        onRefresh={() => refetch()}
        refreshing={isRefetching}
        actions={
          <Button size="sm" leftIcon={<Send className="size-4" />} onClick={() => setShowSend(true)}>
            Kirim Cheers
          </Button>
        }
      >
        <div className="flex gap-1.5">
          {([["received", "Diterima", Inbox], ["sent", "Dikirim", SendHorizontal]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setBox(k)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${box === k ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>
          ) : (rows ?? []).length === 0 ? (
            <EmptyState
              icon={PartyPopper}
              title={box === "received" ? "Belum ada cheers untukmu" : "Kamu belum mengirim cheers"}
              description={box === "received"
                ? "Terus berkarya - apresiasi dari rekan akan muncul di sini."
                : "Lihat rekan yang kerjanya bagus minggu ini? Kirim cheers pertamamu!"}
              action={{ label: "Kirim Cheers", onClick: () => setShowSend(true) }}
            />
          ) : (
            <div className="space-y-2.5">
              {(rows ?? []).map((c) => {
                const person = nameOf(box === "received" ? c.fromUserId : c.toUserId);
                const initial = String(person).trim().charAt(0).toUpperCase() || "?";
                return (
                  <Card key={c.id} variant="elevated" padding="md">
                    <div className="flex items-start gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-sm font-semibold text-white">
                        {initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">
                          {box === "received"
                            ? <>Dari <b className="text-foreground">{person}</b></>
                            : <>Untuk <b className="text-foreground">{person}</b></>}
                          {" · "}{new Date(c.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{c.message}</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <Card variant="elevated" padding="md" className="h-fit">
          <h3 className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold">
            <Trophy className="size-4 text-warning" /> Leaderboard 30 Hari
          </h3>
          {(leaderboard ?? []).length === 0 ? (
            <p className="py-4 text-xs text-muted-foreground">Belum ada cheers pada periode ini.</p>
          ) : (
            <ol className="space-y-2">
              {(leaderboard ?? []).map((r, i) => (
                <li key={r.userId} className="flex items-center gap-2.5">
                  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${i === 0 ? "bg-warning text-white" : i === 1 ? "bg-muted-foreground/25 text-foreground" : i === 2 ? "bg-orange-300/60 text-orange-900" : "bg-muted text-muted-foreground"}`}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{nameOf(r.userId)}</span>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-muted-foreground">{r.count}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {showSend && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowSend(false); }}>
          <DialogContent className="max-w-md w-[calc(100vw-2rem)]">
            <DialogTitle>Kirim Cheers</DialogTitle>
            <div className="mt-3 space-y-3.5">
              <div>
                <span className="mb-1 block text-xs font-medium">Untuk rekan</span>
                <Combobox
                  placeholder="Pilih rekan…"
                  options={(users ?? []).map((u: any) => ({ value: String(u.id), label: u.name || u.username }))}
                  value={toUser}
                  onChange={(v) => setToUser(v ?? "")}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="cheer-msg">Pesan apresiasi</label>
                <Textarea id="cheer-msg" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)}
                  placeholder='cth: "Respon tiket gangguan semalam cepat banget - pelanggan sampai bilang terima kasih!"' />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowSend(false)}>Batal</Button>
                <Button onClick={submit} loading={sendCheer.isPending} disabled={!toUser || !message.trim()}>
                  Kirim
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageContainer>
  );
}
