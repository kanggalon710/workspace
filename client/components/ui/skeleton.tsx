import { cn } from "@/lib/utils";

/**
 * Base Skeleton - shimmer effect via CSS class `.skeleton` (defined in index.css).
 * Use className to set dimensions (h-4, w-24, rounded-md, etc.).
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} {...props} />;
}

/**
 * SkeletonText - single line of text placeholder.
 * Default width 100%, height matches body text (h-4).
 */
export function SkeletonText({ className, lines = 1 }: { className?: string; lines?: number }) {
  if (lines === 1) {
    return <Skeleton className={cn("h-4 w-full rounded", className)} />;
  }
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4 rounded", i === lines - 1 ? "w-4/5" : "w-full")}
        />
      ))}
    </div>
  );
}

/**
 * SkeletonCard - card placeholder with title + 2 lines + optional footer.
 * Matches typical KPI tile and content card layout.
 */
export function SkeletonCard({
  className,
  showFooter = false,
  rows = 2,
}: {
  className?: string;
  showFooter?: boolean;
  rows?: number;
}) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 space-y-3", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/3 rounded" />
          <Skeleton className="h-6 w-1/2 rounded" />
        </div>
      </div>
      {rows > 0 && (
        <div className="space-y-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-full rounded" />
          ))}
        </div>
      )}
      {showFooter && <Skeleton className="h-8 w-24 rounded-md" />}
    </div>
  );
}

/**
 * SkeletonTable - table placeholder with N rows × M columns.
 * Includes header row + data rows.
 */
export function SkeletonTable({
  rows = 8,
  cols = 5,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-card overflow-hidden", className)}>
      {/* Header */}
      <div
        className="grid gap-4 px-4 py-3 border-b bg-muted/40"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-20 rounded" />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div
            key={rowIdx}
            className="grid gap-4 px-4 py-3.5"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, colIdx) => (
              <Skeleton
                key={colIdx}
                className={cn(
                  "h-4 rounded",
                  colIdx === 0 ? "w-3/4" : colIdx === cols - 1 ? "w-1/2" : "w-full"
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * SkeletonKPIGrid - grid of N KPI tile placeholders.
 * Default 4 tiles responsive (2 cols mobile, 4 cols desktop).
 */
export function SkeletonKPIGrid({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
          <Skeleton className="h-3 w-2/3 rounded" />
          <Skeleton className="h-8 w-1/2 rounded" />
          <Skeleton className="h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  );
}

/**
 * SkeletonChart - chart area placeholder with optional title.
 */
export function SkeletonChart({
  className,
  height = "h-64",
  showHeader = true,
}: {
  className?: string;
  height?: string;
  showHeader?: boolean;
}) {
  return (
    <div className={cn("rounded-lg border bg-card p-4 space-y-4", className)}>
      {showHeader && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/3 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
      )}
      <Skeleton className={cn("w-full rounded", height)} />
    </div>
  );
}

/**
 * SkeletonList - list of items (avatar + 2 lines).
 * Good for notification lists, activity feeds, user lists.
 */
export function SkeletonList({
  count = 5,
  showAvatar = true,
  className,
}: {
  count?: number;
  showAvatar?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
          {showAvatar && <Skeleton className="h-10 w-10 rounded-full shrink-0" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3 rounded" />
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
          <Skeleton className="h-8 w-16 rounded-md shrink-0" />
        </div>
      ))}
    </div>
  );
}
