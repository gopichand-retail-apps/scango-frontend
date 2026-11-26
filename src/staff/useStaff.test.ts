import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api";
import { copy } from "../lib/format";
import * as staffApi from "../lib/staff-api";
import { model } from "../test/fixtures";
import { useStaff } from "./useStaff";

vi.mock("../lib/staff-api", () => ({
  listExceptions: vi.fn(),
  resolveException: vi.fn(),
  signInStaff: vi.fn(),
  signOutStaff: vi.fn(),
}));

const api = vi.mocked(staffApi);
const identity = { code: "att-01", name: "Attendant Alder", locationId: "store-01" };
const exception = {
  sessionId: "00000000-0000-4000-8000-000000000001",
  version: 4,
  since: "2026-01-01T12:00:00.000Z",
  line: { productId: "fruit-apples", name: "Honeycrisp apples", expectedWeightGrams: 980 },
};
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.clearAllMocks();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "resolve-key") });
  api.signInStaff.mockResolvedValue(identity);
  api.listExceptions.mockResolvedValue([exception]);
  api.resolveException.mockResolvedValue({ sessionId: exception.sessionId, state: "scanning", version: 5 });
  api.signOutStaff.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function signedIn() {
  const hook = renderHook(() => useStaff(model));
  await act(async () => hook.result.current.signIn("att-01", "123456"));
  return hook;
}

describe("staff console state", () => {
  it("starts signed out and shows model copy when sign-in fails", async () => {
    api.signInStaff.mockRejectedValueOnce(
      new ApiError(copy(model, "staffSignInFailed"), 401, "STAFF_AUTH_FAILED", null),
    );
    const { result } = renderHook(() => useStaff(model));
    expect(result.current.status).toBe("signed-out");

    await act(async () => result.current.signIn("att-01", "000000"));
    expect(result.current.status).toBe("signed-out");
    expect(result.current.message).toEqual({ tone: "error", text: copy(model, "staffSignInFailed") });
  });

  it("loads the location's exceptions after sign-in", async () => {
    const { result } = await signedIn();

    expect(result.current.status).toBe("ready");
    expect(result.current.staff).toEqual(identity);
    expect(result.current.exceptions).toEqual([exception]);
  });

  it("refreshes every three seconds while visible and pauses while hidden", async () => {
    vi.useFakeTimers();
    const { result } = await signedIn();
    api.listExceptions.mockClear();

    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(api.listExceptions).toHaveBeenCalledTimes(1);
    visibility = "hidden";
    await act(async () => vi.advanceTimersByTimeAsync(9_000));
    expect(api.listExceptions).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ready");
  });

  it("resolves with reason, then confirms and refreshes", async () => {
    const { result } = await signedIn();
    api.listExceptions.mockResolvedValueOnce([]);

    await act(async () => result.current.resolve(exception, "approve_weight", "weight_verified"));
    expect(api.resolveException).toHaveBeenCalledWith(
      model,
      exception,
      { action: "approve_weight", reasonCode: "weight_verified" },
      "resolve-key",
    );
    expect(result.current.message).toEqual({ tone: "success", text: copy(model, "staffResolved") });
    expect(result.current.exceptions).toEqual([]);
  });

  it("explains a conflict from another attendant and refreshes the list", async () => {
    const { result } = await signedIn();
    api.resolveException.mockRejectedValueOnce(
      new ApiError(copy(model, "staffConflict"), 409, "SESSION_VERSION_CONFLICT", null),
    );
    api.listExceptions.mockResolvedValueOnce([]);

    await act(async () => result.current.resolve(exception, "remove_item", "item_mismatch"));
    expect(result.current.message).toEqual({ tone: "error", text: copy(model, "staffConflict") });
    expect(result.current.exceptions).toEqual([]);
  });

  it("returns to sign-in if the staff session ends during a decision", async () => {
    const { result } = await signedIn();
    api.resolveException.mockRejectedValueOnce(
      new ApiError(copy(model, "staffSignInRequired"), 403, "STAFF_REQUIRED", null),
    );

    await act(async () => result.current.resolve(exception, "approve_weight", "weight_verified"));
    expect(result.current.status).toBe("signed-out");
    expect(result.current.message).toEqual({ tone: "error", text: copy(model, "staffSignInRequired") });
  });

  it("uses generic copy for unexpected failures", async () => {
    const { result } = await signedIn();
    api.listExceptions.mockRejectedValueOnce(new Error("socket detail"));

    await act(async () => result.current.refresh());
    expect(result.current.message).toEqual({ tone: "error", text: copy(model, "errorGeneric") });
  });

  it("returns to sign-in when the staff session has ended", async () => {
    const { result } = await signedIn();
    api.listExceptions.mockRejectedValueOnce(
      new ApiError(copy(model, "staffSignInRequired"), 403, "STAFF_REQUIRED", null),
    );

    await act(async () => result.current.refresh());
    expect(result.current.status).toBe("signed-out");
    expect(result.current.staff).toBeNull();
    expect(result.current.message).toEqual({ tone: "error", text: copy(model, "staffSignInRequired") });
  });

  it("keeps the last list on a network failure and reports it", async () => {
    const { result } = await signedIn();
    api.listExceptions.mockRejectedValueOnce(
      new ApiError(copy(model, "serviceUnavailable"), 0, "SERVICE_UNAVAILABLE", null),
    );

    await act(async () => result.current.refresh());
    expect(result.current.status).toBe("ready");
    expect(result.current.exceptions).toEqual([exception]);
    expect(result.current.message).toEqual({ tone: "error", text: copy(model, "serviceUnavailable") });
  });

  it("signs out locally even if the server call fails", async () => {
    const { result } = await signedIn();
    api.signOutStaff.mockRejectedValueOnce(new Error("offline"));

    await act(async () => result.current.signOut());
    expect(result.current.status).toBe("signed-out");
    expect(result.current.exceptions).toEqual([]);
  });
});
