import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import type { Dict } from "@/lib/i18n";
import { getL, getLocale } from "@/lib/i18n/server";

const L = {
  en: { title: "Glossary", description: "Plain-language definitions of the terms used in this app." },
  fa: { title: "واژه‌نامه", description: "معنی سادهٔ واژه‌هایی که در این برنامه می‌بینید — بدون اصطلاحات پیچیده." },
} satisfies Dict<unknown>;

/** [English term, English definition, Persian name, Persian definition] */
const TERMS: [string, string, string, string][] = [
  ["ADX (Average Directional Index)", "Measures how strong a trend is (not its direction), 0–100. Below ~20 usually means a weak or sideways market.",
    "قدرت روند", "نشان می‌دهد یک روند چقدر قوی است — نه این‌که رو به بالاست یا رو به پایین. عددی بین ۰ تا ۱۰۰ است؛ زیر حدود ۲۰ یعنی بازار جهت مشخصی ندارد و بیشتر درجا می‌زند."],
  ["ATR (Average True Range)", "Average size of a candle's range including gaps. Used to set invalidation levels that respect normal volatility. ATR% = ATR divided by price.",
    "میانگین دامنهٔ نوسان", "به‌طور میانگین، قیمت در هر کندل چقدر بالا و پایین می‌رود (پرش‌های ناگهانی هم حساب می‌شوند). برنامه از آن استفاده می‌کند تا حد ضرر را آن‌قدر نزدیک نگذارد که با یک نوسان معمولی فعال شود. ATR% یعنی ATR تقسیم بر قیمت."],
  ["Backtest", "Replaying a strategy's rules on historical data to see how they would have behaved. Hypothetical; does not guarantee future results.",
    "آزمایش روی گذشته (بک‌تست)", "قوانین یک روش را روی قیمت‌های گذشته اجرا می‌کنیم تا ببینیم اگر آن موقع از آن استفاده می‌شد، چه نتیجه‌ای می‌داد. نتیجه فرضی است و آینده را تضمین نمی‌کند."],
  ["Bollinger Bands", "A moving average with bands two standard deviations above and below. Narrow bands = calm market; touching a band is not a signal by itself.",
    "باندهای بولینگر", "یک خط میانگین قیمت، با دو باند در بالا و پایینش که فاصله‌شان به اندازهٔ نوسان قیمت است. باندهای باریک یعنی بازار آرام است. این‌که قیمت به یکی از باندها برسد، به‌تنهایی سیگنال خرید یا فروش نیست."],
  ["Breakout", "Price closing beyond a range it was stuck in. Many breakouts fail and fall back into the range.",
    "شکست سقف", "وقتی قیمت بالاتر از محدوده‌ای بسته می‌شود که مدتی در آن گیر کرده بود. خیلی از این شکست‌ها ناموفق‌اند و قیمت دوباره به همان محدوده برمی‌گردد."],
  ["Candle (candlestick)", "Open, high, low and close price for one time period (e.g. 4 hours). Analysis here uses only completed (closed) candles.",
    "کندل (شمع)", "قیمت شروع، بالاترین، پایین‌ترین و قیمت پایانی در یک بازهٔ زمانی (مثلاً ۴ ساعت). تحلیل‌های این برنامه فقط از کندل‌های تمام‌شده (بسته‌شده) استفاده می‌کنند."],
  ["Drawdown", "The fall from a peak in account value to a later low. Maximum drawdown is the worst such fall.",
    "افت از اوج", "مقدار ریزش ارزش حساب، از بالاترین نقطه تا پایین‌ترین نقطهٔ بعد از آن. «بیشترین افت» یعنی بدترین ریزشی که پیش آمده است."],
  ["EMA / SMA", "Exponential / simple moving average — the average price over N candles. EMA reacts faster to recent prices.",
    "میانگین متحرک", "میانگین قیمت در چند کندل آخر. SMA میانگین سادهٔ همه است؛ EMA به قیمت‌های تازه‌تر وزن بیشتری می‌دهد و زودتر به تغییرها واکنش نشان می‌دهد."],
  ["Entry zone", "A price area where a strategy considers the setup's risk acceptable. Not a guarantee of a fill or of profit.",
    "محدودهٔ خرید", "بازهٔ قیمتی که روش، ریسکِ خرید در آن را قابل‌قبول می‌داند. تضمین نمی‌کند خرید شما در همان قیمت انجام شود یا سود بدهد."],
  ["Fees & slippage", "Fees are what the exchange charges; slippage is the difference between the expected and the actual fill price. Both reduce returns.",
    "کارمزد و لغزش قیمت", "کارمزد پولی است که صرافی برای هر خرید و فروش می‌گیرد. لغزش قیمت، اختلاف بین قیمتی است که انتظارش را داشتید و قیمتی که معامله واقعاً با آن انجام شد. هر دو از سود شما کم می‌کنند."],
  ["Invalidation level", "The price at which the reason for a setup no longer holds. Often used to place a stop-loss.",
    "حد ضرر (سطح ابطال)", "قیمتی که اگر به آن برسد، دلیلِ این فرصت خرید دیگر برقرار نیست — یعنی ایده اشتباه از آب درآمده. معمولاً سفارش حد ضرر را همین‌جا می‌گذارند."],
  ["Leverage", "Borrowing to increase position size. Magnifies losses. This app never recommends it.",
    "اهرم", "قرض گرفتن برای این‌که بیشتر از پول خودتان خرید کنید. همان‌طور که سود را بزرگ می‌کند، ضرر را هم چند برابر می‌کند. این برنامه هیچ‌وقت آن را پیشنهاد نمی‌کند."],
  ["Look-ahead bias", "Accidentally using information from the future in a test. This app evaluates each candle using only data available at its close.",
    "خطای نگاه به آینده", "وقتی در یک آزمایش، ناخواسته از اطلاعاتی استفاده شود که آن زمان هنوز وجود نداشت. این برنامه هر کندل را فقط با داده‌هایی می‌سنجد که تا لحظهٔ بسته شدن همان کندل موجود بوده است."],
  ["MACD", "Difference between a 12- and 26-period EMA (the MACD line), with a 9-period signal line. Crossovers indicate momentum shifts; the histogram shows their strength.",
    "شاخص سرعت حرکت قیمت", "اختلاف بین دو میانگین متحرک ۱۲ و ۲۶ کندلی (خط MACD)، همراه با یک خط سیگنال ۹ کندلی. وقتی این دو خط از هم عبور می‌کنند، یعنی سرعت حرکت قیمت دارد عوض می‌شود؛ ستون‌های کوچک زیر نمودار (هیستوگرام) قدرت این تغییر را نشان می‌دهند."],
  ["Momentum", "The speed and persistence of a price move.",
    "شتاب", "سرعت حرکت قیمت و این‌که آن حرکت چقدر ادامه پیدا می‌کند."],
  ["Out-of-sample", "Data not used while designing or tuning a strategy. Results there are a more honest estimate than in-sample results.",
    "داده‌های آزمایش‌نشده", "داده‌هایی که موقع ساختن یا تنظیم یک روش از آن‌ها استفاده نشده است. نتیجه روی این داده‌ها، تصویر صادقانه‌تری می‌دهد تا نتیجه روی داده‌هایی که روش با آن‌ها تنظیم شده."],
  ["Overfitting", "Tuning rules so closely to past data that they fail on new data.",
    "بیش‌برازش", "وقتی قوانین آن‌قدر دقیق روی گذشته تنظیم شوند که روی داده‌های تازه جواب ندهند — مثل این‌که جواب‌های امتحان پارسال را حفظ کنید و فکر کنید درس را یاد گرفته‌اید."],
  ["Paper trading", "Recording hypothetical trades without real money.",
    "معاملهٔ تمرینی", "ثبت خرید و فروش‌های فرضی با پول مجازی، بدون این‌که پول واقعی خرج شود."],
  ["Profit factor", "Gross profits divided by gross losses. Above 1 means winners outweighed losers in the sample.",
    "ضریب سود", "جمع همهٔ سودها تقسیم بر جمع همهٔ ضررها. بیشتر از ۱ یعنی در آن دوره، سودها از ضررها بیشتر بوده‌اند."],
  ["Pullback", "A temporary dip inside a larger trend.",
    "اصلاح قیمت", "یک افت کوچک و موقت در دل یک روند بزرگ‌تر."],
  ["R / R-multiple", "Risk unit: the distance from entry to invalidation. A +2R outcome gained twice what was risked.",
    "واحد ریسک (R)", "یک R یعنی فاصلهٔ قیمت خرید تا حد ضرر؛ یعنی همان مقداری که حاضر شده‌اید از دست بدهید. اگر نتیجهٔ یک معامله «۲R مثبت» باشد، یعنی دو برابرِ مقدار ریسک‌شده سود داده است."],
  ["Reward/risk (R/R)", "Potential gain to the target divided by potential loss to the invalidation level, here after fees and slippage.",
    "نسبت سود به ضرر", "سود احتمالی تا هدف سود، تقسیم بر ضرر احتمالی تا حد ضرر. در این برنامه بعد از کم کردن کارمزد و لغزش قیمت حساب می‌شود. مثلاً ۲ یعنی سود احتمالی دو برابر ضرر احتمالی است."],
  ["Resistance / support", "Price areas where selling (resistance) or buying (support) appeared before. Estimated here from clustered swing highs and lows.",
    "مقاومت / حمایت", "محدوده‌های قیمتی که قبلاً در آن‌ها فروشنده‌ها زیاد شدند (مقاومت، مثل یک سقف) یا خریدارها زیاد شدند (حمایت، مثل یک کف). این برنامه آن‌ها را از سقف‌ها و کف‌های قبلی قیمت تخمین می‌زند."],
  ["RSI (Relative Strength Index)", "0–100 measure of recent gains vs. losses. Above 70 is often called overbought, below 30 oversold — strong trends can stay there a long time.",
    "شاخص قدرت نسبی", "عددی بین ۰ تا ۱۰۰ که بالا رفتن‌های اخیر قیمت را با پایین آمدن‌هایش مقایسه می‌کند. بالای ۷۰ را معمولاً «داغ کرده» (زیادی خریده شده) و زیر ۳۰ را «زیادی فروخته شده» می‌گویند — ولی در روندهای قوی، قیمت می‌تواند مدت زیادی همان‌جا بماند."],
  ["Slippage", "See fees & slippage.",
    "لغزش قیمت", "اختلاف قیمت اجرا؛ توضیح «کارمزد و لغزش قیمت» را ببینید."],
  ["Stop-loss", "An order to sell if price falls to a level. In fast markets it can fill below the level (gap/slippage).",
    "سفارش حد ضرر", "سفارشی که اگر قیمت تا سطح مشخصی پایین بیاید، خودکار می‌فروشد. در بازارهای پرشتاب ممکن است پایین‌تر از آن سطح اجرا شود (به‌خاطر پرش قیمت یا لغزش قیمت)."],
  ["Survivorship bias", "Testing only assets that still exist, which ignores coins that collapsed or were delisted, making results look better.",
    "خطای بازمانده‌ها", "وقتی فقط ارزهایی را آزمایش کنیم که هنوز وجود دارند و ارزهایی را که سقوط کردند یا از صرافی‌ها حذف شدند نادیده بگیریم. این کار نتیجه را بهتر از واقعیت نشان می‌دهد."],
  ["Timeframe", "The candle length used for analysis (1h, 4h, 1d, 1w). Longer timeframes are slower but less noisy.",
    "بازهٔ زمانی نمودار", "طول هر کندل در تحلیل: ۱ ساعته، ۴ ساعته، روزانه یا هفتگی. بازه‌های بلندتر کندتر تغییر می‌کنند، ولی حرکت‌های بی‌معنی و گمراه‌کنندهٔ کمتری دارند."],
  ["Volatility", "How much price moves. Here measured with ATR% and 30-day annualised realised volatility.",
    "نوسان", "این‌که قیمت چقدر بالا و پایین می‌رود. این‌جا با ATR% و نوسان واقعیِ ۳۰ روز گذشته (تبدیل‌شده به مقیاس سالانه) اندازه‌گیری می‌شود."],
  ["Volume", "Amount traded. Moves on higher volume show more participation.",
    "حجم معاملات", "مقدار خرید و فروشی که انجام شده است. حرکتی که با حجم بالا همراه باشد، یعنی آدم‌های بیشتری در آن شرکت کرده‌اند و معمولاً معتبرتر است."],
];

/** "ADX (Average Directional Index)" → "ADX — Average Directional Index" (to show inside parentheses). */
const englishShort = (term: string) => term.replace(/ \((.+)\)$/, " — $1");

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.title };
}

export default async function GlossaryPage() {
  const [t, locale] = await Promise.all([getL(L), getLocale()]);
  const fa = locale === "fa";
  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <Card>
        <dl className="divide-y divide-line">
          {TERMS.map(([term, def, faName, faDef]) => (
            <div key={term} className="grid gap-1 py-3 sm:grid-cols-3">
              <dt className="text-sm font-semibold" id={term.split(" ")[0].toLowerCase()}>
                {fa ? (
                  <>
                    {faName}
                    <span className="block text-xs font-normal text-ink-2">
                      (<span dir="ltr">{englishShort(term)}</span>)
                    </span>
                  </>
                ) : term}
              </dt>
              <dd className="text-sm text-ink-2 sm:col-span-2">{fa ? faDef : def}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
