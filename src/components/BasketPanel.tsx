import { Minus, Plus, Tag, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { copy, formatMoney, nestedCopy } from "../lib/format";
import type { CheckoutSession, PublicModel } from "../lib/types";

interface BasketPanelProps {
  model: PublicModel;
  session: CheckoutSession;
  editable: boolean;
  busy: boolean;
  onQuantity: (productId: string, delta: number) => Promise<void>;
  onCoupon: (code: string) => Promise<void>;
  onCheckout: () => Promise<void>;
}

export function BasketPanel({ model, session, editable, busy, onQuantity, onCoupon, onCheckout }: BasketPanelProps) {
  const [couponCode, setCouponCode] = useState("");

  function submitCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onCoupon(couponCode.trim());
  }

  return (
    <aside className="basket-panel" aria-labelledby="basket-heading">
      <div className="section-heading basket-heading">
        <div>
          <span className="section-kicker">{copy(model, "reviewStage")}</span>
          <h2 id="basket-heading">{copy(model, "basketHeading")}</h2>
        </div>
        <span className="basket-count">
          {session.items.reduce((total, item) => total + item.quantity, 0)} {copy(model, "itemCount")}
        </span>
      </div>
      {session.items.length ? (
        <div className="basket-lines">
          {session.items.map((item) => (
            <article className="basket-line" key={item.productId}>
              <img src={item.image} alt="" />
              <div className="basket-line-main">
                <strong>{item.name}</strong>
                <small>
                  {formatMoney(model, item.unitPriceCents)} / {nestedCopy(model, "frequencies", item.unitKey)}
                </small>
                <div className="quantity-control" aria-label={`${copy(model, "quantity")}: ${item.name}`}>
                  <button
                    className="icon-button quantity-button"
                    type="button"
                    aria-label={`${copy(model, "decreaseQuantity")}: ${item.name}`}
                    title={copy(model, "decreaseQuantity")}
                    disabled={!editable || busy}
                    onClick={() => void onQuantity(item.productId, -1)}
                  >
                    <Minus size={14} aria-hidden="true" />
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    className="icon-button quantity-button"
                    type="button"
                    aria-label={`${copy(model, "increaseQuantity")}: ${item.name}`}
                    title={copy(model, "increaseQuantity")}
                    disabled={!editable || busy}
                    onClick={() => void onQuantity(item.productId, 1)}
                  >
                    <Plus size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="basket-line-end">
                <strong>{formatMoney(model, item.lineTotalCents)}</strong>
                <button
                  className="icon-button remove-button"
                  type="button"
                  aria-label={`${copy(model, "removeItem")}: ${item.name}`}
                  title={copy(model, "removeItem")}
                  disabled={!editable || busy}
                  onClick={() => void onQuantity(item.productId, -item.quantity)}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="basket-empty">
          <span className="basket-empty-mark">
            <Tag size={18} aria-hidden="true" />
          </span>
          <p>{copy(model, "emptyBasket")}</p>
        </div>
      )}
      <form className="coupon-form" onSubmit={submitCoupon}>
        <label htmlFor="scan-go-coupon">{copy(model, "couponLabel")}</label>
        <div className="coupon-input-row">
          <input
            id="scan-go-coupon"
            autoCapitalize="characters"
            value={couponCode}
            onChange={(event) => setCouponCode(event.target.value)}
            placeholder={copy(model, "couponPlaceholder")}
            maxLength={40}
            disabled={!editable || busy}
          />
          {session.couponCode ? (
            <button
              className="button button-secondary"
              type="button"
              disabled={!editable || busy}
              onClick={() => {
                setCouponCode("");
                void onCoupon("");
              }}
            >
              {copy(model, "couponRemoved")}
            </button>
          ) : (
            <button
              className="button button-secondary"
              type="submit"
              disabled={!editable || busy || !couponCode.trim()}
            >
              <Tag size={15} aria-hidden="true" />
              {copy(model, "applyCoupon")}
            </button>
          )}
        </div>
        {session.couponCode ? (
          <p className="coupon-applied" role="status">
            {session.couponCode} · {copy(model, "couponApplied")}
          </p>
        ) : null}
      </form>
      <dl className="checkout-totals">
        <div>
          <dt>{copy(model, "subtotal")}</dt>
          <dd>{formatMoney(model, session.subtotalCents)}</dd>
        </div>
        {session.discountCents > 0 ? (
          <div className="discount-row">
            <dt>{copy(model, "discount")}</dt>
            <dd>-{formatMoney(model, session.discountCents)}</dd>
          </div>
        ) : null}
        <div>
          <dt>{copy(model, "estimatedTax")}</dt>
          <dd>{formatMoney(model, session.taxCents)}</dd>
        </div>
        <div className="total-row">
          <dt>{copy(model, "total")}</dt>
          <dd>{formatMoney(model, session.totalCents)}</dd>
        </div>
      </dl>
      <p className="totals-note">{copy(model, "checkoutDisclaimer")}</p>
      {editable ? (
        <button
          className="button button-primary checkout-button"
          type="button"
          disabled={busy || !session.items.length || session.state !== "scanning"}
          onClick={() => void onCheckout()}
        >
          {copy(model, "checkout")}
        </button>
      ) : null}
    </aside>
  );
}
