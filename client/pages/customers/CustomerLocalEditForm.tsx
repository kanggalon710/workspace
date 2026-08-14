import { useState } from "react";
import { useOdps, useOdpUtilization } from "@/hooks/useAssets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { Customer, InsertCustomer } from "@shared/schema";
import { MapPin, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SearchableOdpSelect } from "@/components/shared/SearchableOdpSelect";

// ========================================================================
// v4.1.3+: CustomerLocalEditForm - hanya edit 6 field LOCAL (koordinat, ODP,
// ONT SN, notes). Semua field billing (nama, phone, alamat, paket, dll)
// sync dari billing.jabnet.id dan TIDAK bisa diubah di FTTH Tools.
// ========================================================================

export function CustomerLocalEditForm({
  item, onSubmit, isPending,
}: {
  item: Customer;
  onSubmit: (data: Partial<InsertCustomer>) => void;
  isPending: boolean;
}) {
  const anyItem = item as any;
  const [lat, setLat] = useState<string>(item.lat?.toString() ?? "");
  const [lng, setLng] = useState<string>(item.lng?.toString() ?? "");
  const [odpId, setOdpId] = useState<number | null>(item.odpId ?? null);
  const [portNumber, setPortNumber] = useState<string>(item.portNumber?.toString() ?? "");
  const [ontSerialNumber, setOntSerialNumber] = useState<string>(anyItem.ontSerialNumber ?? "");
  const [notes, setNotes] = useState<string>(item.notes ?? "");

  const { data: odps } = useOdps();
  const { data: odpUtil } = useOdpUtilization();
  // Utilisasi ODP yang sedang dipilih (untuk batas port + cek bentrok).
  const sel = odpUtil?.odps.find((o) => o.id === odpId);
  // Port milik pelanggan ini sendiri hanya "bebas" kalau masih di ODP yang sama.
  const ownPort = odpId === item.odpId ? item.portNumber : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const portTrimmed = portNumber.trim();
    if (portTrimmed) {
      const port = Number(portTrimmed);
      if (!Number.isInteger(port) || port < 1) {
        toast.error("Port number harus bilangan bulat >= 1");
        return;
      }
      if (sel) {
        if (port > sel.capacity) {
          toast.error(`Port maksimal ${sel.capacity} (kapasitas ODP ${sel.name})`);
          return;
        }
        if (port !== ownPort && sel.usedPortList.includes(port)) {
          toast.error(`Port ${port} sudah dipakai pelanggan lain di ODP ini`);
          return;
        }
      }
    }
    const payload: any = { notes, ontSerialNumber };
    payload.lat = lat.trim() ? Number(lat) : null;
    payload.lng = lng.trim() ? Number(lng) : null;
    payload.odpId = odpId;
    payload.portNumber = portTrimmed ? Number(portTrimmed) : null;
    onSubmit(payload);
  };

  const detectGps = () => {
    if (!navigator.geolocation) return toast.error("Browser tidak support GPS");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude.toFixed(6)); setLng(pos.coords.longitude.toFixed(6)); toast.success("Lokasi GPS terdeteksi"); },
      (err) => toast.error(`GPS error: ${err.message}`),
      { enableHighAccuracy: true },
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Info readonly dari billing */}
      <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <Info className="h-3.5 w-3.5 text-amber-600" />
          <span className="font-semibold text-amber-700 dark:text-amber-400">Data Sync dari Billing (Read-Only)</span>
          <Badge variant="outline" className="text-[9px] ml-auto">billing.jabnet.id</Badge>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <div><span className="text-muted-foreground">Nama:</span> <span className="font-medium">{item.name ?? "-"}</span></div>
          <div><span className="text-muted-foreground">Customer ID:</span> <span className="font-mono">{item.customerId}</span></div>
          <div><span className="text-muted-foreground">Phone:</span> <span className="font-mono">{item.phone ?? "-"}</span></div>
          <div><span className="text-muted-foreground">Email:</span> <span className="font-mono">{anyItem.email ?? "-"}</span></div>
          <div className="col-span-2"><span className="text-muted-foreground">Alamat:</span> {item.address ?? "-"}</div>
          <div><span className="text-muted-foreground">Paket:</span> {item.package ?? "-"}</div>
          <div><span className="text-muted-foreground">Status:</span> <span className={item.isIsolir === 1 ? "text-red-600" : "text-green-600"}>{item.status ?? "-"}{item.isIsolir === 1 ? " (isolir)" : ""}</span></div>
          <div><span className="text-muted-foreground">Kecamatan:</span> {anyItem.district ?? "-"}</div>
          <div><span className="text-muted-foreground">Kelurahan:</span> {anyItem.village ?? "-"}</div>
          <div><span className="text-muted-foreground">Tipe:</span> {anyItem.customerType ?? "-"}</div>
          <div><span className="text-muted-foreground">Install:</span> {item.installDate ?? "-"}</div>
          <div><span className="text-muted-foreground">PPPoE:</span> <span className="font-mono text-[11px]">{anyItem.pppoeUsername ?? "-"}</span></div>
          <div><span className="text-muted-foreground">Harga:</span> Rp {(item.billingPrice ?? 0).toLocaleString("id-ID")}</div>
        </div>
        <div className="text-[10px] text-muted-foreground pt-1 border-t">
          Data di atas di-sync dari billing setiap beberapa menit. Perubahan harus dilakukan di <a href="https://billing.jabnet.id" target="_blank" rel="noreferrer" className="underline">panel billing</a>.
        </div>
      </div>

      {/* Field editable local */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          Data Lokal FTTH Tools (Editable)
        </div>

        {/* Koordinat */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Koordinat Peta</Label>
            <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={detectGps}>
              <MapPin className="h-3 w-3 mr-1" /> Deteksi GPS
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="-7.xxxxxx (Lat)"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="font-mono text-xs"
            />
            <Input
              placeholder="107.xxxxxx (Lng)"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Untuk plot di peta jaringan, coverage check, dan ODP mapping. Kosongkan kalau belum diketahui.
          </p>
        </div>

        {/* ODP mapping */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <Label className="text-xs">ODP</Label>
            <SearchableOdpSelect
              value={odpId}
              onChange={setOdpId}
              odps={odps ?? []}
            />
          </div>
          <div>
            <Label className="text-xs">Port Number</Label>
            <Input
              type="number"
              min="1"
              max={sel?.capacity}
              step={1}
              placeholder="1, 2, 3, ..."
              value={portNumber}
              onChange={(e) => setPortNumber(e.target.value)}
              className="font-mono"
            />
            {sel && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Port 1–{sel.capacity} · {sel.availablePorts} kosong
                {sel.nextPort ? ` · next: ${sel.nextPort}` : " · penuh"}
              </p>
            )}
          </div>
        </div>

        {/* ONT Serial Number */}
        <div className="space-y-1 mb-3">
          <Label className="text-xs">ONT Serial Number (GenieACS)</Label>
          <Input
            placeholder="e.g. 485754436B477B10"
            value={ontSerialNumber}
            onChange={(e) => setOntSerialNumber(e.target.value)}
            className="font-mono uppercase"
          />
          <p className="text-[10px] text-muted-foreground">
            Untuk match ke device GenieACS kalau bridging via pppoeUsername gagal. Opsional.
          </p>
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <Label className="text-xs">Catatan Internal Tim</Label>
          <Textarea
            placeholder="Catatan teknisi/NOC (mis. akses masuk lewat jalan kiri, bawa tangga 4m, dll)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-3 border-t">
        <Button type="submit" disabled={isPending} className="flex-1">
          {isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Menyimpan...</> : <>Simpan Data Lokal</>}
        </Button>
      </div>
    </form>
  );
}

// ==================== MAIN PAGE ====================

