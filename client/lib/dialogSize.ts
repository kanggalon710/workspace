/** Reusable dialog width presets — mobile-first. Pure logic, unit-tested. */

export type DialogSize = "normal" | "wide" | "full";
export const DIALOG_SIZES: DialogSize[] = ["normal", "wide", "full"];

/** Cycle to the next preset; unknown values are treated as "normal". */
export function nextDialogSize(size: DialogSize): DialogSize {
  const i = DIALOG_SIZES.indexOf(size);
  return DIALOG_SIZES[(i < 0 ? 0 : i) + 1 >= DIALOG_SIZES.length ? 0 : (i < 0 ? 0 : i) + 1];
}

/** Tailwind classes for a dialog at a given preset. Mobile-first: near full-width on
 *  small screens, widening only at `sm:`+. "full" also controls height. */
export function dialogSizeClass(size: DialogSize): string {
  switch (size) {
    case "wide":
      return "w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] sm:max-w-5xl max-h-[90vh]";
    case "full":
      return "w-[calc(100vw-0.5rem)] sm:w-[95vw] sm:max-w-[95vw] h-[95vh] sm:h-[90vh] max-h-[95vh]";
    case "normal":
    default:
      return "w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh]";
  }
}
