/**
 * v4.2.18 (D): Resolution Form
 *
 * Dipakai di stage final ("Konfirmasi Pelanggan" atau equivalent) untuk:
 *   - D.1 Resolution code dropdown (kategori solusi)
 *   - D.2 Material repeater (nama, qty, unit, sku, cost)
 *   - D.3 Resolution notes (existing → kept compatible)
 *   - D.4 BAST generation (trigger di submit)
 */

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, FileText, Wrench } from "lucide-react";

export const RESOLUTION_CODES = [
  { value: "FIBER_REPAIR", label: "Perbaikan Fiber Optik (sambung/ganti kabel)" },
  { value: "ONT_REPLACE", label: "Ganti / Reset ONT" },
  { value: "CONNECTOR_REPLACE", label: "Ganti Konektor / Pigtail" },
  { value: "CABLE_REROUTE", label: "Re-route Kabel / Reposisi Drop" },
  { value: "CONFIG_CHANGE", label: "Konfigurasi Ulang (PPPoE/profile/MikroTik)" },
  { value: "CUSTOMER_SIDE", label: "Masalah Sisi Pelanggan (router/PC/wifi)" },
  { value: "NO_ISSUE_FOUND", label: "Tidak Ditemukan Kerusakan" },
  { value: "OTHER", label: "Lainnya (jelaskan di catatan)" },
];

export interface MaterialItem {
  name: string;
  qty: number;
  unit: string;       // pcs, m, set
  sku?: string;
  cost?: number;
}

export interface ResolutionData {
  resolutionCode: string;
  resolution: string;          // notes
  materialUsed: MaterialItem[];
}

const DEFAULT_UNITS = ["pcs", "m", "set", "rol", "btl"];

export function ResolutionForm({
  initial,
  onChange,
}: {
  initial?: Partial<ResolutionData>;
  onChange: (data: ResolutionData) => void;
}) {
  const [code, setCode] = useState<string>(initial?.resolutionCode ?? "");
  const [notes, setNotes] = useState<string>(initial?.resolution ?? "");
  const [materials, setMaterials] = useState<MaterialItem[]>(initial?.materialUsed ?? []);

  function emit(next: Partial<ResolutionData>) {
    onChange({
      resolutionCode: next.resolutionCode ?? code,
      resolution: next.resolution ?? notes,
      materialUsed: next.materialUsed ?? materials,
    });
  }

  function addMaterial() {
    const next = [...materials, { name: "", qty: 1, unit: "pcs" }];
    setMaterials(next);
    emit({ materialUsed: next });
  }

  function updateMaterial(idx: number, patch: Partial<MaterialItem>) {
    const next = materials.map((m, i) => i === idx ? { ...m, ...patch } : m);
    setMaterials(next);
    emit({ materialUsed: next });
  }

  function removeMaterial(idx: number) {
    const next = materials.filter((_, i) => i !== idx);
    setMaterials(next);
    emit({ materialUsed: next });
  }

  const totalCost = materials.reduce((s, m) => s + (m.cost ?? 0) * (m.qty ?? 0), 0);

  return (
    <div className="space-y-3">
      {/* D.1: Resolution code */}
      <div className="rounded-md border bg-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          <label className="text-xs font-bold uppercase tracking-wider">Kode Resolusi <span className="text-rose-600">*</span></label>
        </div>
        <select
          value={code}
          onChange={(e) => { setCode(e.target.value); emit({ resolutionCode: e.target.value }); }}
          className="w-full px-3 py-2 rounded-md border bg-background text-sm"
        >
          <option value="">- Pilih kategori solusi -</option>
          {RESOLUTION_CODES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground mt-1.5 italic">
          Untuk reporting: kode ini di-aggregate per teknisi/kategori untuk track top issue.
        </p>
      </div>

      {/* D.3: Resolution notes */}
      <div className="rounded-md border bg-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <label className="text-xs font-bold uppercase tracking-wider">Catatan Penyelesaian</label>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); emit({ resolution: e.target.value }); }}
          placeholder="Jelaskan apa yang dikerjakan, masalah yang ditemukan, dan solusi yang diterapkan..."
          rows={4}
          className="text-sm"
        />
      </div>

      {/* D.2: Material repeater */}
      <div className="rounded-md border bg-card p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider">Material Dipakai</span>
            {materials.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted">{materials.length} item</span>
            )}
          </div>
          <Button size="xs" variant="ghost-primary" onClick={addMaterial} leftIcon={<Plus className="h-3 w-3" />}>
            Tambah
          </Button>
        </div>
        {materials.length === 0 ? (
          <div className="text-xs text-muted-foreground italic py-2 text-center">
            Belum ada material. Tambah kalau ada bahan yang dipakai (kabel, konektor, ONT, dll).
          </div>
        ) : (
          <div className="space-y-2">
            {materials.map((m, i) => (
              <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                <Input
                  placeholder="Nama material"
                  value={m.name}
                  onChange={(e) => updateMaterial(i, { name: e.target.value })}
                  className="col-span-5 text-xs h-8"
                />
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="Qty"
                  value={m.qty}
                  onChange={(e) => updateMaterial(i, { qty: Number(e.target.value) })}
                  className="col-span-2 text-xs h-8 font-mono"
                />
                <select
                  value={m.unit}
                  onChange={(e) => updateMaterial(i, { unit: e.target.value })}
                  className="col-span-2 px-1.5 rounded-md border bg-background text-xs h-8"
                >
                  {DEFAULT_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <Input
                  type="number"
                  min="0"
                  placeholder="Cost"
                  value={m.cost ?? ""}
                  onChange={(e) => updateMaterial(i, { cost: e.target.value ? Number(e.target.value) : undefined })}
                  className="col-span-2 text-xs h-8 font-mono"
                />
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Hapus material"
                  onClick={() => removeMaterial(i)}
                  className="col-span-1 text-rose-600"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {totalCost > 0 && (
              <div className="flex items-center justify-end pt-2 border-t text-xs">
                <span className="text-muted-foreground mr-2">Estimasi total cost:</span>
                <span className="font-bold tabular-nums">Rp {totalCost.toLocaleString("id-ID")}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
