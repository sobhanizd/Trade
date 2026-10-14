# Operations: monitoring, backups, updates, retention

## Monitoring

- **System status** page: last run/success/failures of each job, provider health
  (consecutive failures, last error, latency), candle freshness per asset and
  timeframe, configured integrations, failed deliveries in the last 24 h.
- **Dashboard** warns when the last successful scan is older than 20 minutes or a
  provider is failing.
- **System alerts** (if enabled) report provider failures and stale data at most
  once per 6 hours.
- **`GET /api/health`** (public, no details): `200` when the database is
  reachable, `503` otherwise, plus minutes since the last successful scan — point
  an uptime monitor (e.g. UptimeRobot, free tier) at it.
- **Logs**: JSON lines on stdout (`docker compose logs -f web worker`), with
  secrets redacted.

## Backups

```bash
./deploy/backup.sh          # pg_dump (custom format) into ./backups, keeps 14 days
```

Schedule nightly with host cron (example in the script header) and copy
`backups/` off the server (e.g. `rclone` to cloud storage, or an encrypted
off-site disk). The database is the only state; `.env` holds the secrets — back
it up separately and securely.

### Restore

```bash
docker compose stop web worker
docker compose exec -T db pg_restore -U cryptopilot -d cryptopilot --clean --if-exists < backups/cryptopilot-<stamp>.dump
docker compose start web worker
```

Test a restore occasionally on a scratch database.

## Updates

```bash
./deploy/backup.sh
git pull                                   # or copy the new version
docker compose --profile https up -d --build   # migrate runs automatically before web/worker
```

Dependency updates: `npm outdated`, update deliberately, then run
`npm run lint && npm run typecheck && npm test && npm run test:integration &&
npm run build && npm run test:e2e` before deploying. Review `npm audit`.

## Data retention (maintenance job, hourly)

| Data | Kept |
|---|---|
| 1h candles | 180 days |
| 4h candles | 2 years |
| 1d / 1w candles | indefinitely (small) |
| Notifications | 180 days |
| Job runs | 30 days |
| Analysis runs | 120 days |
| News headlines | 30 days |
| Audit events | 365 days |
| Expired sessions | removed |
| Signals, backtests, paper trades | kept until you delete them (Account page) |

Candles are cached market data from public providers; only what is needed for
analysis and backtests is retained.

## Common incidents

| Incident | Action |
|---|---|
| Provider failing (status page) | Usually transient; failover to Kraken is automatic. Persistent Binance 451 → geo-block: set `CANDLE_PROVIDERS=kraken,binance` |
| CoinGecko 429 | Add/rotate a Demo key; snapshot cadence is already budgeted (≈ 8 calls/hour) |
| Worker stopped | `docker compose restart worker`; check logs. Abandoned runs are auto-marked failed after 30 min |
| Database down | Web returns 503 and shows a clear error; `docker compose logs db` |
| Lost password | `docker compose run --rm worker npx tsx scripts/create-user.ts --email you@…` resets it |
