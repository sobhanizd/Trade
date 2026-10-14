# Backtesting & paper trading

Code: `src/lib/backtest/engine.ts` (simulation), `src/lib/backtest/service.ts`
(data loading & storage), `src/lib/paper/service.ts`.

## Execution model

1. History is loaded from Binance (cached in the database), plus extra bars
   before your start date so indicators are fully warmed up at the start.
2. At each candle **close** the strategy is evaluated with `evaluateAt()` — the
   same function that produces live signals — using only data up to that candle.
3. Entries and signal-based exits fill at the **next candle's open**, adjusted
   by slippage; fees are charged on both legs.
4. Stops and targets are checked inside each candle. If both could have been hit
   in the same candle, the **stop is assumed first** (conservative). A gap through
   the stop fills at the (worse) open. An entry is skipped if the next open is
   already below the invalidation level.
5. Position size = *risk % of current equity* ÷ per-unit loss to the stop
   (including costs), capped at 100% of equity — no leverage, no shorting.
6. Optional: take profit at target 1 / target 2 / none, maximum bars in trade,
   cooldown after exit, exit on `EXIT SETUP`.
7. Open positions are closed at the last close (`END_OF_DATA`).

## Reported metrics

Trades, wins/losses, win rate, gross and net return, maximum drawdown
(mark-to-market), profit factor, average win/loss (amount and %), average R,
expectancy, total fees and slippage, time in market, average bars held, longest
losing streak, final equity — for the whole period **and separately** for the
in-sample and out-of-sample segments. Benchmark: buy & hold over the same
evaluation window with the same fee and slippage assumptions. Every simulated
trade is listed, including losers.

## Safeguards

- **Look-ahead bias**: causal indicators, closed candles, next-open fills; tests
  assert identical trades with and without future data.
- **Overfitting**: an out-of-sample segment (default last 30%) is reported
  separately and flagged when much weaker than in-sample; the UI warns against
  tuning parameters to past results; parameter relations are validated.
- **Too few trades**: < 30 trades are flagged as statistically weak.
- **Short periods**: < 6 months is flagged as possibly single-regime.
- **Survivorship bias**: always disclosed — only currently listed assets can be
  tested; delisted coins are absent.
- **Data quality**: the same gap/duplicate/OHLC checks as live analysis; blocking
  issues abort the run with an explanation.

## Limitations

- Fixed slippage; real slippage grows with volatility and order size.
- Intrabar path is unknown; the stop-first assumption may understate results.
- Exchange outages, trading halts and liquidity gaps are not simulated.
- Taxes and funding/withdrawal fees are ignored.
- Kraken (fallback) only serves the latest 720 candles, so long backtests need
  Binance access.
- Maximum 20,000 candles per run (e.g. ~2.3 years of 1h data).

**Historical simulated results never guarantee future performance.**

## Paper trading

- **Manual**: records a hypothetical position at the current public price (plus
  slippage) with optional stop/target; close it at the live price any time.
- **Automatic**: every qualifying buy signal (Settings → Paper trading) is
  recorded at the signal-candle close plus slippage and sized from your risk
  settings, so you can see the real outcome of every signal — winners and losers.
  Auto trades close at their stop or first target, or when the same strategy
  reports an exit on the same asset/timeframe.
- Stops/targets are checked by the worker against stored candles (stop first when
  ambiguous). No order is ever placed anywhere.
