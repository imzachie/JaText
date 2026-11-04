#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# JaText 24/7 Ubuntu Laptop PostgreSQL + Bridge Setup Script
# Run inside the cloned JaText folder on Ubuntu:
#   chmod +x scripts/setup-ubuntu-postgres.sh
#   ./scripts/setup-ubuntu-postgres.sh
# ==============================================================================

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${JATEXT_PG_DB:-jatext}"
DB_USER="${JATEXT_PG_USER:-jatext}"
DB_PASS="${JATEXT_PG_PASS:-$(openssl rand -hex 24)}"
BRIDGE_SECRET="${POSTGRES_BRIDGE_SECRET:-$(openssl rand -hex 32)}"
AUTH_SECRET_VAL="${AUTH_SECRET:-$(openssl rand -hex 32)}"
BRIDGE_PORT="${PG_BRIDGE_PORT:-8787}"
RUN_USER="${SUDO_USER:-$USER}"

echo "==> [1/6] Preventing Ubuntu laptop from sleeping when the lid is closed..."
sudo mkdir -p /etc/systemd/logind.conf.d
sudo tee /etc/systemd/logind.conf.d/99-jatext-24-7.conf >/dev/null <<'EOF'
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
EOF
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null 2>&1 || true
sudo systemctl restart systemd-logind || true

echo "==> [2/6] Installing PostgreSQL, Node.js 20+, and OpenSSL..."
sudo apt-get update -y
sudo apt-get install -y postgresql postgresql-contrib curl ca-certificates openssl

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "==> [3/6] Enabling PostgreSQL 24/7 service and creating '${DB_NAME}' database..."
sudo systemctl enable --now postgresql

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;

SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec

GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
SQL

sudo -u postgres psql -d "${DB_NAME}" -v ON_ERROR_STOP=1 <<SQL
GRANT ALL ON SCHEMA public TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};
SQL

echo "==> [4/6] Writing ${REPO_DIR}/.env.postgres and installing npm packages..."
ENV_FILE="${REPO_DIR}/.env.postgres"
if [ ! -f "${ENV_FILE}" ]; then
  cat > "${ENV_FILE}" <<EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}
POSTGRES_BRIDGE_SECRET=${BRIDGE_SECRET}
AUTH_SECRET=${AUTH_SECRET_VAL}
PG_BRIDGE_HOST=127.0.0.1
PG_BRIDGE_PORT=${BRIDGE_PORT}
EOF
  chmod 600 "${ENV_FILE}"
  chown "${RUN_USER}:${RUN_USER}" "${ENV_FILE}" 2>/dev/null || true
else
  echo "    Existing .env.postgres found, keeping your saved credentials."
fi

cd "${REPO_DIR}"
sudo -u "${RUN_USER}" npm install --no-audit --no-fund

echo "==> [5/6] Creating 24/7 systemd service (jatext-pg-bridge.service)..."
NODE_BIN="$(command -v node)"
sudo tee /etc/systemd/system/jatext-pg-bridge.service >/dev/null <<EOF
[Unit]
Description=JaText 24/7 PostgreSQL HTTPS Bridge
After=network-online.target postgresql.service
Wants=network-online.target
Requires=postgresql.service

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${REPO_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${NODE_BIN} ${REPO_DIR}/server/pgBridgeServer.js
Restart=always
RestartSec=3
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now jatext-pg-bridge.service
sleep 2

echo "==> [6/6] Verifying local PostgreSQL + Bridge health..."
curl -fsS "http://127.0.0.1:${BRIDGE_PORT}/health" && echo ""

echo ""
echo "=================================================================="
echo " JaText PostgreSQL is LIVE 24/7 on your Ubuntu laptop!"
echo " Credentials saved in: ${ENV_FILE}"
echo " Next: run 'sudo tailscale funnel --bg ${BRIDGE_PORT}' to get your"
echo " public HTTPS URL, then paste POSTGRES_BRIDGE_URL,"
echo " POSTGRES_BRIDGE_SECRET, and AUTH_SECRET into Vercel Env Vars."
echo "=================================================================="
