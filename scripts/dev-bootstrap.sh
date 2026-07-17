#!/usr/bin/env bash
# JABNET Workspace — bootstrap dev lokal 1-perintah (Mac/Linux).
# Menyiapkan MySQL (Docker), .env, tabel (db:push), lalu menjalankan app di http://localhost:3002
# Login: admin / Admin@1234
set -euo pipefail

cd "$(dirname "$0")/.."
PORT="${PORT:-3002}"

echo "▶ JABNET Workspace — bootstrap dev lokal"

# 1. Node check
if ! command -v node >/dev/null 2>&1; then echo "✗ Node belum terpasang. Install Node 20+ dulu."; exit 1; fi
echo "✓ node $(node -v)"

# 2. MySQL via Docker (kalau ada). Kalau tidak, pakai MySQL/MariaDB lokal yang sudah jalan.
DB_HOST=127.0.0.1; DB_PORT=3306; DB_USER=root; DB_PASSWORD=root; DB_NAME=jabnet_fiber
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if ! docker ps -a --format '{{.Names}}' | grep -q '^jabnet-mysql$'; then
    echo "▶ Menjalankan MySQL 8 via Docker (container: jabnet-mysql)…"
    docker run -d --name jabnet-mysql \
      -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=jabnet_fiber \
      -p ${DB_PORT}:3306 mysql:8 >/dev/null
  else
    docker start jabnet-mysql >/dev/null 2>&1 || true
  fi
  echo -n "▶ Menunggu MySQL siap"
  for i in $(seq 1 60); do
    if docker exec jabnet-mysql mysqladmin ping -uroot -proot >/dev/null 2>&1; then echo " ✓"; break; fi
    echo -n "."; sleep 2
    if [ "$i" = "60" ]; then echo " ✗ timeout"; exit 1; fi
  done
else
  echo "⚠ Docker tidak aktif — memakai MySQL/MariaDB lokal di ${DB_HOST}:${DB_PORT}."
  echo "  Pastikan database '${DB_NAME}' sudah ada & sesuaikan kredensial di .env bila perlu."
fi

# 3. .env (buat kalau belum ada — tidak menimpa punyamu)
if [ ! -f .env ]; then
  echo "▶ Membuat .env"
  cat > .env <<EOF
PORT=${PORT}
DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
SESSION_SECRET=dev-local-$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
ADMIN_DEFAULT_PASSWORD=Admin@1234
JABNET_UPLOAD_ROOT=./uploads
TEAMSPACE_WORKER_ENABLED=true
APP_PUBLIC_URL=http://localhost:${PORT}
EOF
else
  echo "✓ .env sudah ada (dipakai apa adanya)"
fi
mkdir -p uploads

# 4. Dependencies
if [ ! -d node_modules ]; then echo "▶ npm install…"; npm install; else echo "✓ node_modules ada"; fi

# 5. Buat tabel inti (idempotent — aman diulang)
echo "▶ db:push (buat/selaraskan tabel)…"
npm run db:push

# 6. Jalankan
echo ""
echo "✅ Siap. Membuka server di http://localhost:${PORT}  (login: admin / Admin@1234)"
echo "   Sidebar → grup TEAMSPACE untuk fitur baru. Ctrl+C untuk berhenti."
echo ""
npm run dev
