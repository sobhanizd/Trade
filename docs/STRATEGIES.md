# Indicators, strategies and signals

Code: `src/lib/indicators`, `src/lib/strategies`, `src/lib/signals/evaluate.ts`.
The in-app **Strategies** page shows the same rules and lets you edit parameters,
timeframes and enable/disable each strategy.

## Principles

- **Closed candles only.** The forming candle is never analysed (no repainting).
- **Causal indicators.** A value at bar *i* uses only bars ≤ *i*; a property test
  checks that evaluating with and without future candles gives identical results.
- **Missing data stays missing.** Warm-up periods return `null`; a rule that needs
  unavailable data is shown as *not evaluable* and treated as not met.
- **Data gate.** Before any strategy runs, candles are checked for staleness
  (> 2 intervals old), insufficient history, gaps (> 2% missing), conflicting
  duplicates, non-positive or inconsistent OHLC. Any blocking issue → `NO_SIGNAL`
  with the reasons listed. Extreme single-bar moves and minor gaps are warnings.
- **Long-only spot.** “Sell/exit” states refer to exiting or avoiding a long
  position; nothing suggests short-selling or leverage.

## Indicators (verified)

SMA, EMA (SMA-seeded), RSI (Wilder), MACD (12/26/9), Bollinger Bands (20, 2σ,
population σ), ATR (Wilder), ADX/±DI (Wilder), volume ratio (vs. the *previous*
N-bar average), ROC, MA slope, realised volatility, and support/resistance from
clustered swing pivots (3 bars each side, confirmed only after the right-hand bars
close, clustered within 0.5 × ATR). Unit tests check them against an independent
pandas implementation and the published RSI worked example.

## Signal states

| State | Meaning |
|---|---|
| STRONG BUY SETUP | All of the strategy's setup rules and confirmations are met |
| POTENTIAL BUY | Setup rules met, some confirmation missing |
| HOLD / WAIT | Conditions forming or mixed — the strategy is waiting |
| POTENTIAL SELL | Exit conditions partially met (weakening) |
| EXIT SETUP | The strategy's exit rules are met |
| NO CLEAR OPPORTUNITY | The strategy's preconditions are absent |
| NO SIGNAL | Data failed quality checks; reasons are shown |

“*x of y rules met*” is a count, **not** a probability or confidence score. The app
never shows win probabilities.

## Common signal fields

- **Entry zone**: `[close − 0.5 × ATR, close]` unless the strategy defines a
  tighter zone (pullback/breakout/swing clamp it above the invalidation level).
- **Invalidation**: strategy-specific (below). For exit states it is the level
  above which the exit condition is cancelled.
- **Targets**: risk multiples *R* above the reference entry (R = entry −
  invalidation), plus measured-move / nearest-resistance targets where defined.
- **Reward/risk**: to the first target, **after** fees and slippage on both legs
  (Settings → Risk).
- **Risks/conflicts**: elevated volatility (ATR% above 1.5/3/6/15 % on 1h/4h/1d/1w),
  candle range > 3 × ATR, overbought RSI, resistance below the first target, R/R
  < 1, and **contradictions** when other strategies on the same timeframe signal
  the opposite direction.
- **Expiry**: re-evaluated at every candle close; expires if not re-confirmed
  within the strategy's expiry window. A buy signal is **invalidated** when price
  (including the forming candle) trades at or below its invalidation level.
- **Lifecycle**: a new signal record is created only when the state, strategy
  version or parameters change; the previous record is marked *superseded*. All
  records — including failed setups — are kept with a status history.

## The five strategies (defaults)

### A. Trend Following — 4h, 1d
Setup: close > EMA50, EMA20 > EMA50, EMA50 rising over 5 bars. Confirmations:
MACD histogram > 0, ADX ≥ 20, close > SMA200, RSI < 75. Strong = setup + all three
trend confirmations and RSI below the limit; Potential = ≥ 2. Exit = close and
EMA20 below EMA50 and MACD line < 0. Invalidation: close − 2 × ATR. Targets 1.5R, 3R.

### B. Momentum — 4h
Setup: MACD crossed above its signal within 3 bars. Confirmations: 50 < RSI < 70,
volume ≥ 1.5 × average in the window, ROC(10) > 0. Strong = all three; Potential = 2.
Exit = bearish cross and RSI < 50; Potential sell = histogram falling 3 bars.
Invalidation: close − 1.5 × ATR. Targets 1.5R, 2.5R.

### C. Pullback — 4h, 1d
Setup: EMA20 > rising EMA50, close > SMA200, a low within 0.5 × ATR of EMA20 in the
last 5 bars, closes held above EMA50 − 0.5 ATR, RSI dipped to 30–50. Trigger:
bullish candle closing above the prior high. Strong = trigger + volume ≥ average.
Invalidation: pullback low − 0.5 × ATR.

### D. Breakout — 4h, 1d
Setup: close above the prior 20-bar high + 0.1 × ATR (closes, not wicks).
Confirmations: range ≤ 8 × ATR (consolidation), breakout volume ≥ 1.5 × average,
close in the upper half of the candle. Exit: failed breakout (close back below the
broken level within 5 bars) or close below the range low. Invalidation: range high
− 1 × ATR. Targets: measured move and 3R.

### E. Risk-Aware Swing — 1d (v2)
Setup: SMA50 > SMA200 and close > SMA50. Reward/risk to the nearest confirmed
resistance (or 3R if none) ≥ 2 is **mandatory**; RSI 40–65 and ATR ≤ 6% of price
may have one miss for a Potential rating. Exit: two closes below SMA50, or bearish
regime with close below SMA50. Invalidation: 10-bar low − 0.5 × ATR.

No strategy works in all market conditions: trend and breakout strategies suffer
in ranges; pullback and swing strategies suffer in sharp reversals.

## Market overview definitions

- **Market trend**: BTC and ETH daily close vs. EMA50 vs. SMA200 (both up → Uptrend).
- **Volatility**: BTC 30-day annualised realised volatility (< 40% low, > 75% high).
- **Asset risk class**: daily ATR as % of price (< 3% low, 3–6% moderate, > 6% high).
- **Breadth**: share of watchlist assets with daily close above EMA50.
