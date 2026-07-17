import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Combobox } from "@/components/ui/combobox";
import { useCreateLeadFromCard } from "@/hooks/usePipelines";
import { detectLeadPrefill } from "@shared/cardToLead";

const CATEGORIES = [
  { value: "rumahan", label: "Rumahan" },
  { value: "bisnis", label: "Bisnis" },
  { value: "perkantoran", label: "Perkantoran" },
  { value: "sekolah", label: "Sekolah" },
  { value: "lainnya", label: "Lainnya" },
];

export function CreateLeadFromCardDialog({
  cardId,
  title,
  values,
  fields,
  onClose,
}: {
  cardId: number;
  title: string;
  values: Record<number, string>;
  fields: { id: number; type: string }[];
  onClose: () => void;
}) {
  const prefill = detectLeadPrefill(title, values, fields);
  const [name, setName] = useState(prefill.name);
  const [phone, setPhone] = useState(prefill.phone ?? "");
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState("rumahan");
  const [district, setDistrict] = useState("");
  const [village, setVillage] = useState("");
  const create = useCreateLeadFromCard(cardId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    create.mutate(
      {
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        category,
        district: district.trim() || undefined,
        village: village.trim() || undefined,
        lat: prefill.lat,
        lng: prefill.lng,
      },
      {
        onSuccess: () => {
          toast.success("Lead dibuat & ditautkan");
          onClose();
        },
        onError: (err: any) => toast.error(err.message || "Gagal membuat lead"),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat Lead dari kartu</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <FormField label="Nama" htmlFor="lead-name" required>
            <Input
              id="lead-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama calon pelanggan"
            />
          </FormField>
          <FormField label="Telepon" htmlFor="lead-phone">
            <Input
              id="lead-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08…"
            />
          </FormField>
          <FormField label="Alamat" htmlFor="lead-address">
            <Input
              id="lead-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </FormField>
          <FormField label="Kategori" htmlFor="lead-category">
            <Combobox
              options={CATEGORIES}
              value={category}
              onChange={(v) => setCategory(v || "rumahan")}
              clearable={false}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Kecamatan" htmlFor="lead-district">
              <Input
                id="lead-district"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              />
            </FormField>
            <FormField label="Desa/Kelurahan" htmlFor="lead-village">
              <Input
                id="lead-village"
                value={village}
                onChange={(e) => setVillage(e.target.value)}
              />
            </FormField>
          </div>
          {prefill.lat != null && prefill.lng != null && (
            <p className="text-xs text-muted-foreground">
              Koordinat terdeteksi: {prefill.lat}, {prefill.lng}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
              Buat Lead
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
