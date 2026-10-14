# Configuration

All secrets live in server-side environment variables (`.env`). None are sent to
the browser; the only browser-visible key is the **public** VAPID key, by design.
User preferences (watchlist, timeframes, risk, alert rules, theme, currency,
provider order, AI on/off) are stored per user in the database via **Settings**.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | yes | – | PostgreSQL connection string |
| `SESSION_SECRET` | yes | – | ≥ 32 chars random; HMAC key for session tokens and IP hashes. Changing it signs everyone out |
| `APP_URL` | yes (prod) | `http://localhost:3000` | Public URL; used for origin (CSRF) checks and links in alerts |
| `SESSION_TTL_DAYS` | no | 30 | Sliding session lifetime |
| `LOG_LEVEL` | no | info | debug / info / warn / error (JSON logs to stdout) |
| `CANDLE_PROVIDERS` | no | `binance,kraken` | Candle provider order (failover) |
| `COINGECKO_API_KEY` | recommended | – | Free Demo key raises rate limits |
| `COINGECKO_API_PLAN` | no | demo | `pro` uses the paid pro endpoint |
| `SENTIMENT_ENABLED` | no | true | Fear & Greed index (alternative.me) |
| `SCAN_CRON` / `SNAPSHOT_CRON` / `NEWS_CRON` / `MAINTENANCE_CRON` | no | `*/5`, `*/10`, `*/30` min, hourly | Quote them in `.env` |
| `TELEGRAM_BOT_TOKEN` | optional | – | See [NOTIFICATIONS.md](NOTIFICATIONS.md) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | optional | – | Any SMTP provider |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | optional | – | Browser push (`npm run vapid:generate`) |
| `ANTHROPIC_API_KEY` | optional | – | Enables the AI explainer |
| `ANTHROPIC_MODEL` | no | `claude-opus-5-5` | e.g. `claude-haiku-5-5` for ~40× lower cost |
| `ANTHROPIC_EFFORT` | no | medium | low / medium / high |
| `NEWS_ENABLED`, `NEWS_RSS_FEEDS` | no | CoinDesk, Cointelegraph, Decrypt RSS | Headlines + links only |
| `POSTGRES_PASSWORD`, `DOMAIN` | Docker only | – | Used by `docker-compose.yml` |

## Market-data providers

| Purpose | Provider | Auth | Notes |
|---|---|---|---|
| Candles (primary) | Binance public market data (`api.binance.com`, mirror `data-api.binance.vision`) | none | USDT pairs, up to 1000 candles/request, full history for backtests |
| Candles (fallback) | Kraken public OHLC | none | USD pairs, only the most recent 720 candles (no long backtests) |
| Prices, market cap, volume, % changes, global | CoinGecko | optional key | Keyless tier is heavily rate-limited |
| Sentiment | alternative.me Crypto Fear & Greed | none | Free; attribution shown in the UI |
| USD→EUR | ECB reference rate via frankfurter.dev | none | Daily rate; used for EUR display |
| News | RSS (configurable) | none | Titles + links only |

**Switching providers**: change `CANDLE_PROVIDERS` (server) or Settings →
Scanning → *Candle provider order* (per user). Providers implement the
`CandleProvider` interface in `src/lib/market/types.ts`; adding one means writing
a small adapter and registering it in `src/lib/market/providers/index.ts`.

**USD vs EUR**: signals, levels and backtests use the analysis pair's quote
(USDT on Binance, USD on Kraken — treated as ≈ USD). With EUR display selected,
market data is converted from USD at the ECB reference rate (labelled in the UI;
percentage changes remain USD-based) and signal pages show an “≈ €” conversion.

**Toman**: there is no reliable free source for the open-market rate, so the
euro → Toman rate is entered by each user (home page, currency menu or Settings).
It starts at **1 € = 300,000 Toman** (`DEFAULT_TOMAN_PER_EUR` in
`src/lib/settings/schema.ts`) and is labelled "starting value" until the user
saves their own rate; a rate older than 7 days is flagged for an update.

## Liquidity & data-quality filters

New watchlist assets must pass (Settings → Scanning): minimum market cap
(default $500M), minimum 24h volume ($10M), minimum daily history (200 days), a
USD(T) pair on Binance or Kraken, and be in CoinGecko's top 250. Stablecoins and
wrapped tokens are always excluded. The watchlist is capped at 25 assets to stay
within free API limits.

## AI explainer

Optional. Set `ANTHROPIC_API_KEY`. The explainer receives only stored analysis
(signals, indicator values, strategy rules, backtest summaries, paper-trading
summary) plus headline titles wrapped as *untrusted* text, and must say when data
is missing. Without a key (or with AI disabled in Settings) the page shows a
deterministic rule-by-rule explanation instead. Server-side refusal fallbacks are
enabled for Opus/Sonnet 5.5 models.
