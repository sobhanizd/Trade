import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, PageHeader } from "@/components/ui";
import type { Dict } from "@/lib/i18n";
import { getL } from "@/lib/i18n/server";

const a = "text-accent underline";

const L = {
  en: {
    metaTitle: "Beginner guide",
    title: "Beginner guide",
    description: "A short path from zero to using the app responsibly.",
    importantTitle: "Important",
    important: "Crypto prices are highly volatile. Only use money you can afford to lose. This app provides analysis, not financial advice.",
    steps: [
      { title: "1. What this app is (and is not)", body: <>CryptoPilot AI watches the market, applies fixed, transparent rules, and tells you <i>why</i> a setup appears. It never trades for you, cannot see your funds, and never needs a wallet or exchange key. Every decision is yours.</> },
      { title: "2. Investing vs. trading", body: <>Investing means holding an asset for years because you believe in its long-term value. Trading means entering and exiting over hours to weeks based on price behaviour. Trading involves more decisions, more costs and more ways to lose money. Many people combine a small trading budget with long-term investing.</> },
      { title: "3. Read a signal", body: <>Open <Link className={a} href="/signals">Signals</Link>. A label like “Potential buy” means the strategy&apos;s rules are partly met — not that price will rise. Each signal lists the rules met/not met, the <b>invalidation level</b> (where the idea is proven wrong), targets, reward-to-risk after fees, and conflicting evidence.</> },
      { title: "4. Size positions with the risk calculator", body: <>Decide first how much you could lose on one idea (many people use 0.5–2% of their trading money). The <Link className={a} href="/risk">risk calculator</Link> turns that into a position size based on the distance to the invalidation level. Never use leverage or borrowed money.</> },
      { title: "5. Check the evidence", body: <>Run a <Link className={a} href="/backtest">backtest</Link> for the strategy, asset and timeframe. Look at the number of trades, maximum drawdown, and the out-of-sample section. Compare with simply buying and holding. Few trades or great in-sample but poor out-of-sample results are warning signs.</> },
      { title: "6. Practise with paper trading", body: <>Use <Link className={a} href="/paper">paper trading</Link> for several weeks before risking real money. The app also records every qualifying buy signal automatically so you can see how they actually turned out — including the losers.</> },
      { title: "7. Set up alerts", body: <>In <Link className={a} href="/settings">Settings</Link>, connect Telegram, email or browser push and choose which setups should alert you. Quiet hours and a per-hour cap keep it calm.</> },
      { title: "8. Respect the limits", body: <>Indicators describe the past. News, hacks, regulation and liquidity can move prices suddenly; stop orders can fill at worse prices than planned. A system that wins half the time still has long losing streaks.</> },
    ] as { title: string; body: React.ReactNode }[],
  },
  fa: {
    metaTitle: "راهنمای شروع",
    title: "راهنمای شروع برای تازه‌کارها",
    description: "یک مسیر کوتاه و ساده، از صفر تا استفادهٔ درست و بااحتیاط از برنامه.",
    importantTitle: "مهم",
    important: "قیمت ارزهای دیجیتال خیلی تند بالا و پایین می‌رود. فقط با پولی کار کنید که اگر از دستش بدهید، زندگی‌تان به هم نمی‌ریزد. این برنامه تحلیل می‌دهد — این توصیهٔ مالی نیست.",
    steps: [
      {
        title: "۱. این برنامه چیست (و چه نیست)",
        body: <>CryptoPilot AI بازار را زیر نظر دارد، چند قانون ثابت و شفاف را روی آن اجرا می‌کند و به شما می‌گوید <i>چرا</i> یک فرصت پیدا شده است. هیچ‌وقت به‌جای شما خرید و فروش نمی‌کند، به پول شما دسترسی ندارد و هیچ‌وقت کلید کیف پول یا حساب صرافی‌تان را لازم ندارد. همهٔ تصمیم‌ها با خودتان است.</>,
      },
      {
        title: "۲. سرمایه‌گذاری یا معامله‌گری؟",
        body: <>سرمایه‌گذاری یعنی چیزی را چند سال نگه دارید، چون به ارزش بلندمدتش باور دارید. معامله‌گری یعنی در فاصلهٔ چند ساعت تا چند هفته، با نگاه به رفتار قیمت، بخرید و بفروشید. معامله‌گری تصمیم‌های بیشتر، هزینهٔ بیشتر و راه‌های بیشتری برای ضرر دارد. خیلی‌ها بیشترِ پولشان را بلندمدت نگه می‌دارند و فقط مقدار کمی را برای معامله کنار می‌گذارند.</>,
      },
      {
        title: "۳. یک سیگنال را بخوانید",
        body: <>صفحهٔ <Link className={a} href="/signals">سیگنال‌ها</Link> را باز کنید. برچسبی مثل «خرید احتمالی» یعنی بخشی از شرط‌های آن روش برقرار است — نه این‌که قیمت حتماً بالا می‌رود. هر سیگنال نشان می‌دهد کدام شرط‌ها برقرار است و کدام نه، <b>حد ضرر</b> کجاست (قیمتی که اگر برسد، یعنی ایده اشتباه بوده)، هدف‌های سود، نسبت سود به ضرر بعد از کارمزد، و نشانه‌هایی که خلاف این ایده‌اند.</>,
      },
      {
        title: "۴. مقدار خرید را با ماشین‌حساب ریسک تعیین کنید",
        body: <>اول تصمیم بگیرید حاضرید در یک ایده حداکثر چقدر ضرر کنید (خیلی‌ها بین نیم تا ۲ درصدِ پولی را که برای معامله کنار گذاشته‌اند انتخاب می‌کنند). <Link className={a} href="/risk">ماشین‌حساب ریسک</Link> این عدد را، با توجه به فاصلهٔ قیمت تا حد ضرر، به مقدار خرید تبدیل می‌کند. هیچ‌وقت از اهرم (معامله با پول قرضی صرافی) یا پول قرض‌گرفته استفاده نکنید.</>,
      },
      {
        title: "۵. شواهد را بررسی کنید",
        body: <>برای همان روش، ارز و نمودار، یک <Link className={a} href="/backtest">آزمایش روی گذشته (بک‌تست)</Link> اجرا کنید. به تعداد معامله‌ها، بیشترین افت (بزرگ‌ترین ریزش از اوج) و بخش «داده‌های آزمایش‌نشده» نگاه کنید. نتیجه را با «خریدن و نگه داشتن ساده» مقایسه کنید. اگر تعداد معامله‌ها کم باشد، یا نتیجه روی داده‌هایی که روش با آن‌ها ساخته شده عالی ولی روی داده‌های تازه ضعیف باشد، این‌ها علامت هشدارند.</>,
      },
      {
        title: "۶. با معاملهٔ تمرینی تمرین کنید",
        body: <>پیش از این‌که پول واقعی را به خطر بیندازید، چند هفته با <Link className={a} href="/paper">معاملهٔ تمرینی</Link> و پول مجازی تمرین کنید. برنامه هم هر سیگنال خریدی را که شرایط لازم را دارد خودکار ثبت می‌کند تا ببینید در عمل چه شد — حتی آن‌هایی که ضرر دادند.</>,
      },
      {
        title: "۷. هشدارها را تنظیم کنید",
        body: <>در <Link className={a} href="/settings">تنظیمات</Link>، تلگرام، ایمیل یا اعلان مرورگر را وصل کنید و انتخاب کنید برای کدام فرصت‌ها پیام بگیرید. «ساعت‌های سکوت» و سقف تعداد پیام در هر ساعت نمی‌گذارند پیام‌ها مزاحمتان شوند.</>,
      },
      {
        title: "۸. محدودیت‌ها را جدی بگیرید",
        body: <>شاخص‌ها فقط گذشته را توصیف می‌کنند. خبرها، هک‌ها، قانون‌های جدید و کم شدن خریدار و فروشنده می‌توانند قیمت را ناگهان جابه‌جا کنند؛ سفارش حد ضرر هم ممکن است با قیمتی بدتر از آنچه برنامه‌ریزی کرده بودید اجرا شود. حتی روشی که نیمی از وقت‌ها درست می‌گوید، باز هم دوره‌های طولانیِ ضررهای پشت سر هم دارد.</>,
      },
    ] as { title: string; body: React.ReactNode }[],
  },
} satisfies Dict<unknown>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getL(L);
  return { title: t.metaTitle };
}

export default async function GuidePage() {
  const t = await getL(L);
  return (
    <>
      <PageHeader title={t.title} description={t.description} />
      <Alert tone="warn" className="mb-4" title={t.importantTitle}>{t.important}</Alert>
      <div className="grid gap-4 md:grid-cols-2">
        {t.steps.map((s) => (
          <Card key={s.title}>
            <h2 className="mb-2 font-semibold">{s.title}</h2>
            <p className="text-sm leading-relaxed text-ink-2">{s.body}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
