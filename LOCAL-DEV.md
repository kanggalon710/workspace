# Menjalankan JABNET Workspace di Lokal (Mac/Linux) — Terverifikasi

> Langkah ini sudah diuji end-to-end pada DB kosong (MariaDB/MySQL 8) — aplikasi boot,
> login, dan seluruh modul Teamspace v5.0 berfungsi. Perbedaan penting dari deploy cPanel:
> di lokal **wajib jalankan `npm run db:push` sekali** untuk membuat tabel inti (users,
> roles, customers, dst). Startup app hanya membuat tabel "tambahan" (pipelines, teamspace,
> dll) secara idempotent — bukan tabel inti.

## 1. Prasyarat
- **Node 20+** (`node -v`)
- **MySQL 8** atau **MariaDB 10.6+**

## 2. Database
**Docker (paling cepat):**
```bash
docker run -d --name jabnet-mysql \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=jabnet_fiber \
  -p 3306:3306 mysql:8
```
**atau Homebrew (Mac):**
```bash
brew install mysql && brew services start mysql
mysql -uroot -e "CREATE DATABASE jabnet_fiber CHARACTER SET utf8mb4;"
```

## 3. `.env` di root proyek
```env
PORT=3002
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=jabnet_fiber
SESSION_SECRET=ganti-string-random-minimal-32-karakter
ADMIN_DEFAULT_PASSWORD=Admin@1234
JABNET_UPLOAD_ROOT=./uploads
TEAMSPACE_WORKER_ENABLED=true
APP_PUBLIC_URL=http://localhost:3002
```
> Homebrew MySQL default: `DB_USER=root`, `DB_PASSWORD=` (kosong).

## 4. Install → buat tabel → jalankan
```bash
npm install
npm run db:push      # WAJIB sekali di DB kosong — buat semua tabel inti (drizzle-kit)
npm run dev          # startup melengkapi tabel tambahan + seed admin + roles otomatis
```

## 5. Buka & login
`http://localhost:3002` — **admin** / **Admin@1234**

Sidebar kiri → grup **TEAMSPACE**: Semua Tugas · Tim Saya · Laporan Kinerja · Cheers.
Buat tim → board 4 list otomatis → tab Chat / Jadwal / Pertanyaan / Dokumen.

## Catatan
- **Saran AI** (Laporan Kinerja) perlu diaktifkan: set `app_settings.anthropic_api_key` +
  `app_settings.teamspace_ai_enabled=true` (via DB atau halaman Integrasi). Tanpa itu semua
  fitur lain tetap jalan — hanya tombol "Buat Saran" yang meminta konfigurasi.
- **Worker check-in** mengirim WhatsApp hanya bila MPWA aktif (`app_settings.mpwa_enabled=true`).
  Di dev, notifikasi in-app tetap terkirim; WA di-skip (log ke console).
- **Reset DB bersih:** `DROP DATABASE jabnet_fiber; CREATE DATABASE jabnet_fiber;` lalu ulangi
  `npm run db:push`.
- `npm install` meng-compile `better-sqlite3` (butuh Xcode CLT di Mac: `xcode-select --install`).
  Hanya dipakai script migrasi lama — tidak wajib untuk menjalankan app.
