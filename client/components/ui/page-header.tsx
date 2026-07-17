import { cn } from "@/lib/utils";
import { type LucideIcon, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";

interface Breadcrumb {
  label: string;
  path?: string;
}

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Optional breadcrumbs. If provided, render above title. */
  breadcrumbs?: Breadcrumb[];
  /** Actions (buttons) rendered on the right side. */
  actions?: React.ReactNode;
  /** Secondary content below header — filters, tabs, etc. */
  children?: React.ReactNode;
  /** Gradient accent color for icon background. Default: sky blue (primary). */
  accent?: "primary" | "success" | "warning" | "info" | "violet" | "rose";
  className?: string;
  /** Sticky header (stays at top on scroll). Default: true. */
  sticky?: boolean;
  /** Last updated timestamp display (optional). */
  lastUpdated?: Date | string | null;
  /** Show refresh button (click handler). */
  onRefresh?: () => void;
  /** Refresh in progress. */
  refreshing?: boolean;
}

const accentMap = {
  primary: "from-sky-500 to-blue-700",
  success: "from-emerald-500 to-green-700",
  warning: "from-amber-500 to-orange-600",
  info: "from-cyan-500 to-sky-600",
  violet: "from-violet-500 to-purple-700",
  rose: "from-rose-500 to-pink-600",
};

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 5) return "baru saja";
  if (seconds < 60) return `${seconds}d lalu`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}j lalu`;
  const days = Math.floor(hours / 24);
  return `${days}h lalu`;
}

/**
 * PageHeader — consistent page header with icon, title, description, and actions.
 * Handles breadcrumbs, last-updated timestamp, and refresh button.
 *
 * @example
 * <PageHeader
 *   icon={Users}
 *   title="Manajemen User"
 *   description="Kelola staff, role, dan permission"
 *   accent="primary"
 *   actions={<Button onClick={...}>Tambah User</Button>}
 * />
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  breadcrumbs,
  actions,
  children,
  accent = "primary",
  className,
  sticky = false,
  lastUpdated,
  onRefresh,
  refreshing = false,
}: PageHeaderProps) {
  const [, setLocation] = useLocation();
  const gradient = accentMap[accent];

  return (
    <div
      className={cn(
        sticky && "sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 bg-background/95 backdrop-blur-sm",
        className
      )}
    >
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-2" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <div key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
                {crumb.path && !isLast ? (
                  <button
                    type="button"
                    onClick={() => setLocation(crumb.path!)}
                    className="hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className={cn(isLast && "text-foreground font-medium")}>
                    {crumb.label}
                  </span>
                )}
              </div>
            );
          })}
        </nav>
      )}

      {/* Header row */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <div
              className={cn(
                "shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-elev-md",
                gradient
              )}
            >
              <Icon className="h-5 w-5 md:h-6 md:w-6 text-white" strokeWidth={2} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg md:text-xl font-bold text-foreground truncate">
                {title}
              </h1>
              {lastUpdated && (
                <span
                  className="text-[10px] md:text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full"
                  title={typeof lastUpdated === "string" ? lastUpdated : lastUpdated.toISOString()}
                >
                  Diperbarui {formatRelativeTime(lastUpdated)}
                </span>
              )}
            </div>
            {description && (
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5 line-clamp-2">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className={cn(
                "h-9 px-3 rounded-md border border-input bg-background text-sm font-medium",
                "hover:bg-accent hover:text-accent-foreground transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              )}
              aria-label="Refresh data"
              title="Refresh data"
            >
              <svg
                className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
          {actions}
        </div>
      </div>

      {/* Secondary content (filters, tabs) */}
      {children && <div className="pb-3">{children}</div>}
    </div>
  );
}
