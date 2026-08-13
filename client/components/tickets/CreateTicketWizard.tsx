/**
 * v4.2.18 (E): Create Ticket Wizard - 5 langkah
 *   1. Pelanggan: search & pilih customer (atau ticket tanpa customer)
 *   2. Issue: kategori + judul + deskripsi + priority
 *   3. Schedule: tanggal/jam + estimasi durasi + deadline
 *   4. Assign: lead teknisi + helper(s)
 *   5. Review: ringkas semua data, submit
 */

import { useState, useMemo, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronLeft, ChevronRight, Check, User, Tag, Calendar, Users,
  ClipboardList, Loader2, Search, AlertCircle, MapPin,
} from "lucide-react";

interface CustomerLite { id: number; name: string; customerId: string; address: string | null; phone?: string | null; }
interface CategoryLite { id: number; name: string; color?: string | null; slaHours?: number | null; }
interface UserLite { id: number; name: string; role?: string | null; }

interface WizardForm {
  customerId: number | null;
  categoryId: number | null;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  scheduledDate: string;     // YYYY-MM-DD
  scheduledTime: string;     // HH:MM
  estimatedMinutes: number;
  deadline: string;          // optional ISO override
  leadUserId: number | null;
  helperUserIds: number[];
  address: string;
}

const STEPS = [
  { key: "customer", label: "Pelanggan", icon: User },
  { key: "issue",    label: "Masalah",   icon: Tag },
  { key: "schedule", label: "Jadwal",    icon: Calendar },
  { key: "assign",   label: "Tim",       icon: Users },
  { key: "review",   label: "Review",    icon: ClipboardList },
] as const;

const PRIORITIES = [
  { value: "low",    label: "Low",     color: "bg-slate-100 text-slate-800" },
  { value: "medium", label: "Medium",  color: "bg-blue-100 text-blue-800" },
  { value: "high",   label: "High",    color: "bg-amber-100 text-amber-800" },
  { value: "urgent", label: "Urgent",  color: "bg-rose-100 text-rose-800" },
];

const DURATION_PRESETS = [30, 60, 90, 120, 180, 240, 480];

export function CreateTicketWizard({ open, onClose, customers, categories, users }: {
  open: boolean;
  onClose: () => void;
  customers: CustomerLite[];
  categories: CategoryLite[];
  users: UserLite[];
}) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>({
    customerId: null,
    categoryId: null,
    title: "",
    description: "",
    priority: "medium",
    scheduledDate: new Date().toISOString().slice(0, 10),
    scheduledTime: new Date().toTimeString().slice(0, 5),
    estimatedMinutes: 60,
    deadline: "",
    leadUserId: null,
    helperUserIds: [],
    address: "",
  });
  const [customerSearch, setCustomerSearch] = useState("");

  useEffect(() => {
    if (!open) {
      // Reset on close
      setStep(0);
      setForm({
        customerId: null, categoryId: null, title: "", description: "", priority: "medium",
        scheduledDate: new Date().toISOString().slice(0, 10),
        scheduledTime: new Date().toTimeString().slice(0, 5),
        estimatedMinutes: 60, deadline: "",
        leadUserId: null, helperUserIds: [], address: "",
      });
      setCustomerSearch("");
    }
  }, [open]);

  const selectedCustomer = useMemo(() => customers.find(c => c.id === form.customerId), [customers, form.customerId]);
  const selectedCategory = useMemo(() => categories.find(c => c.id === form.categoryId), [categories, form.categoryId]);
  const selectedLead = useMemo(() => users.find(u => u.id === form.leadUserId), [users, form.leadUserId]);
  const selectedHelpers = useMemo(() => users.filter(u => form.helperUserIds.includes(u.id)), [users, form.helperUserIds]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 20);
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) || c.customerId.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [customers, customerSearch]);

  const createMut = useMutation({
    mutationFn: async () => {
      const body: any = {
        title: form.title.trim(),
        categoryId: form.categoryId,
        customerId: form.customerId,
        description: form.description || null,
        priority: form.priority,
        scheduledDate: form.scheduledDate,
        scheduledTime: form.scheduledTime,
        estimatedDuration: form.estimatedMinutes,
        deadline: form.deadline || null,
        address: form.address || selectedCustomer?.address || null,
        assignedTo: form.leadUserId,
      };
      const res: any = await api.post("/tickets", body);
      const ticketId = res?.id ?? res?.data?.id;
      // Add helpers via team endpoint if any
      if (ticketId && form.helperUserIds.length > 0) {
        for (const uid of form.helperUserIds) {
          await api.post(`/tickets/${ticketId}/team`, { userId: uid, role: "helper" }).catch(() => {});
        }
      }
      return res;
    },
    onSuccess: () => {
      toast.success("Tiket berhasil dibuat");
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["ticket-stats"] });
      qc.invalidateQueries({ queryKey: ["sla-stats"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message || "Gagal buat tiket"),
  });

  function canAdvance(): boolean {
    if (step === 0) return true; // pelanggan optional
    if (step === 1) return !!form.categoryId && form.title.trim().length >= 3;
    if (step === 2) return !!form.scheduledDate && !!form.scheduledTime && form.estimatedMinutes > 0;
    if (step === 3) return true; // assignment optional
    return true;
  }

  function next() {
    if (!canAdvance()) {
      toast.error("Lengkapi data wajib di langkah ini");
      return;
    }
    setStep(s => Math.min(STEPS.length - 1, s + 1));
  }
  function prev() { setStep(s => Math.max(0, s - 1)); }

  function toggleHelper(uid: number) {
    setForm(f => ({
      ...f,
      helperUserIds: f.helperUserIds.includes(uid)
        ? f.helperUserIds.filter(id => id !== uid)
        : [...f.helperUserIds, uid],
    }));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl dialog-w max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 py-3.5 border-b">
          <DialogTitle className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-gradient-to-br from-sky-500 to-blue-700">
              <ClipboardList className="h-4 w-4 text-white" />
            </div>
            Buat Tiket Baru
          </DialogTitle>
          <DialogDescription className="text-xs">
            Langkah {step + 1} dari {STEPS.length} · {STEPS[step].label}
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="px-5 py-3 border-b bg-muted/20">
          <div className="flex items-center justify-between gap-1">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <div key={s.key} className="flex-1 flex items-center gap-1">
                  <div className={`h-7 w-7 rounded-full grid place-items-center text-[10px] font-bold transition ${
                    done ? "bg-emerald-500 text-white" :
                    active ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </div>
                  <div className={`hidden md:block text-[11px] font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>
                    {s.label}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 rounded ${done ? "bg-emerald-500" : "bg-muted"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Step 1: Customer */}
          {step === 0 && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pilih Pelanggan</label>
                <p className="text-[11px] text-muted-foreground mt-0.5">Optional. Bisa skip kalau tiket internal/maintenance.</p>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cari nama atau ID pelanggan..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="pl-9 text-sm"
                />
              </div>

              {selectedCustomer && (
                <div className="rounded-md border-2 border-primary bg-primary/5 px-3 py-2.5 flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">{selectedCustomer.name}</div>
                    <div className="text-[11px] text-muted-foreground font-mono">#{selectedCustomer.customerId}</div>
                    {selectedCustomer.address && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">{selectedCustomer.address}</div>
                    )}
                  </div>
                  <Button size="xs" variant="ghost" onClick={() => setForm(f => ({ ...f, customerId: null }))}>
                    Ganti
                  </Button>
                </div>
              )}

              {!selectedCustomer && (
                <div className="rounded-md border max-h-[280px] overflow-y-auto divide-y">
                  {filteredCustomers.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                      {customerSearch ? "Tidak ada match" : "Mulai ketik untuk cari pelanggan"}
                    </div>
                  ) : filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setForm(f => ({ ...f, customerId: c.id, address: c.address ?? f.address }))}
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2"
                    >
                      <div className="h-7 w-7 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 grid place-items-center text-white text-[10px] font-bold shrink-0">
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{c.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">#{c.customerId} {c.address ? `· ${c.address.slice(0, 40)}` : ""}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => setForm(f => ({ ...f, customerId: null }))}
                className="text-xs text-muted-foreground hover:text-foreground italic"
              >
                Tiket tanpa pelanggan (internal / maintenance) →
              </button>
            </div>
          )}

          {/* Step 2: Issue */}
          {step === 1 && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Kategori <span className="text-rose-600">*</span></label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1.5">
                  {categories.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setForm(f => ({ ...f, categoryId: c.id }))}
                      className={`px-3 py-2.5 rounded-md border text-left transition ${
                        form.categoryId === c.id
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                          : "hover:border-foreground/30 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {c.color && <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} />}
                        <div className="text-sm font-semibold truncate">{c.name}</div>
                      </div>
                      {c.slaHours && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">SLA {c.slaHours} jam</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Judul Tiket <span className="text-rose-600">*</span></label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="Singkat & jelas (min 3 karakter)"
                  className="mt-1 text-sm"
                  maxLength={120}
                />
                <div className="text-[10px] text-muted-foreground mt-1">{form.title.length}/120</div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Deskripsi</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Detail masalah, gejala, langkah yang sudah dicoba..."
                  rows={4}
                  className="mt-1 text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Priority</label>
                <div className="grid grid-cols-4 gap-2 mt-1.5">
                  {PRIORITIES.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setForm(f => ({ ...f, priority: p.value as any }))}
                      className={`px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition ${
                        form.priority === p.value
                          ? `${p.color} ring-2 ring-foreground/20`
                          : `${p.color} opacity-50 hover:opacity-80`
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Schedule */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider">Tanggal <span className="text-rose-600">*</span></label>
                  <Input
                    type="date"
                    value={form.scheduledDate}
                    onChange={(e) => setForm(f => ({ ...f, scheduledDate: e.target.value }))}
                    className="mt-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider">Jam Mulai <span className="text-rose-600">*</span></label>
                  <Input
                    type="time"
                    value={form.scheduledTime}
                    onChange={(e) => setForm(f => ({ ...f, scheduledTime: e.target.value }))}
                    className="mt-1 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Estimasi Durasi (menit)</label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {DURATION_PRESETS.map(d => (
                    <button
                      key={d}
                      onClick={() => setForm(f => ({ ...f, estimatedMinutes: d }))}
                      className={`px-3 py-1.5 rounded-md border text-xs font-mono ${
                        form.estimatedMinutes === d ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted/30"
                      }`}
                    >
                      {d < 60 ? `${d}m` : d % 60 === 0 ? `${d / 60}j` : `${Math.floor(d / 60)}j ${d % 60}m`}
                    </button>
                  ))}
                  <Input
                    type="number"
                    min="1"
                    placeholder="Custom"
                    value={form.estimatedMinutes}
                    onChange={(e) => setForm(f => ({ ...f, estimatedMinutes: Number(e.target.value) || 0 }))}
                    className="w-24 text-xs h-8"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Deadline (override SLA otomatis)</label>
                <Input
                  type="datetime-local"
                  value={form.deadline}
                  onChange={(e) => setForm(f => ({ ...f, deadline: e.target.value }))}
                  className="mt-1 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {selectedCategory?.slaHours
                    ? `Default: ${selectedCategory.slaHours} jam dari sekarang (otomatis dari kategori)`
                    : "Tidak ada SLA otomatis dari kategori - set manual kalau perlu"}
                </p>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Alamat / Lokasi</label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder={selectedCustomer?.address ?? "Alamat eksekusi"}
                  className="mt-1 text-sm"
                  leftIcon={<MapPin className="h-3 w-3" />}
                />
              </div>
            </div>
          )}

          {/* Step 4: Assign */}
          {step === 3 && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Lead Teknisi</label>
                <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
                  Lead yang bertanggung jawab. Helper bisa dipilih di bawah.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-[180px] overflow-y-auto rounded-md border p-1">
                  {users.map(u => (
                    <button
                      key={u.id}
                      onClick={() => setForm(f => ({ ...f, leadUserId: f.leadUserId === u.id ? null : u.id }))}
                      className={`px-2.5 py-1.5 rounded text-left flex items-center gap-2 transition ${
                        form.leadUserId === u.id ? "bg-amber-100 ring-2 ring-amber-400" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className={`h-6 w-6 rounded-full grid place-items-center text-white text-[10px] font-bold shrink-0 ${
                        form.leadUserId === u.id ? "bg-amber-500" : "bg-zinc-400"
                      }`}>{u.name.charAt(0).toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate">{u.name}</div>
                        {u.role && <div className="text-[10px] text-muted-foreground">{u.role}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider">Helper (opsional)</label>
                <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
                  Klik untuk add/remove helper.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                  {users.filter(u => u.id !== form.leadUserId).map(u => {
                    const isHelper = form.helperUserIds.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        onClick={() => toggleHelper(u.id)}
                        className={`px-2 py-1.5 rounded-md text-left flex items-center gap-1.5 transition border ${
                          isHelper ? "bg-sky-50 border-sky-300 ring-1 ring-sky-200" : "hover:bg-muted/30"
                        }`}
                      >
                        <div className={`h-5 w-5 rounded-full grid place-items-center text-white text-[9px] font-bold shrink-0 ${
                          isHelper ? "bg-sky-500" : "bg-zinc-400"
                        }`}>{u.name.charAt(0).toUpperCase()}</div>
                        <span className="text-[11px] truncate flex-1">{u.name}</span>
                        {isHelper && <Check className="h-3 w-3 text-sky-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Review */}
          {step === 4 && (
            <div className="space-y-2">
              <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 mb-3">
                <div className="text-xs font-bold text-emerald-900">Review sebelum buat tiket</div>
                <div className="text-[11px] text-emerald-700 mt-0.5">Pastikan semua data benar. Bisa scroll back via stepper.</div>
              </div>

              {[
                { label: "Pelanggan", value: selectedCustomer ? `${selectedCustomer.name} (#${selectedCustomer.customerId})` : "-" },
                { label: "Kategori", value: selectedCategory?.name ?? "-" },
                { label: "Judul", value: form.title },
                { label: "Priority", value: form.priority.toUpperCase() },
                { label: "Tanggal & Jam", value: `${form.scheduledDate} · ${form.scheduledTime}` },
                { label: "Estimasi", value: `${form.estimatedMinutes} menit` },
                { label: "Deadline", value: form.deadline ? new Date(form.deadline).toLocaleString("id-ID") : "Auto dari SLA kategori" },
                { label: "Alamat", value: form.address || selectedCustomer?.address || "-" },
                { label: "Lead", value: selectedLead?.name ?? "Belum dipilih" },
                { label: "Helper", value: selectedHelpers.length ? selectedHelpers.map(h => h.name).join(", ") : "-" },
                { label: "Deskripsi", value: form.description || "-" },
              ].map((row, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 border-b last:border-b-0 text-xs">
                  <div className="col-span-4 font-bold uppercase tracking-wider text-muted-foreground">{row.label}</div>
                  <div className="col-span-8">{row.value}</div>
                </div>
              ))}

              {!form.title.trim() && (
                <div className="px-3 py-2 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5" /> Judul wajib diisi - kembali ke step 2
                </div>
              )}
              {!form.categoryId && (
                <div className="px-3 py-2 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5" /> Kategori wajib dipilih - kembali ke step 2
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-muted/10 flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={prev} disabled={step === 0 || createMut.isPending} leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}>
            Kembali
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next} disabled={!canAdvance()} rightIcon={<ChevronRight className="h-3.5 w-3.5" />}>
              Lanjut
            </Button>
          ) : (
            <Button
              onClick={() => createMut.mutate()}
              disabled={!form.categoryId || !form.title.trim() || createMut.isPending}
              loading={createMut.isPending}
              rightIcon={<Check className="h-3.5 w-3.5" />}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Buat Tiket
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
