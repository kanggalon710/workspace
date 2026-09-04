#!/bin/bash
# Mirror production DB → development DB.
# Idempotent, safe to re-run. Designed untuk dijalankan via cron jam 02:00 WIB tiap hari.
#
# USAGE (manual):   bash ~/scripts/mirror-prod-to-dev.sh
# USAGE (cron):     0 2 * * * /bin/bash /home/jabnet/scripts/mirror-prod-to-dev.sh >> /home/jabnet/logs/mirror.log 2>&1
#
# Setelah mirror sukses, Passenger restart-trigger di-touch supaya dev app reload
# (re-run startup migrations idempotent — auto-apply schema diff kalau dev branch
# punya kolom baru yang belum di prod).

set -euo pipefail

# === Config ===
PROD_DB="jabnet_fiber"
DEV_DB="jabnet_fiber_dev"
DB_USER="jabnet_crm_user"
DB_HOST="localhost"
# Password di-load dari prod .env supaya tidak hardcoded di script
PROD_ENV_FILE="/home/jabnet/private/fiber-jabnet/config/.env"

# Dev app dir untuk Passenger restart trigger
DEV_APP_DIR="/home/jabnet/dev-fiber-jabnet"
DEV_RESTART_FILE="$DEV_APP_DIR/tmp/restart.txt"

# === Validate environment ===
if [ ! -f "$PROD_ENV_FILE" ]; then
  echo "[mirror] ERROR: prod env file tidak ada: $PROD_ENV_FILE" >&2
  exit 1
fi

# Server code (server/storage.ts) reads DB_PASSWORD (.env.example pakai DB_PASSWORD).
# Coba DB_PASSWORD dulu, fallback ke DB_PASS untuk backwards compat.
DB_PASS=$(grep -E "^DB_PASSWORD=" "$PROD_ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -z "$DB_PASS" ]; then
  DB_PASS=$(grep -E "^DB_PASS=" "$PROD_ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
fi
if [ -z "$DB_PASS" ]; then
  echo "[mirror] ERROR: DB_PASSWORD / DB_PASS tidak ditemukan di $PROD_ENV_FILE" >&2
  exit 1
fi

# === Run ===
TS=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TS] [mirror] START — $PROD_DB → $DEV_DB"

# Pass password via MYSQL_PWD env supaya tidak muncul di process list (ps -ef) + tidak ke logs
export MYSQL_PWD="$DB_PASS"

# Verify both DBs reachable
mysql -u "$DB_USER" -h "$DB_HOST" -e "SELECT 1" "$PROD_DB" >/dev/null
mysql -u "$DB_USER" -h "$DB_HOST" -e "SELECT 1" "$DEV_DB" >/dev/null

# Pipe dump → restore.
# --single-transaction = consistent InnoDB snapshot tanpa LOCK TABLES privilege (cPanel shared user
#                        biasanya tidak punya LOCK TABLES privilege, jadi --skip-lock-tables wajib).
# --add-drop-table = dev schema persis prod (drop+recreate setiap mirror).
# --skip-triggers = avoid trigger conflicts (none defined currently, safe default).
# --no-tablespaces = avoid PROCESS privilege requirement (cPanel shared user tidak punya).
# --column-statistics=0 = MySQL 8 client kadang tambahin ANALYZE TABLE yang gagal di shared host.
# --set-gtid-purged=OFF = skip GTID statements yang butuh SUPER privilege.
# Pipefail (set -o pipefail di atas) memastikan kalau mysqldump fail, exit non-zero.
TMP_DUMP=$(mktemp /tmp/mirror-XXXXXX.sql)
trap 'rm -f "$TMP_DUMP"' EXIT

mysqldump \
  --single-transaction \
  --skip-lock-tables \
  --quick \
  --add-drop-table \
  --skip-triggers \
  --set-gtid-purged=OFF \
  --no-tablespaces \
  --column-statistics=0 \
  -u "$DB_USER" -h "$DB_HOST" \
  "$PROD_DB" > "$TMP_DUMP"

DUMP_SIZE=$(stat -c%s "$TMP_DUMP" 2>/dev/null || stat -f%z "$TMP_DUMP")
if [ "$DUMP_SIZE" -lt 1024 ]; then
  echo "[mirror] ERROR: dump file kosong/terlalu kecil ($DUMP_SIZE bytes). Cek privilege user $DB_USER di prod DB." >&2
  echo "[mirror] First 20 lines of dump:" >&2
  head -20 "$TMP_DUMP" >&2 || true
  exit 1
fi
echo "[mirror] dump $DUMP_SIZE bytes — restoring ke $DEV_DB"

mysql -u "$DB_USER" -h "$DB_HOST" "$DEV_DB" < "$TMP_DUMP"

# Verify dev DB populated
ROWCOUNT=$(mysql -u "$DB_USER" -h "$DB_HOST" -N -e "SELECT COUNT(*) FROM customers" "$DEV_DB" 2>/dev/null || echo "0")
echo "[mirror] dev DB customers row count: $ROWCOUNT"

# Restart dev app via Passenger touch trigger
mkdir -p "$DEV_APP_DIR/tmp"
touch "$DEV_RESTART_FILE"

TS=$(date '+%Y-%m-%d %H:%M:%S')
echo "[$TS] [mirror] DONE — dev restart triggered (customers=$ROWCOUNT)"
