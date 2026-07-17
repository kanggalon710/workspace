#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# JABNET Workspace v4.2.0 — Production Deploy Script
# Target: fiber-tools.arkanova.id (103.194.46.164)
# Created: 2026-04-24
# ═══════════════════════════════════════════════════════════════════

set -e  # Exit on any error

# ── Colors ──
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  JABNET Workspace v4.2.0 — Production Deploy${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

# ── Check we're in the right directory ──
if [ ! -f "package.json" ] || [ ! -d "dist" ]; then
  echo -e "${RED}❌ Error: jalankan script dari dalam /Users/galon/Jabnet/OLT/ftth-v411/${NC}"
  exit 1
fi

VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}✓ Project version: ${VERSION}${NC}"
echo ""

# ── 1. Verify dist is fresh ──
echo -e "${YELLOW}[1/6]${NC} Verify build artifacts..."
if [ ! -f "dist/index.mjs" ]; then
  echo -e "${RED}❌ dist/index.mjs tidak ada — run 'npm run build' dulu${NC}"
  exit 1
fi
if [ ! -d "dist/public" ]; then
  echo -e "${RED}❌ dist/public tidak ada — run 'npm run build' dulu${NC}"
  exit 1
fi
echo -e "${GREEN}   ✓ dist/index.mjs ($(du -h dist/index.mjs | cut -f1))${NC}"
echo -e "${GREEN}   ✓ dist/public ($(du -sh dist/public | cut -f1))${NC}"
echo ""

# ── 2. Test SSH connection ──
echo -e "${YELLOW}[2/6]${NC} Test SSH ke jabnet..."
ssh jabnet "echo 'connected'; hostname; date" || {
  echo -e "${RED}❌ SSH connection gagal — cek ~/.ssh/config${NC}"
  exit 1
}
echo -e "${GREEN}   ✓ SSH OK${NC}"
echo ""

# ── 3. Check current production status ──
echo -e "${YELLOW}[3/6]${NC} Cek production status saat ini..."
ssh jabnet "pm2 list | grep ftth-tools || echo 'ftth-tools not running yet'"
echo ""

# ── 4. Backup current production ──
echo -e "${YELLOW}[4/6]${NC} Backup production lama..."
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
ssh jabnet "cd /var/www/ftth-tools && \
  mkdir -p /var/www/_backups && \
  tar -czf /var/www/_backups/ftth-tools_backup_${TIMESTAMP}.tar.gz dist/ 2>/dev/null || echo 'No existing dist — first deploy'"
echo -e "${GREEN}   ✓ Backup: /var/www/_backups/ftth-tools_backup_${TIMESTAMP}.tar.gz${NC}"
echo ""

# ── 5. Rsync dist ──
echo -e "${YELLOW}[5/6]${NC} Rsync dist/ ke production..."
rsync -avz --delete \
  --exclude='*.map' \
  dist/ jabnet:/var/www/ftth-tools/dist/
echo -e "${GREEN}   ✓ Rsync complete${NC}"
echo ""

# ── 6. Restart PM2 ──
echo -e "${YELLOW}[6/6]${NC} Restart PM2 process..."
ssh jabnet "cd /var/www/ftth-tools && pm2 restart ftth-tools --update-env && pm2 save"
echo ""

# ── Post-deploy verification ──
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Deploy v4.2.0 berhasil!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Verification:${NC}"
ssh jabnet "pm2 list | grep ftth-tools"
echo ""
echo -e "${YELLOW}Production URL:${NC} https://fiber-tools.arkanova.id"
echo -e "${YELLOW}Backup file:${NC} /var/www/_backups/ftth-tools_backup_${TIMESTAMP}.tar.gz"
echo ""
echo -e "${GREEN}Rollback command (kalau ada masalah):${NC}"
echo "  ssh jabnet \"cd /var/www/ftth-tools && \\"
echo "    rm -rf dist && \\"
echo "    tar -xzf /var/www/_backups/ftth-tools_backup_${TIMESTAMP}.tar.gz && \\"
echo "    pm2 restart ftth-tools\""
echo ""
