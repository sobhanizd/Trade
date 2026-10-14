/**
 * Persian texts for the strategy definitions (name, summary, description, rules,
 * parameter labels/help) plus translations of the English sentences the strategies
 * and the signal pipeline generate (summaries, risks, conflicts, data issues,
 * status-change reasons). English always comes from the definitions themselves.
 * Pure strings + type imports only — safe in client and server code.
 */
import type { Locale } from "@/lib/i18n";
import { timeframePlain } from "@/lib/plain";
import type { ParamSpec, StrategyRules } from "./types";

type ParamText = { label: string; help: string };
interface StrategyFa {
  name: string;
  summary: string;
  description: string;
  rules: StrategyRules;
  params: Record<string, ParamText>;
}

/* Shared Persian wording for parameters that appear in several strategies. */
const P_FA = {
  trendSma: { label: "SMA بلندمدت", help: "فیلتر روند بلندمدت (میانگین متحرک ساده، بر حسب تعداد کندل)." },
  target1R: { label: "هدف سود ۱ (R)", help: "اولین هدف سود، به صورت چند برابرِ ریسک (R = فاصلهٔ ورود تا حد ضرر)." },
  target2R: { label: "هدف سود ۲ (R)", help: "دومین هدف سود، به صورت چند برابرِ ریسک." },
  expiryBars: { label: "مدت اعتبار (کندل)", help: "بعد از این تعداد کندل، سیگنالی که دوباره تأیید نشده منقضی می‌شود." },
  stopBufferAtr: { label: "حاشیهٔ حد ضرر (× ATR)", help: "فاصلهٔ اضافه زیر کف قیمت، بر حسب ATR (اندازهٔ متوسط نوسان هر کندل)." },
  volMult: { label: "آستانهٔ نسبت حجم", help: "حجم معاملات باید چند برابر میانگینش باشد تا تأیید حساب شود." },
} satisfies Record<string, ParamText>;

const LONG_TARGETS = "چند برابرِ ریسک (R) بالای قیمت ورود؛ R یعنی فاصلهٔ قیمت ورود تا حد ضرر.";

export const STRATEGY_FA: Record<string, StrategyFa> = {
  trend_following: {
    name: "همراه با روند",
    summary: "در روندهای صعودیِ جاافتاده وارد می‌شود؛ روند باید با میانگین‌های متحرک، سرعت حرکت قیمت (MACD) و قدرت روند (ADX) تأیید شود.",
    description:
      "دنبال بازارهایی می‌گردد که قیمت بالای یک میانگین متحرکِ کندِ رو به بالا (EMA کند) است و میانگین سریع هم بالای میانگین کند قرار دارد. این وضعیت فقط وقتی «قوی» حساب می‌شود که سرعت حرکت (هیستوگرام MACD)، قدرت روند (ADX) و فیلتر بلندمدت (قیمت بالای میانگین ساده ۲۰۰ کندلی) همه موافق باشند و RSI (شاخص قدرت خرید و فروش) هم بیش از حد بالا نرفته باشد. این روش معمولاً در روندهای پایدار خوب کار می‌کند و در بازارهای بی‌جهت (وقتی قیمت درجا می‌زند) با چند ضرر کوچکِ پشت‌سرهم پول از دست می‌دهد.",
    rules: {
      setup: ["قیمت بالای EMA کند بسته شود", "EMA سریع بالای EMA کند باشد", "EMA کند در بازهٔ اندازه‌گیری شیب، رو به بالا باشد"],
      confirmation: [
        "هیستوگرام MACD (سرعت حرکت) بالای صفر باشد",
        "ADX (قدرت روند) برابر یا بیشتر از حداقل تعیین‌شده باشد",
        "قیمت بالای SMA بلندمدت (میانگین متحرک ساده) بسته شود",
        "RSI زیر حدِ «داغ کردن» (رشد بیش از حد) باشد",
      ],
      exit: [
        "سیگنال فروش: قیمت زیر EMA کند بسته شود، EMA سریع زیر EMA کند برود و خط MACD زیر صفر باشد",
        "در حال ضعیف شدن: قیمت زیر EMA کند بسته شود در حالی که EMA سریع هنوز بالای آن است",
      ],
      invalidation: "فرصت‌های خرید: قیمت بسته شدن منهای (ضریب ATR × ATR). سیگنال فروش با بسته شدن دوبارهٔ قیمت بالای EMA کند لغو می‌شود.",
      targets: LONG_TARGETS,
      expiry: "در پایان هر کندل دوباره بررسی می‌شود؛ سیگنالی که تغییر نکرده، اگر در مدت اعتبار دوباره تأیید نشود منقضی می‌شود.",
    },
    params: {
      fastEma: { label: "EMA سریع", help: "میانگین متحرک کوتاه‌مدتِ روند (تعداد کندل)." },
      slowEma: { label: "EMA کند", help: "میانگین متحرک میان‌مدتِ روند." },
      trendSma: P_FA.trendSma,
      slopeBars: { label: "بازهٔ شیب (کندل)", help: "تعداد کندل‌هایی که برای سنجیدن رو به بالا بودن EMA کند استفاده می‌شود." },
      adxMin: { label: "حداقل ADX", help: "ADX (قدرت روند) کمتر از این یعنی روند ضعیف است یا قیمت درجا می‌زند." },
      rsiMax: { label: "سقف RSI (داغ کردن)", help: "اگر RSI بالاتر از این باشد، فرصت «قوی» حساب نمی‌شود." },
      atrStopMult: { label: "حد ضرر (× ATR)", help: "فاصلهٔ حد ضرر زیر قیمت، بر حسب ATR (اندازهٔ متوسط نوسان هر کندل)." },
      target1R: P_FA.target1R,
      target2R: P_FA.target2R,
      expiryBars: P_FA.expiryBars,
    },
  },
  momentum: {
    name: "شتاب گرفتن",
    summary: "دنبال یک تقاطع صعودیِ تازه در MACD (شاخص سرعت حرکت قیمت) می‌گردد که RSI، بالا رفتن قیمت و حجم معاملاتِ بیشتر از معمول آن را تأیید کنند.",
    description:
      "تغییر شتاب قیمت اغلب با عبور خط MACD از بالای «خط سیگنال» خودش شروع می‌شود. این روش فقط وقتی این تغییر را «قوی» می‌داند که RSI (شاخص قدرت خرید و فروش) بالای خط میانی باشد ولی بیش از حد بالا نرفته باشد، قیمت از چند کندل قبل بالاتر باشد و حجم معاملات بیشتر از میانگین اخیرش باشد — حجم نشان می‌دهد آدم‌های زیادی پشت این حرکت هستند. سیگنال‌های شتاب سریع واکنش نشان می‌دهند، برای همین شروع‌های اشتباه هم بیشتر از روش‌های کندتر دارند.",
    rules: {
      setup: ["خط MACD در بازهٔ تقاطع از بالای خط سیگنالش عبور کرده و هنوز بالای آن است"],
      confirmation: [
        "RSI بالای خط میانی و زیر حدِ «خرید بیش از حد» باشد",
        "نسبت حجم معاملات در بازهٔ تقاطع برابر یا بیشتر از آستانه باشد",
        "ROC (نرخ تغییر قیمت) مثبت باشد",
      ],
      exit: [
        "سیگنال فروش: MACD در این بازه به زیر خط سیگنال رفته و RSI زیر خط میانی است",
        "در حال ضعیف شدن: هیستوگرام MACD مثبت است ولی ۳ کندل پشت‌سرهم کوچک‌تر شده",
      ],
      invalidation: "فرصت‌های خرید: قیمت بسته شدن منهای (ضریب ATR × ATR). سیگنال فروش با عبور دوبارهٔ MACD به بالای خط سیگنال لغو می‌شود.",
      targets: "چند برابرِ ریسک (R) بالای قیمت ورود.",
      expiry: "شتاب زود از بین می‌رود: سیگنال‌ها بعد از مدت کوتاهی منقضی می‌شوند، مگر دوباره تأیید شوند.",
    },
    params: {
      crossLookback: { label: "بازهٔ تقاطع (کندل)", help: "تقاطع MACD باید حداکثر چند کندل پیش رخ داده باشد." },
      rsiMid: { label: "خط میانی RSI", help: "RSI باید بالاتر از این باشد." },
      rsiMax: { label: "حد خرید بیش از حد RSI", help: "RSI باید پایین‌تر از این باشد." },
      volPeriod: { label: "میانگین حجم (کندل)", help: "تعداد کندل‌ها برای محاسبهٔ میانگین حجم معاملات." },
      volMult: P_FA.volMult,
      rocPeriod: { label: "دورهٔ ROC", help: "تعداد کندل‌ها برای بررسی ROC (نرخ تغییر قیمت)." },
      atrStopMult: { label: "حد ضرر (× ATR)", help: "فاصلهٔ حد ضرر بر حسب ATR (اندازهٔ متوسط نوسان هر کندل)." },
      target1R: P_FA.target1R,
      target2R: P_FA.target2R,
      expiryBars: P_FA.expiryBars,
    },
  },
  pullback: {
    name: "خرید در اصلاح",
    summary: "در یک روند صعودیِ جاافتاده صبر می‌کند تا قیمت کمی تا نزدیک EMA سریع پایین بیاید، و بعد منتظر یک کندل صعودیِ «ماشه» (نشانهٔ برگشت خریداران) می‌ماند.",
    description:
      "به‌جای دنبال کردن قیمتی که تند بالا رفته، این روش صبر می‌کند تا در یک روند صعودی، قیمت تا نزدیکی EMA سریع (میانگین متحرک کوتاه‌مدت) عقب بنشیند و RSI (شاخص قدرت خرید و فروش) کمی آرام شود، بدون این‌که سقوط کند. فرصت خرید فقط وقتی اعلام می‌شود که یک کندل «ماشه» بالای سقف کندل قبلی بسته شود — نشانهٔ این‌که خریداران برگشته‌اند. اگر افت ادامه پیدا کند و از EMA کند هم پایین‌تر برود، ممکن است اصلاح در حال تبدیل شدن به برگشت روند باشد.",
    rules: {
      setup: [
        "EMA سریع بالای EMA کند باشد و EMA کند رو به بالا برود",
        "قیمت بالای SMA بلندمدت بسته شود",
        "در بازهٔ اصلاح، کف قیمت به محدودهٔ EMA سریع رسیده باشد (با تلورانس ± ATR)",
        "اصلاح بالای حاشیهٔ EMA کند مانده باشد؛ RSI تا محدودهٔ اصلاح پایین آمده ولی زیر کف نرفته باشد",
      ],
      confirmation: ["ماشه: کندل صعودی که بالای سقف کندل قبلی بسته شود", "حجم معاملات کندل ماشه برابر یا بیشتر از میانگین باشد"],
      exit: [
        "سیگنال فروش: EMA سریع زیر EMA کند برود و قیمت زیر EMA کند بسته شود",
        "در حال ضعیف شدن: قیمت زیر حاشیهٔ EMA کند بسته شود در حالی که EMA سریع هنوز بالای آن است",
      ],
      invalidation: "پایین‌ترین قیمتِ بازهٔ اصلاح منهای یک حاشیه بر حسب ATR.",
      targets: "چند برابرِ ریسک (R) بالای قیمت ورود.",
      expiry: "در پایان هر کندل دوباره بررسی می‌شود؛ اگر دوباره تأیید نشود منقضی می‌شود.",
    },
    params: {
      fastEma: { label: "EMA سریع", help: "میانگینی که عقب‌نشینی قیمت تا آن سنجیده می‌شود." },
      slowEma: { label: "EMA کند", help: "میانگین روند که اصلاح نباید از آن پایین‌تر برود." },
      trendSma: P_FA.trendSma,
      pullbackBars: { label: "بازهٔ اصلاح (کندل)", help: "تعداد کندل‌های اخیر که برای پیدا کردن اصلاح بررسی می‌شوند." },
      touchAtr: { label: "تلورانس رسیدن (× ATR)", help: "چقدر نزدیک شدن به EMA سریع، «رسیدن» حساب می‌شود." },
      rsiPullbackMax: { label: "سقف RSI در اصلاح", help: "RSI باید تا این عدد یا پایین‌تر آمده باشد." },
      rsiFloor: { label: "کف RSI", help: "افت RSI به زیر این عدد، ریزش حساب می‌شود نه اصلاح." },
      stopBufferAtr: { label: "حاشیهٔ حد ضرر (× ATR)", help: "فاصلهٔ اضافه زیر کفِ اصلاح، بر حسب ATR (اندازهٔ متوسط نوسان هر کندل)." },
      target1R: P_FA.target1R,
      target2R: P_FA.target2R,
      expiryBars: P_FA.expiryBars,
    },
  },
  breakout: {
    name: "شکست سقف",
    summary: "بسته شدن قیمت بالای یک محدودهٔ فشرده (جایی که قیمت مدتی درجا زده) را پیدا می‌کند؛ با تأیید حجم معاملات و محافظت در برابر شکست‌های کاذب.",
    description:
      "یک محدوده با بالاترین سقف و پایین‌ترین کفِ چند کندل قبلی تعریف می‌شود. شکست سقف یعنی قیمت بالای سقف محدوده به‌اضافهٔ یک حاشیهٔ کوچک ATR «بسته شود» (فقط سایهٔ کندل کافی نیست)؛ بهتر است این اتفاق بعد از یک دورهٔ درجا زدنِ فشرده، با حجم معاملات بیشتر از میانگین و با بسته شدن کندل در بخش بالایی آن بیفتد. در صورت تنظیم، منتظر کندل‌های تأییدیِ بیشتری هم می‌ماند. بسیاری از شکست‌ها ناموفق‌اند؛ اگر قیمت دوباره به داخل محدوده برگردد، شکست ناموفق حساب می‌شود.",
    rules: {
      setup: ["قیمت بالای سقفِ چند کندل قبلی به‌اضافهٔ حاشیهٔ ATR بسته شود، به تعداد کندل‌های تأییدیِ لازم"],
      confirmation: [
        "ارتفاع محدوده برابر یا کمتر از حداکثر ضریب ATR باشد (یک درجا زدنِ واقعی)",
        "حجم کندل شکست برابر یا بیشتر از «آستانه × میانگین» باشد",
        "کندل شکست در بخش بالایی خودش بسته شده باشد",
      ],
      exit: ["سیگنال فروش: یک شکستِ اخیر دوباره زیر سطح شکسته‌شده بسته شده (شکست ناموفق)", "سیگنال فروش: قیمت زیر کف محدوده بسته شود (شکست کف)"],
      invalidation: "سقف محدوده منهای ضریب ATR (یعنی قیمت دوباره به داخل محدوده برگشته).",
      targets: "حرکت اندازه‌گیری‌شده (ارتفاع محدوده، از سطح شکست به بالا) و یک هدف بر حسب R.",
      expiry: "شکست‌ها به زمان حساس‌اند؛ سیگنال‌ها زود منقضی می‌شوند مگر دوباره تأیید شوند.",
    },
    params: {
      rangeBars: { label: "طول محدوده (کندل)", help: "تعداد کندل‌هایی که محدودهٔ درجا زدن را می‌سازند." },
      maxRangeAtr: { label: "حداکثر ارتفاع محدوده (× ATR)", help: "محدوده‌های بزرگ‌تر از این، درجا زدن حساب نمی‌شوند." },
      bufferAtr: { label: "حاشیهٔ شکست (× ATR)", help: "قیمت بسته شدن باید دست‌کم به این اندازه بالاتر از سطح باشد." },
      volMult: { label: "آستانهٔ نسبت حجم", help: "حجم کندل شکست نسبت به میانگین حجم." },
      closeStrength: { label: "قدرت بسته شدن", help: "جای قیمت بسته شدن در دامنهٔ کندل (۰ = کف، ۱ = سقف)." },
      confirmBars: { label: "کندل‌های تأیید", help: "تعداد بسته شدن‌های پشت‌سرهم بالای سطح که لازم است." },
      stopAtr: { label: "حد ضرر (× ATR زیر سطح)", help: "فاصلهٔ حد ضرر زیر سطح شکسته‌شده، بر حسب ATR." },
      targetR: { label: "هدف سود (R)", help: "هدف سود اضافه، به صورت چند برابرِ ریسک." },
      failLookback: { label: "بازهٔ شکست ناموفق (کندل)", help: "شکست‌های اخیر در این بازه از نظر ناموفق بودن بررسی می‌شوند." },
      expiryBars: P_FA.expiryBars,
    },
  },
  risk_aware_swing: {
    name: "نوسان‌گیری محتاطانه",
    summary: "فرصت‌های چندروزه تا چندهفته‌ای وقتی تصویر کلی بازار صعودی است؛ فقط اگر نوسان قابل‌قبول باشد و نسبت سود به ضرر تا مقاومت بعدی (سقفی که قیمت قبلاً از آن برگشته) کافی باشد.",
    description:
      "برای تصمیم‌های آهسته‌تر روی نمودار روزانه طراحی شده. شرط‌ها: تصویر کلی صعودی (SMA ۵۰ بالای SMA ۲۰۰)، قیمت بالای SMA ۵۰، RSI (شاخص قدرت خرید و فروش) در محدودهٔ متعادل، نوسان (ATR به‌صورت درصدی از قیمت) کمتر از یک سقف، و — مهم‌تر از همه — فاصلهٔ کافی تا نزدیک‌ترین مقاومت، تا با در نظر گرفتن حد ضرر، حداقل نسبت سود به ضرر به دست بیاید. اگر هر کدام از بررسی‌های ریسک رد شود، درجهٔ فرصت پایین می‌آید.",
    rules: {
      setup: ["تصویر کلی صعودی: SMA سریع بالای SMA کند باشد", "قیمت بالای SMA سریع بسته شود"],
      confirmation: [
        "نسبت سود به ضرر تا نزدیک‌ترین مقاومت (یا هدف R اگر مقاومتی نباشد) برابر یا بیشتر از حداقل باشد — اجباری",
        "RSI در محدودهٔ متعادل باشد",
        "ATR% (ATR ÷ قیمت) برابر یا کمتر از سقف نوسان باشد (برای درجهٔ «خرید احتمالی» یکی از این دو می‌تواند برقرار نباشد)",
      ],
      exit: [
        "سیگنال فروش: دو بسته شدنِ پشت‌سرهم زیر SMA سریع، یا منفی شدن تصویر کلی همراه با بسته شدن زیر SMA سریع",
        "در حال ضعیف شدن: یک بار بسته شدن زیر SMA سریع",
      ],
      invalidation: "پایین‌ترین قیمتِ بازهٔ نوسان اخیر منهای یک حاشیهٔ ATR.",
      targets: "نزدیک‌ترین مقاومتِ تأییدشده بالای قیمت (اگر باشد) و یک هدف بر حسب R.",
      expiry: "در پایان هر روز دوباره بررسی می‌شود؛ اگر در مدت اعتبار دوباره تأیید نشود منقضی می‌شود.",
    },
    params: {
      fastSma: { label: "SMA سریع", help: "میانگین متحرک روندِ نوسانی." },
      slowSma: { label: "SMA کند", help: "میانگینی که تصویر کلی بازار را نشان می‌دهد." },
      rsiLow: { label: "کف محدودهٔ RSI", help: "پایین‌ترین RSI قابل‌قبول." },
      rsiHigh: { label: "سقف محدودهٔ RSI", help: "بالاترین RSI قابل‌قبول." },
      maxAtrPct: { label: "حداکثر ATR (درصد قیمت)", help: "سقف نوسان." },
      swingLowBars: { label: "بازهٔ کف نوسان (کندل)", help: "تعداد کندل‌ها برای پیدا کردن کفی که حد ضرر زیر آن قرار می‌گیرد." },
      stopBufferAtr: { label: "حاشیهٔ حد ضرر (× ATR)", help: "فاصلهٔ اضافه زیر کف نوسان." },
      minRR: { label: "حداقل نسبت سود به ضرر", help: "نسبت سود به ضرر لازم تا اولین هدف سود." },
      targetR: { label: "هدف سود (R)", help: "هدف سود بر حسب R وقتی مقاومتی پیدا نشده." },
      expiryBars: P_FA.expiryBars,
    },
  },
};

/** Persian explanation of the abbreviations used in the rules (shown once per strategy card). */
export const STRATEGY_TERMS_FA =
  "واژه‌ها: EMA و SMA = میانگین متحرک قیمت (نمایی / ساده)؛ «سریع» یعنی کوتاه‌مدت و «کند» یعنی بلندمدت‌تر. RSI = شاخص قدرت خرید و فروش (۰ تا ۱۰۰). MACD = شاخص سرعت و جهت حرکت قیمت. ADX = قدرت روند. ATR = اندازهٔ متوسط نوسان هر کندل. ROC = نرخ تغییر قیمت. R = فاصلهٔ قیمت ورود تا حد ضرر (واحد ریسک). کندل = قیمت در یک بازهٔ زمانی (مثلاً یک روز).";

interface StrategyLike {
  id: string;
  name: string;
  summary: string;
  description: string;
  rules: StrategyRules;
  params: ParamSpec[];
}

export interface StrategyText {
  name: string;
  summary: string;
  description: string;
  rules: StrategyRules;
  /** Localized label/help per parameter key. */
  params: Record<string, ParamText>;
}

/** Localized texts of a strategy definition (English = the definition's own texts). */
export function strategyText(def: StrategyLike, locale: Locale): StrategyText {
  const en: StrategyText = {
    name: def.name,
    summary: def.summary,
    description: def.description,
    rules: def.rules,
    params: Object.fromEntries(def.params.map((p) => [p.key, { label: p.label, help: p.help }])),
  };
  const fa = locale === "fa" ? STRATEGY_FA[def.id] : undefined;
  if (!fa) return en;
  return {
    name: fa.name,
    summary: fa.summary,
    description: fa.description,
    rules: fa.rules,
    params: Object.fromEntries(def.params.map((p) => [p.key, fa.params[p.key] ?? en.params[p.key]])),
  };
}

/** Localized strategy name from id (falls back to the given English name). */
export function strategyTitle(id: string, enName: string, locale: Locale): string {
  return locale === "fa" ? (STRATEGY_FA[id]?.name ?? enName) : enName;
}

/** Localized label/help of one parameter of strategy `id`. */
export function paramText(id: string, spec: Pick<ParamSpec, "key" | "label" | "help">, locale: Locale): ParamText {
  const fa = locale === "fa" ? STRATEGY_FA[id]?.params[spec.key] : undefined;
  return fa ?? { label: spec.label, help: spec.help };
}

/** Parameter specs with localized label/help (numbers unchanged). */
export function localizedParams(def: Pick<StrategyLike, "id" | "params">, locale: Locale): ParamSpec[] {
  if (locale !== "fa") return def.params;
  return def.params.map((p) => ({ ...p, ...paramText(def.id, p, locale) }));
}

/* ---------- Generated sentences (signal summaries, risks, conflicts, data issues) ---------- */

const EN_NAME_TO_ID: Record<string, string> = {
  "Trend Following": "trend_following",
  Momentum: "momentum",
  Pullback: "pullback",
  Breakout: "breakout",
  "Risk-Aware Swing": "risk_aware_swing",
};
const faNames = (list: string) =>
  list
    .split(", ")
    .map((n) => STRATEGY_FA[EN_NAME_TO_ID[n] ?? ""]?.name ?? n)
    .join("، ");

const SUMMARY_FA: Record<string, string> = {
  // Trend following
  "Up-trend structure with momentum, trend-strength and long-term confirmation.": "ساختار روند صعودی است و سرعت حرکت، قدرت روند و روند بلندمدت هم آن را تأیید می‌کنند.",
  "Up-trend structure detected; some confirmations are missing.": "ساختار روند صعودی دیده می‌شود، ولی بعضی از تأییدها هنوز نیست.",
  "Up-trend structure present but momentum/strength not confirming — waiting.": "ساختار روند صعودی هست، ولی سرعت حرکت یا قدرت روند آن را تأیید نمی‌کند — صبر.",
  "Trend structure broken: price and fast EMA below slow EMA with negative momentum.": "ساختار روند شکسته: قیمت و EMA سریع زیر EMA کند رفته‌اند و سرعت حرکت منفی است.",
  "Price closed below the slow EMA while the trend averages are still up — trend under pressure.": "قیمت زیر EMA کند بسته شد در حالی که میانگین‌های روند هنوز رو به بالا هستند — روند زیر فشار است.",
  "No established up-trend according to this strategy's rules.": "طبق قوانین این روش، روند صعودیِ جاافتاده‌ای وجود ندارد.",
  // Momentum
  "Fresh bullish MACD crossover confirmed by RSI, positive ROC and above-average volume.": "تقاطع صعودیِ تازه در MACD که RSI، نرخ تغییر مثبت قیمت و حجم معاملاتِ بیشتر از میانگین آن را تأیید می‌کنند.",
  "Fresh bullish MACD crossover with partial confirmation.": "تقاطع صعودیِ تازه در MACD با تأیید ناقص.",
  "MACD crossed up but confirmation is weak — waiting.": "MACD رو به بالا عبور کرد ولی تأییدها ضعیف است — صبر.",
  "Bearish MACD crossover with RSI below its midline — momentum has turned down.": "تقاطع نزولی در MACD و RSI زیر خط میانی — شتاب قیمت رو به پایین شده است.",
  "Positive momentum is fading (MACD histogram declining for 3 bars).": "شتاب مثبت دارد کم می‌شود (هیستوگرام MACD سه کندل پشت‌سرهم کوچک‌تر شده).",
  "Momentum is positive but there is no fresh crossover to act on.": "شتاب مثبت است ولی تقاطع تازه‌ای برای اقدام وجود ندارد.",
  "No bullish momentum shift detected.": "هیچ تغییر صعودی در شتاب قیمت دیده نشد.",
  // Pullback
  "Pullback to the fast EMA within an up-trend, followed by a bullish trigger candle on solid volume.": "عقب‌نشینی تا EMA سریع در یک روند صعودی، و بعد یک کندل صعودیِ «ماشه» با حجم معاملات خوب.",
  "Pullback within an up-trend with a bullish trigger, but volume is light.": "اصلاح در روند صعودی همراه با کندل صعودیِ «ماشه»، ولی حجم معاملات کم است.",
  "Pullback in progress within an up-trend — waiting for a bullish trigger candle.": "اصلاح در یک روند صعودی در جریان است — منتظر کندل صعودیِ «ماشه».",
  "The pullback turned into a trend reversal (fast EMA below slow EMA, price below slow EMA).": "اصلاح به برگشت روند تبدیل شد (EMA سریع زیر EMA کند، قیمت زیر EMA کند).",
  "Price fell through the slow EMA buffer — the pullback is deeper than this strategy accepts.": "قیمت از حاشیهٔ EMA کند پایین‌تر رفت — اصلاح عمیق‌تر از حدی است که این روش می‌پذیرد.",
  "Up-trend intact but no qualifying pullback yet.": "روند صعودی سالم است ولی هنوز اصلاحِ مناسبی رخ نداده.",
  "No up-trend pullback setup according to this strategy's rules.": "طبق قوانین این روش، فرصت خرید در اصلاحِ روند صعودی وجود ندارد.",
  // Breakout
  "Confirmed close above a tight range on strong volume.": "بسته شدنِ تأییدشده بالای یک محدودهٔ فشرده با حجم معاملات زیاد.",
  "Close above the range with partial confirmation.": "بسته شدن بالای محدوده با تأیید ناقص.",
  "Price closed above the range but confirmation is weak — possible false breakout.": "قیمت بالای محدوده بسته شد ولی تأییدها ضعیف است — شاید شکست کاذب باشد.",
  "Failed breakout: price closed back below the broken level.": "شکست ناموفق: قیمت دوباره زیر سطح شکسته‌شده بسته شد.",
  "Price broke down below the range low.": "قیمت به زیر کف محدوده افتاد.",
  "Price is testing the top of its range — waiting for a confirmed close above.": "قیمت در حال آزمودن سقف محدوده است — منتظر بسته شدنِ تأییدشده بالای آن.",
  "Price is inside its range; no breakout.": "قیمت داخل محدوده‌اش است؛ شکستی رخ نداده.",
  // Risk-aware swing
  "Bullish regime with acceptable volatility, moderate RSI and sufficient reward-to-risk.": "تصویر کلی صعودی، نوسان قابل‌قبول، RSI متعادل و نسبت سود به ضرر کافی.",
  "Bullish regime swing setup with sufficient reward-to-risk; one other check is failing.": "فرصت نوسانی در تصویر کلی صعودی با نسبت سود به ضرر کافی؛ یکی از بررسی‌های دیگر برقرار نیست.",
  "Bullish regime, but reward-to-risk to the next resistance is insufficient — waiting.": "تصویر کلی صعودی است، ولی نسبت سود به ضرر تا مقاومت بعدی کافی نیست — صبر.",
  "Bullish regime, but entry conditions are not favourable — waiting.": "تصویر کلی صعودی است، ولی شرایط ورود مناسب نیست — صبر.",
  "Swing trend lost: closes below the fast SMA (or bearish regime).": "روند نوسانی از دست رفت: بسته شدن زیر SMA سریع (یا تصویر کلی نزولی).",
  "First close below the fast SMA in a bullish regime — watch for confirmation.": "اولین بسته شدن زیر SMA سریع در تصویر کلی صعودی — مراقب تأیید آن باشید.",
  "No bullish swing regime according to this strategy's rules.": "طبق قوانین این روش، وضعیت صعودی برای نوسان‌گیری وجود ندارد.",
  // Pipeline
  "No signal: the market data did not pass quality checks.": "بدون سیگنال: داده‌های بازار از بررسی کیفیت رد نشد.",
};

/** One-line summary produced by a strategy evaluation. */
export function summaryText(summary: string, locale: Locale): string {
  return locale === "fa" ? (SUMMARY_FA[summary] ?? summary) : summary;
}

type Rule = [RegExp, (m: RegExpMatchArray) => string];
const EVIDENCE_FA: Rule[] = [
  // Trend following
  [/^MACD histogram is negative while the trend structure is up/, () => "هیستوگرام MACD منفی است در حالی که ساختار روند صعودی است (سرعت حرکت، روند را تأیید نمی‌کند)."],
  [/^ADX (\S+) is below (\S+): the trend is weak/, (m) => `ADX (قدرت روند) ${m[1]} و کمتر از ${m[2]} است: روند ضعیف است و شاید قیمت فقط درجا بزند.`],
  [/^Price is below the (\d+)-period SMA/, (m) => `قیمت زیر SMA ${m[1]} کندلی است (روند بلندمدت تأیید نشده).`],
  [/^Long-term SMA (\d+) unavailable/, (m) => `SMA بلندمدت ${m[1]} در دسترس نیست (تاریخچهٔ قیمت کافی نیست).`],
  [/^RSI (\S+) is above (\S+): price is extended/, (m) => `RSI ${m[1]} بالاتر از ${m[2]} است: قیمت زیادی بالا رفته و معمولاً بعدش کمی عقب‌نشینی می‌کند.`],
  // Breakout
  [/^Breakouts frequently fail/, () => "شکست‌ها اغلب ناموفق‌اند؛ اگر قیمت دوباره داخل محدوده بسته شود، این فرصت باطل می‌شود."],
  [/^Breakout volume is not above average/, () => "حجم معاملاتِ کندل شکست بیشتر از میانگین نیست — یک نشانهٔ رایج شکست کاذب."],
  [/^The prior range was wide/, () => "محدودهٔ قبلی پهن بود؛ شاید این شکستِ یک درجا زدنِ واقعی نباشد."],
  [/^The breakout candle closed weakly/, () => "کندل شکست ضعیف بسته شد (سایهٔ بالایی بلند)."],
  // Momentum
  [/^Volume is not above average — the move may lack participation/, () => "حجم معاملات بیشتر از میانگین نیست — شاید آدم‌های کمی پشت این حرکت باشند."],
  [/^RSI (\S+) is overbought\.$/, (m) => `RSI ${m[1]} در محدودهٔ «خرید بیش از حد» است.`],
  [/^Price is lower than it was at the start of the ROC window/, () => "قیمت از ابتدای بازهٔ ROC (نرخ تغییر قیمت) پایین‌تر است."],
  // Pullback
  [/^Trigger candle volume is below average/, () => "حجم معاملاتِ کندل ماشه کمتر از میانگین است."],
  // Risk-aware swing
  [/^Volatility is high \(ATR (\S+)% of price\)/, (m) => `نوسان زیاد است (ATR برابر ${m[1]}% قیمت): نوسان‌های بزرگ‌تر و ضرر بیشتر اگر حد ضرر فعال شود.`],
  [/^Reward-to-risk (\S+) to the next resistance is below (\S+)\.$/, (m) => `نسبت سود به ضرر تا مقاومت بعدی ${m[1]} است و کمتر از ${m[2]}.`],
  [/^RSI (\S+) is outside the (\S+)–(\S+) zone/, (m) => `RSI ${m[1]} بیرون از محدودهٔ ${m[2]} تا ${m[3]} است.`],
  [/^No overhead resistance identified/, () => "هیچ مقاومتی بالای قیمت پیدا نشد (شاید قیمت در محدوده‌ای تازه است)؛ هدف‌های سود فقط بر حسب R هستند."],
  [/^Volatility is extreme relative to this strategy's ceiling/, () => "نوسان در مقایسه با سقفِ این روش خیلی زیاد است."],
  // Signal pipeline
  [/^Elevated volatility: ATR is (\S+)% of price on the (\S+) timeframe/, (m) => `نوسان بالاست: ATR در ${timeframePlain(m[2], "fa")} برابر ${m[1]}% قیمت است.`],
  [/^The latest candle's range exceeded 3× ATR/, () => "دامنهٔ آخرین کندل بیش از ۳ برابر ATR بود — حرکتی غیرعادی و بزرگ."],
  [/^RSI (\S+) is in overbought territory/, (m) => `RSI ${m[1]} در محدودهٔ «خرید بیش از حد» است.`],
  [/^Reward\/risk to the first target after fees & slippage is only (\S+)\.$/, (m) => `نسبت سود به ضرر تا اولین هدف سود، با احتساب کارمزد و لغزش قیمت، فقط ${m[1]} است.`],
  [/^Resistance near (.+) lies below the first target \((.+)\)\.$/, (m) => `یک مقاومت نزدیک ${m[1]} پایین‌تر از اولین هدف سود (${m[2]}) قرار دارد.`],
  [/^Contradiction: (.+) currently show\(s\) an exit\/sell condition/, (m) => `تناقض: ${faNames(m[1])} الان در همین بازهٔ زمانی شرط خروج یا فروش را نشان می‌دهد.`],
  [/^Contradiction: (.+) currently show\(s\) a buy setup/, (m) => `تناقض: ${faNames(m[1])} الان در همین بازهٔ زمانی فرصت خرید نشان می‌دهد.`],
  // Data quality
  [/^No candle data was returned/, () => "منبع داده هیچ کندلی برنگرداند."],
  [/^Candles arrived out of order/, () => "کندل‌ها نامرتب رسیدند و دوباره مرتب شدند."],
  [/^(\d+) exact duplicate candle\(s\) removed/, (m) => `${m[1]} کندل تکراری حذف شد.`],
  [/^(\d+) candle\(s\) had conflicting duplicate values/, (m) => `${m[1]} کندل مقدارهای تکراریِ متناقض داشت؛ آخرین نسخه نگه داشته شد.`],
  [/^(\d+) candle\(s\) contain zero, negative/, (m) => `${m[1]} کندل قیمت یا حجم صفر، منفی یا نامعتبر دارد.`],
  [/^(\d+) candle\(s\) have inconsistent OHLC/, (m) => `${m[1]} کندل مقدارهای ناسازگار دارد (مثلاً سقف پایین‌تر از قیمت بسته شدن).`],
  [/^(\d+) candle\(s\) moved more than (\d+)% within a single bar/, (m) => `${m[1]} کندل در یک بازه بیش از ${m[2]}% حرکت کرد. قبل از هر کاری بررسی کنید.`],
  [/^(\d+) candle\(s\) reported zero volume/, (m) => `${m[1]} کندل حجم معاملات صفر داشت — شاید نقدشوندگی (تعداد خریدار و فروشنده) کم باشد.`],
  [/^(\d+) missing candle\(s\) detected/, (m) => `${m[1]} کندل در داده‌ها جا افتاده است.`],
  [/^Only (\d+) closed candle\(s\) available; at least (\d+)/, (m) => `فقط ${m[1]} کندل بسته‌شده در دسترس است؛ برای شاخص‌های قابل‌اعتماد دست‌کم ${m[2]} کندل لازم است.`],
  [/^Latest closed candle ended (\d+) minutes ago/, (m) => `آخرین کندل بسته‌شده ${m[1]} دقیقه پیش تمام شده — داده‌ها قدیمی است.`],
  // Cross-check with a second exchange
  [/^Prices from (\S+) and (\S+) differ too much \((\S+)% on the latest candle, (\S+)% typical\)/, (m) => `قیمت‌های ${m[1]} و ${m[2]} خیلی با هم فرق دارند (${m[3]}% در آخرین کندل، معمولاً ${m[4]}%) — شاید یکی از منبع‌ها اشتباه باشد، برای همین سیگنالی داده نمی‌شود.`],
  [/^Prices from (\S+) and (\S+) differ slightly \((\S+)% on the latest candle, (\S+)% typical\)/, (m) => `قیمت‌های ${m[1]} و ${m[2]} کمی با هم فرق دارند (${m[3]}% در آخرین کندل، معمولاً ${m[4]}%).`],
  [/^This data could not be double-checked on a second exchange \((\S+)\)/, (m) => `این داده‌ها را نشد با یک صرافی دوم (${m[1]}) دوباره بررسی کرد.`],
];

/** Risks, conflicts and data-quality notes produced by the strategies/signal pipeline. Unknown text passes through. */
export function evidenceText(text: string, locale: Locale): string {
  if (locale !== "fa") return text;
  for (const [re, fn] of EVIDENCE_FA) {
    const m = text.match(re);
    if (m) return fn(m);
  }
  return text;
}

/** Signal status (ACTIVE, SUPERSEDED, …). */
export function signalStatusText(status: string, locale: Locale): string {
  if (locale !== "fa") return status;
  const map: Record<string, string> = { ACTIVE: "فعال", SUPERSEDED: "جایگزین‌شده", INVALIDATED: "باطل‌شده", EXPIRED: "منقضی‌شده" };
  return map[status] ?? status;
}

const STATE_FA: Record<string, string> = {
  STRONG_BUY_SETUP: "فرصت خرید قوی",
  POTENTIAL_BUY: "خرید احتمالی",
  HOLD_WAIT: "صبر",
  POTENTIAL_SELL: "در حال ضعیف شدن",
  EXIT_SETUP: "سیگنال فروش",
  NO_CLEAR_OPPORTUNITY: "کاری لازم نیست",
  NO_SIGNAL: "بدون داده",
};
const stateFa = (s: string) => `«${STATE_FA[s] ?? s}»`;

/** Reason recorded with a signal status change. */
export function statusReasonText(reason: string, locale: Locale): string {
  if (locale !== "fa") return reason;
  let m: RegExpMatchArray | null;
  if (reason === "First evaluation") return "اولین بررسی";
  if (reason === "Not re-confirmed within the expiry window") return "در مدت اعتبار دوباره تأیید نشد";
  if ((m = reason.match(/^Replaced previous (\S+) signal$/))) return `جایگزین سیگنال قبلی ${stateFa(m[1])}`;
  if ((m = reason.match(/^Re-evaluated with changed strategy version or parameters \(state unchanged: (\S+)\)$/))) return `با نسخه یا تنظیمات جدید روش دوباره بررسی شد (وضعیت تغییر نکرد: ${stateFa(m[1])})`;
  if ((m = reason.match(/^State changed from (\S+) to (\S+)$/))) return `وضعیت از ${stateFa(m[1])} به ${stateFa(m[2])} تغییر کرد`;
  if ((m = reason.match(/^Price traded at (\S+) \(≤ invalidation (\S+)\)$/))) return `قیمت به ${m[1]} رسید (برابر یا پایین‌تر از حد ضرر ${m[2]})`;
  return reason;
}

/** Friendly name for an indicator key stored with a signal (e.g. "ema20", "rsi"). English keeps the raw key. */
export function indicatorLabel(key: string, locale: Locale): string {
  if (locale !== "fa") return key;
  const ma = key.match(/^(ema|sma)(\d+)$/);
  if (ma) return `${ma[1].toUpperCase()} ${ma[2]} (میانگین متحرک ${ma[1] === "ema" ? "نمایی" : "ساده"})`;
  const map: Record<string, string> = {
    close: "قیمت بسته شدن",
    emaSlopePct: "شیب EMA (%)",
    adx: "ADX (قدرت روند)",
    macd: "MACD (سرعت حرکت)",
    macdSignal: "خط سیگنال MACD",
    macdHist: "هیستوگرام MACD",
    rsi: "RSI (قدرت خرید و فروش)",
    atr: "ATR (نوسان متوسط هر کندل)",
    atrPct: "ATR به درصد قیمت",
    volumeRatio: "نسبت حجم به میانگین",
    maxVolumeRatio: "بیشترین نسبت حجم در بازه",
    roc: "ROC (نرخ تغییر قیمت، %)",
    minRsiWindow: "کمترین RSI در بازه",
    rangeHigh: "سقف محدوده",
    rangeLow: "کف محدوده",
    rangeHeight: "ارتفاع محدوده",
    nearestResistance: "نزدیک‌ترین مقاومت",
    nearestSupport: "نزدیک‌ترین حمایت",
    rewardRisk: "نسبت سود به ضرر",
  };
  return map[key] ?? key;
}

/** Translate parameter-validation errors (`"Fast EMA" must be smaller than "Slow EMA".`) using the given specs. */
export function paramErrorText(msg: string, def: Pick<StrategyLike, "id" | "params">, locale: Locale): string {
  if (locale !== "fa") return msg;
  const label = (en: string) => {
    const p = def.params.find((x) => x.label === en);
    return p ? paramText(def.id, p, "fa").label : en;
  };
  return msg
    .replace(/"([^"]+)" must be smaller than "([^"]+)"\./g, (_, a: string, b: string) => `«${label(a)}» باید کوچک‌تر از «${label(b)}» باشد.`)
    .replace(/Target 2 must be at or above Target 1\./g, "هدف سود ۲ باید برابر یا بالاتر از هدف سود ۱ باشد.");
}
