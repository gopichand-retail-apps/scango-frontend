import { AlertCircle, X } from "lucide-react";
import "./App.css";
import "./styles/kiosk-layout.css";
import "./styles/kiosk-controls.css";
import "./styles/session-dialog.css";
import "./styles/receipt-print.css";
import { KioskHeader } from "./components/KioskHeader";
import { AwaitingConfirmation } from "./components/AwaitingConfirmation";
import { IdleWarning } from "./components/IdleWarning";
import { KioskWorkspace } from "./components/KioskWorkspace";
import { ReceiptPanel } from "./components/ReceiptPanel";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { isMock } from "./config";
import { copy } from "./lib/format";
import type { PublicModel } from "./lib/types";
import { useCheckout } from "./lib/useCheckout";

function BootState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <main className="boot-state" role={error ? "alert" : "status"}>
      {error ? (
        <div className="boot-error">
          <AlertCircle size={22} aria-hidden="true" />
          <p>{error}</p>
          <button className="button button-primary" type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : (
        <span className="loading-spinner" aria-hidden="true" />
      )}
    </main>
  );
}

type Kiosk = ReturnType<typeof useCheckout>;

// Everything layered over the current screen: unconfirmed step, idle warning and the dismissible alert.
function SessionOverlays({ model, kiosk }: { model: PublicModel; kiosk: Kiosk }) {
  return (
    <>
      {kiosk.awaiting ? <AwaitingConfirmation model={model} busy={kiosk.busy} onRetry={kiosk.awaiting.retry} /> : null}
      {kiosk.idle.phase === "warning" ? (
        <IdleWarning
          model={model}
          secondsLeft={kiosk.idle.secondsLeft}
          busy={kiosk.busy}
          onExtend={kiosk.extend}
          onEnd={kiosk.reset}
        />
      ) : null}
      {kiosk.error ? (
        <div className="kiosk-alert" role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <p>{kiosk.error}</p>
          <button
            className="icon-button"
            type="button"
            aria-label={copy(model, "retry")}
            onClick={() => void kiosk.retry()}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}

export default function App() {
  const kiosk = useCheckout();
  const model = kiosk.model;

  if (!model) {
    return <BootState error={kiosk.error} onRetry={() => void kiosk.retry()} />;
  }

  const theme = kiosk.theme ?? model.data.app.defaultTheme;
  // While a step is unconfirmed, every other write waits behind the awaiting-confirmation retry.
  const locked = kiosk.busy || kiosk.awaiting !== null;
  // Print rules key off this attribute so only the receipt screen prints receipt-only.
  const receiptShown = kiosk.session?.state === "receipt_issued" && kiosk.receipt !== null;
  const content = !kiosk.catalog ? (
    <main className="service-error" role="alert">
      <AlertCircle size={22} aria-hidden="true" />
      <p>{kiosk.error ?? copy(model, "serviceUnavailable")}</p>
      <button className="button button-primary" type="button" onClick={() => void kiosk.retry()}>
        {copy(model, "retry")}
      </button>
    </main>
  ) : !kiosk.session ? (
    <WelcomeScreen
      model={model}
      products={kiosk.catalog.products}
      busy={locked}
      focusStart={kiosk.welcomeFocus}
      onStart={() => void kiosk.start()}
    />
  ) : kiosk.session.state === "receipt_issued" && kiosk.receipt ? (
    <ReceiptPanel
      model={model}
      receipt={kiosk.receipt}
      busy={locked}
      onPrint={() => window.print()}
      onReset={kiosk.reset}
    />
  ) : (
    <KioskWorkspace
      model={model}
      catalog={kiosk.catalog}
      session={kiosk.session}
      busy={locked}
      onScan={kiosk.scan}
      onQuantity={kiosk.quantity}
      onCoupon={kiosk.coupon}
      onCheckout={kiosk.checkout}
      onWeigh={kiosk.weigh}
      onTender={kiosk.tender}
      onReceipt={kiosk.issueReceipt}
    />
  );

  return (
    <div
      className="scango-shell"
      data-theme={theme}
      data-mode={isMock ? "mock" : "live"}
      data-screen={receiptShown ? "receipt" : undefined}
    >
      <KioskHeader
        model={model}
        connected={kiosk.catalog !== null}
        theme={theme}
        onToggleTheme={() => kiosk.setTheme(theme === "light" ? "dark" : "light")}
      />
      {content}
      <SessionOverlays model={model} kiosk={kiosk} />
    </div>
  );
}
