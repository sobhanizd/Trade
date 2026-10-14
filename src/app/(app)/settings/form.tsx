"use client";
import { TomanRateBox } from "@/components/toman/rate-box";
import { fmtMoney } from "@/lib/format";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Alert, Badge, Button, Card, CardHeader, Field, Input, Select, Toggle } from "@/components/ui";
import { api } from "@/lib/client-api";
import type { Dict, Locale } from "@/lib/i18n";
import { switchLocale, useL, useLocale } from "@/lib/i18n/client";
import { errorText } from "@/lib/i18n/texts";
import { timeframeWord } from "@/lib/plain";
import type { UserSettingsData } from "@/lib/settings/schema";

type Integrations = { telegram: boolean; email: boolean; webpush: boolean; ai: boolean; coingeckoKey: boolean; news: boolean; sentiment: boolean };
const TFS = ["1h", "4h", "1d", "1w"] as const;

const FA_CHANNEL: Record<string, string> = { TELEGRAM: "تلگرام", EMAIL: "ایمیل", WEBPUSH: "اعلان مرورگر" };
const FA_STATUS: Record<string, string> = { SENT: "ارسال شد", FAILED: "ناموفق", DEFERRED: "به تعویق افتاد", SKIPPED: "رد شد", PENDING: "در انتظار" };

const L = {
  en: {
    saved: "Settings saved.",
    noChannel: "No channel is enabled and configured. Save settings first; the server must also have the channel's credentials.",
    delivery: (channel: string, status: string) => `${channel}: ${status}`,
    noVapid: "Server has no VAPID keys configured.",
    noPushSupport: "This browser does not support push notifications. On iPhone, install the app to the Home Screen first (iOS 16.4+).",
    permDenied: "Notification permission was not granted.",
    subscribed: "This browser is subscribed. Remember to save settings, then send a test.",
    display: "Display",
    language: "Language / زبان",
    languageHint: "Changes the language of the app, alerts and AI explanations.",
    displayCurrency: "Display currency",
    displayCurrencyHint: "Market data is fetched in this currency. Signals stay in the analysis pair's quote (USDT/USD) with an EUR conversion.",
    simpleView: "Simple view",
    simpleViewDesc: "Shows only the essentials: your coins, BUY / WAIT / SELL, practice trades and the risk calculator. Turn off to see every tool and detail.",
    theme: "Theme",
    themeSystem: "System",
    themeLight: "Light",
    themeDark: "Dark",
    risk: "Risk preferences",
    riskDesc: "Conservative defaults. Used by the risk calculator, paper trading and R/R estimates. No leverage.",
    balance: "Hypothetical balance",
    riskPerTrade: "Risk per trade (%)",
    riskPerTradeHint: "0.1–5%. 1% or less is common.",
    maxPosition: "Max position (% of balance)",
    fee: "Fee per side (%)",
    costsTitle: "My trading costs",
    costsDesc: "What your exchange really takes (fee + spread). Used everywhere: your plan, practice trades, BUY/WAIT checks and chart examples.",
    buyCost: "Cost when buying (%)",
    buyCostHint: "Example: you pay €1,000 and receive €970 of ETH → 3.",
    sellCost: "Cost when selling (%)",
    sellCostHint: "Example: you sell €1,000 of ETH and receive €995 → 0.5. Leave empty to use fee + slippage below.",
    costsExample: (buy: string, sell: string, rt: string) => `So: €1,000 in → ${buy} of coins. Selling €1,000 of coins → ${sell}. A coin must rise more than ${rt}% after you buy before you make any profit.`,
    slippage: "Slippage per side (%)",
    channels: "Notification channels",
    channelsDesc: "Credentials are configured on the server; here you choose where alerts go.",
    sendExternal: "Send external alerts",
    sendExternalDesc: "In-app notifications are always recorded.",
    telegram: "Telegram",
    serverConfigured: "server configured",
    tgMissing: "TELEGRAM_BOT_TOKEN missing",
    enabled: "Enabled",
    chatId: "Chat ID",
    chatIdHint: "Message your bot first, then use “Find my chat ID”.",
    findChat: "Find my chat ID",
    sendTest: "Send test",
    noChats: "No chats found — send any message to your bot, then try again.",
    email: "Email",
    smtpMissing: "SMTP not configured",
    recipient: "Recipient",
    push: "Browser push",
    vapidMissing: "VAPID keys missing",
    pushInfo: (n: number) => `${n} subscribed browser(s). On iPhone: Share → Add to Home Screen, open the app from there, then enable.`,
    enablePush: "Enable on this device",
    scanning: "Scanning",
    scanningDesc: "Which timeframes the scheduler analyses. More timeframes = more API calls.",
    tf: (t: string) => t,
    providerOrder: "Candle provider order",
    providerOrderHint: "First healthy provider wins; the other is the fallback.",
    binanceFirst: "Binance → Kraken",
    krakenFirst: "Kraken → Binance",
    minMcap: "Min market cap (USD) for new assets",
    minVol: "Min 24h volume (USD)",
    minHist: "Min daily history (days)",
    alertRules: "Alert rules",
    minStrength: "Minimum signal strength",
    strongOnly: "Strong buy setups only",
    potentialOrStronger: "Potential buy or stronger",
    minRR: "Minimum reward/risk (after costs)",
    maxPerHour: "Max alerts per hour",
    cooldown: "Re-alert cooldown (minutes)",
    cooldownHint: "Same asset/strategy/timeframe/state.",
    assetsLegend: "Assets (none = all watched)",
    strategiesLegend: "Strategies (none = all enabled)",
    timeframesLegend: "Timeframes (none = all scanned)",
    exitAlerts: "Exit-setup alerts",
    exitAlertsDesc: "Only for setups you were alerted to, or assets with a manual paper position.",
    cancelAlerts: "Signal cancellation / material change alerts",
    invalidationAlerts: "Invalidation alerts",
    invalidationAlertsDesc: "When price trades through an alerted setup's invalidation level.",
    systemAlerts: "System failure & stale-data alerts",
    volAlerts: "Volatility alerts",
    volMove: "Volatility alert: 1h move ≥ (%)",
    staleAfter: "Stale data after (minutes beyond candle)",
    quietHours: "Quiet hours",
    quietHoursDesc: "External alerts are held and delivered afterwards (dropped if older than 12h).",
    start: "Start",
    end: "End",
    timezone: "Time zone",
    paperAi: "Paper trading & AI",
    autoTrack: "Automatically paper-track buy signals",
    autoTrackDesc: "Records every qualifying signal's hypothetical outcome — winners and losers.",
    trackFrom: "Track from",
    strongSetups: "Strong buy setups",
    useAi: "Use the AI explainer",
    aiOn: "Anthropic API key configured on the server.",
    aiOff: "No ANTHROPIC_API_KEY on the server — rule-based explanations are used.",
    sources: (cgKey: boolean, sentiment: boolean, news: boolean) =>
      `Data sources: CoinGecko ${cgKey ? "(API key)" : "(keyless public tier)"}, Binance/Kraken public market data, alternative.me sentiment ${sentiment ? "on" : "off"}, RSS news ${news ? "on" : "off"}.`,
    advanced: "Advanced settings — scanning, alert rules, practice trades & AI ▾",
    saving: "Saving…",
    save: "Save settings",
    testAll: "Test enabled channels",
  },
  fa: {
    saved: "تنظیمات ذخیره شد.",
    noChannel: "هیچ راه ارسالی روشن و آماده نیست. اول تنظیمات را ذخیره کنید. اطلاعات ورود آن راه (مثل توکن یا رمز) هم باید روی سرور تنظیم شده باشد.",
    delivery: (channel: string, status: string) => `${FA_CHANNEL[channel] ?? channel}: ${FA_STATUS[status] ?? status}`,
    noVapid: "کلیدهای VAPID (کلیدهای مخصوص اعلان مرورگر) روی سرور تنظیم نشده‌اند.",
    noPushSupport: "این مرورگر اعلان مرورگر را پشتیبانی نمی‌کند. در آیفون، اول برنامه را به صفحهٔ اصلی گوشی (Home Screen) اضافه کنید (iOS 16.4 به بالا).",
    permDenied: "اجازهٔ نمایش اعلان داده نشد.",
    subscribed: "این مرورگر ثبت شد. یادتان نرود تنظیمات را ذخیره کنید و بعد یک پیام آزمایشی بفرستید.",
    display: "نمایش",
    language: "زبان / Language",
    languageHint: "زبان برنامه، هشدارها و توضیحات هوش مصنوعی را عوض می‌کند.",
    displayCurrency: "ارز نمایش",
    displayCurrencyHint: "قیمت‌های بازار با این ارز نشان داده می‌شوند. سیگنال‌ها به ارزِ جفت تحلیل (USDT/USD) می‌مانند و معادل یورویی هم کنارشان می‌آید.",
    simpleView: "نمای ساده",
    simpleViewDesc: "فقط چیزهای اصلی را نشان می‌دهد: ارزهای من، خرید / صبر / فروش، معاملهٔ تمرینی و ماشین‌حساب ریسک. خاموشش کنید تا همهٔ ابزارها و جزئیات را ببینید.",
    theme: "پوسته (رنگ صفحه)",
    themeSystem: "مثل دستگاه",
    themeLight: "روشن",
    themeDark: "تیره",
    risk: "تنظیمات ریسک",
    riskDesc: "مقدارهای پیش‌فرض محتاطانه‌اند. در ماشین‌حساب ریسک، معاملهٔ تمرینی و برآورد نسبت سود به ضرر استفاده می‌شوند. بدون اهرم (قرض گرفتن برای معامله).",
    balance: "موجودی فرضی",
    riskPerTrade: "ریسک هر معامله (%)",
    riskPerTradeHint: "بین 0.1 تا 5 درصد. معمولاً 1 درصد یا کمتر.",
    maxPosition: "حداکثر اندازهٔ هر خرید (% از موجودی)",
    fee: "کارمزد هر طرف معامله (%)",
    costsTitle: "هزینه‌های معاملهٔ من",
    costsDesc: "آنچه صرافی شما واقعاً برمی‌دارد (کارمزد + اختلاف قیمت خرید و فروش). همه‌جا استفاده می‌شود: برنامه، معامله‌های تمرینی، بررسی خرید/صبر و مثال‌های نمودار.",
    buyCost: "هزینه هنگام خرید (%)",
    buyCostHint: "مثال: 1,000 یورو می‌پردازید و 970 یورو اتریوم دریافت می‌کنید ← 3.",
    sellCost: "هزینه هنگام فروش (%)",
    sellCostHint: "مثال: 1,000 یورو اتریوم می‌فروشید و 995 یورو دریافت می‌کنید ← 0.5. خالی بگذارید تا کارمزد + لغزش پایین استفاده شود.",
    costsExample: (buy: string, sell: string, rt: string) => `یعنی: 1,000 یورو پول ← \u2066${buy}\u2069 ارز. فروش 1,000 یورو ارز ← \u2066${sell}\u2069. قیمت باید بعد از خرید بیش از ${rt}٪ بالا برود تا سودی کنید.`,
    slippage: "لغزش قیمت (اختلاف قیمت اجرا) در هر طرف (%)",
    channels: "راه‌های دریافت هشدار",
    channelsDesc: "اطلاعات ورود روی سرور تنظیم می‌شود؛ این‌جا انتخاب می‌کنید هشدارها کجا فرستاده شوند.",
    sendExternal: "فرستادن هشدار به بیرون از برنامه",
    sendExternalDesc: "اعلان‌های داخل برنامه همیشه ثبت می‌شوند.",
    telegram: "تلگرام",
    serverConfigured: "روی سرور تنظیم شده",
    tgMissing: "TELEGRAM_BOT_TOKEN تنظیم نشده",
    enabled: "روشن",
    chatId: "شناسهٔ گفتگو (Chat ID)",
    chatIdHint: "اول یک پیام به ربات خودتان بدهید، بعد «پیدا کردن شناسهٔ گفتگو» را بزنید.",
    findChat: "پیدا کردن شناسهٔ گفتگو",
    sendTest: "ارسال آزمایشی",
    noChats: "گفتگویی پیدا نشد — یک پیام به ربات بدهید و دوباره امتحان کنید.",
    email: "ایمیل",
    smtpMissing: "SMTP (سرور ایمیل) تنظیم نشده",
    recipient: "گیرنده",
    push: "اعلان مرورگر",
    vapidMissing: "کلیدهای VAPID تنظیم نشده",
    pushInfo: (n: number) => `${n} مرورگر ثبت شده است. در آیفون: دکمهٔ Share را بزنید و «Add to Home Screen» را انتخاب کنید، بعد برنامه را از همان‌جا باز کنید و این گزینه را روشن کنید.`,
    enablePush: "روشن کردن روی این دستگاه",
    scanning: "بررسی بازار",
    scanningDesc: "برنامه کدام نمودارها را به‌طور خودکار بررسی کند. نمودارهای بیشتر = درخواست‌های بیشتر به منبع داده.",
    tf: (t: string) => timeframeWord(t, "fa"),
    providerOrder: "ترتیب منبع دادهٔ قیمت‌ها",
    providerOrderHint: "اولین منبعی که سالم باشد استفاده می‌شود؛ دیگری پشتیبان است.",
    binanceFirst: "اول Binance، بعد Kraken",
    krakenFirst: "اول Kraken، بعد Binance",
    minMcap: "حداقل ارزش بازار (دلار) برای ارزهای جدید",
    minVol: "حداقل حجم معاملات ۲۴ ساعته (دلار)",
    minHist: "حداقل سابقهٔ قیمت (روز)",
    alertRules: "قانون‌های هشدار",
    minStrength: "حداقل قدرت سیگنال",
    strongOnly: "فقط فرصت‌های خرید قوی",
    potentialOrStronger: "فرصت خرید احتمالی یا قوی‌تر",
    minRR: "حداقل نسبت سود به ضرر (بعد از کارمزد)",
    maxPerHour: "حداکثر هشدار در ساعت",
    cooldown: "فاصلهٔ تکرار هشدار (دقیقه)",
    cooldownHint: "برای همان ارز، روش، نمودار و وضعیت.",
    assetsLegend: "ارزها (هیچ‌کدام = همهٔ ارزهای من)",
    strategiesLegend: "روش‌ها (هیچ‌کدام = همهٔ روش‌های فعال)",
    timeframesLegend: "نمودارها (هیچ‌کدام = همهٔ نمودارهای بررسی‌شده)",
    exitAlerts: "هشدار وقت خروج",
    exitAlertsDesc: "فقط برای فرصت‌هایی که برایشان هشدار گرفته‌اید، یا ارزهایی که معاملهٔ تمرینی دستی دارید.",
    cancelAlerts: "هشدار لغو سیگنال یا تغییر مهم",
    invalidationAlerts: "هشدار رسیدن به حد ضرر",
    invalidationAlertsDesc: "وقتی قیمت از حد ضررِ یک فرصتِ هشداردار عبور می‌کند.",
    systemAlerts: "هشدار خرابی سیستم و دادهٔ قدیمی",
    volAlerts: "هشدار نوسان",
    volMove: "هشدار نوسان: تغییر قیمت در ۱ ساعت ≥ (%)",
    staleAfter: "داده قدیمی حساب شود بعد از (دقیقه پس از پایان کندل)",
    quietHours: "ساعت‌های سکوت",
    quietHoursDesc: "هشدارهای بیرونی نگه داشته می‌شوند و بعداً فرستاده می‌شوند (اگر بیشتر از ۱۲ ساعت بگذرد، حذف می‌شوند).",
    start: "شروع",
    end: "پایان",
    timezone: "منطقهٔ زمانی",
    paperAi: "معاملهٔ تمرینی و هوش مصنوعی",
    autoTrack: "ثبت خودکار سیگنال‌های خرید به‌صورت معاملهٔ تمرینی",
    autoTrackDesc: "نتیجهٔ فرضی هر سیگنال واجد شرایط را ثبت می‌کند — چه سود، چه ضرر.",
    trackFrom: "ثبت از",
    strongSetups: "فرصت‌های خرید قوی",
    useAi: "استفاده از توضیح‌دهندهٔ هوش مصنوعی",
    aiOn: "کلید Anthropic روی سرور تنظیم شده است.",
    aiOff: "کلید ANTHROPIC_API_KEY روی سرور نیست — توضیحات ساده و قانون‌محور نشان داده می‌شود.",
    sources: (cgKey: boolean, sentiment: boolean, news: boolean) =>
      `منبع داده‌ها: CoinGecko ${cgKey ? "(با کلید)" : "(نسخهٔ رایگان عمومی)"}، داده‌های عمومی بازار Binance/Kraken، حال‌وهوای بازار از alternative.me ${sentiment ? "روشن" : "خاموش"}، اخبار RSS ${news ? "روشن" : "خاموش"}.`,
    advanced: "تنظیمات پیشرفته — بررسی بازار، قانون‌های هشدار، معاملهٔ تمرینی و هوش مصنوعی ▾",
    saving: "در حال ذخیره…",
    save: "ذخیرهٔ تنظیمات",
    testAll: "آزمایش راه‌های روشن",
  },
} satisfies Dict<unknown>;

function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function SettingsForm(props: { initial: UserSettingsData; integrations: Integrations; symbols: string[]; strategies: { id: string; name: string }[]; vapidKey: string | null; pushSubscriptions: number }) {
  const t = useL(L);
  const locale = useLocale();
  const [s, setS] = useState<UserSettingsData>(props.initial);
  const [msg, setMsg] = useState<{ tone: "success" | "error" | "warn"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [langBusy, setLangBusy] = useState(false);
  const [pushCount, setPushCount] = useState(props.pushSubscriptions);
  const [chats, setChats] = useState<{ id: string; title: string }[] | null>(null);
  const { setTheme } = useTheme();
  const it = props.integrations;
  const up = <K extends keyof UserSettingsData>(k: K, v: Partial<UserSettingsData[K]> | UserSettingsData[K]) =>
    setS((cur) => ({ ...cur, [k]: typeof v === "object" && !Array.isArray(v) ? { ...(cur[k] as object), ...v } : v }));
  const alerts = s.alerts;
  const upAlerts = (v: Partial<UserSettingsData["alerts"]>) => up("alerts", v);
  const errMsg = (e: unknown) => errorText((e as Error).message, locale);

  async function changeLanguage(next: Locale) {
    if (next === locale) return;
    setLangBusy(true);
    // Keep the form state in sync so a later save never writes the old language back.
    up("language", next);
    await switchLocale(next);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      // The Toman rate has its own box (saved on its own), so the form never writes an old rate back.
      const body: Partial<UserSettingsData> = { ...s };
      delete body.toman;
      // Rates are edited in the currency menu; never write back a stale copy.
      delete body.fxManual;
      const r = await api<{ settings: UserSettingsData }>("/api/settings", { method: "PUT", body });
      setS(r.settings);
      setTheme(r.settings.theme);
      setMsg({ tone: "success", text: t.saved });
    } catch (e) {
      const d = (e as { data?: { details?: { fieldErrors?: Record<string, string[]> } } }).data?.details;
      setMsg({ tone: "error", text: `${errMsg(e)}${d?.fieldErrors ? ` ${JSON.stringify(d.fieldErrors)}` : ""}` });
    } finally {
      setBusy(false);
    }
  }
  async function test(channel?: string) {
    setMsg(null);
    try {
      const r = await api<{ deliveries: { channel: string; status: string; error: string | null }[] }>("/api/notifications/test", { body: channel ? { channel } : {} });
      if (!r.deliveries.length) setMsg({ tone: "warn", text: t.noChannel });
      else setMsg({ tone: r.deliveries.every((d) => d.status === "SENT") ? "success" : "error", text: r.deliveries.map((d) => `${t.delivery(d.channel, d.status)}${d.error ? ` — ${d.error}` : ""}`).join(" · ") });
    } catch (e) {
      setMsg({ tone: "error", text: errMsg(e) });
    }
  }
  async function enablePush() {
    setMsg(null);
    try {
      if (!props.vapidKey) throw new Error(t.noVapid);
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error(t.noPushSupport);
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error(t.permDenied);
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(props.vapidKey) }));
      await api("/api/push", { body: sub.toJSON() });
      setPushCount((c) => c + 1);
      upAlerts({ channels: { ...alerts.channels, webpush: true } });
      setMsg({ tone: "success", text: t.subscribed });
    } catch (e) {
      setMsg({ tone: "error", text: errMsg(e) });
    }
  }
  async function findChats() {
    try {
      setChats((await api<{ chats: { id: string; title: string }[] }>("/api/telegram/chats")).chats);
    } catch (e) {
      setMsg({ tone: "error", text: errMsg(e) });
    }
  }
  const multi = (list: string[], v: string, on: boolean) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t.display} />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <span id="s-lang" className="block text-sm font-medium text-ink">{t.language}</span>
            <div role="group" aria-labelledby="s-lang" className="flex gap-2">
              {([["en", "English"], ["fa", "فارسی"]] as const).map(([code, name]) => (
                <Button
                  key={code}
                  type="button"
                  lang={code}
                  variant={locale === code ? "primary" : "secondary"}
                  aria-pressed={locale === code}
                  disabled={langBusy}
                  onClick={() => changeLanguage(code)}
                  className="flex-1"
                >
                  {name}
                </Button>
              ))}
            </div>
            <p className="text-xs text-ink-2">{t.languageHint}</p>
          </div>
          <Field label={t.displayCurrency} htmlFor="s-cur" hint={t.displayCurrencyHint}>
            <Select id="s-cur" value={s.displayCurrency} onChange={(e) => up("displayCurrency", e.target.value as "USD" | "EUR" | "IRT")}><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="IRT">{locale === "fa" ? "تومان" : "Toman"}</option></Select>
          </Field>
          <Field label={t.theme} htmlFor="s-theme"><Select id="s-theme" value={s.theme} onChange={(e) => up("theme", e.target.value as UserSettingsData["theme"])}><option value="system">{t.themeSystem}</option><option value="light">{t.themeLight}</option><option value="dark">{t.themeDark}</option></Select></Field>
          <div className="sm:col-span-3"><TomanRateBox /></div>
          <div className="sm:col-span-3"><Toggle checked={s.ui.simple} onChange={(v) => up("ui", { simple: v })} label={t.simpleView} description={t.simpleViewDesc} /></div>
        </div>
      </Card>

      <Card id="costs">
        <CardHeader title={t.costsTitle} description={t.costsDesc} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.buyCost} htmlFor="s-buyc" hint={t.buyCostHint}>
            <Input id="s-buyc" type="number" min="0" max="20" step="0.1" placeholder={String(s.risk.feeRatePct + s.risk.slippagePct)} value={s.risk.buyCostPct ?? ""} onChange={(e) => up("risk", { buyCostPct: e.target.value === "" ? null : Math.min(20, Math.max(0, Number(e.target.value))) })} />
          </Field>
          <Field label={t.sellCost} htmlFor="s-sellc" hint={t.sellCostHint}>
            <Input id="s-sellc" type="number" min="0" max="20" step="0.1" placeholder={String(s.risk.feeRatePct + s.risk.slippagePct)} value={s.risk.sellCostPct ?? ""} onChange={(e) => up("risk", { sellCostPct: e.target.value === "" ? null : Math.min(20, Math.max(0, Number(e.target.value))) })} />
          </Field>
        </div>
        {(() => {
          const b = s.risk.buyCostPct ?? s.risk.feeRatePct + s.risk.slippagePct;
          const sl = s.risk.sellCostPct ?? s.risk.feeRatePct + s.risk.slippagePct;
          // Rise needed to break even: (1 / ((1 − buy)(1 − sell)) − 1).
          const rt = (1 / ((1 - b / 100) * (1 - sl / 100)) - 1) * 100;
          return <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">{t.costsExample(fmtMoney(1000 * (1 - b / 100), "EUR"), fmtMoney(1000 * (1 - sl / 100), "EUR"), rt.toFixed(1))}</p>;
        })()}
      </Card>

      <Card>
        <CardHeader title={t.risk} description={t.riskDesc} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label={t.balance} htmlFor="s-bal"><Input id="s-bal" type="number" min="1" step="any" value={s.risk.accountBalance} onChange={(e) => up("risk", { accountBalance: Number(e.target.value) })} /></Field>
          <Field label={t.riskPerTrade} htmlFor="s-rpt" hint={t.riskPerTradeHint}><Input id="s-rpt" type="number" min="0.1" max="5" step="0.1" value={s.risk.riskPerTradePct} onChange={(e) => up("risk", { riskPerTradePct: Number(e.target.value) })} /></Field>
          <Field label={t.maxPosition} htmlFor="s-mp"><Input id="s-mp" type="number" min="1" max="100" step="1" value={s.risk.maxPositionPct} onChange={(e) => up("risk", { maxPositionPct: Number(e.target.value) })} /></Field>
          <Field label={t.fee} htmlFor="s-fee"><Input id="s-fee" type="number" min="0" max="2" step="0.01" value={s.risk.feeRatePct} onChange={(e) => up("risk", { feeRatePct: Number(e.target.value) })} /></Field>
          <Field label={t.slippage} htmlFor="s-slip"><Input id="s-slip" type="number" min="0" max="5" step="0.01" value={s.risk.slippagePct} onChange={(e) => up("risk", { slippagePct: Number(e.target.value) })} /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title={t.channels} description={t.channelsDesc} />
        <div className="space-y-4">
          <Toggle checked={alerts.enabled} onChange={(v) => upAlerts({ enabled: v })} label={t.sendExternal} description={t.sendExternalDesc} />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between"><b className="text-sm">{t.telegram}</b>{it.telegram ? <Badge tone="good">{t.serverConfigured}</Badge> : <Badge tone="warn">{t.tgMissing}</Badge>}</div>
              <Toggle checked={alerts.channels.telegram} onChange={(v) => upAlerts({ channels: { ...alerts.channels, telegram: v } })} label={t.enabled} />
              <Field label={t.chatId} htmlFor="s-tg" hint={t.chatIdHint}><Input id="s-tg" dir="ltr" value={alerts.telegramChatId} onChange={(e) => upAlerts({ telegramChatId: e.target.value.trim() })} placeholder="123456789" /></Field>
              <div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={!it.telegram} onClick={findChats}>{t.findChat}</Button><Button type="button" variant="ghost" onClick={() => test("TELEGRAM")}>{t.sendTest}</Button></div>
              {chats && (chats.length ? <ul className="mt-2 text-sm">{chats.map((c) => <li key={c.id}><button type="button" className="text-accent underline" onClick={() => upAlerts({ telegramChatId: c.id })}>{c.title} (<span className="ltr">{c.id}</span>)</button></li>)}</ul> : <p className="mt-2 text-sm text-ink-2">{t.noChats}</p>)}
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between"><b className="text-sm">{t.email}</b>{it.email ? <Badge tone="good">{t.serverConfigured}</Badge> : <Badge tone="warn">{t.smtpMissing}</Badge>}</div>
              <Toggle checked={alerts.channels.email} onChange={(v) => upAlerts({ channels: { ...alerts.channels, email: v } })} label={t.enabled} />
              <Field label={t.recipient} htmlFor="s-email"><Input id="s-email" type="email" dir="ltr" value={alerts.email} onChange={(e) => upAlerts({ email: e.target.value.trim() })} placeholder="you@example.com" /></Field>
              <Button type="button" variant="ghost" className="mt-2" onClick={() => test("EMAIL")}>{t.sendTest}</Button>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between"><b className="text-sm">{t.push}</b>{it.webpush ? <Badge tone="good">{t.serverConfigured}</Badge> : <Badge tone="warn">{t.vapidMissing}</Badge>}</div>
              <Toggle checked={alerts.channels.webpush} onChange={(v) => upAlerts({ channels: { ...alerts.channels, webpush: v } })} label={t.enabled} />
              <p className="text-xs text-ink-2">{t.pushInfo(pushCount)}</p>
              <div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={!it.webpush} onClick={enablePush}>{t.enablePush}</Button><Button type="button" variant="ghost" onClick={() => test("WEBPUSH")}>{t.sendTest}</Button></div>
            </div>
          </div>
        </div>
      </Card>

      {(() => {
        const advanced = (
        <>
        <Card>
          <CardHeader title={t.scanning} description={t.scanningDesc} />
          <div className="flex flex-wrap gap-4">
            {TFS.map((tf) => (
              <label key={tf} className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={s.timeframes.includes(tf)} onChange={(e) => up("timeframes", multi(s.timeframes, tf, e.target.checked) as UserSettingsData["timeframes"])} /> {t.tf(tf)}</label>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label={t.providerOrder} htmlFor="s-prov" hint={t.providerOrderHint}>
              <Select id="s-prov" value={s.dataProviders.candleOrder.join(",")} onChange={(e) => up("dataProviders", { candleOrder: e.target.value.split(",") as ("binance" | "kraken")[] })}>
                <option value="binance,kraken">{t.binanceFirst}</option><option value="kraken,binance">{t.krakenFirst}</option>
              </Select>
            </Field>
            <Field label={t.minMcap} htmlFor="s-mc"><Input id="s-mc" type="number" min="0" step="1000000" value={s.liquidity.minMarketCapUsd} onChange={(e) => up("liquidity", { minMarketCapUsd: Number(e.target.value) })} /></Field>
            <Field label={t.minVol} htmlFor="s-vol"><Input id="s-vol" type="number" min="0" step="1000000" value={s.liquidity.minVolume24hUsd} onChange={(e) => up("liquidity", { minVolume24hUsd: Number(e.target.value) })} /></Field>
            <Field label={t.minHist} htmlFor="s-hist"><Input id="s-hist" type="number" min="30" max="2000" value={s.liquidity.minHistoryDays} onChange={(e) => up("liquidity", { minHistoryDays: Number(e.target.value) })} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title={t.alertRules} />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t.minStrength} htmlFor="s-min"><Select id="s-min" value={alerts.minState} onChange={(e) => upAlerts({ minState: e.target.value as UserSettingsData["alerts"]["minState"] })}><option value="STRONG_BUY_SETUP">{t.strongOnly}</option><option value="POTENTIAL_BUY">{t.potentialOrStronger}</option></Select></Field>
            <Field label={t.minRR} htmlFor="s-rr"><Input id="s-rr" type="number" min="0" max="10" step="0.1" value={alerts.minRiskReward} onChange={(e) => upAlerts({ minRiskReward: Number(e.target.value) })} /></Field>
            <Field label={t.maxPerHour} htmlFor="s-mph"><Input id="s-mph" type="number" min="1" max="60" value={alerts.maxPerHour} onChange={(e) => upAlerts({ maxPerHour: Number(e.target.value) })} /></Field>
            <Field label={t.cooldown} htmlFor="s-cd" hint={t.cooldownHint}><Input id="s-cd" type="number" min="5" max="10080" value={alerts.cooldownMinutes} onChange={(e) => upAlerts({ cooldownMinutes: Number(e.target.value) })} /></Field>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <fieldset><legend className="mb-1 text-sm font-medium">{t.assetsLegend}</legend>{props.symbols.map((sym) => <label key={sym} className="me-3 inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={alerts.assets.includes(sym)} onChange={(e) => upAlerts({ assets: multi(alerts.assets, sym, e.target.checked) })} />{sym}</label>)}</fieldset>
            <fieldset><legend className="mb-1 text-sm font-medium">{t.strategiesLegend}</legend>{props.strategies.map((st) => <label key={st.id} className="me-3 inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={alerts.strategies.includes(st.id)} onChange={(e) => upAlerts({ strategies: multi(alerts.strategies, st.id, e.target.checked) })} />{st.name}</label>)}</fieldset>
            <fieldset><legend className="mb-1 text-sm font-medium">{t.timeframesLegend}</legend>{TFS.map((tf) => <label key={tf} className="me-3 inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={alerts.timeframes.includes(tf)} onChange={(e) => upAlerts({ timeframes: multi(alerts.timeframes, tf, e.target.checked) as UserSettingsData["alerts"]["timeframes"] })} />{t.tf(tf)}</label>)}</fieldset>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <Toggle checked={alerts.notifyExits} onChange={(v) => upAlerts({ notifyExits: v })} label={t.exitAlerts} description={t.exitAlertsDesc} />
            <Toggle checked={alerts.notifyCancellations} onChange={(v) => upAlerts({ notifyCancellations: v })} label={t.cancelAlerts} />
            <Toggle checked={alerts.notifyInvalidations} onChange={(v) => upAlerts({ notifyInvalidations: v })} label={t.invalidationAlerts} description={t.invalidationAlertsDesc} />
            <Toggle checked={alerts.system.enabled} onChange={(v) => upAlerts({ system: { ...alerts.system, enabled: v } })} label={t.systemAlerts} />
            <Toggle checked={alerts.volatility.enabled} onChange={(v) => upAlerts({ volatility: { ...alerts.volatility, enabled: v } })} label={t.volAlerts} />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t.volMove} htmlFor="s-vm"><Input id="s-vm" type="number" min="1" max="50" step="0.5" value={alerts.volatility.movePct} onChange={(e) => upAlerts({ volatility: { ...alerts.volatility, movePct: Number(e.target.value) } })} /></Field>
            <Field label={t.staleAfter} htmlFor="s-stale"><Input id="s-stale" type="number" min="10" max="1440" value={alerts.system.staleMinutes} onChange={(e) => upAlerts({ system: { ...alerts.system, staleMinutes: Number(e.target.value) } })} /></Field>
          </div>
          <div className="mt-4 rounded-lg border border-line p-3">
            <Toggle checked={alerts.quietHours.enabled} onChange={(v) => upAlerts({ quietHours: { ...alerts.quietHours, enabled: v } })} label={t.quietHours} description={t.quietHoursDesc} />
            <div className="mt-2 grid gap-4 sm:grid-cols-3">
              <Field label={t.start} htmlFor="s-qs"><Input id="s-qs" type="time" value={alerts.quietHours.start} onChange={(e) => upAlerts({ quietHours: { ...alerts.quietHours, start: e.target.value } })} /></Field>
              <Field label={t.end} htmlFor="s-qe"><Input id="s-qe" type="time" value={alerts.quietHours.end} onChange={(e) => upAlerts({ quietHours: { ...alerts.quietHours, end: e.target.value } })} /></Field>
              <Field label={t.timezone} htmlFor="s-tz"><Input id="s-tz" dir="ltr" value={alerts.quietHours.timezone} onChange={(e) => upAlerts({ quietHours: { ...alerts.quietHours, timezone: e.target.value } })} /></Field>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title={t.paperAi} />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Toggle checked={s.paper.autoTrackSignals} onChange={(v) => up("paper", { autoTrackSignals: v })} label={t.autoTrack} description={t.autoTrackDesc} />
              <Field label={t.trackFrom} htmlFor="s-pt"><Select id="s-pt" value={s.paper.autoTrackMinState} onChange={(e) => up("paper", { autoTrackMinState: e.target.value as UserSettingsData["paper"]["autoTrackMinState"] })}><option value="STRONG_BUY_SETUP">{t.strongSetups}</option><option value="POTENTIAL_BUY">{t.potentialOrStronger}</option></Select></Field>
            </div>
            <div>
              <Toggle checked={s.ai.enabled} onChange={(v) => up("ai", { enabled: v })} label={t.useAi} description={it.ai ? t.aiOn : t.aiOff} />
              <p className="mt-2 text-xs text-ink-2">{t.sources(it.coingeckoKey, it.sentiment, it.news)}</p>
            </div>
          </div>
        </Card>
        </>
        );
        return s.ui.simple ? (
          <details className="rounded-xl border border-line bg-surface p-4">
            <summary className="cursor-pointer text-sm font-medium">{t.advanced}</summary>
            <div className="mt-4 space-y-4">{advanced}</div>
          </details>
        ) : advanced;
      })()}

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="sticky bottom-20 flex gap-2 lg:bottom-4">
        <Button onClick={save} disabled={busy} className="shadow-lg">{busy ? t.saving : t.save}</Button>
        <Button variant="secondary" onClick={() => test()} className="shadow-lg">{t.testAll}</Button>
      </div>
    </div>
  );
}
