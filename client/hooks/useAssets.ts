import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queryClient";
import type {
  Pop, InsertPop, Odc, InsertOdc, Odp, InsertOdp,
  Customer, InsertCustomer, Pole, InsertPole,
  Cable, InsertCable, DashboardStats, MapData,
  Otb, InsertOtb, Bestray, InsertBestray,
  Splitter, InsertSplitter, CableCore, InsertCableCore,
  CoreConnection, InsertCoreConnection,
} from "@shared/schema";

// ==================== DASHBOARD ====================

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.get<DashboardStats>("/dashboard"),
  });
}

// ==================== MAP DATA ====================

export function useMapData() {
  return useQuery({
    queryKey: queryKeys.mapData,
    queryFn: () => api.get<MapData>("/map-data"),
  });
}

// ==================== MAP TIER 1 + TIER 2 (viewport) ====================

export type Bbox = {
  swLat: number;
  swLng: number;
  neLat: number;
  neLng: number;
};

export function useMapInfra(mitraId?: number) {
  return useQuery({
    queryKey: [...queryKeys.mapInfra, mitraId ?? "self"] as const,
    queryFn: () => api.get<{
      pops: any[]; odcs: any[]; odps: any[]; poles: any[]; cables: any[];
    }>(mitraId != null ? `/map-data/infra?mitra=${mitraId}` : "/map-data/infra"),
    staleTime: 60_000,
  });
}

export function useMapCustomers(bbox: Bbox | null, enabled = true, mitraId?: number) {
  return useQuery({
    queryKey: [...queryKeys.mapCustomers, mitraId ?? "self", bbox] as const,
    queryFn: () => {
      if (!bbox) throw new Error("bbox required");
      const q = `${bbox.swLat},${bbox.swLng},${bbox.neLat},${bbox.neLng}`;
      const suffix = mitraId != null ? `&mitra=${mitraId}` : "";
      return api.get<{ customers: any[]; count: number; bbox: Bbox }>(
        `/map-data/customers?bbox=${q}${suffix}`
      );
    },
    enabled: !!bbox && enabled,
    staleTime: 30_000,
  });
}

// ==================== GENERIC CRUD HOOK ====================

function useCrud<T, TInsert>(resource: string, queryKey: readonly string[]) {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: queryKey,
    queryFn: () => api.get<T[]>(`/${resource}`),
  });

  const create = useMutation({
    mutationFn: (data: TInsert) => api.post<T>(`/${resource}`, data),
    onMutate: async (newData) => {
      await qc.cancelQueries({ queryKey });
      const previousData = qc.getQueryData<T[]>(queryKey);
      qc.setQueryData<T[]>(queryKey, (old) => old ? [...old, { id: -1, ...newData } as unknown as T] : old);
      return { previousData };
    },
    onError: (_err, _newData, context) => {
      if (context?.previousData) qc.setQueryData(queryKey, context.previousData);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
      qc.invalidateQueries({ queryKey: queryKeys.mapData });
      qc.invalidateQueries({ queryKey: queryKeys.mapInfra });
      qc.invalidateQueries({ queryKey: queryKeys.mapCustomers });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TInsert> }) =>
      api.put<T>(`/${resource}/${id}`, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey });
      const previousData = qc.getQueryData<T[]>(queryKey);
      qc.setQueryData<T[]>(queryKey, (old) => old ? old.map((item: any) => item.id === id ? { ...item, ...data } : item) : old);
      return { previousData };
    },
    onError: (_err, _newData, context) => {
      if (context?.previousData) qc.setQueryData(queryKey, context.previousData);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
      qc.invalidateQueries({ queryKey: queryKeys.mapData });
      qc.invalidateQueries({ queryKey: queryKeys.mapInfra });
      qc.invalidateQueries({ queryKey: queryKeys.mapCustomers });
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/${resource}/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey });
      const previousData = qc.getQueryData<T[]>(queryKey);
      qc.setQueryData<T[]>(queryKey, (old) => old ? old.filter((item: any) => item.id !== id) : old);
      return { previousData };
    },
    onError: (_err, _newData, context) => {
      if (context?.previousData) qc.setQueryData(queryKey, context.previousData);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
      qc.invalidateQueries({ queryKey: queryKeys.mapData });
      qc.invalidateQueries({ queryKey: queryKeys.mapInfra });
      qc.invalidateQueries({ queryKey: queryKeys.mapCustomers });
    },
  });

  return { ...list, create, update, remove };
}

// ==================== ENTITY HOOKS ====================

export function usePops() {
  return useCrud<Pop, InsertPop>("pops", queryKeys.pops);
}

export function useOdcs() {
  return useCrud<Odc, InsertOdc>("odcs", queryKeys.odcs);
}

export function useOdps() {
  return useCrud<Odp, InsertOdp>("odps", queryKeys.odps);
}

export type OdpUtilItem = {
  id: number; name: string; code: string; capacity: number;
  usedPorts: number; availablePorts: number; nextPort: number | null;
  usedPct: number; status: "full" | "nearly_full" | "active" | "empty";
  usedPortList: number[]; lat?: number | null; lng?: number | null;
  odcId?: number | null;
};

export type OdpUtilResponse = {
  summary: {
    totalOdp: number; totalCapacity: number; totalUsed: number;
    totalAvailable: number; fullOdp: number; nearlyFullOdp: number; emptyOdp: number;
  };
  odps: OdpUtilItem[];
};

export function useOdpUtilization() {
  return useQuery<OdpUtilResponse>({
    queryKey: ["odps", "utilization"],
    queryFn: () => api.get<OdpUtilResponse>("/odps/utilization"),
    staleTime: 0,            // selalu anggap stale - paksa fetch jika di-invalidate
    refetchOnMount: true,    // fetch ulang setiap komponen mount
    refetchInterval: 15000,  // auto-refresh tiap 15 detik (real-time feel)
  });
}

export function useCustomers() {
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: queryKeys.customers,
    queryFn: () => api.get<Customer[]>("/customers"),
  });

  // Force-refetch ODP queries when customers change (usage is computed real-time)
  const invalidateOdps = () => {
    // Invalidate + immediate refetch semua query yang prefix "odps"
    qc.invalidateQueries({ queryKey: ["odps"] });
    qc.invalidateQueries({ queryKey: queryKeys.mapData });
    qc.invalidateQueries({ queryKey: queryKeys.mapInfra });
    qc.invalidateQueries({ queryKey: queryKeys.mapCustomers });
    qc.invalidateQueries({ queryKey: queryKeys.dashboard });
  };

  const create = useMutation({
    mutationFn: (data: InsertCustomer) => api.post<Customer>("/customers", data),
    onMutate: async (newData) => {
      await qc.cancelQueries({ queryKey: queryKeys.customers });
      const previousData = qc.getQueryData<Customer[]>(queryKeys.customers);
      qc.setQueryData<Customer[]>(queryKeys.customers, (old) => old ? [...old, { id: -1, code: "CUST-XX", ...newData } as unknown as Customer] : old);
      return { previousData };
    },
    onError: (_err, _newData, context) => {
      if (context?.previousData) qc.setQueryData(queryKeys.customers, context.previousData);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customers });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
      invalidateOdps();
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertCustomer> }) =>
      api.put<Customer>(`/customers/${id}`, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: queryKeys.customers });
      const previousData = qc.getQueryData<Customer[]>(queryKeys.customers);
      qc.setQueryData<Customer[]>(queryKeys.customers, (old) => old ? old.map((item) => item.id === id ? { ...item, ...data } : item) : old);
      return { previousData };
    },
    onError: (_err, _newData, context) => {
      if (context?.previousData) qc.setQueryData(queryKeys.customers, context.previousData);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customers });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
      invalidateOdps();
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/customers/${id}`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.customers });
      const previousData = qc.getQueryData<Customer[]>(queryKeys.customers);
      qc.setQueryData<Customer[]>(queryKeys.customers, (old) => old ? old.filter((item) => item.id !== id) : old);
      return { previousData };
    },
    onError: (_err, _newData, context) => {
      if (context?.previousData) qc.setQueryData(queryKeys.customers, context.previousData);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customers });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard });
      invalidateOdps();
    },
  });

  return { ...list, create, update, remove };
}

export function usePoles() {
  return useCrud<Pole, InsertPole>("poles", queryKeys.poles);
}

export function useCables() {
  return useCrud<Cable, InsertCable>("cables", queryKeys.cables);
}

export function useOtbs() {
  return useCrud<Otb, InsertOtb>("otbs", queryKeys.otbs);
}

export function useOtbsByPop(popId: number | null) {
  return useQuery({
    queryKey: [...queryKeys.otbs, "pop", popId],
    queryFn: () => api.get<Otb[]>(`/pops/${popId}/otbs`),
    enabled: !!popId,
  });
}

export function useBestrays() {
  return useCrud<Bestray, InsertBestray>("bestrays", queryKeys.bestrays);
}

export function useBestraysByOdc(odcId: number | null) {
  return useQuery({
    queryKey: [...queryKeys.bestrays, "odc", odcId],
    queryFn: () => api.get<Bestray[]>(`/odcs/${odcId}/bestrays`),
    enabled: !!odcId,
  });
}

export function useSplitters() {
  return useCrud<Splitter, InsertSplitter>("splitters", queryKeys.splitters);
}

export function useCableCores() {
  return useCrud<CableCore, InsertCableCore>("cable-cores", queryKeys.cableCores);
}

export function useCableCoreByCable(cableId: number | null) {
  return useQuery({
    queryKey: [...queryKeys.cableCores, "cable", cableId],
    queryFn: () => api.get<CableCore[]>(`/cables/${cableId}/cores`),
    enabled: !!cableId,
  });
}

export function useGenerateCableCores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cableId, totalCore, totalTube }: { cableId: number; totalCore: number; totalTube: number }) =>
      api.post<CableCore[]>(`/cables/${cableId}/generate-cores`, { totalCore, totalTube }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.cableCores });
      qc.invalidateQueries({ queryKey: queryKeys.cables });
    },
  });
}

export function useCoreConnectionsByEntity(entityType: string | null, entityId: number | null) {
  return useQuery({
    queryKey: [...queryKeys.coreConnections, "entity", entityType, entityId],
    queryFn: () => api.get<CoreConnection[]>(`/core-connections/by-entity?type=${entityType}&id=${entityId}`),
    enabled: !!entityType && !!entityId,
  });
}

export function useCoreConnections() {
  return useCrud<CoreConnection, InsertCoreConnection>("core-connections", queryKeys.coreConnections);
}

export function usePowerBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (segments: { fiberKm: number; splices: number; connectors: number; splitters: string[] }) =>
      api.post<{ totalLoss: number; rxPower: number; status: string }>("/power-budget", segments),
  });
}

// ==================== BILLING SYNC ====================

export function useBillingSync() {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<{ total: number; created: number; updated: number; errors: number; syncedAt: string } | null>(null);

  const sync = async () => {
    setIsSyncing(true);
    try {
      const headers: any = { "Content-Type": "application/json" };
      const stored = localStorage.getItem("ftth_user");
      if (stored) {
        try { headers["Authorization"] = `Bearer ${JSON.parse(stored).token}`; } catch {}
      }
      const res = await fetch("/api/billing/sync", { method: "POST", headers });
      const json = await res.json();
      if (json.success) {
        setLastResult(json.data);
        queryClient.invalidateQueries({ queryKey: queryKeys.customers });
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
        return json.data;
      } else {
        throw new Error(json.error);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  return { sync, isSyncing, lastResult };
}
