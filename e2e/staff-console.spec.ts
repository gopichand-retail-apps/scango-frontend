import { expect, test } from "@playwright/test";
import { openStaffConsole, pinFor, triggerWeightMismatch } from "./staff-helpers";

const viewports = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A better kind of checkout.", level: 1 })).toBeVisible();
});

test("an attendant at another store sees no exceptions from this store", async ({ page, browser }) => {
  await triggerWeightMismatch(page, "QS-APL-014", "1500");
  const elsewhere = await openStaffConsole(browser, "att-03");

  await expect(elsewhere.getByText("No checkouts need help right now.")).toBeVisible();
  await expect(elsewhere.getByRole("listitem")).toHaveCount(0);
  await elsewhere.context().close();

  // Clear this store's exception so later tests start from an empty list on the shared test API.
  const local = await openStaffConsole(browser, "att-01");
  await local.getByLabel("Reason").selectOption("customer_assist");
  await local.getByRole("button", { name: "Remove item" }).click();
  await expect(local.getByRole("status")).toContainText("Exception cleared");
  await local.context().close();
});

test("two attendants deciding at once leave one decision and explain the other", async ({ page, browser }) => {
  await triggerWeightMismatch(page, "QS-APL-014", "1500");
  const first = await openStaffConsole(browser, "att-01");
  const second = await openStaffConsole(browser, "att-02");
  for (const staffPage of [first, second]) {
    await expect(staffPage.getByRole("listitem")).toHaveCount(1);
    await staffPage.getByLabel("Reason").selectOption("weight_verified");
  }

  await Promise.all([
    first.getByRole("button", { name: "Approve weight" }).click(),
    second.getByRole("button", { name: "Approve weight" }).click(),
  ]);
  const messages = await Promise.all(
    [first, second].map(async (staffPage) => {
      const message = staffPage.locator(".staff-message");
      await expect(message).toBeVisible();
      return message.innerText();
    }),
  );

  expect(messages.filter((text) => text.includes("Exception cleared"))).toHaveLength(1);
  expect(messages.filter((text) => text.includes("Another attendant already handled"))).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Review and pay" })).toBeEnabled();
  await first.context().close();
  await second.context().close();
});

test("a wrong PIN is refused with model copy and the PIN field is cleared", async ({ browser }) => {
  const context = await browser.newContext();
  const staffPage = await context.newPage();
  await staffPage.goto("/staff");
  await staffPage.getByLabel("Staff code").fill("att-01");
  await staffPage.getByLabel("PIN").fill("000000");
  await staffPage.getByRole("button", { name: "Sign in" }).click();

  await expect(staffPage.getByRole("alert")).toHaveText("That staff code and PIN did not match. Try again.");
  await expect(staffPage.getByLabel("PIN")).toHaveValue("");
  await context.close();
});

test("the console works by keyboard and fits every width", async ({ page, browser }) => {
  await triggerWeightMismatch(page, "QS-APL-014", "1500");
  const context = await browser.newContext();
  const staffPage = await context.newPage();
  await staffPage.goto("/staff");
  await staffPage.getByLabel("Staff code").focus();
  await staffPage.keyboard.type("att-01");
  await staffPage.keyboard.press("Tab");
  await staffPage.keyboard.type(pinFor("att-01"));
  await staffPage.keyboard.press("Enter");
  await expect(staffPage.getByRole("listitem")).toHaveCount(1);

  for (const viewport of viewports) {
    await staffPage.setViewportSize(viewport);
    expect(await staffPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const approveHeight = (await staffPage.getByRole("button", { name: "Approve weight" }).boundingBox())?.height;
    expect(approveHeight ?? 0).toBeGreaterThanOrEqual(44);
  }

  await staffPage.getByLabel("Reason").focus();
  await staffPage.keyboard.press("ArrowDown");
  await expect(staffPage.getByRole("button", { name: "Approve weight" })).toBeEnabled();
  await staffPage.getByRole("button", { name: "Approve weight" }).focus();
  await staffPage.keyboard.press("Enter");
  await expect(staffPage.getByRole("status")).toContainText("Exception cleared");
  await expect(page.getByRole("button", { name: "Review and pay" })).toBeEnabled();
  await context.close();
});

test("the kiosk never links to the attendant console", async ({ page }) => {
  await expect(page.locator('a[href*="staff"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Start checkout" }).click();
  await expect(page.locator('a[href*="staff"]')).toHaveCount(0);
});
