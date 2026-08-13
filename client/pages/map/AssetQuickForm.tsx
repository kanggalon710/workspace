import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableOdpSelect } from "@/components/shared/SearchableOdpSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, Check } from "lucide-react";
import { garutDistricts, garutDemography } from "@/lib/garut-demography";

// Extracted components
import { MapToolbar } from "@/components/map/MapToolbar";
import { MapSearchBar } from "@/components/map/MapSearchBar";
import { MapLayerPanel } from "@/components/map/MapLayerPanel";
import { MapTypeSelector } from "@/components/map/MapTypeSelector";
import { MapCameraControls } from "@/components/map/MapCameraControls";
import { MapInfoWindowContent } from "@/components/map/MapInfoWindow";
import { OdpDetailPanel } from "@/components/map/OdpDetailPanel";
import { MapMitraSelector } from "@/components/map/MapMitraSelector";
import { MapUtilityButtons } from "@/components/map/MapUtilityButtons";
import { FABSpeedDial } from "@/components/map/FABSpeedDial";
import { BottomSheet } from "@/components/shared/BottomSheet";

// Shared asset config
import {
  ASSET_COLORS, ASSET_MARKER_CONFIG, CABLE_COLORS, DARK_MAP_STYLE,
  dotIcon, odpUsageColor,
  type AssetType,
} from "@/lib/assetColors";
import { GARUT_CENTER, DEFAULT_ZOOM, SNAP_THRESHOLD_METERS, haversineMeters, nearestOnSegment, findSnapPoint, type SnapResult, type QuickFormProps } from "./shared";

export function AssetQuickForm({ type, lat, lng, district, village, address, isEdit, initialData, onSubmit, onCancel, isPending, pops, odcs, odps, hideOdpDropdown }: QuickFormProps) {
  const [formData, setFormData] = useState<Record<string, any>>({
    lat, lng, status: "active", district, village, address, ...initialData
  });

  // Re-sync if QuickForm props update from reverse-geocode
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      district: district || prev.district,
      village: village || prev.village,
      address: address || prev.address
    }));
  }, [district, village, address]);

  const set = (key: string, value: any) => setFormData((p) => ({ ...p, [key]: value }));
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); onSubmit(formData, isEdit, initialData?.id); };
  const config = ASSET_MARKER_CONFIG[type];

  return (
    <Card className="w-80 shadow-xl border-2 animate-pop-in" style={{ borderColor: config.color }}>
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.color }} />
          {isEdit ? "Edit" : "Tambah"} {config.label}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{lat.toFixed(6)}, {lng.toFixed(6)}</p>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Nama</Label>
              <Input className="h-7 text-xs" required placeholder={`${config.label} baru...`} defaultValue={formData.name || ""} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Kode</Label>
              <Input className="h-7 text-xs" required placeholder={`${type.toUpperCase()}-001`} defaultValue={formData.code || ""} onChange={(e) => set("code", e.target.value)} />
            </div>
          </div>

          {type !== "pole" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label className="text-xs">Kecamatan</Label>
                <select className="flex h-7 w-full rounded border border-input bg-transparent px-2 text-xs" required value={formData.district || ""} onChange={(e) => { set("district", e.target.value); set("village", ""); }}>
                  <option value="">Pilih Kecamatan...</option>
                  {garutDistricts.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Kelurahan / Desa</Label>
                <select className="flex h-7 w-full rounded border border-input bg-transparent px-2 text-xs" required value={formData.village || ""} onChange={(e) => set("village", e.target.value)} disabled={!formData.district}>
                  <option value="">Pilih Kelurahan...</option>
                  {formData.district && garutDemography[formData.district as keyof typeof garutDemography]?.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Alamat</Label>
                <Input className="h-7 text-xs" placeholder="Detail jalan..." value={formData.address || ""} onChange={(e) => set("address", e.target.value)} />
              </div>
            </div>
          )}

          {type === "odc" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">POP Induk</Label>
                <select className="flex h-7 w-full rounded border border-input bg-transparent px-2 text-xs" value={formData.popId || ""} onChange={(e) => set("popId", Number(e.target.value) || undefined)}>
                  <option value="">Pilih...</option>
                  {pops?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Splitter</Label>
                <select className="flex h-7 w-full rounded border border-input bg-transparent px-2 text-xs" value={formData.splitterType || ""} onChange={(e) => set("splitterType", e.target.value)}>
                  <option value="">-</option>
                  <option value="1:4">1:4</option>
                  <option value="1:8">1:8</option>
                  <option value="1:16">1:16</option>
                  <option value="1:32">1:32</option>
                </select>
              </div>
            </div>
          )}

          {type === "odp" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">ODC Induk</Label>
                <select className="flex h-7 w-full rounded border border-input bg-transparent px-2 text-xs" value={formData.odcId || ""} onChange={(e) => set("odcId", Number(e.target.value) || undefined)}>
                  <option value="">Pilih...</option>
                  {odcs?.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs">Kapasitas</Label>
                <Input className="h-7 text-xs" type="number" defaultValue={formData.capacity ?? 8} onChange={(e) => set("capacity", Number(e.target.value))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Splitter</Label>
                <select className="flex h-7 w-full rounded border border-input bg-transparent px-2 text-xs" required value={formData.splitterType || ""} onChange={(e) => set("splitterType", e.target.value)}>
                  <option value="">Pilih splitter...</option>
                  <option value="1:4">1:4</option>
                  <option value="1:8">1:8</option>
                  <option value="1:16">1:16</option>
                  <option value="1:32">1:32</option>
                </select>
              </div>
            </div>
          )}

          {type === "customer" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs">ID Pelanggan</Label>
                  <Input className="h-7 text-xs" required placeholder="CUST-001" defaultValue={formData.customerId || ""} onChange={(e) => set("customerId", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Paket</Label>
                  <select className="flex h-7 w-full rounded border border-input bg-transparent px-2 text-xs" value={formData.package || ""} onChange={(e) => set("package", e.target.value)}>
                    <option value="">Pilih...</option>
                    <option value="Lite">Lite</option>
                    <option value="MedSpace">MedSpace</option>
                    <option value="HighSpace">HighSpace</option>
                    <option value="SOHO-50M">SOHO-50M</option>
                  </select>
                </div>
                {(!hideOdpDropdown || isEdit) && (
                  <div>
                    <Label className="text-xs">ODP</Label>
                    <SearchableOdpSelect
                      value={formData.odpId ?? null}
                      onChange={(id) => set("odpId", id ?? undefined)}
                      odps={(odps ?? []) as any}
                      placeholder="Pilih ODP..."
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {type === "pop" && (
            <div>
              <Label className="text-xs">Total Port</Label>
              <Input className="h-7 text-xs" type="number" defaultValue={48} onChange={(e) => set("totalPorts", Number(e.target.value))} />
            </div>
          )}

          {type === "pole" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Tipe</Label>
                <select className="flex h-7 w-full rounded border border-input bg-transparent px-2 text-xs" onChange={(e) => set("type", e.target.value)}>
                  <option value="">-</option>
                  <option value="beton">Beton</option>
                  <option value="besi">Besi</option>
                  <option value="kayu">Kayu</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Tinggi (m)</Label>
                <Input className="h-7 text-xs" type="number" step="0.1" placeholder="9" onChange={(e) => set("height", Number(e.target.value))} />
              </div>
            </div>
          )}

          <div className="col-span-2 pt-1 pb-1">
            <Label className="text-xs">Alamat / Jalan (Auto-Deteksi)</Label>
            <Input className="h-7 text-xs" placeholder="Detail jalan..." value={formData.address || ""} onChange={(e) => set("address", e.target.value)} />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" className="flex-1 h-7 text-xs" disabled={isPending}>
              <Check className="h-3 w-3 mr-1" />
              {isPending ? "..." : "Simpan"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ==================== CABLE FORM ====================

