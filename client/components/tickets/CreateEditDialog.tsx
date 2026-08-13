import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { type Ticket, type TicketCategory, type SafeUser, type Customer, DURATION_OPTIONS } from "@/components/tickets/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, X } from "lucide-react";

export function CreateEditDialog({ open, onClose, ticket, categories, customers, users }: {
  open: boolean;
  onClose: () => void;
  ticket: Ticket | null;
  categories: TicketCategory[];
  customers: Customer[];
  users: SafeUser[];
}) {
  const qc = useQueryClient();
  const isEdit = ticket !== null;

  const [form, setForm] = useState(getInitialForm(ticket));
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(ticket?.customerId ?? null);
  const [durationMode, setDurationMode] = useState<string>(
    ticket?.estimatedDuration
      ? (DURATION_OPTIONS.some((o) => o.value === String(ticket.estimatedDuration)) ? String(ticket.estimatedDuration) : "custom")
      : "60"
  );
  const [customDuration, setCustomDuration] = useState(
    ticket?.estimatedDuration && !DURATION_OPTIONS.some((o) => o.value === String(ticket.estimatedDuration))
      ? String(ticket.estimatedDuration)
      : ""
  );
  const [submitting, setSubmitting] = useState(false);

  // reset form when dialog opens/closes or ticket changes
  const resetForm = () => {
    setForm(getInitialForm(ticket));
    setSelectedCustomerId(ticket?.customerId ?? null);
    setCustomerSearch("");
    setDurationMode(
      ticket?.estimatedDuration
        ? (DURATION_OPTIONS.some((o) => o.value === String(ticket.estimatedDuration)) ? String(ticket.estimatedDuration) : "custom")
        : "60"
    );
    setCustomDuration(
      ticket?.estimatedDuration && !DURATION_OPTIONS.some((o) => o.value === String(ticket.estimatedDuration))
        ? String(ticket.estimatedDuration)
        : ""
    );
  };

  // filtered customers
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 20);
    const q = customerSearch.toLowerCase();
    return customers.filter((c) =>
      c.name.toLowerCase().includes(q) || c.customerId.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [customers, customerSearch]);

  const selectedCustomer = selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) : null;

  const update = (key: string, val: any) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (!form.categoryId) { toast.error("Kategori wajib diisi"); return; }
    if (!form.title.trim()) { toast.error("Judul wajib diisi"); return; }
    if (!form.scheduledDate) { toast.error("Tanggal jadwal wajib diisi"); return; }
    if (!form.scheduledTime) { toast.error("Jam mulai wajib diisi"); return; }

    const dur = durationMode === "custom" ? Number(customDuration) || null : Number(durationMode) || null;
    const body = {
      title: form.title.trim(),
      categoryId: Number(form.categoryId),
      customerId: selectedCustomerId || null,
      description: form.description || null,
      priority: form.priority,
      assignedTo: form.assignedTo ? Number(form.assignedTo) : null,
      scheduledDate: form.scheduledDate,
      scheduledTime: form.scheduledTime,
      deadline: form.deadline || null,
      estimatedDuration: dur,
      address: form.address || null,
      lat: null,
      lng: null,
      odpId: null,
    };

    setSubmitting(true);
    try {
      if (isEdit) {
        await api.put(`/tickets/${ticket!.id}`, body);
        toast.success("Tiket berhasil diperbarui");
      } else {
        await api.post("/tickets", body);
        toast.success("Tiket berhasil dibuat");
      }
      qc.invalidateQueries({ queryKey: ["tickets"] });
      qc.invalidateQueries({ queryKey: ["ticket-stats"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Gagal menyimpan tiket");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
        else resetForm();
      }}
    >
      {/* ==== Ticket create/edit dialog ==== */}
      <DialogContent data-section="ticket-create-edit-dialog" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Tiket" : "Buat Tiket Baru"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Perbarui informasi tiket work order" : "Isi informasi tiket work order baru"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-2">

          {/* ==== Form group: Info Tiket ==== */}
          <fieldset data-section="ticket-form-info" className="space-y-4">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Info Tiket</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Kategori <span className="text-red-500">*</span></Label>
                <Select value={form.categoryId} onValueChange={(v) => update("categoryId", v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                  <SelectContent>
                    {categories.filter((c) => c.isActive !== 0).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color ?? "#6B7280" }} />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioritas</Label>
                <Select value={form.priority} onValueChange={(v) => update("priority", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Rendah</SelectItem>
                    <SelectItem value="medium">Sedang</SelectItem>
                    <SelectItem value="high">Tinggi</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Judul <span className="text-red-500">*</span></Label>
              <Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="Judul tiket work order" />
            </div>
            <div className="space-y-1.5">
              <Label>Deskripsi</Label>
              <Textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Deskripsi pekerjaan..." rows={3} />
            </div>
          </fieldset>

          {/* ==== Form group: Pelanggan ==== */}
          <fieldset data-section="ticket-form-customer" className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-1">Pelanggan (opsional)</legend>
            {selectedCustomer ? (
              <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-blue-50/50 border-blue-200">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900">{selectedCustomer.name}</p>
                  <p className="text-xs text-gray-500">{selectedCustomer.customerId}{selectedCustomer.phone ? ` \u2022 ${selectedCustomer.phone}` : ""}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedCustomerId(null); update("address", ""); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Cari pelanggan (nama atau ID)..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                {customerSearch.trim() && (
                  <div className="border rounded-lg max-h-[160px] overflow-y-auto">
                    {filteredCustomers.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-3">Tidak ada pelanggan ditemukan</p>
                    ) : (
                      filteredCustomers.map((c) => (
                        <button
                          key={c.id}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-sm transition-colors"
                          onClick={() => {
                            setSelectedCustomerId(c.id);
                            setCustomerSearch("");
                            if (c.address) update("address", c.address);
                          }}
                        >
                          <span className="font-medium">{c.name}</span>
                          <span className="text-gray-400 ml-2 text-xs">{c.customerId}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </fieldset>

          {/* ==== Form group: Jadwal & Waktu ==== */}
          <fieldset data-section="ticket-form-schedule" className="space-y-4">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Jadwal & Waktu</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tanggal Jadwal <span className="text-red-500">*</span></Label>
                <Input type="date" value={form.scheduledDate} onChange={(e) => update("scheduledDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Jam Mulai <span className="text-red-500">*</span></Label>
                <Input type="time" value={form.scheduledTime} onChange={(e) => update("scheduledTime", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Estimasi Durasi</Label>
                <Select value={durationMode} onValueChange={setDurationMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {durationMode === "custom" && (
                  <Input
                    type="number" min={1} placeholder="Durasi dalam menit"
                    value={customDuration} onChange={(e) => setCustomDuration(e.target.value)}
                    className="mt-1.5"
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Deadline (opsional)</Label>
                <Input type="date" value={form.deadline} onChange={(e) => update("deadline", e.target.value)} />
              </div>
            </div>
          </fieldset>

          {/* ==== Form group: Penugasan ==== */}
          <fieldset data-section="ticket-form-assignment" className="space-y-4">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Penugasan</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Lead Teknisi (opsional)</Label>
                <Select value={form.assignedTo} onValueChange={(v) => update("assignedTo", v)}>
                  <SelectTrigger><SelectValue placeholder="Pilih lead teknisi" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tugaskan nanti</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>{u.name} ({u.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                   Lead = penanggung jawab (bisa close tiket). Helper bisa ditambahkan setelah tiket dibuat lewat tombol <strong>Tim Tugas</strong> di detail.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Alamat</Label>
                <Input value={form.address} onChange={(e) => update("address", e.target.value)} placeholder="Alamat lokasi pekerjaan" />
              </div>
            </div>
          </fieldset>

          {/* ==== Form actions ==== */}
          <div data-section="ticket-form-actions" className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Batal</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {isEdit ? "Simpan Perubahan" : "Buat Tiket"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function getInitialForm(ticket: Ticket | null) {
  return {
    categoryId: ticket?.categoryId ? String(ticket.categoryId) : "",
    title: ticket?.title ?? "",
    description: ticket?.description ?? "",
    priority: ticket?.priority ?? "medium",
    assignedTo: ticket?.assignedTo ? String(ticket.assignedTo) : "none",
    scheduledDate: ticket?.scheduledDate ?? "",
    scheduledTime: ticket?.scheduledTime ?? "",
    deadline: ticket?.deadline ?? "",
    address: ticket?.address ?? "",
  };
}

// -- Detail Dialog ----------------------------------------------------------

