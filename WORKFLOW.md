# Alur Kerja & Deploy - JABNET Workspace

Dokumen ini menjelaskan **urutan resmi pengerjaan**: kerjakan di **`dev`** dulu,
setelah cocok baru ke **`main`**, dan update **production** lewat branch **`deploy`**
kalau sudah OK.

```
  feature/*  ─►  dev  ─►  (test di dev.workspace.jabnet.id)  ─►  main  ─►  production
                 │                                                │
             deploy-dev  (auto-build CI)                       deploy  (auto-build CI)
                 │                                                │
          cPanel DEV pull                                  cPanel PROD pull / Update sekali-klik
```

---

## 1. Model Branch

| Branch | Peran | Siapa yang push |
|---|---|---|
| `feature/*`, `claude/*` | Branch kerja fitur/perbaikan | Developer / Claude |
| **`dev`** | Integrasi & pengujian sebelum produksi | Merge dari feature branch |
| **`main`** | Sumber kebenaran produksi (sudah "cocok") | Merge dari `dev` (atau hotfix) |
| `deploy` | Payload **pre-built** untuk cPanel PROD | **Otomatis oleh CI** - JANGAN edit manual |
| `deploy-dev` | Payload pre-built untuk cPanel DEV | **Otomatis oleh CI** - JANGAN edit manual |

> `deploy` / `deploy-dev` adalah orphan branch yang history-nya selalu ditimpa CI.
> Jangan pernah commit langsung ke sana.

---

## 2. Langkah Pengerjaan (urutan wajib)

### Langkah A - Kerjakan di branch fitur, lalu ke `dev`
1. Buat/checkout branch fitur dari `dev`:
   `git fetch origin dev && git checkout -B feature/nama-fitur origin/dev`
2. Koding. Sebelum push, **verifikasi wajib** (lihat bagian 4).
3. Push branch fitur, buka PR **ke `dev`**, review, merge.
4. Merge ke `dev` -> CI (`build.yml`) otomatis build -> force-push ke `deploy-dev`.

### Langkah B - Uji di lingkungan DEV
5. cPanel DEV: **Git Version Control -> Update from Remote** (pull `deploy-dev`),
   `npm install` bila dependency berubah, **Restart**.
6. Cek di `https://dev.workspace.jabnet.id`. Kalau ada bug, ulangi Langkah A.

### Langkah C - Naikkan ke `main` (setelah cocok)
7. Kalau di dev sudah cocok, buka PR **`dev` -> `main`**, review, merge.
8. Merge ke `main` -> CI otomatis build -> force-push ke `deploy`.
9. `backflow.yml` otomatis membuka PR **`main` -> `dev`** biar dev tidak drift -
   review + merge PR itu (bukan auto-merge).

### Langkah D - Update PRODUCTION (kalau sudah OK)
Pilih salah satu:
- **Manual (cPanel):** Git Version Control -> **Update from Remote** (pull `deploy`),
  `npm install` bila deps berubah, **Restart Node.js App**.
- **Sekali-klik (dari aplikasi):** menu **Integrasi -> Pembaruan Aplikasi ->
  "Cek Pembaruan" -> "Update Sekarang"** (admin). Server tarik versi terbaru dari
  branch yang di-track cPanel + restart otomatis. Lihat [WORKFLOW self-update](#5-catatan-self-update).

Verifikasi produksi: `curl https://workspace.jabnet.id/api/health` -> `{ ok: true }`.

---

## 3. Hotfix darurat (langsung ke `main`)

Kalau produksi bermasalah dan tak bisa nunggu jalur dev:
1. Branch dari `main`, perbaiki, PR **ke `main`**, merge.
2. CI build -> `deploy` -> update produksi (Langkah D).
3. `backflow.yml` otomatis buka PR balik ke `dev` - **wajib di-merge** supaya
   perbaikan tidak hilang saat rilis berikutnya.

---

## 4. Verifikasi Wajib Sebelum Push

Jalankan ketiganya, harus hijau:
```bash
npx tsc --noEmit                 # typecheck: 0 error
npx tsx --test shared/*.test.ts  # unit test shared
npm run build                    # build produksi (Vite + esbuild)
```
Run lokal untuk uji manual: lihat [LOCAL-DEV.md](LOCAL-DEV.md).

---

## 5. Catatan Self-Update

- Fitur "Pembaruan Aplikasi" (Integrasi) menarik versi terbaru dari **branch yang
  sedang ter-checkout di cPanel** (auto-deteksi kalau field Branch dikosongkan).
- Kalau cPanel checkout **source branch** (ada `vite.config`), update akan
  `npm install` + `npm run build` dulu. Kalau checkout **payload pre-built**
  (`deploy`/`deploy-dev`), build dilewati (lebih cepat).
- Butuh **GitHub token** (repo privat) disimpan di pengaturan Integrasi - jangan
  taruh di chat/commit.

---

## 6. Ringkasan Aturan

- Alur normal: **feature -> dev -> (test) -> main -> deploy(prod)**.
- `deploy` / `deploy-dev` = hasil CI, jangan disentuh manual.
- Selalu verifikasi (typecheck + test + build) sebelum push.
- Jangan deploy ke produksi tanpa persetujuan.
- Setelah rilis ke `main`, jangan lupa merge PR backflow ke `dev`.
