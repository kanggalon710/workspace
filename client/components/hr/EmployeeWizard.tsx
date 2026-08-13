/** Wizard profil karyawan 3 langkah (PRD-HR FR-HR-102): Personal → Kepegawaian
 *  → Payroll. Satu objek profil, disimpan utuh di langkah terakhir (patch aman). */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const STEPS = ["Personal", "Kepegawaian", "Payroll"] as const;

interface Props {
  userId: number;
  userName: string;
  users: Array<{ id: number; name?: string; username: string }>;
  onClose: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-muted-foreground">{label}<div className="mt-1">{children}</div></label>;
}
const inputCls = "h-9 w-full rounded-lg border bg-background px-2.5 text-sm";

export function EmployeeWizard({ userId, userName, users, onClose }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<any>({});
  const { data: existing } = useQuery({
    queryKey: ["/api/hr/profile", userId],
    queryFn: () => api.get<any>(`/hr/profile/${userId}`),
  });
  const { data: orgs } = useQuery({
    queryKey: ["/api/hr/orgs"],
    queryFn: () => api.get<{ orgUnits: any[]; positions: any[] }>(`/hr/orgs`),
  });
  useEffect(() => { if (existing) setP(existing); }, [existing]);
  const set = (k: string) => (e: any) => setP((prev: any) => ({ ...prev, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: () => api.post(`/hr/profile/${userId}`, p),
    onSuccess: () => {
      toast.success(`Profil ${userName} tersimpan`);
      qc.invalidateQueries({ queryKey: ["/api/hr/profile", userId] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || "Gagal menyimpan profil"),
  });

  const sel = (k: string, options: Array<[string, string]>) => (
    <select value={p[k] ?? ""} onChange={set(k)} className={inputCls}>
      <option value="">-</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl dialog-w max-h-[88vh] overflow-y-auto">
        <DialogTitle>Profil Karyawan - {userName}</DialogTitle>
        {/* Step indicator */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((s, i) => (
            <button key={s} type="button" onClick={() => setStep(i)}
              className={`flex-1 rounded-full border px-2 py-1.5 text-xs font-medium transition-colors ${i === step ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
              {i + 1}. {s}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tempat Lahir"><input value={p.birthPlace ?? ""} onChange={set("birthPlace")} className={inputCls} /></Field>
            <Field label="Status Perkawinan">{sel("maritalStatus", [["lajang", "Lajang"], ["menikah", "Menikah"], ["cerai", "Cerai"]])}</Field>
            <Field label="Golongan Darah">{sel("bloodType", [["A", "A"], ["B", "B"], ["AB", "AB"], ["O", "O"]])}</Field>
            <Field label="Agama"><input value={p.religion ?? ""} onChange={set("religion")} className={inputCls} /></Field>
            <Field label="Warga Negara">{sel("nationality", [["WNI", "WNI"], ["WNA", "WNA"]])}</Field>
            <Field label="Tipe Identitas">{sel("idType", [["KTP", "KTP"], ["Paspor", "Paspor"]])}</Field>
            <Field label="No. Identitas"><input value={p.idNumber ?? ""} onChange={set("idNumber")} className={inputCls} /></Field>
            <Field label="No. KK"><input value={p.kkNumber ?? ""} onChange={set("kkNumber")} className={inputCls} /></Field>
            <Field label="Alamat KTP"><input value={p.addressKtp ?? ""} onChange={set("addressKtp")} className={inputCls} /></Field>
            <Field label="Alamat Domisili"><input value={p.addressDomisili ?? ""} onChange={set("addressDomisili")} className={inputCls} /></Field>
            <Field label="Pendidikan Terakhir">{sel("educationLevel", [["SD", "SD"], ["SMP", "SMP"], ["SMA/SMK", "SMA/SMK"], ["D3", "D3"], ["S1", "S1"], ["S2", "S2"]])}</Field>
            <Field label="Lembaga Pendidikan"><input value={p.educationInstitution ?? ""} onChange={set("educationInstitution")} className={inputCls} /></Field>
            <Field label="Program Studi"><input value={p.educationMajor ?? ""} onChange={set("educationMajor")} className={inputCls} /></Field>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Struktur Organisasi">
              <select value={p.orgUnitId ?? ""} onChange={set("orgUnitId")} className={inputCls}>
                <option value="">-</option>
                {(orgs?.orgUnits ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <Field label="Jabatan">
              <select value={p.positionId ?? ""} onChange={set("positionId")} className={inputCls}>
                <option value="">-</option>
                {(orgs?.positions ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>
            <Field label="Pangkat"><input value={p.rank ?? ""} onChange={set("rank")} className={inputCls} /></Field>
            <Field label="Status Karyawan">{sel("employmentStatus", [["tetap", "Tetap"], ["kontrak", "Kontrak"], ["probation", "Probation"], ["lepas", "Lepas/Harian"]])}</Field>
            <Field label="Atasan Langsung">
              <select value={p.supervisorId ?? ""} onChange={set("supervisorId")} className={inputCls}>
                <option value="">-</option>
                {users.filter((u) => u.id !== userId).map((u) => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
              </select>
            </Field>
            <Field label="Tanggal Resign (bila non-aktif)"><input type="date" value={p.resignDate ?? ""} onChange={set("resignDate")} className={inputCls} /></Field>
            <p className="text-[11px] text-muted-foreground sm:col-span-2">
              ID karyawan (NIK), jabatan teks lama, departemen & tanggal masuk dikelola di Pengaturan → Manajemen User (akun yang sama).
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bank"><input value={p.bankName ?? ""} onChange={set("bankName")} placeholder="BCA / BRI / Mandiri…" className={inputCls} /></Field>
            <Field label="No. Rekening"><input value={p.bankAccount ?? ""} onChange={set("bankAccount")} className={inputCls} /></Field>
            <Field label="NPWP"><input value={p.npwp ?? ""} onChange={set("npwp")} className={inputCls} /></Field>
            <Field label="Status PTKP">{sel("ptkpStatus", [["TK/0", "TK/0"], ["TK/1", "TK/1"], ["K/0", "K/0"], ["K/1", "K/1"], ["K/2", "K/2"], ["K/3", "K/3"]])}</Field>
            <Field label="No. BPJS Ketenagakerjaan"><input value={p.bpjsTkNumber ?? ""} onChange={set("bpjsTkNumber")} className={inputCls} /></Field>
            <Field label="No. BPJS Kesehatan"><input value={p.bpjsKesNumber ?? ""} onChange={set("bpjsKesNumber")} className={inputCls} /></Field>
            <p className="text-[11px] text-muted-foreground sm:col-span-2">Komponen gaji & perhitungan PPh 21/BPJS menyusul di Fase HR-2 (payroll).</p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <Button variant="outline" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>← Sebelumnya</Button>
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>Lanjut →</Button>
          ) : (
            <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Simpan Profil</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
