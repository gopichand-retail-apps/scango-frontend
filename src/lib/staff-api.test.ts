import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCredentials, getSessionToken, getStaffToken, setSessionToken } from "./credentials";
import { copy } from "./format";
import { listExceptions, resolveException, signInStaff, signOutStaff } from "./staff-api";
import { model } from "../test/fixtures";

const fetchMock = vi.fn<typeof fetch>();
const staffToken = "s".repeat(43);
const sessionId = "00000000-0000-4000-8000-000000000001";
const exception = {
  sessionId,
  version: 4,
  since: "2026-01-01T12:00:00.000Z",
  line: { productId: "fruit-apples", name: "Honeycrisp apples", expectedWeightGrams: 980 },
};

function respond(payload: unknown, status = 200) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } }),
  );
}

function lastHeaders() {
  return new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("VITE_SCANGO_API_BASE_URL", "http://127.0.0.1:5999/api/v1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  clearCredentials();
});

describe("staff API client", () => {
  it("signs in, keeps the staff token in memory and never sends a kiosk or shopper credential", async () => {
    setSessionToken("shopper-token-that-must-not-leak");
    respond(
      {
        data: {
          accessToken: staffToken,
          expiresAt: "2026-01-01T12:15:00.000Z",
          staff: { code: "att-01", name: "Attendant Alder", locationId: "store-01" },
        },
      },
      201,
    );

    const identity = await signInStaff(model, "att-01", "123456");
    const request = fetchMock.mock.calls.at(-1);
    expect(identity).toEqual({ code: "att-01", name: "Attendant Alder", locationId: "store-01" });
    expect(String(request?.[0])).toBe("http://127.0.0.1:5999/api/v1/staff/sessions");
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ code: "att-01", pin: "123456" });
    expect(lastHeaders().has("Authorization")).toBe(false);
    expect(lastHeaders().has("X-Kiosk-Id")).toBe(false);
    expect(getStaffToken()).toBe(staffToken);
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);

    respond({ data: { exceptions: [exception] } });
    await expect(listExceptions(model)).resolves.toEqual([exception]);
    expect(lastHeaders().get("Authorization")).toBe(`Bearer ${staffToken}`);
    expect(lastHeaders().has("X-Kiosk-Id")).toBe(false);
    expect(getSessionToken()).toBe("shopper-token-that-must-not-leak");
  });

  it("resolves an exception with reason, line and version under an idempotency key", async () => {
    respond({ data: { sessionId, state: "scanning", version: 5 } });

    const result = await resolveException(
      model,
      exception,
      { action: "approve_weight", reasonCode: "weight_verified" },
      "resolve-key",
    );
    const request = fetchMock.mock.calls.at(-1);
    expect(result).toEqual({ sessionId, state: "scanning", version: 5 });
    expect(String(request?.[0])).toBe(`http://127.0.0.1:5999/api/v1/sessions/${sessionId}/intervention`);
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      action: "approve_weight",
      reasonCode: "weight_verified",
      productId: "fruit-apples",
      expectedVersion: 4,
    });
    expect(lastHeaders().get("Idempotency-Key")).toBe("resolve-key");
  });

  it("forgets the staff token at sign-out even when the server refuses it", async () => {
    respond(
      { data: { accessToken: staffToken, expiresAt: "x", staff: { code: "a", name: "A", locationId: "l" } } },
      201,
    );
    await signInStaff(model, "att-01", "123456");
    respond({ error: { code: "STAFF_REQUIRED", message: "detail" } }, 403);

    await expect(signOutStaff(model)).rejects.toMatchObject({ code: "STAFF_REQUIRED" });
    expect(getStaffToken()).toBeNull();
  });

  it("maps staff errors to model copy", async () => {
    const cases = [
      ["STAFF_AUTH_FAILED", 401, "staffSignInFailed"],
      ["STAFF_THROTTLED", 429, "staffThrottled"],
      ["STAFF_REQUIRED", 403, "staffSignInRequired"],
      ["SESSION_VERSION_CONFLICT", 409, "staffConflict"],
      ["INTERVENTION_LINE_MISMATCH", 409, "staffConflict"],
    ] as const;
    for (const [code, status, key] of cases) {
      respond({ error: { code, message: "server detail" } }, status);
      await expect(listExceptions(model)).rejects.toMatchObject({ code, message: copy(model, key) });
    }
  });
});
