/**
 * Plain-language wording for non-professional users (simple view), in English
 * and Persian. Pure strings only — safe to import in client and server code.
 */
import type { Locale } from "@/lib/i18n";

type L2 = { en: string; fa: string };
const tr = (v: L2, l: Locale) => v[l] ?? v.en;

export const STRATEGY_PLAIN: Record<string, { name: L2; idea: L2 }> = {
  trend_following: {
    name: { en: "Follow the trend", fa: "همراه با روند" },
    idea: { en: "Buys when the price has been rising steadily for a while.", fa: "وقتی قیمت مدتی به‌طور پیوسته بالا رفته، می‌خرد." },
  },
  momentum: {
    name: { en: "Speed picking up", fa: "شتاب گرفتن" },
    idea: { en: "Buys when the price suddenly starts moving up faster, with more people trading.", fa: "وقتی قیمت ناگهان سریع‌تر بالا می‌رود و آدم‌های بیشتری معامله می‌کنند، می‌خرد." },
  },
  pullback: {
    name: { en: "Buy the dip", fa: "خرید در اصلاح" },
    idea: { en: "Buys a small, temporary drop while the price is still rising overall.", fa: "وقتی قیمت در کل رو به بالاست، یک افت کوچک و موقت را می‌خرد." },
  },
  breakout: {
    name: { en: "Breaking out", fa: "شکست سقف" },
    idea: { en: "Buys when the price escapes above a level it was stuck below.", fa: "وقتی قیمت از سقفی که مدتی زیرش گیر کرده بود عبور می‌کند، می‌خرد." },
  },
  risk_aware_swing: {
    name: { en: "Careful swing", fa: "نوسان‌گیری محتاطانه" },
    idea: { en: "A slower idea for days to weeks, only when the possible gain is clearly bigger than the risk.", fa: "یک روش آهسته‌تر برای چند روز تا چند هفته؛ فقط وقتی سود احتمالی به‌وضوح بیشتر از ریسک است." },
  },
};

export function strategyName(id: string, l: Locale = "en") {
  const s = STRATEGY_PLAIN[id];
  return s ? tr(s.name, l) : id;
}
export function strategyIdea(id: string, l: Locale = "en") {
  const s = STRATEGY_PLAIN[id];
  return s ? tr(s.idea, l) : "";
}

type Tone = "good" | "bad" | "warn" | "neutral";
const STATES: Record<string, { label: L2; meaning: L2; tone: Tone }> = {
  STRONG_BUY_SETUP: {
    label: { en: "Strong buy idea", fa: "فرصت خرید قوی" },
    meaning: { en: "All of this idea's checks are met. It could be a good moment to buy — but it can still go wrong.", fa: "همهٔ شرط‌های این روش برقرار است. شاید زمان خوبی برای خرید باشد — ولی باز هم ممکن است اشتباه از آب دربیاید." },
    tone: "good",
  },
  POTENTIAL_BUY: {
    label: { en: "Possible buy", fa: "خرید احتمالی" },
    meaning: { en: "Most checks are met, a few are not yet. Some people buy a small amount now, others wait for more confirmation.", fa: "بیشتر شرط‌ها برقرار است، ولی چندتا هنوز نه. بعضی‌ها الان مقدار کمی می‌خرند، بعضی‌ها صبر می‌کنند تا مطمئن‌تر شوند." },
    tone: "good",
  },
  HOLD_WAIT: {
    label: { en: "Wait", fa: "صبر کنید" },
    meaning: { en: "Not a good moment to buy yet. If you already own it, nothing says you must sell.", fa: "هنوز زمان خوبی برای خرید نیست. اگر از قبل دارید، دلیلی برای فروش هم نیست." },
    tone: "neutral",
  },
  POTENTIAL_SELL: {
    label: { en: "Getting weaker", fa: "در حال ضعیف شدن" },
    meaning: { en: "The price is losing strength. If you own it, keep a close eye on it. Don't buy now.", fa: "قیمت دارد قدرتش را از دست می‌دهد. اگر دارید، حواستان به آن باشد. الان نخرید." },
    tone: "warn",
  },
  EXIT_SETUP: {
    label: { en: "Sell signal", fa: "سیگنال فروش" },
    meaning: { en: "If you own it, this idea says it's time to sell. Don't buy now.", fa: "اگر این ارز را دارید، این روش می‌گوید وقت فروش است. الان نخرید." },
    tone: "bad",
  },
  NO_CLEAR_OPPORTUNITY: {
    label: { en: "Nothing to do", fa: "کاری لازم نیست" },
    meaning: { en: "No buy or sell idea right now.", fa: "فعلاً نه فرصت خرید هست، نه دلیل فروش." },
    tone: "neutral",
  },
  NO_SIGNAL: {
    label: { en: "No data", fa: "بدون داده" },
    meaning: { en: "The price data had a problem, so the app is not giving an answer.", fa: "داده‌های قیمت مشکل داشت، برای همین برنامه جوابی نمی‌دهد." },
    tone: "warn",
  },
};

export function statePlain(state: string, l: Locale = "en") {
  const s = STATES[state] ?? STATES.NO_CLEAR_OPPORTUNITY;
  return { label: tr(s.label, l), meaning: tr(s.meaning, l), tone: s.tone };
}

/** Back-compat (English) map used by older code. */
export const STATE_PLAIN: Record<string, { label: string; meaning: string; tone: Tone }> = Object.fromEntries(
  Object.entries(STATES).map(([k, v]) => [k, { label: v.label.en, meaning: v.meaning.en, tone: v.tone }]),
);

export function timeframePlain(tf: string, l: Locale = "en") {
  const map: Record<string, L2> = {
    "1d": { en: "daily chart", fa: "نمودار روزانه" },
    "4h": { en: "4-hour chart", fa: "نمودار 4 ساعته" },
    "1h": { en: "1-hour chart", fa: "نمودار 1 ساعته" },
    "1w": { en: "weekly chart", fa: "نمودار هفتگی" },
  };
  return map[tf] ? tr(map[tf], l) : tf;
}

/** Short timeframe adjective: "daily" / "روزانه". */
export function timeframeWord(tf: string, l: Locale = "en") {
  const map: Record<string, L2> = {
    "1d": { en: "daily", fa: "روزانه" },
    "4h": { en: "4-hour", fa: "4 ساعته" },
    "1h": { en: "hourly", fa: "ساعتی" },
    "1w": { en: "weekly", fa: "هفتگی" },
  };
  return map[tf] ? tr(map[tf], l) : tf;
}

const CONDITIONS: Record<string, L2> = {
  above_slow: { en: "The price is above its recent average", fa: "قیمت بالاتر از میانگین اخیرش است" },
  fast_above_slow: { en: "The short-term average is above the longer-term average", fa: "میانگین کوتاه‌مدت بالاتر از میانگین بلندمدت است" },
  slow_rising: { en: "The average price is going up", fa: "میانگین قیمت رو به بالاست" },
  macd_pos: { en: "Upward speed is positive", fa: "سرعت حرکت رو به بالا مثبت است" },
  adx: { en: "The trend is strong (not just moving sideways)", fa: "روند قوی است (فقط درجا نمی‌زند)" },
  long_term: { en: "The price is above its long-term (200-day) average", fa: "قیمت بالاتر از میانگین بلندمدت (200 روزه) است" },
  rsi_ok: { en: "The price has not risen too fast (not overheated)", fa: "قیمت خیلی تند بالا نرفته (داغ نکرده)" },
  exit_structure: { en: "The price has fallen below its averages", fa: "قیمت زیر میانگین‌هایش افتاده است" },
  exit_macd: { en: "Downward speed has taken over", fa: "سرعت حرکت رو به پایین غالب شده است" },
  macd_cross_up: { en: "Upward speed just turned positive", fa: "سرعت حرکت تازه مثبت شده است" },
  rsi_zone: { en: "Buying pressure is healthy (not too weak, not overheated)", fa: "فشار خرید سالم است (نه خیلی ضعیف، نه خیلی داغ)" },
  volume: { en: "More people than usual are trading it", fa: "بیشتر از همیشه معامله می‌شود" },
  roc: { en: "The price is higher than it was a little while ago", fa: "قیمت از چند وقت پیش بالاتر است" },
  macd_cross_down: { en: "Upward speed just turned negative", fa: "سرعت حرکت تازه منفی شده است" },
  rsi_below_mid: { en: "Selling pressure is stronger than buying pressure", fa: "فشار فروش از فشار خرید بیشتر است" },
  hist_fading: { en: "Upward speed is fading", fa: "سرعت بالا رفتن دارد کم می‌شود" },
  trend: { en: "The price is in an uptrend", fa: "قیمت در روند صعودی است" },
  touch: { en: "The price dipped back to its average (a dip to buy)", fa: "قیمت تا میانگینش پایین آمد (فرصت خرید در اصلاح)" },
  held: { en: "The dip did not fall too far", fa: "افت قیمت خیلی عمیق نشد" },
  rsi_dip: { en: "The dip cooled the price down without crashing it", fa: "افت، قیمت را آرام کرد بدون این‌که سقوط کند" },
  trigger: { en: "The price started rising again after the dip", fa: "قیمت بعد از افت دوباره شروع به بالا رفتن کرد" },
  exit_reversal: { en: "The dip turned into a real drop", fa: "افت کوچک به یک ریزش واقعی تبدیل شد" },
  close_above: { en: "The price closed above the level it was stuck under", fa: "قیمت بالای سقفی که زیرش گیر کرده بود بسته شد" },
  consolidation: { en: "It had been moving in a tight range before", fa: "قبلاً در یک محدودهٔ تنگ نوسان می‌کرد" },
  close_strength: { en: "It closed near the high of the day (strong finish)", fa: "نزدیک بالاترین قیمت روز بسته شد (پایان قوی)" },
  failed_breakout: { en: "It broke out but fell back below — a failed breakout", fa: "از سقف عبور کرد ولی دوباره برگشت پایین — شکست ناموفق" },
  breakdown: { en: "The price fell below the bottom of its range", fa: "قیمت زیر کف محدوده‌اش افتاد" },
  regime: { en: "The big picture is positive (50-day average above 200-day)", fa: "تصویر کلی مثبت است (میانگین 50 روزه بالای 200 روزه)" },
  above_fast: { en: "The price is above its 50-day average", fa: "قیمت بالای میانگین 50 روزه است" },
  volatility: { en: "Price swings are calm enough", fa: "نوسان قیمت به اندازهٔ کافی آرام است" },
  reward_risk: { en: "The possible gain is big enough compared to the risk", fa: "سود احتمالی در مقایسه با ریسک به اندازهٔ کافی بزرگ است" },
  two_closes_below: { en: "The price closed below its 50-day average twice", fa: "قیمت دو بار زیر میانگین 50 روزه بسته شد" },
  regime_bear: { en: "The big picture turned negative", fa: "تصویر کلی منفی شده است" },
};

export function conditionPlain(id: string, fallback: string, l: Locale = "en") {
  return CONDITIONS[id] ? tr(CONDITIONS[id], l) : fallback;
}

export function exitReasonPlain(reason: string | null | undefined, l: Locale = "en") {
  const map: Record<string, L2> = {
    TARGET: { en: "Reached the target 🎯", fa: "به هدف سود رسید 🎯" },
    STOP: { en: "Safety exit triggered (price fell)", fa: "حد ضرر فعال شد (قیمت افتاد)" },
    EXIT_SIGNAL: { en: "Sold because the signal turned to sell", fa: "فروخته شد چون سیگنال فروش آمد" },
    MANUAL: { en: "You sold it", fa: "خودتان فروختید" },
    TIME: { en: "Closed after too long", fa: "بعد از مدت طولانی بسته شد" },
    END_OF_DATA: { en: "End of the test period", fa: "پایان دورهٔ آزمایش" },
  };
  return reason && map[reason] ? tr(map[reason], l) : (reason ?? "");
}

/** "Could gain about 1.4× what it risks" */
export function rrPlain(rr: number | null | undefined, l: Locale = "en") {
  if (rr === null || rr === undefined || !Number.isFinite(rr)) return null;
  return l === "fa" ? `سود احتمالی حدود ${rr.toFixed(1)} برابرِ ضرر احتمالی` : `Could gain about ${rr.toFixed(1)}× what it risks`;
}

export const coinLabel = (symbol: string, l: Locale = "en") => (symbol === "PAXG" ? (l === "fa" ? "طلا" : "Gold") : symbol);

const COIN_FA: Record<string, string> = {
  BTC: "بیت‌کوین", ETH: "اتریوم", BNB: "بی‌ان‌بی", ADA: "کاردانو", XLM: "استلار", LTC: "لایت‌کوین", TRX: "ترون",
  SOL: "سولانا", XRP: "ریپل", DOGE: "دوج‌کوین", DOT: "پولکادات", AVAX: "اولانچ", LINK: "چین‌لینک", MATIC: "پالیگان",
  PAXG: "طلا", XAUT: "طلا", TON: "تون‌کوین", SHIB: "شیبا", BCH: "بیت‌کوین کش", ATOM: "کازماس", UNI: "یونی‌سواپ",
};

/** "سولانا" → "SOL" (Persian coin names typed into the add-coin box). */
export function symbolFromPersianName(q: string): string | null {
  const n = q.replace(/[\u200c\s]/g, "");
  const hit = Object.entries(COIN_FA).find(([sym, fa]) => sym !== "XAUT" && fa.replace(/[\u200c\s]/g, "") === n);
  return hit ? hit[0] : null;
}

/** Full coin name for display: Persian name when known, otherwise the provider's name. */
export const coinFullName = (symbol: string, name: string, l: Locale = "en") => (l === "fa" ? (COIN_FA[symbol] ?? name) : symbol === "PAXG" ? "Gold" : name);
