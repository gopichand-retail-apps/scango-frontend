import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  adjustQuantity,
  applyCoupon,
  checkWeight,
  extendSession,
  getCatalog,
  getSession,
  isRetryableFailure,
  issueReceipt,
  loadModel,
  prepareCheckout,
  resetSession,
  scanItem,
  simulateTender,
  startSession,
} from "./api";
import { clearCredentials } from "./credentials";
import { copy } from "./format";
import { createIntentKeys } from "./intent-keys";
import { useIdleSession } from "./useIdleSession";
import type {
  Catalog,
  CheckoutSession,
  PublicModel,
  Receipt,
  SimulationOutcome,
  TenderMethod,
  ThemeMode,
} from "./types";

interface CheckoutState {
  model: PublicModel | null;
  catalog: Catalog | null;
  session: CheckoutSession | null;
  receipt: Receipt | null;
  theme: ThemeMode | null;
  error: string | null;
  busy: boolean;
  deadline: number | null;
  awaiting: AwaitingIntent | null;
  welcomeFocus: boolean;
}

export interface AwaitingIntent {
  kind: string;
  retry: () => Promise<void>;
}

interface Intent {
  kind: string;
  payload: Record<string, unknown>;
}

const initialState: CheckoutState = {
  model: null,
  catalog: null,
  session: null,
  receipt: null,
  theme: null,
  error: null,
  busy: false,
  deadline: null,
  awaiting: null,
  welcomeFocus: false,
};

const terminalStates = new Set(["reset", "expired"]);
const sessionGoneCodes = new Set(["SESSION_NOT_FOUND", "RECEIPT_NOT_FOUND", "SESSION_EXPIRED"]);

// Pairs a server session with the monotonic deadline of its idle window.
// Computed in event handlers, never during render.
function withDeadline(session: CheckoutSession | null): Pick<CheckoutState, "session" | "deadline"> {
  if (session === null || session.expiresInSeconds === null || terminalStates.has(session.state)) {
    return { session, deadline: null };
  }
  return { session, deadline: performance.now() + session.expiresInSeconds * 1000 };
}

export function useCheckout() {
  const [state, setState] = useState(initialState);
  const [bootRevision, setBootRevision] = useState(0);
  const [keys] = useState(() => createIntentKeys());
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void loadModel(controller.signal)
      .then(async (model) => {
        if (controller.signal.aborted) return;
        document.documentElement.lang = model.locale;
        document.title = model.data.app.name;
        const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
        if (!description) throw new Error("The page description metadata is unavailable.");
        description.content = model.data.app.description;
        const savedTheme = window.localStorage.getItem(model.data.app.themeStorageKey);
        const theme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : model.data.app.defaultTheme;
        setState((current) => ({ ...current, model, theme, error: null }));
        const catalog = await getCatalog(model, controller.signal);
        if (!controller.signal.aborted) {
          setState((current) => ({ ...current, catalog, error: null }));
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState((current) => ({
            ...current,
            error: error instanceof Error ? error.message : "The kiosk could not start.",
          }));
        }
      });
    return () => controller.abort();
  }, [bootRevision]);

  function endSession(error: string | null) {
    clearCredentials();
    keys.clear();
    setState((current) => ({
      ...current,
      session: null,
      receipt: null,
      deadline: null,
      awaiting: null,
      welcomeFocus: true,
      error,
    }));
  }

  function reportFailure(error: unknown) {
    if (error instanceof ApiError && sessionGoneCodes.has(error.code)) {
      endSession(error.message);
      return;
    }
    const message =
      error instanceof ApiError
        ? error.message
        : state.model
          ? copy(state.model, "errorGeneric")
          : "The kiosk action failed.";
    setState((current) => ({ ...current, error: message }));
  }

  // One write at a time. The intent key survives an unknown outcome (network error, timeout, 5xx), so the
  // retry offered by the awaiting-confirmation panel replays rather than repeats. A definite answer discards it.
  async function perform(intent: Intent | null, action: (key: string) => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    const key = intent ? keys.keyFor(intent.kind, intent.payload) : "";
    setState((current) => ({ ...current, busy: true, error: null, awaiting: null }));
    try {
      await action(key);
      if (intent) keys.confirm(intent.kind);
    } catch (error) {
      if (intent && isRetryableFailure(error)) {
        const retry = () => perform(intent, action);
        setState((current) => ({ ...current, awaiting: { kind: intent.kind, retry } }));
      } else {
        if (intent) keys.confirm(intent.kind);
        reportFailure(error);
      }
    } finally {
      inFlight.current = false;
      setState((current) => ({ ...current, busy: false }));
    }
  }

  async function sessionWrite(
    kind: string,
    payload: Record<string, unknown>,
    call: (model: PublicModel, sessionId: string, key: string) => Promise<CheckoutSession>,
  ) {
    const { model, session } = state;
    if (!model || !session) return;
    await perform({ kind, payload: { ...payload, sessionId: session.id } }, async (key) => {
      const update = withDeadline(await call(model, session.id, key));
      setState((current) => ({ ...current, ...update }));
    });
  }

  async function start() {
    const model = state.model;
    if (!model) return;
    await perform({ kind: "start", payload: {} }, async (key) => {
      const update = withDeadline(await startSession(model, key));
      setState((current) => ({ ...current, ...update, receipt: null, welcomeFocus: false }));
    });
  }

  const scan = (barcode: string, source: "barcode" | "search") =>
    sessionWrite("scan", { barcode, source }, (model, id, key) => scanItem(model, id, barcode, source, key));
  const quantity = (productId: string, delta: number) =>
    sessionWrite("quantity", { productId, delta }, (model, id, key) =>
      adjustQuantity(model, id, productId, delta, key),
    );
  const coupon = (code: string) =>
    sessionWrite("coupon", { code }, (model, id, key) => applyCoupon(model, id, code, key));
  const weigh = (grams: number) =>
    sessionWrite("weigh", { grams }, (model, id, key) => checkWeight(model, id, grams, key));
  const checkout = () => sessionWrite("checkout", {}, (model, id, key) => prepareCheckout(model, id, key));
  const extend = () => sessionWrite("extend", {}, (model, id, key) => extendSession(model, id, key));
  const tender = (method: TenderMethod, outcome: SimulationOutcome) =>
    sessionWrite("tender", { method, outcome }, async (model, id, key) => {
      const result = await simulateTender(model, id, method, outcome, key);
      return result.session;
    });

  async function issueReceiptAction() {
    const { model, session } = state;
    if (!model || !session) return;
    await perform({ kind: "receipt", payload: { sessionId: session.id } }, async (key) => {
      const nextReceipt = await issueReceipt(model, session.id, key);
      const update = withDeadline(await getSession(model, session.id));
      setState((current) => ({ ...current, ...update, receipt: nextReceipt }));
    });
  }

  async function reset() {
    const { model, session } = state;
    if (!model || !session) return;
    await perform({ kind: "reset", payload: { sessionId: session.id } }, async (key) => {
      await resetSession(model, session.id, key);
      endSession(null);
    });
  }

  // Idle expiry clears the visible session locally; the server keeps the audited outcome.
  const expire = useCallback(() => {
    clearCredentials();
    keys.clear();
    setState((current) => ({
      ...current,
      session: null,
      receipt: null,
      deadline: null,
      awaiting: null,
      welcomeFocus: true,
      error: current.model ? copy(current.model, "sessionTimedOut") : null,
    }));
  }, [keys]);

  // While an attendant is needed, check for their decision every 3 s while the kiosk is visible.
  // A failed poll keeps the last confirmed basket; a vanished or expired session returns to the welcome screen.
  const pollModel = state.model;
  const pollSessionId = state.session?.state === "attention_required" ? state.session.id : null;
  useEffect(() => {
    if (!pollModel || !pollSessionId) return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      getSession(pollModel, pollSessionId).then(
        (next) => {
          const update = withDeadline(next);
          setState((current) => (current.session?.id === pollSessionId ? { ...current, ...update } : current));
        },
        (error: unknown) => {
          if (!(error instanceof ApiError) || !sessionGoneCodes.has(error.code)) return;
          clearCredentials();
          keys.clear();
          setState((current) => ({ ...current, session: null, receipt: null, deadline: null, error: error.message }));
        },
      );
    }, 3000);
    return () => window.clearInterval(timer);
  }, [pollModel, pollSessionId, keys]);

  const { deadline, ...view } = state;
  const idle = useIdleSession({
    deadline,
    warningSeconds: state.model?.data.app.sessionWarningSeconds ?? 0,
    onExpire: expire,
  });

  async function retry() {
    const { model, session } = state;
    if (!model || !session) {
      setBootRevision((revision) => revision + 1);
      setState((current) => ({ ...current, error: null }));
      return;
    }
    await perform(null, async () => {
      const update = withDeadline(await getSession(model, session.id));
      setState((current) => ({ ...current, ...update }));
    });
  }

  function setTheme(theme: ThemeMode) {
    const model = state.model;
    if (!model) return;
    window.localStorage.setItem(model.data.app.themeStorageKey, theme);
    setState((current) => ({ ...current, theme }));
  }

  function dismissError() {
    setState((current) => ({ ...current, error: null }));
  }

  return {
    ...view,
    idle,
    extend,
    start,
    scan,
    quantity,
    coupon,
    weigh,
    checkout,
    tender,
    issueReceipt: issueReceiptAction,
    reset,
    retry,
    setTheme,
    dismissError,
  };
}
