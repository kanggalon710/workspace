import { cn } from "@/lib/utils";
import { AlertCircle, Info } from "lucide-react";

interface FormFieldProps {
  /** Label text (auto-associated with htmlFor). */
  label?: string;
  /** Unique ID to link label + input. */
  htmlFor?: string;
  /** Required field indicator. */
  required?: boolean;
  /** Error message (shows red border on child input via aria-invalid). */
  error?: string;
  /** Helper text below input. */
  hint?: string;
  /** Optional right-side label slot (e.g., character count, link). */
  labelRight?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * FormField — wraps an input with label, required indicator, error, and hint.
 * Designed to work with react-hook-form + zod schemas.
 *
 * @example
 * <FormField label="Email" htmlFor="email" required error={errors.email?.message} hint="Gunakan email aktif">
 *   <Input id="email" type="email" {...register("email")} />
 * </FormField>
 */
export function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  labelRight,
  className,
  children,
}: FormFieldProps) {
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      {(label || labelRight) && (
        <div className="flex items-end justify-between gap-3 min-h-[20px]">
          {label && (
            <label
              htmlFor={htmlFor}
              className="text-xs font-semibold text-foreground uppercase tracking-wider"
            >
              {label}
              {required && <span className="text-destructive ml-1" aria-label="wajib">*</span>}
            </label>
          )}
          {labelRight && <div className="text-2xs text-muted-foreground">{labelRight}</div>}
        </div>
      )}

      <div
        aria-invalid={!!error}
        aria-describedby={cn(error ? errorId : undefined, hint ? hintId : undefined) || undefined}
      >
        {children}
      </div>

      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-xs text-destructive leading-relaxed">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="flex items-start gap-1.5 text-xs text-muted-foreground leading-relaxed">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-60" />
          <span>{hint}</span>
        </p>
      ) : null}
    </div>
  );
}

interface FormRowProps {
  children: React.ReactNode;
  /** Columns at md breakpoint. Default: 2. */
  cols?: 1 | 2 | 3 | 4;
  className?: string;
}

/**
 * FormRow — horizontal layout for 2-4 fields side-by-side on desktop, stacked on mobile.
 */
export function FormRow({ children, cols = 2, className }: FormRowProps) {
  const gridCols = {
    1: "md:grid-cols-1",
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-4",
  }[cols];
  return (
    <div className={cn("grid grid-cols-1 gap-3 md:gap-4", gridCols, className)}>{children}</div>
  );
}

interface FormSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * FormSection — groups related fields under a heading. Good for multi-section forms.
 */
export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <section className={cn("space-y-3 md:space-y-4", className)}>
      {(title || description) && (
        <div className="pb-2 border-b border-border/50">
          {title && (
            <h3 className="text-sm font-bold text-foreground tracking-tight">{title}</h3>
          )}
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      )}
      <div className="space-y-3 md:space-y-4">{children}</div>
    </section>
  );
}
