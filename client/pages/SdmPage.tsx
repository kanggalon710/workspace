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
import { IdCard, CalendarCheck2, BarChart3, Plane, Save, Check, X, Users as UsersIcon, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { EmployeeWizard } from "@/components/hr/EmployeeWizard";
import { toast } from "sonner";

/** Parser import absensi mesin (Fingerspot dkk): CSV/TSV dengan kolom
 *  identifier (PIN/NIK/username), tanggal, jam masuk, [jam pulang].
 *  Tanggal: YYYY-MM-DD atau DD/MM/YYYY. Delimiter koma/semicolon/tab. */
function parseAttendanceCsv(text: string): Array<{ ident: string; date: string; checkIn: string | null; checkOut: string | null }> {
  const out: Array<{ ident: string; date: string; checkIn: string | null; checkOut: string | null }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 2) continue;
    const [ident, dateRaw, inRaw, outRaw] = cols;
    let date = "";
    let m = dateRaw?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) date = `${m[1]}-${m[2]}-${m[3]}`;
    else if ((m = dateRaw?.match(/^(\d{1,2})[\/](\d{1,2})[\/](\d{4})/) ?? null)) date = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (!ident || !date) continue;   // baris header / tidak valid — lewati
    const time = (t?: string) => { const tm = t?.match(/^(\d{1,2}):(\d{2})/); return tm ? `${tm[1].padStart(2, "0")}:${tm[2]}` : null; };
    out.push({ ident, date, checkIn: time(inRaw), checkOut: time(outRaw) });
  }
  return out;
}

const ATT_STATUSES = [
  { key: "hadir", label: "Hadir", variant: "success" },
  { key: "izin", label: "Izin", variant: "info" },
  { key: "sakit", label: "Sakit", variant: "warning" },
  { key: "cuti", label: "Cuti", variant: "pending" },
  { key: "alpha", label: "Alpha", variant: "danger" },
  { key: "libur", label: "Libur", variant: "neutral" },
] as const;
const LEAVE_TYPES = [["tahunan", "Cuti Tahunan"], ["khusus", "Cuti Khusus"], ["sakit", "Sakit"], ["izin", "Izin"], ["unpaid", "Cuti Tidak Dibayar"]] as const;

/** FR-HR-901: posisi terakhir karyawan yang sedang jam kerja hari ini — dispatch teknisi terdekat. */
function TrackingSection({ nameOf }: { nameOf: (id: number | null) => string | null }) {
  const { data: locs } = useQuery({
    queryKey: ["/api/hr/tracking"],
    queryFn: () => api.get<Array<{ userId: number; at: string; lat: number; lng: number; pings: number }>>(`/hr/tracking`),
    refetchInterval: 60_000,
  });
  if ((locs ?? []).length === 0) return null;
  return (
    <PageSection title="Posisi Teknisi Hari Ini" description="Ping GPS tiap 5 menit selama jam kerja (berhenti saat absen keluar) — retensi 30 hari">
      <Card padding="none" className="divide-y overflow-hidden">
        {(locs ?? []).map((l) => (
          <div key={l.userId} className="flex items-center gap-2.5 px-4 py-2 text-sm">
            <span className="inline-flex h-2 w-2 rounded-full bg-success pulse-ring-success" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-medium">{nameOf(l.userId)}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{new Date(l.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} · {l.pings} ping</span>
            <a href={`https://www.google.com/maps?q=${l.lat},${l.lng}`} target="_blank" rel="noreferrer" className="text-xs text-primary underline">lihat peta</a>
          </div>
        ))}
      </Card>
    </PageSection>
  );
}

/** Antrean approval kasbon + reimburse (HR). */
function MoneyApprovalList({ writable, nameOf }: { writable: boolean; nameOf: (id: number | null) => string | null }) {
  const qc = useQueryClient();
  const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  const { data: kasbon } = useQuery({ queryKey: ["/api/hr/kasbon", "pending"], queryFn: () => api.get<any[]>(`/hr/kasbon?status=pending`), refetchInterval: 60_000 });
  const { data: reimburse } = useQuery({ queryKey: ["/api/hr/reimburse", "pending"], queryFn: () => api.get<any[]>(`/hr/reimburse?status=pending`), refetchInterval: 60_000 });
  const review = useMutation({
    mutationFn: ({ kind, id, status }: { kind: "kasbon" | "reimburse"; id: number; status: "approved" | "rejected" }) =>
      api.post(`/hr/${kind}/${id}/review`, { status }),
    onSuccess: () => { toast.success("Diproses"); qc.invalidateQueries({ queryKey: ["/api/hr/kasbon"] }); qc.invalidateQueries({ queryKey: ["/api/hr/reimburse"] }); },
    onError: (e: any) => toast.error(e?.message || "Gagal"),
  });
  const rows = [
    ...(kasbon ?? []).map((k: any) => ({ kind: "kasbon" as const, id: k.id, userId: k.userId, label: `Kasbon ${rp(k.amount)} · ${k.months}x cicilan`, extra: k.reason })),
    ...(reimburse ?? []).map((r: any) => ({ kind: "reimburse" as const, id: r.id, userId: r.userId, label: `Reimburse ${r.category} ${rp(r.amount)}`, extra: r.note })),
  ];
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">Tidak ada pengajuan keuangan menunggu.</p>;
  return (
    <Card padding="none" className="divide-y overflow-hidden">
      {rows.map((r) => (
        <div key={`${r.kind}-${r.id}`} className="flex flex-wrap items-center gap-2.5 px-4 py-2.5 text-sm">
          <span className="min-w-0 flex-1"><b>{nameOf(r.userId)}</b> · {r.label}
            {r.extra && <span className="ml-1.5 text-xs text-muted-foreground">— {r.extra}</span>}</span>
          {writable && (
            <span className="flex gap-1">
              <Button type="button" size="icon-sm" variant="success" aria-label="Setujui" loading={review.isPending}
                onClick={() => review.mutate({ kind: r.kind, id: r.id, status: "approved" })}><Check className="size-4" /></Button>
              <Button type="button" size="icon-sm" variant="destructive" aria-label="Tolak" loading={review.isPending}
                onClick={() => review.mutate({ kind: r.kind, id: r.id, status: "rejected" })}><X className="size-4" /></Button>
            </span>
          )}
        </div>
      ))}
    </Card>
  );
}

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
  // Registry karyawan (HRD memutuskan akun mana karyawan resmi)
  const { data: employees } = useQuery({
    queryKey: ["/api/hr/employees"],
    queryFn: () => api.get<any[]>(`/hr/employees`),
    enabled: readable,
  });
  const toggleEmployee = useMutation({
    mutationFn: ({ userId, isEmployee }: { userId: number; isEmployee: boolean }) => api.post(`/hr/employees/${userId}`, { isEmployee }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/hr/employees"] }),
    onError: (e: any) => toast.error(e?.message || "Gagal mengubah status karyawan"),
  });
  // Kehadiran & rekap hanya untuk karyawan resmi; fallback semua user aktif bila belum ada yang ditandai.
  const activeUsers = useMemo(() => {
    const base = (employees ?? []).filter((u: any) => u.isActive !== 0);
    const marked = base.filter((u: any) => u.isEmployee === 1);
    if (marked.length > 0) return marked;
    return (users ?? []).filter((u: any) => u.isActive !== 0);
  }, [employees, users]);
  const nameOf = (id: number | null) => {
    const u = (users ?? []).find((x: any) => x.id === id);
    return u ? (u.name || u.username) : id != null ? `#${id}` : "–";
  };

  const [tab, setTab] = useState<"karyawan" | "kehadiran" | "approval" | "rekap" | "cuti" | "payroll" | "pengaturan">(readable ? "kehadiran" : "cuti");
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

  // ── HR-1b: wizard profil + lembur pending + master org/jabatan ──
  const [wizardUser, setWizardUser] = useState<{ id: number; name: string } | null>(null);
  const { data: pendingOt } = useQuery({
    queryKey: ["/api/hr/overtime", "pending"],
    queryFn: () => api.get<any[]>(`/hr/overtime?status=pending`),
    enabled: readable && tab === "approval",
    refetchInterval: 30_000,
  });
  const reviewOt = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "approved" | "rejected" }) => api.post(`/hr/overtime/${id}/review`, { status }),
    onSuccess: () => { toast.success("Lembur diproses"); qc.invalidateQueries({ queryKey: ["/api/hr/overtime"] }); },
    onError: (e: any) => toast.error(e?.message || "Gagal"),
  });
  // HR-1c: roster shift per tanggal + persetujuan tim (manajer) + import karyawan
  const [rosterDate, setRosterDate] = useState(todayIso());
  const { data: roster } = useQuery({
    queryKey: ["/api/hr/roster", rosterDate],
    queryFn: () => api.get<Array<{ userId: number; shiftId: number }>>(`/hr/roster?date=${rosterDate}`),
    enabled: readable && tab === "pengaturan",
  });
  const { data: teamLeaves } = useQuery({
    queryKey: ["/api/hr/leaves", "approver"],
    queryFn: () => api.get<any[]>(`/hr/leaves?approver=1`),
    enabled: tab === "cuti",
    refetchInterval: 60_000,
  });
  const [showEmpImport, setShowEmpImport] = useState(false);
  const [empCsv, setEmpCsv] = useState("");
  const empImport = useMutation({
    mutationFn: async () => {
      const rows = empCsv.split(/\r?\n/).map((l) => l.split(/[;,\t]/).map((c) => c.trim())).filter((c) => c.length >= 2 && c[0]);
      let ok = 0; const fails: string[] = [];
      for (const [username, name, employeeId, position, department] of rows) {
        try {
          const u: any = await api.post(`/users`, { username, name, password: "Jabnet@2026", role: "viewer", employeeId, position, department });
          await api.post(`/hr/employees/${u.id ?? u.user?.id}`, { isEmployee: true });
          ok++;
        } catch (e: any) { fails.push(`${username}: ${e?.message ?? "gagal"}`); }
      }
      return { ok, fails };
    },
    onSuccess: (r) => {
      toast.success(`${r.ok} karyawan terbuat (password awal: Jabnet@2026)`);
      if (r.fails.length) toast.error(`${r.fails.length} gagal: ${r.fails.slice(0, 2).join("; ")}${r.fails.length > 2 ? "…" : ""}`);
      setShowEmpImport(false); setEmpCsv("");
      qc.invalidateQueries({ queryKey: ["/api/hr/employees"] });
    },
  });

  const [masterForm, setMasterForm] = useState({ kind: "org", name: "" });
  const saveMaster = useMutation({
    mutationFn: () => api.post(`/hr/orgs`, { kind: masterForm.kind === "org" ? "org" : "position", name: masterForm.name }),
    onSuccess: () => { toast.success("Master tersimpan"); setMasterForm((p) => ({ ...p, name: "" })); qc.invalidateQueries({ queryKey: ["/api/hr/orgs"] }); },
    onError: (e: any) => toast.error(e?.message || "Gagal"),
  });

  // ── Import absensi mesin (Fingerspot) ──
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const importParsed = useMemo(() => {
    if (!importText.trim()) return { matched: [] as any[], unmatched: [] as string[] };
    const rows = parseAttendanceCsv(importText);
    const byIdent = new Map<string, number>();
    for (const u of (employees ?? [])) {
      if (u.employeeId) byIdent.set(String(u.employeeId).toLowerCase(), u.id);
      byIdent.set(String(u.username).toLowerCase(), u.id);
    }
    const matched: any[] = []; const unmatched: string[] = [];
    for (const r of rows) {
      const uid = byIdent.get(r.ident.toLowerCase());
      if (uid) matched.push({ userId: uid, date: r.date, status: "hadir", checkIn: r.checkIn, checkOut: r.checkOut });
      else if (!unmatched.includes(r.ident)) unmatched.push(r.ident);
    }
    return { matched, unmatched };
  }, [importText, employees]);
  const importSave = useMutation({
    mutationFn: () => api.post(`/hr/attendance`, { records: importParsed.matched }),
    onSuccess: () => {
      toast.success(`${importParsed.matched.length} kehadiran terimport`);
      setShowImport(false); setImportText("");
      qc.invalidateQueries({ queryKey: ["/api/hr/attendance"] });
      qc.invalidateQueries({ queryKey: ["/api/hr/attendance/summary"] });
    },
    onError: (e: any) => toast.error(e?.message || "Gagal import"),
  });

  // ── HR-1a: approval presensi + pengaturan (lokasi/shift/jadwal/libur) ──
  const { data: pendingEvents } = useQuery({
    queryKey: ["/api/hr/attendance/events", "pending"],
    queryFn: () => api.get<any[]>(`/hr/attendance/events?status=pending`),
    enabled: readable && tab === "approval",
    refetchInterval: 30_000,
  });
  const reviewEvent = useMutation({
    mutationFn: ({ id, status }: { id: number; status: "approved" | "rejected" }) => api.post(`/hr/attendance/events/${id}/review`, { status }),
    onSuccess: () => { toast.success("Diproses"); qc.invalidateQueries({ queryKey: ["/api/hr/attendance/events"] }); qc.invalidateQueries({ queryKey: ["/api/hr/attendance"] }); },
    onError: (e: any) => toast.error(e?.message || "Gagal"),
  });
  const { data: hrCfg } = useQuery({
    queryKey: ["/api/hr/config"],
    queryFn: async () => ({
      locations: await api.get<any[]>(`/hr/locations`),
      shifts: await api.get<{ shifts: any[]; assignments: Array<{ userId: number; shiftId: number }> }>(`/hr/shifts`),
      holidays: await api.get<any[]>(`/hr/holidays`),
    }),
    enabled: readable && tab === "pengaturan",
  });
  const invalidateCfg = () => qc.invalidateQueries({ queryKey: ["/api/hr/config"] });
  const [locForm, setLocForm] = useState({ name: "", lat: "", lng: "", radiusM: "150" });
  const [shiftForm, setShiftForm] = useState({ name: "", startTime: "08:00", endTime: "17:00", lateToleranceMin: "10" });
  const [holForm, setHolForm] = useState({ date: todayIso(), name: "" });
  const saveCfg = useMutation({
    mutationFn: ({ path, body }: { path: string; body: any }) => api.post(path, body),
    onSuccess: () => { toast.success("Tersimpan"); invalidateCfg(); qc.invalidateQueries({ queryKey: ["/api/hr/roster"] }); },
    onError: (e: any) => toast.error(e?.message || "Gagal menyimpan"),
  });

  const tabs = [
    ...(readable ? [
      { key: "karyawan", label: "Karyawan", icon: UsersIcon },
      { key: "kehadiran", label: "Catat Kehadiran", icon: CalendarCheck2 },
      { key: "approval", label: "Approval Presensi", icon: Check },
      { key: "rekap", label: "Rekap Bulanan", icon: BarChart3 },
    ] : []),
    { key: "cuti", label: "Cuti", icon: Plane },
    ...(writable ? [{ key: "payroll", label: "Payroll", icon: BarChart3 }] : []),
    ...(readable ? [{ key: "pengaturan", label: "Pengaturan", icon: IdCard }] : []),
  ] as const;

  // ── HR-2: payroll ──
  const [payPeriod, setPayPeriod] = useState(todayIso().slice(0, 7));
  const { data: salaries } = useQuery({
    queryKey: ["/api/hr/salary"],
    queryFn: () => api.get<any[]>(`/hr/salary`),
    enabled: writable && tab === "payroll",
  });
  const { data: payslips } = useQuery({
    queryKey: ["/api/hr/payroll", payPeriod],
    queryFn: () => api.get<any[]>(`/hr/payroll?period=${payPeriod}`),
    enabled: writable && tab === "payroll",
  });
  const [salaryEdit, setSalaryEdit] = useState<Record<number, { baseSalary: string; fixedAllowance: string }>>({});
  const saveSalary = useMutation({
    mutationFn: ({ userId, baseSalary, fixedAllowance }: { userId: number; baseSalary: number; fixedAllowance: number }) =>
      api.post(`/hr/salary/${userId}`, { baseSalary, fixedAllowance }),
    onSuccess: () => { toast.success("Komponen gaji tersimpan"); qc.invalidateQueries({ queryKey: ["/api/hr/salary"] }); },
    onError: (e: any) => toast.error(e?.message || "Gagal"),
  });
  const genPayroll = useMutation({
    mutationFn: () => api.post(`/hr/payroll/generate`, { period: payPeriod }),
    onSuccess: (r: any) => {
      toast.success(`${r.generated} slip dibuat${r.skipped?.length ? ` · ${r.skipped.length} dilewati (gaji belum diisi)` : ""}`);
      qc.invalidateQueries({ queryKey: ["/api/hr/payroll"] });
    },
    onError: (e: any) => toast.error(e?.message || "Gagal generate"),
  });
  const markPaid = useMutation({
    mutationFn: (id: number) => api.post(`/hr/payroll/${id}/status`, { status: "paid" }),
    onSuccess: () => { toast.success("Ditandai sudah bayar — slip tampil di ESS karyawan"); qc.invalidateQueries({ queryKey: ["/api/hr/payroll"] }); },
  });
  const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

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

      {tab === "karyawan" && readable && (
        <PageSection title="Registry Karyawan" description="Tandai akun user mana yang karyawan resmi — jadi dasar kehadiran, rekap, dan integrasi data lintas divisi"
          actions={writable ? <Button size="sm" variant="outline" leftIcon={<Upload className="size-4" />} onClick={() => setShowEmpImport(true)}>Import Massal</Button> : undefined}>
          <Card padding="none" className="divide-y overflow-hidden">
            {(employees ?? []).map((u: any) => (
              <div key={u.id} className="flex flex-wrap items-center gap-2.5 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{u.name || u.username}
                    {u.isActive === 0 && <span className="ml-1.5 text-[10px] text-muted-foreground">(nonaktif)</span>}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    @{u.username}{u.employeeId ? ` · NIK ${u.employeeId}` : ""}{u.position ? ` · ${u.position}` : ""}{u.department ? ` · ${u.department}` : ""}
                  </span>
                </span>
                <StatusBadge size="sm" variant={u.isEmployee ? "success" : "neutral"} label={u.isEmployee ? "Karyawan" : "Bukan Karyawan"} />
                {writable && u.isEmployee === 1 && (
                  <Button type="button" size="xs" variant="outline" onClick={() => setWizardUser({ id: u.id, name: u.name || u.username })}>
                    Lengkapi Data
                  </Button>
                )}
                {writable && (
                  <Button type="button" size="xs" variant={u.isEmployee ? "outline" : "outline-primary"}
                    loading={toggleEmployee.isPending}
                    onClick={() => toggleEmployee.mutate({ userId: u.id, isEmployee: !u.isEmployee })}>
                    {u.isEmployee ? "Hapus Tanda" : "Tandai Karyawan"}
                  </Button>
                )}
              </div>
            ))}
          </Card>
          <p className="mt-2 text-xs text-muted-foreground">
            NIK (employeeId) & jabatan diisi dari Manajemen User (menu Pengaturan) — dipakai untuk mencocokkan import mesin absensi.
          </p>
        </PageSection>
      )}

      {tab === "kehadiran" && readable && (
        <PageSection title="Catat Kehadiran" description="Klik status per karyawan lalu Simpan — bisa dikoreksi kapan saja"
          actions={<span className="flex items-center gap-2">
            {writable && (
              <Button type="button" size="sm" variant="outline" leftIcon={<Upload className="size-4" />} onClick={() => setShowImport(true)}>
                Import Mesin
              </Button>
            )}
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDraft({}); }}
            className="h-9 rounded-lg border bg-background px-2.5 text-sm font-medium tabular-nums" aria-label="Tanggal kehadiran" /></span>}>
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

      {tab === "approval" && readable && (
        <PageSection title="Approval Presensi" description="Absen ESS di luar radius kantor menunggu keputusan HR — disetujui = tercatat hadir">
          {(pendingEvents ?? []).length === 0 ? (
            <EmptyState icon={Check} size="sm" title="Tidak ada antrean" description="Semua presensi dalam radius kantor tercatat otomatis." />
          ) : (
            <Card padding="none" className="divide-y overflow-hidden">
              {(pendingEvents ?? []).map((e: any) => (
                <div key={e.id} className="flex flex-wrap items-center gap-2.5 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <b>{nameOf(e.userId)}</b> · {e.kind === "in" ? "Masuk" : "Keluar"}
                    <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{e.date} {new Date(e.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
                    {e.lat != null && (
                      <a className="ml-1.5 text-xs text-primary underline" target="_blank" rel="noreferrer"
                        href={`https://www.google.com/maps?q=${e.lat},${e.lng}`}>lokasi</a>
                    )}
                    {e.ip && <span className="ml-1.5 text-[10px] text-muted-foreground">IP {e.ip}</span>}
                  </span>
                  <StatusBadge size="sm" variant="warning" label="Luar radius" />
                  <span className="flex gap-1">
                    <Button type="button" size="icon-sm" variant="success" aria-label="Setujui" loading={reviewEvent.isPending}
                      onClick={() => reviewEvent.mutate({ id: e.id, status: "approved" })}><Check className="size-4" /></Button>
                    <Button type="button" size="icon-sm" variant="destructive" aria-label="Tolak" loading={reviewEvent.isPending}
                      onClick={() => reviewEvent.mutate({ id: e.id, status: "rejected" })}><X className="size-4" /></Button>
                  </span>
                </div>
              ))}
            </Card>
          )}
        </PageSection>
      )}

      {tab === "kehadiran" && readable && <TrackingSection nameOf={nameOf} />}

      {tab === "approval" && readable && (
        <PageSection title="Approval Kasbon & Reimburse" description="Kasbon disetujui = cicilan otomatis dipotong slip; reimburse disetujui = dibayarkan lewat slip berikutnya">
          <MoneyApprovalList writable={writable} nameOf={nameOf} />
        </PageSection>
      )}

      {tab === "approval" && readable && (
        <PageSection title="Approval Lembur" description="Lembur disetujui menjadi input payroll (Fase HR-2)">
          {(pendingOt ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Tidak ada pengajuan lembur menunggu.</p>
          ) : (
            <Card padding="none" className="divide-y overflow-hidden">
              {(pendingOt ?? []).map((o: any) => (
                <div key={o.id} className="flex flex-wrap items-center gap-2.5 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <b>{nameOf(o.userId)}</b> · <span className="tabular-nums">{o.date}</span> · <b className="tabular-nums">{o.hours} jam</b>
                    {o.reason && <span className="ml-1.5 text-xs text-muted-foreground">— {o.reason}</span>}
                  </span>
                  <span className="flex gap-1">
                    <Button type="button" size="icon-sm" variant="success" aria-label="Setujui" loading={reviewOt.isPending}
                      onClick={() => reviewOt.mutate({ id: o.id, status: "approved" })}><Check className="size-4" /></Button>
                    <Button type="button" size="icon-sm" variant="destructive" aria-label="Tolak" loading={reviewOt.isPending}
                      onClick={() => reviewOt.mutate({ id: o.id, status: "rejected" })}><X className="size-4" /></Button>
                  </span>
                </div>
              ))}
            </Card>
          )}
        </PageSection>
      )}

      {tab === "payroll" && writable && (
        <>
          <PageSection title="Komponen Gaji" description="Gaji pokok + tunjangan tetap per karyawan (BPJS & PPh 21 TER dihitung otomatis; PTKP dari profil)">
            <Card padding="none" className="divide-y overflow-hidden">
              {activeUsers.map((u: any) => {
                const cur = (salaries ?? []).find((s) => s.userId === u.id);
                const ed = salaryEdit[u.id] ?? { baseSalary: String(cur?.baseSalary ?? ""), fixedAllowance: String(cur?.fixedAllowance ?? "") };
                return (
                  <div key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                    <span className="min-w-32 flex-1 truncate">{u.name || u.username}</span>
                    <input type="number" placeholder="Gaji pokok" value={ed.baseSalary}
                      onChange={(e) => setSalaryEdit((p) => ({ ...p, [u.id]: { ...ed, baseSalary: e.target.value } }))}
                      className="h-8 w-32 rounded-lg border bg-background px-2 text-xs tabular-nums" />
                    <input type="number" placeholder="Tunjangan tetap" value={ed.fixedAllowance}
                      onChange={(e) => setSalaryEdit((p) => ({ ...p, [u.id]: { ...ed, fixedAllowance: e.target.value } }))}
                      className="h-8 w-32 rounded-lg border bg-background px-2 text-xs tabular-nums" />
                    <Button size="xs" variant="outline" loading={saveSalary.isPending}
                      onClick={() => saveSalary.mutate({ userId: u.id, baseSalary: Number(ed.baseSalary) || 0, fixedAllowance: Number(ed.fixedAllowance) || 0 })}>
                      Simpan
                    </Button>
                  </div>
                );
              })}
            </Card>
          </PageSection>

          <PageSection title="Slip Gaji" description="Generate menghitung: kehadiran (alpha), lembur approved, cuti tidak dibayar, BPJS, PPh 21 TER"
            actions={<span className="flex items-center gap-2">
              <input type="month" value={payPeriod} onChange={(e) => setPayPeriod(e.target.value)}
                className="h-9 rounded-lg border bg-background px-2.5 text-sm tabular-nums" aria-label="Periode payroll" />
              <Button size="sm" loading={genPayroll.isPending} onClick={() => genPayroll.mutate()}>Generate</Button>
              <a href={`/api/hr/payroll/export?period=${payPeriod}`} className="text-xs text-primary underline">Jurnal CSV</a>
              <a href={`/api/hr/payroll/export-pph?period=${payPeriod}`} className="text-xs text-primary underline">PPh 21 CSV</a>
            </span>}>
            {(payslips ?? []).length === 0 ? (
              <EmptyState icon={BarChart3} size="sm" title="Belum ada slip" description="Isi komponen gaji lalu klik Generate." />
            ) : (
              <Card padding="none" className="divide-y overflow-hidden">
                {(payslips ?? []).map((s: any) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-2.5 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <b>{nameOf(s.userId)}</b>
                      <span className="ml-2 text-xs text-muted-foreground">Bruto {rp(s.gross)} · Potongan {rp(s.totalDeduction)}</span>
                    </span>
                    <b className="tabular-nums">{rp(s.takeHomePay)}</b>
                    <StatusBadge size="sm" variant={s.status === "paid" ? "success" : "pending"} label={s.status === "paid" ? "Sudah Bayar" : "Siap Bayar"} />
                    <a href={`/api/hr/payslip/${s.id}/print`} target="_blank" rel="noreferrer" className="text-xs text-primary underline">Slip</a>
                    {s.status !== "paid" && (
                      <Button size="xs" variant="success" loading={markPaid.isPending} onClick={() => markPaid.mutate(s.id)}>Tandai Bayar</Button>
                    )}
                  </div>
                ))}
              </Card>
            )}
          </PageSection>
        </>
      )}

      {tab === "pengaturan" && readable && (
        <>
          <PageSection title="Lokasi Kantor (Radius Presensi)" description="Absen di luar semua radius = antre approval. Kosong = semua lokasi diterima.">
            <Card padding="none" className="divide-y overflow-hidden">
              {(hrCfg?.locations ?? []).map((l: any) => (
                <div key={l.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                  <span className="flex-1">{l.name} <span className="text-xs tabular-nums text-muted-foreground">({l.lat}, {l.lng}) · {l.radiusM} m</span></span>
                  {writable && <Button size="icon-sm" variant="ghost" aria-label="Hapus" onClick={async () => { await api.delete(`/hr/locations/${l.id}`); invalidateCfg(); }}><X className="size-4" /></Button>}
                </div>
              ))}
            </Card>
            {writable && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                {([["name", "Nama", "Kantor Garut"], ["lat", "Lat", "-7.216"], ["lng", "Lng", "107.897"], ["radiusM", "Radius (m)", "150"]] as const).map(([k, l, ph]) => (
                  <label key={k} className="text-xs font-medium text-muted-foreground">{l}
                    <input value={(locForm as any)[k]} placeholder={ph} onChange={(e) => setLocForm((p) => ({ ...p, [k]: e.target.value }))}
                      className="mt-1 h-9 w-32 rounded-lg border bg-background px-2.5 text-sm" /></label>
                ))}
                <Button size="sm" loading={saveCfg.isPending} onClick={() => saveCfg.mutate({ path: `/hr/locations`, body: { ...locForm, lat: Number(locForm.lat), lng: Number(locForm.lng), radiusM: Number(locForm.radiusM) } })}>Tambah</Button>
              </div>
            )}
          </PageSection>

          <PageSection title="Shift Kerja & Jadwal" description="Shift menentukan basis keterlambatan (FR-HR-301/304)">
            <Card padding="none" className="divide-y overflow-hidden">
              {(hrCfg?.shifts?.shifts ?? []).map((s: any) => (
                <div key={s.id} className="px-4 py-2 text-sm">{s.name} · <span className="tabular-nums">{s.startTime}–{s.endTime}</span> · toleransi {s.lateToleranceMin} mnt</div>
              ))}
            </Card>
            {writable && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                {([["name", "Nama", "Reguler"], ["startTime", "Masuk", "08:00"], ["endTime", "Keluar", "17:00"], ["lateToleranceMin", "Toleransi (mnt)", "10"]] as const).map(([k, l, ph]) => (
                  <label key={k} className="text-xs font-medium text-muted-foreground">{l}
                    <input value={(shiftForm as any)[k]} placeholder={ph} onChange={(e) => setShiftForm((p) => ({ ...p, [k]: e.target.value }))}
                      className="mt-1 h-9 w-28 rounded-lg border bg-background px-2.5 text-sm" /></label>
                ))}
                <Button size="sm" loading={saveCfg.isPending} onClick={() => saveCfg.mutate({ path: `/hr/shifts`, body: { ...shiftForm, lateToleranceMin: Number(shiftForm.lateToleranceMin) } })}>Tambah Shift</Button>
              </div>
            )}
            {(hrCfg?.shifts?.shifts ?? []).length > 0 && (
              <Card padding="none" className="mt-3 divide-y overflow-hidden">
                {activeUsers.map((u: any) => {
                  const cur = hrCfg?.shifts?.assignments.find((a) => a.userId === u.id)?.shiftId ?? "";
                  return (
                    <div key={u.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                      <span className="flex-1 truncate">{u.name || u.username}</span>
                      <select value={cur} disabled={!writable}
                        onChange={(e) => saveCfg.mutate({ path: `/hr/schedule`, body: { userId: u.id, shiftId: e.target.value ? Number(e.target.value) : null } })}
                        className="h-8 rounded-lg border bg-background px-2 text-xs">
                        <option value="">Tanpa shift</option>
                        {(hrCfg?.shifts?.shifts ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.startTime})</option>)}
                      </select>
                    </div>
                  );
                })}
              </Card>
            )}
          </PageSection>

          <PageSection title="Roster Shift (Rotasi per Tanggal)" description="Menimpa jadwal tetap pada tanggal terpilih — untuk pola shift bergilir (FR-HR-301)"
            actions={<input type="date" value={rosterDate} onChange={(e) => setRosterDate(e.target.value)}
              className="h-9 rounded-lg border bg-background px-2.5 text-sm tabular-nums" aria-label="Tanggal roster" />}>
            {(hrCfg?.shifts?.shifts ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Buat shift dulu di bagian Shift Kerja.</p>
            ) : (
              <Card padding="none" className="divide-y overflow-hidden">
                {activeUsers.map((u: any) => {
                  const cur = (roster ?? []).find((r) => r.userId === u.id)?.shiftId ?? "";
                  return (
                    <div key={u.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                      <span className="flex-1 truncate">{u.name || u.username}</span>
                      <select value={cur} disabled={!writable}
                        onChange={(e) => saveCfg.mutate({ path: `/hr/roster`, body: { userId: u.id, date: rosterDate, shiftId: e.target.value ? Number(e.target.value) : null } })}
                        className="h-8 rounded-lg border bg-background px-2 text-xs">
                        <option value="">Ikut jadwal tetap</option>
                        {(hrCfg?.shifts?.shifts ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.startTime})</option>)}
                      </select>
                    </div>
                  );
                })}
              </Card>
            )}
          </PageSection>

          <PageSection title="Struktur Organisasi & Jabatan" description="Master data yang dirujuk profil karyawan (FR-HR-104)">
            {writable && (
              <div className="flex flex-wrap items-end gap-2">
                <select value={masterForm.kind} onChange={(e) => setMasterForm((p) => ({ ...p, kind: e.target.value }))}
                  className="h-9 rounded-lg border bg-background px-2 text-sm">
                  <option value="org">Struktur Organisasi</option>
                  <option value="position">Jabatan</option>
                </select>
                <input value={masterForm.name} placeholder={masterForm.kind === "org" ? "mis. Divisi Teknik" : "mis. Teknisi FTTH"}
                  onChange={(e) => setMasterForm((p) => ({ ...p, name: e.target.value }))}
                  className="h-9 w-56 rounded-lg border bg-background px-2.5 text-sm" />
                <Button size="sm" loading={saveMaster.isPending} disabled={!masterForm.name.trim()} onClick={() => saveMaster.mutate()}>Tambah</Button>
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">Daftar lengkap muncul di dropdown wizard profil karyawan (tab Karyawan → Lengkapi Data).</p>
          </PageSection>

          <PageSection title={`Kalender Libur ${new Date().getFullYear()}`}>
            <Card padding="none" className="divide-y overflow-hidden">
              {(hrCfg?.holidays ?? []).map((h: any) => (
                <div key={h.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                  <span className="tabular-nums text-muted-foreground">{h.date}</span>
                  <span className="flex-1">{h.name}</span>
                  {writable && <Button size="icon-sm" variant="ghost" aria-label="Hapus" onClick={async () => { await api.delete(`/hr/holidays/${h.id}`); invalidateCfg(); }}><X className="size-4" /></Button>}
                </div>
              ))}
            </Card>
            {writable && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <input type="date" value={holForm.date} onChange={(e) => setHolForm((p) => ({ ...p, date: e.target.value }))} className="h-9 rounded-lg border bg-background px-2.5 text-sm tabular-nums" />
                <input value={holForm.name} placeholder="Nama libur (mis. Idul Fitri)" onChange={(e) => setHolForm((p) => ({ ...p, name: e.target.value }))} className="h-9 w-56 rounded-lg border bg-background px-2.5 text-sm" />
                <Button size="sm" loading={saveCfg.isPending} onClick={() => saveCfg.mutate({ path: `/hr/holidays`, body: holForm })}>Tambah Libur</Button>
              </div>
            )}
          </PageSection>
        </>
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
          {/* FR-HR-502: antrean saya sebagai atasan langsung (tahap 1 sebelum HR) */}
          {(teamLeaves ?? []).length > 0 && (
            <PageSection title="Persetujuan Tim Saya" description="Anda atasan langsung pengaju — setelah Anda setujui, lanjut ke HR">
              <Card padding="none" className="divide-y overflow-hidden">
                {(teamLeaves ?? []).map((l: any) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-2.5 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <b>{nameOf(l.userId)}</b> · {LEAVE_TYPES.find(([k]) => k === l.type)?.[1] ?? l.type}
                      <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{l.startDate} → {l.endDate}</span>
                      {l.reason && <span className="ml-1.5 text-xs text-muted-foreground">— {l.reason}</span>}
                    </span>
                    <span className="flex gap-1">
                      <Button type="button" size="icon-sm" variant="success" aria-label="Setujui (lanjut HR)" loading={reviewLeave.isPending}
                        onClick={() => reviewLeave.mutate({ id: l.id, status: "approved" })}><Check className="size-4" /></Button>
                      <Button type="button" size="icon-sm" variant="destructive" aria-label="Tolak" loading={reviewLeave.isPending}
                        onClick={() => reviewLeave.mutate({ id: l.id, status: "rejected" })}><X className="size-4" /></Button>
                    </span>
                  </div>
                ))}
              </Card>
            </PageSection>
          )}

          <PageSection title="Ajukan Cuti" description="Alur: atasan langsung (bila ada) → HR — cuti disetujui otomatis mengisi kehadiran">
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

      {/* Import karyawan massal (FR-HR-103): buat akun + tandai karyawan */}
      {showEmpImport && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowEmpImport(false); }}>
          <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
            <DialogTitle>Import Karyawan Massal</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Satu baris satu karyawan: <code className="rounded bg-muted px-1 font-mono-tight">username, nama, NIK, jabatan, departemen</code>.
              Akun dibuat dengan password awal <b>Jabnet@2026</b> (role Viewer) dan langsung ditandai karyawan.
            </p>
            <textarea value={empCsv} onChange={(e) => setEmpCsv(e.target.value)}
              placeholder={"asep, Asep Sunandar, JB010, Teknisi FTTH, Teknik\nnina, Nina Kurnia, JB011, CS, Layanan"}
              className="h-36 w-full rounded-lg border bg-background p-2.5 font-mono-tight text-xs" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowEmpImport(false)}>Batal</Button>
              <Button size="sm" loading={empImport.isPending} disabled={!empCsv.trim()} onClick={() => empImport.mutate()}>Import</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {wizardUser && (
        <EmployeeWizard userId={wizardUser.id} userName={wizardUser.name}
          users={(employees ?? []) as any} onClose={() => setWizardUser(null)} />
      )}

      {/* Import absensi mesin fingerprint (Fingerspot dkk) */}
      {showImport && (
        <Dialog open onOpenChange={(o) => { if (!o) setShowImport(false); }}>
          <DialogContent className="max-w-lg w-[calc(100vw-2rem)] max-h-[85vh] overflow-y-auto">
            <DialogTitle>Import Absensi Mesin (Fingerspot)</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Export CSV dari mesin lalu tempel di sini (atau pilih file). Format per baris:
              <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono-tight">NIK/username, tanggal, jam masuk, jam pulang</code>
              — tanggal <code className="rounded bg-muted px-1 font-mono-tight">YYYY-MM-DD</code> atau <code className="rounded bg-muted px-1 font-mono-tight">DD/MM/YYYY</code>.
              Pencocokan via NIK (employeeId) atau username. Semua baris masuk sebagai status <b>Hadir</b> + jam scan.
            </p>
            <input type="file" accept=".csv,.txt" aria-label="Pilih file CSV"
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImportText(await f.text()); }}
              className="text-xs" />
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)}
              placeholder={"JB001, 2026-07-18, 08:02, 17:11\nJB002, 2026-07-18, 08:15, 17:03"}
              className="h-40 w-full rounded-lg border bg-background p-2.5 font-mono-tight text-xs" />
            <div className="flex items-center justify-between gap-2 text-xs">
              <span>
                <b className="text-success tabular-nums">{importParsed.matched.length}</b> cocok
                {importParsed.unmatched.length > 0 && (
                  <span className="ml-2 text-destructive" title={importParsed.unmatched.join(", ")}>
                    {importParsed.unmatched.length} tak dikenal: {importParsed.unmatched.slice(0, 3).join(", ")}{importParsed.unmatched.length > 3 ? "…" : ""}
                  </span>
                )}
              </span>
              <span className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowImport(false)}>Batal</Button>
                <Button size="sm" loading={importSave.isPending} disabled={importParsed.matched.length === 0}
                  onClick={() => importSave.mutate()}>Import {importParsed.matched.length} Baris</Button>
              </span>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </PageContainer>
  );
}
