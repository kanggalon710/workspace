import { cn } from "@/lib/utils";

export type SystemStatus = "operational" | "degraded" | "outage" | "unknown";

interface SystemStatusDotProps {
  status: SystemStatus;
  label?: string;
  size?: "sm" | "md" | "lg";
  /** Show pulsing ring animation. Default: true for operational state. */
  pulse?: boolean;
  className?: string;
}

const statusMap: Record<SystemStatus, {
  color: string;
  ring: string;
  label: string;
}> = {
  operational: {
    color: "bg-success",
    ring: "pulse-ring-success",
    label: "Operasional",
  },
  degraded: {
    color: "bg-warning",
    ring: "pulse-ring-warning",
    label: "Degraded",
  },
  outage: {
    color: "bg-destructive",
    ring: "pulse-ring-danger",
    label: "Outage",
  },
  unknown: {
    color: "bg-muted-foreground",
    ring: "",
    label: "Unknown",
  },
};

const sizeMap = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
};

/**
 * SystemStatusDot — pulsing indicator for backend/service health.
 * Use in headers, sidebars, dashboards to show system status at-a-glance.
 *
 * @example
 * <SystemStatusDot status="operational" label="Billing Sync" />
 */
export function SystemStatusDot({
  status,
  label,
  size = "md",
  pulse,
  className,
}: SystemStatusDotProps) {
  const s = statusMap[status];
  const showPulse = pulse !== undefined ? pulse : status === "operational" || status === "degraded" || status === "outage";

  if (!label) {
    return (
      <span
        className={cn(
          "inline-flex rounded-full shrink-0",
          sizeMap[size],
          s.color,
          showPulse && s.ring,
          className
        )}
        aria-label={s.label}
        title={s.label}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground font-medium",
        className
      )}
    >
      <span
        className={cn(
          "rounded-full shrink-0",
          sizeMap[size],
          s.color,
          showPulse && s.ring,
        )}
      />
      <span>{label}</span>
    </span>
  );
}
