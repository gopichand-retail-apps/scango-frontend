import { expect, test, type Page } from "@playwright/test";

const backendPort = Number(process.env.SCANGO_E2E_BACKEND_PORT ?? 5112);
const apiBaseUrl = `http://127.0.0.1:${backendPort}/api/v1`;
const welcomeHeading = "A better kind of checkout.";

async function buyMilk(page: Page) {
  const started = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/sessions") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Start checkout" }).click();
  const session = ((await (await started).json()) as { data: { id: string; accessToken: string } }).data;
  await page.getByRole("textbox", { name: "Barcode or item code" }).fill("QS-MLK-044");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByRole("button", { name: "Review and pay" }).click();
  await page.getByRole("button", { name: "Run payment simulation" }).click();
  await page.getByRole("button", { name: "View receipt" }).click();
  await expect(page.getByRole("heading", { name: "All set." })).toBeVisible();
  return session;
}

async function expectReceiptOnlyPrint(page: Page) {
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".kiosk-header")).toBeHidden();
  await expect(page.getByRole("button", { name: "Print receipt" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Start new checkout" })).toBeHidden();
  await expect(page.getByText(/^QS-\d{8}-[A-F0-9]{6}$/)).toBeVisible();
  await expect(page.locator(".receipt-line").first()).toContainText("Cream-top milk");
  await expect(page.locator(".receipt-totals")).toContainText("Total");
  await expect(page.locator(".receipt-tender")).toContainText("Paid in simulation");
  const colours = await page.evaluate(() => {
    const card = document.querySelector(".receipt-card");
    const shell = document.querySelector(".scango-shell");
    if (!card || !shell) throw new Error("Receipt markup is missing.");
    return { text: getComputedStyle(card).color, paper: getComputedStyle(shell).backgroundColor };
  });
  expect(colours).toEqual({ text: "rgb(0, 0, 0)", paper: "rgb(255, 255, 255)" });
  await page.emulateMedia({ media: "screen" });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const record = window as unknown as { printCalls: number };
    record.printCalls = 0;
    window.print = () => {
      record.printCalls += 1;
    };
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: welcomeHeading, level: 1 })).toBeVisible();
});

test("print media shows only the receipt lines, tender status and totals, black on white in both themes", async ({
  page,
}) => {
  await buyMilk(page);
  await expectReceiptOnlyPrint(page);

  await page.getByRole("button", { name: "Toggle light and dark mode" }).click();
  await expect(page.locator(".scango-shell")).toHaveAttribute("data-theme", "dark");
  await expectReceiptOnlyPrint(page);
});

test("a cancelled print leaves the receipt readable, and the page never carries the token or session id", async ({
  page,
}) => {
  const session = await buyMilk(page);
  const print = page.getByRole("button", { name: "Print receipt" });
  await print.click();

  expect(await page.evaluate(() => (window as unknown as { printCalls: number }).printCalls)).toBe(1);
  await expect(print).toBeFocused();
  await expect(page.getByRole("heading", { name: "All set." })).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text).not.toContain(session.accessToken);
  expect(text).not.toContain(session.id);
});

test("a new checkout starts from a clean welcome screen and cannot reopen the last receipt", async ({ page }) => {
  const previous = await buyMilk(page);
  await page.getByRole("button", { name: "Start new checkout" }).click();
  await expect(page.getByRole("heading", { name: welcomeHeading, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start checkout" })).toBeFocused();

  const oldToken = await page.request.get(`${apiBaseUrl}/sessions/${previous.id}/receipt`, {
    headers: { Authorization: `Bearer ${previous.accessToken}`, "X-Kiosk-Id": "kiosk-01" },
  });
  expect(oldToken.status()).toBe(404);

  const next = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/sessions") && response.request().method() === "POST",
  );
  await page.keyboard.press("Enter");
  const fresh = ((await (await next).json()) as { data: { id: string; accessToken: string } }).data;
  expect(fresh.id).not.toBe(previous.id);
  await expect(page.locator(".basket-line")).toHaveCount(0);
  const newToken = await page.request.get(`${apiBaseUrl}/sessions/${previous.id}/receipt`, {
    headers: { Authorization: `Bearer ${fresh.accessToken}`, "X-Kiosk-Id": "kiosk-01" },
  });
  expect(newToken.status()).toBe(404);
});

test("the receipt fits 320, 390, 768 and 1280 px", async ({ page }) => {
  await buyMilk(page);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const printBox = await page.getByRole("button", { name: "Print receipt" }).boundingBox();
    expect(printBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
