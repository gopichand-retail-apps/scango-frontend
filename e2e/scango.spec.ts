import { expect, test, type Page } from "@playwright/test";

const backendPort = Number(process.env.SCANGO_E2E_BACKEND_PORT ?? 5112);
const apiBaseUrl = `http://127.0.0.1:${backendPort}/api/v1`;
const expectedDataMode = process.env.VITE_IS_MOCK === "false" ? "live" : "mock";
const welcomeHeading = "A better kind of checkout.";

async function startCheckout(page: Page) {
  await page.getByRole("button", { name: "Start checkout" }).click();
  await expect(page.getByRole("heading", { name: "Market favorites", level: 2 })).toBeVisible();
}

async function scanBarcode(page: Page, barcode: string) {
  await page.getByRole("textbox", { name: "Barcode or item code" }).fill(barcode);
  await page.getByRole("button", { name: "Add item" }).click();
}

async function addBySearch(page: Page, query: string, productName: string) {
  await page.getByRole("searchbox", { name: "Find an item" }).fill(query);
  const product = page.locator(".product-tile").filter({ hasText: productName });
  await product.getByRole("button", { name: "Add to basket" }).click();
  return product;
}

async function prepareMilkCheckout(page: Page) {
  await startCheckout(page);
  await scanBarcode(page, "QS-MLK-044");
  await page.getByRole("button", { name: "Review and pay" }).click();
  await expect(page.getByRole("heading", { name: "Payment simulator" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: welcomeHeading, level: 1 })).toBeVisible();
  await expect(page.locator(".scango-shell")).toHaveAttribute("data-mode", expectedDataMode);
});

test("Flow 1: opens the self-checkout kiosk with a live catalog", async ({ page }) => {
  await expect(page.getByText("Kiosk service connected")).toBeVisible();
  await expect(page.locator(".welcome-product")).toHaveCount(4);
  await expect
    .poll(() =>
      page
        .locator(".welcome-product img")
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Start checkout" })).toBeVisible();
});

test("Flow 2: scans a synthetic barcode and records the catalog price", async ({ page }) => {
  await startCheckout(page);
  await scanBarcode(page, "QS-BRD-031");
  const line = page.locator(".basket-line").filter({ hasText: "Country sourdough" });
  await expect(line).toBeVisible();
  await expect(line).toContainText("$5.49");
  await expect(page.getByText("$5.94")).toBeVisible();
});

test("Flow 3: finds a product and edits basket quantity", async ({ page }) => {
  await startCheckout(page);
  await addBySearch(page, "coffee", "Morning roast coffee");
  const line = page.locator(".basket-line").filter({ hasText: "Morning roast coffee" });
  await line.getByRole("button", { name: "Add one: Morning roast coffee" }).click();
  await expect(line).toContainText("2");
  await expect(line).toContainText("$23.98");
});

test("Flow 4: validates a coupon and recalculates the total on the API", async ({ page }) => {
  await startCheckout(page);
  await addBySearch(page, "coffee", "Morning roast coffee");
  await scanBarcode(page, "QS-MLK-044");
  await page.getByRole("textbox", { name: "Coupon code" }).fill("FRESH10");
  await page.getByRole("button", { name: "Apply coupon" }).click();
  await expect(page.getByText("FRESH10 · Coupon applied")).toBeVisible();
  await expect(page.locator(".discount-row")).toBeVisible();
  await expect(page.getByText("$15.87")).toBeVisible();
});

test("Flow 5: a scale mismatch blocks checkout until a team member approves", async ({ page }) => {
  await startCheckout(page);
  await scanBarcode(page, "QS-APL-014");
  await page.getByRole("spinbutton", { name: "Simulated scale reading (g)" }).fill("1200");
  await page.getByRole("button", { name: "Confirm scale reading" }).click();
  await expect(page.getByRole("heading", { name: "Team member check" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review and pay" })).toHaveCount(0);
  await page.getByRole("button", { name: "Approve simulated check" }).click();
  await expect(page.getByRole("heading", { name: "Team member check" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review and pay" })).toBeEnabled();
});

test("Flow 6: an attendant can remove an item after a failed weight check", async ({ page }) => {
  await startCheckout(page);
  await scanBarcode(page, "QS-BAN-022");
  await page.getByRole("spinbutton", { name: "Simulated scale reading (g)" }).fill("2000");
  await page.getByRole("button", { name: "Confirm scale reading" }).click();
  await page.getByRole("button", { name: "Remove last scanned item" }).click();
  await expect(page.locator(".basket-line")).toHaveCount(0);
  await expect(page.getByText("Your basket is waiting for its first item.")).toBeVisible();
});

test("Flow 7: checkout totals come from server-owned prices and tax", async ({ page }) => {
  await prepareMilkCheckout(page);
  await expect(page.getByText("$4.64").first()).toBeVisible();
  await expect(
    page.getByText("No card number, security code, bank detail, or real payment token is requested or stored."),
  ).toBeVisible();
});

test("Flow 8: declined simulated tender can be retried and approved", async ({ page }) => {
  await prepareMilkCheckout(page);
  await page.getByRole("radio", { name: "Decline this test payment" }).check();
  await page.getByRole("button", { name: "Run payment simulation" }).click();
  await expect(page.getByText("The simulated payment was declined. Try again or choose another method.")).toBeVisible();
  await page.getByRole("radio", { name: "Approve this test payment" }).check();
  await page.getByRole("button", { name: "Run payment simulation" }).click();
  await expect(page.getByText("Payment approved in simulation")).toBeVisible();
});

test("Flow 9: issues a receipt and resets to a fresh checkout", async ({ page }) => {
  await prepareMilkCheckout(page);
  await page.getByRole("button", { name: "Run payment simulation" }).click();
  await page.getByRole("button", { name: "View receipt" }).click();
  await expect(page.getByRole("heading", { name: "All set." })).toBeVisible();
  await expect(page.getByText(/^QS-\d{8}-[A-F0-9]{6}$/)).toBeVisible();
  await page.getByRole("button", { name: "Start new checkout" }).click();
  await expect(page.getByRole("heading", { name: welcomeHeading })).toBeVisible();
});

test("keeps developer architecture out of product UI and public assets", async ({ page }) => {
  await expect(page.getByRole("button", { name: "System architecture" })).toHaveCount(0);

  const architectureResponse = await page.request.get("/architecture.md");
  expect(await architectureResponse.text()).not.toContain("ScanGo Architecture Reference");

  const modelResponse = await page.request.get("/scango-model.json");
  const model = await modelResponse.json();
  expect(Object.keys(model).sort()).toEqual(["appId", "data", "locale", "messages", "version"]);
  expect(model.data).not.toHaveProperty("architecture");
});

test("uses the selected API while the unselected API endpoint is unreachable", async ({ page }) => {
  const selectedApi = await page.request.get(`${apiBaseUrl}/health`);
  expect(selectedApi.status()).toBe(200);

  const unselectedApiBaseUrl =
    expectedDataMode === "mock" ? process.env.VITE_REAL_API_BASE_URL : process.env.VITE_MOCK_API_BASE_URL;
  expect(unselectedApiBaseUrl).toContain("127.0.0.1:1");
  await expect(page.request.get(`${unselectedApiBaseUrl}/health`, { timeout: 1_000 })).rejects.toThrow();
});

test("model replacement updates UI copy and document metadata", async ({ page }) => {
  const response = await page.request.get("/scango-model.json");
  const model = await response.json();
  model.locale = "fr-CA";
  model.messages.welcomeTitle = "Bienvenue chez QuickStop";
  model.data.app.name = "QuickStop localisé";
  model.data.app.description = "Un marché synthétique pour les tests locaux.";
  await page.route("**/scango-model.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(model) }),
  );

  await page.reload();

  await expect(page.getByRole("heading", { name: "Bienvenue chez QuickStop", level: 1 })).toBeVisible();
  await expect(page).toHaveTitle("QuickStop localisé");
  await expect(page.locator("html")).toHaveAttribute("lang", "fr-CA");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Un marché synthétique pour les tests locaux.",
  );
});

test("fails visibly when a required model message is missing", async ({ page }) => {
  const response = await page.request.get("/scango-model.json");
  const model = await response.json();
  delete model.messages.welcomeTitle;
  await page.route("**/scango-model.json", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(model) }),
  );

  await page.reload();

  await expect(page.getByRole("alert")).toContainText("The kiosk content model is invalid.");
});

test("maps known API errors to model copy instead of showing the server message", async ({ page }) => {
  await startCheckout(page);
  const rawMessage = "Unexpected database details";
  await page.route(/\/api\/v1\/sessions\/[0-9a-f-]+\/scan$/, async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "ITEM_NOT_FOUND", message: rawMessage, requestId: "test-request" },
      }),
    });
  });
  await scanBarcode(page, "UNKNOWN-CODE");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("We could not find that item code. Check it and try again.");
  await expect(alert).not.toContainText(rawMessage);
});

test("expired checkout sessions clear stale basket state and require a fresh checkout", async ({ page }) => {
  await prepareMilkCheckout(page);
  let tenderRequests = 0;
  await page.route(/\/api\/v1\/sessions\/[0-9a-f-]+\/tenders$/, async (route) => {
    tenderRequests += 1;
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        error: {
          code: "SESSION_NOT_FOUND",
          message: "Internal session details",
          requestId: "test-expired-session",
        },
      }),
    });
  });

  await page.getByRole("button", { name: "Run payment simulation" }).click();
  await expect(page.getByRole("heading", { name: welcomeHeading, level: 1 })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("This checkout is no longer active. Start a new checkout.");
  await expect(page.getByRole("alert")).not.toContainText("Internal session details");
  await expect(page.locator(".basket-line")).toHaveCount(0);
  expect(tenderRequests).toBe(1);

  await page.getByRole("button", { name: "Start checkout" }).click();
  await expect(page.getByRole("heading", { name: "Market favorites", level: 2 })).toBeVisible();
  await expect(page.locator(".basket-line")).toHaveCount(0);
  expect(tenderRequests).toBe(1);
});

test("uses generic model copy for unknown API error codes", async ({ page }) => {
  await startCheckout(page);
  const rawMessage = "Internal database connection string";
  await page.route(/\/api\/v1\/sessions\/[0-9a-f-]+\/scan$/, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "INTERNAL_ERROR", message: rawMessage, requestId: "test-request" },
      }),
    });
  });
  await scanBarcode(page, "UNKNOWN-CODE");
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("That action could not be completed. Check the basket and try again.");
  await expect(alert).not.toContainText(rawMessage);
});

test("batch scan replay does not duplicate items", async ({ page }) => {
  const start = await page.request.post(`${apiBaseUrl}/sessions`, {
    headers: { "Idempotency-Key": "playwright-start-session" },
    data: {},
  });
  const startPayload = await start.json();
  const sessionId = String(startPayload.data.id);
  const request = {
    headers: { "Idempotency-Key": "playwright-scan-batch" },
    data: { barcodes: ["QS-MLK-044", "QS-EGG-056"] },
  };
  const first = await page.request.post(`${apiBaseUrl}/sessions/${sessionId}/scan-batch`, request);
  const replay = await page.request.post(`${apiBaseUrl}/sessions/${sessionId}/scan-batch`, request);
  const firstSession = (await first.json()).data;
  const replaySession = (await replay.json()).data;

  expect(first.status()).toBe(200);
  expect(replay.status()).toBe(200);
  expect(replaySession.items).toHaveLength(2);
  expect(replaySession.items).toEqual(firstSession.items);
});

test("recovers after a scan API interruption without losing the basket", async ({ page }) => {
  await startCheckout(page);
  const scanRoute = /\/api\/v1\/sessions\/[0-9a-f-]+\/scan$/;
  await page.route(scanRoute, (route) => route.abort());
  await page.getByRole("textbox", { name: "Barcode or item code" }).fill("QS-MLK-044");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page.unroute(scanRoute);
  await page.getByRole("button", { name: "Try again" }).click();
  await page.getByRole("textbox", { name: "Barcode or item code" }).fill("QS-MLK-044");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.locator(".basket-line").filter({ hasText: "Cream-top milk" })).toBeVisible();
});

test("theme preference persists and mobile layout stays inside the viewport", async ({ page }) => {
  await page.getByRole("button", { name: "Toggle light and dark mode" }).click();
  await expect(page.locator(".scango-shell")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("scango-theme"))).toBe("dark");
  await page.reload();
  await expect(page.getByRole("heading", { name: welcomeHeading })).toBeVisible();
  await expect(page.locator(".scango-shell")).toHaveAttribute("data-theme", "dark");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  const primaryButtonHeight = await page
    .getByRole("button", { name: "Start checkout" })
    .evaluate((button) => button.getBoundingClientRect().height);
  expect(primaryButtonHeight).toBeGreaterThanOrEqual(44);
});
