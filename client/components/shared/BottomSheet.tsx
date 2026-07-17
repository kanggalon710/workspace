import React, { useRef, useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  height?: "sm" | "md" | "lg" | "full";
  /** Show a close (X) button in header. Default: true when title is provided. */
  showCloseButton?: boolean;
}

const HEIGHT_MAP = {
  sm: "40vh",
  md: "60vh",
  lg: "80vh",
  full: "100vh",
};

export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  height = "md",
  showCloseButton,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [startY, setStartY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [offsetY, setOffsetY] = useState(0);

  // Body scroll lock while open
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // Only allow drag from handle area (first 60px of sheet)
    const touch = e.touches[0];
    const sheetEl = sheetRef.current;
    if (!sheetEl) return;
    const rect = sheetEl.getBoundingClientRect();
    if (touch.clientY - rect.top > 60) return;
    setStartY(touch.clientY);
    setDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!dragging) return;
      const delta = e.touches[0].clientY - startY;
      if (delta > 0) setOffsetY(delta);
    },
    [dragging, startY]
  );

  const handleTouchEnd = useCallback(() => {
    setDragging(false);
    if (offsetY > 120) onClose();
    setOffsetY(0);
  }, [offsetY, onClose]);

  useEffect(() => {
    if (!open) setOffsetY(0);
  }, [open]);

  if (!open) return null;

  const shouldShowClose = showCloseButton !== undefined ? showCloseButton : !!title;

  return (
    <>
      <div className="bottom-sheet-backdrop" onClick={onClose} aria-hidden="true" />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "bottom-sheet-title" : undefined}
        className="bottom-sheet-container"
        style={{
          maxHeight: HEIGHT_MAP[height],
          transform: offsetY > 0 ? `translateY(${offsetY}px)` : undefined,
          transition: dragging
            ? "none"
            : "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle — visual cue for drag */}
        <div className="bottom-sheet-handle" />

        {/* Header */}
        {(title || shouldShowClose) && (
          <div className="px-5 pt-1 pb-3 flex items-start gap-3 border-b border-border/50">
            <div className="flex-1 min-w-0">
              {title && (
                <h3
                  id="bottom-sheet-title"
                  className="text-base font-bold text-foreground tracking-tight leading-tight"
                >
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
            {shouldShowClose && (
              <button
                onClick={onClose}
                className="shrink-0 h-8 w-8 -mt-0.5 -mr-1.5 rounded-full hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div
          className="px-5 py-4 overflow-y-auto no-scrollbar"
          style={{ maxHeight: `calc(${HEIGHT_MAP[height]} - ${title ? 90 : 30}px)` }}
        >
          {children}
        </div>
      </div>
    </>
  );
}
