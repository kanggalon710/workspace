#!/usr/bin/env bash
# Snapshot SQLite live `data.db` dari prod lama (103.194.46.164) ke file lokal.
#
# Usage:
#   bash tools/legacy-sync-fetch.sh [output_path]
#
# Default output: ./legacy-data.db (di cwd).
#
# Env (opsional):
#   LEGACY_SSH_HOST=103.194.46.164
#   LEGACY_SSH_USER=hidayatulloh710
#   LEGACY_SSH_PASS=Galon@123          (default; password SSH bukan key passphrase)
#   LEGACY_DB_PATH=/var/www/ftth-tools/data.db

set -euo pipefail

HOST="${LEGACY_SSH_HOST:-103.194.46.164}"
USER="${LEGACY_SSH_USER:-hidayatulloh710}"
PASS="${LEGACY_SSH_PASS:-Galon@123}"
REMOTE_DB="${LEGACY_DB_PATH:-/var/www/ftth-tools/data.db}"
OUT="${1:-./legacy-data.db}"

command -v sshpass >/dev/null || { echo "ERROR: sshpass tidak terinstall"; exit 1; }

echo "[fetch] consolidate WAL di remote → ${REMOTE_DB}.snapshot"
sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no "$USER@$HOST" \
  "sqlite3 '$REMOTE_DB' \".backup '${REMOTE_DB}.snapshot'\" && ls -la '${REMOTE_DB}.snapshot'"

echo "[fetch] scp snapshot ke lokal → $OUT"
sshpass -p "$PASS" scp -o StrictHostKeyChecking=no "$USER@$HOST:${REMOTE_DB}.snapshot" "$OUT"

echo "[fetch] cleanup snapshot di remote"
sshpass -p "$PASS" ssh -o StrictHostKeyChecking=no "$USER@$HOST" \
  "rm -f '${REMOTE_DB}.snapshot'"

echo "[fetch] selesai. file: $OUT ($(du -h "$OUT" | cut -f1))"
if command -v sqlite3 >/dev/null; then
  echo "[fetch] verifikasi: $(sqlite3 "$OUT" 'SELECT COUNT(*) FROM customers;') customers"
fi
