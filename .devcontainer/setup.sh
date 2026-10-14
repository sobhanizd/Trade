#!/usr/bin/env bash
# One-time setup of the live demo: config, packages, database, demo account, production build.
set -euo pipefail
cd "$(dirname "$0")/.."

DEMO_USER=demo
DEMO_PASSWORD=cryptopilot-demo

if [ ! -f .env ]; then
  # In Codespaces the app is reached through a forwarded https address, not localhost.
  url="http://localhost:3000"
  if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
    url="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  fi
  cp .env.example .env
  sed -i \
    -e "s|^NODE_ENV=.*|NODE_ENV=production|" \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://cryptopilot:cryptopilot@localhost:5432/cryptopilot|" \
    -e "s|^APP_URL=.*|APP_URL=${url}|" \
    -e "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -hex 32)|" \
    .env
  printf '\n# Live demo account (shown on the login page)\nDEMO_LOGIN=%s:%s\n' "$DEMO_USER" "$DEMO_PASSWORD" >> .env
fi

npm ci --no-audit --no-fund

echo "Waiting for the database…"
for _ in $(seq 1 60); do (echo > /dev/tcp/127.0.0.1/5432) 2>/dev/null && break; sleep 1; done

npm run db:generate
npx prisma migrate deploy
npm run db:seed
CP_PASSWORD="$DEMO_PASSWORD" npx tsx scripts/create-user.ts --username "$DEMO_USER"
npm run build
echo "Setup finished."
