/** Modul SDM / HRD Fase 1 (adaptasi SDM_Jabnet.xlsx): Catat Kehadiran harian,
 *  Rekap bulanan (laporan kehadiran), dan Cuti (self-service + approval HR).
 *  Karyawan = user aktif apps (langsung "ngelink" — tanpa master data ganda). */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useAssignableUsers } from "@/hooks/usePipelines";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer, PageSection } from "@/components/ui/page-container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { IdCard, CalendarCheck2, BarChart3, Plane, Save, Check, X } from "lucide-react";
import { toast } from "sonner";

const ATT_STATUSES = [
  { key: "hadir", label: "Hadir", variant: "success" },
  { key: "izin", label: "Izin", variant: "info" },
  { key: "sakit", label: "Sakit", variant: "warning" },
  { key: "cuti", label: "Cuti", variant: "pending" },
  { key: "alpha", label: "Alpha", variant: "danger" },
  { key: "libur", label: "Libur", variant: "neutral" },
] as const;
const LEAVE_TYPES = [["tahunan", "Cuti Tahunan"], ["sakit", "Sakit"], ["izin", "Izin"], ["khusus", "Cuti Khusus"]] as const;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SdmPage() {
  const { user, canWrite, canRead } = useAuth();
  const writable = canWrite("hr_sdm");
  const readable = canRead("hr_sdm");
  const qc = useQueryClient();
  const { data: users } = useAssignableUsers();
  const activeUsers = useMemo(() => (users ?? []).filter((u: any) => u.isActive !== 0), [users]);
  const nameOf = (id: number | null) => {
    const u = (users ?? []).find((x: any) => x.id === id);
    return u ? (u.name || u.username) : id != null ? `#${id}` : "–";
  };

  const [tab, setTab] = useState<"kehadiran" | "rekap" | "cuti">(readable ? "kehadiran" : "cuti");
  const [date, setDate] = useState(todayIso());
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  // Draft kehadiran: userId -> status (belum tersimpan)
  const [draft, setDraft] = useState<Record<number, string>>({});

  const { data: attendance } = useQuery({
    queryKey: ["/api/hr/attendance", date],
    queryFn: () => api.get<any[]>(`/hr/attendance?date=${date}`),
    enabled: readable && tab === "kehadiran",
  });
  const { data: summary } = useQuery({
    queryKey: ["/api/hr/attendance/summary", month],
    queryFn: () => api.get<Array<{ userId: number; status: string; c: number }>>(`/hr/attendance/summary?month=${month}`),
    enabled: readable && tab === "rekap",
  });
  const { data: leaves } = useQuery({
    queryKey: ["/api/hr/leaves", readable],
    queryFn: () => api.get<any[]>(`/hr/leaves${readable ? "" : "?mine=1"}`),
    enabled: tab === "cuti",
  });

  const savedByUser = useMemo(() => new Map((attendance ?? []).map((a) => [a.userId, a])), [attendance]);
  const statusFor = (uid: number) => draft[uid] ?? savedByUser.get(uid)?.status ?? "";

  const saveAttendance = useMutation({
    mutationFn: () => api.post(`/hr/attendance`, {
      records: Object.entries(draft).map(([uid, status]) => ({ userId: Number(uid), date, status })),
    }),
    onSuccess: () => {
      toast.success("Kehadiran tersimpan");
      setDraft({});
      qc.invalidateQueries({ queryKey: ["/api/hr/attendance"] });
    },
    onError: (e: any) => toast.error(e?.message || "Gagal menyimpan"),
  });

  // ── Cuti ──
  const [leaveForm, setLeaveForm] = useState({ startDate: todayIso(), endDate: todayIso(), type: "tahunan", reason: "" });
  const createLeave = useMutation({
    mutationFn: () => api.post(`/hr/leaves`, leaveForm),
    onSuccess: () => {
      toast.success("Pengajuan cuti terkirim — menunggu persetujuan HR");
      qc.invalidateQueries({ queryKey: ["/api/hr/leaves"] });
    },
    onError: (e: any) => toast.error(e?.message || "Gagal mengajukan cuti"),
  });
  const reviewLeave = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "approved" | "rejected" }) => api.post(`/hr/leaves/${id}/review`, { status }),
    onSuccess: (_d, v) => {
      toast.success(v.status === "approved" ? "Cuti disetujui — kehadiran otomatis terisi" : "Cuti ditolak");
      qc.invalidateQueries({ queryKey: ["/api/hr/leaves"] });
    },
    onError: (e: any) => toast.error(e?.message || "Gagal memproses"),
  });

  const tabs = [
    ...(readable ? [{ key: "kehadiran", label: "Catat Kehadiran", icon: CalendarCheck2 }, { key: "rekap", label: "Rekap Bulanan", icon: BarChart3 }] : []),
    { key: "cuti", label: "Cuti", icon: Plane },
  ] as const;

  return (
    <PageContainer>
      <PageHeader icon={IdCard} title="SDM" description="Kehadiran, absensi, dan cuti karyawan — terhubung langsung ke akun user" accent="violet"
        breadcrumbs={[{ label: "HRD", path: "/divisi/hrd" }, { label: "SDM" }]}>
        <div className="flex items-center border-b -mb-2">
          {tabs.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key as any)} aria-current={tab === t.key ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {tab === "kehadiran" && readable && (
        <PageSection title="Catat Kehadiran" description="Klik status per karyawan lalu Simpan — bisa dikoreksi kapan saja"
          actions={<input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDraft({}); }}
            className="h-9 rounded-lg border bg-background px-2.5 text-sm font-medium tabular-nums" aria-label="Tanggal kehadiran" />}>
          <Card padding="none" className="divide-y overflow-hidden">
            {activeUsers.map((u: any) => {
              const st = statusFor(u.id);
              return (
                <div key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{u.name || u.username}</span>
                  <div className="flex flex-wrap gap-1">
                    {ATT_STATUSES.map((s) => (
                      <button key={s.key} type="button" disabled={!writable}
                        onClick={() => setDraft((p) => ({ ...p, [u.id]: s.key }))}
                        aria-pressed={st === s.key}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${st === s.key ? "border-primary bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>
          {writable && (
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" leftIcon={<Save className="size-4" />} loading={saveAttendance.isPending}
                disabled={Object.keys(draft).length === 0} onClick={() => saveAttendance.mutate()}>
                Simpan ({Object.keys(draft).length} perubahan)
              </Button>
              <span className="text-xs text-muted-foreground">{(attendance ?? []).length} tercatat untuk {date}</span>
            </div>
          )}
        </PageSection>
      )}

      {tab === "rekap" && readable && (
        <PageSection title="Rekap Kehadiran Bulanan" description="Jumlah hari per status untuk tiap karyawan"
          actions={<input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-lg border bg-background px-2.5 text-sm font-medium tabular-nums" aria-label="Bulan rekap" />}>
          <Card padding="none" className="overflow-x-auto">
            <table className="w-full min-w-[540px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Karyawan</th>
                  {ATT_STATUSES.map((s) => <th key={s.key} className="px-3 py-2 text-center font-semibold">{s.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {activeUsers.map((u: any) => {
                  const rows = (summary ?? []).filter((r) => r.userId === u.id);
                  const countOf = (k: string) => rows.find((r) => r.status === k)?.c ?? 0;
                  return (
                    <tr key={u.id}>
                      <td className="px-4 py-2 font-medium">{u.name || u.username}</td>
                      {ATT_STATUSES.map((s) => {
                        const c = countOf(s.key);
                        return <td key={s.key} className={`px-3 py-2 text-center tabular-nums ${c === 0 ? "text-muted-foreground/40" : s.key === "alpha" ? "font-bold text-destructive" : "font-semibold"}`}>{c}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </PageSection>
      )}

      {tab === "cuti" && (
        <>
          <PageSection title="Ajukan Cuti" description="Pengajuan masuk ke HR untuk disetujui — cuti yang disetujui otomatis mengisi kehadiran">
            <Card padding="md" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="text-xs font-medium text-muted-foreground">Mulai
                <input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm((p) => ({ ...p, startDate: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border bg-background px-2.5 text-sm tabular-nums" /></label>
              <label className="text-xs font-medium text-muted-foreground">Selesai
                <input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm((p) => ({ ...p, endDate: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border bg-background px-2.5 text-sm tabular-nums" /></label>
              <label className="text-xs font-medium text-muted-foreground">Jenis
                <select value={leaveForm.type} onChange={(e) => setLeaveForm((p) => ({ ...p, type: e.target.value }))}
                  className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm">
                  {LEAVE_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></label>
              <label className="text-xs font-medium text-muted-foreground sm:col-span-2 lg:col-span-1">Alasan
                <input value={leaveForm.reason} onChange={(e) => setLeaveForm((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Opsional" className="mt-1 h-9 w-full rounded-lg border bg-background px-2.5 text-sm" /></label>
              <div className="flex items-end">
                <Button size="sm" className="w-full" loading={createLeave.isPending} onClick={() => createLeave.mutate()}>Ajukan</Button>
              </div>
            </Card>
          </PageSection>

          <PageSection title={readable ? "Semua Pengajuan Cuti" : "Riwayat Cuti Saya"}>
            {(leaves ?? []).length === 0 ? (
              <EmptyState icon={Plane} size="sm" title="Belum ada pengajuan" description="Pengajuan cuti akan tampil di sini." />
            ) : (
              <Card padding="none" className="divide-y overflow-hidden">
                {(leaves ?? []).map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-2.5 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <b>{l.userId === user?.id ? "Saya" : nameOf(l.userId)}</b> · {LEAVE_TYPES.find(([k]) => k === l.type)?.[1] ?? l.type}
                      <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{l.startDate} → {l.endDate}</span>
                      {l.reason && <span className="ml-1.5 text-xs text-muted-foreground">— {l.reason}</span>}
                    </span>
                    <StatusBadge size="sm"
                      variant={l.status === "approved" ? "success" : l.status === "rejected" ? "danger" : "pending"}
                      label={l.status === "approved" ? "Disetujui" : l.status === "rejected" ? "Ditolak" : "Menunggu"} />
                    {writable && l.status === "pending" && (
                      <span className="flex gap-1">
                        <Button type="button" size="icon-sm" variant="success" aria-label="Setujui" loading={reviewLeave.isPending}
                          onClick={() => reviewLeave.mutate({ id: l.id, status: "approved" })}><Check className="size-4" /></Button>
                        <Button type="button" size="icon-sm" variant="destructive" aria-label="Tolak" loading={reviewLeave.isPending}
                          onClick={() => reviewLeave.mutate({ id: l.id, status: "rejected" })}><X className="size-4" /></Button>
                      </span>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </PageSection>
        </>
      )}
    </PageContainer>
  );
}
