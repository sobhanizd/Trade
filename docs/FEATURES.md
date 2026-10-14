# Features & limitations

## Implemented

**Market data**
- Binance → Kraken candle failover behind a provider interface; provider health
  tracking; retries, timeouts, Retry-After handling and rate limiting.
- CoinGecko market overview (price, 1h/24h/7d/30d change, market cap, volume),
  global market cap & BTC dominance, Fear & Greed sentiment, ECB USD→EUR rate.
- Data-quality gate (stale, gaps, duplicates, invalid OHLC, extreme moves).
- Liquidity-filtered watchlist (market cap, volume, history, exchange listing;
  stablecoins/wrapped tokens excluded).

**Analysis**
- Indicators: SMA, EMA, RSI, MACD, Bollinger, ATR, ADX, volume ratio, ROC, slope,
  realised volatility, support/resistance — tested against independent references.
- Five configurable strategies with documented rules, invalidation, targets,
  expiry and enable/disable; cross-strategy contradiction detection.
- Seven signal states incl. NO SIGNAL with reasons; entry zone, invalidation,
  targets, net reward/risk, risks, conflicts, data issues, rule checklist,
  backtest evidence, status history.
- Market trend, volatility regime, breadth, per-asset risk class.

**Tools**
- Interactive candlestick charts (1h/4h/1d/1w) with volume, EMA20/50, SMA200,
  Bollinger, RSI & MACD panes, S/R lines, signal markers and setup levels.
- Risk calculator with fees, slippage, position cap (no leverage) and warnings.
- Backtester: next-open fills, intrabar stops, costs, in/out-of-sample split,
  benchmark, equity curve, full trade list, bias warnings.
- Paper trading: manual and automatic (every qualifying signal), stop/target
  monitoring.
- AI explainer (optional, grounded, refusal-fallback enabled) with deterministic
  fallback.
- News headlines (RSS) with asset tagging, opinion and significance heuristics.

**Alerts**
- In-app, Telegram, email and Web Push; signal, exit, change, invalidation,
  price, volatility and system alerts; quiet hours, hourly cap, cooldown,
  deduplication, retries.

**Platform**
- Authenticated single-owner app, sessions management, data export & deletion.
- Responsive UI (desktop, tablet, phone), dark/light/system theme, PWA with
  offline page, accessible labels, loading/empty/error/offline states.
- Background worker with idempotent jobs, job-run history, retention.
- Docker images, Compose stack with HTTPS, backups script.
- Tests: 95 unit, 30 integration (PostgreSQL), 14 end-to-end (Playwright,
  desktop + iPhone viewport).

## Verified in this environment

- Real data from Binance, Kraken, CoinGecko, alternative.me, ECB and RSS feeds.
- Worker scans produce signals; repeated scans are idempotent.
- Production build, Docker images and the full Compose stack (migrate → web →
  worker) start and pass health checks.
- Email delivery through the app's SMTP channel (to an Ethereal test inbox).
- No secret values in client bundles.

## Not verified here (needs your credentials)

- **Telegram** delivery — implemented and unit/integration-tested with stubs;
  needs your bot token. Use *Send test* after setup.
- **Browser push** to a real device — implemented (VAPID, service worker,
  subscription storage, expiry cleanup); needs HTTPS and your browser/iPhone.
- **AI explainer** against the live Anthropic API — implemented per the SDK
  documentation; needs `ANTHROPIC_API_KEY`. Without it the deterministic fallback
  (tested) is used.
- Your own **SMTP provider** — the code path is verified with a test SMTP server.

## Known limitations & next steps

- Data timeliness is minutes, not seconds: scans run every 5 minutes on closed
  candles; there is no WebSocket streaming. Next step: add a Binance WebSocket
  ticker for live prices on the asset page and faster price alerts.
- Price alerts are evaluated with each snapshot (~10 minutes).
- Kraken fallback quotes USD (not USDT) and has only 720 recent candles.
- News significance and opinion labels are keyword heuristics; there is no
  verified-facts pipeline. AI “why it may matter” is not generated automatically.
- Rate limiting is in-memory (fine for one instance); multiple web instances
  would need a shared store.
- CSP permits inline scripts (Next.js bootstrap); nonce-based CSP is a possible
  hardening step.
- Strategies are rule-based; no machine-learning models are included (by design,
  until the rule-based evidence base is established).
- Backtests use fixed slippage and cannot model liquidity, outages or taxes.
- The empty `index.html` in the project root was pre-existing and is unused.
