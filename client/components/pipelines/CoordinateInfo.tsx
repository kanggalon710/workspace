import { MapPin, Navigation } from "lucide-react";
import { useReverseGeocode, useNearestOdp } from "@/hooks/useGeoIntel";

function distanceLabel(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`;
}

export function CoordinateInfo({ lat, lng }: { lat: number; lng: number }) {
  const geoQ = useReverseGeocode(lat, lng);
  const odpQ = useNearestOdp(lat, lng);
  const geo = geoQ.data;
  const odp = odpQ.data;

  return (
    <div className="mt-2 space-y-2 rounded-md border border-border/50 bg-muted/20 p-2.5 text-xs">
      <div>
        <div className="mb-1 flex items-center gap-1 font-semibold text-muted-foreground">
          <MapPin className="size-3.5" /> Wilayah
        </div>
        {geoQ.isLoading ? (
          <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        ) : geo ? (
          <ul className="space-y-0.5">
            {geo.district && <li>Kecamatan: {geo.district}</li>}
            {geo.village && <li>Desa/Kelurahan: {geo.village}</li>}
            {geo.city && <li>Kabupaten/Kota: {geo.city}</li>}
            {geo.province && <li>Provinsi: {geo.province}</li>}
            {geo.formatted && <li className="text-muted-foreground">{geo.formatted}</li>}
          </ul>
        ) : (
          <div className="text-muted-foreground">Info wilayah tak tersedia</div>
        )}
      </div>
      <div>
        <div className="mb-1 flex items-center gap-1 font-semibold text-muted-foreground">
          <Navigation className="size-3.5" /> ODP terdekat
        </div>
        {odpQ.isLoading ? (
          <div className="h-3 w-40 animate-pulse rounded bg-muted" />
        ) : odp ? (
          <div className="space-y-0.5">
            <div className="font-medium">
              {odp.name} <span className="text-muted-foreground">({odp.code})</span>
            </div>
            <div>Jarak: {distanceLabel(odp.distanceMeters)}</div>
            <div>Status: {odp.status ?? "-"} · Port tersedia: {odp.availablePorts}</div>
            <div className={odp.inCoverage ? "text-success" : "text-warning"}>
              {odp.inCoverage ? "Dalam coverage" : "Di luar radius coverage"}
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground">Tidak ada data ODP</div>
        )}
      </div>
    </div>
  );
}
