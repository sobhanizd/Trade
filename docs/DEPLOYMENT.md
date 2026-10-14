# Deployment

Recommended for one person: a small Linux VPS running Docker Compose (PostgreSQL,
web, worker, Caddy for automatic HTTPS). Total cost is typically a few euros per
month — see [COSTS.md](COSTS.md).

Why not a serverless host? The worker must run continuously (scans every 5
minutes, independent of any browser). Serverless platforms need a separate cron
service and managed database; possible, but more moving parts and usually more
cost.

## 1. Server

- Any VPS with ≥ 2 GB RAM (e.g. Hetzner, Netcup, OVH, DigitalOcean), Ubuntu LTS.
- A domain (or subdomain) with an `A`/`AAAA` record pointing to the server.
- Install Docker Engine + Compose plugin. Firewall: allow 22, 80, 443 only.

## 2. Configure

```bash
git clone <your repo> /opt/cryptopilot && cd /opt/cryptopilot   # or copy the folder
cp .env.example .env && chmod 600 .env
```

Edit `.env`:

```
APP_URL=https://cryptopilot.yourdomain.com
DOMAIN=cryptopilot.yourdomain.com
SESSION_SECRET=<64 hex chars>
POSTGRES_PASSWORD=<long random>
# DATABASE_URL is set by docker-compose from POSTGRES_PASSWORD
COINGECKO_API_KEY=<free demo key, recommended>
# optional: TELEGRAM_BOT_TOKEN, SMTP_*, VAPID keys, ANTHROPIC_API_KEY
```

## 3. Start

```bash
docker compose --profile https up -d --build
docker compose run --rm worker npx tsx scripts/create-user.ts --email you@example.com
```

`migrate` applies database migrations and seeds reference data before `web` and
`worker` start. Caddy obtains a Let's Encrypt certificate for `DOMAIN`
automatically. Check `https://<domain>/api/health` and the **System status** page.

Without a domain (local network only): `docker compose up -d --build` exposes the
app on `127.0.0.1:3000`; use an SSH tunnel or a VPN (e.g. Tailscale) to reach it.
Browser push and PWA install require HTTPS (or localhost).

## 4. Install on iPhone / Mac

- **iPhone**: Safari → open your URL → Share → *Add to Home Screen*. Open it from
  the icon (required for push notifications, iOS 16.4+).
- **Mac**: Chrome/Edge → install icon in the address bar, or Safari → File →
  *Add to Dock*.

## Without Docker

Run PostgreSQL, then on the server: `npm ci && npm run build`,
`npx prisma migrate deploy && npm run db:seed`, and run `npm start` and
`npm run worker` under a process manager (systemd, pm2). Put a TLS reverse proxy
(Caddy/nginx) in front of port 3000.

## Updating

See [OPERATIONS.md](OPERATIONS.md#updates).
