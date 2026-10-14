"use client";
import { useMemo, useState } from "react";
import { Alert, Card, CardHeader, Field, Input, Stat } from "@/components/ui";
import { fmtMoney, fmtNum, fmtPct, fmtPrice } from "@/lib/format";
import type { Dict, Locale } from "@/lib/i18n";
import { useL, useLocale } from "@/lib/i18n/client";
import { calculateRisk } from "@/lib/risk/calculator";

interface Defaults { balance: number; maxLoss: number; feePct: number; slipPct: number; maxPositionPct: number; entry?: number; stop?: number; target?: number }

const L = {
  en: {
    inputs: "Inputs",
    inputsDesc: "Long (buy) positions only. No leverage.",
    balance: "Hypothetical balance",
    maxLoss: "Max loss on this trade",
    ofBalance: (p: string) => `${p} of balance`,
    entry: "Entry price",
    stop: "Invalidation / stop",
    target: "Target (optional)",
    cap: "Max position (% of balance)",
    fee: "Fee per side (%)",
    slip: "Slippage per side (%)",
    enterTitle: "Enter an entry and a stop price",
    enterBody: "The calculator updates as you type. Tip: open a signal and press “Risk calculator” to prefill its levels.",
    fixTitle: "Please fix the inputs",
    result: "Result (illustrative)",
    size: "Position size",
    units: "units of the asset",
    value: "Position value",
    lossIfStopped: "Loss if stopped",
    lossSub: (p: string) => `${p} of balance, incl. costs`,
    gain: "Gain at target",
    afterCosts: "after fees & slippage",
    rr: "Reward / risk",
    beforeCosts: (v: string) => `${v} before costs`,
    costImpact: "Cost impact",
    costSub: (atTarget: string | null) => `at stop · ${atTarget !== null ? `${atTarget} at target` : ""}`,
    fills: (entry: string, stop: string, target: string | null, fees: string) =>
      `Fills assumed: entry ${entry}, stop ${stop}${target !== null ? `, target ${target}` : ""} (after slippage). Fees: ${fees} if stopped.`,
    howTitle: "How this works",
    how: [
      "Loss per unit = (entry − stop) plus fees and slippage on both the buy and the sell.",
      "Position size = your maximum loss ÷ loss per unit, then capped so you never use more money than your balance (no leverage).",
      "Many beginners risk 0.5–2% of their balance per trade so that a losing streak does not wipe out the account.",
      "Never trade with borrowed money or funds you cannot afford to lose. This calculator does not connect to any account.",
    ],
  },
  fa: {
    inputs: "ورودی‌ها",
    inputsDesc: "فقط برای خرید (نه فروش استقراضی). بدون اهرم (بدون پول قرضی).",
    balance: "موجودی فرضی",
    maxLoss: "حداکثر ضرر در این معامله",
    ofBalance: (p: string) => `${p} از موجودی`,
    entry: "قیمت خرید",
    stop: "حد ضرر",
    target: "هدف سود (اختیاری)",
    cap: "حداکثر اندازهٔ معامله (درصد از موجودی)",
    fee: "کارمزد هر خرید یا فروش (%)",
    slip: "لغزش قیمت در هر خرید یا فروش (%)",
    enterTitle: "قیمت خرید و حد ضرر را وارد کنید",
    enterBody: "نتیجه همزمان با تایپ شما به‌روز می‌شود. نکته: یک سیگنال را باز کنید و «ماشین‌حساب ریسک» را بزنید تا عددهایش خودکار پر شوند.",
    fixTitle: "لطفاً ورودی‌ها را درست کنید",
    result: "نتیجه (فقط برای نمونه)",
    size: "اندازهٔ معامله",
    units: "تعداد واحد از این ارز",
    value: "ارزش معامله",
    lossIfStopped: "ضرر اگر به حد ضرر برسد",
    lossSub: (p: string) => `${p} از موجودی، با احتساب هزینه‌ها`,
    gain: "سود در هدف سود",
    afterCosts: "پس از کسر کارمزد و لغزش قیمت",
    rr: "نسبت سود به ضرر",
    beforeCosts: (v: string) => `${v} پیش از هزینه‌ها`,
    costImpact: "اثر هزینه‌ها",
    costSub: (atTarget: string | null) => `در حد ضرر${atTarget !== null ? ` · ${atTarget} در هدف سود` : ""}`,
    fills: (entry: string, stop: string, target: string | null, fees: string) =>
      `قیمت‌های اجرای فرضی (پس از لغزش قیمت): خرید ${entry}، حد ضرر ${stop}${target !== null ? `، هدف سود ${target}` : ""}. کارمزد اگر به حد ضرر برسد: ${fees}.`,
    howTitle: "این ابزار چطور حساب می‌کند",
    how: [
      "ضرر هر واحد = (قیمت خرید − حد ضرر) به‌اضافهٔ کارمزد و لغزش قیمت، هم در خرید و هم در فروش.",
      "اندازهٔ معامله = حداکثر ضرر شما ÷ ضرر هر واحد؛ سپس محدود می‌شود تا هرگز بیشتر از موجودی‌تان پول به کار نرود (بدون اهرم).",
      "خیلی از تازه‌کارها در هر معامله فقط ۰٫۵ تا ۲ درصد موجودی‌شان را به خطر می‌اندازند تا چند ضرر پشت‌سرهم کل حساب را از بین نبرد.",
      "هرگز با پول قرضی یا پولی که توان از دست دادنش را ندارید معامله نکنید. این ماشین‌حساب به هیچ حسابی وصل نمی‌شود.",
    ],
  },
} satisfies Dict<unknown>;

/** Persian wording for the calculator's validation errors and warnings (English passes through). */
function calcText(msg: string, l: Locale) {
  if (l !== "fa") return msg;
  const map: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/^Account balance must be greater than zero/, () => "موجودی باید بیشتر از صفر باشد."],
    [/^Maximum loss must be greater than zero/, () => "حداکثر ضرر باید بیشتر از صفر باشد."],
    [/^Maximum loss cannot exceed the account balance/, () => "حداکثر ضرر نمی‌تواند بیشتر از موجودی باشد."],
    [/^Entry price must be greater than zero/, () => "قیمت خرید باید بیشتر از صفر باشد."],
    [/^Invalidation\/stop price must be greater than zero/, () => "حد ضرر باید بیشتر از صفر باشد."],
    [/^For a long \(buy\) position the stop must be below the entry price/, () => "برای خرید، حد ضرر باید پایین‌تر از قیمت خرید باشد."],
    [/^Target price must be greater than zero/, () => "هدف سود باید بیشتر از صفر باشد."],
    [/^Target must be above the entry price/, () => "هدف سود باید بالاتر از قیمت خرید باشد."],
    [/^Fee rate must be between/, () => "کارمزد باید بین ۰ تا ۵ درصد در هر خرید یا فروش باشد."],
    [/^Slippage must be between/, () => "لغزش قیمت باید بین ۰ تا ۱۰ درصد در هر خرید یا فروش باشد."],
    [/^Maximum position size must be between/, () => "حداکثر اندازهٔ معامله باید بین ۰ تا ۱۰۰ درصد موجودی باشد (بدون اهرم)."],
    [/^Position size was capped at ([\d.]+)%/, (m) => `اندازهٔ معامله به ${m[1]}% موجودی محدود شد (بدون اهرم)، پس ریسک واقعی کمتر از حداکثری است که تعیین کرده‌اید.`],
    [/^This trade risks ([\d.]+)% of your balance/, (m) => `این معامله ${m[1]}% از موجودی شما را به خطر می‌اندازد. بیشتر توصیه‌ها می‌گویند در هر معامله ۱ تا ۲ درصد یا کمتر.`],
    [/^The stop is very close to the entry/, () => "حد ضرر خیلی نزدیک به قیمت خرید است (کمتر از ۰٫۵٪). نوسان‌های عادی قیمت ممکن است آن را فعال کنند."],
    [/^The stop is more than 20% away/, () => "حد ضرر بیش از ۲۰٪ با قیمت خرید فاصله دارد. معامله‌ای که با این حد ضرر تنظیم شود کوچک می‌شود و ضرر هر واحد زیاد است."],
    [/^After costs, the potential gain is smaller than the potential loss/, () => "بعد از کسر هزینه‌ها، سود احتمالی از ضرر احتمالی کمتر است (نسبت سود به ضرر کمتر از ۱)."],
    [/^Reward\/risk after costs is below 1\.5/, () => "نسبت سود به ضرر بعد از هزینه‌ها کمتر از ۱٫۵ است؛ جای کمی برای اشتباه می‌ماند."],
    [/^Costs exceed the distance to the target/, () => "هزینه‌ها از فاصلهٔ تا هدف سود بیشترند: این معامله در هدف سود هم سودی نمی‌دهد."],
    [/^Stop orders can execute at worse prices/, () => "در بازارهای پرشتاب یا کم‌معامله، سفارش حد ضرر ممکن است با قیمتی بدتر از انتظار اجرا شود (پرش قیمت و لغزش قیمت)."],
  ];
  for (const [re, f] of map) {
    const m = msg.match(re);
    if (m) return f(m);
  }
  return msg;
}

export function RiskCalculator({ defaults }: { defaults: Defaults }) {
  const t = useL(L);
  const locale = useLocale();
  const [v, setV] = useState({
    balance: String(defaults.balance),
    maxLoss: defaults.maxLoss.toFixed(2),
    entry: defaults.entry !== undefined ? String(defaults.entry) : "",
    stop: defaults.stop !== undefined ? String(defaults.stop) : "",
    target: defaults.target !== undefined ? String(defaults.target) : "",
    fee: String(defaults.feePct),
    slip: String(defaults.slipPct),
    cap: String(defaults.maxPositionPct),
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const r = useMemo(
    () =>
      calculateRisk({
        accountBalance: Number(v.balance),
        maxLoss: Number(v.maxLoss),
        entryPrice: Number(v.entry),
        stopPrice: Number(v.stop),
        targetPrice: v.target.trim() ? Number(v.target) : null,
        feeRate: Number(v.fee) / 100,
        slippageRate: Number(v.slip) / 100,
        maxPositionPct: Number(v.cap),
      }),
    [v],
  );
  const incomplete = !v.entry || !v.stop;
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <CardHeader title={t.inputs} description={t.inputsDesc} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t.balance} htmlFor="r-bal"><Input id="r-bal" type="number" min="0" step="any" value={v.balance} onChange={set("balance")} /></Field>
          <Field label={t.maxLoss} htmlFor="r-loss" hint={Number(v.balance) > 0 ? t.ofBalance(fmtPct((Number(v.maxLoss) / Number(v.balance)) * 100, 2, false)) : undefined}><Input id="r-loss" type="number" min="0" step="any" value={v.maxLoss} onChange={set("maxLoss")} /></Field>
          <Field label={t.entry} htmlFor="r-entry"><Input id="r-entry" type="number" min="0" step="any" value={v.entry} onChange={set("entry")} /></Field>
          <Field label={t.stop} htmlFor="r-stop"><Input id="r-stop" type="number" min="0" step="any" value={v.stop} onChange={set("stop")} /></Field>
          <Field label={t.target} htmlFor="r-target"><Input id="r-target" type="number" min="0" step="any" value={v.target} onChange={set("target")} /></Field>
          <Field label={t.cap} htmlFor="r-cap"><Input id="r-cap" type="number" min="1" max="100" step="1" value={v.cap} onChange={set("cap")} /></Field>
          <Field label={t.fee} htmlFor="r-fee"><Input id="r-fee" type="number" min="0" step="0.01" value={v.fee} onChange={set("fee")} /></Field>
          <Field label={t.slip} htmlFor="r-slip"><Input id="r-slip" type="number" min="0" step="0.01" value={v.slip} onChange={set("slip")} /></Field>
        </div>
      </Card>
      <div className="space-y-4 lg:col-span-3">
        {incomplete ? (
          <Alert tone="info" title={t.enterTitle}>{t.enterBody}</Alert>
        ) : !r.valid ? (
          <Alert tone="error" title={t.fixTitle}><ul className="list-disc ps-4">{r.errors.map((e) => <li key={e}>{calcText(e, locale)}</li>)}</ul></Alert>
        ) : (
          <>
            <Card>
              <CardHeader title={t.result} />
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <Stat label={t.size} value={fmtNum(r.quantity, 6)} sub={t.units} />
                <Stat label={t.value} value={fmtMoney(r.positionValue, null)} sub={t.ofBalance(fmtPct(r.positionPctOfBalance, 1, false))} />
                <Stat label={t.lossIfStopped} value={<span className="text-bad-ink">{fmtMoney(r.potentialLoss, null)}</span>} sub={t.lossSub(fmtPct(r.potentialLossPctOfBalance, 2, false))} />
                <Stat label={t.gain} value={r.potentialGain !== null ? <span className="text-good-ink">{fmtMoney(r.potentialGain, null)}</span> : "—"} sub={t.afterCosts} />
                <Stat label={t.rr} value={r.riskRewardNet !== null ? fmtNum(r.riskRewardNet) : "—"} sub={r.riskRewardGross !== null ? t.beforeCosts(fmtNum(r.riskRewardGross)) : undefined} />
                <Stat label={t.costImpact} value={fmtMoney(r.costImpactAtStop, null)} sub={t.costSub(r.costImpactAtTarget !== null ? fmtMoney(r.costImpactAtTarget, null) : null)} />
              </div>
              <p className="mt-4 text-xs text-ink-2">{t.fills(fmtPrice(r.entryFill), fmtPrice(r.stopFill), r.targetFill !== null ? fmtPrice(r.targetFill) : null, fmtMoney(r.feesAtStop, null))}</p>
            </Card>
            {r.warnings.map((w) => <Alert key={w} tone="warn">{calcText(w, locale)}</Alert>)}
          </>
        )}
        <Card>
          <CardHeader title={t.howTitle} />
          <ul className="list-disc space-y-1 ps-5 text-sm text-ink-2">
            {t.how.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}
