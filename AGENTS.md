# AGENTS.md - Wajib dibaca sebelum ngoding (Claude / Qwen / Gemini / Codex / dll)

> Ini **aturan khusus project JABNET Workspace**. Untuk aturan universal (DRY,
> reusable component, keamanan, aksesibilitas, dll) file ini **menunda ke** standar
> global di `~/.claude/CLAUDE.md`. Kalau file itu tidak ada di lingkunganmu, tetap
> ikuti prinsip yang sama; file ini hanya menambah hal spesifik project.

**Urutan prioritas:** instruksi langsung user > `AGENTS.md` (file ini) > standar global
`~/.claude/CLAUDE.md` > kebiasaan bawaan agen.

---

## 0. Mulai dari sini (baca sebelum kerja non-trivial)

1. **File ini** (aturan project).
2. **`CLAUDE.md`** - handoff memory: arsitektur, fitur, gotcha, pola MySQL. Sumber
   kebenaran untuk "di mana kode X".
3. **`WORKFLOW.md`** - alur branch & deploy (feature -> dev -> main -> deploy).
4. **`.ai/TODO.md`** + entri terbaru **`.ai/PROGRESS.md`** - apa yang sedang/sudah
   dikerjakan, biar tidak dobel atau menghidupkan pendekatan yang sudah ditinggalkan.
   Cek **`.ai/DECISIONS.md`** sebelum mengusulkan perubahan arsitektur.

---

## 1. Stack (ringkas; detail di `CLAUDE.md`)

- **Backend:** Node 20 - Express 5 - Drizzle ORM (MySQL) - `mysql2` - esbuild bundle.
  Semua akses DB lewat satu class `DatabaseStorage` di `server/storage.ts`.
- **Frontend:** React 18 - TypeScript strict - Vite - Wouter - Tailwind 3 + shadcn/ui -
  TanStack Query.
- **Logika bisnis murni:** modul di `shared/` + unit test (`shared/*.test.ts`).

---

## 2. Verifikasi WAJIB sebelum bilang "selesai" / push

**Tidak ada ESLint/Prettier di repo ini.** Jangan mengarang langkah lint. Gerbangnya
persis tiga perintah, semua harus hijau:

```bash
npx tsc --noEmit                 # typecheck: 0 error
npx tsx --test shared/*.test.ts  # unit test shared: semua pass
npm run build                    # Vite client + esbuild server bundle
```

Jangan pernah klaim berhasil sebelum menjalankan ketiganya dan membaca hasilnya.

---

## 3. Reuse-first: JANGAN bikin ulang komponen yang sudah ada (aturan #1)

Audit menemukan duplikasi masif karena design system yang kaya **dilewati**. Sebelum
menulis UI baru, **pakai primitif yang sudah ada** di `client/components/ui/`:

| Butuh | Pakai | Path |
|---|---|---|
| Header halaman | `<PageHeader icon title description accent actions onRefresh />` | `ui/page-header.tsx` |
| Wrapper + section | `<PageContainer>` / `<PageSection>` | `ui/page-container.tsx` |
| Halaman full-bleed (list/manajemen) | `<FullBleedPage>` | `ui/full-bleed-page.tsx` |
| KPI / statistik | `<StatTile icon label value accent trend />` | `ui/stat-tile.tsx` |
| Badge status | `<StatusBadge variant label size appearance />` | `ui/status-badge.tsx` |
| Kondisi kosong | `<EmptyState icon title description action />` | `ui/empty-state.tsx` |
| Tabel | `<DataTable columns data searchable />` | `ui/data-table.tsx` |
| Form field | `<FormField>` / `<FormRow>` / `<FormSection>` | `ui/form-field.tsx` |
| Loading | `<Skeleton*>` (KPIGrid/Card/Table/Chart/List) | `ui/skeleton.tsx` |
| Select cari | `<Combobox>` | `ui/combobox.tsx` |
| Card / Button / Input | `<Card>` / `<Button>` / `<Input>` | `ui/*.tsx` |
| Bottom sheet mobile | `<BottomSheet>` | `components/shared/BottomSheet.tsx` |

**DILARANG:** mendeklarasikan `StatusBadge`/`StatTile`/`EmptyState` lokal di dalam file
halaman (sudah terjadi di CustomersPage/IntegrationPage/LoyaltyAdminPage - jangan tiru,
perbaiki kalau lewat). Komponen menerima `className` yang **digabung** (`cn`), bukan
diganti. Sebelum bikin helper/komponen baru: Grep dulu fungsinya di `client/components/`
dan `client/lib/`.

**Dialog responsif:** rutekan lewat helper yang sudah ada `client/lib/dialogSize.ts`
(`dialogSizeClass`). **Jangan** hardcode `w-[calc(100vw-2rem)]`.

---

## 4. Design token saja - jangan warna hardcoded

Token ada di `client/index.css`. **DILARANG:**
- `style={{ color: "#..." }}` (inline hex).
- Tailwind arbitrary hex: `text-[#...]`, `bg-[#...]`, `border-[#...]`.
- Kelas palet mentah (`bg-slate-*`, `bg-gray-*`, `bg-zinc-*`, dst) **jika ada token
  semantiknya**: pakai `bg-muted`, `text-primary`, `bg-success`, `bg-warning`,
  `bg-destructive`, `bg-info`, token `chart-1..8`, dan token aset (`asset-pop`, dll).

(Migrasi warna lama yang masih hardcoded terdaftar di `.ai/TODO.md`.)

---

## 5. Mobile-first & aksesibilitas

- Base style = layar kecil; lebarkan dengan `sm:`/`md:`/`lg:`. **Tidak boleh `max-*:`**
  atau media query `max-width`.
- Halaman list/manajemen full-bleed: pakai `<FullBleedPage>` (bukan salin string kelas
  scaffold). Pola mobile lain ada di `CLAUDE.md` gotcha #4.
- Kontrol interaktif = `<button>`/`<a>`, **bukan** `<div onClick>`.
- Tombol khusus ikon wajib `aria-label`. Tiap `<img>` bermakna wajib `alt`.
- Verifikasi layout di 360px / 768px / 1280px sebelum selesai.

---

## 6. Logika bisnis di `shared/` + test

Perhitungan, aturan status, validasi -> modul murni di `shared/` dengan `*.test.ts`
(pola yang sudah mapan, ~50 file test). Komponen React tetap presentational. Contoh
referensi: `shared/collectionSop.ts`, `shared/kpiAuto.ts`, `shared/payroll.ts`.

---

## 7. Disiplin ukuran file

Beberapa file sudah raksasa (`server/routes.ts` & `server/storage.ts` ~16k baris; sejumlah
page 2-3k baris). Untuk kode baru:
- Utamakan **file sibling baru** daripada menggemukkan page. Ekstrak dialog/tab yang
  self-contained ke file sendiri.
- `server/storage.ts` = satu class besar diorganisir dengan header seksi
  `// ====================`. **Grep dulu** method yang sudah ada sebelum menambah.
- Memecah `routes.ts`/`storage.ts` adalah pekerjaan berisiko tinggi tersendiri -
  jangan lakukan di tengah sweep umum tanpa rencana + persetujuan (lihat `.ai/TODO.md`).

---

## 8. Pola MySQL (Drizzle) - detail lengkap di `CLAUDE.md`

- INSERT tidak punya `.returning()` -> query ulang pakai `insertId`.
- `.all()`/`.run()`/`.get()` **tidak ada** di MySQL Drizzle -> pakai `.execute()`
  (return `[rows, fields]`).
- DELETE pakai `affectedRows`, bukan `changes`.
- List endpoint: hindari N+1, pakai `getXByIds(ids): Promise<Map>` + `inArray` (lihat
  `getOdpsByIds`).

---

## 9. Izin & deploy

- **Permission 3-level** (`none`/`read`/`write`), key di `shared/schema.ts`
  `ALL_PERMISSIONS`. Cek `hasPermission` / `hasWritePermission` di server; frontend
  `<WithPerm>`. Otorisasi ditegakkan di **server**, default menolak.
- **Deploy:** ikuti `WORKFLOW.md` (feature -> dev -> test -> main -> deploy via CI).
  **JANGAN pernah deploy ke produksi tanpa persetujuan eksplisit user.** Tidak ada
  perubahan skema/DB tanpa persetujuan.

---

## 10. Sebelum bilang "selesai"

1. Jalankan 3 perintah verifikasi (bagian 2) - baca hasilnya.
2. Tambah entri di ATAS `.ai/PROGRESS.md`; perbarui `.ai/TODO.md`.
3. Kalau ambil keputusan arsitektur / sengaja melanggar aturan, catat di
   `.ai/DECISIONS.md` beserta alasannya.
4. Sebutkan pelanggaran aturan (kalau ada) di ringkasan yang kamu laporkan.
