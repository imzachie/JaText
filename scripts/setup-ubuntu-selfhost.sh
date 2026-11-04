#!/usr/bin/env bash
#
# JaText 24/7 self-hosting installer for Ubuntu laptops.
#
# Installs and wires up, in one shot:
#   1. Never-sleep settings (lid close included)
#   2. PostgreSQL 16 with the jatext role + database
#   3. The JaText source tree (private repo, via GitHub CLI login, no password prompts)
#   4. The production web build (dist/)
#   5. A systemd service (jatext.service) running web + API 24/7
#   6. cloudflared, ready for a permanent Cloudflare Tunnel HTTPS URL
#
# Usage:
#   bash scripts/setup-ubuntu-selfhost.sh
#
# Safe to re-run: existing credentials and the existing .env.selfhost are preserved.

set -euo pipefail

APP_REPO="${APP_REPO:-Ahad00010/JaText}"
APP_BRANCH="${APP_BRANCH:-main}"
APP_DIR="${APP_DIR:-$HOME/JaText}"
DOMAIN="${DOMAIN:-jatext.us.ci}"
ENV_FILE="$APP_DIR/.env.selfhost"
SERVICE_NAME="jatext.service"

log()  { printf '\n\e[1;36m==> %s\e[0m\n' "$*"; }
info() { printf '    %s\n' "$*"; }
warn() { printf '\e[1;33m    ! %s\e[0m\n' "$*"; }
die()  { printf '\n\e[1;31mERROR: %s\e[0m\n' "$*" >&2; exit 1; }

command -v sudo >/dev/null 2>&1 || die "sudo is required. Run this on Ubuntu as your normal user."
export DEBIAN_FRONTEND=noninteractive
APT_LOCK_OPTS=(-o DPkg::Lock::Timeout=180)

log "1/8  Keeping Ubuntu awake 24/7 (lid close included)"
sudo mkdir -p /etc/systemd/logind.conf.d
sudo tee /etc/systemd/logind.conf.d/99-jatext-24-7.conf >/dev/null <<'EOF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
EOF
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1 || true
sudo systemctl daemon-reload
# IMPORTANT: never restart systemd-logind here. Doing so tears down the running
# graphical session and on some laptops the login screen does not come back.
# The logind config above simply takes effect on the next reboot.
if command -v gsettings >/dev/null 2>&1; then
  sudo -u "$USER" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus" \
    gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing' \
    >/dev/null 2>&1 || true
  sudo -u "$USER" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus" \
    gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing' \
    >/dev/null 2>&1 || true
fi
info "Lid close and idle will no longer suspend the machine."
info "The logind part applies on the next reboot (we never restart logind, it would kill your session)."

log "2/8  Installing system packages (PostgreSQL, Node 20, GitHub CLI, cloudflared)"
sudo apt-get "${APT_LOCK_OPTS[@]}" update -qq
sudo apt-get "${APT_LOCK_OPTS[@]}" install -y -qq \
  postgresql postgresql-contrib git curl ca-certificates openssl gnupg jq

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  info "Installing Node.js 20 from NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get "${APT_LOCK_OPTS[@]}" install -y -qq nodejs
fi
info "Node: $(node -v)"

if ! command -v gh >/dev/null 2>&1; then
  info "Installing the GitHub CLI"
  (type -p wget >/dev/null || sudo apt-get "${APT_LOCK_OPTS[@]}" install -y -qq wget) || true
  sudo mkdir -p -m 755 /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg |
    sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
  sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg || true
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" |
    sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
  sudo apt-get "${APT_LOCK_OPTS[@]}" update -qq
  sudo apt-get "${APT_LOCK_OPTS[@]}" install -y -qq gh
fi
info "gh: $(gh --version | head -n1)"

if ! command -v cloudflared >/dev/null 2>&1; then
  info "Installing cloudflared (Cloudflare Tunnel)"
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg |
    sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" |
    sudo tee /etc/apt/sources.list.d/cloudflared.list >/dev/null
  sudo apt-get "${APT_LOCK_OPTS[@]}" update -qq
  sudo apt-get "${APT_LOCK_OPTS[@]}" install -y -qq cloudflared
fi
info "cloudflared: $(cloudflared --version | head -n1)"

log "3/8  Starting PostgreSQL on boot"
sudo systemctl enable --now postgresql
for _ in $(seq 1 30); do
  sudo -u postgres pg_isready -q && break
  sleep 1
done
sudo -u postgres pg_isready || die "PostgreSQL did not start. Run: sudo systemctl status postgresql"

log "4/8  Creating the jatext PostgreSQL role and database"
if [ ! -f "$ENV_FILE" ]; then
  DB_PASS="$(openssl rand -hex 24)"
  AUTH_SECRET_VALUE="$(openssl rand -hex 32)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'jatext') THEN
    CREATE ROLE jatext WITH LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE jatext WITH LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
SQL
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='jatext'" | grep -q 1 ||
    sudo -u postgres createdb -O jatext jatext
  sudo -u postgres psql -d jatext -v ON_ERROR_STOP=1 <<'SQL'
GRANT ALL PRIVILEGES ON DATABASE jatext TO jatext;
GRANT ALL ON SCHEMA public TO jatext;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO jatext;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO jatext;
SQL
  mkdir -p "$APP_DIR"
  cat >"$ENV_FILE" <<EOF
DATABASE_URL=postgresql://jatext:${DB_PASS}@127.0.0.1:5432/jatext
AUTH_SECRET=${AUTH_SECRET_VALUE}
PUBLIC_APP_ORIGIN=https://${DOMAIN}
PORT=8787
HOST=127.0.0.1
EOF
  chmod 600 "$ENV_FILE"
  info "Wrote $ENV_FILE (keep it secret, it is gitignored)"
else
  info "$ENV_FILE already exists, keeping your existing credentials untouched."
fi

log "5/8  Getting the JaText source code"
if ! gh auth status >/dev/null 2>&1; then
  info "Logging in to GitHub in your browser (private repo, no password typing needed)"
  gh auth login -h github.com -p https -w || die "GitHub login failed. Run: gh auth login"
fi
if [ -d "$APP_DIR/.git" ]; then
  info "Existing checkout found at $APP_DIR, updating it"
  git -C "$APP_DIR" fetch --all --prune || true
  git -C "$APP_DIR" checkout "$APP_BRANCH" || true
  git -C "$APP_DIR" pull --ff-only || warn "Could not fast-forward $APP_DIR, keeping your local files."
else
  gh repo clone "$APP_REPO" "$APP_DIR" -- -b "$APP_BRANCH"
fi

log "6/8  Installing Node dependencies and building the web app"
cd "$APP_DIR"
npm install --no-audit --no-fund
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
npm run build
info "Web build ready at $APP_DIR/dist"

log "7/8  Installing the 24/7 systemd service ($SERVICE_NAME)"
# Remove the older PostgreSQL bridge service if it is still around from a previous setup.
if systemctl list-unit-files 2>/dev/null | grep -q "jatext-pg-bridge.service"; then
  info "Disabling the legacy jatext-pg-bridge.service (no longer needed, the app now talks to PostgreSQL directly)"
  sudo systemctl disable --now jatext-pg-bridge.service >/dev/null 2>&1 || true
  sudo rm -f /etc/systemd/system/jatext-pg-bridge.service
  sudo systemctl daemon-reload
fi
NODE_BIN="$(command -v node)"
sed -e "s|__JATEXT_USER__|$USER|g" \
    -e "s|__JATEXT_DIR__|$APP_DIR|g" \
    -e "s|__JATEXT_NODE__|$NODE_BIN|g" \
    "$APP_DIR/scripts/jatext.service" | sudo tee "/etc/systemd/system/$SERVICE_NAME" >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now "$SERVICE_NAME"
sleep 3
if curl -fsS "http://127.0.0.1:8787/api/auth-status" >/tmp/jatext-auth-status.json 2>/dev/null; then
  info "Local server response:"
  sed 's/^/      /' /tmp/jatext-auth-status.json
  echo
else
  warn "The service is starting. Check it with: sudo journalctl -u $SERVICE_NAME -f"
fi

log "8/8  Cloudflare Tunnel (your permanent public HTTPS URL)"
if ! sudo test -f /etc/cloudflared/config.yml; then
  cat <<EOF

  Almost done. Run these three commands to publish JaText on https://${DOMAIN}:

    1) cloudflared tunnel login
       (opens your browser, pick ${DOMAIN}, click Authorize)

    2) cloudflared tunnel create jatext
       cloudflared tunnel route dns jatext ${DOMAIN}

    3) Write the tunnel config, then start it 24/7:

       sudo mkdir -p /etc/cloudflared
       sudo tee /etc/cloudflared/config.yml >/dev/null <<'YML'
       url: http://127.0.0.1:8787
       tunnel: jatext
       credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
       YML
       sudo cloudflared service install
       sudo systemctl enable --now cloudflared

  Replace <TUNNEL_ID> with the id printed by 'cloudflared tunnel create jatext'.
  Full walkthrough: ${APP_DIR}/docs/UBUNTU-SELFHOST.md
EOF
else
  info "An existing /etc/cloudflared/config.yml was detected, leaving it untouched."
  sudo systemctl enable --now cloudflared || true
fi

cat <<EOF

==============================================================
 JaText is now self-hosted on this machine.

   Local health : curl http://127.0.0.1:8787/api/auth-status
   Live logs    : sudo journalctl -u ${SERVICE_NAME} -f
   Restart      : sudo systemctl restart ${SERVICE_NAME}
   Backup DB    : sudo -u postgres pg_dump -Fc jatext > ~/jatext-backup-\$(date +%F).dump

 Next: finish the Cloudflare Tunnel steps above, then open
       https://${DOMAIN} and sign in.
==============================================================
EOF
