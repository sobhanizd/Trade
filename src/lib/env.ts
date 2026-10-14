import { z } from "zod";

/**
 * Server-side environment, validated once. Never import this module from a
 * client component: none of these values (except NEXT_PUBLIC_*) may reach the
 * browser bundle.
 */
const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  CANDLE_PROVIDERS: z.string().default("binance,kraken"),
  COINGECKO_API_KEY: optional,
  COINGECKO_API_PLAN: z.enum(["demo", "pro"]).default("demo"),
  SENTIMENT_ENABLED: bool(true),

  SCAN_CRON: z.string().default("*/5 * * * *"),
  SNAPSHOT_CRON: z.string().default("*/10 * * * *"),
  NEWS_CRON: z.string().default("*/30 * * * *"),
  MAINTENANCE_CRON: z.string().default("17 * * * *"),

  TELEGRAM_BOT_TOKEN: optional,
  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  EMAIL_FROM: optional,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optional,
  VAPID_PRIVATE_KEY: optional,
  VAPID_SUBJECT: optional,

  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  ANTHROPIC_EFFORT: z.enum(["low", "medium", "high"]).default("medium"),

  NEWS_RSS_FEEDS: z.string().default(""),
  NEWS_ENABLED: bool(true),

  /** Demo installs only (e.g. GitHub Codespaces): "username:password" shown and prefilled on the login page. */
  DEMO_LOGIN: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable names only — never values.
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests: reset the cached env after mutating process.env. */
export function resetEnvCache() {
  cached = null;
}

export const isProd = () => env().NODE_ENV === "production";

/** Which optional integrations are configured (booleans only — safe to expose). */
export function integrationStatus() {
  const e = env();
  return {
    telegram: Boolean(e.TELEGRAM_BOT_TOKEN),
    email: Boolean(e.SMTP_HOST && e.EMAIL_FROM),
    webpush: Boolean(e.NEXT_PUBLIC_VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY && e.VAPID_SUBJECT),
    ai: Boolean(e.ANTHROPIC_API_KEY),
    coingeckoKey: Boolean(e.COINGECKO_API_KEY),
    news: e.NEWS_ENABLED && e.NEWS_RSS_FEEDS.trim().length > 0,
    sentiment: e.SENTIMENT_ENABLED,
  };
}
