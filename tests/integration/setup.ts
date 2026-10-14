import { execSync } from "node:child_process";
import { afterAll, beforeAll } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://cryptopilot:cryptopilot_local_dev@localhost:5432/cryptopilot_test";
if (!/_test\b|test/.test(TEST_DB)) throw new Error("Refusing to run integration tests against a non-test database");
Object.assign(process.env, {
  DATABASE_URL: TEST_DB,
  NODE_ENV: "test",
  SESSION_SECRET: "test-secret-test-secret-test-secret-0123456789",
  APP_URL: "http://localhost:3000",
  CANDLE_PROVIDERS: "binance,kraken",
  TELEGRAM_BOT_TOKEN: "",
  SMTP_HOST: "",
  ANTHROPIC_API_KEY: "",
});

let migrated = false;
beforeAll(async () => {
  if (!migrated) {
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: TEST_DB }, stdio: "pipe" });
    migrated = true;
  }
});

afterAll(async () => {
  const { disconnectDb } = await import("@/lib/db");
  await disconnectDb();
});
