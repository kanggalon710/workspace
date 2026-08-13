import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Building2, Loader2, Phone } from "lucide-react";
import { FF, slugify, EMPTY_MITRA_FORM, EMPTY_ADMIN_FORM } from "./shared";

export function MitraCreateDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ ...EMPTY_MITRA_FORM });
  const [adminForm, setAdminForm] = useState({ ...EMPTY_ADMIN_FORM });
  const [adminErrors, setAdminErrors] = useState<Record<string, string>>({});

  // Reset all wizard state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep(1);
      setForm({ ...EMPTY_MITRA_FORM });
      setAdminForm({ ...EMPTY_ADMIN_FORM });
      setAdminErrors({});
    }
  }, [open]);

  // Auto-gen slug from name (only if slug not yet manually set)
  useEffect(() => {
    if (form.name && !form.slug) {
      setForm((f) => ({ ...f, slug: slugify(f.name) }));
    }
  }, [form.name]);

  // Auto-suggest username when entering step 2
  useEffect(() => {
    if (step === 2 && !adminForm.username && form.slug) {
      setAdminForm((prev) => ({
        ...prev,
        username: `${form.slug.replace(/-/g, "_")}_admin`,
      }));
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const mut = useMutation({
    mutationFn: (data: any) => api.post<any>("/mitras", data),
    onSuccess: (data: any) => {
      const adminUsername = data?.adminUser?.username ?? "?";
      toast.success(`Mitra dibuat - Admin: ${adminUsername} bisa login sekarang`);
      onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));

  function validateStep1AndNext() {
    if (!form.name.trim()) { toast.error("Nama mitra wajib diisi"); return; }
    if (!form.slug.trim() || !/^[a-z0-9-]+$/.test(form.slug)) {
      toast.error("Slug harus kebab-case (huruf kecil, angka, dash)");
      return;
    }
    if (!form.phone.trim()) { toast.error("Telepon wajib diisi"); return; }
    setStep(2);
  }

  function validateAdminForm(): boolean {
    const errs: Record<string, string> = {};
    if (!adminForm.username.trim()) errs.username = "Wajib";
    else if (adminForm.username.length < 3) errs.username = "Min 3 karakter";
    else if (!/^[a-zA-Z0-9_-]+$/.test(adminForm.username)) errs.username = "Hanya huruf, angka, _, -";
    if (!adminForm.name.trim()) errs.name = "Wajib";
    if (!adminForm.password) errs.password = "Wajib";
    else if (adminForm.password.length < 8) errs.password = "Min 8 karakter";
    if (adminForm.password !== adminForm.passwordConfirm) errs.passwordConfirm = "Tidak cocok";
    setAdminErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validateAdminForm()) return;
    mut.mutate({
      ...form,
      admin: {
        username: adminForm.username,
        name: adminForm.name,
        email: adminForm.email || undefined,
        phone: adminForm.phone || undefined,
        password: adminForm.password,
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 md:px-6 pt-5 md:pt-6 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-violet-500" />
            {step === 1 ? "Tambah Mitra Baru" : "Tambah Mitra - Step 2/2"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Daftarkan tenant mitra baru ke platform JABNET. Logo URL bisa diatur setelah mitra dibuat."
              : "Akun Administrator mitra (wajib - sebagai entry point login)."}
          </DialogDescription>
          {/* Step indicator */}
          <div className="flex gap-1.5 pt-1">
            <div className={`h-1 w-8 rounded-full transition-colors ${step >= 1 ? "bg-violet-500" : "bg-muted"}`} />
            <div className={`h-1 w-8 rounded-full transition-colors ${step >= 2 ? "bg-violet-500" : "bg-muted"}`} />
          </div>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-3 px-5 md:px-6 py-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FF
                label="Nama Resmi *"
                value={form.name}
                onChange={(v) => setForm((f) => ({ ...f, name: v, slug: slugify(v) }))}
                placeholder="PT Mitra Fiber..."
              />
              <FF
                label="Slug (URL-safe)"
                value={form.slug}
                onChange={(v) => set("slug")(slugify(v))}
                placeholder="mitra-garut"
                mono
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FF label="Nama Tampilan" value={form.displayName} onChange={set("displayName")} placeholder="Mitra Garut" />
              <FF label="Telepon *" value={form.phone} onChange={set("phone")} placeholder="08123456789" mono />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FF label="PIC / Kontak Utama" value={form.primaryContactName} onChange={set("primaryContactName")} placeholder="Nama PIC" />
              <FF label="No. HP PIC" value={form.primaryContactPhone} onChange={set("primaryContactPhone")} placeholder="08123456789" mono />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FF label="Kecamatan / Wilayah" value={form.district} onChange={set("district")} placeholder="Cilawu, Garut" />
              <FF label="Email" value={form.email} onChange={set("email")} placeholder="kontak@mitra.id" />
            </div>

            <FF label="Alamat" value={form.address} onChange={set("address")} placeholder="Jl. Contoh No. 1, Garut" />

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Catatan (opsional)</label>
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes")(e.target.value)}
                rows={2}
                className="mt-1 text-sm"
                placeholder="Informasi tambahan..."
              />
            </div>

            <div className="p-3 rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800/50 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Semua fitur diaktifkan secara default.</span>{" "}
              Atur fitur per-mitra di tab "Fitur" setelah mitra dibuat.
            </div>
          </div>
        ) : (
          <div className="space-y-3 px-5 md:px-6 py-4 overflow-y-auto flex-1">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200">
              Setiap mitra wajib punya 1 Admin sebagai entry point. Password yang Anda set di sini bisa digunakan langsung untuk login.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FF
                  label="Username *"
                  value={adminForm.username}
                  onChange={(v) => setAdminForm((p) => ({ ...p, username: v }))}
                  placeholder="e.g. asaka_admin"
                  mono
                />
                {adminErrors.username && <div className="text-xs text-red-500 mt-1">{adminErrors.username}</div>}
              </div>
              <div>
                <FF
                  label="Nama Lengkap *"
                  value={adminForm.name}
                  onChange={(v) => setAdminForm((p) => ({ ...p, name: v }))}
                  placeholder="Admin Mitra Asaka"
                />
                {adminErrors.name && <div className="text-xs text-red-500 mt-1">{adminErrors.name}</div>}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FF
                label="Email (opsional)"
                value={adminForm.email}
                onChange={(v) => setAdminForm((p) => ({ ...p, email: v }))}
                placeholder="admin@mitra.id"
                type="email"
              />
              <FF
                label="Phone (opsional - MPWA OTP)"
                value={adminForm.phone}
                onChange={(v) => setAdminForm((p) => ({ ...p, phone: v }))}
                placeholder="08123456789"
                mono
              />
            </div>

            <div>
              <FF
                label="Password * (min 8)"
                value={adminForm.password}
                onChange={(v) => setAdminForm((p) => ({ ...p, password: v }))}
                placeholder="••••••••"
                type="password"
              />
              {adminErrors.password && <div className="text-xs text-red-500 mt-1">{adminErrors.password}</div>}
            </div>

            <div>
              <FF
                label="Konfirmasi Password *"
                value={adminForm.passwordConfirm}
                onChange={(v) => setAdminForm((p) => ({ ...p, passwordConfirm: v }))}
                placeholder="••••••••"
                type="password"
              />
              {adminErrors.passwordConfirm && <div className="text-xs text-red-500 mt-1">{adminErrors.passwordConfirm}</div>}
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-between px-5 md:px-6 py-3 border-t bg-muted/20 shrink-0">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          {step === 1 ? (
            <Button
              onClick={validateStep1AndNext}
              disabled={!form.name.trim() || !form.slug.trim() || !form.phone.trim()}
              className="bg-violet-600 hover:bg-violet-700"
            >
              Lanjut ke Admin →
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>← Kembali</Button>
              <Button onClick={handleSubmit} disabled={mut.isPending} className="bg-violet-600 hover:bg-violet-700">
                {mut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Buat Mitra + Admin
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =======================================================================
// SHARED MICRO-COMPONENTS
// =======================================================================
