import { Banknote, CreditCard, Printer, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { copy, formatMoney } from "../lib/format";
import type { CheckoutSession, PublicModel, SimulationOutcome, TenderMethod } from "../lib/types";

export function PaymentPanel({
  model,
  session,
  busy,
  onTender,
  onReceipt,
}: {
  model: PublicModel;
  session: CheckoutSession;
  busy: boolean;
  onTender: (method: TenderMethod, outcome: SimulationOutcome) => Promise<void>;
  onReceipt: () => Promise<void>;
}) {
  const [method, setMethod] = useState<TenderMethod>("simulated_card");
  const [outcome, setOutcome] = useState<SimulationOutcome>("approve");

  return (
    <section className="payment-panel" aria-labelledby="payment-heading">
      <div className="section-heading">
        <div>
          <span className="section-kicker">{copy(model, "payStage")}</span>
          <h2 id="payment-heading">{copy(model, "paymentTitle")}</h2>
        </div>
        <ShieldCheck size={21} aria-hidden="true" />
      </div>
      <div className="payment-total">
        <span>{copy(model, "total")}</span>
        <strong>{formatMoney(model, session.totalCents)}</strong>
      </div>
      {session.latestTender?.outcome === "decline" ? (
        <p className="payment-declined" role="alert">
          {copy(model, "paymentDeclined")}
        </p>
      ) : null}
      {session.state === "paid" ? (
        <div className="payment-approved" role="status">
          <CheckCircleIcon label={copy(model, "approvedMark")} />
          <span>{copy(model, "paymentApproved")}</span>
          <button className="button button-primary" type="button" disabled={busy} onClick={() => void onReceipt()}>
            <Printer size={16} aria-hidden="true" />
            {copy(model, "issueReceipt")}
          </button>
        </div>
      ) : (
        <>
          <fieldset className="payment-options">
            <legend>{copy(model, "tenderMethod")}</legend>
            <label className={method === "simulated_card" ? "payment-option is-selected" : "payment-option"}>
              <input
                type="radio"
                name="tender-method"
                value="simulated_card"
                checked={method === "simulated_card"}
                onChange={() => setMethod("simulated_card")}
              />
              <CreditCard size={18} aria-hidden="true" />
              <span>{copy(model, "cardSimulation")}</span>
            </label>
            <label className={method === "cash" ? "payment-option is-selected" : "payment-option"}>
              <input
                type="radio"
                name="tender-method"
                value="cash"
                checked={method === "cash"}
                onChange={() => setMethod("cash")}
              />
              <Banknote size={18} aria-hidden="true" />
              <span>{copy(model, "cashSimulation")}</span>
            </label>
          </fieldset>
          <fieldset className="simulation-outcomes">
            <legend>{copy(model, "simulationOutcome")}</legend>
            <label>
              <input
                type="radio"
                name="simulation-outcome"
                value="approve"
                checked={outcome === "approve"}
                onChange={() => setOutcome("approve")}
              />
              {copy(model, "approveSimulation")}
            </label>
            <label>
              <input
                type="radio"
                name="simulation-outcome"
                value="decline"
                checked={outcome === "decline"}
                onChange={() => setOutcome("decline")}
              />
              {copy(model, "declineSimulation")}
            </label>
          </fieldset>
          <p className="payment-disclaimer">{copy(model, "paymentDisclaimer")}</p>
          <button
            className="button button-primary payment-submit"
            type="button"
            disabled={busy}
            onClick={() => void onTender(method, outcome)}
          >
            <ShieldCheck size={17} aria-hidden="true" />
            {copy(model, "runPayment")}
          </button>
        </>
      )}
    </section>
  );
}

function CheckCircleIcon({ label }: { label: string }) {
  return (
    <span className="payment-success-mark" aria-hidden="true">
      {label}
    </span>
  );
}
