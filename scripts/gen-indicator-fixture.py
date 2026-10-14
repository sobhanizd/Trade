"""Generate independent reference indicator values with pandas for unit tests.

Uses pandas' ewm (seeded with the first value, not SMA). After hundreds of bars
the seeding difference decays to ~0, so the TAIL values must match ours closely.
Run: python3 scripts/gen-indicator-fixture.py > tests/fixtures/indicators.json
"""
import json
import numpy as np
import pandas as pd

rng = np.random.default_rng(42)
n = 600
rets = rng.normal(0.0004, 0.02, n)
close = 100 * np.exp(np.cumsum(rets))
open_ = np.concatenate([[100.0], close[:-1]])
spread = np.abs(rng.normal(0, 0.01, n))
high = np.maximum(open_, close) * (1 + spread)
low = np.minimum(open_, close) * (1 - spread * 0.9)
volume = rng.uniform(800, 1200, n)
df = pd.DataFrame({"open": open_, "high": high, "low": low, "close": close, "volume": volume})

c = df["close"]
sma20 = c.rolling(20).mean()
ema12 = c.ewm(span=12, adjust=False).mean()
ema26 = c.ewm(span=26, adjust=False).mean()
macd = ema12 - ema26
signal = macd.ewm(span=9, adjust=False).mean()
hist = macd - signal
d = c.diff()
gain = d.clip(lower=0).ewm(alpha=1 / 14, adjust=False).mean()
loss = (-d.clip(upper=0)).ewm(alpha=1 / 14, adjust=False).mean()
rsi = 100 - 100 / (1 + gain / loss)
std20 = c.rolling(20).std(ddof=0)
bb_up = sma20 + 2 * std20
bb_lo = sma20 - 2 * std20
pc = c.shift(1)
tr = pd.concat([df["high"] - df["low"], (df["high"] - pc).abs(), (df["low"] - pc).abs()], axis=1).max(axis=1)
atr = tr.ewm(alpha=1 / 14, adjust=False).mean()

tail = slice(n - 50, n)
out = {
    "candles": [
        {"openTime": i * 3600000, "closeTime": i * 3600000 + 3599999, "open": float(df.open[i]), "high": float(df.high[i]), "low": float(df.low[i]), "close": float(df.close[i]), "volume": float(df.volume[i])}
        for i in range(n)
    ],
    "tailStart": n - 50,
    "sma20": [float(x) for x in sma20[tail]],
    "macd": [float(x) for x in macd[tail]],
    "macdSignal": [float(x) for x in signal[tail]],
    "macdHist": [float(x) for x in hist[tail]],
    "rsi14": [float(x) for x in rsi[tail]],
    "bbUpper": [float(x) for x in bb_up[tail]],
    "bbLower": [float(x) for x in bb_lo[tail]],
    "atr14": [float(x) for x in atr[tail]],
}
print(json.dumps(out))
