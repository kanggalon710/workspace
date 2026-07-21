/** Teamspace Fase 2 - Jadwal tim (FR-7xx): kalender 2 bulan berdampingan (gaya Cicle),
 *  form event dengan pengulangan + peserta + Rahasia, dan feed iCal (webcal). */
import { useMemo, useState } from "react";
import { useTeamEvents, useEventMutations, type TeamEventRow } from "@/hooks/useTeamspace";
import { useAssignableUsers } from "@/hooks/usePipelines";
import { expandOccurrences, RECURRENCE_LABELS, parseEventRecurrence, type EventFreq } from "@shared/eventRecurrence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AssigneePicker } from "@/components/pipelines/AssigneePicker";
import { CalendarDays, Plus, ChevronLeft, ChevronRight, Repeat, Lock, Trash2, Link2, Copy } from "lucide-react";
import { toast } from "sonner";

interface Props {
  teamId: number;
  canManage: boolean;
  active: boolean;
}

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const DOW_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function sameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Grid satu bulan: sel mulai Senin, null = padding. */
function monthGrid(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;   // Senin = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from({ length: startPad }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function SchedulePanel({ teamId, canManage, active }: Props) {
  const { data: events, isLoading } = useTeamEvents(teamId, active);
  const m = useEventMutations(teamId);
  const { data: users } = useAssignableUsers();
  const nameOf = useMemo(() => {
    const map = new Map((users ?? []).map((u: any) => [u.id, u.name || u.username]));
    return (id: number) => map.get(id) ?? `#${id}`;
  }, [users]);

  const today = new Date();
  const [baseMonth, setBaseMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<Date>(today);

  // Ekspansi occurrence untuk 2 bulan tampil (recurring dihitung client - helper shared yang sama dipakai .ics).
  const rangeStart = baseMonth;
  const rangeEnd = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 2, 0, 23, 59, 59);
  const occurrences = useMemo(() => {
    const out: Array<{ ev: TeamEventRow; start: Date; end: Date }> = [];
    for (const ev of events ?? []) {
      for (const occ of expandOccurrences(ev, rangeStart, rangeEnd)) {
        out.push({ ev, start: occ.start, end: occ.end });
      }
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [events, rangeStart.getTime(), rangeEnd.getTime()]);

  const eventsOn = (d: Date) => occurrences.filter((o) => sameDate(o.start, d));
  const dayEvents = eventsOn(selectedDay);

  // -- Form event --
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [freq, setFreq] = useState<EventFreq>("none");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [confidential, setConfidential] = useState(false);
  const [notes, setNotes] = useState("");

  const openCreate = () => {
    const base = new Date(selectedDay); base.setHours(9, 0, 0, 0);
    setEditId(null); setTitle(""); setStartAt(toLocalInput(base));
    setEndAt(toLocalInput(new Date(base.getTime() + 3600_000)));
    setFreq("none"); setParticipantIds([]); setConfidential(false); setNotes("");
    setShowForm(true);
  };

  const openEdit = (ev: TeamEventRow) => {
    setEditId(ev.id); setTitle(ev.title);
    setStartAt(toLocalInput(new Date(ev.startAt))); setEndAt(toLocalInput(new Date(ev.endAt)));
    setFreq(parseEventRecurrence(ev.recurrence).freq);
    setParticipantIds(ev.participantIds.map(String));
    setConfidential(ev.isConfidential === 1); setNotes(ev.notes ?? "");
    setShowForm(true);
  };

  const submit = async () => {
    if (!title.trim() || !startAt || !endAt) return;
    const payload = {
      title: title.trim(),
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      recurrence: freq === "none" ? null : { freq, interval: 1 },
      isConfidential: confidential,
      notes: notes.trim() || undefined,
      participantIds: participantIds.map(Number),
    };
    try {
      if (editId != null) await m.updateEvent.mutateAsync({ id: editId, ...payload });
      else await m.createEvent.mutateAsync(payload);
      toast.success(editId != null ? "Acara diperbarui" : "Acara dibuat");
      setShowForm(false);
    } catch (e: any) {
      toast.error(e?.message || "Gagal menyimpan acara");
    }
  };

  const removeEvent = async (id: number) => {
    try {
      await m.deleteEvent.mutateAsync(id);
      toast.success("Acara dihapus");
      setShowForm(false);
    } catch (e: any) {
      toast.error(e?.message || "Gagal menghapus acara");
    }
  };

  // -- Feed iCal --
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const getFeed = async () => {
    try {
      const r = await m.getFeedToken.mutateAsync(false);
      setFeedUrl(`${window.location.origin}/api/teamspace/teams/${teamId}/calendar.ics?feedToken=${r.feedToken}`);
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat feed");
    }
  };

  const renderMonth = (offset: number) => {
    const y = baseMonth.getFullYear();
    const mo = baseMonth.getMonth() + offset;
    const view = new Date(y, mo, 1);
    const cells = monthGrid(view.getFullYear(), view.getMonth());
    return (
      <div className="flex-1 min-w-0">
        <p className="mb-1.5 text-center text-xs font-bold">{MONTH_NAMES[view.getMonth()]} {view.getFullYear()}</p>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {DOW_SHORT.map((d) => <span key={d} className="py-1 text-[9px] font-semibold text-muted-foreground">{d}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const evs = eventsOn(d);
            const isToday = sameDate(d, today);
            const isSelected = sameDate(d, selectedDay);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedDay(d)}
                className={`relative rounded-md py-1.5 text-[11px] tabular-nums transition-colors
                  ${isSelected ? "bg-primary text-primary-foreground font-bold" : isToday ? "bg-primary/10 font-bold text-primary" : "hover:bg-muted"}`}
              >
                {d.getDate()}
                {evs.length > 0 && (
                  <span className={`absolute bottom-0.5 left-1/2 flex -translate-x-1/2 gap-0.5`} aria-hidden="true">
                    {evs.slice(0, 3).map((_, j) => (
                      <span key={j} className={`size-1 rounded-full ${isSelected ? "bg-primary-foreground" : "bg-primary"}`} />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Bulan sebelumnya"
            onClick={() => setBaseMonth((b) => new Date(b.getFullYear(), b.getMonth() - 1, 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={() => { setBaseMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(today); }}>
            Hari Ini
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Bulan berikutnya"
            onClick={() => setBaseMonth((b) => new Date(b.getFullYear(), b.getMonth() + 1, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="xs" leftIcon={<Link2 className="size-3.5" />} onClick={getFeed}>
            Sinkron Kalender
          </Button>
          {canManage && (
            <Button type="button" size="sm" leftIcon={<Plus className="size-4" />} onClick={openCreate}>
              Buat Acara
            </Button>
          )}
        </div>
      </div>

      {feedUrl && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <p className="min-w-0 flex-1 truncate font-mono-tight text-[10px] text-muted-foreground">{feedUrl}</p>
          <Button type="button" variant="outline" size="xs" leftIcon={<Copy className="size-3" />}
            onClick={() => { navigator.clipboard.writeText(feedUrl).then(() => toast.success("URL feed disalin - tempel di Google Calendar → Add calendar → From URL")); }}>
            Salin
          </Button>
        </div>
      )}

      {/* 2 bulan berdampingan (FR-702); mobile: menumpuk */}
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-3 sm:flex-row">
        {renderMonth(0)}
        <div className="hidden w-px bg-border sm:block" aria-hidden="true" />
        {renderMonth(1)}
      </div>

      {/* Daftar acara pada hari terpilih */}
      <section>
        <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
          Acara - {selectedDay.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}
        </h4>
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        ) : dayEvents.length === 0 ? (
          <EmptyState icon={CalendarDays} size="sm" title="Tidak ada acara"
            description={canManage ? "Klik tanggal lalu Buat Acara untuk menjadwalkan." : "Belum ada acara pada tanggal ini."} />
        ) : (
          <div className="space-y-1.5">
            {dayEvents.map(({ ev, start, end }, i) => {
              const rec = parseEventRecurrence(ev.recurrence);
              return (
                <button
                  key={`${ev.id}-${i}`}
                  type="button"
                  onClick={() => canManage && openEdit(ev)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left ${canManage ? "transition-colors hover:bg-muted/60" : "cursor-default"}`}
                >
                  <span className="w-20 shrink-0 text-xs font-bold tabular-nums">
                    {start.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    <span className="block text-[9px] font-normal text-muted-foreground">
                      s/d {end.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {ev.title}
                      {ev.isConfidential === 1 && <Lock className="ml-1 inline size-3 text-warning" aria-label="Rahasia" />}
                    </p>
                    <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      {rec.freq !== "none" && <span className="inline-flex items-center gap-0.5"><Repeat className="size-3" /> {RECURRENCE_LABELS[rec.freq]}</span>}
                      {ev.participantIds.length > 0 && <span>{ev.participantIds.length} peserta</span>}
                    </p>
                  </div>
                  {sameDate(start, today) && <StatusBadge variant="info" label="Hari ini" size="sm" appearance="subtle" />}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Form event (buat/edit) */}
      {showForm && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowForm(false); }}>
          <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
            <DialogTitle>{editId != null ? "Ubah Acara" : "Buat Acara"}</DialogTitle>
            <div className="space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="ev-title">Nama acara <span className="text-destructive">*</span></label>
                <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="cth: Standup mingguan NOC" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor="ev-start">Mulai</label>
                  <input id="ev-start" type="datetime-local" className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                    value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium" htmlFor="ev-end">Selesai</label>
                  <input id="ev-end" type="datetime-local" className="h-9 w-full rounded-md border bg-background px-2 text-xs"
                    value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                </div>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium">Ulangi</span>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(RECURRENCE_LABELS) as EventFreq[]).map((f) => (
                    <button key={f} type="button" onClick={() => setFreq(f)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${freq === f ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                      {RECURRENCE_LABELS[f]}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1 block text-xs font-medium">Peserta</span>
                <AssigneePicker mode="multi" showSourceToggle={false} value={participantIds} onChange={setParticipantIds} />
              </div>
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <p className="text-xs font-medium">Rahasia</p>
                  <p className="text-[10px] text-muted-foreground">Hanya peserta & pembuat yang bisa melihat acara ini</p>
                </div>
                <Switch checked={confidential} onCheckedChange={setConfidential} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium" htmlFor="ev-notes">Catatan</label>
                <Textarea id="ev-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Agenda, link meeting, dsb." />
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                {editId != null ? (
                  <Button type="button" variant="outline" size="sm"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    leftIcon={<Trash2 className="size-3.5" />} loading={m.deleteEvent.isPending}
                    onClick={() => removeEvent(editId)}>
                    Hapus
                  </Button>
                ) : <span />}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
                  <Button onClick={submit} loading={m.createEvent.isPending || m.updateEvent.isPending} disabled={!title.trim()}>
                    {editId != null ? "Simpan" : "Buat Acara"}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
