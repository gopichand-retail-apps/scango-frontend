import { describe, expect, it } from "vitest";
import { copy, formatDate, formatMoney, formatNumber, nestedCopy } from "./format";
import { model } from "../test/fixtures";

describe("content formatting", () => {
  it("loads required top-level and grouped copy", () => {
    expect(copy(model, "welcomeTitle")).toBe("A better kind of checkout.");
    expect(nestedCopy(model, "categories", "produce")).toBe("Produce");
  });

  it("fails clearly when a copy key or group is missing", () => {
    expect(() => copy(model, "missingMessage")).toThrow("Missing content string: missingMessage");
    expect(() => nestedCopy(model, "missingGroup", "missingKey")).toThrow(
      "Missing content string: missingGroup.missingKey",
    );
    expect(() => nestedCopy(model, "categories", "missingKey")).toThrow(
      "Missing content string: categories.missingKey",
    );
  });

  it("formats money, UTC dates, and localized counts from the model locale", () => {
    expect(formatMoney(model, 0)).toBe("$0.00");
    expect(formatMoney(model, 123456)).toBe("$1,234.56");
    expect(formatMoney(model, -123)).toBe("-$1.23");
    expect(formatDate(model, "2026-01-02T03:00:00.000Z")).toBe("Jan 2, 2026");
    expect(formatNumber(model, 1234)).toBe("1,234");
  });
});
