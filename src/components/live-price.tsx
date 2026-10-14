"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { fmtPct, fmtPrice, TROY_OUNCE_GRAMS, type Currency } from "@/lib/format";
import { Toman } from "@/components/toman/context";
import { liveFeed, type LiveStatus, type Tick } from "@/lib/live/prices";
import { useLocale } from "@/lib/i18n/client";

interface Props {
  /** Binance pair, e.g. BTCUSDT. Without it the static price is shown. */
  pair: string | null;
  /** Fallback price (already in display currency) from the last snapshot. */
  initial: number | null;
  initialChange?: number | null;
  currency: Currency;
  /** USD→EUR rate when currency is EUR. */
  eurRate: number | null;
  /** Show price per gram (gold tokens). */
  perGram?: boolean;
  size?: "md" | "lg";
  showChange?: boolean;
  align?: "left" | "right";
}

/** Price that updates live; flashes green when it rises and red when it falls. */
export function LivePrice({ pair, initial, initialChange = null, currency, eurRate, perGram = false, size = "md", showChange = true, align = "right" }: Props) {
  const fa = useLocale() === "fa";
  const [tick, setTick] = useState<Tick | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pair) return;
    return liveFeed().subscribe(pair, (t) => {
      if (prev.current !== null && t.price !== prev.current) {
        setFlash(t.price > prev.current ? "up" : "down");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setFlash(null), 900);
      }
      prev.current = t.price;
      setTick(t);
    });
  }, [pair]);

  // Binance USDT ≈ USD; convert for EUR display.
  const conv = (usd: number) => (currency !== "USD" && eurRate ? usd * eurRate : usd);
  let price = tick ? conv(tick.price) : initial;
  if (price !== null && perGram) price = price / TROY_OUNCE_GRAMS;
  const change = tick ? tick.change24hPct : initialChange;
  const up = (change ?? 0) > 0;
  const down = (change ?? 0) < 0;

  return (
    <div className={cn("inline-flex flex-col gap-1", align === "right" ? "items-end" : "items-start")}>
      <span
        className={cn(
          "ltr rounded-md px-1.5 font-semibold tabular transition-colors duration-700",
          size === "lg" ? (currency === "IRT" ? "text-2xl tracking-tight" : "text-3xl tracking-tight") : "text-base",
          flash === "up" && "bg-good/30 text-good-ink duration-0",
          flash === "down" && "bg-bad/30 text-bad-ink duration-0",
        )}
        aria-live="off"
      >
        {fmtPrice(price, currency)}
        {perGram && <span className="ms-1 text-xs font-normal text-ink-2">{fa ? "/ هر گرم" : "/ gram"}</span>}
      </span>
      <Toman value={price} currency={currency} className={cn("px-1.5 text-ink-2", size === "lg" ? "text-sm" : "text-[11px]")} />
      {showChange && (
        <span className={cn("ltr rounded-md px-1.5 py-0.5 text-xs font-medium tabular", up ? "bg-good/20 text-good-ink" : down ? "bg-bad/20 text-bad-ink" : "bg-surface-2 text-ink-2")}>
          {up ? "▲ " : down ? "▼ " : ""}
          {fmtPct(change)} {fa ? "24 ساعت" : "24h"}
        </span>
      )}
    </div>
  );
}

/** Small "● Live" indicator reflecting the shared socket status. */
export function LiveBadge() {
  const fa = useLocale() === "fa";
  const [status, setStatus] = useState<LiveStatus>("connecting");
  useEffect(() => liveFeed().onStatus(setStatus), []);
  const label = fa
    ? status === "live" ? "قیمت زنده" : status === "connecting" ? "در حال اتصال…" : "قیمت زنده قطع است — آخرین قیمت ذخیره‌شده نمایش داده می‌شود"
    : status === "live" ? "Live prices" : status === "connecting" ? "Connecting…" : "Live feed offline — showing last saved prices";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2" role="status">
      <span className={cn("h-2 w-2 rounded-full", status === "live" ? "animate-pulse bg-good" : status === "connecting" ? "bg-warn" : "bg-bad")} aria-hidden />
      {label}
    </span>
  );
}
