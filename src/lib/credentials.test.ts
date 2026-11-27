import { afterEach, describe, expect, it } from "vitest";
import { clearCredentials, getSessionToken, getStaffToken, setSessionToken, setStaffToken } from "./credentials";

afterEach(() => clearCredentials());

describe("in-memory credentials", () => {
  it("hold the shopper and staff tokens separately and never touch browser storage", () => {
    setSessionToken("shopper-token");
    setStaffToken("staff-token");

    expect(getSessionToken()).toBe("shopper-token");
    expect(getStaffToken()).toBe("staff-token");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("clear both tokens at once and each token on its own", () => {
    setSessionToken("shopper-token");
    setStaffToken("staff-token");
    setSessionToken(null);
    expect(getSessionToken()).toBeNull();
    expect(getStaffToken()).toBe("staff-token");

    clearCredentials();
    expect(getStaffToken()).toBeNull();
  });
});
