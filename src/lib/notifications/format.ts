import type { Locale } from "@/lib/i18n";
import { TIMEFRAME_LABEL, type Timeframe } from "@/lib/market/types";
import { statePlain, strategyName as strategyNamePlain, timeframePlain } from "@/lib/plain";
import { fp } from "@/lib/strategies/helpers";
import { STRATEGIES } from "@/lib/strategies/registry";
import { STATE_LABEL, type SignalState } from "@/lib/strategies/types";

export const DISCLAIMER = "This is a system-generated analysis, not a guarantee or an instruction to execute a trade.";
const DISCLAIMER_FA = "این پیام را سیستم به‌طور خودکار ساخته است؛ نه تضمین سود است و نه دستور خرید یا فروش. تصمیم نهایی با خودتان است — این توصیهٔ مالی نیست.";

/** Alert disclaimer in the user's language. */
export function disclaimer(locale: Locale = "en") {
  return locale === "fa" ? DISCLAIMER_FA : DISCLAIMER;
}

export interface SignalLike {
  id: string;
  pair: string;
  strategyName: string;
  timeframe: string;
  state: SignalState;
  summary: string;
  invalidation: number | null;
  riskReward: number | null;
  risks: string[];
  conflicts: string[];
  price: number;
}

const symbolOf = (pair: string) => pair.replace(/USDT?$/, "");

/** Strategy display name; in Persian the plain-language name when the strategy is known. */
function strategyLabel(name: string, locale: Locale) {
  if (locale !== "fa") return name;
  const def = STRATEGIES.find((d) => d.name === name || d.id === name);
  return def ? strategyNamePlain(def.id, "fa") : name;
}

const timeframeLabel = (tf: string, locale: Locale) => (locale === "fa" ? timeframePlain(tf, "fa") : (TIMEFRAME_LABEL[tf as Timeframe] ?? tf));
const stateLabel = (state: SignalState, locale: Locale) => (locale === "fa" ? statePlain(state, "fa").label : STATE_LABEL[state]);

function statusLine(state: SignalState, locale: Locale = "en") {
  const fa = locale === "fa";
  switch (state) {
    case "STRONG_BUY_SETUP":
      return fa ? "طبق قوانین این روش، فرصت قوی است — باز هم قبل از هر کاری خودتان بررسی کنید." : "Strong setup per strategy rules — still verify before acting.";
    case "POTENTIAL_BUY":
      return fa ? "منتظر تأیید بیشتر است." : "Waiting for further confirmation.";
    case "EXIT_SETUP":
      return fa ? "شرط‌های خروج این روش برقرار شده است." : "Exit conditions met for this strategy.";
    case "POTENTIAL_SELL":
      return fa ? "در حال ضعیف شدن — بخشی از شرط‌های خروج برقرار است." : "Weakening — exit conditions partially met.";
    default:
      return stateLabel(state, locale);
  }
}

export function formatSignalAlert(s: SignalLike, appUrl: string, locale: Locale = "en") {
  const sym = symbolOf(s.pair);
  const isExit = s.state === "EXIT_SETUP" || s.state === "POTENTIAL_SELL";
  const url = `${appUrl}/signals/${s.id}`;
  if (locale === "fa") {
    const head = s.state === "EXIT_SETUP" ? `سیگنال فروش ${sym}` : s.state === "POTENTIAL_SELL" ? `${sym} در حال ضعیف شدن` : `فرصت خرید ${sym}`;
    const risk = s.risks[0] ?? (s.conflicts[0] ? `نشانهٔ مخالف: ${s.conflicts[0]}` : "نکته‌های ریسک را در برنامه ببینید.");
    const body = [
      `نمودار: ${timeframeLabel(s.timeframe, locale)}`,
      `روش: ${strategyLabel(s.strategyName, locale)}`,
      `سیگنال: ${stateLabel(s.state, locale)}`,
      `یعنی: ${statePlain(s.state, "fa").meaning}`,
      `توضیح سیستم: ${s.summary}`,
      `وضعیت: ${statusLine(s.state, locale)}`,
      `قیمت هنگام بررسی: ${fp(s.price)} (${s.pair})`,
      `ریسک: ${risk}`,
      isExit
        ? `لغو می‌شود اگر: قیمت از سطحی که در برنامه آمده بالاتر برود${s.invalidation ? ` (حدود ${fp(s.invalidation)})` : ""}.`
        : `حد ضرر: ${s.invalidation ? `حدود ${fp(s.invalidation)} — اگر قیمت به این‌جا برسد، این فرصت دیگر معتبر نیست. سطح دقیق را در برنامه ببینید.` : "در برنامه ببینید."}`,
      s.riskReward !== null ? `نسبت سود به ضرر (بعد از کارمزد، تخمینی): ${s.riskReward.toFixed(2)}` : null,
      "",
      disclaimer(locale),
    ]
      .filter((x) => x !== null)
      .join("\n");
    return { title: `CryptoPilot AI — ${head}`, body, url };
  }
  const kind = isExit ? "Exit" : "Potential";
  const title = `CryptoPilot AI — ${kind} ${sym} Setup`;
  const risk = s.risks[0] ?? (s.conflicts[0] ? `Conflicting: ${s.conflicts[0]}` : "See dashboard for risk notes.");
  const body = [
    `Timeframe: ${timeframeLabel(s.timeframe, locale)}`,
    `Strategy: ${s.strategyName}`,
    `Signal: ${STATE_LABEL[s.state]}`,
    `Reason: ${s.summary}`,
    `Status: ${statusLine(s.state)}`,
    `Price at analysis: ${fp(s.price)} (${s.pair})`,
    `Risk: ${risk}`,
    isExit
      ? `Cancelled if: see the level in your dashboard${s.invalidation ? ` (≈ ${fp(s.invalidation)})` : ""}.`
      : `Invalidation: ${s.invalidation ? `≈ ${fp(s.invalidation)} — see the calculated level in your dashboard.` : "see your dashboard."}`,
    s.riskReward !== null ? `Est. reward/risk after costs: ${s.riskReward.toFixed(2)}` : null,
    "",
    DISCLAIMER,
  ]
    .filter((x) => x !== null)
    .join("\n");
  return { title, body, url };
}

export function formatChangeAlert(prev: SignalLike, next: SignalLike, appUrl: string, locale: Locale = "en") {
  const sym = symbolOf(prev.pair);
  const url = `${appUrl}/signals/${next.id}`;
  if (locale === "fa") {
    return {
      title: `CryptoPilot AI — وضعیت ${sym} تغییر کرد`,
      body: [
        `نمودار: ${timeframeLabel(prev.timeframe, locale)}`,
        `روش: ${strategyLabel(prev.strategyName, locale)}`,
        `قبلاً: ${stateLabel(prev.state, locale)}`,
        `الان: ${stateLabel(next.state, locale)}`,
        `توضیح سیستم: ${next.summary}`,
        "",
        "فرصتی که قبلاً درباره‌اش پیام گرفتید، دیگر به شکل اولش معتبر نیست.",
        disclaimer(locale),
      ].join("\n"),
      url,
    };
  }
  return {
    title: `CryptoPilot AI — ${sym} setup changed`,
    body: [
      `Timeframe: ${timeframeLabel(prev.timeframe, locale)}`,
      `Strategy: ${prev.strategyName}`,
      `Previous: ${STATE_LABEL[prev.state]}`,
      `Now: ${STATE_LABEL[next.state]}`,
      `Reason: ${next.summary}`,
      "",
      "The previously reported setup is no longer valid in its original form.",
      DISCLAIMER,
    ].join("\n"),
    url,
  };
}

export function formatInvalidationAlert(s: SignalLike, price: number, appUrl: string, locale: Locale = "en") {
  const sym = symbolOf(s.pair);
  const url = `${appUrl}/signals/${s.id}`;
  if (locale === "fa") {
    return {
      title: `CryptoPilot AI — فرصت ${sym} باطل شد`,
      body: [
        `نمودار: ${timeframeLabel(s.timeframe, locale)}`,
        `روش: ${strategyLabel(s.strategyName, locale)}`,
        `قیمت به ${fp(price)} رسید؛ یعنی پایین‌تر از حد ضرر (${fp(s.invalidation)}).`,
        "طبق قوانین این روش، این فرصت دیگر معتبر نیست.",
        "",
        disclaimer(locale),
      ].join("\n"),
      url,
    };
  }
  return {
    title: `CryptoPilot AI — ${sym} setup invalidated`,
    body: [
      `Timeframe: ${timeframeLabel(s.timeframe, locale)}`,
      `Strategy: ${s.strategyName}`,
      `Price traded at ${fp(price)}, below the invalidation level ${fp(s.invalidation)}.`,
      "The setup is no longer valid according to its rules.",
      "",
      DISCLAIMER,
    ].join("\n"),
    url,
  };
}

/* ---------- Other alert kinds (test, price, volatility, system) ---------- */

const CHANNEL_FA: Record<string, string> = { TELEGRAM: "تلگرام", EMAIL: "ایمیل", WEBPUSH: "اعلان مرورگر" };

export function formatTestAlert(channel: string | undefined, locale: Locale = "en") {
  if (locale === "fa") {
    const via = channel ? (CHANNEL_FA[channel] ?? channel) : "کانال‌هایی که تنظیم کرده‌اید";
    return {
      title: "CryptoPilot AI — اعلان آزمایشی",
      body: `اگر این پیام را می‌خوانید، ارسال از طریق ${via} درست کار می‌کند.\n\n${disclaimer(locale)}`,
    };
  }
  return {
    title: "CryptoPilot AI — test notification",
    body: `If you can read this, ${channel ?? "your configured channels"} delivery works.\n\n${DISCLAIMER}`,
  };
}

export function formatPriceAlert(a: { symbol: string; direction: string; level: number; price: number; note?: string | null }, locale: Locale = "en") {
  if (locale === "fa") {
    const where = a.direction === "ABOVE" ? "به سطح شما یا بالاتر از آن" : "به سطح شما یا پایین‌تر از آن";
    return {
      title: `CryptoPilot AI — هشدار قیمت ${a.symbol}`,
      body: `قیمت ${a.symbol} ${where} رسید: سطح شما $${fp(a.level)} (قیمت فعلی حدود $${fp(a.price)}).${a.note ? `\nیادداشت: ${a.note}` : ""}\n\nاین هشدار فقط برای اطلاع است.`,
    };
  }
  return {
    title: `CryptoPilot AI — ${a.symbol} price alert`,
    body: `${a.symbol} is ${a.direction === "ABOVE" ? "at or above" : "at or below"} your level of $${fp(a.level)} (current ≈ $${fp(a.price)}).${a.note ? `\nNote: ${a.note}` : ""}\n\nThis alert is informational only.`,
  };
}

export function formatVolatilityAlert(a: { symbol: string; change1h: number; lastUpdated: string | null | undefined }, locale: Locale = "en") {
  const move = `${a.change1h > 0 ? "+" : ""}${a.change1h.toFixed(2)}%`;
  if (locale === "fa") {
    return {
      title: `CryptoPilot AI — ${a.symbol} در ۱ ساعت ${move} تغییر کرد`,
      body: `قیمت ${a.symbol} در یک ساعت گذشته ${move} تغییر کرده است (منبع: CoinGecko، زمان داده: ${a.lastUpdated ?? "نامعلوم"}). در حرکت‌های تند، لغزش قیمت (اختلاف قیمت اجرا) بیشتر می‌شود و ممکن است حد ضرر با قیمت بدتری اجرا شود.\n\nاین پیام فقط برای اطلاع است، نه دستور خرید یا فروش.`,
    };
  }
  return {
    title: `CryptoPilot AI — ${a.symbol} moved ${move} in 1h`,
    body: `${a.symbol} moved ${a.change1h.toFixed(2)}% over the last hour (CoinGecko, as of ${a.lastUpdated ?? "unknown"}). Large moves increase slippage and the chance of stops filling at worse prices.\n\nThis is informational, not a trading instruction.`,
  };
}

export function formatProviderProblemAlert(failures: { symbol: string; timeframe: string; error: string }[], locale: Locale = "en") {
  const list = failures.map((f) => `${f.symbol} ${f.timeframe}`).join(locale === "fa" ? "، " : ", ");
  if (locale === "fa") {
    return {
      title: "CryptoPilot AI — مشکل در منبع دادهٔ بازار",
      body: `دادهٔ قیمت (کندل‌ها) برای این موارد به‌روز نشد: ${list}.\nاولین خطا: ${failures[0]?.error ?? ""}\nتا وقتی داده درست شود، سیگنال این ارزها «بدون داده» نشان داده می‌شود.`,
    };
  }
  return {
    title: "CryptoPilot AI — market data provider problem",
    body: `Candle data could not be refreshed for: ${list}.\nFirst error: ${failures[0]?.error}\nSignals for affected assets will show NO SIGNAL until data recovers.`,
  };
}

export function formatStaleDataAlert(stale: { symbol: string; timeframe: string; minutes: number }[], locale: Locale = "en") {
  if (locale === "fa") {
    return {
      title: "CryptoPilot AI — دادهٔ بازار قدیمی است",
      body: `آخرین کندل‌های بسته‌شده قدیمی‌تر از حد انتظارند برای: ${stale.map((s) => `${s.symbol} ${s.timeframe} (${s.minutes} دقیقه)`).join("، ")}.`,
    };
  }
  return {
    title: "CryptoPilot AI — stale market data",
    body: `Latest closed candles are older than expected for: ${stale.map((s) => `${s.symbol} ${s.timeframe} (${s.minutes} min)`).join(", ")}.`,
  };
}

/** Serious headline about a watched coin, or a very large 24h move. Never a buy/sell instruction. */
export function formatUrgentAlert(a: { symbol: string; title?: string; source?: string; change24h?: number }, locale: Locale = "en") {
  const move = a.change24h !== undefined ? `${a.change24h > 0 ? "+" : ""}${a.change24h.toFixed(1)}%` : "";
  if (locale === "fa") {
    return a.title
      ? {
          title: `CryptoPilot AI — خبر مهم دربارهٔ ${a.symbol}`,
          body: `«${a.title}» (${a.source ?? ""})\n\nاگر ${a.symbol} دارید، مطمئن شوید حد ضرر را گذاشته‌اید و خبر کامل را از منبع بخوانید. با ترس خرید یا فروش نکنید.\n\nاین پیام فقط برای اطلاع است، نه دستور خرید یا فروش.`,
        }
      : {
          title: `CryptoPilot AI — ${a.symbol} در 24 ساعت ${move} تغییر کرد`,
          body: `قیمت ${a.symbol} در 24 ساعت گذشته ${move} تغییر کرده — خیلی بیشتر از معمول. حد ضرر خود را بررسی کنید و صبر کنید کندل روزانه بسته شود.\n\nاین پیام فقط برای اطلاع است، نه دستور خرید یا فروش.`,
        };
  }
  return a.title
    ? {
        title: `CryptoPilot AI — important news about ${a.symbol}`,
        body: `"${a.title}" (${a.source ?? ""})\n\nIf you own ${a.symbol}, check that your safety exit (stop) is set and read the full story at the source. Avoid panic buying or selling.\n\nThis is informational, not a trading instruction.`,
      }
    : {
        title: `CryptoPilot AI — ${a.symbol} moved ${move} in 24h`,
        body: `${a.symbol} moved ${move} over the last 24 hours — much more than usual. Check your safety exit and wait for the daily candle to close.\n\nThis is informational, not a trading instruction.`,
      };
}
