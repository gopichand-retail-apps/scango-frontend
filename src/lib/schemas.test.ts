import { describe, expect, it } from "vitest";
import contentModel from "../../public/scango-model.json";
import {
  catalogSchema,
  checkoutSessionSchema,
  publicModelSchema,
  receiptSchema,
  resetResultSchema,
  tenderResultSchema,
} from "./schemas";
import { catalog, emptySession, model, paidSession, receipt } from "../test/fixtures";

describe("runtime contracts", () => {
  it("accepts the strict ScanGo versioned model", () => {
    expect(publicModelSchema.parse(contentModel)).toEqual(model);
  });

  const invalidModels = [
    { name: "wrong app ID", candidate: { ...model, appId: "another-app" } },
    { name: "unsupported version zero", candidate: { ...model, version: 0 } },
    { name: "unsupported future version", candidate: { ...model, version: 2 } },
    { name: "missing message", candidate: { ...model, messages: { ...model.messages, welcomeTitle: undefined } } },
    { name: "legacy envelope", candidate: { ...model, modelVersion: 1 } },
    {
      name: "endpoint in public content",
      candidate: { ...model, data: { ...model.data, apiBaseUrl: "http://127.0.0.1" } },
    },
    { name: "architecture in public content", candidate: { ...model, architecture: {} } },
  ];
  it.each(invalidModels)("rejects $name", ({ candidate }) => {
    expect(publicModelSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects missing messages, invalid groups, extra message keys, and invalid scale limits", () => {
    const missingMessage = { ...model, messages: { ...model.messages } };
    delete missingMessage.messages.welcomeTitle;
    const invalidGroup = { ...model, messages: { ...model.messages, categories: "invalid" } };
    const categories = model.messages.categories;
    if (typeof categories !== "object" || categories === null) throw new Error("Category copy is invalid in fixture.");
    const extraGroupMessage = {
      ...model,
      messages: { ...model.messages, categories: { ...categories, unknown: "Unknown" } },
    };
    const extraMessage = { ...model, messages: { ...model.messages, unknownCopy: "Unknown" } };
    const invalidScale = {
      ...model,
      data: { ...model.data, app: { ...model.data.app, scaleMinimumGrams: 50000 } },
    };

    expect(publicModelSchema.safeParse(missingMessage).success).toBe(false);
    expect(publicModelSchema.safeParse(invalidGroup).success).toBe(false);
    expect(publicModelSchema.safeParse(extraGroupMessage).success).toBe(false);
    expect(publicModelSchema.safeParse(extraMessage).success).toBe(false);
    expect(publicModelSchema.safeParse(invalidScale).success).toBe(false);
  });

  it("rejects invalid public image paths and malformed coupon rules", () => {
    const product = model.data.products[0];
    const coupon = model.data.coupons[0];
    if (!product || !coupon) throw new Error("ScanGo test model is missing product or coupon data.");
    const invalidImage = {
      ...model,
      data: {
        ...model.data,
        products: [{ ...product, image: "https://images.example/product.jpg" }, ...model.data.products.slice(1)],
      },
    };
    const invalidCoupon = {
      ...model,
      data: {
        ...model.data,
        coupons: [{ ...coupon, maximumDiscountCents: 0 }, ...model.data.coupons.slice(1)],
      },
    };

    expect(publicModelSchema.safeParse(invalidImage).success).toBe(false);
    expect(publicModelSchema.safeParse(invalidCoupon).success).toBe(false);
  });

  it("validates catalog products and session state", () => {
    expect(catalogSchema.parse(catalog)).toEqual(catalog);
    expect(
      catalogSchema.safeParse({ ...catalog, products: [{ ...catalog.products[0], priceCents: -1 }] }).success,
    ).toBe(false);
    expect(checkoutSessionSchema.parse(emptySession)).toEqual(emptySession);
    expect(checkoutSessionSchema.safeParse({ ...emptySession, state: "unknown" }).success).toBe(false);
  });

  it("validates tender, receipt, and reset response shapes", () => {
    const tenderResult = { session: paidSession, approved: true, message: "Approved" };
    expect(tenderResultSchema.parse(tenderResult)).toEqual(tenderResult);
    expect(tenderResultSchema.safeParse({ ...tenderResult, approved: "yes" }).success).toBe(false);
    expect(receiptSchema.parse(receipt)).toEqual(receipt);
    expect(receiptSchema.safeParse({ ...receipt, totalCents: -1 }).success).toBe(false);
    expect(resetResultSchema.parse({ sessionId: emptySession.id, state: "reset" })).toEqual({
      sessionId: emptySession.id,
      state: "reset",
    });
    expect(resetResultSchema.safeParse({ sessionId: emptySession.id, state: "scanning" }).success).toBe(false);
  });
});
