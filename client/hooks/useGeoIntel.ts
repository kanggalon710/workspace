import { useQuery } from "@tanstack/react-query";
import { reverseGeocode } from "@/lib/geocode";
import { api } from "@/lib/api";

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function useReverseGeocode(lat: number, lng: number) {
  return useQuery({
    queryKey: ["geo", "rev", round5(lat), round5(lng)],
    queryFn: () => reverseGeocode(lat, lng),
    enabled: Number.isFinite(lat) && Number.isFinite(lng),
    staleTime: Infinity,
  });
}

export type NearestOdp = {
  id: number; name: string; code: string;
  distanceMeters: number; status: string | null;
  availablePorts: number; inCoverage: boolean;
};

export function useNearestOdp(lat: number, lng: number) {
  return useQuery({
    queryKey: ["geo", "odp", round5(lat), round5(lng)],
    queryFn: async (): Promise<NearestOdp | null> => {
      const res = await api.post<{ nearestOdps: NearestOdp[]; recommended: NearestOdp | null }>(
        "/coverage-check",
        { lat, lng },
      );
      return res.recommended ?? res.nearestOdps?.[0] ?? null;
    },
    enabled: Number.isFinite(lat) && Number.isFinite(lng),
    staleTime: Infinity,
  });
}
