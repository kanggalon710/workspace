# JABNET FTTH Asset Manager — v2.6.0 Upgrade Guide

## Cara Update dari Versi Sebelumnya

### Opsi 1: Update In-Place (Mempertahankan Database)

```bash
# 1. Backup data dulu (WAJIB)
cd /path/ke/jabnet-ftth-lama
cp data.db data.db.backup-$(date +%Y%m%d)

# 2. Backup .env dan file konfigurasi lokal jika ada
cp .env .env.backup 2>/dev/null || true

# 3. Stop server lama
# (Ctrl+C di terminal yang menjalankan server, atau pkill -f "tsx server")

# 4. Extract zip baru ke direktori temporary
unzip jabnet-ftth-manager-v2.6.0.zip -d /tmp/jabnet-baru

# 5. Copy file dari versi baru, KECUALI database & node_modules
rsync -av --exclude='data.db*' --exclude='node_modules' --exclude='.env' \
  /tmp/jabnet-baru/jabnet-ftth-manager-v2.6.0/ \
  /path/ke/jabnet-ftth-lama/

# 6. Install dependencies (hanya jika ada perubahan package.json)
cd /path/ke/jabnet-ftth-lama
npm install

# 7. Jalankan server — auto migration akan menambahkan kolom baru
npm run dev    # development
# ATAU
npm run build && npm start    # production
```

### Opsi 2: Fresh Install ke Direktori Baru

```bash
# 1. Extract zip ke lokasi baru
unzip jabnet-ftth-manager-v2.6.0.zip -d ~/aplikasi/
cd ~/aplikasi/jabnet-ftth-manager-v2.6.0

# 2. Copy database dari instalasi lama
cp /path/ke/jabnet-ftth-lama/data.db ./

# 3. Buat .env (atau copy dari yang lama)
cp .env.example .env
# Edit .env sesuai kebutuhan (SESSION_SECRET, GOOGLE_MAPS_API_KEY, dll)

# 4. Install dependencies
npm install

# 5. Jalankan
npm run dev
```

## Verifikasi Setelah Update

Setelah server start, cek log untuk pastikan auto-migration berjalan:

```
[STORAGE] Database initialized
[JABNET FTTH] Server running on http://localhost:3002
```

Lalu buka browser dan:

1. **Login** dengan akun admin yang ada (kredensial tetap sama)
2. **Klik kartu user di sidebar kiri-bawah** → harus membuka halaman `/profile`
3. Cek apakah hero card, badge role, dan data pribadi tampil rapi
4. Klik **Ubah** di Data Pribadi → coba edit nama → Save → harus berhasil
5. Buka **Manajemen User** (admin only) → klik salah satu user → harus muncul detail dialog
6. Klik **Edit** → pastikan ada 3 tab (Akun & Akses, Data Pribadi, Data Tim)
7. Coba isi field di tab Data Tim (jabatan, departemen, cabang) → Save → Refresh → data harus tersimpan
8. Buka **Peta Jaringan** → harus muncul peta dengan marker (sebelumnya bug blank)
9. **Logout** → di halaman login, klik link **"Cek Ketersediaan Jaringan"** → harus bisa diakses tanpa login

## Rollback Jika Gagal

```bash
# Restore database backup
cp data.db.backup-YYYYMMDD data.db

# Atau extract zip versi lama jika sudah dihapus
unzip jabnet-ftth-manager-v2.5.0.zip -d ~/aplikasi/
```

## Troubleshooting

### Server gagal start dengan error "no such column"
Auto-migration gagal. Cek bahwa file `server/storage.ts` versi baru ter-copy dengan benar dan restart server. Migration menggunakan `try/catch` di setiap `ALTER TABLE` jadi safe untuk dijalankan berulang.

### Halaman Profil tampil blank atau error 500
Cek browser console (F12). Jika muncul error `me?.email is undefined`, pastikan endpoint `/api/auth/me` mengembalikan field lengkap. Biasanya server perlu restart penuh karena `tsx` tidak punya watch mode untuk perubahan di `routes.ts`.

### Build production gagal dengan error vite/lightningcss
Build script v2.6.0 menggunakan ESM output. Pastikan `package.json` punya:
```json
"build": "vite build && esbuild server/index.ts --bundle --platform=node --outfile=dist/index.mjs --format=esm --packages=external",
"start": "NODE_ENV=production node dist/index.mjs",
```

### Sidebar user card tidak bisa di-klik
Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R) untuk clear cache Vite HMR.

---

Untuk daftar lengkap perubahan, lihat [CHANGELOG.md](./CHANGELOG.md).
