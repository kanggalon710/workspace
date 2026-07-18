/** ESS Absen (PRD-HR FR-HR-1101/1102): semua staff absen Masuk/Keluar dari HP —
 *  GPS + selfie kamera. Di luar radius kantor → masuk antrean Approval Presensi. */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getAuthHeaders } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { CalendarCheck2, LogIn, LogOut, MapPin, Camera } from "lucide-react";
import { toast } from "sonner";

/** Slip gaji milik sendiri (paid only) dengan rincian. */
function PayslipCard() {
  const { data: slips } = useQuery({
    queryKey: ["/api/hr/my/payslips"],
    queryFn: () => api.get<any[]>(`/hr/my/payslips`),
  });
  const [open, setOpen] = useState<number | null>(null);
  if ((slips ?? []).length === 0) return null;
  const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  return (
    <Card padding="md">
      <p className="text-sm font-semibold">Slip Gaji Saya</p>
      {(slips ?? []).map((s: any) => {
        let d: any = {}; try { d = JSON.parse(s.detail); } catch { /* rincian tak terbaca */ }
        const expanded = open === s.id;
        return (
          <div key={s.id} className="mt-2 rounded-lg border">
            <button type="button" onClick={() => setOpen(expanded ? null : s.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm">
              <span className="font-medium tabular-nums">{s.period}</span>
              <span className="ml-auto font-bold tabular-nums">{rp(s.takeHomePay)}</span>
            </button>
            <a href={`/api/hr/payslip/${s.id}/print`} target="_blank" rel="noreferrer"
              className="block border-t px-3 py-1.5 text-center text-xs text-primary underline">Cetak / Simpan PDF</a>
            {expanded && (
              <div className="border-t px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                <p>Bruto: <b className="tabular-nums">{rp(s.gross)}</b> · Tunjangan+Lembur: <b className="tabular-nums">{rp(s.totalAllowance)}</b></p>
                <p>BPJS TK: <b className="tabular-nums">{rp(d.bpjsTkEmp ?? 0)}</b> · BPJS Kes: <b className="tabular-nums">{rp(d.bpjsKesEmp ?? 0)}</b> · PPh 21 ({d.terRatePct ?? 0}%): <b className="tabular-nums">{rp(d.pph21 ?? 0)}</b></p>
                {(d.absenceDeduction ?? 0) > 0 && <p>Potongan absen/cuti tidak dibayar: <b className="tabular-nums">{rp(d.absenceDeduction)}</b></p>}
                <p className="text-foreground">Take Home Pay: <b className="tabular-nums">{rp(s.takeHomePay)}</b></p>
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

/** FR-HR-903: check-in kunjungan klien dengan validasi radius GPS. */
function VisitCard() {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState("");
  const [note, setNote] = useState("");
  const { data: clients } = useQuery({ queryKey: ["/api/hr/clients"], queryFn: () => api.get<any[]>(`/hr/clients`) });
  const { data: visits } = useQuery({ queryKey: ["/api/hr/visits", "mine"], queryFn: () => api.get<any[]>(`/hr/visits?mine=1`) });
  const checkin = useMutation({
    mutationFn: async () => {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error("GPS tidak tersedia"));
        navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error("Izinkan akses lokasi")), { enableHighAccuracy: true, timeout: 10000 });
      });
      return api.post<any>(`/hr/visits`, { clientId: Number(clientId), lat: pos.coords.latitude, lng: pos.coords.longitude, note });
    },
    onSuccess: (v: any) => {
      v.valid ? toast.success("Kunjungan tercatat — dalam radius klien ✓")
        : toast.error("Tercatat TAPI di luar radius klien — ditandai untuk HR");
      setNote(""); qc.invalidateQueries({ queryKey: ["/api/hr/visits"] });
    },
    onError: (e: any) => toast.error(e?.message || "Gagal check-in"),
  });
  if ((clients ?? []).length === 0) return null;
  const nameOfClient = (id: number) => (clients ?? []).find((c: any) => c.id === id)?.name ?? `#${id}`;
  return (
    <Card padding="md">
      <p className="text-sm font-semibold">Kunjungan Klien</p>
      <div className="mt-1.5 flex flex-wrap items-end gap-2">
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="h-9 min-w-40 rounded-lg border bg-background px-2 text-sm">
          <option value="">Pilih klien…</option>
          {(clients ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input value={note} placeholder="Catatan (opsional)" onChange={(e) => setNote(e.target.value)} className="h-9 w-44 rounded-lg border bg-background px-2.5 text-sm" />
        <Button size="sm" leftIcon={<MapPin className="size-4" />} loading={checkin.isPending} disabled={!clientId} onClick={() => checkin.mutate()}>Check-in</Button>
      </div>
      {(visits ?? []).slice(0, 3).map((v: any) => (
        <div key={v.id} className="mt-1.5 flex items-center gap-2 text-xs">
          <span className="truncate">{nameOfClient(v.clientId)}</span>
          <span className="tabular-nums text-muted-foreground">{new Date(v.at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          <span className="ml-auto" />
          <StatusBadge size="sm" variant={v.withinRadius ? "success" : "warning"} label={v.withinRadius ? "Dalam radius" : "Luar radius"} />
        </div>
      ))}
    </Card>
  );
}

const stBadge = (s: string) => (
  <StatusBadge size="sm" variant={s === "approved" || s === "paid" || s === "settled" ? "success" : s === "rejected" ? "danger" : "pending"}
    label={s === "approved" ? "Disetujui" : s === "paid" ? "Dibayar" : s === "settled" ? "Lunas" : s === "rejected" ? "Ditolak" : "Menunggu"} />
);

/** Kasbon (plafon + cicilan auto-potong slip) & Reimburse — self-service. */
function MoneyCard() {
  const qc = useQueryClient();
  const rp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  const [kb, setKb] = useState({ amount: "", months: "3", reason: "" });
  const [rb, setRb] = useState({ date: new Date().toISOString().slice(0, 10), category: "Transport", amount: "", note: "" });
  const { data: kasbon } = useQuery({ queryKey: ["/api/hr/kasbon", "mine"], queryFn: () => api.get<any[]>(`/hr/kasbon?mine=1`) });
  const { data: reimburse } = useQuery({ queryKey: ["/api/hr/reimburse", "mine"], queryFn: () => api.get<any[]>(`/hr/reimburse?mine=1`) });
  const submitKb = useMutation({
    mutationFn: () => api.post(`/hr/kasbon`, { amount: Number(kb.amount), months: Number(kb.months), reason: kb.reason }),
    onSuccess: () => { toast.success("Kasbon diajukan — cicilan otomatis dipotong dari gaji setelah disetujui"); qc.invalidateQueries({ queryKey: ["/api/hr/kasbon"] }); },
    onError: (e: any) => toast.error(e?.message || "Gagal"),
  });
  const submitRb = useMutation({
    mutationFn: () => api.post(`/hr/reimburse`, { ...rb, amount: Number(rb.amount) }),
    onSuccess: () => { toast.success("Reimburse diajukan"); qc.invalidateQueries({ queryKey: ["/api/hr/reimburse"] }); },
    onError: (e: any) => toast.error(e?.message || "Gagal"),
  });
  return (
    <Card padding="md" className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Kasbon</p>
        <div className="mt-1.5 flex flex-wrap items-end gap-2">
          <input type="number" placeholder="Jumlah (Rp)" value={kb.amount} onChange={(e) => setKb((p) => ({ ...p, amount: e.target.value }))} className="h-9 w-32 rounded-lg border bg-background px-2.5 text-sm tabular-nums" />
          <select value={kb.months} onChange={(e) => setKb((p) => ({ ...p, months: e.target.value }))} className="h-9 rounded-lg border bg-background px-2 text-sm">
            {[1, 2, 3, 4, 6, 12].map((m) => <option key={m} value={m}>{m}x cicilan</option>)}
          </select>
          <input placeholder="Alasan" value={kb.reason} onChange={(e) => setKb((p) => ({ ...p, reason: e.target.value }))} className="h-9 w-40 rounded-lg border bg-background px-2.5 text-sm" />
          <Button size="sm" loading={submitKb.isPending} disabled={!kb.amount} onClick={() => submitKb.mutate()}>Ajukan</Button>
        </div>
        {(kasbon ?? []).slice(0, 3).map((k: any) => (
          <div key={k.id} className="mt-1.5 flex items-center gap-2 text-xs">
            <span className="tabular-nums">{rp(k.amount)} · {k.months}x</span>
            {k.status === "approved" && <span className="text-muted-foreground tabular-nums">sisa {rp(k.remaining)}</span>}
            <span className="ml-auto" />{stBadge(k.status)}
          </div>
        ))}
      </div>
      <div className="border-t pt-3">
        <p className="text-sm font-semibold">Reimburse</p>
        <div className="mt-1.5 flex flex-wrap items-end gap-2">
          <input type="date" value={rb.date} onChange={(e) => setRb((p) => ({ ...p, date: e.target.value }))} className="h-9 rounded-lg border bg-background px-2.5 text-sm tabular-nums" />
          <select value={rb.category} onChange={(e) => setRb((p) => ({ ...p, category: e.target.value }))} className="h-9 rounded-lg border bg-background px-2 text-sm">
            {["Transport", "BBM", "Makan", "Material", "Pulsa/Data", "Lainnya"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <input type="number" placeholder="Jumlah (Rp)" value={rb.amount} onChange={(e) => setRb((p) => ({ ...p, amount: e.target.value }))} className="h-9 w-28 rounded-lg border bg-background px-2.5 text-sm tabular-nums" />
          <Button size="sm" loading={submitRb.isPending} disabled={!rb.amount} onClick={() => submitRb.mutate()}>Ajukan</Button>
        </div>
        {(reimburse ?? []).slice(0, 3).map((r: any) => (
          <div key={r.id} className="mt-1.5 flex items-center gap-2 text-xs">
            <span className="tabular-nums text-muted-foreground">{r.date}</span>
            <span>{r.category}</span>
            <span className="tabular-nums">{rp(r.amount)}</span>
            <span className="ml-auto" />{stBadge(r.status)}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Ajukan lembur + riwayat milik sendiri (FR-HR-207). */
function OvertimeCard() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ date: today, hours: "1", reason: "" });
  const { data: mine } = useQuery({
    queryKey: ["/api/hr/overtime", "mine"],
    queryFn: () => api.get<any[]>(`/hr/overtime?mine=1`),
  });
  const submit = useMutation({
    mutationFn: () => api.post(`/hr/overtime`, { ...form, hours: Number(form.hours) }),
    onSuccess: () => { toast.success("Lembur diajukan — menunggu persetujuan HR"); qc.invalidateQueries({ queryKey: ["/api/hr/overtime"] }); },
    onError: (e: any) => toast.error(e?.message || "Gagal mengajukan lembur"),
  });
  return (
    <Card padding="md">
      <p className="text-sm font-semibold">Lembur</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="h-9 rounded-lg border bg-background px-2.5 text-sm tabular-nums" aria-label="Tanggal lembur" />
        <input type="number" min={0.5} max={12} step={0.5} value={form.hours} onChange={(e) => setForm((p) => ({ ...p, hours: e.target.value }))} className="h-9 w-20 rounded-lg border bg-background px-2.5 text-sm tabular-nums" aria-label="Jam lembur" />
        <input value={form.reason} placeholder="Alasan (opsional)" onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} className="h-9 w-48 rounded-lg border bg-background px-2.5 text-sm" />
        <Button size="sm" loading={submit.isPending} onClick={() => submit.mutate()}>Ajukan</Button>
      </div>
      {(mine ?? []).slice(0, 5).map((o: any) => (
        <div key={o.id} className="mt-2 flex items-center gap-2 text-xs">
          <span className="tabular-nums text-muted-foreground">{o.date}</span>
          <span className="tabular-nums font-semibold">{o.hours} jam</span>
          <span className="ml-auto" />
          <StatusBadge size="sm" variant={o.status === "approved" ? "success" : o.status === "rejected" ? "danger" : "pending"}
            label={o.status === "approved" ? "Disetujui" : o.status === "rejected" ? "Ditolak" : "Menunggu"} />
        </div>
      ))}
    </Card>
  );
}

export default function EssAbsenPage() {
  const qc = useQueryClient();
  const { data: today, isLoading } = useQuery({
    queryKey: ["/api/hr/my/today"],
    queryFn: () => api.get<any>(`/hr/my/today`),
    refetchInterval: 60_000,
  });
  const { data: balance } = useQuery({
    queryKey: ["/api/hr/leaves/balance"],
    queryFn: () => api.get<Array<{ type: string; quota: number; used: number; remaining: number }>>(`/hr/leaves/balance`),
  });
  const [selfie, setSelfie] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"in" | "out" | null>(null);

  const clock = useMutation({
    mutationFn: async (kind: "in" | "out") => {
      setBusy(kind);
      const pos = await new Promise<GeolocationPosition | null>((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition((p) => resolve(p), () => resolve(null), { enableHighAccuracy: true, timeout: 8000 });
      });
      const form = new FormData();
      form.append("kind", kind);
      if (pos) { form.append("lat", String(pos.coords.latitude)); form.append("lng", String(pos.coords.longitude)); }
      if (selfie) form.append("selfie", selfie);
      const res = await fetch(`/api/hr/clock`, { method: "POST", headers: { ...getAuthHeaders() }, body: form });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Gagal absen");
      return json.data;
    },
    onSuccess: (d) => {
      toast.success(d.needsApproval
        ? "Absen terekam DI LUAR radius kantor — menunggu persetujuan HR"
        : `Absen ${d.kind === "in" ? "masuk" : "keluar"} tercatat ✓`);
      setSelfie(null); if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["/api/hr/my/today"] });
    },
    onError: (e: any) => toast.error(e?.message || "Gagal absen"),
    onSettled: () => setBusy(null),
  });

  const att = today?.attendance;
  // FR-HR-901/904: auto-ping lokasi tiap 5 menit SELAMA jam kerja (clock-in tanpa
  // clock-out) & halaman terbuka — transparan lewat indikator di bawah.
  const working = !!att?.checkIn && !att?.checkOut;
  useEffect(() => {
    if (!working || !navigator.geolocation) return;
    const send = () => {
      if (document.visibilityState !== "visible") return;
      navigator.geolocation.getCurrentPosition(
        (p) => { api.post(`/hr/ping`, { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }).catch(() => { /* offline — coba lagi tick berikutnya */ }); },
        () => { /* izin ditolak — tidak dilacak */ }, { enableHighAccuracy: false, timeout: 8000 });
    };
    send();
    const t = setInterval(send, 5 * 60_000);
    return () => clearInterval(t);
  }, [working]);
  const LEAVE_LABEL: Record<string, string> = { tahunan: "Cuti Tahunan", khusus: "Cuti Khusus", sakit: "Sakit", izin: "Izin", unpaid: "Tanpa Dibayar" };

  return (
    <PageContainer>
      <PageHeader icon={CalendarCheck2} title="Absen" description="Presensi harian — GPS + selfie, langsung tercatat di HRD" accent="violet" />

      <Card padding="md" className="text-center">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Hari Ini · {today?.date ?? "…"}</p>
        <div className="mt-1 flex items-center justify-center gap-3 text-sm">
          <span>Masuk: <b className="tabular-nums">{att?.checkIn ?? "–"}</b></span>
          <span>Keluar: <b className="tabular-nums">{att?.checkOut ?? "–"}</b></span>
          {att?.note && <StatusBadge size="sm" variant="warning" label={att.note} />}
        </div>
        {today?.shift && (
          <p className="mt-1 text-xs text-muted-foreground">Shift {today.shift.name}: {today.shift.startTime}–{today.shift.endTime} (toleransi {today.shift.lateToleranceMin} mnt)</p>
        )}

        {/* Selfie opsional (kamera depan di HP) */}
        <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden"
          onChange={(e) => setSelfie(e.target.files?.[0] ?? null)} />
        <button type="button" onClick={() => fileRef.current?.click()}
          className="mx-auto mt-4 flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs text-muted-foreground hover:bg-muted">
          <Camera className="size-4" /> {selfie ? `Selfie siap ✓ (${Math.round(selfie.size / 1024)} KB)` : "Ambil Selfie (opsional)"}
        </button>

        <div className="mx-auto mt-4 grid max-w-sm grid-cols-2 gap-3">
          <Button size="xl" leftIcon={<LogIn className="size-5" />} loading={busy === "in"}
            disabled={busy != null || isLoading} onClick={() => clock.mutate("in")}>
            Masuk
          </Button>
          <Button size="xl" variant="outline-primary" leftIcon={<LogOut className="size-5" />} loading={busy === "out"}
            disabled={busy != null || isLoading} onClick={() => clock.mutate("out")}>
            Keluar
          </Button>
        </div>
        <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="size-3.5" /> Lokasi GPS direkam; di luar radius kantor otomatis menunggu persetujuan HR.
        </p>
        {working && (
          <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-success">
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-success pulse-ring-success" /> Pelacakan lokasi aktif selama jam kerja (berhenti otomatis saat absen keluar)
          </p>
        )}
      </Card>

      {/* Riwayat scan hari ini */}
      {(today?.events ?? []).length > 0 && (
        <Card padding="none" className="divide-y overflow-hidden">
          {today.events.map((e: any) => (
            <div key={e.id} className="flex items-center gap-2.5 px-4 py-2 text-sm">
              <span className="font-semibold">{e.kind === "in" ? "Masuk" : "Keluar"}</span>
              <span className="tabular-nums text-muted-foreground">{new Date(e.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="ml-auto" />
              {!e.withinRadius && <StatusBadge size="sm" variant="warning" label="Luar radius" />}
              <StatusBadge size="sm"
                variant={e.approvalStatus === "approved" ? "success" : e.approvalStatus === "rejected" ? "danger" : "pending"}
                label={e.approvalStatus === "approved" ? "Tercatat" : e.approvalStatus === "rejected" ? "Ditolak" : "Menunggu HR"} />
            </div>
          ))}
        </Card>
      )}

      {/* Slip gaji saya (FR-HR-1104) — hanya yang sudah dibayar */}
      <PayslipCard />

      {/* Ajukan lembur (FR-HR-207) */}
      <OvertimeCard />

      {/* Kunjungan klien (FR-HR-903) — check-in sah hanya dalam radius klien */}
      <VisitCard />

      {/* Kasbon + Reimburse (FR-HR-701/702) */}
      <MoneyCard />

      {/* Sisa cuti (FR-HR-403) */}
      {(balance ?? []).length > 0 && (
        <Card padding="md">
          <p className="text-sm font-semibold">Sisa Cuti Saya {new Date().getFullYear()}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {(balance ?? []).map((b) => (
              <div key={b.type} className="rounded-lg border px-3 py-2">
                <p className="text-[11px] text-muted-foreground">{LEAVE_LABEL[b.type] ?? b.type}</p>
                <p className="text-sm font-bold tabular-nums">
                  {b.remaining < 0 ? `${b.used} terpakai` : `${b.remaining} / ${b.quota} hari`}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">Ajukan cuti di menu HRD → SDM → Cuti.</p>
        </Card>
      )}
    </PageContainer>
  );
}
