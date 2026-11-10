import { Check, Circle, ScanLine } from "lucide-react";
import { copy } from "../lib/format";
import type { Catalog, CheckoutSession, PublicModel, SimulationOutcome, TenderMethod } from "../lib/types";

const stateCopyKeys: Record<CheckoutSession["state"], string> = {
  scanning: "stateScanning",
  weight_check_pending: "stateWeightCheckPending",
  attention_required: "stateAttentionRequired",
  ready_to_pay: "stateReadyToPay",
  paid: "statePaid",
  receipt_issued: "stateReceiptIssued",
  reset: "stateReset",
};
import { BasketPanel } from "./BasketPanel";
import { CatalogPanel } from "./CatalogPanel";
import { PaymentPanel } from "./PaymentPanel";
import { ScaleCheckPanel } from "./ScaleCheckPanel";

interface KioskWorkspaceProps {
  model: PublicModel;
  catalog: Catalog;
  session: CheckoutSession;
  busy: boolean;
  onScan: (barcode: string, source: "barcode" | "search") => Promise<void>;
  onQuantity: (productId: string, delta: number) => Promise<void>;
  onCoupon: (code: string) => Promise<void>;
  onCheckout: () => Promise<void>;
  onWeigh: (grams: number) => Promise<void>;
  onIntervention: (action: "approve_weight" | "remove_item") => Promise<void>;
  onTender: (method: TenderMethod, outcome: SimulationOutcome) => Promise<void>;
  onReceipt: () => Promise<void>;
}

function activeStage(session: CheckoutSession): number {
  if (session.state === "ready_to_pay") return 3;
  if (session.state === "paid") return 4;
  return 1;
}

export function KioskWorkspace(props: KioskWorkspaceProps) {
  const currentStage = activeStage(props.session);
  const steps = [
    copy(props.model, "scanStage"),
    copy(props.model, "reviewStage"),
    copy(props.model, "payStage"),
    copy(props.model, "receiptStage"),
  ];
  return (
    <main className="workspace-main" aria-busy={props.busy}>
      <div className="workspace-heading">
        <div>
          <span className="section-kicker">{copy(props.model, "sessionLabel")}</span>
          <h1>{copy(props.model, "catalogHeading")}</h1>
        </div>
        <span className="session-state">
          <ScanLine size={15} aria-hidden="true" />
          {copy(props.model, stateCopyKeys[props.session.state])}
        </span>
      </div>
      <ol className="checkout-steps" aria-label={copy(props.model, "sessionReady")}>
        {steps.map((step, index) => (
          <li
            className={index + 1 === currentStage ? "is-active" : index + 1 < currentStage ? "is-done" : ""}
            aria-current={index + 1 === currentStage ? "step" : undefined}
            key={step}
          >
            <span className="step-marker">
              {index + 1 < currentStage ? (
                <Check size={13} aria-hidden="true" />
              ) : (
                <Circle size={8} fill="currentColor" aria-hidden="true" />
              )}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div className="kiosk-columns">
        <CatalogPanel
          model={props.model}
          catalog={props.catalog}
          disabled={props.session.state !== "scanning"}
          busy={props.busy}
          onScan={props.onScan}
        />
        <div className="checkout-column">
          <BasketPanel
            model={props.model}
            session={props.session}
            editable={props.session.state === "scanning"}
            busy={props.busy}
            onQuantity={props.onQuantity}
            onCoupon={props.onCoupon}
            onCheckout={props.onCheckout}
          />
          {props.session.state === "weight_check_pending" || props.session.state === "attention_required" ? (
            <ScaleCheckPanel
              key={props.session.pendingWeight?.productId ?? props.session.id}
              model={props.model}
              session={props.session}
              busy={props.busy}
              onWeigh={props.onWeigh}
              onIntervention={props.onIntervention}
            />
          ) : null}
          {props.session.state === "ready_to_pay" || props.session.state === "paid" ? (
            <PaymentPanel
              model={props.model}
              session={props.session}
              busy={props.busy}
              onTender={props.onTender}
              onReceipt={props.onReceipt}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
