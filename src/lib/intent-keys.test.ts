import { describe, expect, it } from "vitest";
import { createIntentKeys } from "./intent-keys";

function sequence() {
  let next = 0;
  return () => `key-${++next}`;
}

describe("intent keys", () => {
  it("reuse one key for the same unconfirmed intent, whatever the payload's key order", () => {
    const keys = createIntentKeys(sequence());

    expect(keys.keyFor("scan", { sessionId: "s1", barcode: "A" })).toBe("key-1");
    expect(keys.keyFor("scan", { barcode: "A", sessionId: "s1" })).toBe("key-1");
  });

  it("replace the key when the payload changes", () => {
    const keys = createIntentKeys(sequence());
    keys.keyFor("scan", { barcode: "A" });

    expect(keys.keyFor("scan", { barcode: "B" })).toBe("key-2");
    expect(keys.keyFor("scan", { barcode: "A" })).toBe("key-3");
  });

  it("discard a key once its result is confirmed, so a deliberate repeat is a new intent", () => {
    const keys = createIntentKeys(sequence());
    keys.keyFor("scan", { barcode: "A" });
    keys.confirm("scan");

    expect(keys.keyFor("scan", { barcode: "A" })).toBe("key-2");
  });

  it("keep kinds independent and forget everything on clear", () => {
    const keys = createIntentKeys(sequence());
    const scan = keys.keyFor("scan", { barcode: "A" });
    const tender = keys.keyFor("tender", { method: "cash" });
    keys.confirm("tender");

    expect(keys.keyFor("scan", { barcode: "A" })).toBe(scan);
    expect(tender).toBe("key-2");
    keys.clear();
    expect(keys.keyFor("scan", { barcode: "A" })).toBe("key-3");
  });

  it("treat list payloads by value and by order", () => {
    const keys = createIntentKeys(sequence());

    expect(keys.keyFor("batch", { barcodes: ["A", "B"] })).toBe("key-1");
    expect(keys.keyFor("batch", { barcodes: ["A", "B"] })).toBe("key-1");
    expect(keys.keyFor("batch", { barcodes: ["B", "A"] })).toBe("key-2");
  });

  it("default to random UUID keys", () => {
    expect(createIntentKeys().keyFor("start", {})).toMatch(/^[0-9a-f-]{36}$/);
  });
});
