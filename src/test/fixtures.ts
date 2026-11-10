import contentModel from "../../public/scango-model.json";
import { catalogSchema, publicModelSchema } from "../lib/schemas";
import type { Catalog, CheckoutSession, Receipt } from "../lib/types";

export const model = publicModelSchema.parse(contentModel);

export const emptySession = {
  id: "00000000-0000-4000-8000-000000000001",
  state: "scanning",
  couponCode: null,
  paymentStatus: "not_started",
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-01T12:00:00.000Z",
  resetAt: null,
  items: [],
  pendingWeight: null,
  latestTender: null,
  subtotalCents: 0,
  discountCents: 0,
  taxCents: 0,
  totalCents: 0,
} satisfies CheckoutSession;

const productContents = model.data.products.map(({ weightCheck, ...product }) => ({
  ...product,
  weightRequired: weightCheck.required,
  expectedWeightGrams: weightCheck.expectedGrams,
  toleranceGrams: weightCheck.toleranceGrams,
}));

export const catalog = catalogSchema.parse({
  categories: model.data.categories,
  products: productContents,
}) satisfies Catalog;

const milk = catalog.products.find((product) => product.id === "dairy-milk");
if (!milk) throw new Error("ScanGo test fixture is missing the milk product.");

export const milkSession: CheckoutSession = {
  ...emptySession,
  items: [
    {
      productId: milk.id,
      barcode: milk.barcode,
      name: milk.name,
      description: milk.description,
      categoryId: milk.categoryId,
      image: milk.image,
      unitKey: milk.unitKey,
      quantity: 1,
      unitPriceCents: 429,
      lineTotalCents: 429,
      weightStatus: "not_required",
      expectedWeightGrams: 0,
      toleranceGrams: 0,
    },
  ],
  subtotalCents: 429,
  taxCents: 35,
  totalCents: 464,
};

export const readySession: CheckoutSession = {
  ...milkSession,
  state: "ready_to_pay",
};

export const paidSession: CheckoutSession = {
  ...readySession,
  state: "paid",
  paymentStatus: "approved",
  latestTender: {
    id: "00000000-0000-4000-8000-000000000002",
    method: "simulated_card",
    outcome: "approve",
    amountCents: 464,
    occurredAt: "2026-01-01T12:01:00.000Z",
  },
};

export const receipt = {
  id: "00000000-0000-4000-8000-000000000003",
  sessionId: emptySession.id,
  receiptNumber: "QS-20260101-000001",
  subtotalCents: 429,
  discountCents: 0,
  taxCents: 35,
  totalCents: 464,
  tenderMethod: "simulated_card",
  items: [{ productId: milk.id, name: milk.name, quantity: 1, unitPriceCents: 429, lineTotalCents: 429 }],
  issuedAt: "2026-01-01T12:01:00.000Z",
} satisfies Receipt;
