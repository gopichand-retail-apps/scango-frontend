import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BasketPanel } from "./BasketPanel";
import { CatalogPanel } from "./CatalogPanel";
import { KioskHeader } from "./KioskHeader";
import { KioskWorkspace } from "./KioskWorkspace";
import { PaymentPanel } from "./PaymentPanel";
import { ReceiptPanel } from "./ReceiptPanel";
import { ScaleCheckPanel } from "./ScaleCheckPanel";
import { WelcomeScreen } from "./WelcomeScreen";
import { copy } from "../lib/format";
import type { CheckoutSession } from "../lib/types";
import { catalog, emptySession, milkSession, model, paidSession, readySession, receipt } from "../test/fixtures";

const noop = async () => undefined;

function weightCheckSession(state: "weight_check_pending" | "attention_required"): CheckoutSession {
  const [item] = milkSession.items;
  if (!item) throw new Error("ScanGo test fixture is missing a basket line.");
  const weightItem = { ...item, weightStatus: state === "attention_required" ? "attention" : "pending" } as const;
  return { ...milkSession, state, pendingWeight: weightItem };
}

describe("welcome and catalog screens", () => {
  it("renders model-backed welcome copy and brand content", () => {
    render(<WelcomeScreen model={model} products={catalog.products} busy={false} onStart={vi.fn()} />);

    expect(screen.getByRole("heading", { name: copy(model, "welcomeTitle") })).toBeVisible();
    expect(screen.getByText(copy(model, "marketMonogram"))).toBeVisible();
    expect(document.querySelector(".welcome-product-stamp small")).toHaveTextContent("QUICKSTOPMARKET");
    expect(screen.getByRole("button", { name: /Start checkout/ })).toBeEnabled();
  });

  it("scans by barcode, filters products, and reports empty search results", async () => {
    const user = userEvent.setup();
    const onScan = vi.fn().mockResolvedValue(undefined);
    render(<CatalogPanel model={model} catalog={catalog} disabled={false} busy={false} onScan={onScan} />);

    await user.type(screen.getByRole("textbox", { name: "Barcode or item code" }), "QS-BRD-031");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(onScan).toHaveBeenCalledWith("QS-BRD-031", "barcode");

    const search = screen.getByRole("searchbox", { name: "Find an item" });
    await user.type(search, "coffee");
    const coffeeTile = screen.getByText("Morning roast coffee").closest("article");
    if (!coffeeTile) throw new Error("The coffee product tile was not rendered.");
    await user.click(within(coffeeTile).getByRole("button", { name: "Add to basket" }));
    expect(onScan).toHaveBeenCalledWith("QS-COF-063", "search");

    await user.clear(search);
    await user.click(screen.getByRole("button", { name: "Bakery" }));
    expect(screen.getByText("Country sourdough")).toBeVisible();
    expect(screen.queryByText("Cream-top milk")).not.toBeInTheDocument();

    await user.type(search, "no-results");
    expect(screen.getByRole("status")).toHaveTextContent(copy(model, "emptySearch"));
  });

  it("fails rather than assigning a fallback category to malformed API data", () => {
    const product = catalog.products[0];
    if (!product) throw new Error("ScanGo test fixture is missing a product.");
    const invalidCatalog = {
      ...catalog,
      products: [{ ...product, categoryId: "unmapped-category" }],
    };

    expect(() =>
      render(<CatalogPanel model={model} catalog={invalidCatalog} disabled={false} busy={false} onScan={vi.fn()} />),
    ).toThrow("Missing catalog category mapping: unmapped-category");
  });
});

describe("basket and scale screens", () => {
  it("shows an empty basket and disables checkout", () => {
    render(
      <BasketPanel
        model={model}
        session={emptySession}
        editable
        busy={false}
        onQuantity={vi.fn()}
        onCoupon={vi.fn()}
        onCheckout={vi.fn()}
      />,
    );

    expect(screen.getByText(copy(model, "emptyBasket"))).toBeVisible();
    expect(screen.getByRole("button", { name: copy(model, "checkout") })).toBeDisabled();
  });

  it("edits quantity, applies and removes coupons, and starts checkout", async () => {
    const user = userEvent.setup();
    const onQuantity = vi.fn().mockResolvedValue(undefined);
    const onCoupon = vi.fn().mockResolvedValue(undefined);
    const onCheckout = vi.fn().mockResolvedValue(undefined);
    const appliedSession = { ...milkSession, couponCode: "FRESH10" };

    const { rerender } = render(
      <BasketPanel
        model={model}
        session={milkSession}
        editable
        busy={false}
        onQuantity={onQuantity}
        onCoupon={onCoupon}
        onCheckout={onCheckout}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add one: Cream-top milk" }));
    await user.click(screen.getByRole("button", { name: "Remove item: Cream-top milk" }));
    await user.type(screen.getByRole("textbox", { name: copy(model, "couponLabel") }), "FRESH10");
    await user.click(screen.getByRole("button", { name: copy(model, "applyCoupon") }));
    await user.click(screen.getByRole("button", { name: copy(model, "checkout") }));
    expect(onQuantity).toHaveBeenNthCalledWith(1, "dairy-milk", 1);
    expect(onQuantity).toHaveBeenNthCalledWith(2, "dairy-milk", -1);
    expect(onCoupon).toHaveBeenCalledWith("FRESH10");
    expect(onCheckout).toHaveBeenCalledOnce();

    rerender(
      <BasketPanel
        model={model}
        session={appliedSession}
        editable
        busy={false}
        onQuantity={onQuantity}
        onCoupon={onCoupon}
        onCheckout={onCheckout}
      />,
    );
    await user.click(screen.getByRole("button", { name: copy(model, "couponRemoved") }));
    expect(onCoupon).toHaveBeenLastCalledWith("");
  });

  it("submits simulated scale readings and attendant actions", async () => {
    const user = userEvent.setup();
    const onWeigh = vi.fn().mockResolvedValue(undefined);
    const onIntervention = vi.fn().mockResolvedValue(undefined);
    const pending = weightCheckSession("weight_check_pending");
    const attention = weightCheckSession("attention_required");

    const { rerender } = render(
      <ScaleCheckPanel
        model={model}
        session={pending}
        busy={false}
        onWeigh={onWeigh}
        onIntervention={onIntervention}
      />,
    );
    const reading = screen.getByRole("spinbutton", { name: copy(model, "weightMeasured") });
    await user.clear(reading);
    await user.type(reading, "980");
    await user.click(screen.getByRole("button", { name: copy(model, "confirmWeight") }));
    expect(onWeigh).toHaveBeenCalledWith(980);

    rerender(
      <ScaleCheckPanel
        model={model}
        session={attention}
        busy={false}
        onWeigh={onWeigh}
        onIntervention={onIntervention}
      />,
    );
    await user.click(screen.getByRole("button", { name: copy(model, "approveWeight") }));
    await user.click(screen.getByRole("button", { name: copy(model, "removeLastScanned") }));
    expect(onIntervention).toHaveBeenNthCalledWith(1, "approve_weight");
    expect(onIntervention).toHaveBeenNthCalledWith(2, "remove_item");
  });

  it("shows a safe alert if the scale state has no pending item", () => {
    render(<ScaleCheckPanel model={model} session={emptySession} busy={false} onWeigh={noop} onIntervention={noop} />);
    expect(screen.getByRole("alert")).toHaveTextContent(copy(model, "weightMismatch"));
  });
});

describe("payment, receipt, and workspace screens", () => {
  it("selects tender options, exposes declined state, and submits the simulation", async () => {
    const user = userEvent.setup();
    const onTender = vi.fn().mockResolvedValue(undefined);
    const declined: CheckoutSession = {
      ...readySession,
      latestTender: {
        id: "00000000-0000-4000-8000-000000000004",
        method: "cash",
        outcome: "decline",
        amountCents: readySession.totalCents,
        occurredAt: "2026-01-01T12:01:00.000Z",
      },
    };

    render(<PaymentPanel model={model} session={declined} busy={false} onTender={onTender} onReceipt={noop} />);
    await user.click(screen.getByRole("radio", { name: copy(model, "cashSimulation") }));
    await user.click(screen.getByRole("radio", { name: copy(model, "declineSimulation") }));
    expect(screen.getByRole("alert")).toHaveTextContent(copy(model, "paymentDeclined"));
    await user.click(screen.getByRole("button", { name: copy(model, "runPayment") }));
    expect(onTender).toHaveBeenCalledWith("cash", "decline");
  });

  it("offers receipt after an approved simulated payment", async () => {
    const user = userEvent.setup();
    const onReceipt = vi.fn().mockResolvedValue(undefined);
    render(<PaymentPanel model={model} session={paidSession} busy={false} onTender={vi.fn()} onReceipt={onReceipt} />);

    expect(screen.getByRole("status")).toHaveTextContent(copy(model, "paymentApproved"));
    expect(screen.getByText(copy(model, "approvedMark"))).toBeVisible();
    await user.click(screen.getByRole("button", { name: copy(model, "issueReceipt") }));
    expect(onReceipt).toHaveBeenCalledOnce();
  });

  it("submits an approved simulated card outcome", async () => {
    const user = userEvent.setup();
    const onTender = vi.fn().mockResolvedValue(undefined);
    render(<PaymentPanel model={model} session={readySession} busy={false} onTender={onTender} onReceipt={noop} />);

    await user.click(screen.getByRole("radio", { name: copy(model, "cashSimulation") }));
    await user.click(screen.getByRole("radio", { name: copy(model, "cardSimulation") }));
    await user.click(screen.getByRole("radio", { name: copy(model, "declineSimulation") }));
    await user.click(screen.getByRole("radio", { name: copy(model, "approveSimulation") }));
    await user.click(screen.getByRole("button", { name: copy(model, "runPayment") }));
    expect(onTender).toHaveBeenCalledWith("simulated_card", "approve");
  });

  it("prints and resets a receipt, with and without a discount", async () => {
    const user = userEvent.setup();
    const onPrint = vi.fn();
    const onReset = vi.fn().mockResolvedValue(undefined);
    const discountedReceipt = { ...receipt, discountCents: 50, totalCents: receipt.totalCents - 50 };
    const { rerender } = render(
      <ReceiptPanel model={model} receipt={discountedReceipt} busy={false} onPrint={onPrint} onReset={onReset} />,
    );

    expect(screen.getByRole("heading", { name: copy(model, "receiptTitle") })).toBeVisible();
    expect(screen.getByText("-$0.50")).toBeVisible();
    await user.click(screen.getByRole("button", { name: copy(model, "printReceipt") }));
    await user.click(screen.getByRole("button", { name: copy(model, "newCheckout") }));
    expect(onPrint).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();

    rerender(<ReceiptPanel model={model} receipt={receipt} busy={false} onPrint={onPrint} onReset={onReset} />);
    expect(screen.queryByText("-$0.50")).not.toBeInTheDocument();
    const cashReceipt = { ...receipt, tenderMethod: "cash" } as const;
    rerender(<ReceiptPanel model={model} receipt={cashReceipt} busy={false} onPrint={onPrint} onReset={onReset} />);
    expect(screen.getByText(/Cash simulation/)).toBeVisible();
  });

  it("disables receipt actions while the checkout is busy", () => {
    render(<ReceiptPanel model={model} receipt={receipt} busy onPrint={vi.fn()} onReset={noop} />);
    expect(screen.getByRole("button", { name: copy(model, "newCheckout") })).toBeDisabled();
  });

  it("renders the header connection, theme, and model-backed identity", async () => {
    const user = userEvent.setup();
    const onToggleTheme = vi.fn();
    const { rerender } = render(<KioskHeader model={model} connected theme="light" onToggleTheme={onToggleTheme} />);
    expect(screen.getByRole("link", { name: model.data.app.name })).toBeVisible();
    expect(screen.getByText(copy(model, "serviceConnected"))).toBeVisible();
    await user.click(screen.getByRole("button", { name: copy(model, "themeToggle") }));
    expect(onToggleTheme).toHaveBeenCalledOnce();

    rerender(<KioskHeader model={model} connected={false} theme="dark" onToggleTheme={onToggleTheme} />);
    expect(screen.getByText(copy(model, "serviceUnavailable"))).toBeVisible();
  });

  it("renders checkout state and switches the visible workspace panel", () => {
    const callbacks = {
      onScan: vi.fn().mockResolvedValue(undefined),
      onQuantity: vi.fn().mockResolvedValue(undefined),
      onCoupon: vi.fn().mockResolvedValue(undefined),
      onCheckout: vi.fn().mockResolvedValue(undefined),
      onWeigh: vi.fn().mockResolvedValue(undefined),
      onIntervention: vi.fn().mockResolvedValue(undefined),
      onTender: vi.fn().mockResolvedValue(undefined),
      onReceipt: vi.fn().mockResolvedValue(undefined),
    };
    const { rerender } = render(
      <KioskWorkspace model={model} catalog={catalog} session={emptySession} busy={false} {...callbacks} />,
    );
    expect(screen.getByRole("main")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByText(copy(model, "stateScanning"))).toBeVisible();

    rerender(<KioskWorkspace model={model} catalog={catalog} session={readySession} busy {...callbacks} />);
    expect(screen.getByRole("heading", { name: copy(model, "paymentTitle") })).toBeVisible();
    expect(screen.getByText(copy(model, "stateReadyToPay"))).toBeVisible();

    rerender(
      <KioskWorkspace
        model={model}
        catalog={catalog}
        session={weightCheckSession("attention_required")}
        busy={false}
        {...callbacks}
      />,
    );
    expect(screen.getByRole("heading", { name: copy(model, "attendantTitle") })).toBeVisible();
  });
});
