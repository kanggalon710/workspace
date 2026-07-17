import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "font-medium transition-all select-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-elev-sm hover:bg-primary/90 active:scale-[0.98]",
        gradient:
          "bg-gradient-to-r from-sky-500 via-primary to-blue-600 text-white shadow-elev-md hover:shadow-elev-lg hover:from-sky-600 hover:to-blue-700 active:scale-[0.98]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-elev-sm hover:bg-destructive/90 active:scale-[0.98]",
        success:
          "bg-success text-success-foreground shadow-elev-sm hover:bg-success/90 active:scale-[0.98]",
        warning:
          "bg-warning text-warning-foreground shadow-elev-sm hover:bg-warning/90 active:scale-[0.98]",
        outline:
          "border border-input bg-background shadow-elev-sm hover:bg-accent hover:text-accent-foreground hover:border-primary/30",
        "outline-primary":
          "border border-primary/30 bg-primary/5 text-primary shadow-elev-sm hover:bg-primary/10 hover:border-primary/50",
        secondary:
          "bg-secondary text-secondary-foreground shadow-elev-sm hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground",
        "ghost-primary":
          "text-primary hover:bg-primary/10",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 text-sm [&_svg]:size-4",
        xs: "h-7 px-2.5 text-xs rounded [&_svg]:size-3",
        sm: "h-8 px-3 text-xs rounded-md [&_svg]:size-3.5",
        lg: "h-11 px-6 text-sm rounded-md [&_svg]:size-4",
        xl: "h-12 px-8 text-base rounded-md [&_svg]:size-5",
        icon: "h-9 w-9 [&_svg]:size-4",
        "icon-sm": "h-8 w-8 [&_svg]:size-3.5",
        "icon-xs": "h-7 w-7 [&_svg]:size-3",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Show loading spinner and disable button. */
  loading?: boolean;
  /** Icon before text. */
  leftIcon?: React.ReactNode;
  /** Icon after text. */
  rightIcon?: React.ReactNode;
}

const Spinner = () => (
  <svg
    className="animate-spin h-4 w-4"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      leftIcon,
      rightIcon,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    // asChild mode: Slot butuh SINGLE React element child — jangan bungkus dengan
    // leftIcon/rightIcon/spinner di sini. Pemakai wajib susun konten sendiri.
    if (asChild) {
      return (
        <Slot
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref as any}
          {...props}
        >
          {children as React.ReactElement}
        </Slot>
      );
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Spinner /> : leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
