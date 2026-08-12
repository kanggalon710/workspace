import { cn } from "@/lib/utils";

interface ScrollRowProps {
  children: React.ReactNode;
  className?: string;
  /** "mobile" menambah full-bleed negatif-margin di layar kecil, dinetralkan di md+. */
  bleed?: "mobile" | "none";
}

/**
 * ScrollRow - baris horizontal yang bisa di-scroll dengan scrollbar disembunyikan.
 * Dipakai untuk deretan filter-pill / chip yang meluber di layar sempit (mobile-first).
 * Tombol pill tetap didefinisikan di call site karena palet aktif/nonaktif berbeda
 * per halaman - komponen ini hanya menyeragamkan wrapper scroll-nya.
 *
 * @example
 * <ScrollRow bleed="mobile" className="gap-1.5">
 *   {items.map((i) => <button key={i.key}>…</button>)}
 * </ScrollRow>
 */
export function ScrollRow({ children, className, bleed = "none" }: ScrollRowProps) {
  return (
    <div
      className={cn(
        "flex overflow-x-auto no-scrollbar",
        bleed === "mobile" && "-mx-4 px-4 md:mx-0 md:px-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
