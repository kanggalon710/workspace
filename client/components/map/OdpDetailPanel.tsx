import { useState } from "react";
import { CircleDot, Pencil, Link2, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BottomSheet } from "@/components/shared/BottomSheet";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { useOdpDetail, useOdpOntStatus } from "@/hooks/useOdpDetail";
import { CapacityIndicator } from "./CapacityIndicator";
import { OdpCustomerList } from "./OdpCustomerList";
import { AssetPhotosGallery } from "@/components/shared/AssetPhotosGallery";

/** Shell panel detail aset map — responsive (BottomSheet di mobile, Dialog di desktop).
 *  Generik: aset lain (ODC/OLT/FAT) tinggal pakai shell yang sama tanpa redesign. */
export function MapAssetPanel({ open, onClose, isMobile, title, subtitle, children }: {
  open: boolean; onClose: () => void; isMobile: boolean;
  title: string; subtitle?: string; children: React.ReactNode;
}) {
  if (isMobile) {
    return (
      <BottomSheet open={open} onClose={onClose} title={title} height="lg">
        {subtitle && <p className="text-[11px] text-muted-foreground -mt-1 mb-2">{subtitle}</p>}
        {children}
      </BottomSheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CircleDot className="size-4 text-asset-odp" aria-hidden="true" />{title}
          </DialogTitle>
          {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Mini-dashboard ODP: utilisasi, metrics pelanggan, daftar pelanggan + ACS optical power. */
export function OdpDetailPanel({ odpId, isMobile, onClose, onOpenCustomer, onEdit, onAddCustomerDrop, defaultFullDetail = true }: {
  odpId: number;
  isMobile: boolean;
  onClose: () => void;
  onOpenCustomer: (customerId: string) => void;
  onEdit?: () => void;
  onAddCustomerDrop?: () => void;
  /** Dari toggle "Detail ODP lengkap" di Layer Aset. false = info ringkas (skip ACS), bisa di-expand per-panel. */
  defaultFullDetail?: boolean;
}) {
  // Saat layer "info ringkas", customer list + ACS tidak otomatis dimuat; bisa di-expand per-panel.
  const [showFull, setShowFull] = useState(defaultFullDetail);
  const { data, isLoading } = useOdpDetail(odpId);
  // Lazy kedua: ACS hanya di-query saat showFull, setelah detail sukses (dan ada pelanggan)
  const { data: ont, isLoading: ontLoading } = useOdpOntStatus(odpId, showFull && !!data && data.customers.length > 0);

  const region = data ? [data.odp.village, data.odp.district].filter(Boolean).join(", ") : "";
  return (
    <MapAssetPanel
      open
      onClose={onClose}
      isMobile={isMobile}
      title={data ? data.odp.name : "Memuat ODP…"}
      subtitle={data ? `${data.odp.code}${region ? ` · ${region}` : ""}${data.odp.splitterType ? ` · Splitter ${data.odp.splitterType}` : ""}` : undefined}
    >
      {isLoading || !data ? (
        <SkeletonList count={4} />
      ) : (
        <div className="space-y-4 pb-2">
          {/* Utilisasi */}
          <section aria-label="Utilisasi ODP">
            <CapacityIndicator used={data.utilization.used} total={data.utilization.capacity} pct={data.utilization.pct} />
          </section>

          {/* Customer metrics */}
          <section aria-label="Ringkasan pelanggan" className="grid grid-cols-4 gap-1.5 text-center">
            {([
              ["Total", data.counts.total, "text-foreground"],
              ["Aktif", data.counts.active, "text-success"],
              ["Isolir", data.counts.isolir, "text-destructive"],
              ["Suspend", data.counts.suspend, "text-warning"],
            ] as const).map(([label, n, cls]) => (
              <div key={label} className="rounded-lg bg-muted/40 py-1.5">
                <div className={`text-base font-extrabold tabular-nums ${cls}`}>{n}</div>
                <div className="text-[10px] text-muted-foreground">{label}</div>
              </div>
            ))}
          </section>

          {/* Foto ODP — preview + upload, geser horizontal bila banyak */}
          <section aria-label="Foto ODP">
            <AssetPhotosGallery assetType="odp" assetId={odpId} layout="scroll" />
          </section>

          {/* Pelanggan terhubung + ACS */}
          {showFull ? (
            <section aria-label="Pelanggan terhubung">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Pelanggan Terhubung ({data.counts.total})
                </h3>
                {ontLoading && <span className="text-[10px] text-muted-foreground animate-pulse">Memuat ACS…</span>}
                {ont && !ont.configured && <span className="text-[10px] text-muted-foreground/70">ACS tidak dikonfigurasi</span>}
              </div>
              <OdpCustomerList customers={data.customers} ont={ont} onOpenCustomer={onOpenCustomer} />
            </section>
          ) : data.counts.total > 0 ? (
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setShowFull(true)}>
              <Users className="size-3.5 mr-1.5" aria-hidden="true" />
              Tampilkan {data.counts.total} pelanggan & ACS
            </Button>
          ) : null}

          {/* Aksi (dipindah dari InfoWindow lama) */}
          {(onEdit || onAddCustomerDrop) && (
            <footer className="flex gap-2 pt-1 border-t border-border/40">
              {onEdit && (
                <Button type="button" variant="outline" size="sm" onClick={onEdit}>
                  <Pencil className="size-3.5 mr-1" aria-hidden="true" /> Edit
                </Button>
              )}
              {onAddCustomerDrop && (
                <Button type="button" size="sm" className="flex-1" onClick={onAddCustomerDrop}>
                  <Link2 className="size-3.5 mr-1" aria-hidden="true" /> Tarik Kabel Pelanggan
                </Button>
              )}
            </footer>
          )}
        </div>
      )}
    </MapAssetPanel>
  );
}
