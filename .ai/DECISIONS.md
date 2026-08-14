# DECISIONS - Keputusan Arsitektur

> Konteks -> opsi -> pilihan -> alasan. Entri terbaru di ATAS.

## 2026-08-14 - #7 TEMUAN: subsistem Tiket = warna KATEGORIKAL (bukan target token)
**Konteks:** Tail bersih mid-size habis (optim-16..27, 43 file total). Sebelum ronde fokus
subsistem tiket, cek arsitektur warnanya (apakah ada helper bersama utk tokenisasi terpusat).
**Bukti:** `client/components/tickets/shared.ts` = sumber warna tiket, semua **peta config
kategorikal**: `STATUS_CONFIG` (6 hue: open=blue, assigned=cyan, in_progress=orange,
pending=amber, resolved=green, closed=gray), `PRIORITY_CONFIG` (low=gray, medium=blue,
high=orange, urgent=red), `ACTIVITY_ICON_CONFIG` (per-tipe: created=green, status_change=blue,
assigned=purple, note=gray, schedule_change=amber). Warna dipakai utk MEMBEDAKAN kategori/status,
bukan skala success/warning/danger. `client/lib/utils.ts getStatusColor` (status pelanggan)
juga campur: active=green, maintenance=yellow, inactive=red, suspended=orange (orange kategorikal).
**Keputusan:** Subsistem tiket TIDAK ditokenkan (kecuali one-off destructive/success murni per
file, low-value). Tokenisasi sebagian (hanya amber/green/gray) akan MERUSAK skema 6-warna yg
koheren. Konsisten dg aturan: famili kategorikal (blue/cyan/orange/purple/indigo/violet/sky/
teal) = pembeda kategori, DILEWATI.
**Alasan:** #7 = tokenisasi STATUS semantik, bukan me-recolor sistem kategorikal. Menyentuhnya =
regresi visual (status coding hilang). Ini menandai AKHIR praktis dari tail #7 yg aman-otomatis;
sisa = page flagged (Dashboard/IntegrationPage/CustomersPage - penilaian per-pakai), data-viz
(PowerBudget/TicketHeatmap/SplitterChain), tema hangat (CanvassingHistory - butuh OK), atau
file inline-`style` (TechnicianWork/MapInfoWindow - rewrite). Semua butuh keputusan/ronde sendiri.

## 2026-08-13 - #7 TEMUAN: sweep warna buta TIDAK aman (dark-mode + badge tint)
**Konteks:** Lanjut #7 ke banyak page. Coba transform semantik ter-generalisasi (status+neutral)
ke PointRedemptionsTab/PointsTab -> KETAHUAN regresi nyata, di-revert.
**Bukti:** (a) `bg-amber-200 text-amber-900` -> `bg-warning text-warning` = **teks tak terlihat**
(warna sama di atas warna sama). (b) `text-amber-900 dark:text-amber-200` -> `text-warning
dark:text-warning` = pasangan kontras terang/gelap yg di-tuning tangan KOLAPS + teks gelap jadi
terang. (c) Mayoritas page (Dashboard 49 dark:, IntegrationPage 68) punya varian `dark:` LIVE
(dark-mode = fitur nyata: toggle di TopBar/Sidebar/CommandPalette, `darkMode:["class"]`).
Bahkan `FullBleedPage` `bg-slate-50/40 dark:bg-slate-950/40` -> 1 token = geser bg dark-mode.
**Keputusan:** Sweep buta DIHENTIKAN. #7 hanya aman untuk page yang (1) TANPA varian `dark:`
(tak ada pasangan terang/gelap utk dirusak) DAN (2) badge tint di-map ke varian transparan
(`bg-{tok}/15`, bukan solid) sehingga teks tetap terbaca. Skip semua famili kategorikal
(violet/sky/blue/indigo/purple/teal/cyan/orange) - itu pembeda kategori, bukan status.
**Alasan:** Jaga fitur dark-mode + keterbacaan (dilarang kompromi stabilitas app LIVE). Sisa
page ber-`dark:` butuh migrasi per-pola manual (rewrite cluster terang+gelap -> 1 token
theme-aware + hapus `dark:` redundan) = kerja desain, bukan sweep. Butuh keputusan user.

## 2026-08-13 - #7 Warna token: strategi + batas (mulai TicketCategoriesPage)
**Konteks:** #7 migrasi warna hardcoded ke token. Audit ungkap 3 jenis kerja BEDA, tak bisa
disapu seragam: (a) file className (TicketCategories, CanvassingHistory) - swap className;
(b) file inline-`style={{}}` (TechnicianWorkPage 102 hex, MapInfoWindow 24) - itu REWRITE
arsitektur styling, bukan swap warna; (c) sebagian warna TAK punya padanan semantik.
**Keputusan (dikonfirmasi user):**
1. **Strategi map = token semantik** (bukan exact-palette): `bg-slate-100->bg-muted`,
   `text-[#10b981]->text-success`, dst. Terima pergeseran warna kecil (emerald->green) +
   jadi theme-aware. Bagian light-mode mayoritas near-exact (slate-200=--border,
   amber-500=--warning, red-500=--destructive, sky-500=--primary/info).
2. **Warna tanpa padanan semantik -> kelas palet EKSAK (zero shift), bukan dipaksa semantik.**
   Navy brand `#1e40af`/`#1e3a8a` (primary=sky, jadi navy->sky = shift BESAR, ditolak) ->
   `blue-800`/`blue-900`. Hasil: 0 arbitrary `[#hex]` di file, warna navy persis sama.
3. **File inline-style (Technician, MapInfoWindow) DITUNDA** - butuh ronde rewrite +approval
   sendiri (alat lapangan kritikal, risiko regresi tinggi). Dicatat di TODO.
4. **CanvassingHistoryPage DITUNDA** - pakai sub-tema HANGAT (coklat/taupe: #827472/#350800/
   #504442/#755750/#f4f3f2) = identitas warna beda; migrasi = re-tema penuh hangat->dingin
   (koheren hanya all-or-nothing), keputusan aestetik sendiri. Bukan "shift kecil".
5. **Pasangan hover-gelap yang kolaps** (`bg-rose-500 hover:bg-rose-600`,
   `bg-[#10b981] hover:bg-[#059669]`) -> base token + `hover:brightness-95` supaya umpan-balik
   hover tak hilang (jaga fitur).
**Alasan:** Menghormati pilihan user (semantik + dark-aware) tanpa mengubah warna yang
tak-berpadanan atau me-rewrite alat lapangan diam-diam. Data warna (array picker kategori,
inline `background: c.color` dinamis) sengaja TETAP hex (itu data, bukan style).

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
