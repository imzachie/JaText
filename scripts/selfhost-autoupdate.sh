#!/usr/bin/env bash
#
# JaText self-host auto updater.
#
# Runs from a systemd timer. Pulls new commits from main, rebuilds the web app
# and restarts jatext.service, but only when there is something new and only
# when the build succeeds, so a bad commit can never take the live site down.
#
# Manual run:   sudo systemctl start jatext-autoupdate.service
# Logs:         sudo journalctl -u jatext-autoupdate -f
# Force now:    the same start command runs it immediately, the timer only
#               decides when it repeats.
#
# Safe to run by hand, it exits quietly when there is nothing to do.

set -uo pipefail

APP_DIR="${JATEXT_APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${JATEXT_BRANCH:-main}"
SERVICE="${JATEXT_SERVICE:-jatext.service}"
BUILD_LOG="$(mktemp -t jatext-autoupdate-XXXXXX.log)"

log() { printf '[jatext-autoupdate] %s\n' "$*"; }

cd "$APP_DIR" || { log "no app directory at $APP_DIR"; exit 1; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { log "$APP_DIR is not a git checkout"; exit 1; }

# Never pull on top of local edits: it fails halfway and leaves a dirty tree.
# package-lock.json is excluded on purpose: `npm install` rewrites it on the
# machine, and treating that as a local edit would silently stop every
# future update. The committed lockfile stays the source of truth.
DIRTY="$({ git diff --name-only; git diff --cached --name-only; } 2>/dev/null |
  grep -v '^package-lock\.json$' | sort -u || true)"
if [ -n "$DIRTY" ]; then
  log "local changes present in $APP_DIR, skipping this run so nothing is lost:"
  printf '    %s\n' $DIRTY
  log "resolve them, or remove the edits, and the next run will update again"
  exit 0
fi

git fetch --quiet origin "$BRANCH" || { log "git fetch failed (offline?), trying again next run"; exit 1; }

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "refs/remotes/origin/$BRANCH")"
if [ "$LOCAL" = "$REMOTE" ]; then
  # Nothing new. Stay silent so the journal only shows real updates.
  exit 0
fi

log "new commits on $BRANCH ($LOCAL -> $REMOTE):"
git --no-pager log --oneline "$LOCAL..$REMOTE" | sed 's/^/    /'

DEPS_BEFORE="$(git hash-object package.json package-lock.json 2>/dev/null | tr '\n' ' ')"

if ! git pull --ff-only origin "$BRANCH"; then
  log "git pull --ff-only failed, the live site keeps running the previous version"
  exit 1
fi

DEPS_AFTER="$(git hash-object package.json package-lock.json 2>/dev/null | tr '\n' ' ')"
if [ "$DEPS_BEFORE" != "$DEPS_AFTER" ]; then
  log "package.json or package-lock.json changed, running npm install"
  if ! npm install --no-audit --no-fund >"$BUILD_LOG" 2>&1; then
    log "npm install FAILED, keeping the running version:"
    tail -n 20 "$BUILD_LOG" | sed 's/^/    /'
    rm -f "$BUILD_LOG"
    exit 1
  fi
  # Keep the lockfile at whatever the commit says, so the tree stays clean and
  # the next run can still fast-forward.
  git checkout -- package-lock.json 2>/dev/null || true
fi

log "building the web app"
if ! npm run build >"$BUILD_LOG" 2>&1; then
  log "BUILD FAILED - the live site keeps running the previous version:"
  tail -n 25 "$BUILD_LOG" | sed 's/^/    /'
  rm -f "$BUILD_LOG"
  exit 1
fi
rm -f "$BUILD_LOG"

log "restarting $SERVICE"
if [ "$(id -u)" = "0" ]; then
  systemctl restart "$SERVICE"
else
  sudo -n systemctl restart "$SERVICE" || {
    log "could not restart $SERVICE without a password, see the sudoers rule in the self-host guide"
    exit 1
  }
fi

PORT="$(grep -E '^PORT=' "$APP_DIR/.env.selfhost" 2>/dev/null | tail -1 | cut -d= -f2)"
PORT="${PORT:-8787}"
sleep 3
if curl -fsS --noproxy '*' "http://127.0.0.1:${PORT}/api/auth-status" >/dev/null 2>&1; then
  log "update complete, now serving $(git rev-parse --short HEAD)"
else
  log "restarted but /api/auth-status did not answer yet, check: sudo journalctl -u $SERVICE -n 60"
fi
