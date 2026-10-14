# Local setup

## Requirements

- Node.js 20.19+ (developed on Node 24) and npm 11
- PostgreSQL 14+ (local install, or `docker compose up db`)
- Internet access to public market-data APIs (Binance, Kraken, CoinGecko, …)

## 1. Install

```bash
npm install
```

npm 11 blocks dependency install scripts by default. The required ones (Prisma
engines, esbuild, unrs-resolver) are already approved in `package.json` →
`allowScripts`. If npm warns about them, run `npm install-scripts ls` and approve
only those four.

## 2. Database

Create a role and databases (example for a local PostgreSQL):

```sql
CREATE ROLE cryptopilot LOGIN PASSWORD 'choose-a-password' CREATEDB;
CREATE DATABASE cryptopilot OWNER cryptopilot;
CREATE DATABASE cryptopilot_test OWNER cryptopilot;   -- integration tests
CREATE DATABASE cryptopilot_e2e OWNER cryptopilot;    -- end-to-end tests
```

## 3. Environment

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # → SESSION_SECRET
npm run vapid:generate                                                       # → VAPID keys (optional)
```

Edit `.env`: set `DATABASE_URL`, `SESSION_SECRET` and (optionally) the VAPID keys,
`COINGECKO_API_KEY`, Telegram/SMTP and `ANTHROPIC_API_KEY`. See
[CONFIGURATION.md](CONFIGURATION.md).

## 4. Migrate, seed, create your account

```bash
npx prisma migrate deploy
npm run db:seed                                   # default assets + strategy definitions
npm run user:create -- --email you@example.com    # prompts for a password (min 12 chars)
```

The new account gets the default watchlist (BTC, ETH, SOL, XRP, BNB) and
conservative default settings. Re-running `user:create` for an existing email
resets the password and signs out all sessions.

## 5. Run

```bash
npm run build && npm start     # http://localhost:3000
npm run worker                 # second terminal — scans, snapshots, news, alerts
```

The worker populates data immediately on start, then runs on its schedule. The
web app works without the worker, but signals and alerts only update while the
worker runs (or when you press **Refresh** in the header).

For development with hot reload use `npm run dev` instead of build/start.

## 6. Tests

```bash
npm test                    # unit
npm run test:integration    # needs the cryptopilot_test database
npm run build && npm run test:e2e   # needs cryptopilot_e2e, Chromium (npx playwright install chromium) and internet
```

Integration tests refuse to run against a database whose name does not contain
`test`; E2E setup refuses databases without `e2e` in the name. Both empty their
database before running.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Dashboard says “Scans are not running recently” | Start `npm run worker` |
| “Data provider issues: coingecko HTTP 429” | Keyless CoinGecko is rate-limited — add a free Demo key (`COINGECKO_API_KEY`) |
| Binance returns HTTP 451/403 | Binance is geo-restricted in some regions — set `CANDLE_PROVIDERS=kraken,binance` |
| Login fails with “Cross-origin request rejected” | `APP_URL` must match the URL in your browser |
| Push “Enable on this device” fails on iPhone | Install the app to the Home Screen first (iOS 16.4+), open it from there |
