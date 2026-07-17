import { useCallback, useState } from "react";
import { Maximize2, Minimize2, Square } from "lucide-react";
import { DIALOG_SIZES, nextDialogSize, dialogSizeClass, type DialogSize } from "@/lib/dialogSize";

function readStored(key: string): DialogSize {
  try {
    const v = localStorage.getItem(key);
    return DIALOG_SIZES.includes(v as DialogSize) ? (v as DialogSize) : "normal";
  } catch { return "normal"; }
}

/** Persisted dialog-size state. `sizeClass` goes on the DialogContent; `cycle` on the toggle. */
export function useDialogSize(storageKey: string) {
  const [size, setSize] = useState<DialogSize>(() => readStored(storageKey));
  const cycle = useCallback(() => {
    setSize((s) => {
      const next = nextDialogSize(s);
      try { localStorage.setItem(storageKey, next); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);
  return { size, cycle, sizeClass: dialogSizeClass(size) };
}

const LABEL: Record<DialogSize, string> = { normal: "Normal", wide: "Lebar", full: "Layar penuh" };

/** A single cycle button (Normal → Lebar → Layar penuh). Place in a dialog header,
 *  positioned just left of the built-in close (which sits at right-4 top-4). */
export function DialogSizeToggle({ size, onCycle }: { size: DialogSize; onCycle: () => void }): JSX.Element {
  const Icon = size === "full" ? Minimize2 : size === "wide" ? Maximize2 : Square;
  const nextLabel = LABEL[nextDialogSize(size)];
  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={`Ubah lebar dialog (sekarang: ${LABEL[size]}, klik untuk ${nextLabel})`}
      title={`Lebar: ${LABEL[size]} → ${nextLabel}`}
      className="absolute right-11 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">Ubah lebar dialog</span>
    </button>
  );
}
