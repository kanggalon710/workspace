import { cn } from "@/lib/utils";
import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost";
}

interface EmptyStateProps {
  icon?: LucideIcon;
  /**
   * Optional brand SVG illustration (from `@/components/illustrations`). When
   * provided it replaces the icon badge for a richer, more finished empty state.
   * e.g. `illustration={<EmptyUsers className="h-36" />}`
   */
  illustration?: ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Visual variant - neutral (default), info (blue), warning (amber), success (green) */
  variant?: "neutral" | "info" | "warning" | "success";
}

/** Illustration heights per size — keeps the art proportional to the state. */
const illoSizeMap = {
  sm: "h-24",
  md: "h-36",
  lg: "h-44",
};

const sizeMap = {
  sm: {
    wrap: "py-6",
    icon: "h-10 w-10",
    iconBox: "h-14 w-14",
    title: "text-sm",
    desc: "text-xs",
  },
  md: {
    wrap: "py-10",
    icon: "h-12 w-12",
    iconBox: "h-20 w-20",
    title: "text-base",
    desc: "text-sm",
  },
  lg: {
    wrap: "py-16",
    icon: "h-14 w-14",
    iconBox: "h-24 w-24",
    title: "text-lg",
    desc: "text-sm",
  },
};

const variantMap = {
  neutral: {
    bg: "bg-muted",
    icon: "text-muted-foreground",
  },
  info: {
    bg: "bg-info/10",
    icon: "text-info",
  },
  warning: {
    bg: "bg-warning/10",
    icon: "text-warning",
  },
  success: {
    bg: "bg-success/10",
    icon: "text-success",
  },
};

/**
 * EmptyState - consistent visual for empty/no-data states.
 * Shows an icon, title, optional description, and 1-2 CTAs.
 *
 * @example
 * <EmptyState
 *   icon={Users}
 *   title="Belum ada pelanggan"
 *   description="Mulai tambahkan pelanggan pertama kamu untuk memulai pipeline."
 *   action={{ label: "Tambah Pelanggan", onClick: () => setDialogOpen(true) }}
 * />
 */
export function EmptyState({
  icon: Icon = Inbox,
  illustration,
  title,
  description,
  action,
  secondaryAction,
  size = "md",
  variant = "neutral",
  className,
}: EmptyStateProps) {
  const s = sizeMap[size];
  const v = variantMap[variant];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6",
        s.wrap,
        className
      )}
    >
      {illustration ? (
        <div className={cn("mb-4 flex items-center justify-center text-foreground/70", illoSizeMap[size], "[&>svg]:h-full [&>svg]:w-auto")}>
          {illustration}
        </div>
      ) : (
        <div
          className={cn(
            "inline-flex items-center justify-center rounded-2xl mb-4",
            s.iconBox,
            v.bg
          )}
        >
          <Icon className={cn(s.icon, v.icon)} strokeWidth={1.5} />
        </div>
      )}
      <h3 className={cn("font-semibold text-foreground mb-1.5", s.title)}>
        {title}
      </h3>
      {description && (
        <p className={cn("text-muted-foreground max-w-sm leading-relaxed", s.desc)}>
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
          {action && (
            <Button
              size={size === "sm" ? "sm" : "default"}
              variant={action.variant || "default"}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              size={size === "sm" ? "sm" : "default"}
              variant={secondaryAction.variant || "outline"}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
