import { z } from "zod";
import { TIMEFRAMES } from "@/lib/market/types";
import type { CostModel } from "@/lib/risk/calculator";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)");

export const settingsSchema = z.object({
  displayCurrency: z.enum(["USD", "EUR", "IRT"]).default("USD"),
  /** Optional euro rate typed in by the user ("1 € = X $"); null = automatic (ECB reference rate). */
  fxManual: z.object({ usdPerEur: z.number().min(0.5).max(2).nullable().default(null), updatedAt: z.string().nullable().default(null) }).prefault({}),
  language: z.enum(["en", "fa"]).default("en"),
  theme: z.enum(["system", "light", "dark"]).default("dark"),
  /** Euro → Toman rate typed in by the user (no reliable free online source for the open-market rate). */
  toman: z
    .object({
      show: z.boolean().default(true),
      perEur: z.number().positive().max(100_000_000).nullable().default(null),
      updatedAt: z.string().nullable().default(null),
    })
    .prefault({}),
  /** Simple view hides advanced tools and dense tables. */
  ui: z.object({ simple: z.boolean().default(true) }).prefault({}),
  /** Monthly investment plan (the user buys on their own exchange). */
  plan: z
    .object({
      monthlyAmount: z.number().min(10).max(1_000_000).default(100),
      /** 1 or 15 = that day of the month; 0 = any day (the app suggests a good day). */
      buyDay: z.union([z.literal(0), z.literal(1), z.literal(15)]).default(1),
      style: z.enum(["careful", "balanced", "bold", "custom"]).default("balanced"),
      /** "My smart mix" (style = custom): BTC/ETH/Gold shares chosen with the history-tested smart pick. */
      custom: z.object({ BTC: z.number().min(0).max(1).default(1), ETH: z.number().min(0).max(1).default(0), PAXG: z.number().min(0).max(1).default(0) }).nullable().default(null),
      /** Extra lump sum to invest, spread over `spreadMonths` months. */
      extraAmount: z.number().min(0).max(100_000_000).default(0),
      spreadMonths: z.number().int().min(1).max(36).default(12),
      goalAmount: z.number().min(0).max(1e9).default(16_000),
      goalYears: z.number().int().min(1).max(30).default(3),
      minOrderEur: z.number().min(1).max(1000).default(10),
    })
    .prefault({}),
  /** Timeframes the scheduled scanner analyses. */
  timeframes: z.array(z.enum(TIMEFRAMES)).min(1).max(4).default(["4h", "1d"]),
  risk: z
    .object({
      accountBalance: z.number().positive().max(1e12).default(1000),
      riskPerTradePct: z.number().min(0.1).max(5).default(1),
      maxPositionPct: z.number().min(1).max(100).default(25),
      feeRatePct: z.number().min(0).max(2).default(0.1),
      slippagePct: z.number().min(0).max(5).default(0.05),
      /** Real all-in cost when buying / selling, in % (e.g. €1,000 → €970 of coin = 3). null = fee + slippage. */
      buyCostPct: z.number().min(0).max(20).nullable().default(null),
      sellCostPct: z.number().min(0).max(20).nullable().default(null),
    })
    .prefault({}),
  liquidity: z
    .object({
      minMarketCapUsd: z.number().min(0).default(500_000_000),
      minVolume24hUsd: z.number().min(0).default(10_000_000),
      minHistoryDays: z.number().int().min(30).max(2000).default(200),
    })
    .prefault({}),
  alerts: z
    .object({
      enabled: z.boolean().default(true),
      channels: z.object({ telegram: z.boolean().default(false), email: z.boolean().default(false), webpush: z.boolean().default(false) }).prefault({}),
      telegramChatId: z.string().trim().max(64).regex(/^-?\d*$|^@[A-Za-z0-9_]{5,}$/, "Numeric chat ID or @channelname").default(""),
      email: z.union([z.literal(""), z.string().trim().email().max(254)]).default(""),
      /** Minimum strength for buy-setup alerts. */
      minState: z.enum(["STRONG_BUY_SETUP", "POTENTIAL_BUY"]).default("STRONG_BUY_SETUP"),
      minRiskReward: z.number().min(0).max(10).default(1.5),
      /** Empty = all enabled strategies / watchlist assets / scanned timeframes. */
      strategies: z.array(z.string()).default([]),
      assets: z.array(z.string()).default([]),
      timeframes: z.array(z.enum(TIMEFRAMES)).default([]),
      notifyExits: z.boolean().default(true),
      notifyCancellations: z.boolean().default(true),
      notifyInvalidations: z.boolean().default(true),
      quietHours: z
        .object({ enabled: z.boolean().default(false), start: time.default("22:00"), end: time.default("07:00"), timezone: z.string().default("Europe/Vienna") })
        .prefault({}),
      maxPerHour: z.number().int().min(1).max(60).default(6),
      /** Cooldown before re-alerting the same asset/strategy/timeframe/state. */
      cooldownMinutes: z.number().int().min(5).max(10_080).default(240),
      volatility: z.object({ enabled: z.boolean().default(true), movePct: z.number().min(1).max(50).default(5) }).prefault({}),
      system: z.object({ enabled: z.boolean().default(true), staleMinutes: z.number().int().min(10).max(1440).default(60) }).prefault({}),
    })
    .prefault({}),
  paper: z
    .object({
      autoTrackSignals: z.boolean().default(true),
      autoTrackMinState: z.enum(["STRONG_BUY_SETUP", "POTENTIAL_BUY"]).default("POTENTIAL_BUY"),
    })
    .prefault({}),
  dataProviders: z.object({ candleOrder: z.array(z.enum(["binance", "kraken"])).min(1).default(["binance", "kraken"]) }).prefault({}),
  ai: z.object({ enabled: z.boolean().default(true) }).prefault({}),
});

export type UserSettingsData = z.infer<typeof settingsSchema>;

/** Parse stored settings, falling back to defaults for anything invalid/missing. */
export function parseSettings(raw: unknown): UserSettingsData {
  const r = settingsSchema.safeParse(raw ?? {});
  if (r.success) return r.data;
  // Keep valid sections; reset invalid ones to defaults.
  const base = settingsSchema.parse({});
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      const merged = settingsSchema.safeParse({ ...base, [k]: v });
      if (merged.success) (base as Record<string, unknown>)[k] = (merged.data as Record<string, unknown>)[k];
    }
  }
  return base;
}

export const defaultSettings = () => settingsSchema.parse({});

/** Cost model in fractions from settings percentages. */
export function costsFromSettings(s: UserSettingsData): CostModel {
  const base = { feeRate: s.risk.feeRatePct / 100, slippageRate: s.risk.slippagePct / 100 };
  if (s.risk.buyCostPct === null && s.risk.sellCostPct === null) return base;
  const side = sideCosts(s);
  return { ...base, buyCost: side.buy, sellCost: side.sell };
}

/** Cost per side as fractions of the money: the user's real costs, else fee + slippage. */
export function sideCosts(s: UserSettingsData) {
  const sym = (s.risk.feeRatePct + s.risk.slippagePct) / 100;
  return { buy: s.risk.buyCostPct !== null ? s.risk.buyCostPct / 100 : sym, sell: s.risk.sellCostPct !== null ? s.risk.sellCostPct / 100 : sym };
}
