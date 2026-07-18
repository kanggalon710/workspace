/** Teamspace v5.0 — Semua Tugas (FR-412): agregasi tugas lintas tim, view List + Tabel.
 *  View Kalender menyusul Fase 2. */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import type { ColumnDef } from "@tanstack/react-table";
import { useAllTasks, type AllTasksResponse } from "@/hooks/useTeamspace";
import { useAssignableUsers } from "@/hooks/usePipelines";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable } from "@/components/ui/data-table";
import { CheckSquare, Search, LayoutList, Table2, AlertTriangle, CalendarClock, ClipboardList, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

type TaskRow = AllTasksResponse["cards"][number];
type DateFilter = "all" | "overdue" | "today" | "soon";
type ViewMode = "list" | "table" | "calendar";

const DATE_FILTERS: Array<{ key: DateFilter; label: string }> = [
  { key: "all", label: "Semua" },
  { key: "overdue", label: "Terlambat" },
  { key: "today", label: "Hari Ini" },
  { key: "soon", label: "Tenggat Segera" },
];

function stageOf(data: AllTasksResponse | undefined, card: TaskRow) {
  return data?.stages?.[card.pipelineId]?.find((s) => s.id === card.stageId);
}

/** Status TENGGAT (FR-410) — beda makna dgn status LIST/Kanban (BUG-009): kolom ini soal
 *  KETEPATAN WAKTU, bukan tahap. Tanpa due date → tak ada badge (LIST sudah menunjukkan tahap).
 *  Selalu ikon+teks, bukan warna saja (NFR-008). */
function dueState(card: TaskRow, doneStage: boolean): { variant: "danger" | "warning" | "neutral" | "success"; label: string } | null {
  const done = (card as any).isCompleted === 1 || doneStage;
  if (!card.dueDate) return null;
  const due = new Date(card.dueDate);
  if (done) {
    const onTime = !card.completedAt || card.completedAt <= card.dueDate;
    return onTime ? { variant: "success", label: "Tepat waktu" } : { variant: "warning", label: "Selesai telat" };
  }
  if (due.getTime() < Date.now()) return { variant: "danger", label: "Terlambat" };
  return { variant: "neutral", label: due.toLocaleDateString("id-ID", { day: "numeric", month: "short" }) };
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso); const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function isSoon(iso: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= Date.now() && t <= Date.now() + 3 * 24 * 3600 * 1000;
}

/** View Kalender tugas (FR-411): 2 bulan berdampingan (BUG-010 — konsisten dengan
 *  Jadwal tim), kartu mini per tanggal tenggat. Menumpuk di layar sempit. */
function TasksCalendar({ cards, teams, onOpen }: {
  cards: TaskRow[];
  teams: AllTasksResponse["teams"];
  onOpen: (c: TaskRow) => void;
}) {
  const today = new Date();
  const [baseMonth, setBaseMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const colorByTeam = useMemo(() => new Map(teams.map((t) => [t.id, t.color])), [teams]);
  const isToday = (d: Date) => d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();

  // dueDate → "y-m-d" key sekali untuk kedua bulan.
  const byDayKey = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    for (const c of cards) {
      if (!c.dueDate) continue;
      const d = new Date(c.dueDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return map;
  }, [cards]);

  const renderMonth = (offset: number) => {
    const view = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + offset, 1);
    const y = view.getFullYear(); const mo = view.getMonth();
    const startPad = (new Date(y, mo, 1).getDay() + 6) % 7;   // Senin = 0
    const daysInMonth = new Date(y, mo + 1, 0).getDate();
    const cells: Array<Date | null> = [
      ...Array.from({ length: startPad }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => new Date(y, mo, i + 1)),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return (
      <div className="min-w-0 flex-1">
        <p className="mb-1.5 text-center text-sm font-bold capitalize">
          {view.toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
        </p>
        <div className="grid grid-cols-7 gap-1">
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => (
            <span key={d} className="py-1 text-center text-[9px] font-semibold text-muted-foreground">{d}</span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={i} className="min-h-16 rounded-lg bg-muted/20" />;
            const dayCards = byDayKey.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) ?? [];
            return (
              <div key={i} className={`min-h-16 rounded-lg border p-1 ${isToday(d) ? "border-primary bg-primary/5" : "border-transparent bg-muted/30"}`}>
                <p className={`mb-0.5 text-right text-[10px] tabular-nums ${isToday(d) ? "font-bold text-primary" : "text-muted-foreground"}`}>{d.getDate()}</p>
                <div className="space-y-0.5">
                  {dayCards.slice(0, 3).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onOpen(c)}
                      title={`${c.title} — ${c.teamName ?? ""}`}
                      className="flex w-full items-center gap-1 rounded bg-background px-1 py-0.5 text-left shadow-sm ring-1 ring-border transition-colors hover:bg-muted"
                    >
                      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: colorByTeam.get(c.teamId ?? -1) ?? "#94A3B8" }} />
                      <span className="truncate text-[9px] leading-tight">{c.title}</span>
                    </button>
                  ))}
                  {dayCards.length > 3 && <p className="text-center text-[8px] text-muted-foreground">+{dayCards.length - 3} lagi</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-end gap-1">
        <button type="button" aria-label="Bulan sebelumnya"
          onClick={() => setBaseMonth((b) => new Date(b.getFullYear(), b.getMonth() - 1, 1))}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
          <ChevronLeft className="size-4" />
        </button>
        <button type="button" onClick={() => setBaseMonth(new Date(today.getFullYear(), today.getMonth(), 1))}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
          Hari Ini
        </button>
        <button type="button" aria-label="Bulan berikutnya"
          onClick={() => setBaseMonth((b) => new Date(b.getFullYear(), b.getMonth() + 1, 1))}
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
          <ChevronRight className="size-4" />
        </button>
      </div>
      {/* 2 bulan berdampingan di layar lebar — konsisten dengan tab Jadwal tim (FR-702) */}
      <div className="flex flex-col gap-4 xl:flex-row">
        {renderMonth(0)}
        <div className="hidden w-px bg-border xl:block" aria-hidden="true" />
        {renderMonth(1)}
      </div>
    </div>
  );
}

export default function AllTasksPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { data, isLoading, refetch, isRefetching } = useAllTasks();
  const { data: users } = useAssignableUsers();
  const usersById = useMemo(() => new Map((users ?? []).map((u: any) => [u.id, u.name || u.username])), [users]);

  const [view, setView] = useState<ViewMode>("list");
  const [q, setQ] = useState("");
  const [teamFilter, setTeamFilter] = useState<number | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [mineOnly, setMineOnly] = useState(false);

  const doneStageIds = useMemo(() => {
    const s = new Set<number>();
    for (const stages of Object.values(data?.stages ?? {})) {
      for (const st of stages) {
        if ((st as any).semanticType === "done" || (st as any).semanticType === "cancelled") s.add(st.id);
      }
    }
    return s;
  }, [data]);

  const filtered = useMemo(() => {
    let rows = data?.cards ?? [];
    if (teamFilter != null) rows = rows.filter((c) => c.teamId === teamFilter);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      rows = rows.filter((c) => c.title.toLowerCase().includes(needle) || c.labels.some((l) => l.name.toLowerCase().includes(needle)));
    }
    if (mineOnly && user) {
      rows = rows.filter((c) => c.assigneeId === user.id || c.secondaryAssigneeIds.includes(user.id) || c.createdBy === user.id);
    }
    if (dateFilter !== "all") {
      rows = rows.filter((c) => {
        const done = (c as any).isCompleted === 1 || doneStageIds.has(c.stageId);
        if (dateFilter === "overdue") return !done && c.dueDate != null && new Date(c.dueDate).getTime() < Date.now();
        if (dateFilter === "today") return !done && isToday(c.dueDate);
        return !done && isSoon(c.dueDate);
      });
    }
    return rows;
  }, [data, q, teamFilter, dateFilter, mineOnly, user, doneStageIds]);

  const stats = useMemo(() => {
    const rows = data?.cards ?? [];
    const done = rows.filter((c) => (c as any).isCompleted === 1 || doneStageIds.has(c.stageId)).length;
    const overdue = rows.filter((c) => !((c as any).isCompleted === 1 || doneStageIds.has(c.stageId)) && c.dueDate && new Date(c.dueDate).getTime() < Date.now()).length;
    const today = rows.filter((c) => !((c as any).isCompleted === 1 || doneStageIds.has(c.stageId)) && isToday(c.dueDate)).length;
    return { total: rows.length, done, overdue, today };
  }, [data, doneStageIds]);

  const openCard = (c: TaskRow) => navigate(`/teamspace/boards/${c.pipelineId}?card=${c.id}`);

  const columns = useMemo<ColumnDef<TaskRow, any>[]>(() => [
    {
      accessorKey: "title", header: "Tugas",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.original.title}</p>
          {row.original.labels.length > 0 && (
            <span className="mt-0.5 flex gap-1">
              {row.original.labels.slice(0, 4).map((l) => (
                <span key={l.id} className="inline-block h-1.5 w-5 rounded-full" style={{ backgroundColor: l.colorHex }} title={l.name} />
              ))}
            </span>
          )}
        </div>
      ),
    },
    { accessorKey: "teamName", header: "Tim", cell: ({ row }) => <span className="text-xs">{row.original.teamName ?? "-"}</span> },
    {
      id: "stage", header: "List",
      cell: ({ row }) => {
        const st = stageOf(data, row.original);
        return st ? <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${st.color}1A`, color: st.color }}>{st.label}</span> : "-";
      },
    },
    {
      accessorKey: "dueDate", header: "Tenggat",
      cell: ({ row }) => {
        const ds = dueState(row.original, doneStageIds.has(row.original.stageId));
        return ds ? <StatusBadge variant={ds.variant === "neutral" ? "pending" : ds.variant} label={ds.label} size="sm" appearance="subtle" /> : <span className="text-xs text-muted-foreground">-</span>;
      },
    },
    {
      id: "assignee", header: "Penanggung Jawab",
      cell: ({ row }) => <span className="text-xs">{row.original.assigneeId ? (usersById.get(row.original.assigneeId) ?? `#${row.original.assigneeId}`) : "-"}</span>,
    },
    {
      id: "checklist", header: "Checklist",
      cell: ({ row }) => {
        const p = row.original.checklistProgress;
        return p && p.total > 0 ? <span className="text-xs tabular-nums text-muted-foreground">{p.done}/{p.total}</span> : null;
      },
    },
  ], [data, usersById, doneStageIds]);

  return (
    <PageContainer>
      <PageHeader
        icon={CheckSquare}
        title="Semua Tugas"
        description="Agregasi tugas dari seluruh tim yang Anda ikuti — satu tempat untuk prioritas hari ini"
        accent="violet"
        onRefresh={() => refetch()}
        refreshing={isRefetching}
        actions={
          <div className="flex items-center gap-1 rounded-lg border p-0.5">
            <button
              type="button"
              onClick={() => setView("list")}
              aria-pressed={view === "list"}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${view === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              <LayoutList className="size-3.5" /> List
            </button>
            <button
              type="button"
              onClick={() => setView("calendar")}
              aria-pressed={view === "calendar"}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${view === "calendar" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              <CalendarDays className="size-3.5" /> Kalender
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              aria-pressed={view === "table"}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${view === "table" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              <Table2 className="size-3.5" /> Tabel
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full max-w-xs">
              <Input inputSize="sm" leftIcon={<Search className="size-3.5" />} placeholder="Cari tugas / label…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button
              type="button"
              onClick={() => setMineOnly((v) => !v)}
              aria-pressed={mineOnly}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${mineOnly ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              Tugas saya
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
            {DATE_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setDateFilter(f.key)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${dateFilter === f.key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
              >
                {f.label}
              </button>
            ))}
            <span className="mx-1 w-px shrink-0 bg-border" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setTeamFilter(null)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${teamFilter == null ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              Semua Tim
            </button>
            {(data?.teams ?? []).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTeamFilter(teamFilter === t.id ? null : t.id)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${teamFilter === t.id ? "text-white" : "text-muted-foreground hover:bg-muted"}`}
                style={teamFilter === t.id ? { backgroundColor: t.color, borderColor: t.color } : undefined}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={ClipboardList} label="Total Tugas" value={String(stats.total)} accent="primary" />
        <StatTile icon={CheckSquare} label="Selesai" value={String(stats.done)} accent="success" />
        <StatTile icon={CalendarClock} label="Jatuh Tempo Hari Ini" value={String(stats.today)} accent={stats.today > 0 ? "warning" : "neutral"} />
        <StatTile icon={AlertTriangle} label="Terlambat" value={String(stats.overdue)} accent={stats.overdue > 0 ? "danger" : "neutral"} />
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title={(data?.cards?.length ?? 0) === 0 ? "Belum ada tugas" : "Tidak ada tugas yang cocok filter"}
          description={(data?.cards?.length ?? 0) === 0
            ? "Tugas dari board semua tim Anda akan terkumpul di sini. Buka sebuah tim lalu buat kartu pertama."
            : "Coba ubah kata kunci, tim, atau kategori tanggal."}
        />
      ) : view === "table" ? (
        <DataTable
          columns={columns}
          data={filtered}
          searchable={false}
          onRowClick={openCard}
          emptyTitle="Tidak ada tugas"
        />
      ) : view === "calendar" ? (
        <TasksCalendar cards={filtered} teams={data?.teams ?? []} onOpen={openCard} />
      ) : (
        <div className="space-y-4">
          {(data?.teams ?? [])
            .filter((t) => (teamFilter == null || t.id === teamFilter) && filtered.some((c) => c.teamId === t.id))
            .map((t) => {
              const rows = filtered.filter((c) => c.teamId === t.id);
              return (
                <section key={t.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: t.color }} aria-hidden="true" />
                    <h3 className="text-sm font-semibold">{t.name}</h3>
                    <span className="text-xs tabular-nums text-muted-foreground">{rows.length} tugas</span>
                  </div>
                  <Card padding="none" className="divide-y overflow-hidden">
                    {rows.map((c) => {
                      const st = stageOf(data, c);
                      const ds = dueState(c, doneStageIds.has(c.stageId));
                      const cp = c.checklistProgress;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => openCard(c)}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60"
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: st?.color ?? "#94A3B8" }} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{c.title}</p>
                            <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span>{st?.label ?? "-"}</span>
                              {c.assigneeId != null && <span>· {usersById.get(c.assigneeId) ?? `#${c.assigneeId}`}</span>}
                              {cp && cp.total > 0 && <span className="tabular-nums">· ☑ {cp.done}/{cp.total}</span>}
                            </p>
                          </div>
                          {c.labels.slice(0, 3).map((l) => (
                            <span key={l.id} className="hidden h-1.5 w-5 shrink-0 rounded-full sm:inline-block" style={{ backgroundColor: l.colorHex }} title={l.name} />
                          ))}
                          {ds && <StatusBadge variant={ds.variant === "neutral" ? "pending" : ds.variant} label={ds.label} size="sm" appearance="subtle" />}
                        </button>
                      );
                    })}
                  </Card>
                </section>
              );
            })}
        </div>
      )}
    </PageContainer>
  );
}
