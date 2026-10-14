import { expect, test } from "@playwright/test";
import { login, open, settled } from "./helpers";

test("unauthenticated users are redirected to login", async ({ page }) => {
  await open(page, "/signals");
  await expect(page).toHaveURL(/\/login\?next=%2Fsignals/);
  await page.getByLabel("Username").fill("e2e@cryptopilot.test");
  await page.getByLabel("Password").fill("wrong-password-xyz");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("home shows each coin with BUY/WAIT/SELL and live prices", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "Your coins" })).toBeVisible();
  await expect(page.getByText("Live prices")).toBeVisible({ timeout: 30_000 });
  const btc = page.getByRole("link", { name: /BTC/ }).first();
  await expect(btc.getByText(/^(BUY|WAIT|SELL|NO DATA)$/)).toBeVisible();
  await expect(btc.getByText(/\$\d{1,3}(,\d{3})+/).first()).toBeVisible();
  await btc.click();
  await expect(page.getByRole("region", { name: "What the rules say now" })).toBeVisible();
});

test("advanced view still available", async ({ page }) => {
  await login(page);
  await open(page, "/settings");
  await page.getByRole("switch", { name: /Simple view/ }).uncheck({ force: true });
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await open(page, "/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText(/Provider time .* UTC/).first()).toBeVisible();
  await open(page, "/settings");
  await page.getByRole("switch", { name: /Simple view/ }).check({ force: true });
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
});

test("watchlist: add a liquid coin, reject a stablecoin, remove", async ({ page }) => {
  await login(page);
  await open(page, "/watchlist");
  await page.getByLabel("Coin name or ticker").fill("USDT");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(/did not pass the filters/)).toBeVisible();
  await expect(page.getByRole("alert").getByText(/Stablecoins and wrapped tokens are excluded/)).toBeVisible();
  // Coins can be added by name, not only by ticker.
  await page.getByLabel("Coin name or ticker").fill("Cardano");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(/ADA added/)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("link", { name: "ADA", exact: true })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Remove ADA" }).first().click();
  await expect(page.getByRole("link", { name: "ADA", exact: true })).toHaveCount(0);
});

test("asset page renders the candlestick chart with indicators", async ({ page }) => {
  await login(page);
  await open(page, "/assets/BTC");
  await expect(page.getByRole("img", { name: /BTC 1d candlestick chart with volume$/ })).toBeVisible();
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Show indicators" }).click();
  await expect(page.getByText(/RSI\(14\)/).first()).toBeVisible();
  await page.getByRole("tab", { name: "4h" }).click();
  await expect(page.getByRole("img", { name: /BTC 4h candlestick chart with volume, RSI and MACD/ })).toBeVisible();
  await page.getByText("Show all strategy details").click();
  await expect(page.getByText("Current signals by strategy and timeframe")).toBeVisible();
});

test("signals are explainable: rules, invalidation and risks", async ({ page }) => {
  await login(page);
  await open(page, "/signals?all=1");
  await expect(page.getByRole("heading", { name: "Trading signals" })).toBeVisible();
  await page.locator("tbody tr").first().getByRole("link").first().click();
  await settled(page);
  await expect(page.getByRole("heading", { name: "What could go wrong" })).toBeVisible();
  await page.getByRole("link", { name: "Show technical details" }).click();
  await settled(page);
  await expect(page.getByRole("heading", { name: "Why this signal" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Risks & conflicting evidence" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Status history" })).toBeVisible();
  await expect(page.getByText(/not a probability or confidence score/)).toBeVisible();
});

test("risk calculator sizes a position with costs", async ({ page }) => {
  await login(page);
  await open(page, "/risk?entry=100&stop=95&target=110");
  await expect(page.getByText("Result (illustrative)")).toBeVisible();
  await page.getByLabel("Hypothetical balance").fill("10000");
  await page.getByLabel("Max loss on this trade").fill("100");
  await page.getByLabel("Fee per side (%)").fill("0");
  await page.getByLabel("Slippage per side (%)").fill("0");
  await page.getByLabel("Max position (% of balance)").fill("100");
  await expect(page.getByText("20.000000")).toBeVisible(); // 100 / (100 - 95)
  await page.getByLabel("Invalidation / stop").fill("105");
  await expect(page.getByText(/stop must be below the entry/)).toBeVisible();
});

test("backtest a strategy and inspect simulated trades", async ({ page }) => {
  await login(page);
  await open(page, "/backtest?symbol=BTC&strategy=trend_following&tf=1d");
  await page.getByRole("button", { name: "Run backtest" }).click();
  await expect(page).toHaveURL(/\/backtest\/[a-z0-9]+/, { timeout: 60_000 });
  await expect(page.getByText("Whole period")).toBeVisible();
  await expect(page.getByText(/All simulated trades/)).toBeVisible();
  await expect(page.getByText(/Buy & hold/).first()).toBeVisible();
  await expect(page.getByText(/do not guarantee future performance/)).toBeVisible();
});

test("practice trades: buy with pretend money and see live result", async ({ page }) => {
  await login(page);
  await open(page, "/paper");
  await expect(page.getByText(/pretend money/).first()).toBeVisible();
  await page.getByRole("button", { name: "BTC", exact: true }).click();
  await page.getByRole("button", { name: "$100", exact: true }).click();
  await page.getByRole("button", { name: /Buy BTC with \$100 pretend money/ }).click();
  await expect(page.getByText(/you “bought” BTC/)).toBeVisible({ timeout: 30_000 });
  await open(page, "/paper");
  await expect(page.getByText("If you sold now").first()).toBeVisible();
  await page.getByRole("button", { name: "Sell now (pretend)" }).first().click();
  await expect(page.getByText(/You sold it/).first()).toBeVisible({ timeout: 30_000 });
});

test("signals page explains each coin in plain words", async ({ page }) => {
  await login(page);
  await open(page, "/signals");
  await expect(page.getByText("How to read this:")).toBeVisible();
  await expect(page.getByText(/^(BUY|WAIT|SELL|NO DATA)$/).first()).toBeVisible();
});

test("settings persist across reloads", async ({ page }) => {
  await login(page);
  await open(page, "/settings");
  await page.getByLabel("Display currency").selectOption("EUR");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Display currency")).toHaveValue("EUR");
  await open(page, "/dashboard");
  await expect(page.getByText(/prices in EUR/)).toBeVisible();
  await expect(page.getByText(/€\d/).first()).toBeVisible();
  await open(page, "/settings");
  await page.getByLabel("Display currency").selectOption("USD");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
});

test("system status shows provider health and job runs", async ({ page }) => {
  await login(page);
  await open(page, "/status");
  await expect(page.getByRole("heading", { name: "Background jobs" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "binance", exact: true }).first()).toBeVisible();
  await expect(page.getByText("healthy").first()).toBeVisible();
});

test("AI explainer falls back to rule-based explanations without a key", async ({ page }) => {
  await login(page);
  await open(page, "/explainer?symbol=BTC");
  await expect(page.getByText("AI is not configured")).toBeVisible();
  await page.getByRole("button", { name: "What could invalidate this setup?" }).click();
  await expect(page.getByText(/Rule-based explanation from stored signal data/)).toBeVisible();
});

test("every navigation link works", async ({ page }) => {
  await login(page);
  const links = ["/market", "/watchlist", "/signals", "/strategies", "/backtest", "/paper", "/risk", "/explainer", "/news", "/notifications", "/settings", "/status", "/account", "/guide", "/glossary"];
  for (const href of links) {
    const res = await page.goto(href);
    expect(res?.status(), href).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  }
});

test("credentials are never sent in the URL", async ({ page }) => {
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));
  await open(page, "/login");
  await page.getByLabel("Username").fill("e2e@cryptopilot.test");
  await page.getByLabel("Password").fill("e2e-password-123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await settled(page);
  expect(urls.some((u) => u.includes("password"))).toBe(false);
});

test("my plan updates live when options change", async ({ page }) => {
  await login(page);
  await open(page, "/plan");
  await expect(page.getByRole("heading", { name: "My plan" })).toBeVisible();
  await page.getByRole("button", { name: "€100", exact: true }).click();
  // New users see Toman next to euros, from the 300,000 Toman-per-euro starting rate.
  await expect(page.getByText(/You have €100\.00 \(≈ 30,000,000 Toman\) this month/)).toBeVisible();
  const goal = page.getByLabel("Goal (€)");
  const g100 = Number(await goal.inputValue());
  await page.getByRole("button", { name: "€200", exact: true }).click();
  await expect(page.getByText(/You have €200\.00 \(≈ 60,000,000 Toman\) this month/)).toBeVisible();
  await expect(goal).toHaveValue(String(g100 * 2));
  await page.getByRole("button", { name: /Any day/ }).click();
  await expect(page.getByText("Is today a good day to buy?")).toBeVisible();
  await expect(page.getByText(/day(s)? left\)/).first()).toBeVisible();
  await expect(page.getByText("Saved automatically ✓")).toBeVisible({ timeout: 10_000 });
});

test("currency menu switches between euro, dollar and Toman", async ({ page }) => {
  await login(page);
  await open(page, "/dashboard");
  await page.getByRole("button", { name: /^Currency/ }).click();
  const menu = page.getByRole("dialog", { name: "Currency" });
  // The rate starts at 300,000 Toman per euro and is marked as a starting value until the user saves one.
  await expect(menu.getByText("1 € = 300,000 Toman")).toBeVisible();
  await expect(menu.getByText(/starting value/)).toBeVisible();
  await menu.getByRole("button", { name: "Change" }).click();
  await menu.getByLabel("Price of 1 euro in Toman").fill("292,600");
  await Promise.all([page.waitForEvent("load"), menu.getByRole("button", { name: "Save" }).first().click()]);
  await page.getByRole("button", { name: /^Currency/ }).click();
  await Promise.all([page.waitForEvent("load"), page.getByRole("radio", { name: "Toman" }).click()]);
  await expect(page.getByRole("button", { name: /^Currency: Toman/ })).toBeVisible();
  await expect(page.getByText(/prices in Toman/)).toBeVisible();
  await expect(page.getByText(/تومان/).first()).toBeVisible();
  await page.getByRole("button", { name: /^Currency/ }).click();
  await Promise.all([page.waitForEvent("load"), page.getByRole("radio", { name: "Euro €" }).click()]);
  await expect(page.getByText(/prices in EUR/)).toBeVisible();
});

test("trader's advice: one clear action per coin on home and on the coin page", async ({ page }) => {
  await login(page);
  await open(page, "/dashboard");
  await expect(page.getByRole("heading", { name: /What to do today/ })).toBeVisible();
  await open(page, "/assets/BTC");
  const card = page.getByRole("region", { name: /Trader's advice for/ });
  await expect(card.getByText(/^When:/)).toBeVisible({ timeout: 45_000 });
  await expect(card.getByText(/How sure\?/)).toBeVisible();
  await expect(card.getByText(/Nobody — no trader, bank or app/)).toBeVisible();
});

test("my assets: add a coin with and without a price, see totals, remove it", async ({ page }) => {
  await login(page);
  await open(page, "/holdings");
  await expect(page.getByRole("heading", { name: "My assets" })).toBeVisible();
  // Amount only.
  await page.getByLabel("Coin", { exact: true }).fill("Bitcoin");
  await page.getByLabel("How much do you have?").fill("0.01");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("0.010000 BTC").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Enter a purchase price to see your profit or loss.")).toBeVisible();
  // A second purchase with the total paid.
  await page.getByLabel("Coin", { exact: true }).fill("BTC");
  await page.getByLabel("How much do you have?").fill("0.01");
  await page.getByText("I remember what I paid (optional)").click();
  await page.getByRole("button", { name: "Total I paid" }).click();
  await page.getByLabel("Total I paid").fill("100");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("0.020000 BTC")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/1 without a price are not counted/)).toBeVisible();
  // Remove both (open the purchase list each time).
  for (const left of [1, 0]) {
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Remove", exact: true }).first().click();
    await expect(page.getByRole("button", { name: "Remove", exact: true })).toHaveCount(left, { timeout: 15_000 });
  }
  await expect(page.getByText("You haven't added any coins yet.")).toBeVisible();
});
