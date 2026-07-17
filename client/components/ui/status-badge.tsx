import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, Info, Clock, type LucideIcon } from "lucide-react";

export type StatusVariant = "success" | "warning" | "danger" | "info" | "neutral" | "pending";

interface StatusBadgeProps {
  variant: StatusVariant;
  label: string;
  /** Show default icon for the variant. Default: true for sm/md, false for lg. */
  showIcon?: boolean;
  /** Override with custom icon. */
  icon?: LucideIcon;
  size?: "sm" | "md" | "lg";
  /** Solid (filled) vs subtle (bg + text) vs outline. Default: subtle. */
  appearance?: "solid" | "subtle" | "outline" | "dot";
  className?: string;
}

const variantStyles: Record<StatusVariant, {
  subtle: string;
  solid: string;
  outline: string;
  dot: string;
  icon: LucideIcon;
  dotColor: string;
}> = {
  success: {
    subtle: "bg-success/10 text-success border border-success/20",
    solid: "bg-success text-success-foreground",
    outline: "bg-transparent text-success border border-success/40",
    dot: "bg-success/10 text-success",
    icon: CheckCircle2,
    dotColor: "bg-success",
  },
  warning: {
    subtle: "bg-warning/10 text-warning border border-warning/20",
    solid: "bg-warning text-warning-foreground",
    outline: "bg-transparent text-warning border border-warning/40",
    dot: "bg-warning/10 text-warning",
    icon: AlertTriangle,
    dotColor: "bg-warning",
  },
  danger: {
    subtle: "bg-destructive/10 text-destructive border border-destructive/20",
    solid: "bg-destructive text-destructive-foreground",
    outline: "bg-transparent text-destructive border border-destructive/40",
    dot: "bg-destructive/10 text-destructive",
    icon: XCircle,
    dotColor: "bg-destructive",
  },
  info: {
    subtle: "bg-info/10 text-info border border-info/20",
    solid: "bg-info text-info-foreground",
    outline: "bg-transparent text-info border border-info/40",
    dot: "bg-info/10 text-info",
    icon: Info,
    dotColor: "bg-info",
  },
  neutral: {
    subtle: "bg-muted text-muted-foreground border border-border",
    solid: "bg-muted-foreground text-background",
    outline: "bg-transparent text-muted-foreground border border-border",
    dot: "bg-muted text-muted-foreground",
    icon: Info,
    dotColor: "bg-muted-foreground",
  },
  pending: {
    subtle: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
    solid: "bg-amber-500 text-white",
    outline: "bg-transparent text-amber-600 dark:text-amber-400 border border-amber-500/40",
    dot: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    icon: Clock,
    dotColor: "bg-amber-500",
  },
};

const sizeMap = {
  sm: "text-[10px] px-1.5 py-0.5 gap-1 rounded",
  md: "text-xs px-2 py-0.5 gap-1 rounded-md",
  lg: "text-sm px-2.5 py-1 gap-1.5 rounded-md",
};

const iconSizeMap = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
};

/**
 * StatusBadge — semantic status indicator with icon + label.
 * Centralizes all "active / inactive / pending / error" visual patterns.
 *
 * @example
 * <StatusBadge variant="success" label="Aktif" />
 * <StatusBadge variant="danger" label="Isolir" size="sm" />
 * <StatusBadge variant="warning" label="Overdue" appearance="solid" />
 * <StatusBadge variant="pending" label="Menunggu" appearance="dot" />
 */
export function StatusBadge({
  variant,
  label,
  showIcon,
  icon: CustomIcon,
  size = "md",
  appearance = "subtle",
  className,
}: StatusBadgeProps) {
  const style = variantStyles[variant];
  const Icon = CustomIcon || style.icon;
  const shouldShowIcon = showIcon !== undefined ? showIcon : appearance !== "dot" && size !== "lg";

  const appearanceClass =
    appearance === "solid" ? style.solid :
    appearance === "outline" ? style.outline :
    appearance === "dot" ? style.dot :
    style.subtle;

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium whitespace-nowrap",
        sizeMap[size],
        appearanceClass,
        className
      )}
    >
      {appearance === "dot" ? (
        <span
          className={cn("rounded-full shrink-0", style.dotColor, {
            "w-1.5 h-1.5": size === "sm",
            "w-2 h-2": size === "md",
            "w-2.5 h-2.5": size === "lg",
          })}
        />
      ) : shouldShowIcon ? (
        <Icon className={cn(iconSizeMap[size], "shrink-0")} strokeWidth={2.25} />
      ) : null}
      <span className="truncate">{label}</span>
    </span>
  );
}
