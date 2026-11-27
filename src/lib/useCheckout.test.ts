import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import * as api from "./api";
import { useCheckout } from "./useCheckout";
import { clearCredentials, getSessionToken, setSessionToken } from "./credentials";
import { copy } from "./format";
import type { CheckoutSession } from "./types";
import { catalog, milkSession, model, paidSession, receipt, readySession } from "../test/fixtures";

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    adjustQuantity: vi.fn(),
    applyCoupon: vi.fn(),
    checkWeight: vi.fn(),
    extendSession: vi.fn(),
    getCatalog: vi.fn(),
    getSession: vi.fn(),
    issueReceipt: vi.fn(),
    loadModel: vi.fn(),
    prepareCheckout: vi.fn(),
    resetSession: vi.fn(),
    scanItem: vi.fn(),
    simulateTender: vi.fn(),
    startSession: vi.fn(),
  };
});

const apiMocks = vi.mocked(api);

function setDescriptionMeta() {
  let description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (!description) {
    description = document.createElement("meta");
    description.name = "description";
    document.head.append(description);
  }
  description.content = "Initial description";
}

async function loadHook() {
  const hook = renderHook(() => useCheckout());
  await waitFor(() => expect(hook.result.current.catalog).toEqual(catalog));
  return hook;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  setDescriptionMeta();
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "checkout-key") });
  apiMocks.loadModel.mockResolvedValue(model);
  apiMocks.getCatalog.mockResolvedValue(catalog);
  apiMocks.getSession.mockResolvedValue(milkSession);
  apiMocks.startSession.mockResolvedValue(milkSession);
  apiMocks.scanItem.mockResolvedValue(milkSession);
  apiMocks.adjustQuantity.mockResolvedValue(milkSession);
  apiMocks.applyCoupon.mockResolvedValue(milkSession);
  apiMocks.checkWeight.mockResolvedValue(milkSession);
  apiMocks.prepareCheckout.mockResolvedValue(readySession);
  apiMocks.simulateTender.mockResolvedValue({ session: paidSession, approved: true, message: "Approved" });
  apiMocks.issueReceipt.mockResolvedValue(receipt);
  apiMocks.resetSession.mockResolvedValue({ sessionId: milkSession.id, state: "reset" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearCredentials();
});

describe("checkout hook", () => {
  it("loads strict content, catalog, document metadata, and the saved theme", async () => {
    window.localStorage.setItem(model.data.app.themeStorageKey, "dark");
    const { result } = await loadHook();

    expect(result.current.model).toEqual(model);
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.lang).toBe(model.locale);
    expect(document.title).toBe(model.data.app.name);
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute("content", model.data.app.description);

    act(() => result.current.setTheme("light"));
    expect(window.localStorage.getItem(model.data.app.themeStorageKey)).toBe("light");
    act(() => result.current.dismissError());
    expect(result.current.error).toBeNull();
  });

  it("runs checkout actions through tender, receipt, reset, and session retry", async () => {
    const issuedSession: CheckoutSession = { ...paidSession, state: "receipt_issued" };
    apiMocks.getSession.mockResolvedValueOnce(issuedSession).mockResolvedValueOnce(milkSession);
    const { result } = await loadHook();

    await act(async () => result.current.start());
    await act(async () => result.current.scan("QS-MLK-044", "barcode"));
    await act(async () => result.current.quantity("dairy-milk", 1));
    await act(async () => result.current.coupon("FRESH10"));
    await act(async () => result.current.weigh(980));
    await act(async () => result.current.checkout());
    await act(async () => result.current.tender("cash", "approve"));
    await act(async () => result.current.issueReceipt());

    expect(result.current.session).toEqual(issuedSession);
    expect(result.current.receipt).toEqual(receipt);
    expect(apiMocks.startSession).toHaveBeenCalledWith(model, "checkout-key");
    expect(apiMocks.scanItem).toHaveBeenCalledWith(model, milkSession.id, "QS-MLK-044", "barcode", "checkout-key");
    expect(apiMocks.adjustQuantity).toHaveBeenCalledWith(model, milkSession.id, "dairy-milk", 1, "checkout-key");
    expect(apiMocks.applyCoupon).toHaveBeenCalledWith(model, milkSession.id, "FRESH10", "checkout-key");
    expect(apiMocks.checkWeight).toHaveBeenCalledWith(model, milkSession.id, 980, "checkout-key");
    expect(apiMocks.prepareCheckout).toHaveBeenCalledWith(model, milkSession.id, "checkout-key");
    expect(apiMocks.simulateTender).toHaveBeenCalledWith(model, milkSession.id, "cash", "approve", "checkout-key");

    await act(async () => result.current.retry());
    expect(result.current.session).toEqual(milkSession);
    await act(async () => result.current.reset());
    expect(result.current.session).toBeNull();
    expect(result.current.receipt).toBeNull();
  });

  it("maps expired and generic action failures to safe copy", async () => {
    const { result } = await loadHook();
    await act(async () => result.current.start());
    apiMocks.scanItem.mockRejectedValueOnce(
      new ApiError(copy(model, "sessionExpired"), 404, "SESSION_NOT_FOUND", "request-id"),
    );

    await act(async () => result.current.scan("QS-MLK-044", "barcode"));
    expect(result.current.session).toBeNull();
    expect(result.current.error).toBe(copy(model, "sessionExpired"));

    await act(async () => result.current.start());
    apiMocks.scanItem.mockRejectedValueOnce(new Error("internal exception detail"));
    await act(async () => result.current.scan("QS-MLK-044", "barcode"));
    expect(result.current.error).toBe(copy(model, "errorGeneric"));
    expect(result.current.error).not.toContain("internal exception detail");
    expect(result.current.busy).toBe(false);
  });

  it("a lost reply keeps the intent key, waits for confirmation, and a retry reuses the same key", async () => {
    let next = 0;
    vi.mocked(crypto.randomUUID).mockImplementation(() => `a-b-c-d-${++next}`);
    const { result } = await loadHook();
    await act(async () => result.current.start());
    apiMocks.scanItem.mockRejectedValueOnce(
      new ApiError(copy(model, "serviceUnavailable"), 0, "SERVICE_UNAVAILABLE", null),
    );

    await act(async () => result.current.scan("QS-MLK-044", "barcode"));
    expect(result.current.awaiting?.kind).toBe("scan");
    expect(result.current.error).toBeNull();
    const firstKey = apiMocks.scanItem.mock.calls[0][4];

    await act(async () => result.current.awaiting?.retry());
    expect(apiMocks.scanItem.mock.calls[1][4]).toBe(firstKey);
    expect(result.current.awaiting).toBeNull();
    expect(result.current.session).toEqual(milkSession);
  });

  it("a server error also keeps the key; a definite refusal discards it", async () => {
    let next = 0;
    vi.mocked(crypto.randomUUID).mockImplementation(() => `a-b-c-d-${++next}`);
    const { result } = await loadHook();
    await act(async () => result.current.start());

    apiMocks.scanItem.mockRejectedValueOnce(new ApiError(copy(model, "errorGeneric"), 503, "INTERNAL_ERROR", null));
    await act(async () => result.current.scan("QS-MLK-044", "barcode"));
    await act(async () => result.current.awaiting?.retry());
    expect(apiMocks.scanItem.mock.calls[1][4]).toBe(apiMocks.scanItem.mock.calls[0][4]);

    apiMocks.scanItem.mockRejectedValueOnce(new ApiError(copy(model, "invalidBarcode"), 404, "ITEM_NOT_FOUND", null));
    await act(async () => result.current.scan("UNKNOWN", "barcode"));
    expect(result.current.awaiting).toBeNull();
    expect(result.current.error).toBe(copy(model, "invalidBarcode"));
    await act(async () => result.current.scan("UNKNOWN", "barcode"));
    expect(apiMocks.scanItem.mock.calls[3][4]).not.toBe(apiMocks.scanItem.mock.calls[2][4]);
  });

  it("a deliberate second scan of the same item after success is a new intent", async () => {
    let next = 0;
    vi.mocked(crypto.randomUUID).mockImplementation(() => `a-b-c-d-${++next}`);
    const { result } = await loadHook();
    await act(async () => result.current.start());

    await act(async () => result.current.scan("QS-MLK-044", "barcode"));
    await act(async () => result.current.scan("QS-MLK-044", "barcode"));
    expect(apiMocks.scanItem.mock.calls[1][4]).not.toBe(apiMocks.scanItem.mock.calls[0][4]);
  });

  it("a failed refresh reports the error and never offers to replay a read", async () => {
    const { result } = await loadHook();
    await act(async () => result.current.start());
    apiMocks.getSession.mockRejectedValueOnce(
      new ApiError(copy(model, "serviceUnavailable"), 0, "SERVICE_UNAVAILABLE", null),
    );

    await act(async () => result.current.retry());
    expect(result.current.awaiting).toBeNull();
    expect(result.current.error).toBe(copy(model, "serviceUnavailable"));
    expect(result.current.session).toEqual(milkSession);
  });

  it("pressing Start twice quickly starts one checkout", async () => {
    let finishStart: (session: CheckoutSession) => void = () => undefined;
    apiMocks.startSession.mockReturnValueOnce(new Promise((resolve) => (finishStart = resolve)));
    const { result } = await loadHook();

    await act(async () => {
      void result.current.start();
      void result.current.start();
      finishStart(milkSession);
    });
    expect(apiMocks.startSession).toHaveBeenCalledTimes(1);
    expect(result.current.session).toEqual(milkSession);
  });

  it("a lost tender reply never shows a paid state until the server confirms it", async () => {
    apiMocks.startSession.mockResolvedValueOnce(readySession);
    const { result } = await loadHook();
    await act(async () => result.current.start());
    apiMocks.simulateTender.mockRejectedValueOnce(
      new ApiError(copy(model, "serviceUnavailable"), 0, "SERVICE_UNAVAILABLE", null),
    );

    await act(async () => result.current.tender("simulated_card", "approve"));
    expect(result.current.awaiting?.kind).toBe("tender");
    expect(result.current.session?.state).toBe("ready_to_pay");
    expect(result.current.receipt).toBeNull();

    await act(async () => result.current.awaiting?.retry());
    expect(result.current.session).toEqual(paidSession);
  });

  it("tracks the server's idle window and extends it on request", async () => {
    const extended: CheckoutSession = { ...milkSession, version: 3, expiresInSeconds: 180 };
    apiMocks.extendSession.mockResolvedValueOnce(extended);
    const { result } = await loadHook();
    expect(result.current.idle.phase).toBe("inactive");

    await act(async () => result.current.start());
    expect(result.current.idle.phase).toBe("active");
    await act(async () => result.current.extend());

    expect(apiMocks.extendSession).toHaveBeenCalledWith(model, milkSession.id, "checkout-key");
    expect(result.current.session).toEqual(extended);
  });

  it("expiry clears the session, receipt and credentials and explains why", async () => {
    apiMocks.startSession.mockResolvedValueOnce({ ...milkSession, expiresInSeconds: 0 });
    const { result } = await loadHook();
    setSessionToken("shopper-token");

    await act(async () => result.current.start());
    await waitFor(() => expect(result.current.session).toBeNull());
    expect(result.current.receipt).toBeNull();
    expect(result.current.error).toBe(copy(model, "sessionTimedOut"));
    expect(result.current.idle.phase).toBe("inactive");
    expect(getSessionToken()).toBeNull();
  });

  it("a 410 on a write returns to the welcome screen with the timed-out message", async () => {
    const { result } = await loadHook();
    await act(async () => result.current.start());
    setSessionToken("shopper-token");
    apiMocks.scanItem.mockRejectedValueOnce(
      new ApiError(copy(model, "sessionTimedOut"), 410, "SESSION_EXPIRED", "request-id"),
    );

    await act(async () => result.current.scan("QS-MLK-044", "barcode"));
    expect(result.current.session).toBeNull();
    expect(result.current.error).toBe(copy(model, "sessionTimedOut"));
    expect(getSessionToken()).toBeNull();
  });

  it("reset forgets the shopper token and asks the welcome screen to take focus", async () => {
    const { result } = await loadHook();
    expect(result.current.welcomeFocus).toBe(false);
    await act(async () => result.current.start());
    setSessionToken("shopper-token");

    await act(async () => result.current.reset());
    expect(getSessionToken()).toBeNull();
    expect(result.current.welcomeFocus).toBe(true);
    await act(async () => result.current.start());
    expect(result.current.welcomeFocus).toBe(false);
  });

  it("checks for an attendant decision every three seconds while attention is required and visible", async () => {
    const waiting: CheckoutSession = { ...milkSession, state: "attention_required", version: 7 };
    const cleared: CheckoutSession = { ...milkSession, state: "scanning", version: 8 };
    apiMocks.startSession.mockResolvedValueOnce(waiting);
    const { result } = await loadHook();
    let visibility: DocumentVisibilityState = "hidden";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    vi.useFakeTimers();
    await act(async () => result.current.start());
    apiMocks.getSession.mockClear();

    await act(async () => vi.advanceTimersByTimeAsync(6_000));
    expect(apiMocks.getSession).not.toHaveBeenCalled();
    visibility = "visible";
    apiMocks.getSession.mockResolvedValueOnce(cleared);
    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(apiMocks.getSession).toHaveBeenCalledWith(model, waiting.id);
    expect(result.current.session).toEqual(cleared);

    await act(async () => vi.advanceTimersByTimeAsync(9_000));
    expect(apiMocks.getSession).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("a failed poll keeps the last confirmed state, but a vanished session returns to the welcome screen", async () => {
    const waiting: CheckoutSession = { ...milkSession, state: "attention_required" };
    apiMocks.startSession.mockResolvedValueOnce(waiting);
    const { result } = await loadHook();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.useFakeTimers();
    await act(async () => result.current.start());

    apiMocks.getSession.mockRejectedValueOnce(
      new ApiError(copy(model, "serviceUnavailable"), 0, "SERVICE_UNAVAILABLE", null),
    );
    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(result.current.session).toEqual(waiting);
    apiMocks.getSession.mockRejectedValueOnce(new Error("socket detail"));
    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(result.current.session).toEqual(waiting);
    expect(result.current.error).toBeNull();

    apiMocks.getSession.mockRejectedValueOnce(
      new ApiError(copy(model, "sessionTimedOut"), 410, "SESSION_EXPIRED", null),
    );
    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(result.current.session).toBeNull();
    expect(result.current.error).toBe(copy(model, "sessionTimedOut"));
    vi.useRealTimers();
  });

  it("retries failed boot and reports non-Error initialization failures", async () => {
    apiMocks.loadModel.mockRejectedValueOnce("unavailable");
    const { result } = renderHook(() => useCheckout());
    await waitFor(() => expect(result.current.error).toBe("The kiosk could not start."));

    await act(async () => result.current.retry());
    await waitFor(() => expect(result.current.catalog).toEqual(catalog));
    expect(apiMocks.loadModel).toHaveBeenCalledTimes(2);
  });

  it("returns early when model or session state is unavailable and aborts on unmount", async () => {
    apiMocks.loadModel.mockImplementation(() => new Promise(() => undefined));
    const { result, unmount } = renderHook(() => useCheckout());

    await act(async () => {
      await result.current.start();
      await result.current.scan("QS-MLK-044", "barcode");
      await result.current.quantity("dairy-milk", 1);
      await result.current.coupon("FRESH10");
      await result.current.weigh(980);
      await result.current.checkout();
      await result.current.tender("cash", "approve");
      await result.current.issueReceipt();
      await result.current.reset();
      result.current.setTheme("dark");
    });

    expect(apiMocks.startSession).not.toHaveBeenCalled();
    expect(apiMocks.scanItem).not.toHaveBeenCalled();
    unmount();
    expect(window.localStorage.getItem(model.data.app.themeStorageKey)).toBeNull();
  });

  it("skips catalog loading if boot is aborted and fails if page metadata is missing", async () => {
    let resolveModel: ((value: typeof model) => void) | undefined;
    apiMocks.loadModel.mockImplementationOnce(() => new Promise((resolve) => (resolveModel = resolve)));
    const aborted = renderHook(() => useCheckout());
    aborted.unmount();
    resolveModel?.(model);
    await act(async () => Promise.resolve());
    expect(apiMocks.getCatalog).not.toHaveBeenCalled();

    document.querySelector('meta[name="description"]')?.remove();
    const missingMetadata = renderHook(() => useCheckout());
    await waitFor(() =>
      expect(missingMetadata.result.current.error).toBe("The page description metadata is unavailable."),
    );
    missingMetadata.unmount();
  });
});
