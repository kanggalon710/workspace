# MPWA Runbook — Pencegahan & Troubleshooting

> **One-liner**: MPWA WhatsApp gateway (`mpwa.jabnet.id`) di cPanel `103.194.47.165`. Dipakai `workspace.jabnet.id` untuk OTP customer portal + broadcast. Issue 17 Mei 2026: Passenger spawn multi-worker → Baileys WA session race → "Mesaj göndərilmədi!".

---

## 1. Permanent Fix — Wajib dilakukan (WHM root, ~5 menit)

Tujuan: paksa Passenger Apache jalankan **hanya 1 worker** untuk MPWA. Tanpa ini, race condition bisa terjadi lagi kapan saja saat ada beban tinggi atau klik "Restart" di cPanel.

### Step 1 — SSH sebagai root

```bash
ssh root@103.194.47.165
```

### Step 2 — Buat per-domain Apache include

```bash
# Buat folder include untuk HTTP + HTTPS vhost mpwa.jabnet.id
mkdir -p /etc/apache2/conf.d/userdata/std/2_4/jabnet/mpwa.jabnet.id/
mkdir -p /etc/apache2/conf.d/userdata/ssl/2_4/jabnet/mpwa.jabnet.id/

# Tulis directive ke file include
cat > /etc/apache2/conf.d/userdata/std/2_4/jabnet/mpwa.jabnet.id/passenger_single_instance.conf << 'EOF'
# Baileys WhatsApp session tidak bisa di-share antar workers — enforce 1 worker
PassengerMaxInstancesPerApp 1
PassengerMinInstances 1
EOF

# Copy ke SSL variant supaya berlaku juga untuk HTTPS
cp /etc/apache2/conf.d/userdata/std/2_4/jabnet/mpwa.jabnet.id/passenger_single_instance.conf \
   /etc/apache2/conf.d/userdata/ssl/2_4/jabnet/mpwa.jabnet.id/passenger_single_instance.conf
```

### Step 3 — Rebuild vhost + restart Apache

```bash
/usr/local/cpanel/scripts/ensure_vhost_includes --user=jabnet
/usr/local/cpanel/scripts/restartsrv_httpd
```

### Step 4 — Verify directive masuk ke httpd.conf

```bash
grep -B1 -A1 "PassengerMaxInstancesPerApp" /etc/apache2/conf/httpd.conf | head -20
```
Harus muncul minimal 2 baris matching (HTTP + HTTPS vhost).

### Step 5 — Verify dari sisi runtime

```bash
# Stress test 10 request paralel
for i in $(seq 1 10); do curl -s -o /dev/null https://mpwa.jabnet.id/ & done; wait
sleep 5

# Cek jumlah worker — harus tetap 1
su - jabnet -c "ps -fU jabnet | grep 'Passenger NodeApp.*mpwa' | grep -v grep"
```
Output harus **1 baris**. Kalau >1 muncul, restart Apache lagi atau cek typo di file include.

---

## 2. Setelah permanent fix aktif

### Hapus watchdog cron (sudah redundant)

Saya install watchdog `*/2 menit` saat troubleshoot. Setelah fix permanent di WHM aktif, watchdog tidak perlu lagi.

```bash
# SSH sebagai jabnet (bukan root)
ssh -i ~/.ssh/access-jabnet-cpanel jabnet@103.194.47.165
crontab -l | grep -v 'mpwa-watchdog.sh' | crontab -

# Atau biarkan saja — toh hampir tidak akan kepicu lagi
```

---

## 3. Diagnosa cepat — kalau MPWA error broadcast / OTP gagal

### Quick check checklist (SSH user `jabnet`)

```bash
# 1) Berapa worker MPWA jalan?
ps -fU jabnet | grep 'Passenger NodeApp.*mpwa' | grep -v grep
# Harus tepat 1. Kalau >1 → race condition aktif

# 2) Error terbaru di MPWA laravel.log
tail -100 /home/jabnet/folder_proyek/mpwa.jabnet.id/storage/logs/laravel.log | grep '^\[202' | tail -20

# 3) Status sender JABNET di fiber app_settings
export MYSQL_PWD='Galon@12345'
mysql -u jabnet_crm_user jabnet_fiber -e \
  "SELECT \`key\`, value FROM app_settings WHERE \`key\` LIKE 'mpwa%'"

# 4) Live test send-text (token diganti dengan token JABNET aktual)
TOKEN='<mpwa_token_dari_app_settings>'
time curl -sS --max-time 10 -X POST -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"number\":\"628999999999999\",\"text\":\"test\"}" \
  https://mpwa.jabnet.id/backend-send-text
# Response cepat <2s = sehat. Hang 30s = ada masalah.

# 5) Cek credentials sender JABNET
ls -la /home/jabnet/folder_proyek/mpwa.jabnet.id/credentials/<sender_number>/ | head -5
# Folder size 6 byte = kosong = perlu re-scan QR
```

### Map symptom → kemungkinan penyebab

| Symptom | Penyebab | Fix |
|---|---|---|
| Hang 30s + `cURL error 28` di `laravel.log` | Multi-worker race, atau session zombie | Kill duplikat, restart |
| "Mesaj göndərilmədi!" di MPWA panel | Same as above | Same |
| `credentials/<number>` folder 6 byte (kosong) | Session di-logout / credentials hilang | Re-scan QR di MPWA panel |
| Worker CPU 99%+ sustained, sedikit traffic | Baileys reconnect loop — session di rate-limit WhatsApp | Wait 15-30 menit, atau wipe credentials + fresh QR |
| Error "Check your whatsapp connection" dari `/backend-getgroups` | Sender belum fully connected | Tunggu warm-up, atau re-scan QR |

### Recovery actions

**A. Kill duplicate worker (kalau >1)**

```bash
# Lihat semua worker
ps -fU jabnet | grep 'Passenger NodeApp.*mpwa' | grep -v grep

# Identifikasi: keep yang ELAPSED time paling lama (primary), kill yang muda
kill -TERM <PID_muda>
sleep 5
# Kalau masih hidup:
kill -KILL <PID_muda>
```

**B. Restart Node app dengan benar**

JANGAN klik "Restart" di cPanel UI — itu kadang trigger spawn ganda. Pakai:
```bash
# Hapus stale pidfile (kalau ada)
rm -f /home/jabnet/folder_proyek/mpwa.jabnet.id/tmp/.app.pid

# Touch restart marker (graceful)
touch /home/jabnet/folder_proyek/mpwa.jabnet.id/tmp/restart.txt

# Atau force kill (kalau graceful tidak jalan):
ps -fU jabnet | grep 'Passenger NodeApp.*mpwa' | grep -v grep | awk '{print $2}' | xargs -r kill -TERM
sleep 5
# Passenger akan auto-respawn worker baru saat ada request masuk
```

**C. Wipe credentials + fresh QR (last resort untuk session corrupt)**

```bash
SENDER=<phone_number_misal_6289630599885>
CREDS=/home/jabnet/folder_proyek/mpwa.jabnet.id/credentials/$SENDER

# Backup dulu — penting!
mv "$CREDS" "${CREDS}.bak-$(date +%s)"
mkdir -p "$CREDS"

# Restart Node
touch /home/jabnet/folder_proyek/mpwa.jabnet.id/tmp/restart.txt

# Lalu di MPWA panel: login → Devices → cari device $SENDER → Generate QR
# Scan QR pakai WhatsApp di HP nomor $SENDER (Settings → Linked Devices → Link a Device)
```

---

## 4. Pencegahan operasional (best practices)

1. **JANGAN klik "Restart" di cPanel UI "Setup Node.js App"** untuk MPWA — sering spawn worker tambahan tanpa kill yang lama. Pakai SSH `touch tmp/restart.txt` atau `kill -TERM <pid>`.

2. **JANGAN klik "Logout Device" di MPWA panel** kecuali yakin mau scan QR ulang. Kalau klik logout, credentials kosong → fiber app tidak bisa kirim OTP sampai re-scan.

3. **JANGAN edit `.htaccess` MPWA dengan directive Passenger* yang non-basic** (`PassengerMaxInstancesPerApp`, `PassengerMinInstances`, `PassengerSpawnMethod`). CloudLinux tolak → HTTP 500 → MPWA panel down.

4. **JANGAN coba pidfile lock di `server.js`** dengan `process.exit(0)`. Passenger interpret sebagai startup crash → disable seluruh app. Pernah dicoba 17 Mei 2026, rollback dari `server.js.bak-*`.

5. **Monitor `mpwa_last_error_at` di app_settings fiber** — kalau jarak `last_error_at` < `last_success_at` baru-baru ini, MPWA bermasalah. Bisa buat banner di Dashboard fiber.

6. **Backup credentials secara berkala** — Baileys session berisi pairing keys yang sulit di-recover kalau hilang.
   ```bash
   # cron suggestion (user jabnet):
   0 3 * * * tar -czf /home/jabnet/backups/mpwa-credentials-$(date +\%Y\%m\%d).tar.gz -C /home/jabnet/folder_proyek/mpwa.jabnet.id credentials/
   ```

---

## 5. File-file penting di server MPWA

| Path | Fungsi |
|---|---|
| `/home/jabnet/folder_proyek/mpwa.jabnet.id/server.js` | Node entry — **jangan edit** kecuali sangat hati-hati |
| `.../storage/logs/laravel.log` | PHP-side error log (search `^\[202` untuk timestamp) |
| `.../credentials/<phone>/creds.json` | Baileys session per WA number |
| `.../tmp/restart.txt` | Passenger restart trigger — `touch` to schedule |
| `.../tmp/.app.pid` | (Tidak dipakai sekarang — sisa eksperimen lock yang di-rollback) |
| `/home/jabnet/scripts/mpwa-watchdog.sh` | Cron watchdog yang auto-kill duplikat worker |
| `/home/jabnet/scripts/mpwa-watchdog.log` | Log aksi watchdog |
| `/etc/apache2/conf.d/userdata/std/2_4/jabnet/mpwa.jabnet.id/passenger_single_instance.conf` | **Permanent fix file** — wajib ada |

---

## 6. Kontak penting

- **MPWA vendor**: onexgen.com (Magd Almuntaser) — email `info@onexgen.com` kalau butuh support v14
- **cPanel hosting**: (isi provider Anda) — kontak kalau perlu setting server-level lain
- **WhatsApp account JABNET**: `6289630599885` — sender utama workspace.jabnet.id. Kalau di-banned WhatsApp, pakai nomor lain sebagai sender (ubah `mpwa_sender_number` di `app_settings`)
