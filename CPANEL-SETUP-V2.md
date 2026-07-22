# cPanel Setup - fiber-jabnet-V2 @ workspace-dev-v2.jabnet.id

Runbook setup instance **V2** (sementara) di cPanel user `jabnet`.
Pola umum: [CPANEL-CONVENTIONS.md](CPANEL-CONVENTIONS.md) · Instance prod: [CPANEL-SETUP.md](CPANEL-SETUP.md).

> **Instance ini adalah yang KETIGA** di server yang sama. Yang sudah ada:
>
> | Instance | App dir | DB | Domain |
> |---|---|---|---|
> | Produksi | `~/repositories/fiber-jabnet` | `jabnet_fiber` | `workspace.jabnet.id` |
> | Dev lama | `~/dev-fiber-jabnet` | `jabnet_fiber_dev` | (existing) |
> | **V2 (ini)** | `~/repositories/fiber-jabnet-V2` | `jabnet_fiber_v2_dev` | `workspace-dev-v2.jabnet.id` |
>
> Ketiganya berbagi satu server dan satu MySQL. **Isolasi DB dan worker adalah hal
> paling kritis di dokumen ini** - lihat bagian "Aturan keras" di bawah.

---

## Ringkasan Konvensi Instance Ini

| Item | Value |
|---|---|
| **Project slug** | `fiber-jabnet-V2` |
| **Subdomain** | `workspace-dev-v2.jabnet.id` |
| **Repository path** | `/home/jabnet/repositories/fiber-jabnet-V2` |
| **Private root** | `/home/jabnet/private/fiber-jabnet-V2` |
| **MySQL DB** | `jabnet_fiber_v2_dev` (dibuat baru, kosong) |
| **Branch deploy** | `deploy-dev` (orphan, ditulis GHA dari branch `dev`) |
| **Source branch** | `dev` (push ke `dev` memicu build) |
| **Node version** | 20.x |
| **Entry file** | `dist/index.mjs` |
| **Repo GitHub** | `git@github.com:kanggalon710/workspace.git` |

### Kenapa DB bernama `..._v2_dev` dan bukan `..._v2`

`server/dev-db-sync.ts:24` mensyaratkan `DB_NAME` berakhiran `_dev` sebelum fitur
"Tarik Data dari Production" (tombol di UI + `POST /api/dev/db-sync`) mau aktif.
Dengan nama `jabnet_fiber_v2_dev`, instance V2 tetap terisolasi penuh dari prod
**dan** bisa menarik salinan data prod sesuai kebutuhan. Kalau dinamai
`jabnet_fiber_v2` saja, tombol itu mati permanen.

---

## Checklist Setup

- [ ] Subdomain `workspace-dev-v2.jabnet.id` dibuat (AutoSSL on)
- [ ] DNS A record `workspace-dev-v2.jabnet.id` -> IP cPanel `103.194.47.165`
- [ ] MySQL DB `jabnet_fiber_v2_dev` + user dengan ALL PRIVILEGES
- [ ] SSH deploy key cPanel sudah terdaftar di repo (kemungkinan besar sudah - lihat step C)
- [ ] `chmod 711 /home/jabnet/repositories`
- [ ] Folder `/home/jabnet/private/fiber-jabnet-V2/{config,logs,backups,uploads}` (chmod 700)
- [ ] File `.env` terisi (chmod 600) - **semua worker `false`**
- [ ] Setup Node.js App dibuat (URL `workspace-dev-v2.jabnet.id`, startup `dist/index.mjs`)
- [ ] Git VC clone ke `~/repositories/fiber-jabnet-V2`, branch **`deploy-dev`**
- [ ] `npm install --production`
- [ ] `npx drizzle-kit push` (bikin schema di DB kosong)
- [ ] Restart Node.js App
- [ ] `curl -sI https://workspace-dev-v2.jabnet.id/api/health` -> 200

---

## Detail Per Langkah

### A. DNS + Subdomain

1. Di registrar/DNS: A record `workspace-dev-v2.jabnet.id` -> `103.194.47.165`.
   Tunggu propagasi (`dig +short workspace-dev-v2.jabnet.id`).
2. cPanel -> **Domains** -> Create Subdomain
   - Domain: `workspace-dev-v2.jabnet.id`
   - Document Root: biarkan default. Passenger yang akan handle setelah Node.js App dibuat.
   - Centang **AutoSSL** (tunggu sertifikat terbit sebelum tes HTTPS).

### B. MySQL Database

cPanel -> **MySQL Databases**

1. Create New Database: isi `fiber_v2_dev` -> cPanel otomatis jadikan `jabnet_fiber_v2_dev`.
2. Add New User: mis. `jabnet_v2_user`, password kuat (simpan untuk `.env`).
3. Add User To Database -> centang **ALL PRIVILEGES**
   (butuh CREATE/ALTER untuk `drizzle-kit push`).
4. Opsional: phpMyAdmin -> Operations -> Collation `utf8mb4_unicode_ci`.

> Boleh juga pakai user prod `jabnet_crm_user` supaya tidak menambah kredensial baru,
> asal user itu di-attach ke DB `jabnet_fiber_v2_dev`. User terpisah lebih aman
> (kalau kredensial V2 bocor, DB prod tidak ikut terbuka).

### C. SSH Deploy Key

Instance V2 meng-clone **repo GitHub yang sama** dengan prod
(`kanggalon710/workspace`). Deploy key GitHub berlaku per-repo, dan kunci SSH cPanel
adalah milik server (bukan per-folder) - jadi kalau prod sudah bisa pull, V2 juga bisa
tanpa mendaftarkan kunci baru.

Verifikasi cepat lewat cPanel Terminal:

```bash
ssh -T git@github.com
# Harapan: "Hi kanggalon710/workspace! You've successfully authenticated,
#           but GitHub does not provide shell access."
```

Kalau gagal (`Permission denied (publickey)`), baru buat kunci baru:
cPanel -> **SSH Access** -> Manage SSH Keys -> Generate New Key
(Type ED25519, **passphrase kosong** - Git VC butuh non-interactive) -> View/Download
Public Key -> daftarkan di GitHub repo -> Settings -> Deploy keys -> Add deploy key
(**jangan** centang "Allow write access").

### D. Setup Node.js App

cPanel -> **Software** -> Setup Node.js App -> Create Application:

- Node.js version: **20.x**
- Application mode: **Production**
- Application root: `repositories/fiber-jabnet-V2`
- Application URL: `workspace-dev-v2.jabnet.id`
- Application startup file: `dist/index.mjs`
- Environment variables:
  - `NODE_ENV` = `production`
  - `JABNET_PRIVATE_ROOT` = `/home/jabnet/private/fiber-jabnet-V2`

Klik **Create**, tapi **jangan** klik "Run NPM Install" dulu - repo belum di-clone.

Catat command virtualenv yang muncul, bentuknya:

```bash
source /home/jabnet/nodevenv/repositories/fiber-jabnet-V2/20/bin/activate && cd /home/jabnet/repositories/fiber-jabnet-V2
```

> **Jangan set `PORT` di environment variables.** Passenger meng-inject `PORT`
> sendiri; `server/index.ts:38` membacanya (`process.env.PORT || 3002`). Kalau
> di-hardcode, dua instance bisa rebutan port yang sama.

### E. Git Version Control

cPanel -> **Files** -> Git Version Control -> Create:

- Clone URL: `git@github.com:kanggalon710/workspace.git` (SSH, bukan HTTPS)
- Repository Path: `/home/jabnet/repositories/fiber-jabnet-V2`
- Branch: **`deploy-dev`**

Branch `deploy-dev` sudah ada di GitHub (dibuat GHA), jadi bisa langsung dipilih.

### F. Private folder & `.env`

Lewat cPanel Terminal atau SSH:

```bash
chmod 711 /home/jabnet/repositories

mkdir -p /home/jabnet/private/fiber-jabnet-V2/{config,logs,backups,uploads}
chmod 700 /home/jabnet/private /home/jabnet/private/fiber-jabnet-V2
chmod 700 /home/jabnet/private/fiber-jabnet-V2/{config,logs,backups,uploads}
```

Buat `.env` (ganti `<...>` dengan nilai dari step B):

```bash
cat > /home/jabnet/private/fiber-jabnet-V2/config/.env <<'EOF'
APP_URL=https://workspace-dev-v2.jabnet.id
APP_PUBLIC_URL=https://workspace-dev-v2.jabnet.id

# MySQL - pakai socket (workaround mysql2 TCP handshake hang di MySQL 8.0.42-cll-lve)
DB_SOCKET=/var/lib/mysql/mysql.sock
DB_USER=<jabnet_v2_user>
DB_PASSWORD=<password_dari_step_B>
DB_NAME=jabnet_fiber_v2_dev
DB_POOL_LIMIT=5

# Fitur "Tarik Data dari Production" (aktif karena DB_NAME berakhiran _dev)
DEV_DB_SYNC_ENABLED=true
PROD_DB_NAME=jabnet_fiber

# Auth
SESSION_SECRET=<hasil: openssl rand -hex 32>
ADMIN_DEFAULT_PASSWORD=Admin@1234

# Billing API - boleh dikosongkan selama sync dimatikan
BILLING_API_TOKEN=
BILLING_API_URL=https://billing.jabnet.id/api/pelanggan/list_pelanggan

# Foto disimpan di private root instance ini (default: $JABNET_PRIVATE_ROOT/uploads)
JABNET_UPLOAD_ROOT=

# WORKER - WAJIB SEMUA false. Lihat "Aturan keras" di bawah.
WORKERS_ENABLED=false
BILLING_SYNC_ENABLED=false
TRAFFIC_SNAPSHOT_ENABLED=false
SLA_ESCALATION_ENABLED=false
CSAT_SCHEDULER_ENABLED=false
BOOST_EXPIRE_ENABLED=false
BROADCAST_WORKER_ENABLED=false
TEAMSPACE_WORKER_ENABLED=false

PIPELINE_TICK_SECRET=
EOF

chmod 600 /home/jabnet/private/fiber-jabnet-V2/config/.env
ls -la /home/jabnet/private/fiber-jabnet-V2/config/
```

Generate `SESSION_SECRET`:

```bash
openssl rand -hex 32
```

### G. Install deps + buat schema

Di cPanel Git VC klik **Update from Remote** dulu (menarik `deploy-dev` ke app dir), lalu:

```bash
source /home/jabnet/nodevenv/repositories/fiber-jabnet-V2/20/bin/activate && cd /home/jabnet/repositories/fiber-jabnet-V2

npm install --production

# drizzle-kit ad-hoc, tidak disimpan ke package.json
npm install --no-save drizzle-kit

# Bikin 65+ tabel di DB kosong dari shared/schema.ts
JABNET_PRIVATE_ROOT=/home/jabnet/private/fiber-jabnet-V2 npx drizzle-kit push
```

> Branch `deploy-dev` berisi `dist/` siap pakai + `package.json` + `tools/`, tapi
> **tidak** berisi `shared/schema.ts`. Kalau `drizzle-kit push` mengeluh schema tidak
> ketemu, jalankan dari mesin lokal dengan `.env` yang menunjuk ke DB V2, atau clone
> branch `dev` ke folder sementara di server khusus untuk push schema:
> ```bash
> git clone -b dev --depth 1 git@github.com:kanggalon710/workspace.git /tmp/v2-schema
> cd /tmp/v2-schema && npm install --no-save drizzle-kit drizzle-orm dotenv
> JABNET_PRIVATE_ROOT=/home/jabnet/private/fiber-jabnet-V2 npx drizzle-kit push
> rm -rf /tmp/v2-schema
> ```

### H. Start

cPanel -> Setup Node.js App -> klik app V2 -> **Restart Application**

Atau: `touch /home/jabnet/repositories/fiber-jabnet-V2/tmp/restart.txt`

Saat start pertama dengan DB kosong, aplikasi otomatis menjalankan migrasi startup
idempotent + `seedAdminIfNeeded` -> user `admin` / `Admin@1234`.

### I. Verifikasi

```bash
curl -sI https://workspace-dev-v2.jabnet.id/api/health          # 200
curl -s  https://workspace-dev-v2.jabnet.id/api/health | head   # {"ok":true,...}
curl -sI https://workspace-dev-v2.jabnet.id/api/auth/me         # 401, BUKAN 500
```

Cek instance ini benar-benar menunjuk DB sendiri (bukan prod):

```bash
mysql -u <jabnet_v2_user> -p -e "SELECT COUNT(*) FROM jabnet_fiber_v2_dev.users;"
```

Log: cPanel -> Setup Node.js App -> View Application Log, atau
`tail -f ~/repositories/fiber-jabnet-V2/tmp/stdout.log`

Terakhir: login di browser -> ganti password admin default.

---

## Aturan keras untuk instance V2

1. **Semua worker WAJIB `false`.** Prod, dev lama, dan V2 berbicara ke layanan
   eksternal yang sama (MikroTik, billing.jabnet.id, MPWA WhatsApp, GenieACS).
   Kalau worker V2 hidup, dia akan ikut mengubah profil isolir pelanggan asli,
   menembak WhatsApp ke pelanggan asli, dan menulis ganda ke billing. Ini efek ke
   dunia nyata, bukan sekadar data uji.
2. **Jangan arahkan `DB_NAME` ke `jabnet_fiber`.** Itu DB produksi yang sedang dipakai.
3. **Kredensial integrasi tidak ada di `.env`.** Sejak versi multi-tenant, Google Maps
   key, MPWA token, GenieACS, billing reseller id, dsb. disimpan di tabel
   `mitra_integrations` dan diatur lewat UI `/integrations`. DB V2 yang baru berarti
   semua integrasi kosong - isi manual, atau tarik dari prod lewat tombol
   "Tarik Data dari Production".
4. **Google Maps API key** perlu whitelist referrer baru di GCP Console:
   tambahkan `*.workspace-dev-v2.jabnet.id/*`, kalau tidak peta blank.
5. **Jangan edit file langsung di `~/repositories/fiber-jabnet-V2`.** Branch `deploy-dev`
   orphan dan selalu di-`reset --hard` - editan lokal akan hilang saat pull berikutnya.

---

## Daily Workflow V2

```
laptop                      GitHub                  cPanel V2
------                      ------                  ---------
edit code
git push origin dev  --->   GHA build
                            force-push -> deploy-dev ---> branch updated
                                                              |
                            <--- klik "Update from Remote" di Git VC
                                                              |
                            <--- klik Restart di Node.js App
                                                              |
                                                         V2 live
```

Instance V2 juga bisa update sendiri lewat halaman `/integrations` (fitur self-update):
`server/self-update.ts` auto-deteksi branch aktif, jadi di V2 dia otomatis melacak
`deploy-dev` tanpa konfigurasi tambahan.

Opsional auto-pull tiap 5 menit (cPanel -> Cron Jobs):

```
*/5 * * * * cd ~/repositories/fiber-jabnet-V2 && /usr/local/cpanel/3rdparty/bin/git fetch origin deploy-dev && /usr/local/cpanel/3rdparty/bin/git reset --hard origin/deploy-dev && touch tmp/restart.txt >> ~/private/fiber-jabnet-V2/logs/cron-deploy.log 2>&1
```

Keep-alive supaya Passenger tidak idle spin-down:

```
*/4 * * * * curl -s https://workspace-dev-v2.jabnet.id/api/health > /dev/null 2>&1
```

---

## Troubleshooting

| Gejala | Cek |
|---|---|
| 500 di semua `/api/*` | View Application Log. Paling sering `.env` tidak terbaca -> pastikan `JABNET_PRIVATE_ROOT` di Node.js App env vars menunjuk `/home/jabnet/private/fiber-jabnet-V2` |
| `Access denied for user` | User MySQL belum di-attach ke `jabnet_fiber_v2_dev` dengan ALL PRIVILEGES |
| Connect MySQL menggantung lalu timeout | `DB_SOCKET` tidak di-set. Wajib socket di server ini, bukan TCP |
| `Cannot find module 'mysql2'` | `npm install --production` belum jalan di virtualenv Node 20 |
| 404 di root | Node.js App belum Create, atau Application URL salah |
| Git VC pull gagal | Clone URL pakai HTTPS (harus SSH), atau deploy key belum terdaftar |
| Peta blank | Referrer `workspace-dev-v2.jabnet.id` belum di-whitelist di GCP Console |
| Tombol "Tarik Data dari Production" tidak muncul | `DEV_DB_SYNC_ENABLED` bukan `"true"`, atau `DB_NAME` tidak berakhiran `_dev` (`server/dev-db-sync.ts:19-24`) |

---

## Membongkar instance V2 (kalau sudah tidak dipakai)

Karena ini instance sementara:

1. cPanel -> Setup Node.js App -> app V2 -> **Destroy**
2. cPanel -> Git Version Control -> hapus entry V2
3. cPanel -> Domains -> Remove `workspace-dev-v2.jabnet.id`; hapus A record di DNS
4. cPanel -> MySQL Databases -> drop `jabnet_fiber_v2_dev` (backup dulu kalau perlu)
5. `rm -rf ~/repositories/fiber-jabnet-V2 ~/private/fiber-jabnet-V2`
6. Hapus cron auto-pull + keep-alive milik V2
