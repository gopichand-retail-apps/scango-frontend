import { useEffect, useRef, useState } from "react";

export type IdleStatus =
  { phase: "inactive"; secondsLeft: null } | { phase: "active" | "warning"; secondsLeft: number };

interface IdleOptions {
  /** performance.now() timestamp when the server-issued idle window ends, or null without an open session. */
  deadline: number | null;
  warningSeconds: number;
  onExpire: () => void;
}

// Counts down on the monotonic clock so a wrong kiosk wall clock can neither end nor freeze a session.
export function useIdleSession({ deadline, warningSeconds, onExpire }: IdleOptions): IdleStatus {
  const [now, setNow] = useState(0);
  const expireRef = useRef(onExpire);

  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (deadline === null) return undefined;
    let fired = false;
    const tick = () => {
      const current = performance.now();
      setNow(current);
      if (!fired && current >= deadline) {
        fired = true;
        expireRef.current();
      }
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [deadline]);

  if (deadline === null) return { phase: "inactive", secondsLeft: null };
  const secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
  return { phase: secondsLeft <= warningSeconds ? "warning" : "active", secondsLeft };
}
