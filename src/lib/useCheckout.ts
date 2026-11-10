import { useEffect, useState } from "react";
import {
  ApiError,
  adjustQuantity,
  applyCoupon,
  checkWeight,
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
import { copy } from "./format";
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
}

const initialState: CheckoutState = {
  model: null,
  catalog: null,
  session: null,
  receipt: null,
  theme: null,
  error: null,
  busy: false,
};

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
      const sessionExpired =
        error instanceof ApiError && (error.code === "SESSION_NOT_FOUND" || error.code === "RECEIPT_NOT_FOUND");
      const message =
        error instanceof ApiError
          ? error.message
          : state.model
            ? copy(state.model, "errorGeneric")
            : "The kiosk action failed.";
      setState((current) => ({
        ...current,
        ...(sessionExpired ? { session: null, receipt: null } : {}),
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
      const session = await startSession(model, crypto.randomUUID());
      setState((current) => ({ ...current, session, receipt: null }));
    });
  }

  async function scan(barcode: string, source: "barcode" | "search") {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextSession = await scanItem(model, session.id, barcode, source, crypto.randomUUID());
      setState((current) => ({ ...current, session: nextSession }));
    });
  }

  async function quantity(productId: string, delta: number) {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextSession = await adjustQuantity(model, session.id, productId, delta, crypto.randomUUID());
      setState((current) => ({ ...current, session: nextSession }));
    });
  }

  async function coupon(code: string) {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextSession = await applyCoupon(model, session.id, code, crypto.randomUUID());
      setState((current) => ({ ...current, session: nextSession }));
    });
  }

  async function weigh(simulatedWeightGrams: number) {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextSession = await checkWeight(model, session.id, simulatedWeightGrams, crypto.randomUUID());
      setState((current) => ({ ...current, session: nextSession }));
    });
  }

  async function intervene(action: "approve_weight" | "remove_item") {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextSession = await resolveIntervention(model, session.id, action, crypto.randomUUID());
      setState((current) => ({ ...current, session: nextSession }));
    });
  }

  async function checkout() {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextSession = await prepareCheckout(model, session.id, crypto.randomUUID());
      setState((current) => ({ ...current, session: nextSession }));
    });
  }

  async function tender(method: TenderMethod, outcome: SimulationOutcome) {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const result = await simulateTender(model, session.id, method, outcome, crypto.randomUUID());
      setState((current) => ({ ...current, session: result.session }));
    });
  }

  async function issueReceiptAction() {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      const nextReceipt = await issueReceipt(model, session.id, crypto.randomUUID());
      const nextSession = await getSession(model, session.id);
      setState((current) => ({ ...current, session: nextSession, receipt: nextReceipt }));
    });
  }

  async function reset() {
    const { model, session } = state;
    if (!model || !session) return;
    await perform(async () => {
      await resetSession(model, session.id, crypto.randomUUID());
      setState((current) => ({ ...current, session: null, receipt: null }));
    });
  }

  async function retry() {
    const { model, session } = state;
    if (!model || !session) {
      setBootRevision((revision) => revision + 1);
      setState((current) => ({ ...current, error: null }));
      return;
    }
    await perform(async () => {
      const nextSession = await getSession(model, session.id);
      setState((current) => ({ ...current, session: nextSession }));
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
    ...state,
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
