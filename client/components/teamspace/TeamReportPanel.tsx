/** Laporan tim di tab Ringkasan (gaya Cicle "Rekap Laporan Kinerja"):
 *  donut ringkasan status + saran, Kemungkinan Penghambat (tugas mandek),
 *  total tugas per list, dan rangkuman poin tugas grouped by status.
 *  Semua dihitung client-side dari useAllTasks() - tanpa endpoint baru. */
import { useMemo, useState } from "react";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useLocation } from "wouter";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { useAllTasks } from "@/hooks/useTeamspace";
import { useAssignableUsers } from "@/hooks/usePipelines";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSection } from "@/components/ui/page-container";
import { ClipboardList, Lightbulb, AlertTriangle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  belum: "#64748B", dikerjakan: "#F59E0B", terlambat: "#EF4444", selesai: "#22C55E",
};
const STATUS_LABELS: Record<string, string> = {
  belum: "Belum", dikerjakan: "Dikerjakan", terlambat: "Terlambat", selesai: "Selesai",
};
type StatusKey = keyof typeof STATUS_LABELS;
const STALE_DAYS = 7;

interface Props {
  teamId: number;
  teamName: string;
}

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400_000);
}

function fmtShortDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function TeamReportPanel({ teamId, teamName }: Props) {
  const { data, isLoading } = useAllTasks();
  const { data: users } = useAssignableUsers();
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<"semua" | StatusKey>("semua");

  const nameOf = useMemo(() => {
    const map = new Map((users ?? []).map((u: any) => [u.id, u.name || u.username]));
    return (id: number | null) => (id != null ? map.get(id) ?? `#${id}` : null);
  }, [users]);

  const report = useMemo(() => {
    if (!data) return null;
    const teamMeta = data.teams.find((t) => t.id === teamId);
    const stages = teamMeta ? (data.stages[teamMeta.pipelineId] ?? []) : [];
    const stageById = new Map(stages.map((s) => [s.id, s]));
    const cards = data.cards.filter((c) => c.teamId === teamId && !(c as any).archivedAt);

    const today = new Date().toISOString().slice(0, 10);
    const statusOf = (c: (typeof cards)[number]): StatusKey | "batal" => {
      const sem = (stageById.get(c.stageId) as any)?.semanticType;
      if (sem === "cancelled") return "batal";
      if (c.isCompleted || sem === "done") return "selesai";
      if (c.dueDate && c.dueDate.slice(0, 10) < today) return "terlambat";
      if (sem === "in_progress") return "dikerjakan";
      return "belum";
    };

    const byStatus: Record<StatusKey, typeof cards> = { belum: [], dikerjakan: [], terlambat: [], selesai: [] };
    const perStage = stages.map((s) => ({ id: s.id, name: s.label, color: (s as any).color as string | null, count: 0 }));
    const perStageById = new Map(perStage.map((s) => [s.id, s]));
    for (const c of cards) {
      const st = statusOf(c);
      if (st !== "batal") byStatus[st].push(c);
      const row = perStageById.get(c.stageId);
      if (row) row.count += 1;
    }
    const active = byStatus.belum.length + byStatus.dikerjakan.length + byStatus.terlambat.length + byStatus.selesai.length;

    // Kemungkinan Penghambat (gaya Cicle): tugas menganggur/mandek > STALE_DAYS hari.
    const oldestFirst = (arr: typeof cards, dateOf: (c: (typeof cards)[number]) => string | null | undefined) =>
      [...arr].sort((a, b) => String(dateOf(a) ?? "") < String(dateOf(b) ?? "") ? -1 : 1);
    const staleTodo = oldestFirst(byStatus.belum.filter((c) => (daysSince(c.createdAt) ?? 0) > STALE_DAYS), (c) => c.createdAt);
    const staleDoing = oldestFirst(
      [...byStatus.dikerjakan, ...byStatus.terlambat.filter((c) => (stageById.get(c.stageId) as any)?.semanticType === "in_progress")]
        .filter((c) => (daysSince(c.stageEnteredAt ?? c.createdAt) ?? 0) > STALE_DAYS),
      (c) => c.stageEnteredAt ?? c.createdAt,
    );

    // Saran deterministik dari angka (AI mendalam ada di Laporan Kinerja).
    let saran: string;
    if (active === 0) saran = "Belum ada tugas aktif - mulai isi board untuk melihat rekap di sini.";
    else if (byStatus.terlambat.length > 0) saran = `Ada ${byStatus.terlambat.length} tugas melewati tenggat - prioritaskan penyelesaiannya atau sesuaikan tenggat bila tidak realistis.`;
    else if (staleDoing.length > 0) saran = `${staleDoing.length} tugas mandek di Dikerjakan > ${STALE_DAYS} hari - cek hambatannya di stand-up berikutnya.`;
    else if (staleTodo.length > 0) saran = `${staleTodo.length} tugas belum tersentuh > ${STALE_DAYS} hari - pertimbangkan re-prioritas atau delegasi.`;
    else saran = "Kinerja tim cukup dan cenderung stabil - pertahankan ritme penyelesaian tugas.";

    return { teamMeta, cards, byStatus, perStage, active, staleTodo, staleDoing, saran, statusOf };
  }, [data, teamId]);

  if (isLoading || !report) {
    return <div className="h-60 animate-pulse rounded-xl bg-muted" />;
  }

  const { byStatus, perStage, active, staleTodo, staleDoing, saran, teamMeta } = report;
  const donutData = (Object.keys(STATUS_LABELS) as StatusKey[])
    .map((k) => ({ key: k, name: STATUS_LABELS[k], value: byStatus[k].length }))
    .filter((d) => d.value > 0);

  const openCard = (c: any) => {
    if (teamMeta) navigate(`/teamspace/boards/${teamMeta.pipelineId}?card=${c.id}`);
  };

  const groupsToShow: StatusKey[] = statusFilter === "semua"
    ? (["terlambat", "dikerjakan", "belum", "selesai"] as StatusKey[])
    : [statusFilter];

  return (
    <>
      {/* -- Ringkasan Tugas + Saran (gaya Cicle: donut + saran berdampingan) -- */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card padding="md">
          <p className="text-sm font-semibold">Ringkasan Tugas</p>
          {donutData.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">Belum ada tugas aktif di tim ini.</p>
          ) : (
            <div className="flex items-center gap-4">
              {/* BUG-001 pattern: width 99% + key remount */}
              <div className="h-44 min-w-0 flex-1">
                <ResponsiveContainer width="99%" height="100%" key={donutData.length}>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={68} paddingAngle={donutData.length > 1 ? 2 : 0} isAnimationActive={false}>
                      {donutData.map((d) => <Cell key={d.key} fill={STATUS_COLORS[d.key]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, n: any) => [`${v} tugas`, n]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid shrink-0 gap-1.5">
                <span className="text-[11px] text-muted-foreground">Semua: <b className="tabular-nums">{active}</b></span>
                {donutData.map((d) => (
                  <span key={d.key} className="inline-flex items-center gap-1.5 text-[11px]">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[d.key] }} />
                    {d.name}: <b className="tabular-nums">{d.value}</b> ({active > 0 ? Math.round((d.value / active) * 100) : 0}%)
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
        <Card padding="md">
          <p className="inline-flex items-center gap-1.5 text-sm font-semibold"><Lightbulb className="size-4 text-warning" /> Saran</p>
          <p className="mt-2 text-sm text-muted-foreground">{saran}</p>
        </Card>
      </div>

      {/* -- Kemungkinan Penghambat -- */}
      <PageSection title="Kemungkinan Penghambat" description={`Tugas yang menganggur atau mandek lebih dari ${STALE_DAYS} hari`}>
        <div className="grid gap-3 md:grid-cols-2">
          {[{ title: "belum dikerjakan", list: staleTodo, hint: "belum tersentuh sejak dibuat" },
            { title: "sedang dikerjakan", list: staleDoing, hint: "mandek di list Dikerjakan" }].map((b) => (
            <Card key={b.title} padding="md">
              <p className="text-sm font-semibold text-primary tabular-nums">
                {b.list.length} dari {active} tugas yg {b.title}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{b.hint} &gt; {STALE_DAYS} hari</p>
              <p className="mt-3 text-xs font-medium text-muted-foreground">Terlama:</p>
              {b.list.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground/70">Tidak ada - aman.</p>
              ) : (
                <button type="button" onClick={() => openCard(b.list[0])} className="mt-1 flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs hover:bg-muted">
                  <AlertTriangle className="size-3.5 shrink-0 text-warning" />
                  <span className="min-w-0 flex-1 truncate">{b.list[0].title}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{daysSince(b.list[0].stageEnteredAt ?? b.list[0].createdAt)} hari</span>
                </button>
              )}
            </Card>
          ))}
        </div>
      </PageSection>

      {/* -- Total Tugas per List -- */}
      <PageSection title="Total Tugas per List">
        <Card padding="none" className="divide-y overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40">
            <span className="text-sm font-semibold">{teamName}</span>
            <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary">{report.cards.length}</span>
          </div>
          {perStage.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5 px-4 py-2">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color ?? "#94A3B8" }} />
              <span className="text-sm">{s.name}</span>
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{s.count}</span>
            </div>
          ))}
        </Card>
      </PageSection>

      {/* -- Rangkuman poin-poin Tugas -- */}
      <PageSection title="Rangkuman Poin Tugas" description="Klik tugas untuk membuka kartunya di board">
        <ScrollRow bleed="mobile" className="gap-1.5">
          {(["semua", "terlambat", "dikerjakan", "belum", "selesai"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setStatusFilter(k)}
              aria-pressed={statusFilter === k}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors
                ${statusFilter === k ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              {k === "semua" ? "Semua" : STATUS_LABELS[k]}
            </button>
          ))}
        </ScrollRow>
        {active === 0 ? (
          <EmptyState icon={ClipboardList} size="sm" title="Belum ada tugas" description="Rekap muncul setelah board tim terisi." />
        ) : (
          <div className="mt-2 space-y-3">
            {groupsToShow.map((k) => {
              const rows = byStatus[k];
              if (rows.length === 0) return null;
              return (
                <div key={k}>
                  <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <span className="size-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[k] }} />
                    {STATUS_LABELS[k]} ({rows.length})
                  </p>
                  <Card padding="none" className="divide-y overflow-hidden">
                    {rows.map((c) => {
                      const assignee = nameOf(c.assigneeId);
                      const stageName = perStage.find((s) => s.id === c.stageId)?.name ?? "-";
                      return (
                        <button key={c.id} type="button" onClick={() => openCard(c)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/50 transition-colors">
                          <span className="min-w-0 flex-1 truncate text-sm">{c.title}</span>
                          {(c as any).labels?.length > 0 && (
                            <span className="hidden shrink-0 gap-1 sm:flex">
                              {(c as any).labels.slice(0, 2).map((l: any) => (
                                <span key={l.id} className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white" style={{ backgroundColor: l.color }}>{l.name}</span>
                              ))}
                            </span>
                          )}
                          <span className="hidden w-16 shrink-0 text-xs tabular-nums text-muted-foreground sm:block">{fmtShortDate(c.dueDate)}</span>
                          <span className="hidden w-24 shrink-0 truncate text-xs text-muted-foreground md:block">{assignee ?? "-"}</span>
                          <span className="w-20 shrink-0 truncate text-right text-xs text-muted-foreground">{stageName}</span>
                        </button>
                      );
                    })}
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </PageSection>
    </>
  );
}
