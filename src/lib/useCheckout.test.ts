import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import * as api from "./api";
import { useCheckout } from "./useCheckout";
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
    getCatalog: vi.fn(),
    getSession: vi.fn(),
    issueReceipt: vi.fn(),
    loadModel: vi.fn(),
    prepareCheckout: vi.fn(),
    resetSession: vi.fn(),
    resolveIntervention: vi.fn(),
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
  apiMocks.resolveIntervention.mockResolvedValue(milkSession);
  apiMocks.prepareCheckout.mockResolvedValue(readySession);
  apiMocks.simulateTender.mockResolvedValue({ session: paidSession, approved: true, message: "Approved" });
  apiMocks.issueReceipt.mockResolvedValue(receipt);
  apiMocks.resetSession.mockResolvedValue({ sessionId: milkSession.id, state: "reset" });
});

afterEach(() => {
  vi.unstubAllGlobals();
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
    await act(async () => result.current.intervene("approve_weight"));
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
    expect(apiMocks.resolveIntervention).toHaveBeenCalledWith(model, milkSession.id, "approve_weight", "checkout-key");
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
      await result.current.intervene("approve_weight");
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
