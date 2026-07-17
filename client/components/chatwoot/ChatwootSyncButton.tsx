import { RefreshCw, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { useChatwootStatus, useSyncCustomerContact } from "@/hooks/useChatwoot";

/** Per-customer "Sync ke Chatwoot". Self-hides when Chatwoot disabled/unconfigured atau tanpa izin write. */
export function ChatwootSyncButton({ customerId, alreadySynced, size = "sm" }: {
  customerId: number; alreadySynced?: boolean; size?: "xs" | "sm" | "default";
}) {
  const { canWrite } = useAuth();
  const { data: status } = useChatwootStatus();
  const sync = useSyncCustomerContact();
  if (!status?.enabled || !status.configured || !canWrite("chatwoot")) return null;
  return (
    <Button type="button" variant="outline" size={size as "xs" | "sm" | "default"} loading={sync.isPending}
      onClick={() => sync.mutate(customerId, {
        onSuccess: (r) => toast.success(r.action === "created" ? "Kontak Chatwoot dibuat" : "Kontak Chatwoot diperbarui"),
        onError: (e: any) => toast.error(e.message || "Gagal sync"),
      })}>
      {alreadySynced ? <Check className="size-3.5 mr-1" aria-hidden="true" /> : <RefreshCw className="size-3.5 mr-1" aria-hidden="true" />}
      {alreadySynced ? "Sync ulang" : "Sync ke Chatwoot"}
    </Button>
  );
}
