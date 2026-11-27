import { readFileSync } from "node:fs";
import { expect, type Browser, type Page } from "@playwright/test";

interface SyntheticIdentity {
  staff: { code: string; pin: string }[];
}

// PINs come from the backend's synthetic fixture so the two repositories cannot drift apart.
const identity = JSON.parse(
  readFileSync(new URL("../../scango-backend/fixtures/synthetic-identity.json", import.meta.url), "utf8"),
) as SyntheticIdentity;

export function pinFor(code: string): string {
  const member = identity.staff.find((entry) => entry.code === code);
  if (!member) throw new Error(`Unknown synthetic attendant ${code}.`);
  return member.pin;
}

export async function openStaffConsole(browser: Browser, code: string): Promise<Page> {
  const context = await browser.newContext();
  const staffPage = await context.newPage();
  await staffPage.goto("/staff");
  await staffPage.getByLabel("Staff code").fill(code);
  await staffPage.getByLabel("PIN").fill(pinFor(code));
  await staffPage.getByRole("button", { name: "Sign in" }).click();
  await expect(staffPage.getByRole("heading", { name: "Waiting for an attendant", level: 1 })).toBeVisible();
  return staffPage;
}

export async function triggerWeightMismatch(page: Page, barcode: string, grams: string) {
  await page.getByRole("button", { name: "Start checkout" }).click();
  await expect(page.getByRole("heading", { name: "Market favorites", level: 2 })).toBeVisible();
  await page.getByRole("textbox", { name: "Barcode or item code" }).fill(barcode);
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByRole("spinbutton", { name: "Simulated scale reading (g)" }).fill(grams);
  await page.getByRole("button", { name: "Confirm scale reading" }).click();
  await expect(page.getByRole("heading", { name: "An attendant is on the way" })).toBeVisible();
}
