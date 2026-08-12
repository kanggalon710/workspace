# DECISIONS - Keputusan Arsitektur

> Konteks -> opsi -> pilihan -> alasan. Entri terbaru di ATAS.

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
