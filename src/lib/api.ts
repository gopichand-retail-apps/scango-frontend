import { z } from "zod";
import { resolveApiBaseUrl } from "../config";
import { copy } from "./format";
import {
  catalogSchema,
  checkoutSessionSchema,
  publicModelSchema,
  receiptSchema,
  resetResultSchema,
  tenderResultSchema,
} from "./schemas";
import type {
  Catalog,
  CheckoutSession,
  Product,
  PublicModel,
  Receipt,
  SimulationOutcome,
  TenderMethod,
  TenderResult,
} from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;

  constructor(message: string, status: number, code: string, requestId: string | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  idempotencyKey?: string;
};

const errorCopyByCode: Readonly<Record<string, string>> = {
  ITEM_NOT_FOUND: "invalidBarcode",
  INVALID_COUPON: "invalidCoupon",
  COUPON_MINIMUM: "couponMinimum",
  WEIGHT_CHECK_REQUIRED: "weightMismatch",
  SESSION_NOT_FOUND: "sessionExpired",
  RECEIPT_NOT_FOUND: "sessionExpired",
};

function getErrorCopy(model: PublicModel, code: string): string {
  return copy(model, errorCopyByCode[code] ?? "errorGeneric");
}

async function sendRequest(model: PublicModel, path: string, options: RequestOptions = {}): Promise<Response> {
  const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_SCANGO_API_BASE_URL);
  try {
    return await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      signal: options.signal,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(copy(model, "serviceUnavailable"), 0, "SERVICE_UNAVAILABLE", null);
  }
}

async function requestData<T>(
  model: PublicModel,
  path: string,
  schema: z.ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const response = await sendRequest(model, path, options);
  const requestId = response.headers.get("x-request-id");
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(copy(model, "errorGeneric"), response.status, "INVALID_RESPONSE", requestId);
  }
  if (!response.ok) {
    const parsedError = z.object({ error: z.object({ code: z.string().min(1) }) }).safeParse(payload);
    const errorCode = parsedError.success ? parsedError.data.error.code : "REQUEST_FAILED";
    throw new ApiError(getErrorCopy(model, errorCode), response.status, errorCode, requestId);
  }
  const data = typeof payload === "object" && payload !== null && "data" in payload ? payload.data : undefined;
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new ApiError(copy(model, "errorGeneric"), response.status, "INVALID_RESPONSE", requestId);
  }
  return parsed.data;
}

export async function loadModel(signal?: AbortSignal): Promise<PublicModel> {
  let response: Response;
  try {
    response = await fetch("/scango-model.json", { cache: "no-store", signal });
  } catch {
    throw new Error("The kiosk content model is unavailable.");
  }
  if (!response.ok) throw new Error("The kiosk content model is unavailable.");
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The kiosk content model is invalid.");
  }
  const parsed = publicModelSchema.safeParse(payload);
  if (!parsed.success) throw new Error("The kiosk content model is invalid.");
  resolveApiBaseUrl(import.meta.env.VITE_SCANGO_API_BASE_URL);
  return parsed.data;
}

export function getCatalog(model: PublicModel, signal?: AbortSignal): Promise<Catalog> {
  return requestData(model, "/catalog", catalogSchema, { signal });
}

export function startSession(model: PublicModel, idempotencyKey: string): Promise<CheckoutSession> {
  return requestData(model, "/sessions", checkoutSessionSchema, {
    method: "POST",
    body: {},
    idempotencyKey,
  });
}

export function getSession(model: PublicModel, sessionId: string, signal?: AbortSignal) {
  return requestData(model, `/sessions/${sessionId}`, checkoutSessionSchema, { signal });
}

export function scanItem(
  model: PublicModel,
  sessionId: string,
  barcode: string,
  source: "barcode" | "search",
  idempotencyKey: string,
) {
  return requestData(model, `/sessions/${sessionId}/scan`, checkoutSessionSchema, {
    method: "POST",
    body: { barcode, source },
    idempotencyKey,
  });
}

export function scanBatch(model: PublicModel, sessionId: string, barcodes: string[], idempotencyKey: string) {
  return requestData(model, `/sessions/${sessionId}/scan-batch`, checkoutSessionSchema, {
    method: "POST",
    body: { barcodes },
    idempotencyKey,
  });
}

export function adjustQuantity(
  model: PublicModel,
  sessionId: string,
  productId: string,
  delta: number,
  idempotencyKey: string,
) {
  return requestData(model, `/sessions/${sessionId}/quantity`, checkoutSessionSchema, {
    method: "POST",
    body: { productId, delta },
    idempotencyKey,
  });
}

export function applyCoupon(model: PublicModel, sessionId: string, code: string, idempotencyKey: string) {
  return requestData(model, `/sessions/${sessionId}/coupon`, checkoutSessionSchema, {
    method: "POST",
    body: { code },
    idempotencyKey,
  });
}

export function checkWeight(
  model: PublicModel,
  sessionId: string,
  simulatedWeightGrams: number,
  idempotencyKey: string,
) {
  return requestData(model, `/sessions/${sessionId}/weight-check`, checkoutSessionSchema, {
    method: "POST",
    body: { simulatedWeightGrams },
    idempotencyKey,
  });
}

export function resolveIntervention(
  model: PublicModel,
  sessionId: string,
  action: "approve_weight" | "remove_item",
  idempotencyKey: string,
) {
  return requestData(model, `/sessions/${sessionId}/intervention`, checkoutSessionSchema, {
    method: "POST",
    body: { action },
    idempotencyKey,
  });
}

export function prepareCheckout(model: PublicModel, sessionId: string, idempotencyKey: string) {
  return requestData(model, `/sessions/${sessionId}/checkout`, checkoutSessionSchema, {
    method: "POST",
    body: {},
    idempotencyKey,
  });
}

export function simulateTender(
  model: PublicModel,
  sessionId: string,
  method: TenderMethod,
  outcome: SimulationOutcome,
  idempotencyKey: string,
): Promise<TenderResult> {
  return requestData(model, `/sessions/${sessionId}/tenders`, tenderResultSchema, {
    method: "POST",
    body: { method, outcome },
    idempotencyKey,
  });
}

export function issueReceipt(model: PublicModel, sessionId: string, idempotencyKey: string): Promise<Receipt> {
  return requestData(model, `/sessions/${sessionId}/receipt`, receiptSchema, {
    method: "POST",
    body: {},
    idempotencyKey,
  });
}

export function getReceipt(model: PublicModel, sessionId: string, signal?: AbortSignal): Promise<Receipt> {
  return requestData(model, `/sessions/${sessionId}/receipt`, receiptSchema, { signal });
}

export function resetSession(model: PublicModel, sessionId: string, idempotencyKey: string) {
  return requestData(model, `/sessions/${sessionId}/reset`, resetResultSchema, {
    method: "POST",
    body: {},
    idempotencyKey,
  });
}

export function getProductById(catalog: Catalog, productId: string): Product | undefined {
  return catalog.products.find((product) => product.id === productId);
}
