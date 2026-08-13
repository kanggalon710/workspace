# Konvensi cPanel Jabnet - Layout & Deploy Flow

Dokumen ini berlaku untuk **semua project** yang di-host di cPanel user `jabnet`
(`/home/jabnet/`). Setiap project baru wajib mengikuti pola di sini supaya
tidak ada path adhoc, tidak ada secret bocor antar project, dan deploy bisa
dilakukan dengan **`git push` lokal + 1 klik di cPanel**.

Copy file ini ke repo project baru (dengan slug yang disesuaikan).

---

## 1. Layout direktori di server

```
/home/jabnet/
+-- repositories/                          ← semua git clone (= webroot Apache)
| +-- cpanel-pelanggan-db/                  project pelanggan-cpanel.jabnet.id
| +-- billing-app/                          contoh project depan
| +-- <repo-slug>/
|
+-- private/                               ← semua secret, di luar webroot
| +-- pelanggan-cpanel/
| | +-- config/.env                       (chmod 600)
| | +-- logs/                             (chmod 700)
| +-- billing-app/
| | +-- config/.env
| | +-- logs/
| +-- <project-slug>/
| | +-- config/.env
| | +-- logs/
| +-- shared/                            ← opsional: cred dipakai bareng (jarang)
| +-- config/.env
|
+-- backups/                               ← dump DB & snapshot di luar webroot
| +-- pelanggan-cpanel/
| +-- <project-slug>/
|
+-- folder_proyek/                         ← DEPRECATED, jangan dipakai lagi
```

### Aturan inti

| Aturan | Alasan |
|---|---|
| `~/repositories/<repo-slug>/` adalah webroot - Document Root subdomain langsung diset ke `repositories/<repo-slug>` | Pull = deploy. Tidak ada copy step, tidak ada `.cpanel.yml` runtime. |
| `~/repositories/` harus `chmod 711` | Default cPanel `700` membuat Apache tidak bisa traverse → `403 Forbidden`. |
| Secret per project ada di `~/private/<project-slug>/` | Project A tidak bisa baca `.env` project B. Backup selektif jadi mudah. |
| `.env` di-pin lewat `SetEnv JABNET_PRIVATE_ROOT` di `api/.htaccess` | Explicit > walk-up. Tidak ambigu, tidak bisa salah tunjuk. |
| `<project-slug>` = nama folder pendek, lowercase, dash-separated | `pelanggan-cpanel`, bukan `pelanggan_cpanel.jabnet.id`. |

---

## 2. Files yang wajib ada di setiap repo

```
<repo>/
+-- frontend/                          # Next.js (kalau project punya UI)
+-- backend/                           # PHP API (kalau project punya backend)
+-- deploy/
| +-- .htaccess                      # → di-copy ke root webroot oleh GHA
| +-- api.htaccess                   # → di-copy ke api/ oleh GHA
+-- private/
| +-- config/.env.example            # template, BOLEH commit
+-- .github/workflows/build.yml        # GHA: build + force-push ke branch `deploy`
+-- .gitignore                         # block .env, node_modules, dst.
+-- CPANEL-CONVENTIONS.md              # copy dokumen ini
```

### `deploy/api.htaccess` - wajib set 1 baris ini

```apache
SetEnv JABNET_PRIVATE_ROOT /home/jabnet/private/<project-slug>
```

Ganti `<project-slug>` sesuai folder di `~/private/`.

### `.github/workflows/build.yml` - pola yang dipakai

Workflow build di GHA → push ke branch orphan `deploy` (force-push). Layout
branch `deploy` adalah **layout produksi siap-tampil**:

```
deploy branch root/
+-- index.html, _next/, <route>/...        # frontend static export
+-- .htaccess                              # dari deploy/.htaccess
+-- api/
| +-- index.php, lib/, endpoints/...     # backend PHP
| +-- .htaccess                          # dari deploy/api.htaccess
+-- .build-sha
+-- .build-time
```

**Tidak ada** folder `frontend/`, `backend/`, `deploy/`, `private/` di branch
`deploy` - cuma source-of-deploy yang ada di sana.

### `.gitignore` - minimum yang harus ada

```
frontend/node_modules/
frontend/.next/
frontend/out/
*.env
!*.env.example
private/config/.env
backend/.env
*.log
.DS_Store .vscode/ .idea/
backups/ *.sql.gz *.tar.gz *.zip
```

---

## 3. Setup project baru (sekali, ~10 menit)

### A. Di GitHub
1. Buat repo private.
2. Push code dari laptop (`main` branch). GHA akan otomatis build & push branch
   `deploy`.

### B. Di cPanel - Subdomain
1. **Domains** → Create Subdomain (mis. `app.jabnet.id`).
2. **Document Root**: `repositories/<repo-slug>` (relatif ke `/home/jabnet`).
3. **AutoSSL** aktif untuk subdomain.

### C. Di cPanel - Git Version Control
1. **Git Version Control** → Create.
2. **Clone URL**: SSH URL repo (pakai deploy key kalau private).
3. **Repository Path**: `/home/jabnet/repositories/<repo-slug>`.
4. **Branch**: `deploy`.
5. Klik **Create**.

### D. Di SSH - siapkan private/

```bash
# Pastikan ~/repositories/ bisa di-traverse Apache (sekali untuk semua project)
chmod 711 /home/jabnet/repositories

# Bikin private folder untuk project ini
mkdir -p /home/jabnet/private/<project-slug>/{config,logs}
chmod 700 /home/jabnet/private
chmod 700 /home/jabnet/private/<project-slug>
chmod 700 /home/jabnet/private/<project-slug>/{config,logs}

# Isi .env (salin dari .env.example)
cp /home/jabnet/repositories/<repo-slug>/private/config/.env.example \
   /home/jabnet/private/<project-slug>/config/.env
nano /home/jabnet/private/<project-slug>/config/.env          # isi password, dll
chmod 600 /home/jabnet/private/<project-slug>/config/.env
```

### E. Database (kalau ada)
1. **MySQL Databases** → buat DB & user, attach.
2. Privilege user: hanya `SELECT, INSERT, UPDATE, DELETE` di DB project ini.
3. Import schema/migration kalau perlu.

### F. Final test
```bash
curl -I https://<subdomain>/                # 200 OK
curl -I https://<subdomain>/api/auth/me     # 401 (belum login) - bukan 500
```

Kalau 500: cek `~/private/<project-slug>/logs/php_error.log`.

---

## 4. Daily workflow (setelah setup selesai)

```
laptop                            GitHub                   cPanel
------                            ------                   ------
edit code
git push origin main  --------►   trigger GHA
                                  build (npm ci, build)
                                  compose payload
                                  force-push → deploy --►  branch `deploy` updated
 |
                                                                ▼
                                  ◄---- click "Update from Remote" di Git VC
 |
                                                                ▼
                                                          webroot updated (1 step)
 |
                                                                ▼
                                                          site live
```

**Cuma 2 langkah manual**: `git push` lokal, 1 klik di cPanel.

### Zero-touch via cron (auto-deploy penuh)

Pakai `tools/cpanel-autodeploy.sh` (ikut terkirim di payload `deploy`/`deploy-dev`
karena `build.yml` menyalin `tools/*.sh`). Cukup 1 cron; push → build → auto pull
→ auto restart, tanpa klik:

```bash
# crontab -e di cPanel (PROD; untuk DEV ganti arg jadi `deploy-dev` + path repo dev)
*/5 * * * * /bin/bash ~/repositories/<repo-slug>/tools/cpanel-autodeploy.sh deploy \
  >> ~/private/<project-slug>/logs/autodeploy.log 2>&1
```

Script hanya bertindak saat `origin/<branch>` berubah: `fetch` + `reset --hard`
(branch orphan/force-push, JANGAN `pull`), `npm ci --omit=dev` hanya bila
`package-lock.json` berubah, lalu `touch tmp/restart.txt`. Karena guard perubahan,
app **tidak** restart tiap tick - hanya saat ada build baru. `node_modules`
(untracked) aman dari `reset --hard`.

---

## 5. Rotasi credential & ganti `.env`

Edit file, restart PHP-FPM, selesai. **Tidak perlu deploy code**.

```bash
nano /home/jabnet/private/<project-slug>/config/.env
# cPanel → Select PHP Version → Restart (atau touch ~/.cl-php-restart)
```

---

## 6. Backup

- **DB harian**: cron `mysqldump > ~/backups/<project-slug>/db-$(date +%F).sql.gz`.
- **Full account mingguan**: cPanel **Backup Wizard** → schedule ke remote
  (R2 / S3 / Google Drive via rclone).
- **`~/private/`**: ikut backup full account. Kalau perlu standalone:
  `tar czf ~/backups/private-$(date +%F).tar.gz -C ~ private/`.

`~/backups/` di luar webroot - tidak ter-expose ke publik. Pastikan
juga tidak masuk ke `~/repositories/` mana pun.

---

## 7. Checklist project baru (ringkas)

- [ ] Repo GitHub dibuat, push `main`.
- [ ] GHA build hijau, branch `deploy` muncul di GitHub.
- [ ] `~/repositories/` ada di server dengan `chmod 711`.
- [ ] Subdomain dibuat di cPanel, Document Root → `repositories/<repo-slug>`.
- [ ] Git VC clone repo ke `~/repositories/<repo-slug>`, branch `deploy`.
- [ ] `~/private/<project-slug>/{config,logs}/` ada dengan `chmod 700`.
- [ ] `~/private/<project-slug>/config/.env` terisi dengan `chmod 600`.
- [ ] `deploy/api.htaccess` di repo punya `SetEnv JABNET_PRIVATE_ROOT
  /home/jabnet/private/<project-slug>`.
- [ ] DB & user MySQL dibuat (kalau perlu), privilege minimal.
- [ ] `curl -I https://<subdomain>/` → 200 OK.
- [ ] `curl -I https://<subdomain>/api/auth/me` → 401 (bukan 500).

---

## 8. Aturan keras

1. **Jangan** taruh source code di webroot lama (`~/folder_proyek/` deprecated).
2. **Jangan** taruh `.env` di dalam `~/repositories/` mana pun.
3. **Jangan** commit `.env` ke git. Cuma `.env.example`.
4. **Jangan** share folder `~/private/` antar project. Satu project, satu subfolder.
5. **Jangan** edit file di webroot langsung - selalu lewat `git push` → GHA →
   pull. Edit langsung akan ke-overwrite saat pull berikutnya.
6. **Jangan** pakai walk-up untuk cari `.env` - selalu set
   `JABNET_PRIVATE_ROOT` explicit di `api/.htaccess`.
