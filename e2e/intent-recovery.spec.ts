import { expect, test, type Page, type Route } from "@playwright/test";

const welcomeHeading = "A better kind of checkout.";

// Lets the first request reach the API (which commits it) and then drops the reply, as a flaky network would.
function loseFirstReply(counter: { calls: number }) {
  return async (route: Route) => {
    counter.calls += 1;
    const response = await route.fetch();
    if (counter.calls === 1) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({ response });
  };
}

async function startCheckout(page: Page) {
  await page.getByRole("button", { name: "Start checkout" }).click();
  await expect(page.getByRole("heading", { name: "Market favorites", level: 2 })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: welcomeHeading, level: 1 })).toBeVisible();
});

test("a lost scan reply waits for confirmation and the retry adds exactly one unit", async ({ page }) => {
  await startCheckout(page);
  const scans = { calls: 0 };
  await page.route(/\/api\/v1\/sessions\/[0-9a-f-]+\/scan$/, loseFirstReply(scans));

  await page.getByRole("textbox", { name: "Barcode or item code" }).fill("QS-BRD-031");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByText("Waiting for confirmation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add item" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Check again" })).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByText("Waiting for confirmation")).toBeHidden();
  await expect(page.locator(".basket-line").filter({ hasText: "Country sourdough" })).toBeVisible();
  await expect(page.getByText("$5.94").first()).toBeVisible();
  expect(scans.calls).toBe(2);
});

test("a lost tender reply never shows the receipt until the server confirms payment", async ({ page }) => {
  await startCheckout(page);
  await page.getByRole("textbox", { name: "Barcode or item code" }).fill("QS-MLK-044");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByRole("button", { name: "Review and pay" }).click();
  const tenders = { calls: 0 };
  await page.route(/\/api\/v1\/sessions\/[0-9a-f-]+\/tenders$/, loseFirstReply(tenders));

  await page.getByRole("radio", { name: "Approve this test payment" }).check();
  await page.getByRole("button", { name: "Run payment simulation" }).click();
  await expect(page.getByText("Waiting for confirmation")).toBeVisible();
  await expect(page.getByRole("button", { name: "View receipt" })).toHaveCount(0);
  await expect(page.getByText("Payment approved in simulation")).toHaveCount(0);

  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByText("Payment approved in simulation")).toBeVisible();
  await expect(page.getByRole("button", { name: "View receipt" })).toBeVisible();
  expect(tenders.calls).toBe(2);
});

test("the awaiting panel fits a 320 px kiosk", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await startCheckout(page);
  await page.route(/\/api\/v1\/sessions\/[0-9a-f-]+\/scan$/, loseFirstReply({ calls: 0 }));
  await page.getByRole("textbox", { name: "Barcode or item code" }).fill("QS-BRD-031");
  await page.getByRole("button", { name: "Add item" }).click();

  const panel = page.locator(".awaiting-panel");
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 320).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
