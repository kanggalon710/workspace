import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CustomerConnStatus } from "@shared/customerStatus";
import type { OpticalThresholds } from "@shared/opticalPower";

export type OdpDetail = {
  odp: { id: number; name: string; code: string; splitterType: string | null; status: string | null; address: string | null; district: string | null; village: string | null; lat: number | null; lng: number | null };
  utilization: { capacity: number; used: number; available: number; pct: number };
  counts: { total: number; active: number; isolir: number; suspend: number; terminated: number; unknown: number };
  customers: Array<{ id: number; customerId: string; name: string; connStatus: CustomerConnStatus; package: string | null; portNumber: number | null; ontSerialNumber: string | null; phone: string | null }>;
};

export type OdpOntStatus = {
  configured: boolean;
  thresholds: OpticalThresholds;
  byCustomer: Record<number, { matched: boolean; status: "online" | "offline" | null; rxPower: string | null; txPower: string | null; lastInform: string | null; uptime: number | null; deviceId: string | null; model: string | null }>;
};

/** Lazy: hanya fetch saat panel ODP terbuka (odpId != null). */
export function useOdpDetail(odpId: number | null) {
  return useQuery<OdpDetail>({
    queryKey: ["odp-detail", odpId],
    queryFn: () => api.get<OdpDetail>(`/odps/${odpId}/detail`),
    enabled: odpId != null,
    staleTime: 30_000,
  });
}

/** Lazy kedua: query ACS baru jalan SETELAH detail sukses (spec: jangan query ACS saat map load). */
export function useOdpOntStatus(odpId: number | null, enabled: boolean) {
  return useQuery<OdpOntStatus>({
    queryKey: ["odp-ont-status", odpId],
    queryFn: () => api.get<OdpOntStatus>(`/odps/${odpId}/ont-status`),
    enabled: odpId != null && enabled,
    staleTime: 60_000,
    retry: 0, // ACS lambat/timeout → jangan retry-badai
  });
}

export type MapCustomerSearchHit = { id: number; name: string; customerId: string; lat: number | null; lng: number | null; odpId: number | null; status: string | null; isIsolir: number | null };

/** Server-backed customer search untuk map (pelanggan di luar viewport tetap ketemu). */
export function useMapCustomerSearch(q: string) {
  const trimmed = q.trim();
  return useQuery<{ customers: MapCustomerSearchHit[] }>({
    queryKey: ["map-customer-search", trimmed],
    queryFn: () => api.get(`/map-data/customer-search?q=${encodeURIComponent(trimmed)}`),
    enabled: trimmed.length >= 3,
    staleTime: 30_000,
  });
}
