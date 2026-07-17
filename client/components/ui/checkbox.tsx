import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Visually indeterminate state (dash) — does not affect the underlying input value. */
  indeterminate?: boolean;
  /** Label text rendered next to the checkbox. */
  label?: string;
}

/**
 * Checkbox — accessible native-input wrapper styled with Tailwind.
 * Tap-target ≥ 24 × 24 px for mobile.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate, label, id, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);

    // Forward both ref and innerRef
    React.useImperativeHandle(ref, () => innerRef.current!);

    React.useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = indeterminate ?? false;
      }
    }, [indeterminate]);

    const inputId = id ?? React.useId();

    const inputEl = (
      <input
        id={inputId}
        type="checkbox"
        ref={innerRef}
        className={cn(
          // sizing — at least 16×16 visual, but we wrap in a 24×24 touch target
          "h-4 w-4 rounded border border-input bg-background",
          "accent-primary cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );

    if (!label) {
      return (
        // 24×24 touch target for mobile
        <span className="inline-flex items-center justify-center min-w-[24px] min-h-[24px]">
          {inputEl}
        </span>
      );
    }

    return (
      <label htmlFor={inputId} className="inline-flex items-center gap-2 cursor-pointer select-none">
        <span className="inline-flex items-center justify-center min-w-[24px] min-h-[24px]">
          {inputEl}
        </span>
        <span className="text-sm">{label}</span>
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
