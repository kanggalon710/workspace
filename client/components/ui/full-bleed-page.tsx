import { cn } from "@/lib/utils";

interface FullBleedPageProps {
  children: React.ReactNode;
  /** Extra classes merged onto the shell (never replaces it). */
  className?: string;
}

/**
 * Kelas shell full-bleed baku untuk halaman daftar/manajemen mobile-first:
 * kolom flex tinggi viewport, negatif-margin agar menembus padding Layout,
 * header sticky di dalamnya, dan body yang scroll sendiri di desktop.
 *
 * Diekstrak dari 6 halaman yang menyalin string kelas ini identik
 * (Users, Roles, Mitra, Announcements, BugReports, PublicApi). Ganti wrapper
 * terluar dengan komponen ini; isi (header sticky + body scroll) tetap sama.
 *
 * Catatan: warna latar sengaja dipertahankan (`bg-slate-50/40`) supaya tampilan
 * identik saat ekstraksi. Migrasi ke token semantik dilakukan terpisah (lihat
 * .ai/TODO.md), sehingga cukup diubah di satu tempat ini.
 */
const SHELL =
  "flex flex-col min-h-[calc(100vh-4rem)] md:h-[calc(100vh-4rem)] md:overflow-hidden bg-slate-50/40 dark:bg-slate-950/40 -m-4 md:-m-6 -mt-4 md:-mt-6 pb-20 md:pb-0";

/**
 * FullBleedPage - kerangka halaman full-bleed (edge-to-edge) untuk halaman
 * daftar/manajemen. Pakai bersama header sticky + area konten yang scroll.
 *
 * @example
 * <FullBleedPage>
 *   <div className="sticky top-0 z-10 ...">…header…</div>
 *   <div className="flex-1 overflow-y-auto ...">…konten…</div>
 * </FullBleedPage>
 */
export function FullBleedPage({ children, className }: FullBleedPageProps) {
  return <div className={className ? cn(SHELL, className) : SHELL}>{children}</div>;
}
