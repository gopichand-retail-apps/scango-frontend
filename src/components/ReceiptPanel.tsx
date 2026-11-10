import { ArrowLeft, Printer, ScanLine } from "lucide-react";
import { copy, formatDate, formatMoney } from "../lib/format";
import type { PublicModel, Receipt } from "../lib/types";

export function ReceiptPanel({
  model,
  receipt,
  busy,
  onPrint,
  onReset,
}: {
  model: PublicModel;
  receipt: Receipt;
  busy: boolean;
  onPrint: () => void;
  onReset: () => Promise<void>;
}) {
  return (
    <main className="receipt-screen">
      <section className="receipt-card" aria-labelledby="receipt-heading">
        <div className="receipt-success">
          <span className="receipt-mark">
            <ScanLine size={21} aria-hidden="true" />
          </span>
          <span className="section-kicker">{copy(model, "receiptStage")}</span>
          <h1 id="receipt-heading">{copy(model, "receiptTitle")}</h1>
          <p>{copy(model, "receiptDescription")}</p>
        </div>
        <div className="receipt-meta">
          <div>
            <span>{copy(model, "receiptNumber")}</span>
            <strong>{receipt.receiptNumber}</strong>
          </div>
          <div>
            <span>{copy(model, "issuedAt")}</span>
            <strong>{formatDate(model, receipt.issuedAt)}</strong>
          </div>
        </div>
        <div className="receipt-lines">
          {receipt.items.map((item) => (
            <div className="receipt-line" key={item.productId}>
              <span>
                {item.quantity} x {item.name}
              </span>
              <strong>{formatMoney(model, item.lineTotalCents)}</strong>
            </div>
          ))}
        </div>
        <dl className="receipt-totals">
          <div>
            <dt>{copy(model, "subtotal")}</dt>
            <dd>{formatMoney(model, receipt.subtotalCents)}</dd>
          </div>
          {receipt.discountCents > 0 ? (
            <div>
              <dt>{copy(model, "discount")}</dt>
              <dd>-{formatMoney(model, receipt.discountCents)}</dd>
            </div>
          ) : null}
          <div>
            <dt>{copy(model, "estimatedTax")}</dt>
            <dd>{formatMoney(model, receipt.taxCents)}</dd>
          </div>
          <div className="total-row">
            <dt>{copy(model, "total")}</dt>
            <dd>{formatMoney(model, receipt.totalCents)}</dd>
          </div>
        </dl>
        <p className="receipt-tender">
          {copy(model, "tenderMethod")}:{" "}
          {copy(model, receipt.tenderMethod === "cash" ? "cashSimulation" : "cardSimulation")}
        </p>
        <div className="receipt-actions">
          <button className="button button-secondary" type="button" onClick={onPrint}>
            <Printer size={16} aria-hidden="true" />
            {copy(model, "printReceipt")}
          </button>
          <button className="button button-primary" type="button" disabled={busy} onClick={() => void onReset()}>
            <ArrowLeft size={16} aria-hidden="true" />
            {copy(model, "newCheckout")}
          </button>
        </div>
      </section>
    </main>
  );
}
