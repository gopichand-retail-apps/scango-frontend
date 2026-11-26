import { Clock } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { copy } from "../lib/format";
import type { PublicModel } from "../lib/types";

export function IdleWarning({
  model,
  secondsLeft,
  busy,
  onExtend,
  onEnd,
}: {
  model: PublicModel;
  secondsLeft: number;
  busy: boolean;
  onExtend: () => Promise<void>;
  onEnd: () => Promise<void>;
}) {
  const extendRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    extendRef.current?.focus();
  }, []);

  // Keep Tab inside the two choices while the dialog is open.
  function trapFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const leaving = event.shiftKey ? extendRef.current : endRef.current;
    if (document.activeElement !== leaving) return;
    event.preventDefault();
    (event.shiftKey ? endRef.current : extendRef.current)?.focus();
  }

  const announcement =
    secondsLeft > 0 && secondsLeft % 10 === 0 ? `${secondsLeft} ${copy(model, "sessionSecondsLeft")}` : "";

  return (
    <div className="idle-backdrop">
      <section
        className="idle-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idle-title"
        aria-describedby="idle-description"
        onKeyDown={trapFocus}
      >
        <span className="idle-icon">
          <Clock size={22} aria-hidden="true" />
        </span>
        <h2 id="idle-title">{copy(model, "sessionIdleTitle")}</h2>
        <p id="idle-description">{copy(model, "sessionIdleDescription")}</p>
        <p className="idle-countdown" aria-hidden="true">
          <strong>{secondsLeft}</strong>
          <span>{copy(model, "sessionSecondsLeft")}</span>
        </p>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
        <div className="idle-actions">
          <button
            ref={extendRef}
            className="button button-primary"
            type="button"
            disabled={busy}
            onClick={() => void onExtend()}
          >
            {copy(model, "sessionExtend")}
          </button>
          <button
            ref={endRef}
            className="button button-secondary"
            type="button"
            disabled={busy}
            onClick={() => void onEnd()}
          >
            {copy(model, "sessionEndNow")}
          </button>
        </div>
      </section>
    </div>
  );
}
