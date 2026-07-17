import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icon rendered on the left inside the input. */
  leftIcon?: React.ReactNode;
  /** Icon or button rendered on the right inside the input. */
  rightIcon?: React.ReactNode;
  /** Error state — red border + destructive focus ring. */
  error?: boolean;
  /** Size variant. */
  inputSize?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "h-8 text-xs",
  md: "h-10 text-sm",
  lg: "h-11 text-sm",
};

const padMap = {
  sm: { base: "px-3", withLeft: "pl-8", withRight: "pr-8" },
  md: { base: "px-3.5", withLeft: "pl-9", withRight: "pr-9" },
  lg: { base: "px-4", withLeft: "pl-10", withRight: "pr-10" },
};

const iconPosMap = {
  sm: "left-2.5 right-2.5 [&_svg]:size-3.5",
  md: "left-3 right-3 [&_svg]:size-4",
  lg: "left-3.5 right-3.5 [&_svg]:size-4",
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, type, leftIcon, rightIcon, error, inputSize = "md", ...props },
    ref
  ) => {
    const hasLeft = !!leftIcon;
    const hasRight = !!rightIcon;
    const padding = padMap[inputSize];

    const input = (
      <input
        type={type}
        className={cn(
          "flex w-full rounded-md border bg-background shadow-elev-sm transition-all",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-muted-foreground/60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-0",
          "disabled:cursor-not-allowed disabled:opacity-50",
          sizeMap[inputSize],
          padding.base,
          hasLeft && padding.withLeft,
          hasRight && padding.withRight,
          error
            ? "border-destructive/60 focus-visible:ring-destructive/30 focus-visible:border-destructive"
            : "border-input focus-visible:ring-primary/20 focus-visible:border-primary",
          className
        )}
        ref={ref}
        {...props}
      />
    );

    if (!hasLeft && !hasRight) return input;

    return (
      <div className="relative">
        {hasLeft && (
          <span
            className={cn(
              "absolute top-1/2 -translate-y-1/2 flex items-center justify-center text-muted-foreground pointer-events-none",
              iconPosMap[inputSize].split(" ").filter(c => c.includes("left") || c.includes("size")).join(" ")
            )}
          >
            {leftIcon}
          </span>
        )}
        {input}
        {hasRight && (
          <span
            className={cn(
              "absolute top-1/2 -translate-y-1/2 flex items-center justify-center text-muted-foreground",
              iconPosMap[inputSize].split(" ").filter(c => c.includes("right") || c.includes("size")).join(" ")
            )}
          >
            {rightIcon}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
