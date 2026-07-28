import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface DevDbSyncTable { table: string; rows: number; ok: boolean; error?: string }
export interface DevDbSyncResult {
  tablesCopied: number;
  totalRows: number;
  durationMs: number;
  perTable: DevDbSyncTable[];
  failed: DevDbSyncTable[];
  /** Tabel yang ada di dev tapi TIDAK di prod → tak bisa disalin (sumber tak ada). */
  skippedMissingInProd: string[];
}

/** DEV-ONLY: trigger prod → dev DB copy. On success, refetch everything (UI now shows prod data). */
export function useDevDbSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<DevDbSyncResult>("/dev/db-sync", {}),
    onSuccess: () => { qc.invalidateQueries(); },
  });
}
