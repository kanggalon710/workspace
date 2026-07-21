# Development Environment Setup - `dev.workspace.jabnet.id`

> **Goal**: Domain dev terpisah (`dev.workspace.jabnet.id`) dengan DB sendiri, di-mirror dari prod tiap 24 jam. Testing/experiment bebas - semua perubahan dev di-reset ke prod state setiap jam 02:00 WIB.

## Arsitektur

```
PROD (workspace.jabnet.id)              DEV (dev.workspace.jabnet.id)
+- App: /home/jabnet/fiber-jabnet/   +- App: /home/jabnet/dev-fiber-jabnet/
+- DB:  jabnet_fiber                 +- DB:  jabnet_fiber_dev
+- Env: /home/jabnet/private/        +- Env: /home/jabnet/private/
|       fiber-jabnet/config/.env     |       fiber-jabnet-dev/config/.env
+- Uploads: /home/jabnet/private/    +- Uploads: SYMLINK → prod uploads/
|           fiber-jabnet/uploads/    |           (read-only via env flag)
+- Branch: main                      +- Branch: dev
+- MPWA + billing: ENABLED           +- MPWA + billing: DISABLED (env flag)
```

**Daily flow (02:00 WIB):**
1. cron jalan `mirror-prod-to-dev.sh`
2. `mysqldump jabnet_fiber` → restore ke `jabnet_fiber_dev` (drop+recreate tables)
3. Touch `dev-fiber-jabnet/tmp/restart.txt` - Passenger reload dev app
4. Dev startup migrations jalan idempotent - apply schema diff kalau dev branch punya kolom baru

**Workflow developer:**
- Push code ke `dev` branch → GHA build → cPanel dev repo `Update from Remote` → Restart
- Test di `dev.workspace.jabnet.id` bebas - DB akan reset 02:00 WIB besok
- Saat siap merge ke prod: `git checkout main && git merge dev && git push origin main` → cPanel prod update

---

## Phase 1: cPanel Infrastructure

### 1.1 Create Subdomain

cPanel → **Domains** → **Create A New Domain**:
- **Domain**: `dev.workspace.jabnet.id`
- **Document Root**: `/home/jabnet/dev-fiber-jabnet/public` (auto-suggest OK)
- **Share document root**: NO

AutoSSL akan auto-provision SSL untuk subdomain dalam ~5 menit. Verify via:
```bash
curl -I https://dev.workspace.jabnet.id  # expect TLS handshake OK
```

### 1.2 Create MySQL DB + grant existing user

cPanel → **MySQL Databases**:
- **Create New Database**: `jabnet_fiber_dev` (resolves jadi `jabnet_crm_user_jabnet_fiber_dev`)
- **Add User To Database**: pilih existing `jabnet_crm_user` → grant **ALL PRIVILEGES**

Verify via SSH (atau cPanel Terminal):
```bash
mysql -u jabnet_crm_user -p'Galon@12345' -e "SHOW DATABASES" | grep jabnet
# expect 2 row: jabnet_fiber, jabnet_fiber_dev
```

### 1.3 Create Dev App Directories

```bash
ssh -i ~/.ssh/access-jabnet-cpanel jabnet@103.194.47.165
mkdir -p ~/private/fiber-jabnet-dev/config
mkdir -p ~/dev-fiber-jabnet/tmp
mkdir -p ~/scripts
mkdir -p ~/logs
chmod 700 ~/private/fiber-jabnet-dev/config   # secret protect
```

### 1.4 Uploads Symlink (Read-Only via env flag)

Dev membaca foto dari prod uploads (symlink) - writes dicegah via `UPLOADS_READ_ONLY=true` env. Risk: kalau env flag dilupakan, dev upload bisa pollute prod folder. Code di `server/uploads.ts` enforce dengan throw error eksplisit.

```bash
ln -s /home/jabnet/private/fiber-jabnet/uploads /home/jabnet/private/fiber-jabnet-dev/uploads
ls -la ~/private/fiber-jabnet-dev/uploads  # expect: -> /home/jabnet/private/fiber-jabnet/uploads
```

---

## Phase 2: Git Branches + Code

### Branch Layout

| Branch | Source / Built | Purpose |
|---|---|---|
| `main` | source | Production source-of-truth (commit lewat PR dari `dev`) |
| `deploy` | built artifacts (orphan) | cPanel **prod** pull dari sini |
| `dev` (NEW) | source | Development integration branch |
| `deploy-dev` (NEW) | built artifacts (orphan) | cPanel **dev** pull dari sini |

GHA workflow `.github/workflows/build.yml` handle dual-target:
- Push `main` → build → force-push `deploy`
- Push `dev` → build → force-push `deploy-dev`

Backflow workflow `.github/workflows/backflow.yml` auto-open PR `main → dev` setiap kali ada commit di main yang belum ada di dev (hotfix backflow).

### 2.1 Create Dev Branch (di local)

```bash
cd /home/ygao-t580/Works/Jabnet/Website/ftth-tools
git checkout -b dev
git push -u origin dev
```

Setelah push pertama, GHA workflow auto-trigger build dan create branch `deploy-dev` di GitHub (orphan, built artifacts only).

### 2.2 cPanel Git Version Control - Clone Deploy-Dev Branch

cPanel → **Git Version Control** → **Create**:
- **Clone URL**: `git@github.com:Yoga723/ftth-tools.git` (atau HTTPS dengan PAT)
- **Repository Path**: `/home/jabnet/dev-fiber-jabnet`
- **Repository Name**: `ftth-tools-dev`
- **Branch**: `deploy-dev`  ← **bukan** `dev`. cPanel pull built artifacts, bukan source.

> **Note**: cPanel deploy keys harus diizinkan akses repo. Kalau pakai SSH, tambahkan `~/.ssh/id_rsa.pub` content cPanel ke GitHub repo `Deploy keys`.

### 2.3 Code Changes Sudah Ada di Branch

Branch `dev` sudah include 2 env-flag patches (sama dengan main saat ini):
- `MPWA_FORCE_DISABLED=true` → mpwa.ts:47 short-circuit `loadMpwaConfig()`
- `UPLOADS_READ_ONLY=true` → uploads.ts:saveBase64Photo + deletePhoto refuse

`BILLING_SYNC_ENABLED=false` sudah ada dari sebelumnya (server/index.ts:23).

---

## Phase 3: Node.js App Setup

### 3.1 cPanel Setup Node.js App

cPanel → **Setup Node.js App** → **Create Application**:
- **Node.js version**: 20+ (sama dengan prod)
- **Application mode**: Production
- **Application root**: `/home/jabnet/dev-fiber-jabnet`
- **Application URL**: `dev.workspace.jabnet.id`
- **Application startup file**: `dist/index.mjs`
- **Passenger port**: auto (cPanel pick available)

Pasca create, jalankan dari **Run NPM Install** atau via SSH:
```bash
cd ~/dev-fiber-jabnet
npm install --production=false   # devDeps for build
npm run build
```

### 3.2 Configure Dev .env

Edit `/home/jabnet/private/fiber-jabnet-dev/config/.env`:

```ini
# --- DB pointing ke dev DB ---
DB_HOST=localhost
DB_PORT=3306
DB_USER=jabnet_crm_user
DB_PASS=Galon@12345
DB_NAME=jabnet_fiber_dev
DB_SOCKET=/var/lib/mysql/mysql.sock

# --- Paths ---
JABNET_PRIVATE_ROOT=/home/jabnet/private/fiber-jabnet-dev
JABNET_UPLOAD_ROOT=/home/jabnet/private/fiber-jabnet-dev/uploads

# --- Session (BEDA dari prod supaya token tidak cross-pollute) ---
SESSION_SECRET=<generate-baru-via-openssl-rand-hex-32>

# --- Dev safety flags (CRITICAL) ---
MPWA_FORCE_DISABLED=true
BILLING_SYNC_ENABLED=false
UPLOADS_READ_ONLY=true

# --- Other ---
ADMIN_DEFAULT_PASSWORD=Galon@12345
NODE_ENV=production
```

Generate session secret baru:
```bash
openssl rand -hex 32
```

### 3.3 Initial DB Sync (One-Shot)

Sebelum first start, copy prod ke dev biar ada data realistic:
```bash
bash ~/scripts/mirror-prod-to-dev.sh
# (atau jalankan manual sekali - script ada di Phase 4)
```

### 3.4 Start Dev App

cPanel **Setup Node.js App** → **Start App** (atau **Restart App** kalau sudah running).

Cek startup log:
```bash
tail -50 ~/logs/nodejs/dev-fiber-jabnet/*.log
```

Expected:
- `[migration] user_mitras.role_id column exists ✓`
- `[seed-roles] Platform owners (System-Admin di mitra=1): 4`
- `[Startup] billing sync worker disabled via env (BILLING_SYNC_ENABLED=false)`

Verify HTTP:
```bash
curl -I https://dev.workspace.jabnet.id/api/health
# expect HTTP/2 200, body {"ok":true}
```

---

## Phase 4: Daily Mirror Cron

### 4.1 Install Mirror Script

Copy script dari repo ke server scripts dir:
```bash
ssh jabnet@103.194.47.165
cd ~/dev-fiber-jabnet
cp tools/mirror-prod-to-dev.sh ~/scripts/
chmod +x ~/scripts/mirror-prod-to-dev.sh
```

### 4.2 Test Manual Run

```bash
bash ~/scripts/mirror-prod-to-dev.sh
# expected:
# [2026-05-27 14:30:00] [mirror] START - jabnet_fiber → jabnet_fiber_dev
# [2026-05-27 14:30:08] [mirror] DONE - dev restart triggered
```

Cek dev DB punya tabel:
```bash
mysql -u jabnet_crm_user -p'Galon@12345' jabnet_fiber_dev -e "SHOW TABLES" | wc -l
# expect ~65 tables
```

### 4.3 Schedule cron

cPanel → **Cron Jobs** → **Add New Cron Job**:
- **Common Settings**: Once Per Day (0 2 * * *)
- **Command**: `/bin/bash /home/jabnet/scripts/mirror-prod-to-dev.sh >> /home/jabnet/logs/mirror.log 2>&1`

Atau via SSH:
```bash
(crontab -l 2>/dev/null; echo "0 2 * * * /bin/bash /home/jabnet/scripts/mirror-prod-to-dev.sh >> /home/jabnet/logs/mirror.log 2>&1") | crontab -
crontab -l   # verify
```

### 4.4 Monitor

Esok pagi cek log:
```bash
tail -20 ~/logs/mirror.log
```

Kalau ada error, biasanya:
- DB_PASS tidak terbaca dari .env → fix path
- Dev DB tidak existed → re-create di cPanel
- Disk full → cek `df -h ~/`

---

## Phase 5: Workflow Developer

### 5.1 Iterate di Branch Dev

```bash
# Local
git checkout dev
# bikin perubahan, commit
git push origin dev
```

Push ke `dev` auto-trigger GHA build → force-push artifacts ke `deploy-dev`. Selesai dalam ~3-5 menit.

### 5.2 Deploy ke cPanel Dev

cPanel → **Git Version Control** → repo `ftth-tools-dev` → **Manage** → **Pull or Deploy** tab → **Update from Remote**.

Setelah pull, restart app:
- **Setup Node.js App** → **Restart App**

Atau via SSH (lebih cepat - pull built artifacts langsung, no rebuild needed):
```bash
cd ~/dev-fiber-jabnet
git pull origin deploy-dev
# Kalau ada perubahan deps:
[ -f package-lock.json ] && npm install --production
touch tmp/restart.txt
```

> **Catatan**: cPanel dev pull dari `deploy-dev` (artifacts) bukan `dev` (source). Tidak perlu jalankan `npm run build` di server karena GHA udah build.

### 5.3 Promote Dev → Prod (Setelah Validated)

Lewat **Pull Request** untuk dapat checkpoint review + build verify di GHA sebelum production update.

```bash
# Local - pastikan dev clean dan up-to-date
git checkout dev
git push origin dev

# Buka PR via gh CLI atau GitHub UI:
gh pr create --base main --head dev --title "Release: <ringkas perubahan>" --body "..."
```

Setelah review + merge PR di GitHub UI:
1. GHA auto-trigger build di `main` → push artifacts ke `deploy`
2. cPanel **prod** repo (`ftth-tools` di `/home/jabnet/repositories/fiber-jabnet`): **Git Version Control → Update from Remote** → **Setup Node.js App → Restart**
3. Verify `curl https://workspace.jabnet.id/api/health`

### 5.4 Hotfix Langsung ke Prod (Edge Case)

Kalau ada emergency fix yang harus langsung ke prod tanpa lewat dev:

```bash
git checkout main
# bikin fix, commit
git push origin main
```

GHA auto-build prod **dan** auto-buka PR backflow `main → dev` (lewat `.github/workflows/backflow.yml`). Merge PR backflow itu di GitHub UI supaya dev tidak drift.

---

## Edge Cases + Troubleshooting

### Schema Drift: Dev Branch Ada Kolom Baru, Prod Belum

Setelah mirror jalan (data prod restore ke dev), dev startup migrations apply schema diff via `IF NOT EXISTS` / `INFORMATION_SCHEMA` checks. Idempotent - no error.

Example: kalau dev branch punya `ALTER TABLE customers ADD COLUMN credit_score INT`, setelah mirror table kembali tanpa kolom itu, dev app restart akan re-add kolomnya. Data hilang (semua row credit_score jadi NULL) tapi schema benar.

**Implikasi**: kalau testing fitur yang butuh kolom baru + data isi kolom itu, data akan reset jam 02:00 WIB. Re-seed via SQL script kalau perlu.

### Dev DB Sync Gagal

Mirror cron jalan as user `jabnet`. Kalau script error, cek:
```bash
tail -50 ~/logs/mirror.log
```

Common issues:
- `Access denied` → password salah di .env, atau user `jabnet_crm_user` belum di-grant ke `jabnet_fiber_dev`
- `Unknown database` → DB belum dibuat
- `Lock wait timeout` → prod DB sibuk; coba shift cron ke jam lebih malam

### Dev Subdomain Tidak Resolve

DNS propagation cPanel biasanya instant kalau pakai cPanel DNS. Verify:
```bash
dig dev.workspace.jabnet.id +short
# expect IP cPanel server (103.194.47.165)
```

Kalau pakai external DNS (e.g., Cloudflare), tambahkan A record manual.

### AutoSSL Belum Provision Cert

Tunggu 5-10 menit. Force via cPanel → **SSL/TLS Status** → check subdomain → **Run AutoSSL**.

### Dev Upload Tetap Masuk ke Prod Folder

Kalau `UPLOADS_READ_ONLY=true` lupa di-set, dev write akan masuk ke prod (karena symlink). Mitigation:
- Cek symlink: `readlink ~/private/fiber-jabnet-dev/uploads`
- Verify env via dev app: `curl https://dev.workspace.jabnet.id/api/health` (kalau perlu, tambahkan field `uploadsReadOnly` ke health endpoint untuk visibility)

Kalau sudah terlanjur write polluting prod, identify file via `find ~/private/fiber-jabnet/uploads -newer /tmp/start-time` dan delete manual.

### Force-Mirror Sebelum 02:00 WIB

Manual trigger anytime:
```bash
bash ~/scripts/mirror-prod-to-dev.sh
```

### Restore Prod Dari Dev (Reverse Direction)

**JANGAN**. Mirror script one-way (prod → dev). Kalau perlu copy data dari dev ke prod, dump explicit + selective restore - itu major operation yang wajib ada user explicit approval.

---

## Security Notes

- Dev DB punya copy real customer data (nama, alamat, phone) - treat sebagai sensitive sama dengan prod
- Akses dev URL: pertimbangkan IP allowlist via `.htaccess` di dev app root kalau perlu lebih ketat
- Session secret dev terpisah → token dev tidak valid di prod (good)
- MPWA + billing dimatikan via env → tidak ada outbound network call ke customer/billing system

---

## Quick Reference

| Action | Command |
|---|---|
| Manual mirror sekarang | `bash ~/scripts/mirror-prod-to-dev.sh` |
| Tail mirror log | `tail -20 ~/logs/mirror.log` |
| Restart dev app | `touch ~/dev-fiber-jabnet/tmp/restart.txt` |
| Cek cron schedule | `crontab -l` |
| Cek dev DB tabel count | `mysql ... -e "SHOW TABLES" jabnet_fiber_dev \| wc -l` |
| Login dev URL | https://dev.workspace.jabnet.id |
| Force re-build dev | `cd ~/dev-fiber-jabnet && npm run build && touch tmp/restart.txt` |
