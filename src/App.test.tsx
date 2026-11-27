import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useCheckout } from "./lib/useCheckout";
import { copy } from "./lib/format";
import type { CheckoutSession } from "./lib/types";
import { catalog, emptySession, model, paidSession, receipt } from "./test/fixtures";

vi.mock("./lib/useCheckout", () => ({ useCheckout: vi.fn() }));

type CheckoutView = ReturnType<typeof useCheckout>;

function createKiosk(overrides: Partial<CheckoutView> = {}): CheckoutView {
  return {
    model,
    catalog,
    session: null,
    receipt: null,
    theme: "light",
    error: null,
    busy: false,
    start: vi.fn().mockResolvedValue(undefined),
    scan: vi.fn().mockResolvedValue(undefined),
    quantity: vi.fn().mockResolvedValue(undefined),
    coupon: vi.fn().mockResolvedValue(undefined),
    weigh: vi.fn().mockResolvedValue(undefined),
    checkout: vi.fn().mockResolvedValue(undefined),
    tender: vi.fn().mockResolvedValue(undefined),
    issueReceipt: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    extend: vi.fn().mockResolvedValue(undefined),
    idle: { phase: "inactive", secondsLeft: null },
    awaiting: null,
    welcomeFocus: false,
    retry: vi.fn().mockResolvedValue(undefined),
    setTheme: vi.fn(),
    dismissError: vi.fn(),
    ...overrides,
  };
}

const mockUseCheckout = vi.mocked(useCheckout);

beforeEach(() => {
  mockUseCheckout.mockReset();
  mockUseCheckout.mockReturnValue(createKiosk());
});

describe("ScanGo app shell", () => {
  it("shows boot loading and retryable boot errors", () => {
    const loading = createKiosk({ model: null, catalog: null });
    mockUseCheckout.mockReturnValue(loading);
    const { rerender } = render(<App />);
    expect(screen.getByRole("status")).toBeVisible();

    const failed = createKiosk({ model: null, catalog: null, error: "The model is unavailable." });
    mockUseCheckout.mockReturnValue(failed);
    rerender(<App />);
    expect(screen.getByRole("alert")).toHaveTextContent("The model is unavailable.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(failed.retry).toHaveBeenCalledOnce();
  });

  it("renders a retryable service error when the catalog is unavailable", () => {
    const kiosk = createKiosk({ catalog: null });
    mockUseCheckout.mockReturnValue(kiosk);
    render(<App />);

    expect(screen.getByRole("alert")).toHaveTextContent(copy(model, "serviceUnavailable"));
    fireEvent.click(screen.getByRole("button", { name: copy(model, "retry") }));
    expect(kiosk.retry).toHaveBeenCalledOnce();
  });

  it("starts from the welcome screen, toggles theme, and exposes the selected API mode", () => {
    const kiosk = createKiosk({ theme: null });
    mockUseCheckout.mockReturnValue(kiosk);
    render(<App />);

    expect(screen.getByRole("heading", { name: copy(model, "welcomeTitle") })).toBeVisible();
    expect(document.querySelector(".scango-shell")).toHaveAttribute("data-mode", "mock");
    fireEvent.click(screen.getByRole("button", { name: copy(model, "startCheckout") }));
    fireEvent.click(screen.getByRole("button", { name: copy(model, "themeToggle") }));
    expect(kiosk.start).toHaveBeenCalledOnce();
    expect(kiosk.setTheme).toHaveBeenCalledWith("dark");
  });

  it("renders the checkout workspace and dismissible safe API errors", () => {
    const kiosk = createKiosk({ session: emptySession, error: "Safe error copy" });
    mockUseCheckout.mockReturnValue(kiosk);
    render(<App />);

    expect(screen.getByRole("heading", { name: copy(model, "catalogHeading"), level: 1 })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("Safe error copy");
    fireEvent.click(screen.getByRole("button", { name: copy(model, "retry") }));
    expect(kiosk.retry).toHaveBeenCalledOnce();
  });

  it("renders a server-issued receipt after payment", () => {
    const receiptSession: CheckoutSession = { ...paidSession, state: "receipt_issued" };
    const kiosk = createKiosk({ session: receiptSession, receipt });
    mockUseCheckout.mockReturnValue(kiosk);
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<App />);

    expect(screen.getByRole("heading", { name: copy(model, "receiptTitle") })).toBeVisible();
    expect(screen.getByText(receipt.receiptNumber)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: copy(model, "printReceipt") }));
    expect(print).toHaveBeenCalledOnce();
  });

  it("shows the idle warning over the workspace and routes its two actions", () => {
    const kiosk = createKiosk({ session: emptySession, idle: { phase: "warning", secondsLeft: 12 } });
    mockUseCheckout.mockReturnValue(kiosk);
    render(<App />);

    expect(screen.getByRole("alertdialog", { name: copy(model, "sessionIdleTitle") })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: copy(model, "sessionExtend") }));
    fireEvent.click(screen.getByRole("button", { name: copy(model, "sessionEndNow") }));
    expect(kiosk.extend).toHaveBeenCalledOnce();
    expect(kiosk.reset).toHaveBeenCalledOnce();
  });

  it("shows the awaiting-confirmation panel and locks other writes until the step is confirmed", () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    const kiosk = createKiosk({ session: emptySession, awaiting: { kind: "scan", retry } });
    mockUseCheckout.mockReturnValue(kiosk);
    render(<App />);

    expect(screen.getByText(copy(model, "awaitingConfirmationTitle"))).toBeVisible();
    expect(screen.getByRole("button", { name: copy(model, "scanItem") })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: copy(model, "retryConfirmation") }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("keeps the idle warning hidden while the session is active", () => {
    mockUseCheckout.mockReturnValue(createKiosk({ session: emptySession, idle: { phase: "active", secondsLeft: 90 } }));
    render(<App />);

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
