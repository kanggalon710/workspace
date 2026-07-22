# cPanel Setup - fiber-jabnet-V2

Runbook setup instance **V2** di cPanel user `jabnet`.
Pola umum: [CPANEL-CONVENTIONS.md](CPANEL-CONVENTIONS.md) · Instance prod lama: [CPANEL-SETUP.md](CPANEL-SETUP.md).

---

## Peta Instance

V2 punya dua instance yang mengikuti dua branch deploy:

| Instance | Branch deploy | Source branch | Database | Domain | App dir |
|---|---|---|---|---|---|
| **V2 dev** (LIVE) | `deploy-dev` | `dev` | `jabnet_fiber_v2_dev` | `workspace-dev-v2.jabnet.id` | `~/repositories/workspace-dev` |
| **V2 main** (menyusul) | `deploy` | `main` | `jabnet_fiber_v2` | (belum ditentukan) | `~/repositories/workspace-main` |

> Slug yang dipakai di server adalah **`workspace-dev`** (bukan `fiber-jabnet-V2`).
> Private root: `/home/jabnet/private/workspace-dev`. Node.js virtualenv: **22.x**.

DB user untuk keduanya: **`jabnet_crm_user`** (user yang sama dengan prod - lihat
catatan keamanan di bawah).

Instance lain yang sudah jalan di server yang sama:

| Instance | App dir | DB | Domain |
|---|---|---|---|
| Produksi | `~/repositories/fiber-jabnet` | `jabnet_fiber` | `workspace.jabnet.id` |
| Dev lama | `~/dev-fiber-jabnet` | `jabnet_fiber_dev` | (existing) |

Total nanti ada empat aplikasi Node berbagi satu server dan satu MySQL.
**Isolasi DB dan worker adalah hal paling kritis di dokumen ini** - lihat "Aturan keras".

### Kenapa DB dev berakhiran `_dev`

`server/dev-db-sync.ts:19-24` baru mengaktifkan fitur "Tarik Data dari Production"
(tombol UI + `POST /api/dev/db-sync`) kalau tiga syarat terpenuhi:

1. `DEV_DB_SYNC_ENABLED === "true"`
2. `PROD_DB_NAME` di-set dan berbeda dari `DB_NAME`
3. `DB_NAME` berakhiran `_dev`

Karena itu instance dev pakai `jabnet_fiber_v2_dev`. Instance main pakai
`jabnet_fiber_v2` tanpa sufiks, sehingga fitur tarik-data otomatis mati di sana -
itu memang yang diinginkan untuk instance bergaya produksi.

### Catatan keamanan soal kredensial DB

Runbook ini sengaja **tidak** memuat password `jabnet_crm_user` secara literal.
Password aslinya hanya ditulis di `~/private/<slug>/config/.env` di server
(chmod 600, di luar webroot, tidak pernah masuk git).

Dua hal yang perlu Anda tahu:

1. Password user ini **sudah terlanjur ter-commit** di `CLAUDE.md` (blok "cPanel SSH")
   dan ikut tersimpan di riwayat git. Siapa pun yang punya akses repo bisa membacanya.
   Sebaiknya dirotasi, lalu `.env` di keempat instance di-update.
2. Memakai satu user MySQL (`jabnet_crm_user`) untuk prod + V2 berarti kalau
   kredensial itu bocor, DB produksi ikut terbuka. User terpisah per instance
   (mis. `jabnet_v2_user`) lebih aman, walau menambah satu kredensial untuk dikelola.

Keduanya bukan penghalang untuk lanjut - tapi keputusan sadar, bukan kelalaian.

---

## Checklist Setup (instance V2 dev)

- [ ] DNS A record `workspace-dev-v2.jabnet.id` -> `103.194.47.165`
- [ ] Subdomain `workspace-dev-v2.jabnet.id` dibuat (AutoSSL on)
- [ ] MySQL DB `jabnet_fiber_v2_dev` dibuat, `jabnet_crm_user` di-attach ALL PRIVILEGES
- [ ] SSH deploy key cPanel terdaftar di repo (kemungkinan sudah - lihat step C)
- [ ] `chmod 711 /home/jabnet/repositories`
- [ ] Folder `/home/jabnet/private/fiber-jabnet-V2/{config,logs,backups,uploads}` (chmod 700)
- [ ] File `.env` terisi (chmod 600) - **semua worker `false`**
- [ ] Setup Node.js App dibuat (URL `workspace-dev-v2.jabnet.id`, startup `dist/index.mjs`)
- [ ] Git VC clone ke `~/repositories/fiber-jabnet-V2`, branch **`deploy-dev`**
- [ ] `npm install --production`
- [ ] Schema dibuat: impor dump prod (lihat "Impor Data Produksi") ATAU `drizzle-kit push` untuk DB kosong
- [ ] Restart Node.js App
- [ ] `curl -sI https://workspace-dev-v2.jabnet.id/api/health` -> 200

---

## Detail Per Langkah

### A. DNS + Subdomain

1. A record `workspace-dev-v2.jabnet.id` -> `103.194.47.165`.

   > **Zona `jabnet.id` TIDAK dikelola dari cPanel.** Nameserver otoritatifnya
   > `ns1.jabnet.id` (**103.194.46.46**) dan `ns2.jabnet.id` (**103.194.46.253**) -
   > server lain, menjalankan PowerDNS. Mengedit DNS Zone Editor di cPanel `.47.165`
   > hanya mengubah salinan lokal yang tidak otoritatif dan **tidak terlihat dunia luar**.
   > Edit di PowerDNS `103.194.46.46`, lalu purge cache-nya:
   > ```
   > pdns_control purge workspace-dev-v2.jabnet.id.
   > ```
   >
   > Verifikasi ke otoritatif langsung, bukan lewat resolver publik yang bisa cache:
   > ```bash
   > dig +short @ns1.jabnet.id workspace-dev-v2.jabnet.id   # harus 103.194.47.165
   > ```
   >
   > AutoSSL baru bisa menerbitkan sertifikat setelah DNS benar; sebelum itu domain
   > memakai sertifikat self-signed. Untuk tes lebih awal, pakai `curl --resolve`
   > atau entri `/etc/hosts` di laptop.
2. cPanel -> **Domains** -> Create Subdomain
   - Domain: `workspace-dev-v2.jabnet.id`
   - Document Root: biarkan default; Passenger yang handle setelah Node.js App dibuat
   - Centang **AutoSSL**, tunggu sertifikat terbit sebelum tes HTTPS

### B. MySQL Database

cPanel -> **MySQL Databases**

1. Create New Database: isi `fiber_v2_dev` -> jadi `jabnet_fiber_v2_dev`.
   (Untuk instance main nanti: `fiber_v2` -> `jabnet_fiber_v2`.)
2. Add User To Database -> pilih **`jabnet_crm_user`** -> centang **ALL PRIVILEGES**.
   ALL PRIVILEGES wajib karena aplikasi menjalankan `CREATE TABLE` / `ALTER TABLE`
   idempotent saat startup.
3. Opsional: phpMyAdmin -> Operations -> Collation `utf8mb4_unicode_ci`.

### C. SSH Deploy Key

V2 meng-clone repo GitHub yang sama dengan prod (`kanggalon710/workspace`), dan kunci
SSH cPanel milik server (bukan per-folder). Jadi kalau prod sudah bisa pull, V2 juga
bisa tanpa mendaftarkan kunci baru.

```bash
ssh -T git@github.com
# Harapan: "Hi kanggalon710/workspace! You've successfully authenticated..."
```

Kalau `Permission denied (publickey)`: cPanel -> **SSH Access** -> Manage SSH Keys ->
Generate New Key (ED25519, **passphrase kosong** - Git VC butuh non-interactive) ->
daftarkan public key di GitHub repo -> Settings -> Deploy keys (**jangan** centang
"Allow write access").

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

Klik **Create**, **jangan** klik "Run NPM Install" dulu - repo belum di-clone.

Catat command virtualenv yang muncul:

```bash
source /home/jabnet/nodevenv/repositories/fiber-jabnet-V2/20/bin/activate && cd /home/jabnet/repositories/fiber-jabnet-V2
```

> **Jangan set `PORT`.** Passenger meng-inject sendiri; `server/index.ts:38` membacanya
> (`process.env.PORT || 3002`). Kalau di-hardcode, instance bisa rebutan port.

### E. Git Version Control

cPanel -> **Files** -> Git Version Control -> Create:

- Clone URL: `git@github.com:kanggalon710/workspace.git` (SSH, bukan HTTPS)
- Repository Path: `/home/jabnet/repositories/fiber-jabnet-V2`
- Branch: **`deploy-dev`**

### F. Private folder & `.env`

```bash
chmod 711 /home/jabnet/repositories

mkdir -p /home/jabnet/private/fiber-jabnet-V2/{config,logs,backups,uploads}
chmod 700 /home/jabnet/private /home/jabnet/private/fiber-jabnet-V2
chmod 700 /home/jabnet/private/fiber-jabnet-V2/{config,logs,backups,uploads}
```

Buat `.env` (ganti `<PASSWORD_JABNET_CRM_USER>` dengan password aslinya):

```bash
cat > /home/jabnet/private/fiber-jabnet-V2/config/.env <<'EOF'
APP_URL=https://workspace-dev-v2.jabnet.id
APP_PUBLIC_URL=https://workspace-dev-v2.jabnet.id

# MySQL - wajib socket (workaround mysql2 TCP handshake hang di MySQL 8.0.42-cll-lve)
DB_SOCKET=/var/lib/mysql/mysql.sock
DB_USER=jabnet_crm_user
DB_PASSWORD=<PASSWORD_JABNET_CRM_USER>
DB_NAME=jabnet_fiber_v2_dev
DB_POOL_LIMIT=5

# Fitur "Tarik Data dari Production" (aktif karena DB_NAME berakhiran _dev)
DEV_DB_SYNC_ENABLED=true
PROD_DB_NAME=jabnet_fiber

SESSION_SECRET=<hasil: openssl rand -hex 32>
ADMIN_DEFAULT_PASSWORD=Admin@1234

BILLING_API_TOKEN=
BILLING_API_URL=https://billing.jabnet.id/api/pelanggan/list_pelanggan

JABNET_UPLOAD_ROOT=

# WORKER - WAJIB SEMUA false. Lihat "Aturan keras".
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
```

Untuk instance **main** nanti, `.env`-nya sama kecuali:

```
APP_URL / APP_PUBLIC_URL  -> domain instance main
DB_NAME=jabnet_fiber_v2
DEV_DB_SYNC_ENABLED       -> hapus baris ini (atau false)
PROD_DB_NAME              -> hapus baris ini
```

### G. Install dependencies

Klik **Update from Remote** di Git VC dulu, lalu:

```bash
source /home/jabnet/nodevenv/repositories/workspace-dev/22/bin/activate && cd /home/jabnet/repositories/workspace-dev

npm install --omit=dev --ignore-scripts --no-audit --no-fund
```

> **`--ignore-scripts` WAJIB. Jangan pakai tombol "Run NPM Install" cPanel.**
>
> Tombol itu menjalankan `npm install` penuh dan akan gagal dengan:
> ```
> gyp ERR! configure error
> SyntaxError: invalid syntax   (gyp/common.py: if CC := os.environ.get(...))
> ```
> Penyebabnya berlapis:
> 1. `better-sqlite3` ditarik sebagai **peerDependency `drizzle-orm`** (`">=7"`) -
>    jadi `--omit=dev` saja TIDAK cukup, walaupun paket itu ada di devDependencies.
> 2. Paket itu modul native, dan server hanya punya **Python 3.6.8**. node-gyp
>    modern butuh Python 3.8+ (operator walrus `:=`), jadi kompilasi mustahil.
>
> `--ignore-scripts` aman karena bundle esbuild sudah meng-inline seluruh
> dependency kecuali `mysql2`, dan tidak ada runtime dep yang butuh postinstall.
> Hasil: 370 paket dalam ~18 detik.

### H. Isi schema + data

Dua jalur, pilih salah satu:

- **Mulai dari data produksi** -> lompat ke bagian "Impor Data Produksi" di bawah.
- **Mulai dari DB kosong** -> jalankan `drizzle-kit push`:

```bash
# branch deploy-dev tidak berisi shared/schema.ts, jadi clone source sementara
git clone -b dev --depth 1 git@github.com:kanggalon710/workspace.git /tmp/v2-schema
cd /tmp/v2-schema && npm install --no-save drizzle-kit drizzle-orm dotenv
JABNET_PRIVATE_ROOT=/home/jabnet/private/fiber-jabnet-V2 npx drizzle-kit push
rm -rf /tmp/v2-schema
```

### I. Start + Verifikasi

cPanel -> Setup Node.js App -> **Restart Application**
(atau `touch ~/repositories/fiber-jabnet-V2/tmp/restart.txt`)

```bash
curl -sI https://workspace-dev-v2.jabnet.id/api/health          # 200
curl -s  https://workspace-dev-v2.jabnet.id/api/health | head   # {"ok":true,...}
curl -sI https://workspace-dev-v2.jabnet.id/api/auth/me         # 401, BUKAN 500
```

Pastikan instance menunjuk DB-nya sendiri:

```bash
mysql -u jabnet_crm_user -p -N -e "SELECT COUNT(*) FROM jabnet_fiber_v2_dev.users;"
```

Log: cPanel -> Setup Node.js App -> View Application Log, atau
`tail -f ~/repositories/fiber-jabnet-V2/tmp/stdout.log`

DB kosong -> app auto-seed admin `admin` / `Admin@1234`. **Ganti password setelah login pertama.**

---

## Impor Data Produksi

### Bisa atau tidak

Bisa. Ukuran bukan masalah - 36MB / 100k baris itu kecil untuk MySQL, impor selesai
dalam hitungan menit. Yang perlu diperhatikan adalah selisih schema, dan itu sudah
diverifikasi aman:

| Aspek | Temuan |
|---|---|
| Tabel di dump produksi | 95 |
| Tabel di `shared/schema.ts` (kode V2) | 134 |
| Selisih | 39 tabel (teamspace, HR, card labels/checklists) |
| Dari 39 itu, yang dibuat otomatis migrasi startup | **39 (semua)** |

Artinya: **impor dump lalu restart aplikasi sudah cukup.** `runTeamspaceMigrations()`
di `server/storage.ts:9277` menjalankan `CREATE TABLE IF NOT EXISTS` untuk seluruh
tabel yang kurang, plus `ALTER TABLE ADD COLUMN` idempotent untuk kolom baru.
Tidak perlu `drizzle-kit push` setelah impor.

Dump juga bersih dari dua jebakan umum:

- **Tidak ada `CREATE DATABASE` / `USE`** - jadi tujuan impor sepenuhnya ditentukan
  argumen `mysql <nama_db>`, tidak bisa nyasar balik ke `jabnet_fiber`.
- **Tidak ada `DEFINER` / trigger / stored routine** - tidak akan gagal karena
  privilege `SUPER` yang tidak dimiliki user cPanel.

### Cara yang dianjurkan: dump langsung di server

Jangan transfer file dari laptop. Prod dan V2 ada di MySQL yang sama, jadi dump-restore
bisa dilakukan server-side. Flag di bawah menyalin `tools/mirror-prod-to-dev.sh` yang
sudah teruji untuk kuirk privilege cPanel.

```bash
# SSH ke cPanel
export MYSQL_PWD='<PASSWORD_JABNET_CRM_USER>'

mysqldump \
  --single-transaction \
  --skip-lock-tables \
  --quick \
  --add-drop-table \
  --skip-triggers \
  --set-gtid-purged=OFF \
  --no-tablespaces \
  --column-statistics=0 \
  -u jabnet_crm_user jabnet_fiber > /tmp/prod-snapshot.sql

ls -lh /tmp/prod-snapshot.sql          # harusnya puluhan MB, bukan 0

mysql -u jabnet_crm_user jabnet_fiber_v2_dev < /tmp/prod-snapshot.sql

rm -f /tmp/prod-snapshot.sql
unset MYSQL_PWD
```

Kenapa flag-flag itu wajib di cPanel shared hosting:

| Flag | Alasan |
|---|---|
| `--single-transaction` + `--skip-lock-tables` | user cPanel tidak punya privilege `LOCK TABLES` |
| `--no-tablespaces` | menghindari kebutuhan privilege `PROCESS` |
| `--set-gtid-purged=OFF` | statement GTID butuh `SUPER` |
| `--column-statistics=0` | klien MySQL 8 menyisipkan `ANALYZE TABLE` yang gagal di shared host |
| `--add-drop-table` | impor ulang jadi idempotent (drop + recreate) |

`MYSQL_PWD` dipakai supaya password tidak muncul di `ps -ef` maupun shell history.

### Kalau sumbernya file dump phpMyAdmin

Dump dari phpMyAdmin berbeda dari `mysqldump --add-drop-table` dan butuh dua
penanganan tambahan. Keduanya ditemui saat impor Juli 2026:

**1. Tidak ada `DROP TABLE`.** Menimpa ke DB yang sudah berisi tabel akan membuat
semua `CREATE TABLE` gagal "already exists" dan data lama tercampur. Kosongkan target
lebih dulu:

```bash
export MYSQL_PWD='<PASSWORD>'
T=jabnet_fiber_v2_dev
mysql -u jabnet_crm_user -N -e \
  "SELECT CONCAT('DROP TABLE IF EXISTS \`',table_name,'\`;') FROM information_schema.tables WHERE table_schema='$T';" > /tmp/d.sql
{ echo "SET FOREIGN_KEY_CHECKS=0;"; cat /tmp/d.sql; } | mysql -u jabnet_crm_user "$T"
```

**2. Wajib `FOREIGN_KEY_CHECKS=0` saat impor.** phpMyAdmin memasang seluruh foreign
key lewat `ALTER TABLE ADD CONSTRAINT` di akhir file. Data produksi punya baris
orphan, sehingga impor akan mati di baris terakhir:

```
ERROR 1452: Cannot add or update a child row: a foreign key constraint fails
(CONSTRAINT `canvassing_logs_odp_id_odps_id_fk` FOREIGN KEY (`odp_id`) REFERENCES `odps` (`id`))
```

Ini bukan dump rusak - produksi memang punya `canvassing_logs` yang menunjuk ODP
terhapus. Impor dengan pengecekan dimatikan supaya struktur prod tersalin apa adanya:

```bash
{ echo "SET FOREIGN_KEY_CHECKS=0;"; cat /tmp/dump.sql; echo "SET FOREIGN_KEY_CHECKS=1;"; } \
  | mysql -u jabnet_crm_user jabnet_fiber_v2_dev
```

Transfer dari laptop: kompres dulu (73 MB turun ke 27 MB, transfer ~8 detik) dan
cocokkan `md5sum` di kedua sisi. Hapus file dump dari `/tmp` server setelah selesai -
`/tmp` terbaca proses lain di shared hosting dan isinya PII pelanggan.

Lalu restart app supaya migrasi startup mengisi 39 tabel yang kurang:

```bash
touch /home/jabnet/repositories/fiber-jabnet-V2/tmp/restart.txt
```

Verifikasi:

```bash
mysql -u jabnet_crm_user -p -N -e "
  SELECT COUNT(*) AS jumlah_tabel FROM information_schema.tables
  WHERE table_schema='jabnet_fiber_v2_dev';"     # harapkan 134

mysql -u jabnet_crm_user -p -N -e "
  SELECT COUNT(*) FROM jabnet_fiber_v2_dev.customers;"
```

Kalau jumlah tabel masih 95 setelah restart, migrasi startup gagal - cek Application Log.

### Setelah impor: bersihkan kredensial bawaan

Ini bagian yang paling mudah terlewat. Dump prod ikut membawa tabel `app_settings`
dan `mitra_integrations`, yang berisi **token integrasi asli**: MPWA WhatsApp,
billing API, GenieACS, Google Maps key, Chatwoot, Meta CAPI.

Worker memang sudah dimatikan lewat `.env`, tapi worker bukan satu-satunya jalan
keluar. Aksi manual dari UI - kirim broadcast, reboot ONT, ganti profil MikroTik,
kirim WA - tetap bisa ditembakkan dari V2 memakai token asli itu, dan efeknya
kena ke pelanggan sungguhan.

`mitra_integrations` berbentuk **key-value** (`id, mitra_id, key, value, is_secret,
updated_at`), bukan satu kolom per integrasi. Periksa dulu apa yang benar-benar terisi:

```sql
SELECT `key`, mitra_id, is_secret,
       IF(COALESCE(`value`,'')<>'','TERISI','kosong') AS status
FROM jabnet_fiber_v2_dev.mitra_integrations
ORDER BY mitra_id, `key`;
```

Hasil pemeriksaan pada impor Juli 2026 - jangkauan risikonya ternyata sempit:

| Integrasi | Status | Berefek nyata? |
|---|---|---|
| GenieACS (`genieacs_*`) | semua kosong | tidak |
| MPWA WhatsApp | `mpwa_url`+`mpwa_enabled` terisi, **`mpwa_token` kosong** | tidak - tak bisa kirim |
| Meta CAPI | kosong | tidak |
| Google Maps (mitra 1) | terisi | kuota/tagihan GCP |
| Billing reseller (mitra 7) | id/email/nama/phone + **password terisi** | **ya** |
| MikroTik (`mikrotik_routers`) | host+username+**password terisi**, `is_active=1` | **ya** |

Jadi yang perlu ditangani hanya dua. Yang paling ringan, memblokir koneksi MikroTik
tanpa menghilangkan entri (UI tetap 1:1):

```sql
UPDATE jabnet_fiber_v2_dev.mikrotik_routers SET is_active = 0;
```

Kalau ingin memutus kredensial billing juga:

```sql
UPDATE jabnet_fiber_v2_dev.mitra_integrations
   SET `value` = '' WHERE `key` = 'billing_reseller_password';
```

Untuk paritas fitur, whitelist referrer `*.workspace-dev-v2.jabnet.id/*` di GCP
Console - tanpa itu peta blank di dev.

### Data pelanggan asli di domain publik

`workspace-dev-v2.jabnet.id` bisa diakses siapa pun dari internet, dan setelah impor
isinya nama, nomor HP, alamat, dan data tagihan pelanggan sungguhan. Minimal:

- Ganti password admin default segera setelah start pertama
- Pertimbangkan proteksi tambahan di level Apache (cPanel -> Directory Privacy)
  atau pembatasan IP selama V2 dipakai internal
- Jangan biarkan V2 ter-index: tambahkan `robots.txt` disallow kalau perlu

---

## Aturan keras untuk instance V2

1. **Semua worker WAJIB `false`.** Prod, dev lama, dan V2 berbicara ke MikroTik,
   billing.jabnet.id, MPWA WhatsApp, dan GenieACS yang **sama**. Worker V2 yang hidup
   akan mengganti profil isolir pelanggan asli dan menembak WhatsApp ke nomor asli.
   Ini efek dunia nyata, bukan data uji.
2. **Jangan arahkan `DB_NAME` ke `jabnet_fiber`.** Itu DB produksi yang sedang dipakai.
3. **Kosongkan token integrasi setelah impor data prod** (lihat bagian di atas).
4. **Google Maps API key** perlu whitelist referrer `*.workspace-dev-v2.jabnet.id/*`
   di GCP Console, kalau tidak peta blank.
5. **Jangan edit file langsung di `~/repositories/fiber-jabnet-V2`.** Branch `deploy-dev`
   orphan dan selalu di-`reset --hard` - editan lokal hilang saat pull berikutnya.
6. **Jangan commit file dump `.sql` ke repo.** Dump produksi berisi PII pelanggan.
   `.gitignore` sudah memblokir `*.sql`.

---

## Daily Workflow V2

```
laptop                      GitHub                  cPanel V2 dev
------                      ------                  -------------
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

V2 juga bisa update sendiri lewat halaman `/integrations`: `server/self-update.ts`
auto-deteksi branch aktif, jadi di V2 dia otomatis melacak `deploy-dev`.

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
| 500 di semua `/api/*` | Application Log. Paling sering `.env` tidak terbaca -> pastikan `JABNET_PRIVATE_ROOT` menunjuk `/home/jabnet/private/fiber-jabnet-V2` |
| `Access denied for user` | `jabnet_crm_user` belum di-attach ke DB V2 dengan ALL PRIVILEGES |
| Koneksi MySQL menggantung lalu timeout | `DB_SOCKET` tidak di-set. Wajib socket di server ini, bukan TCP |
| `Cannot find module 'mysql2'` | `npm install --production` belum jalan di virtualenv Node 20 |
| 404 di root | Node.js App belum Create, atau Application URL salah |
| Git VC pull gagal | Clone URL pakai HTTPS (harus SSH), atau deploy key belum terdaftar |
| Peta blank | Referrer `workspace-dev-v2.jabnet.id` belum di-whitelist di GCP Console |
| Tombol "Tarik Data dari Production" tidak muncul | `DEV_DB_SYNC_ENABLED` bukan `"true"`, atau `DB_NAME` tidak berakhiran `_dev` (`server/dev-db-sync.ts:19-24`) |
| Setelah impor, tabel tetap 95 | Migrasi startup gagal. Cek Application Log; pastikan user MySQL punya CREATE/ALTER |
| `mysqldump: Access denied ... PROCESS privilege` | Flag `--no-tablespaces` hilang |
| Dump hasilnya 0 byte | Privilege user kurang; cek pesan error di baris pertama file dump |

---

## Membongkar instance V2

1. cPanel -> Setup Node.js App -> app V2 -> **Destroy**
2. cPanel -> Git Version Control -> hapus entry V2
3. cPanel -> Domains -> Remove `workspace-dev-v2.jabnet.id`; hapus A record di DNS
4. cPanel -> MySQL Databases -> drop `jabnet_fiber_v2_dev` (backup dulu bila perlu)
5. `rm -rf ~/repositories/fiber-jabnet-V2 ~/private/fiber-jabnet-V2`
6. Hapus cron auto-pull + keep-alive milik V2
