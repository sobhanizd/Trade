import { expect, test } from "@playwright/test";
import { login, open } from "./helpers";

test("mobile layout: bottom navigation, drawer menu, no horizontal scroll", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("navigation", { name: "Quick" })).toBeVisible();
  for (const path of ["/dashboard", "/signals", "/risk", "/settings"]) {
    await open(page, path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
  await page.getByRole("button", { name: "More" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await menu.getByText(/More tools/).click();
  await menu.getByRole("link", { name: "Backtesting" }).click();
  await expect(page).toHaveURL(/\/backtest/);
});
