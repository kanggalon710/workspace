# cPanel Setup - fiber-jabnet @ workspace.jabnet.id

Setup khusus project ini (JABNET Workspace MySQL port) di cPanel user `jabnet`.
Pola umum cPanel deploy: lihat [CPANEL-CONVENTIONS.md](CPANEL-CONVENTIONS.md).

> **Status:** Phase 1A (infrastructure). Sebelum aplikasi bisa benar-benar serve traffic, **Phase 1B refactor** (114 `.returning()` calls + 89 raw sqlite queries di `server/storage.ts`) harus dikerjakan dulu. Migration script & deploy infrastructure di sini sudah siap.

---

## Ringkasan Konvensi Project Ini

| Item | Value |
|---|---|
| **Project slug** | `fiber-jabnet` |
| **Subdomain** | `workspace.jabnet.id` |
| **Repository path** | `/home/jabnet/repositories/fiber-jabnet` |
| **Private root** | `/home/jabnet/private/fiber-jabnet` |
| **MySQL DB** | `jabnet_fiber` (sudah dibuat) |
| **Branch deploy** | `deploy` (orphan, ditulis oleh GHA) |
| **Source branch** | `main` (push triggers GHA build) |
| **Node version** | 20.x |
| **Entry file** | `dist/index.mjs` (esbuild bundle) |

---

## Checklist Setup Pertama Kali

Centang saat selesai:

- [ ] Subdomain `workspace.jabnet.id` dibuat (AutoSSL on)
- [ ] MySQL DB `jabnet_fiber` punya user dengan ALL PRIVILEGES
- [ ] SSH deploy key di cPanel → attached ke GitHub repo (Deploy Keys, read-only)
- [ ] `chmod 711 /home/jabnet/repositories`
- [ ] Folder `/home/jabnet/private/fiber-jabnet/{config,logs,backups,uploads}` ada (chmod 700)
- [ ] File `/home/jabnet/private/fiber-jabnet/config/.env` terisi (chmod 600)
- [ ] Setup Node.js App created (Application URL = `workspace.jabnet.id`, startup file = `dist/index.mjs`)
- [ ] Git Version Control clone ke `~/repositories/fiber-jabnet`, branch `deploy`
- [ ] `npm install --production` di app root via cPanel Node.js virtualenv
- [ ] `npx drizzle-kit push` jalankan (creates schema di MySQL)
- [ ] `data.db` dari prod existing di-upload ke `~/private/fiber-jabnet/backups/`
- [ ] `node tools/migrate-sqlite-to-mysql.mjs --src ~/private/fiber-jabnet/backups/data.db --dst-from-env` selesai
- [ ] Node.js App di-Restart
- [ ] `curl -I https://workspace.jabnet.id/api/auth/me` → 401 (bukan 500)

---

## Detail Per Langkah

### A. Subdomain

cPanel → Domains → Create Subdomain
- Domain: `workspace.jabnet.id`
- Document Root: kosongkan / default. (Node.js App akan handle, Apache jadi proxy via Passenger.)
- Centang AutoSSL.

### B. MySQL Database

cPanel → MySQL Databases
- DB `jabnet_fiber` confirmed sudah dibuat.
- Add User → password kuat, simpan untuk `.env`
- Add User to Database → centang **ALL PRIVILEGES** (butuh CREATE/ALTER untuk `drizzle-kit push`).
- (Opsional) phpMyAdmin → Operations → Collation: `utf8mb4_unicode_ci`.

### C. SSH Deploy Key

**Generate di cPanel:**
1. SSH Access → Manage SSH Keys → Generate New Key
2. Name: `fiber-jabnet-deploy`, Type: ED25519, Passphrase: **kosong** (Git VC butuh non-interactive)
3. View/Download Public Key → copy contents

**Daftarkan di GitHub:**
1. Repo → Settings → Deploy keys → Add deploy key
2. Title: `cPanel fiber-jabnet`
3. Paste public key
4. **JANGAN** centang "Allow write access"
5. Add key

**Test (di cPanel Terminal atau SSH):**
```bash
ssh -T git@github.com
# Accept fingerprint, expect: "Hi <repo-user>! You've successfully authenticated..."
```

### D. Node.js App

cPanel → Software → Setup Node.js App → Create Application:
- Node.js version: **20.x**
- Application mode: **Production**
- Application root: `repositories/fiber-jabnet`
- Application URL: `workspace.jabnet.id`
- Application startup file: `dist/index.mjs`
- Environment variables (klik "Add Variable" untuk masing-masing):
  - `NODE_ENV` = `production`
  - `JABNET_PRIVATE_ROOT` = `/home/jabnet/private/fiber-jabnet`

**Penting:** klik **Create** tapi JANGAN klik "Run NPM Install" dulu - repo belum di-clone.

Catat juga "Enter to the virtual environment" command yang muncul di UI - bentuknya seperti:
```bash
source /home/jabnet/nodevenv/repositories/fiber-jabnet/20/bin/activate && cd /home/jabnet/repositories/fiber-jabnet
```
Simpan command ini, dipakai untuk semua command Node berikutnya.

### E. Git Version Control

cPanel → Files → Git Version Control → Create:
- Clone URL: `git@github.com:<owner>/<repo>.git` (SSH form, BUKAN HTTPS)
- Repository Path: `/home/jabnet/repositories/fiber-jabnet`
- Branch: **`deploy`** ← orphan branch, di-tulis oleh GHA

Kalau branch `deploy` belum ada di GitHub (GHA belum pernah jalan), pakai `main` sementara, lalu ganti ke `deploy` setelah workflow pertama sukses.

### F. Private folder & `.env`

Lewat cPanel Terminal atau SSH:
```bash
chmod 711 /home/jabnet/repositories

mkdir -p /home/jabnet/private/fiber-jabnet/{config,logs,backups,uploads}
chmod 700 /home/jabnet/private /home/jabnet/private/fiber-jabnet
chmod 700 /home/jabnet/private/fiber-jabnet/{config,logs,backups,uploads}

# Edit .env (ganti placeholder dgn nilai dari step B + integrasi):
cat > /home/jabnet/private/fiber-jabnet/config/.env <<'EOF'
APP_URL=https://workspace.jabnet.id
PORT=3002
DB_HOST=localhost
DB_PORT=3306
DB_USER=jabnet_xxx       # ← dari MySQL Databases
DB_PASSWORD=xxx          # ← dari MySQL Databases
DB_NAME=jabnet_fiber
DB_POOL_LIMIT=10
GOOGLE_MAPS_API_KEY=     # ← copy dari prod existing kalau ada
COVERAGE_API_KEY=
SESSION_SECRET=          # ← `openssl rand -hex 32` generated
ADMIN_DEFAULT_PASSWORD=Admin@1234
# Workers default DISABLED - avoid dual-write dgn prod existing 103.194.46.164
WORKERS_ENABLED=false
BILLING_SYNC_ENABLED=false
TRAFFIC_SNAPSHOT_ENABLED=false
SLA_ESCALATION_ENABLED=false
CSAT_SCHEDULER_ENABLED=false
BOOST_EXPIRE_ENABLED=false
BROADCAST_WORKER_ENABLED=false
EOF

chmod 600 /home/jabnet/private/fiber-jabnet/config/.env
ls -la /home/jabnet/private/fiber-jabnet/
```

### G. Initial Deploy

**Push pertama dari laptop ke `main`:**
```bash
# Di laptop, pastikan branch main bersih:
git push origin main
```

→ GHA jalan otomatis → branch `deploy` muncul di GitHub.

**Di cPanel Git VC:**
- Klik "Update from Remote" → branch `deploy` pull ke `~/repositories/fiber-jabnet/`

**Install deps + create schema + migrate data:**
```bash
source /home/jabnet/nodevenv/repositories/fiber-jabnet/20/bin/activate && cd /home/jabnet/repositories/fiber-jabnet

# Install runtime deps
npm install --production

# Install drizzle-kit ad-hoc untuk push schema (one-time, not saved to package.json)
npm install --no-save drizzle-kit better-sqlite3

# Create MySQL schema dari shared/schema.ts
JABNET_PRIVATE_ROOT=/home/jabnet/private/fiber-jabnet npx drizzle-kit push

# Upload data.db dari laptop ke server (di laptop):
# rsync ./data.db jabnet:/home/jabnet/private/fiber-jabnet/backups/data.db

# Migrate data SQLite → MySQL
JABNET_PRIVATE_ROOT=/home/jabnet/private/fiber-jabnet \
  node tools/migrate-sqlite-to-mysql.mjs \
    --src /home/jabnet/private/fiber-jabnet/backups/data.db \
    --dst-from-env

# (Optional) re-run dengan --truncate kalau perlu reset & re-import
```

### H. Start App

cPanel → Setup Node.js App → klik app → **Restart Application**

Atau lewat SSH:
```bash
touch /home/jabnet/repositories/fiber-jabnet/tmp/restart.txt
```

### H.1 Backfill foto base64 → filesystem (one-time, idempotent)

Foto canvassing/bug/lead lama disimpan sebagai base64 di DB (kolom `photo_data`). Setelah app restart
yang pertama, schema sudah punya kolom `photo_path` dan table `odp_photos`. Jalankan backfill untuk
pindah base64 ke filesystem `~/private/fiber-jabnet/uploads/<mitra-slug>/<feature>/...`:

```bash
cd ~/repositories/fiber-jabnet
JABNET_PRIVATE_ROOT=/home/jabnet/private/fiber-jabnet \
  node tools/migrate-base64-to-fs.mjs --dry-run    # cek dulu

JABNET_PRIVATE_ROOT=/home/jabnet/private/fiber-jabnet \
  node tools/migrate-base64-to-fs.mjs              # eksekusi

# Verifikasi:
du -sh /home/jabnet/private/fiber-jabnet/uploads/
ls /home/jabnet/private/fiber-jabnet/uploads/jabnet/canvassing/
```

Script idempotent - aman re-run, hanya proses row yang belum punya `photo_path`.

Setelah 24-48 jam observasi (verify foto-foto lama masih render di UI), DROP kolom `photo_data`:
```sql
ALTER TABLE canvassing_logs DROP COLUMN photo_data;
ALTER TABLE bug_reports     DROP COLUMN photo_data;
ALTER TABLE lead_activities DROP COLUMN photo_data;
```

### I. Verification

```bash
# Health (kalau endpoint /api/health ada)
curl -I https://workspace.jabnet.id/

# Auth ping
curl -I https://workspace.jabnet.id/api/auth/me
# Expect: 401 (belum login) - kalau 500, ada error, cek logs.

# Cek logs aplikasi:
# cPanel UI → Setup Node.js App → klik app → "View Application Log"
# atau: tail -f ~/repositories/fiber-jabnet/tmp/stdout.log
```

---

##  Phase 1B - Storage.ts Refactor (Belum Dikerjakan)

Sebelum aplikasi bisa benar-benar serve traffic, file `server/storage.ts` butuh refactor:

| Item | Count | Status |
|---|---|---|
| `.returning()` calls (tidak supported di MySQL Drizzle) | 114 |  TODO |
| Raw `sqlite.prepare/exec/transaction` calls | 89 |  TODO (akan throw runtime error) |
| Constructor bootstrap (CREATE TABLE, ALTER, seed) | 1402 lines |  removed (Phase 1A) |
| Schema port (`shared/schema.ts`) | 65 tables |  done (Phase 1A) |
| Migration script | - |  done (Phase 1A) |
| Deploy infrastructure (GHA, env, docs) | - |  done (Phase 1A) |

**Pattern refactor `.returning()`:**

```ts
// Sebelum (SQLite, tidak jalan di MySQL):
const [row] = await this.db.insert(pops).values(data).returning();
return row;

// Sesudah (MySQL):
const result = await this.db.insert(pops).values(data);
const insertId = (result[0] as any).insertId;
const [row] = await this.db.select().from(pops).where(eq(pops.id, insertId));
return row!;
```

Estimasi effort Phase 1B: **14-19 jam fokus engineering**.

---

## Daily Workflow (setelah setup beres)

```
laptop                       GitHub                cPanel
------                       ------                ------
edit code
git push origin main  --►    GHA build
                             (npm ci, build)
                             force-push → deploy --► branch updated
                                                         |
                                                         ▼
                                  ◄-- klik "Update from Remote" di Git VC
                                                         |
                                                         ▼
                                  ◄-- klik Restart Application di Node.js App
                                                         |
                                                         ▼
                                                    site live
```

Total manual step: 3 klik (Update + Restart + verify).

**Optional auto-pull cron** (di cPanel → Cron Jobs):
```
*/5 * * * * cd ~/repositories/fiber-jabnet && /usr/local/cpanel/3rdparty/bin/git fetch origin deploy && /usr/local/cpanel/3rdparty/bin/git reset --hard origin/deploy && touch tmp/restart.txt > ~/private/fiber-jabnet/logs/cron-deploy.log 2>&1
```

---

## Troubleshooting

| Symptom | Cek |
|---|---|
| 500 saat `/api/*` | View Application Log → biasanya MySQL connection (cek `.env` DB_*) atau `.returning()` runtime error (Phase 1B belum dikerjakan) |
| 404 saat root | Apache → Setup Node.js App belum di-Create atau URL salah |
| `Cannot find module 'mysql2'` | `npm install --production` belum dijalankan |
| `Access denied for user` | MySQL user privilege bukan ALL - cek phpMyAdmin |
| GHA build fail | Cek Actions tab di GitHub, paling sering: lockfile drift atau env var hilang |
| Git VC pull fail | Deploy key SSH tidak terdaftar / typo URL clone (pakai SSH bukan HTTPS) |

---

## Backup

- **DB harian**: cron `mysqldump --single-transaction jabnet_fiber | gzip > ~/private/fiber-jabnet/backups/db-$(date +\%F).sql.gz`
- **Backup `.env`**: ikut backup `~/private/` (file kecil, low-priority)
- **Keep retention**: 7 daily + 4 weekly + 6 monthly dengan `find ... -mtime +N -delete` rule.

```
0 2 * * * mysqldump --single-transaction --no-tablespaces -u jabnet_xxx -pXXX jabnet_fiber | gzip > ~/private/fiber-jabnet/backups/db-$(date +\%F).sql.gz && find ~/private/fiber-jabnet/backups/ -name 'db-*.sql.gz' -mtime +30 -delete
```

---

##  Domain Switch: fiber.jabnet.id → workspace.jabnet.id (domain-only)

Ganti URL public tanpa rename dir/repo. Internal naming tetap `fiber-jabnet`. Disrupsi: **~5 menit**
(app restart). Aman dilakukan saat traffic rendah.

### Prasyarat (sudah selesai)
-  DNS A record `workspace.jabnet.id` → IP cPanel
-  Subdomain `workspace.jabnet.id` dibuat di cPanel (apapun docroot-nya - akan di-override
  saat re-bind Node.js App di Step 1)

### Step 1 - Re-bind Node.js App ke domain baru

cPanel UI: **Setup Node.js App** → klik app fiber-jabnet → **Edit**:
- **Application URL**: ganti `fiber.jabnet.id` → `workspace.jabnet.id`
- **Application Root**: tetap `repositories/fiber-jabnet` (JANGAN diubah)
- **Application Mode**: tetap `production`
- **Save** → cPanel auto-write Passenger `.htaccess` ke docroot Subdomain workspace baru
- **Restart**

> Catatan: kalau Subdomain workspace.jabnet.id yang sudah dibuat punya docroot `repositories/workspace.jabnet.id` (folder kosong), cPanel umumnya akan **update docroot Subdomain** otomatis mengikuti Application Root saat re-bind. Kalau tidak (tergantung versi cPanel), buka **Domains** → edit Subdomain `workspace.jabnet.id` → ganti Document Root jadi `repositories/fiber-jabnet`. Folder kosong `repositories/workspace.jabnet.id` boleh dihapus setelahnya: `rmdir ~/repositories/workspace.jabnet.id`.

### Step 2 - Update `APP_URL` di `.env`

```bash
ssh -i ~/.ssh/access-jabnet-cpanel jabnet@103.194.47.165
nano /home/jabnet/private/fiber-jabnet/config/.env
```

Ubah satu baris:
```
# Sebelum
APP_URL=https://fiber.jabnet.id
# Sesudah
APP_URL=https://workspace.jabnet.id
```

Save (Ctrl+O, Enter, Ctrl+X). Permission tetap `chmod 600`.

Restart Node.js App lagi supaya env baru ke-load:
```bash
touch /home/jabnet/repositories/fiber-jabnet/tmp/restart.txt
```

### Step 3 - `.htaccess` 301 redirect dari fiber.jabnet.id

Kalau Subdomain `fiber.jabnet.id` masih ada di cPanel (untuk backward-compat bookmark / link lama):

Cek dulu docroot subdomain lama:
- cPanel UI: **Domains** → cari `fiber.jabnet.id` → catat **Document Root** (biasanya
  `repositories/fiber-jabnet` setelah Step 1 di-override ke workspace, jadi ini akan kosong / 404).

Buat / replace `.htaccess` di docroot tersebut:
```apache
RewriteEngine On
RewriteRule ^(.*)$ https://workspace.jabnet.id/$1 [R=301,L]
```

>  **HATI-HATI**: kalau docroot Subdomain `fiber.jabnet.id` MASIH sama dengan `repositories/fiber-jabnet` (Application Root), JANGAN tulis .htaccess redirect di situ - akan override Passenger directives + bikin app crash. Solusi: di cPanel UI ganti dulu Subdomain `fiber.jabnet.id`'s Document Root ke folder terpisah (mis. `~/public_html/fiber-redirect/`), buat folder itu, baru tulis `.htaccess` redirect di sana.

### Step 4 - Verifikasi

```bash
# Domain baru harus 200
curl -I https://workspace.jabnet.id/
curl -s https://workspace.jabnet.id/api/health | jq

# Domain lama harus 301
curl -I https://fiber.jabnet.id/login
# Expect: 301 → Location: https://workspace.jabnet.id/login
```

Di browser: buka `https://workspace.jabnet.id/login` → login → cek dashboard, /map, /odps (foto baru
masih jalan karena foto disimpan path relatif `jabnet/canvassing/...`, bukan absolute URL).

### Step 5 - Update integrasi external yang point ke URL lama

| System | Update |
|---|---|
| **Google Maps API key** | GCP Console → Credentials → tambah `*.workspace.jabnet.id/*` di HTTP referrer whitelist (keep fiber.* selama redirect masih aktif) |
| **Cron keep-alive** | cPanel Cron Jobs → ganti `curl -s https://fiber.jabnet.id/api/health ...` → `workspace.jabnet.id` |
| **Telegram bot webhook** | `setWebhook` ke URL baru kalau ada |
| **Chatwoot webhook** | URL ke `/api/integrations/chatwoot/webhook` di workspace.* |
| **Customer portal banner / WA template** | Update link manual (DB `app_settings.customer_portal_url` kalau di-set) |

### Catatan untuk user

- **Login session akan reset.** Cookie `ftth_session` bound ke hostname; user yang sedang login di
  fiber.jabnet.id harus login ulang di workspace.jabnet.id. Sudah expected.
- **DB + foto tidak terdampak.** DB path-agnostic, foto path relatif. Nothing to migrate.
- **Rollback** (kalau perlu dalam 1 jam): cPanel UI → Setup Node.js App → Edit → Application URL
  balik ke `fiber.jabnet.id` → Save → Restart. Edit `.env` APP_URL balik ke fiber. Hapus
  `.htaccess` redirect.

### Sunset old subdomain (1-2 minggu kemudian)

Setelah confirm tidak ada complain + 301 redirect log <5% peak traffic:
1. cPanel **Domains** → klik `fiber.jabnet.id` → **Remove**
2. DNS registrar: hapus A record `fiber.jabnet.id`
3. (Tidak perlu code change - internal naming `fiber-jabnet` di-keep selamanya, atau ganti
   nanti via runbook terpisah kalau benar-benar diperlukan)

