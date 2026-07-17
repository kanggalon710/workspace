/** Teamspace Fase 2 — Pertanyaan / Check-in rutin (FR-8xx): jadwal per hari+jam,
 *  jawab inline, rekap per tanggal + completion rate. Pengiriman oleh worker
 *  (notifikasi in-app + WhatsApp MPWA). */
import { useMemo, useState } from "react";
import { useTeamCheckins, useCheckinResponses, useCheckinMutations, type CheckinQuestionRow } from "@/hooks/useTeamspace";
import { useAssignableUsers } from "@/hooks/usePipelines";
import { useAuth } from "@/context/AuthContext";
import { DOW_LABELS } from "@shared/checkinSchedule";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AssigneePicker } from "@/components/pipelines/AssigneePicker";
import { MessagesSquare, Plus, Clock, Lock, Trash2, Send, ListChecks, Power } from "lucide-react";
import { toast } from "sonner";

interface Props {
  teamId: number;
  canManage: boolean;
  active: boolean;
}

export function CheckinPanel({ teamId, canManage, active }: Props) {
  const { user } = useAuth();
  const { data: questions, isLoading } = useTeamCheckins(teamId, active);
  const m = useCheckinMutations(teamId);
  const { data: users } = useAssignableUsers();
  const nameOf = useMemo(() => {
    const map = new Map((users ?? []).map((u: any) => [u.id, u.name || u.username]));
    return (id: number) => map.get(id) ?? `#${id}`;
  }, [users]);

  // ── Jawab inline ──
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>({});
  const submitAnswer = async (q: CheckinQuestionRow) => {
    const text = (answerDrafts[q.id] ?? "").trim();
    if (!text) return;
    try {
      await m.respond.mutateAsync({ id: q.id, responseText: text });
      toast.success("Jawaban terkirim");
      setAnswerDrafts((d) => ({ ...d, [q.id]: "" }));
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengirim jawaban");
    }
  };

  // ── Rekap ──
  const [recapFor, setRecapFor] = useState<CheckinQuestionRow | null>(null);
  const { data: responses } = useCheckinResponses(recapFor?.id ?? null);
  const responsesByDate = useMemo(() => {
    const map = new Map<string, typeof responses>();
    for (const r of responses ?? []) {
      const arr = map.get(r.responseDate) ?? [];
      arr!.push(r);
      map.set(r.responseDate, arr!);
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [responses]);

  // ── Form buat pertanyaan ──
  const [showForm, setShowForm] = useState(false);
  const [qText, setQText] = useState("");
  const [days, setDays] = useState<number[]>([1]);
  const [time, setTime] = useState("09:00");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [confidential, setConfidential] = useState(false);

  const submitCreate = async () => {
    if (!qText.trim() || days.length === 0 || recipients.length === 0) return;
    try {
      await m.createQuestion.mutateAsync({
        questionText: qText.trim(), sendDays: days, sendTime: time,
        isConfidential: confidential, recipientIds: recipients.map(Number),
      });
      toast.success("Pertanyaan rutin dibuat — akan dikirim otomatis sesuai jadwal");
      setShowForm(false);
      setQText(""); setDays([1]); setTime("09:00"); setRecipients([]); setConfidential(false);
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat pertanyaan");
    }
  };

  const toggleActive = async (q: CheckinQuestionRow) => {
    try {
      await m.updateQuestion.mutateAsync({ id: q.id, isActive: q.isActive !== 1 });
      toast.success(q.isActive === 1 ? "Pertanyaan dinonaktifkan" : "Pertanyaan diaktifkan");
    } catch (e: any) {
      toast.error(e?.message || "Gagal mengubah status");
    }
  };

  const removeQuestion = async (q: CheckinQuestionRow) => {
    try {
      await m.deleteQuestion.mutateAsync(q.id);
      toast.success("Pertanyaan dihapus");
    } catch (e: any) {
      toast.error(e?.message || "Gagal menghapus");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Pertanyaan dikirim otomatis sesuai jadwal — via notifikasi & WhatsApp.
        </p>
        {canManage && (
          <Button type="button" size="sm" leftIcon={<Plus className="size-4" />} onClick={() => setShowForm(true)}>
            Buat Pertanyaan
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>
      ) : (questions ?? []).length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Belum ada pertanyaan rutin"
          description={canManage
            ? 'Contoh: "Apa yang kamu kerjakan minggu ini?" dikirim tiap Senin 09:00 — update progres tanpa menagih manual.'
            : "Manager tim belum membuat pertanyaan check-in."}
        />
      ) : (
        <div className="space-y-3">
          {(questions ?? []).map((q) => {
            const pct = q.lastCompletion && q.lastCompletion.total > 0
              ? Math.round((q.lastCompletion.responded / q.lastCompletion.total) * 100) : null;
            const iAmRecipient = user != null && q.recipientIds.includes(user.id);
            return (
              <div key={q.id} className={`rounded-xl border bg-card p-3.5 ${q.isActive !== 1 ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {q.questionText}
                      {q.isConfidential === 1 && <Lock className="ml-1 inline size-3 text-warning" aria-label="Rahasia" />}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" /> {q.sendDays.map((d) => DOW_LABELS[d]?.slice(0, 3)).join(", ")} · {q.sendTime}
                      </span>
                      <span>{q.recipientIds.length} penerima</span>
                      {q.isActive !== 1 && <StatusBadge variant="neutral" label="Nonaktif" size="sm" appearance="subtle" />}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" variant="ghost" size="xs" leftIcon={<ListChecks className="size-3.5" />} onClick={() => setRecapFor(q)}>
                      Rekap
                    </Button>
                    {canManage && (
                      <>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={q.isActive === 1 ? "Nonaktifkan" : "Aktifkan"}
                          title={q.isActive === 1 ? "Nonaktifkan" : "Aktifkan"} onClick={() => toggleActive(q)}>
                          <Power className={`size-4 ${q.isActive === 1 ? "text-success" : "text-muted-foreground"}`} />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label="Hapus"
                          className="text-muted-foreground hover:text-destructive" onClick={() => removeQuestion(q)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {q.lastCompletion && (
                  <div className="mt-2.5">
                    <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Instance {new Date(`${q.lastCompletion.date}T00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" })}</span>
                      <span className="tabular-nums">{q.lastCompletion.responded}/{q.lastCompletion.total} menjawab {pct != null ? `(${pct}%)` : ""}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
                      <div className={`h-full rounded-full transition-all ${pct === 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${pct ?? 0}%` }} />
                    </div>
                  </div>
                )}

                {/* Jawab inline — hanya penerima dengan instance aktif yang belum dijawab */}
                {iAmRecipient && q.myPending && (
                  <div className="mt-2.5 rounded-lg border border-warning/40 bg-warning/5 p-2.5">
                    <p className="mb-1.5 text-[10px] font-semibold text-warning">Anda belum menjawab instance terakhir</p>
                    <div className="flex gap-1.5">
                      <Input
                        inputSize="sm"
                        placeholder="Tulis jawaban…"
                        value={answerDrafts[q.id] ?? ""}
                        onChange={(e) => setAnswerDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") submitAnswer(q); }}
                      />
                      <Button type="button" size="sm" leftIcon={<Send className="size-3.5" />} loading={m.respond.isPending}
                        onClick={() => submitAnswer(q)} disabled={!(answerDrafts[q.id] ?? "").trim()}>
                        Kirim
                      </Button>
                    </div>
                  </div>
                )}
                {iAmRecipient && !q.myPending && q.myResponse && (
                  <p className="mt-2 rounded-lg bg-success/10 px-2.5 py-1.5 text-[11px] text-success">
                    ✓ Jawaban Anda: {q.myResponse.slice(0, 120)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Rekap jawaban per tanggal (FR-804) */}
      {recapFor && (
        <Dialog open onOpenChange={(o) => { if (!o) setRecapFor(null); }}>
          <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[85vh] overflow-hidden flex flex-col">
            <DialogTitle className="pr-8 text-sm">{recapFor.questionText}</DialogTitle>
            <div className="flex-1 space-y-4 overflow-y-auto">
              {responsesByDate.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Belum ada jawaban.</p>
              ) : responsesByDate.map(([date, rows]) => (
                <section key={date}>
                  <h4 className="mb-1.5 text-xs font-bold">
                    {new Date(`${date}T00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    <span className="ml-2 font-normal text-muted-foreground">({rows!.length} jawaban)</span>
                  </h4>
                  <div className="space-y-1.5">
                    {rows!.map((r) => (
                      <div key={r.id} className="rounded-lg border px-3 py-2">
                        <p className="text-[10px] font-semibold text-primary">{nameOf(r.userId)}</p>
                        <p className="whitespace-pre-wrap text-xs">{r.responseText}</p>
                        <p className="mt-0.5 text-right text-[9px] text-muted-foreground">
                          {new Date(r.submittedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Form buat pertanyaan (FR-801..803) */}
      {showForm && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowForm(false); }}>
          <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
            <DialogTitle>Buat Pertanyaan Rutin</DialogTitle>
            <div className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="ci-q">Pertanyaan <span className="text-destructive">*</span></label>
                <Textarea id="ci-q" rows={2} value={qText} onChange={(e) => setQText(e.target.value)}
                  placeholder='cth: "Apa yang kamu kerjakan minggu ini?" atau "Berapa data penjualan hari ini?"' autoFocus />
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium">Hari kirim <span className="text-destructive">*</span></span>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <button key={d} type="button"
                      onClick={() => setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort())}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${days.includes(d) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                      {DOW_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="ci-time">Jam kirim</label>
                <input id="ci-time" type="time" className="h-9 rounded-md border bg-background px-2 text-xs"
                  value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium">Penerima <span className="text-destructive">*</span></span>
                <AssigneePicker mode="multi" showSourceToggle={false} value={recipients} onChange={setRecipients} />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <p className="text-xs font-medium">Rahasia</p>
                  <p className="text-[10px] text-muted-foreground">Jawaban hanya terlihat oleh pembuat & manager — bukan sesama penerima</p>
                </div>
                <Switch checked={confidential} onCheckedChange={setConfidential} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
                <Button onClick={submitCreate} loading={m.createQuestion.isPending}
                  disabled={!qText.trim() || days.length === 0 || recipients.length === 0}>
                  Buat & Jadwalkan
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
