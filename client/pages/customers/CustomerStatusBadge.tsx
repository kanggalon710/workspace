import { StatusBadge } from "@/components/ui/status-badge";

// ==================== STATUS BADGE ====================

// Adapter domain: status pelanggan -> design-system StatusBadge (satu sumber warna).
export function CustomerStatusBadge({ status }: { status: string | null }) {
  if (status === "active") return <StatusBadge variant="success" label="Aktif" appearance="solid" showIcon={false} />;
  if (status === "suspended") return <StatusBadge variant="warning" label="Isolir" appearance="solid" showIcon={false} />;
  return <StatusBadge variant="neutral" label="Non-Aktif" showIcon={false} />;
}
