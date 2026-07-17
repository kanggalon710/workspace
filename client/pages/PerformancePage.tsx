/** Teamspace Fase 3 — Laporan Kinerja terpadu (FR-10xx + FR-1006 + §14):
 *  distribusi status (donut), on-time & cycle time, skor deterministik per anggota
 *  (bintang 1-5), output ops (tiket/lead/collection/canvassing), Kemungkinan
 *  Penghambat (> threshold hari), dan saran AI (Claude) dari angka aktual. */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { ColumnDef } from "@tanstack/react-table";
import { usePerformance, useAiSuggestion, useMyTeams, type PerfUserRow } from "@/hooks/useTeamspace";
import { useAssignableUsers } from "@/hooks/usePipelines";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer, PageSection } from "@/components/ui/page-container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable } from "@/components/ui/data-table";
import { Combobox } from "@/components/ui/combobox";
import { BarChart3, Sparkles, AlertTriangle, CheckSquare, Timer, ClipboardList, Star, Printer } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  belum: "#64748B", dikerjakan: "#F59E0B", terlambat: "#EF4444", selesai: "#22C55E",
};
const STATUS_LABELS: Record<string, string> = {
  belum: "Belum", dikerjakan: "Dikerjakan", terlambat: "Terlambat", selesai: "Selesai",
};

function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const PRESETS = [
  { key: "7", label: "7 Hari", days: 7 },
  { key: "30", label: "30 Hari", days: 30 },
  { key: "90", label: "90 Hari", days: 90 },
];

function Stars({ n }: { n: number | null }) {
  if (n == null) return <span className="text-xs text-muted-foreground">-</span>;
  return (
    <span className="inline-flex" aria-label={`${n} dari 5 bintang`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`size-3.5 ${i <= n ? "fill-warning text-warning" : "text-muted-foreground/30"}`} />
      ))}
    </span>
  );
}

export default function PerformancePage() {
  const [, navigate] = useLocation();
  const [preset, setPreset] = useState("30");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [userId, setUserId] = useState<number | null>(null);

  const to = localDate(new Date());
  const days = PRESETS.find((p) => p.key === preset)?.days ?? 30;
  const from = localDate(new Date(Date.now() - (days - 1) * 86400_000));

  const { data, isLoading, refetch, isRefetching } = usePerformance({ from, to, teamId, userId });
  const { data: myTeams } = useMyTeams({ all: true });
  const { data: users } = useAssignableUsers();
  const nameOf = useMemo(() => {
    const map = new Map((users ?? []).map((u: any) => [u.id, u.name || u.username]));
    return (id: number | null) => (id == null ? "-" : map.get(id) ?? `#${id}`);
  }, [users]);

  const ai = useAiSuggestion();
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const askAi = async () => {
    try {
      const r = await ai.mutateAsync({ from, to, teamId, userId });
      setSuggestion(r.suggestion);
      if (r.cached) toast.info("Saran dari cache hari ini");
    } catch (e: any) {
      toast.error(e?.message || "Gagal membuat saran AI");
    }
  };

  const donutData = useMemo(() => {
    const d = data?.totals.distribution;
    if (!d) return [];
    return (Object.keys(STATUS_LABELS) as Array<keyof typeof d>).map((k) => ({
      key: k, name: STATUS_LABELS[k], value: d[k],
    })).filter((x) => x.value > 0);
  }, [data]);

  const opsTotals = useMemo(() => {
    const acc = { ticketsResolved: 0, leadsWon: 0, collectionsClosed: 0, canvassingReports: 0 };
    for (const u of data?.users ?? []) {
      acc.ticketsResolved += u.ops.ticketsResolved;
      acc.leadsWon += u.ops.leadsWon;
      acc.collectionsClosed += u.ops.collectionsClosed;
      acc.canvassingReports += u.ops.canvassingReports;
    }
    return acc;
  }, [data]);

  const pctStr = (v: number | null) => (v == null ? "-" : `${Math.round(v * 100)}%`);

  const columns = useMemo<ColumnDef<PerfUserRow, any>[]>(() => [
    {
      id: "name", header: "Anggota",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{nameOf(row.original.userId)}</p>
          {row.original.label && (
            <StatusBadge
              variant={row.original.label === "Sangat Baik" ? "success" : row.original.label === "Baik" ? "info" : row.original.label === "Cukup" ? "warning" : "danger"}
              label={row.original.label} size="sm" appearance="subtle"
            />
          )}
        </div>
      ),
    },
    { id: "score", header: "Skor", cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-bold tabular-nums">{row.original.score ?? "-"}</span>
        <Stars n={row.original.stars} />
      </div>
    ) },
    { id: "selesai", header: "Selesai", cell: ({ row }) => <span className="tabular-nums text-xs text-success">{row.original.tasks.selesai}</span> },
    { id: "dikerjakan", header: "Dikerjakan", cell: ({ row }) => <span className="tabular-nums text-xs">{row.original.tasks.dikerjakan}</span> },
    { id: "terlambat", header: "Terlambat", cell: ({ row }) => <span className={`tabular-nums text-xs ${row.original.tasks.terlambat > 0 ? "font-semibold text-destructive" : ""}`}>{row.original.tasks.terlambat}</span> },
    { id: "ontime", header: "On-time", cell: ({ row }) => <span className="tabular-nums text-xs">{pctStr(row.original.onTimeRate)}</span> },
    { id: "checkin", header: "Check-in", cell: ({ row }) => (
      <span className="tabular-nums text-xs">
        {row.original.checkin.expected > 0 ? `${row.original.checkin.responded}/${row.original.checkin.expected}` : "-"}
      </span>
    ) },
    { id: "ops", header: "Output Ops", cell: ({ row }) => {
      const o = row.original.ops;
      return (
        <span className="text-[10px] text-muted-foreground">
          🎫{o.ticketsResolved} · 🎯{o.leadsWon} · 💰{o.collectionsClosed} · 📍{o.canvassingReports}
        </span>
      );
    } },
  ], [nameOf]);

  return (
    <PageContainer>
      <PageHeader
        icon={BarChart3}
        title="Laporan Kinerja"
        description="Tugas internal + output operasional dalam satu penilaian terukur — skor deterministik, AI hanya merangkum"
        accent="violet"
        onRefresh={() => refetch()}
        refreshing={isRefetching}
        actions={
          <Button type="button" variant="outline" size="sm" leftIcon={<Printer className="size-4" />} onClick={() => window.print()}>
            Cetak
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => setPreset(p.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${preset === p.key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="w-40">
            <Combobox
              size="sm"
              placeholder="Semua Tim"
              options={(myTeams ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
              value={teamId == null ? "" : String(teamId)}
              onChange={(v) => setTeamId(v ? Number(v) : null)}
            />
          </div>
          <div className="w-44">
            <Combobox
              size="sm"
              placeholder="Semua Anggota"
              options={(users ?? []).map((u: any) => ({ value: String(u.id), label: u.name || u.username }))}
              value={userId == null ? "" : String(userId)}
              onChange={(v) => setUserId(v ? Number(v) : null)}
            />
          </div>
        </div>
      </PageHeader>

      {isLoading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}</div>
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        </div>
      ) : !data ? (
        <EmptyState icon={BarChart3} title="Tidak ada data" description="Belum ada tugas tim pada periode ini." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile icon={ClipboardList} label="Tugas Aktif (periode)" value={String(data.totals.totalActive)} accent="primary" />
            <StatTile icon={CheckSquare} label="On-time Rate" value={pctStr(data.totals.onTimeRate)} description="selesai ≤ tenggat" accent="success" />
            <StatTile icon={Timer} label="Rata-rata Cycle Time" value={data.totals.avgCycleDays != null ? `${data.totals.avgCycleDays} hari` : "-"} description="dibuat → selesai" accent="info" />
            <StatTile icon={AlertTriangle} label="Kemungkinan Penghambat" value={String(data.blockers.length)} description={`macet > ${data.threshold} hari`} accent={data.blockers.length > 0 ? "danger" : "neutral"} />
          </div>

          <div className="grid gap-3 lg:grid-cols-5">
            {/* Donut distribusi (FR-1002) */}
            <Card variant="elevated" className="lg:col-span-2">
              <h3 className="mb-1 text-sm font-semibold">Distribusi Status Tugas</h3>
              {donutData.length === 0 ? (
                <p className="py-10 text-center text-xs text-muted-foreground">Tidak ada tugas pada periode ini.</p>
              ) : (
                <>
                  {/* BUG-001: width="99%" + key remount = fix ResponsiveContainer 0-width di grid/flex
                      (donut sebelumnya render "blob" saat container terukur 0 pada mount awal). */}
                  <div className="h-52 min-w-0">
                    <ResponsiveContainer width="99%" height="100%" key={donutData.length}>
                      <PieChart>
                        <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={donutData.length > 1 ? 2 : 0} isAnimationActive={false}>
                          {donutData.map((d) => <Cell key={d.key} fill={STATUS_COLORS[d.key]} />)}
                        </Pie>
                        <Tooltip formatter={(v: any, n: any) => [`${v} tugas`, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {donutData.map((d) => {
                      const pct = data.totals.totalActive > 0 ? Math.round((d.value / data.totals.totalActive) * 100) : 0;
                      return (
                        <span key={d.key} className="inline-flex items-center gap-1.5 text-[11px]">
                          <span className="size-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[d.key] }} />
                          {d.name}: <b className="tabular-nums">{d.value}</b> ({pct}%)
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </Card>

            {/* Saran AI (FR-1004) */}
            <Card variant="elevated" className="lg:col-span-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="size-4 text-violet-500" /> Saran AI
                </h3>
                <Button type="button" size="xs" variant="outline-primary" loading={ai.isPending} onClick={askAi}>
                  {suggestion ? "Perbarui Saran" : "Buat Saran"}
                </Button>
              </div>
              {suggestion ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{suggestion}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Satu paragraf rangkuman kondisi kinerja periode ini, dihasilkan Claude dari angka statistik aktual
                  (bukan mengarang). Aktifkan via <code className="rounded bg-muted px-1">teamspace_ai_enabled</code> +{" "}
                  <code className="rounded bg-muted px-1">anthropic_api_key</code> di pengaturan.
                </p>
              )}
              <div className="mt-3 border-t pt-2 text-[10px] text-muted-foreground">
                Output ops periode ini: 🎫 {opsTotals.ticketsResolved} tiket selesai · 🎯 {opsTotals.leadsWon} lead won ·
                💰 {opsTotals.collectionsClosed} collection closed · 📍 {opsTotals.canvassingReports} laporan canvassing
              </div>
            </Card>
          </div>

          {/* Tabel per anggota */}
          <PageSection title="Kinerja per Anggota" description={`Skor deterministik — bobot: on-time ${data.weights.onTime} · penyelesaian ${data.weights.completion} · check-in ${data.weights.checkin} · ops ${data.weights.ops} (konfigurasi: app_settings.teamspace_score_weights)`}>
            {data.users.length === 0 ? (
              <EmptyState icon={BarChart3} size="sm" title="Belum ada aktivitas anggota" description="Skor muncul setelah ada tugas/check-in/output ops pada periode ini." />
            ) : (
              <DataTable columns={columns} data={data.users} searchable={false} emptyTitle="Tidak ada data" />
            )}
          </PageSection>

          {/* Kemungkinan Penghambat (FR-1003) */}
          {data.blockers.length > 0 && (
            <PageSection title="Kemungkinan Penghambat" description={`Tugas belum selesai berumur > ${data.threshold} hari — kandidat untuk ditinjau ulang`}>
              <Card padding="none" className="divide-y overflow-hidden">
                {data.blockers.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => navigate(`/teamspace/boards/${b.pipelineId}?card=${b.id}`)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <AlertTriangle className="size-4 shrink-0 text-destructive" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{b.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {b.teamName ?? "-"} · {nameOf(b.assigneeId)} · status {STATUS_LABELS[b.status] ?? b.status}
                      </p>
                    </div>
                    <StatusBadge variant="danger" label={`${b.ageDays} hari`} size="sm" appearance="solid" />
                  </button>
                ))}
              </Card>
            </PageSection>
          )}
        </>
      )}
    </PageContainer>
  );
}
