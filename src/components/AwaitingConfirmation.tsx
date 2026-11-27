import { RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { copy } from "../lib/format";
import type { PublicModel } from "../lib/types";

// Shown when a write may have succeeded but its reply was lost. Retrying reuses the same intent key,
// so the server replays the stored result instead of acting twice.
export function AwaitingConfirmation({
  model,
  busy,
  onRetry,
}: {
  model: PublicModel;
  busy: boolean;
  onRetry: () => Promise<void>;
}) {
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    retryRef.current?.focus();
  }, []);

  return (
    <section className="awaiting-panel" role="status">
      <div>
        <strong>{copy(model, "awaitingConfirmationTitle")}</strong>
        <p>{copy(model, "awaitingConfirmationDescription")}</p>
      </div>
      <button
        ref={retryRef}
        className="button button-primary"
        type="button"
        disabled={busy}
        onClick={() => void onRetry()}
      >
        <RefreshCw size={16} aria-hidden="true" />
        {copy(model, "retryConfirmation")}
      </button>
    </section>
  );
}
