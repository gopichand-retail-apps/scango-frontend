import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  adjustQuantity,
  applyCoupon,
  checkWeight,
  getCatalog,
  getProductById,
  getReceipt,
  getSession,
  issueReceipt,
  loadModel,
  prepareCheckout,
  resetSession,
  resolveIntervention,
  scanBatch,
  scanItem,
  simulateTender,
  startSession,
} from "./api";
import { copy } from "./format";
import { catalog, emptySession, model, paidSession, receipt } from "../test/fixtures";

const sessionId = emptySession.id;
const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(payload: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function queueResponse(data: unknown, status = 200, headers: HeadersInit = {}) {
  fetchMock.mockResolvedValueOnce(jsonResponse({ data }, status, headers));
}

function lastRequest() {
  const request = fetchMock.mock.calls.at(-1);
  if (!request) throw new Error("Expected the API client to send a request.");
  return { url: String(request[0]), options: request[1] ?? {} };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VITE_SCANGO_API_BASE_URL", "http://127.0.0.1:5999/api/v1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("API client", () => {
  it("loads the strict model without caching and never reads an endpoint from model data", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(model));

    await expect(loadModel()).resolves.toEqual(model);

    expect(lastRequest()).toEqual({
      url: "/scango-model.json",
      options: expect.objectContaining({ cache: "no-store" }),
    });
    expect(model.data.app).not.toHaveProperty("apiBaseUrl");
  });

  it("fails clearly when the model cannot be fetched or parsed", async () => {
    fetchMock.mockResolvedValueOnce(new Response("missing", { status: 404 }));
    await expect(loadModel()).rejects.toThrow("The kiosk content model is unavailable.");

    fetchMock.mockResolvedValueOnce(new Response("not-json", { status: 200 }));
    await expect(loadModel()).rejects.toThrow("The kiosk content model is invalid.");

    fetchMock.mockResolvedValueOnce(jsonResponse({ appId: "wrong-app" }));
    await expect(loadModel()).rejects.toThrow("The kiosk content model is invalid.");
  });

  it("loads catalog data from the configured API origin", async () => {
    queueResponse(catalog);

    await expect(getCatalog(model)).resolves.toEqual(catalog);

    expect(lastRequest().url).toBe("http://127.0.0.1:5999/api/v1/catalog");
  });

  it("sends every checkout operation with its versioned route and idempotency key", async () => {
    const actions = [
      {
        run: () => startSession(model, "start-key"),
        path: "/sessions",
        body: {},
        key: "start-key",
        data: emptySession,
      },
      { run: () => getSession(model, sessionId), path: `/sessions/${sessionId}`, data: emptySession },
      {
        run: () => scanItem(model, sessionId, "QS-MLK-044", "barcode", "scan-key"),
        path: `/sessions/${sessionId}/scan`,
        body: { barcode: "QS-MLK-044", source: "barcode" },
        key: "scan-key",
        data: emptySession,
      },
      {
        run: () => scanBatch(model, sessionId, ["QS-MLK-044"], "batch-key"),
        path: `/sessions/${sessionId}/scan-batch`,
        body: { barcodes: ["QS-MLK-044"] },
        key: "batch-key",
        data: emptySession,
      },
      {
        run: () => adjustQuantity(model, sessionId, "dairy-milk", 1, "quantity-key"),
        path: `/sessions/${sessionId}/quantity`,
        body: { productId: "dairy-milk", delta: 1 },
        key: "quantity-key",
        data: emptySession,
      },
      {
        run: () => applyCoupon(model, sessionId, "FRESH10", "coupon-key"),
        path: `/sessions/${sessionId}/coupon`,
        body: { code: "FRESH10" },
        key: "coupon-key",
        data: emptySession,
      },
      {
        run: () => checkWeight(model, sessionId, 980, "weight-key"),
        path: `/sessions/${sessionId}/weight-check`,
        body: { simulatedWeightGrams: 980 },
        key: "weight-key",
        data: emptySession,
      },
      {
        run: () => resolveIntervention(model, sessionId, "approve_weight", "intervention-key"),
        path: `/sessions/${sessionId}/intervention`,
        body: { action: "approve_weight" },
        key: "intervention-key",
        data: emptySession,
      },
      {
        run: () => prepareCheckout(model, sessionId, "checkout-key"),
        path: `/sessions/${sessionId}/checkout`,
        body: {},
        key: "checkout-key",
        data: emptySession,
      },
      {
        run: () => simulateTender(model, sessionId, "cash", "approve", "tender-key"),
        path: `/sessions/${sessionId}/tenders`,
        body: { method: "cash", outcome: "approve" },
        key: "tender-key",
        data: { session: paidSession, approved: true, message: "Approved" },
      },
      {
        run: () => issueReceipt(model, sessionId, "receipt-key"),
        path: `/sessions/${sessionId}/receipt`,
        body: {},
        key: "receipt-key",
        data: receipt,
      },
      { run: () => getReceipt(model, sessionId), path: `/sessions/${sessionId}/receipt`, data: receipt },
      {
        run: () => resetSession(model, sessionId, "reset-key"),
        path: `/sessions/${sessionId}/reset`,
        body: {},
        key: "reset-key",
        data: { sessionId, state: "reset" },
      },
    ];

    for (const action of actions) {
      queueResponse(action.data);
      await action.run();
      const request = lastRequest();
      expect(request.url).toBe(`http://127.0.0.1:5999/api/v1${action.path}`);
      expect(request.options.method).toBe(action.body ? "POST" : "GET");
      if (action.body) expect(JSON.parse(String(request.options.body))).toEqual(action.body);
      if (action.key) expect(new Headers(request.options.headers).get("Idempotency-Key")).toBe(action.key);
      else expect(new Headers(request.options.headers).has("Idempotency-Key")).toBe(false);
    }
  });

  it("maps stable error codes to model copy and suppresses server messages", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: "ITEM_NOT_FOUND", message: "private server detail", requestId: "request-1" } },
        404,
        { "X-Request-ID": "request-1" },
      ),
    );

    const result = await scanItem(model, sessionId, "UNKNOWN", "barcode", "error-key").catch((value: unknown) => value);
    if (!(result instanceof ApiError)) throw new Error("Expected the API client to reject with ApiError.");
    const error = result;

    expect(error).toMatchObject({ status: 404, code: "ITEM_NOT_FOUND", requestId: "request-1" });
    expect(error.message).toBe(copy(model, "invalidBarcode"));
    expect(error.message).not.toContain("private server detail");
  });

  it("uses generic model copy for unknown codes and invalid response payloads", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { code: "INTERNAL_ERROR", message: "secret" } }, 500));
    await expect(scanItem(model, sessionId, "UNKNOWN", "barcode", "unknown-key")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: copy(model, "errorGeneric"),
    });

    fetchMock.mockResolvedValueOnce(new Response("not-json", { status: 502 }));
    await expect(getCatalog(model)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    queueResponse({ unexpected: true });
    await expect(getCatalog(model)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("maps network failures but preserves an aborted request", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket detail"));
    await expect(getCatalog(model)).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: copy(model, "serviceUnavailable"),
    });

    const abortError = new DOMException("Request aborted", "AbortError");
    fetchMock.mockRejectedValueOnce(abortError);
    const controller = new AbortController();
    controller.abort();
    await expect(getCatalog(model, controller.signal)).rejects.toBe(abortError);
  });

  it("finds catalog products by stable ID", () => {
    expect(getProductById(catalog, "dairy-milk")).toEqual(
      catalog.products.find((product) => product.id === "dairy-milk"),
    );
    expect(getProductById(catalog, "unknown-product")).toBeUndefined();
  });
});
