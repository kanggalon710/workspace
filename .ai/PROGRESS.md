# PROGRESS - JABNET Workspace

> Entri terbaru di ATAS. Satu entri per satuan pekerjaan. Jelaskan KENAPA (git sudah
> mencatat APA). Jangan menulis ulang/menghapus entri lama; tambahkan entri koreksi.

## 2026-08-12 - Standar AI Agent + roadmap optimasi + proof slice `<FullBleedPage>`
**Agen:** claude | **Status:** selesai
**Kenapa:** User minta codebase mengikuti prinsip dasar (semantic HTML, DRY, reusable
component, mobile-first, desain bersih) dan mengecilkan file raksasa, TANPA memecah
stabilitas/fitur (app LIVE). Juga minta satu file instruksi wajib-baca untuk semua AI
agent karena belum ada standar level-project. Ronde ini sengaja di-scope: dokumen +
roadmap + satu refactor kecil yang aman sebagai bukti pola.
**Perubahan:**
- `AGENTS.md` (root) - standar wajib-baca, menunda ke `~/.claude/CLAUDE.md` untuk aturan
  universal; berisi aturan spesifik project (reuse-first + tabel primitif UI, token-only,
  verifikasi 3-perintah, pola MySQL/izin/deploy).
- `.ai/TODO.md` - roadmap optimasi ber-prioritas dengan angka hasil audit grep-verified.
- `.ai/PROGRESS.md`, `.ai/DECISIONS.md` - inisialisasi state folder.
- `client/components/ui/full-bleed-page.tsx` - komponen baru `<FullBleedPage>`.
- 6 page memakainya menggantikan string scaffold yang identik: `MitraPage`, `UsersPage`,
  `RolesPage`, `AnnouncementsPage`, `BugReportsPage`, `PublicApiPage`.
**Verifikasi:** `npx tsc --noEmit` -> 0 error. `npx tsx --test shared/*.test.ts` ->
294 pass, 0 fail (tak berubah, proof slice tidak menyentuh `shared/`). `npm run build` ->
sukses (esbuild 4.0mb). Zero visual change (kelas dipertahankan byte-identik; 6 call site
tidak mengoper `className`).
**Catatan:** Sisa optimasi (formatRupiah, FilterPillBar, adopsi dialogSize/StatTile/
EmptyState, a11y sweep, migrasi warna token, pecah page besar, dan pecah routes.ts/
storage.ts) tercatat di `.ai/TODO.md` untuk ronde berikutnya. Belum di-deploy - keputusan
push/merge/deploy ada di user.
