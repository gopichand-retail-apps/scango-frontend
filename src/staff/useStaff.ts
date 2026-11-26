import { useCallback, useEffect, useState } from "react";
import { ApiError, isRetryableFailure } from "../lib/api";
import { setStaffToken } from "../lib/credentials";
import { copy } from "../lib/format";
import { createIntentKeys } from "../lib/intent-keys";
import { listExceptions, resolveException, signInStaff, signOutStaff } from "../lib/staff-api";
import type { PublicModel, StaffAction, StaffException, StaffIdentity, StaffReasonCode } from "../lib/types";

export interface StaffMessage {
  tone: "error" | "success";
  text: string;
}

interface StaffState {
  staff: StaffIdentity | null;
  exceptions: StaffException[];
  status: "signed-out" | "loading" | "ready";
  busy: boolean;
  message: StaffMessage | null;
}

const signedOut: StaffState = { staff: null, exceptions: [], status: "signed-out", busy: false, message: null };

function isStaffSessionEnded(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === "STAFF_REQUIRED";
}

// The staff token is already cleared locally; the server copy expires after 15 idle minutes.
function ignoreSignOutFailure() {}

export function useStaff(model: PublicModel) {
  const [state, setState] = useState<StaffState>(signedOut);
  const [keys] = useState(() => createIntentKeys());

  const failureText = useCallback(
    (error: unknown) => (error instanceof ApiError ? error.message : copy(model, "errorGeneric")),
    [model],
  );

  const endStaffSession = useCallback((error: ApiError) => {
    setStaffToken(null);
    setState({ ...signedOut, message: { tone: "error", text: error.message } });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const exceptions = await listExceptions(model);
      setState((current) => ({ ...current, exceptions }));
    } catch (error) {
      if (isStaffSessionEnded(error)) {
        endStaffSession(error);
        return;
      }
      setState((current) => ({ ...current, message: { tone: "error", text: failureText(error) } }));
    }
  }, [model, endStaffSession, failureText]);

  async function signIn(code: string, pin: string) {
    setState((current) => ({ ...current, status: "loading", busy: true, message: null }));
    try {
      const staff = await signInStaff(model, code, pin);
      setState({ staff, exceptions: [], status: "ready", busy: false, message: null });
    } catch (error) {
      setState({ ...signedOut, message: { tone: "error", text: failureText(error) } });
      return;
    }
    await refresh();
  }

  async function resolve(exception: StaffException, action: StaffAction, reasonCode: StaffReasonCode) {
    setState((current) => ({ ...current, busy: true, message: null }));
    const intent = `resolve:${exception.sessionId}`;
    const key = keys.keyFor(intent, { action, reasonCode, version: exception.version });
    try {
      await resolveException(model, exception, { action, reasonCode }, key);
      keys.confirm(intent);
      setState((current) => ({
        ...current,
        busy: false,
        message: { tone: "success", text: copy(model, "staffResolved") },
      }));
    } catch (error) {
      if (!isRetryableFailure(error)) keys.confirm(intent);
      if (isStaffSessionEnded(error)) {
        endStaffSession(error);
        return;
      }
      setState((current) => ({ ...current, busy: false, message: { tone: "error", text: failureText(error) } }));
    }
    await refresh();
  }

  async function signOut() {
    setState((current) => ({ ...current, busy: true }));
    await signOutStaff(model).catch(ignoreSignOutFailure);
    keys.clear();
    setState(signedOut);
  }

  // Keep the list current every 3 s while signed in and the console is visible.
  useEffect(() => {
    if (state.status !== "ready") return undefined;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 3000);
    return () => window.clearInterval(timer);
  }, [state.status, refresh]);

  return { ...state, signIn, signOut, resolve, refresh };
}
