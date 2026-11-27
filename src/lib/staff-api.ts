import { requestData } from "./api";
import { setStaffToken } from "./credentials";
import {
  interventionResultSchema,
  signOutResultSchema,
  staffExceptionsSchema,
  staffSignInResultSchema,
} from "./schemas";
import type {
  InterventionResult,
  PublicModel,
  StaffAction,
  StaffException,
  StaffIdentity,
  StaffReasonCode,
} from "./types";

export async function signInStaff(model: PublicModel, code: string, pin: string): Promise<StaffIdentity> {
  const result = await requestData(model, "/staff/sessions", staffSignInResultSchema, {
    method: "POST",
    body: { code, pin },
    auth: "staff",
  });
  setStaffToken(result.accessToken);
  return result.staff;
}

// The local token is forgotten even if the server cannot be reached; the server copy expires on its own.
export async function signOutStaff(model: PublicModel): Promise<void> {
  try {
    await requestData(model, "/staff/sign-out", signOutResultSchema, { method: "POST", body: {}, auth: "staff" });
  } finally {
    setStaffToken(null);
  }
}

export async function listExceptions(model: PublicModel, signal?: AbortSignal): Promise<StaffException[]> {
  const result = await requestData(model, "/staff/exceptions", staffExceptionsSchema, { auth: "staff", signal });
  return result.exceptions;
}

export function resolveException(
  model: PublicModel,
  exception: StaffException,
  decision: { action: StaffAction; reasonCode: StaffReasonCode },
  idempotencyKey: string,
): Promise<InterventionResult> {
  return requestData(model, `/sessions/${exception.sessionId}/intervention`, interventionResultSchema, {
    method: "POST",
    body: { ...decision, productId: exception.line.productId, expectedVersion: exception.version },
    idempotencyKey,
    auth: "staff",
  });
}
