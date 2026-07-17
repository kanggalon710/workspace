import { cn } from "@/lib/utils";
import { type LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TrendIndicator {
  value: number;
  label?: string;
  /** Direction override. Auto-detected from value sign if omitted. */
  direction?: "up" | "down" | "flat";
  /** Invert colors — up = bad (e.g., error count goes up = red). Default: false. */
  invertColor?: boolean;
}

interface StatTileProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  /** Small description text below the value. */
  description?: string;
  /** Trend indicator (vs previous period). */
  trend?: TrendIndicator;
  /** Visual accent. Default: primary. */
  accent?: "primary" | "success" | "warning" | "danger" | "info" | "violet" | "neutral";
  /** Clickable — calls onClick when the tile is clicked. */
  onClick?: () => void;
  /** Loading state — show skeleton instead of values. */
  loading?: boolean;
  className?: string;
  /** Compact variant with smaller paddings & text. */
  compact?: boolean;
}

const accentMap = {
  primary: {
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
    accent: "group-hover:border-primary/30",
  },
  success: {
    iconBg: "bg-success/10",
    iconColor: "text-success",
    accent: "group-hover:border-success/30",
  },
  warning: {
    iconBg: "bg-warning/10",
    iconColor: "text-warning",
    accent: "group-hover:border-warning/30",
  },
  danger: {
    iconBg: "bg-destructive/10",
    iconColor: "text-destructive",
    accent: "group-hover:border-destructive/30",
  },
  info: {
    iconBg: "bg-info/10",
    iconColor: "text-info",
    accent: "group-hover:border-info/30",
  },
  violet: {
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-500",
    accent: "group-hover:border-violet-500/30",
  },
  neutral: {
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
    accent: "group-hover:border-border",
  },
};

/**
 * StatTile — KPI card with icon, label, value, optional description + trend.
 * Replaces the manual KPI tile construction in Dashboard and other pages.
 *
 * @example
 * <StatTile
 *   icon={Users}
 *   label="Total Pelanggan"
 *   value="1,284"
 *   description="423 aktif · 61 isolir"
 *   trend={{ value: 12, label: "vs bln lalu" }}
 *   accent="primary"
 *   onClick={() => setLocation("/customers")}
 * />
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  description,
  trend,
  accent = "primary",
  onClick,
  loading = false,
  className,
  compact = false,
}: StatTileProps) {
  const a = accentMap[accent];
  const isClickable = !!onClick;

  const Tag = isClickable ? "button" : "div";

  if (loading) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-card flex flex-col gap-2",
          compact ? "p-3" : "p-4",
          className
        )}
      >
        <div className="flex items-center gap-2">
          <div className="skeleton w-8 h-8 rounded-md" />
          <div className="skeleton h-3 w-24 rounded" />
        </div>
        <div className="skeleton h-8 w-20 rounded" />
        {description && <div className="skeleton h-3 w-32 rounded" />}
      </div>
    );
  }

  return (
    <Tag
      type={isClickable ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group rounded-lg border bg-card transition-all text-left",
        compact ? "p-3" : "p-4",
        isClickable && "hover:shadow-elev-md cursor-pointer active:scale-[0.98]",
        a.accent,
        className
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <div
              className={cn(
                "shrink-0 rounded-md flex items-center justify-center",
                compact ? "w-7 h-7" : "w-9 h-9",
                a.iconBg
              )}
            >
              <Icon
                className={cn(compact ? "h-3.5 w-3.5" : "h-4 w-4", a.iconColor)}
                strokeWidth={2.25}
              />
            </div>
          )}
          <p
            className={cn(
              "uppercase tracking-wider font-semibold text-muted-foreground truncate",
              compact ? "text-[10px]" : "text-[11px]"
            )}
          >
            {label}
          </p>
        </div>
        {trend && <TrendBadge trend={trend} compact={compact} />}
      </div>

      <div
        className={cn(
          "font-bold text-foreground tabular-nums leading-tight",
          compact ? "text-xl" : "text-2xl md:text-3xl"
        )}
      >
        {value}
      </div>

      {description && (
        <p
          className={cn(
            "text-muted-foreground mt-1 truncate",
            compact ? "text-[10px]" : "text-xs"
          )}
        >
          {description}
        </p>
      )}
    </Tag>
  );
}

function TrendBadge({ trend, compact }: { trend: TrendIndicator; compact: boolean }) {
  const direction = trend.direction || (trend.value > 0 ? "up" : trend.value < 0 ? "down" : "flat");
  const isPositive = trend.invertColor ? direction === "down" : direction === "up";
  const isNegative = trend.invertColor ? direction === "up" : direction === "down";

  const color = isPositive
    ? "text-success bg-success/10"
    : isNegative
    ? "text-destructive bg-destructive/10"
    : "text-muted-foreground bg-muted";

  const Icon = direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  const val = Math.abs(trend.value);
  const sign = direction === "up" ? "+" : direction === "down" ? "-" : "";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold rounded shrink-0",
        compact ? "text-[10px] px-1 py-0.5" : "text-[11px] px-1.5 py-0.5",
        color
      )}
      title={trend.label}
    >
      <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={2.5} />
      {sign}{val}%
    </span>
  );
}
