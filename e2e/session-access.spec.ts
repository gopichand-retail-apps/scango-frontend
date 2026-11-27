import { expect, test, type Page } from "@playwright/test";

const backendPort = Number(process.env.SCANGO_E2E_BACKEND_PORT ?? 5112);
const apiBaseUrl = `http://127.0.0.1:${backendPort}/api/v1`;
const welcomeHeading = "A better kind of checkout.";
const viewports = [
  { width: 320, height: 640 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
];

async function startCheckoutCapturingSession(page: Page) {
  const started = page.waitForResponse(
    (response) => response.url().endsWith("/api/v1/sessions") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Start checkout" }).click();
  const body = (await (await started).json()) as { data: { id: string; accessToken: string } };
  await expect(page.getByRole("heading", { name: "Market favorites", level: 2 })).toBeVisible();
  return body.data;
}

async function scanBread(page: Page) {
  await page.getByRole("textbox", { name: "Barcode or item code" }).fill("QS-BRD-031");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.locator(".basket-line").filter({ hasText: "Country sourdough" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: welcomeHeading, level: 1 })).toBeVisible();
});

test("a second kiosk cannot read the first kiosk's basket", async ({ page }) => {
  const first = await startCheckoutCapturingSession(page);
  await scanBread(page);
  const other = await page.request.post(`${apiBaseUrl}/sessions`, {
    headers: { "Idempotency-Key": `other-kiosk-${Date.now()}`, "X-Kiosk-Id": "kiosk-02" },
    data: {},
  });
  const otherToken = ((await other.json()) as { data: { accessToken: string } }).data.accessToken;

  const attempts = [
    { "X-Kiosk-Id": "kiosk-02", Authorization: `Bearer ${otherToken}` },
    { "X-Kiosk-Id": "kiosk-02", Authorization: `Bearer ${first.accessToken}` },
    { "X-Kiosk-Id": "kiosk-02" },
  ];
  for (const headers of attempts) {
    const response = await page.request.get(`${apiBaseUrl}/sessions/${first.id}`, { headers });
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain("Country sourdough");
  }
});

test("the session token never reaches browser storage, the URL or the page", async ({ page, context }) => {
  const { accessToken } = await startCheckoutCapturingSession(page);
  await scanBread(page);

  const stored = await page.evaluate(() => JSON.stringify({ ...window.localStorage, ...window.sessionStorage }));
  expect(stored).not.toContain(accessToken);
  expect(page.url()).not.toContain(accessToken);
  expect(await page.content()).not.toContain(accessToken);
  expect(await context.cookies()).toEqual([]);
});

test("the idle warning offers more time by keyboard, fits every width, then expiry clears the screen", async ({
  page,
}) => {
  await page.clock.install();
  await page.reload();
  await startCheckoutCapturingSession(page);
  await scanBread(page);

  await page.clock.fastForward("02:31");
  const dialog = page.getByRole("alertdialog", { name: "Still checking out?" });
  await expect(dialog).toBeVisible();
  const extend = dialog.getByRole("button", { name: "Keep my checkout" });
  await expect(extend).toBeFocused();

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const box = await dialog.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= viewport.width).toBe(true);
    expect((await extend.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  const extended = page.waitForResponse((response) => response.url().endsWith("/extend"));
  await page.keyboard.press("Enter");
  expect((await extended).status()).toBe(200);
  await expect(dialog).toBeHidden();
  await expect(page.locator(".basket-line")).toHaveCount(1);

  await page.clock.fastForward("03:01");
  await expect(page.getByRole("heading", { name: welcomeHeading, level: 1 })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Your checkout timed out and was cleared for privacy.");
  await expect(page.locator(".basket-line")).toHaveCount(0);
});
