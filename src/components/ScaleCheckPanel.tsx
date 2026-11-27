import { AlertTriangle, Check, Scale } from "lucide-react";
import { useState, type FormEvent } from "react";
import { copy, formatNumber } from "../lib/format";
import type { CheckoutSession, PublicModel } from "../lib/types";

export function ScaleCheckPanel({
  model,
  session,
  busy,
  onWeigh,
}: {
  model: PublicModel;
  session: CheckoutSession;
  busy: boolean;
  onWeigh: (grams: number) => Promise<void>;
}) {
  const item = session.pendingWeight;
  const [reading, setReading] = useState(item?.expectedWeightGrams ?? 0);

  function submitWeight(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!Number.isInteger(reading)) return;
    void onWeigh(reading);
  }

  if (!item) {
    return (
      <p className="inline-error" role="alert">
        {copy(model, "weightMismatch")}
      </p>
    );
  }

  return (
    <section
      className={session.state === "attention_required" ? "scale-panel is-attention" : "scale-panel"}
      aria-labelledby="scale-heading"
    >
      <div className="scale-panel-icon">
        {session.state === "attention_required" ? (
          <AlertTriangle size={20} aria-hidden="true" />
        ) : (
          <Scale size={20} aria-hidden="true" />
        )}
      </div>
      <div className="scale-panel-copy">
        <span className="section-kicker">{copy(model, "roleAttendant")}</span>
        <h2 id="scale-heading">
          {copy(model, session.state === "attention_required" ? "attendantCalledTitle" : "weightCheckTitle")}
        </h2>
        <p>{item.name}</p>
        {session.state === "weight_check_pending" ? (
          <form className="scale-form" onSubmit={submitWeight}>
            <label>
              <span>{copy(model, "weightExpected")}</span>
              <strong>{formatNumber(model, item.expectedWeightGrams)} g</strong>
            </label>
            <label htmlFor="simulated-scale-reading">
              <span>{copy(model, "weightMeasured")}</span>
              <input
                id="simulated-scale-reading"
                type="number"
                min={model.data.app.scaleMinimumGrams}
                max={model.data.app.scaleMaximumGrams}
                step={1}
                value={reading}
                onChange={(event) => setReading(Number(event.target.value))}
                required
              />
            </label>
            <button className="button button-primary" type="submit" disabled={busy}>
              <Check size={16} aria-hidden="true" />
              {copy(model, "confirmWeight")}
            </button>
          </form>
        ) : (
          <p className="attendant-waiting" role="status">
            {copy(model, "attendantCalledDescription")}
          </p>
        )}
      </div>
    </section>
  );
}
