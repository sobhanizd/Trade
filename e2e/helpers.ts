import { expect, type Page } from "@playwright/test";
import { E2E_USER } from "./global-setup";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(E2E_USER.email);
  await page.getByLabel("Password").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await settled(page);
}

/**
 * Navigate and wait until React has finished revealing streamed content.
 * While a Suspense boundary streams in, React keeps the content in a hidden
 * `<div hidden id="S:…">` buffer for a moment, so text can match twice.
 */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await settled(page);
}

export async function settled(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'));
}
