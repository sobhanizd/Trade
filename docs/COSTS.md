# Estimated monthly operating costs

Prices change — verify with each provider before relying on these figures
(estimates as of October 2026).

| Item | Option | Estimated cost / month |
|---|---|---|
| Server | Small VPS, 2 vCPU / 2–4 GB RAM (e.g. Hetzner CX-class) | ≈ €4–8 |
| Domain | Any registrar (`.com` ≈ €10–15/year) | ≈ €1 |
| HTTPS certificate | Let's Encrypt via Caddy | €0 |
| Database | PostgreSQL in Docker on the same VPS | €0 |
| Candles | Binance / Kraken public market data | €0 |
| Market overview | CoinGecko keyless or free Demo key | €0 |
| Sentiment / FX / news | alternative.me, ECB (frankfurter), RSS | €0 |
| Telegram | Bot API | €0 |
| Email | SMTP provider free tier (volume here is tiny) | €0 |
| Browser push | Web Push via browser vendors | €0 |
| Off-site backups | Object storage, a few GB | ≈ €0–1 |
| AI explainer (optional) | Anthropic API, pay per use | see below |
| **Total without AI** | | **≈ €5–10** |

## API budgets built into the app

- **CoinGecko**: 1 markets call per snapshot (every 10 min) + `/global` every
  30 min ≈ 8 calls/hour ≈ 5,800/month, plus one call per new watchlist asset
  (cached 1 h). This fits the free Demo plan's monthly allowance (check the
  current limit on CoinGecko's pricing page). Keyless use also works but is
  rate-limited more aggressively. Paid CoinGecko plans are **not** required.
- **Binance**: about 2 kline requests per asset × timeframe every 5 minutes —
  far below the public weight limits.
- **Watchlist cap**: 25 assets.

## AI explainer (optional)

Charged per token by Anthropic (list prices at the time of writing, per million
tokens, input / output):

| Model | Price | Est. cost per question* | 100 questions/month |
|---|---|---|---|
| `claude-opus-5-5` (default) | $4 / $20 | ≈ $0.04–0.08 | ≈ $4–8 |
| `claude-sonnet-5-5` | $2 / $10 | ≈ $0.02–0.04 | ≈ $2–4 |
| `claude-haiku-5-5` | $0.10 / $0.50 | ≈ $0.001–0.002 | < $0.20 |

\*Assumes ~5–8k input tokens of analysis context and ~1–2k output tokens
(including reasoning) at `ANTHROPIC_EFFORT=medium`. Set a monthly spend limit in
the Anthropic Console. Without a key the app uses free rule-based explanations.
