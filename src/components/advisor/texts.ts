/** Plain-language wording of the trader's advice (EN + easy FA). Pure: usable on server and client. */
import type { Advice, AdviceAction, Part, Regime } from "@/lib/analysis/advisor";
import type { PatternId } from "@/lib/analysis/patterns";
import type { Locale } from "@/lib/i18n";

/** Keeps numbers left-to-right inside Persian sentences. */
const iso = (x: string) => `⁦${x}⁩`;
const pct = (v: number, d = 0) => iso(`${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}%`);
const share = (v: number) => iso(`${Math.round(v * 100)}%`);

export const ACTION: Record<AdviceAction, { en: string; fa: string; icon: string; tone: "good" | "bad" | "warn" | "neutral" }> = {
  buyNow: { en: "Buy now", fa: "همین حالا بخرید", icon: "🟢", tone: "good" },
  buyParts: { en: "Buy in parts", fa: "چند مرحله‌ای بخرید", icon: "🟢", tone: "good" },
  noEdge: { en: "No rush — small parts are fine", fa: "عجله نکنید — خرید کم‌کم اشکالی ندارد", icon: "⚪", tone: "neutral" },
  waitDip: { en: "Wait for a lower price", fa: "صبر کنید ارزان‌تر شود", icon: "⏳", tone: "warn" },
  avoid: { en: "Don't buy now", fa: "الان نخرید", icon: "🔴", tone: "bad" },
  pause: { en: "Pause — read the news first", fa: "دست نگه دارید — اول خبر را بخوانید", icon: "⚠️", tone: "warn" },
  hold: { en: "Keep it", fa: "نگه دارید", icon: "🟢", tone: "neutral" },
  protect: { en: "Keep it, but protect it", fa: "نگه دارید، ولی از آن محافظت کنید", icon: "🛡️", tone: "warn" },
  takeProfit: { en: "Take some profit", fa: "بخشی از سود را بردارید", icon: "💰", tone: "warn" },
  sellPart: { en: "Sell part of it", fa: "بخشی را بفروشید", icon: "🔴", tone: "bad" },
};

export const TONE_CLS = {
  good: "bg-good/12 ring-good/50 text-good-ink",
  bad: "bg-bad/10 ring-bad/50 text-bad-ink",
  warn: "bg-warn/12 ring-warn/50 text-warn-ink",
  neutral: "bg-surface-2 ring-line text-ink",
} as const;

const REGIME: Record<Regime, { en: string; fa: string }> = {
  strongUp: { en: "strong uptrend", fa: "روند صعودی قوی" },
  up: { en: "uptrend", fa: "روند صعودی" },
  mixed: { en: "no clear trend", fa: "بدون روند واضح" },
  down: { en: "downtrend", fa: "روند نزولی" },
  strongDown: { en: "strong downtrend", fa: "روند نزولی قوی" },
};

export const PATTERN: Record<PatternId, { en: string; fa: string; what: { en: string; fa: string } }> = {
  oversold: { en: "Oversold (RSI under 30)", fa: "فروش بیش از حد (RSI زیر 30)", what: { en: "Sellers pushed hard for days.", fa: "فروشنده‌ها چند روز فشار زیادی آوردند." } },
  overbought: { en: "Overbought (RSI over 70)", fa: "خرید بیش از حد (RSI بالای 70)", what: { en: "Buyers pushed hard for days.", fa: "خریدارها چند روز فشار زیادی آوردند." } },
  goldenCross: { en: "Golden cross", fa: "تقاطع طلایی", what: { en: "The 50-day average moved above the 200-day average.", fa: "میانگین 50 روزه از میانگین 200 روزه بالاتر رفت." } },
  deathCross: { en: "Death cross", fa: "تقاطع مرگ", what: { en: "The 50-day average fell below the 200-day average.", fa: "میانگین 50 روزه زیر میانگین 200 روزه رفت." } },
  breakoutHigh: { en: "Breakout to a 20-day high", fa: "شکستن سقف 20 روزه", what: { en: "The price closed above its highest level of the last 20 days.", fa: "قیمت بالای بالاترین سطح 20 روز گذشته بسته شد." } },
  breakdownLow: { en: "Break below a 20-day low", fa: "شکستن کف 20 روزه", what: { en: "The price closed below its lowest level of the last 20 days.", fa: "قیمت زیر پایین‌ترین سطح 20 روز گذشته بسته شد." } },
  pullbackUptrend: { en: "Pullback in an uptrend", fa: "اصلاح در روند صعودی", what: { en: "In an uptrend, the price came back to its 50-day average.", fa: "در روند صعودی، قیمت به میانگین 50 روزه‌اش برگشت." } },
  rallyDowntrend: { en: "Bounce in a downtrend", fa: "برگشت موقت در روند نزولی", what: { en: "In a downtrend, the price bounced up to its 50-day average.", fa: "در روند نزولی، قیمت تا میانگین 50 روزه‌اش بالا آمد." } },
  doubleBottom: { en: "Double bottom (W shape)", fa: "کف دوقلو (شکل W)", what: { en: "Two lows at about the same price, then a close above the peak between them.", fa: "دو کف تقریباً هم‌قیمت، بعد بسته شدن بالای قلهٔ بین آن‌ها." } },
  doubleTop: { en: "Double top (M shape)", fa: "سقف دوقلو (شکل M)", what: { en: "Two highs at about the same price, then a close below the low between them.", fa: "دو سقف تقریباً هم‌قیمت، بعد بسته شدن زیر کفِ بین آن‌ها." } },
  crash: { en: "Sharp drop (−15% in a week)", fa: "ریزش تند (15٪ در یک هفته)", what: { en: "The price fell 15% or more in 7 days.", fa: "قیمت در 7 روز 15٪ یا بیشتر ریخت." } },
  overheated: { en: "Overheated (+40% in a month)", fa: "داغ شدن (40٪ رشد در یک ماه)", what: { en: "The price rose 40% or more in 30 days.", fa: "قیمت در 30 روز 40٪ یا بیشتر بالا رفت." } },
  squeeze: { en: "Squeeze (very calm price)", fa: "فشردگی (قیمت خیلی آرام)", what: { en: "Price swings are the smallest in 4 months — a bigger move often follows, either way.", fa: "نوسان‌ها کمترین مقدار در 4 ماه است — معمولاً بعدش حرکت بزرگ‌تری می‌آید، به هر طرف." } },
  volumeUp: { en: "Big buying volume", fa: "حجم خرید بزرگ", what: { en: "A rise on 2.5× the usual trading volume.", fa: "رشد قیمت با 2.5 برابر حجم معمول." } },
  volumeDown: { en: "Big selling volume", fa: "حجم فروش بزرگ", what: { en: "A drop on 2.5× the usual trading volume.", fa: "افت قیمت با 2.5 برابر حجم معمول." } },
};

export interface Fmt {
  l: Locale;
  coin: string;
  /** USD price → display string. */
  money: (usd: number | null | undefined) => string;
  date: (ms: number) => string;
}

/** The one-line "when / how" instruction. */
export function whenText(a: Advice, action: AdviceAction, f: Fmt): string {
  const fa = f.l === "fa";
  const d = f.date(a.recheckAt);
  const m = (v: number | null) => iso(f.money(v));
  switch (action) {
    case "buyNow":
      return fa ? `امروز. ${d} دوباره بررسی کنید.` : `Today. Check again on ${d}.`;
    case "buyParts":
      return fa
        ? `پولتان را تقسیم کنید: حدود نصف امروز، بقیه حدود 7 روز بعد${a.buyLevel ? ` (یا زودتر اگر به ${m(a.buyLevel)} رسید)` : ""}.`
        : `Split your money: about half today, the rest in about 7 days${a.buyLevel ? ` (or earlier if it dips to ${m(a.buyLevel)})` : ""}.`;
    case "noEdge":
      return fa ? `دلیلی برای عجله نیست. اگر می‌خواهید، یک بخش کوچک امروز و بخش دیگر ${d} بخرید.` : `No reason to rush. If you want it, buy a small part today and another on ${d}.`;
    case "waitDip": {
      const b = a.timing?.best;
      return fa
        ? `یک هشدار خرید روی ${m(a.buyLevel)} بگذارید.${b ? ` در گذشته این قیمت در ${share(b.fillRate)} موارد ظرف ${b.days} روز رسیده و صبر کردن به‌طور میانگین ${pct(-b.avgVsNowPct, 1)} ارزان‌تر تمام شده.` : ""} اگر تا ${d} نرسید، دوباره بررسی کنید.`
        : `Set a buy alert at ${m(a.buyLevel)}.${b ? ` In the past this price was reached within ${b.days} days in ${share(b.fillRate)} of cases, and waiting was on average ${pct(-b.avgVsNowPct, 1)} cheaper.` : ""} If it hasn't happened by ${d}, check again.`;
    }
    case "avoid":
      return fa
        ? `فعلاً نه. ${d} دوباره بررسی کنید${a.upTrigger ? `، یا زودتر اگر یک روز بالای ${m(a.upTrigger)} بسته شد` : ""}.`
        : `Not now. Check again on ${d}${a.upTrigger ? `, or earlier if a day closes above ${m(a.upTrigger)}` : ""}.`;
    case "pause":
      return fa ? `1 تا 2 روز صبر کنید و خبر را از منبع بخوانید. ${d} دوباره بررسی کنید.` : `Wait 1–2 days and read the news at the source. Check again on ${d}.`;
    case "hold":
      return fa ? `نگه دارید. ${d} دوباره بررسی کنید.` : `Keep it. Check again on ${d}.`;
    case "protect":
      return fa
        ? `نگه دارید، ولی یک هشدار ایمنی روی ${m(a.stopLevel)} بگذارید. اگر یک روز زیر آن بسته شد، بفروشید.`
        : `Keep it, but set a safety alert at ${m(a.stopLevel)}. If a day closes below it, sell.`;
    case "takeProfit":
      return fa
        ? `حدود 20 تا 25٪ را الان بفروشید تا بخشی از سود ${pct(a.holding?.gainPct ?? 0)} قطعی شود؛ بقیه را نگه دارید.`
        : `Sell about 20–25% now to lock in part of your ${pct(a.holding?.gainPct ?? 0)} profit; keep the rest.`;
    case "sellPart":
      return fa
        ? `حدود نصف را الان بفروشید. برای بقیه یک هشدار ایمنی روی ${m(a.stopLevel)} بگذارید.`
        : `Sell about half now. Set a safety alert at ${m(a.stopLevel)} for the rest.`;
  }
}

/** One reason, with a sign: ✅ helps, ⚠️ hurts, ➖ neutral. */
export function partText(p: Part, f: Fmt): { sign: "plus" | "minus" | "zero"; text: string } {
  const fa = f.l === "fa";
  // Very small effects are shown as neutral, not as a reason for or against.
  const sign = p.pts >= 0.2 ? "plus" : p.pts <= -0.2 ? "minus" : "zero";
  const c = f.coin;
  switch (p.k) {
    case "regime":
      return {
        sign,
        text: fa
          ? `روند: ${REGIME[p.regime].fa}. در گذشتهٔ ${c}، در همین روند، 30 روز بعد به‌طور میانگین ${pct(p.avg30 * 100, 1)} بود (همهٔ روزها: ${pct(p.baseAvg30 * 100, 1)}). یک ماه بد (یک در ده) تا ${pct(p.badDip * 100)} افت داشت (معمولاً ${pct(p.baseBadDip * 100)}). (${iso(String(p.n))} روز بررسی شد)`
          : `Trend: ${REGIME[p.regime].en}. On ${c}, in this trend, 30 days later averaged ${pct(p.avg30 * 100, 1)} (all days: ${pct(p.baseAvg30 * 100, 1)}). A bad month (1 in 10) dipped ${pct(p.badDip * 100)} (normally ${pct(p.baseBadDip * 100)}). (${p.n} days checked)`,
      };
    case "analogs":
      return {
        sign,
        text: fa
          ? `لحظه‌های مشابه در گذشته: 30 روز بعد در ${iso(String(p.up))} مورد از ${iso(String(p.n))} مورد بالاتر بود (معمولاً ${share(p.baseUp)}).`
          : `Similar moments in the past: 30 days later it was higher in ${p.up} of ${p.n} (normally ${share(p.baseUp)}).`,
      };
    case "pattern":
      return {
        sign,
        text: fa
          ? `${PATTERN[p.id].fa}: بعد از این الگو، ${c} در ${iso(String(p.up))} مورد از ${iso(String(p.n))} مورد 30 روز بعد بالاتر بود (معمولاً ${share(p.baseUp)}).`
          : `${PATTERN[p.id].en}: after this pattern, ${c} was higher 30 days later in ${p.up} of ${p.n} cases (normally ${share(p.baseUp)}).`,
      };
    case "verdict":
      return { sign, text: p.action === "BUY" ? (fa ? "روش‌های برنامه الان «خرید» می‌گویند." : "The app's strategies say BUY right now.") : fa ? "روش‌های برنامه الان «فروش» می‌گویند (شرایط خروج)." : "The app's strategies say SELL right now (exit conditions)." };
    case "lines":
      return {
        sign,
        text: p.broke === "support"
          ? fa ? `قیمت زیر خط کفِ رو به بالا (${iso(f.money(p.level))}) بسته شد — نشانهٔ هشدار.` : `The price closed below its rising floor line (${f.money(p.level)}) — a warning sign.`
          : fa ? `قیمت بالای خط سقف (${iso(f.money(p.level))}) بسته شد — نشانهٔ قدرت.` : `The price closed above its ceiling line (${f.money(p.level)}) — a sign of strength.`,
      };
    case "rsi":
      return {
        sign,
        text: p.value >= 75
          ? fa ? `RSI ${iso(p.value.toFixed(0))}: خرید خیلی قوی در روزهای اخیر. این به‌تنهایی نشانهٔ مطمئن فروش نبوده.` : `RSI ${p.value.toFixed(0)}: very strong recent buying. On its own this has not been a reliable sell sign.`
          : fa ? `RSI ${iso(p.value.toFixed(0))}: فروش خیلی قوی در روزهای اخیر. این به‌تنهایی نشانهٔ مطمئن خرید نبوده.` : `RSI ${p.value.toFixed(0)}: very strong recent selling. On its own this has not been a reliable buy sign.`,
      };
    case "news":
      return { sign: "minus", text: fa ? `خبر جدی: «${p.title}»` : `Serious news: “${p.title}”` };
  }
}

export function confidenceText(a: Advice, l: Locale) {
  if (l === "fa")
    return a.confidence === "medium"
      ? "چقدر مطمئن؟ متوسط. چند نشانه با هم موافق‌اند — ولی در گذشته هم بارها اشتباه کرده‌اند."
      : "چقدر مطمئن؟ کم. نشانه‌ها ضعیف‌اند یا با هم مخالف‌اند — برای این ارز، جهت قیمت در چند هفتهٔ بعد در گذشته نزدیک به شیر یا خط بوده.";
  return a.confidence === "medium"
    ? "How sure? Medium. Several signs agree — but they were also wrong many times in the past."
    : "How sure? Low. The signs are weak or disagree — on this coin, the direction over the next weeks was close to a coin flip in the past.";
}

export function outlookLines(a: Advice, f: Fmt): string[] {
  const fa = f.l === "fa";
  const out: string[] = [];
  if (a.week) out.push(fa ? `هفتهٔ بعد: در ${iso(String(a.week.up))} مورد از ${iso(String(a.week.n))} لحظهٔ مشابه گذشته بالاتر رفت (معمولاً ${share(a.week.baseUp)}).` : `Next week: higher in ${a.week.up} of ${a.week.n} similar past moments (normally ${share(a.week.baseUp)}).`);
  const s = a.month.inState ?? a.month.all;
  if (s) out.push(fa ? `ماه بعد: در این روند، افتی حدود ${pct(s.medDip30 * 100)} در طول ماه عادی است؛ در یک مورد از ده، ${pct(s.badDip30 * 100)} یا بیشتر افت داشت. در ${share(s.up30)} موارد، 30 روز بعد بالاتر بود.` : `Next month: in this trend, a dip of about ${pct(s.medDip30 * 100)} at some point is normal; 1 in 10 times it fell ${pct(s.badDip30 * 100)} or more. It was higher 30 days later in ${share(s.up30)} of cases.`);
  const o = a.exitOdds?.odds.find((x) => x.days === 30);
  if (o && a.upTrigger && a.stopLevel)
    out.push(fa ? `در گذشته، ظرف 30 روز قیمت در ${share(o.targetFirst)} موارد اول به ${iso(f.money(a.upTrigger))} رسید و در ${share(o.stopFirst)} موارد اول به ${iso(f.money(a.stopLevel))} افتاد.` : `In the past, within 30 days the price reached ${f.money(a.upTrigger)} first in ${share(o.targetFirst)} of cases and fell to ${f.money(a.stopLevel)} first in ${share(o.stopFirst)}.`);
  return out;
}

export function changeMindLines(a: Advice, f: Fmt): string[] {
  const fa = f.l === "fa";
  const out: string[] = [];
  if (a.upTrigger) out.push(fa ? `🟢 اگر یک روز بالای ${iso(f.money(a.upTrigger))} بسته شود → نشانهٔ قدرت؛ نظر به سمت خرید می‌رود.` : `🟢 If a day closes above ${f.money(a.upTrigger)} → a sign of strength; the advice leans to buying.`);
  if (a.stopLevel) out.push(fa ? `🔴 اگر یک روز زیر ${iso(f.money(a.stopLevel))} بسته شود → نشانهٔ ضعف؛ اگر دارید، وقت محافظت یا فروش است.` : `🔴 If a day closes below ${f.money(a.stopLevel)} → a sign of weakness; if you own it, protect or sell.`);
  return out;
}
