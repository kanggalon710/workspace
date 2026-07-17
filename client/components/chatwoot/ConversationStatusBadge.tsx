import { StatusBadge } from "@/components/ui/status-badge";

const MAP: Record<string, { variant: "success" | "warning" | "danger" | "info" | "neutral" | "pending"; label: string }> = {
  open: { variant: "success", label: "Terbuka" },
  resolved: { variant: "neutral", label: "Selesai" },
  pending: { variant: "warning", label: "Pending" },
  snoozed: { variant: "info", label: "Snooze" },
};

export function ConversationStatusBadge({ status }: { status: string }) {
  const m = MAP[status] ?? { variant: "neutral" as const, label: status };
  return <StatusBadge variant={m.variant} label={m.label} size="sm" appearance="subtle" />;
}
