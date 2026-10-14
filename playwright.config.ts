import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run the PRODUCTION build (`npm run build` first) against an
 * isolated database. Global setup runs the worker once, which fetches REAL
 * public market data — an internet connection is required.
 */
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://cryptopilot:cryptopilot_local_dev@localhost:5432/cryptopilot_e2e";
const PORT = 3100;
export const E2E_ENV = {
  DATABASE_URL: E2E_DB,
  APP_URL: `http://localhost:${PORT}`,
  SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-0123456789abcdef",
  NODE_ENV: "production",
  ANTHROPIC_API_KEY: "",
  TELEGRAM_BOT_TOKEN: "",
  SMTP_HOST: "",
  LOG_LEVEL: "warn",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["iPhone 14"], browserName: "chromium" }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: E2E_ENV,
  },
});
