# DECISIONS - Keputusan Arsitektur

> Konteks -> opsi -> pilihan -> alasan. Entri terbaru di ATAS.

## 2026-08-13 - #4 Lebar dialog: utilitas CSS `.dialog-w`, BUKAN `dialogSizeClass()`
**Konteks:** TODO #4 mengusulkan adopsi `dialogSizeClass()` di 39+ file `w-[calc(100vw-2rem)]`.
Audit ulang: `dialogSizeClass()` mem-bake `max-w` (2xl/5xl/95vw) + `max-h` tetap - itu benar
untuk fiturnya (toggle `DialogSizeToggle`/`useDialogSize` Normal/Lebar/Layar-penuh di 3 dialog
pipeline). Tapi 51 dialog lain punya `max-w` beragam (sm/md/lg/xl/2xl/3xl/5xl) + `max-h`
beragam (80/85/90/92vh). Memaksa lewat preset = **regresi lebar desktop** + clobber max-h.
**Opsi:** (a) paksa `dialogSizeClass("normal")` (regresi desktop di ~40 dialog); (b) perluas
helper terima `max-w` sbagai arg (churn: 51 string statis -> template literal + import per file);
(c) ekstrak token yang benar-benar duplikat (ekspresi lebar mobile-first) jadi 1 utilitas CSS
`.dialog-w`, tiap dialog tetap pegang `max-w`/`max-h` sendiri.
**Pilihan:** (c). `.dialog-w = w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)]` di `index.css`
`@layer utilities` (sekelas `.no-scrollbar`). 51 site swap token `w-[calc(100vw-2rem)]`->`dialog-w`.
**Alasan:** DRY sejati (inset mobile di 1 tempat), konsisten pola `index.css` yang ada, **tanpa
import/template-literal per file**. Efek: >=640px **pixel-identik**; <640px gutter 1rem (dari 2rem)
= refinement mobile-first yang di-opt-in user. 2 cap `min(...,calc(100vw-2rem))` (combobox,
PipelinesPage) sengaja TIDAK disentuh (itu max-width cap, bukan token lebar). `dialogSizeClass()`
dibiarkan utuh (fitur toggle-nya masih dipakai). Menyimpang dari teks TODO -> dicatat di sini.

## 2026-08-12 - Ronde 2: shadow `StatTile`/`KpiCard` ditahan (jaga fitur)
**Konteks:** Rencana normalisasi memindah local shadow ke komponen `ui/`. Audit menemukan
`KpiCard`/`StatTile` lokal (LoyaltyAdmin, TicketsDashboard, BugReports) meng-encode fitur
yang belum ada di `ui/StatTile`: nilai angka berwarna, ring `urgent` (pulse), dan tab-filter
dengan state aktif + status-dot.
**Opsi:** (a) paksa pindah ke `ui/StatTile` (kehilangan fitur tsb); (b) tahan, adopsi setelah
`ui/StatTile` diperluas; (c) tahan permanen.
**Pilihan:** (b) - ditahan ronde ini, dicatat di TODO sebagai "#2 sisa".
**Alasan:** Memindah paksa = **menghilangkan fitur** (dilarang oleh batasan user). Yang
dinormalisasi hanya shadow yang aman: `StatusBadge` (Customers/Integration) + `EmptyState`
(portal). Shadow lain menunggu ekstensi komponen bersama.

## 2026-08-12 - Ronde 2: `formatRupiah` pakai delegasi + micro-change NBSP
**Konteks:** 8 formatter Rupiah inline, dua "famili" beda: string-concat (spasi biasa) vs
`Intl…currency:"IDR"` (CustomersPage, pakai non-breaking space). Tiga kebijakan null/0 beda.
**Opsi:** (a) satu helper kaku; (b) helper dengan arg `fallback` + delegasi dari tiap local.
**Pilihan:** (b) - `formatRupiah(n, fallback?)`; tiap local (`fmtRp`/`formatRp`) delegasi
sehingga call site + fallback tak berubah.
**Alasan:** Reproduksi persis perilaku tiap site. Satu perubahan disengaja: CustomersPage
yang tadinya NBSP (dari Intl) kini spasi biasa - **imperseptibel**, dikomentari di kode.

## 2026-08-12 - Ronde 2: `<ScrollRow>` cuma wrapper (pill tetap di call site)
**Konteks:** ~15 baris filter-pill berbagi wrapper scroll, tapi palet aktif/nonaktif tiap
pill berbeda per halaman.
**Opsi:** (a) komponen pill beropini (satu palet) - mengubah visual; (b) hanya wrapper
`ScrollRow`, pill tetap di call site.
**Pilihan:** (b).
**Alasan:** Menjaga zero visual change (batasan stabilitas). Adopsi awal 2 site sebagai bukti;
sisanya mekanis di TODO. Portal `EmptyState` (customer-facing) tetap dinormalisasi karena
empty-state low-stakes + user opt-in.

## 2026-08-12 - Optimasi bertahap, bukan big-bang; backend split ditunda
**Konteks:** Permintaan "optimalkan codebase, ikuti prinsip dasar, kecilkan file besar,
tanpa memecah stabilitas/fitur". File terbesar adalah backend: `server/routes.ts` (16.972
baris) & `server/storage.ts` (16.045). App LIVE di produksi.
**Opsi:** (a) sweep besar sekaligus termasuk pecah routes.ts/storage.ts; (b) hanya dokumen;
(c) dokumen + roadmap + satu proof slice aman, sisanya bertahap dengan approval.
**Pilihan:** (c).
**Alasan:** Memecah dua file 16k baris adalah hal yang paling mungkin merusak stabilitas -
persis yang user larang. Design system sudah kaya tapi dilewati, jadi mayoritas "optimasi"
= adopsi komponen yang ADA (rendah risiko), bukan abstraksi baru. Roadmap grep-verified
(`.ai/TODO.md`) membuat ronde berikutnya tertarget dan bisa di-review satu per satu.
Pecah routes.ts/storage.ts didaftarkan sebagai effort terpisah berisiko tinggi (#10),
butuh rencana + approval sendiri.

## 2026-08-12 - `<FullBleedPage>` pertahankan kelas byte-identik (bukan langsung ke token)
**Konteks:** Scaffold full-bleed identik di 6 file memakai `bg-slate-50/40
dark:bg-slate-950/40` (kelas palet mentah, melanggar aturan token-only).
**Opsi:** (a) sekalian ganti ke token `bg-muted` saat ekstraksi; (b) pertahankan kelas
persis, tunda migrasi token.
**Pilihan:** (b) - `SHELL` di `full-bleed-page.tsx` menyalin string kelas apa adanya.
**Alasan:** Proof slice harus **zero visual regression** demi jaminan "tanpa memecah
fitur/tampilan". Karena kini terpusat di satu komponen, migrasi ke token cukup satu baris
nanti (roadmap #7). Deviasi dari aturan token-only ini disengaja & dikomentari di kode.
