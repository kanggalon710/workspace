#!/bin/bash
# cPanel zero-touch auto-deploy.
#
# Pull the pre-built payload branch (deploy / deploy-dev), reinstall prod deps
# ONLY when package-lock changed, then restart the Passenger Node.js app - but
# only when something actually changed, so the app is not restarted on every
# cron tick.
#
# Placement: shipped in the deploy payload by .github/workflows/build.yml
# (it copies tools/*.sh), so after the first pull it lives at
#   ~/repositories/<repo>/tools/cpanel-autodeploy.sh
#
# Usage (via cron on cPanel):
#   */5 * * * * /bin/bash ~/repositories/workspace-main/tools/cpanel-autodeploy.sh deploy \
#     >> ~/private/workspace/logs/autodeploy.log 2>&1
#
# Arg 1: branch to track. "deploy" (prod, default) or "deploy-dev" (dev).
# Env NODEVENV_ACTIVATE: override the Node virtualenv activate script if the
#   auto-detect below does not find it.
set -uo pipefail

BRANCH="${1:-deploy}"
APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GIT="/usr/local/cpanel/3rdparty/bin/git"
[ -x "$GIT" ] || GIT="git"   # fallback if the cPanel git path differs
SLUG="$(basename "$APP_ROOT")"
ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

cd "$APP_ROOT" || { echo "$(ts) FATAL: cannot cd $APP_ROOT"; exit 1; }
mkdir -p tmp

# Prevent overlapping runs (a slow npm ci must not collide with the next tick).
if command -v flock >/dev/null 2>&1; then
  exec 9>"tmp/.autodeploy.lock"
  flock -n 9 || { echo "$(ts) another run in progress, skip"; exit 0; }
fi

"$GIT" fetch origin "$BRANCH" --quiet || { echo "$(ts) fetch failed"; exit 1; }

LOCAL="$("$GIT" rev-parse HEAD 2>/dev/null || echo none)"
REMOTE="$("$GIT" rev-parse "origin/$BRANCH" 2>/dev/null || echo none)"
if [ "$REMOTE" = "none" ]; then echo "$(ts) origin/$BRANCH not found"; exit 1; fi
if [ "$LOCAL" = "$REMOTE" ]; then exit 0; fi   # nothing new - no restart

echo "$(ts) deploying $BRANCH: ${LOCAL:0:7} -> ${REMOTE:0:7}"
OLD_LOCK="$(sha1sum package-lock.json 2>/dev/null | cut -d' ' -f1)"

# Orphan payload branch: history is force-rewritten each build, so hard reset
# (never merge/pull). Untracked node_modules is preserved by reset --hard.
"$GIT" reset --hard "origin/$BRANCH" --quiet || { echo "$(ts) reset failed"; exit 1; }

NEW_LOCK="$(sha1sum package-lock.json 2>/dev/null | cut -d' ' -f1)"
if [ "$OLD_LOCK" != "$NEW_LOCK" ]; then
  echo "$(ts) dependencies changed -> npm ci --omit=dev"
  ACTIVATE="${NODEVENV_ACTIVATE:-$(ls "$HOME"/nodevenv/repositories/"$SLUG"/*/bin/activate 2>/dev/null | head -1)}"
  if [ -n "$ACTIVATE" ] && [ -f "$ACTIVATE" ]; then
    # shellcheck disable=SC1090
    source "$ACTIVATE"
  else
    echo "$(ts) WARNING: node virtualenv activate not found; using PATH node"
  fi
  npm ci --omit=dev || echo "$(ts) WARNING: npm ci failed - app may fail to start until deps installed"
fi

touch tmp/restart.txt
echo "$(ts) done: reset to ${REMOTE:0:7}, Passenger restart requested"
