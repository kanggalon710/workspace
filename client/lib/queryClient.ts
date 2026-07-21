import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: (failureCount, error: any) => {
        // Don't retry auth errors (401/403)
        if (error?.message?.includes("Sesi berakhir")) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: false,
      // Pause auto-refetch when tab is hidden - saves ~80 polling queries across
      // the app from running while user is in another tab or phone is locked.
      // Pages that need keep-alive polling can override with refetchIntervalInBackground: true.
      refetchIntervalInBackground: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export const queryKeys = {
  pops: ["pops"] as const,
  odcs: ["odcs"] as const,
  odps: ["odps"] as const,
  customers: ["customers"] as const,
  poles: ["poles"] as const,
  cables: ["cables"] as const,
  dashboard: ["dashboard"] as const,
  mapData: ["map-data"] as const,
  mapInfra: ["map", "infra"] as const,
  mapCustomers: ["map", "customers"] as const,
  otbs: ["otbs"] as const,
  bestrays: ["bestrays"] as const,
  splitters: ["splitters"] as const,
  cableCores: ["cable-cores"] as const,
  coreConnections: ["core-connections"] as const,
  auditLogs: ["audit-logs"] as const,
};
