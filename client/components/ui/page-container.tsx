import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  /** Max width constraint. Default: "7xl" (1280px). */
  maxWidth?: "none" | "4xl" | "5xl" | "6xl" | "7xl" | "full";
  /** Vertical spacing between direct children. Default: "md". */
  spacing?: "none" | "sm" | "md" | "lg";
  /** Center content horizontally. Default: true. */
  centered?: boolean;
}

const maxWidthMap = {
  none: "",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
  full: "max-w-full",
};

const spacingMap = {
  none: "",
  sm: "space-y-3",
  md: "space-y-4 md:space-y-6",
  lg: "space-y-6 md:space-y-8",
};

/**
 * PageContainer — standard wrapper for page content.
 * Enforces consistent max-width, spacing, and centering across all pages.
 *
 * @example
 * <PageContainer>
 *   <PageHeader title="Pelanggan" />
 *   <Card>...</Card>
 *   <Card>...</Card>
 * </PageContainer>
 */
export function PageContainer({
  children,
  className,
  maxWidth = "7xl",
  spacing = "md",
  centered = true,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "w-full",
        centered && "mx-auto",
        maxWidthMap[maxWidth],
        spacingMap[spacing],
        className
      )}
    >
      {children}
    </div>
  );
}

interface PageSectionProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

/**
 * PageSection — logical section within a page with optional heading.
 * Use for grouping related cards/content.
 */
export function PageSection({
  children,
  title,
  description,
  actions,
  className,
}: PageSectionProps) {
  return (
    <section className={cn("space-y-3 md:space-y-4", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <h2 className="text-sm md:text-base font-semibold text-foreground tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-xs md:text-sm text-muted-foreground mt-0.5">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
