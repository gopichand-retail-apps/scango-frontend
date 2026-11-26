import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  adjustQuantity,
  applyCoupon,
  checkWeight,
  extendSession,
  getCatalog,
  getSession,
  issueReceipt,
  loadModel,
  prepareCheckout,
  resetSession,
  resolveIntervention,
  scanItem,
  simulateTender,
  startSession,
} from "./api";
import { clearCredentials } from "./credentials";
import { copy } from "./format";
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
};

const terminalStates = new Set(["reset", "expired"]);
const sessionGoneCodes = new Set(["SESSION_NOT_FOUND", "RECEIPT_NOT_FOUND", "SESSION_EXPIRED"]);

// Pairs a server session with the monotonic deadline of its idle window.
// Computed in event handlers, never during render.
function withDeadline(session: CheckoutSession | null): Pick<CheckoutState, "session" | "deadline"> {
  const open = session !== null && session.expiresInSeconds !== null && !terminalStates.has(session.state);
  return { session, deadline: open ? performance.now() + (session.expiresInSeconds ?? 0) * 1000 : null };
}

export function useCheckout() {
  const [state, setState] = useState(initialState);
  const [bootRevision, setBootRevision] = useState(0);

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

  async function perform(action: () => Promise<void>) {
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      await action();
    } catch (error) {
      const sessionExpired = error instanceof ApiError && sessionGoneCodes.has(error.code);
      if (sessionExpired) clearCredentials();
      const message =
        error instanceof ApiError
          ? error.message
          : state.model
            ? copy(state.model, "errorGeneric")
            : "The kiosk action failed.";
      setState((current) => ({
        ...current,
        ...(sessionExpired ? { session: null, receipt: null, deadline: null } : {}),
        error: message,
      }));
    } finally {
      setState((current) => ({ ...current, busy: false }));
    }
  }

  async function start() {
    const model = state.model;
    if (!model) return;
    await perform(async () => {
      const update = withDeadline(await startSession(model, crypto.randomUUID()));
      setState((current) => ({ ...current, ...update, receipt: null }));
    });
  }

  async function scan(barcode: string, source: "barcode" | "search") {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextSession = await scanItem(model, session.id, barcode, source, crypto.randomUUID());
      const update = withDeadline(nextSession);
      setState((current) => ({ ...current, ...update }));
    });
  }

  async function quantity(productId: string, delta: number) {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextSession = await adjustQuantity(model, session.id, productId, delta, crypto.randomUUID());
      const update = withDeadline(nextSession);
      setState((current) => ({ ...current, ...update }));
    });
  }

  async function coupon(code: string) {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextSession = await applyCoupon(model, session.id, code, crypto.randomUUID());
      const update = withDeadline(nextSession);
      setState((current) => ({ ...current, ...update }));
    });
  }

  async function weigh(simulatedWeightGrams: number) {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextSession = await checkWeight(model, session.id, simulatedWeightGrams, crypto.randomUUID());
      const update = withDeadline(nextSession);
      setState((current) => ({ ...current, ...update }));
    });
  }

  async function intervene(action: "approve_weight" | "remove_item") {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextSession = await resolveIntervention(model, session.id, action, crypto.randomUUID());
      const update = withDeadline(nextSession);
      setState((current) => ({ ...current, ...update }));
    });
  }

  async function checkout() {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextSession = await prepareCheckout(model, session.id, crypto.randomUUID());
      const update = withDeadline(nextSession);
      setState((current) => ({ ...current, ...update }));
    });
  }

  async function tender(method: TenderMethod, outcome: SimulationOutcome) {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const result = await simulateTender(model, session.id, method, outcome, crypto.randomUUID());
      const update = withDeadline(result.session);
      setState((current) => ({ ...current, ...update }));
    });
  }

  async function issueReceiptAction() {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextReceipt = await issueReceipt(model, session.id, crypto.randomUUID());
      const nextSession = await getSession(model, session.id);
      const update = withDeadline(nextSession);
      setState((current) => ({ ...current, ...update, receipt: nextReceipt }));
    });
  }

  async function reset() {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      await resetSession(model, session.id, crypto.randomUUID());
      clearCredentials();
      setState((current) => ({ ...current, session: null, receipt: null, deadline: null }));
    });
  }

  async function extend() {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const update = withDeadline(await extendSession(model, session.id, crypto.randomUUID()));
      setState((current) => ({ ...current, ...update }));
    });
  }

  // Idle expiry clears the visible session locally; the server keeps the audited outcome.
  const expire = useCallback(() => {
    clearCredentials();
    setState((current) => ({
      ...current,
      session: null,
      receipt: null,
      deadline: null,
      error: current.model ? copy(current.model, "sessionTimedOut") : null,
    }));
  }, []);

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
    await perform(async () => {
      const nextSession = await getSession(model, session.id);
      const update = withDeadline(nextSession);
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
    intervene,
    checkout,
    tender,
    issueReceipt: issueReceiptAction,
    reset,
    retry,
    setTheme,
    dismissError,
  };
}
