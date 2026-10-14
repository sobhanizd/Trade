/**
 * Persian versions of the English sentences produced by the backtest engine and
 * service (warnings, benchmark name, errors) plus short exit-reason labels.
 * Pure strings only — safe in client and server code.
 */
import type { Locale } from "@/lib/i18n";
import { errorText } from "@/lib/i18n/texts";

type Rule = [RegExp, (m: RegExpMatchArray) => string];

const WARNINGS_FA: Rule[] = [
  [/^No trades were triggered in this period/, () => "در این دوره هیچ معامله‌ای انجام نشد. دورهٔ طولانی‌تر یا بازهٔ زمانی دیگری را امتحان کنید — فقط برای این‌که معامله‌ای پیدا شود، قوانین را شل نکنید."],
  [/^Only (\d+) trades: too few/, (m) => `فقط ${m[1]} معامله: برای نتیجه‌گیریِ قابل‌اعتماد خیلی کم است.`],
  [/^Out-of-sample performance is much weaker than in-sample/, () => "نتیجه در بخش آخر (خارج از نمونه) خیلی ضعیف‌تر از بخش اول است — نشانهٔ رایجِ تنظیم بیش از حد روی گذشته (بیش‌برازش) یا تغییر حال‌وهوای بازار."],
  [/^No trades occurred in the out-of-sample period/, () => "در بخش آخر (خارج از نمونه) هیچ معامله‌ای انجام نشد، پس نتیجه روی داده‌های دیده‌نشده سنجیده نشده است."],
  [/^(\d+) entr(?:y was|ies were) skipped because price gapped below the invalidation level/, (m) => `${m[1]} ورود انجام نشد چون قیمت قبل از خرید، با یک جهش به زیر حد ضرر رفته بود.`],
  [/^The test period is shorter than 6 months/, () => "دورهٔ آزمایش کوتاه‌تر از ۶ ماه است و شاید فقط یک حال‌وهوای بازار را پوشش دهد."],
  [/^Results are hypothetical/, () => "نتیجه‌ها فرضی‌اند، خرید و فروش را با قیمت باز شدنِ کندل بعدی و لغزش قیمت ثابت فرض می‌کنند و سود آینده را تضمین نمی‌کنند."],
  [/^Survivorship bias/, () => "سوگیری بازماندگی: فقط ارزهایی را می‌شود آزمایش کرد که هنوز وجود دارند و معامله می‌شوند؛ ارزهایی که از بازار حذف شده‌اند در نمونه نیستند."],
];

/** Warnings stored with a backtest run. Unknown text passes through. */
export function backtestWarningText(w: string, l: Locale): string {
  if (l !== "fa") return w;
  for (const [re, fn] of WARNINGS_FA) {
    const m = w.match(re);
    if (m) return fn(m);
  }
  return w;
}

/** Benchmark name produced by the engine. */
export function benchmarkName(name: string, l: Locale): string {
  if (l !== "fa") return name;
  if (/^Buy & hold/.test(name)) return "خرید و نگه‌داری (همان دوره، با کارمزد و لغزش قیمت)";
  return name;
}

/** Short exit-reason label for the trades table (English keeps the existing lower-case code). */
export function exitReasonShort(reason: string, l: Locale): string {
  if (l !== "fa") return reason.toLowerCase().replace("_", " ");
  const map: Record<string, string> = {
    TARGET: "هدف سود",
    STOP: "حد ضرر",
    EXIT_SIGNAL: "سیگنال فروش",
    TIME: "پایان زمان مجاز",
    END_OF_DATA: "پایان دوره",
    MANUAL: "دستی",
  };
  return map[reason] ?? reason;
}

/** Errors thrown by the backtest service (shown on the form and on failed runs). */
export function backtestErrorText(msg: string | null | undefined, l: Locale): string {
  const s = msg ?? "";
  if (l !== "fa") return s;
  let m: RegExpMatchArray | null;
  if (/^Unknown strategy/.test(s)) return "روش ناشناخته است.";
  if (/^Unknown asset/.test(s)) return "ارز ناشناخته است. اول آن را به «ارزهای من» اضافه کنید.";
  if (/^The start date must be before the end date/.test(s)) return "تاریخ شروع باید قبل از تاریخ پایان باشد.";
  if ((m = s.match(/^Range too large: (\d+) candles \(max (\d+)\)/))) return `بازه خیلی بزرگ است: ${m[1]} کندل (حداکثر ${m[2]}). بازهٔ کوتاه‌تر یا بازهٔ زمانی بزرگ‌تری انتخاب کنید.`;
  if ((m = s.match(/^Historical data failed quality checks: (.*)$/))) return `داده‌های گذشته از بررسی کیفیت رد نشد: ${m[1]}`;
  return errorText(s, l);
}
