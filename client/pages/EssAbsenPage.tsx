/** ESS Absen (PRD-HR FR-HR-1101/1102): semua staff absen Masuk/Keluar dari HP —
 *  GPS + selfie kamera. Di luar radius kantor → masuk antrean Approval Presensi. */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getAuthHeaders } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/ui/page-container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { CalendarCheck2, LogIn, LogOut, MapPin, Camera } from "lucide-react";
import { toast } from "sonner";

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

      {/* Ajukan lembur (FR-HR-207) */}
      <OvertimeCard />

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
