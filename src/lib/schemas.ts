import { z } from "zod";

const categorySchema = z
  .object({
    id: z.string(),
    labelKey: z.string(),
    color: z.string(),
  })
  .strict();

const productSchema = z
  .object({
    id: z.string(),
    barcode: z.string(),
    name: z.string(),
    description: z.string(),
    categoryId: z.string(),
    priceCents: z.number().int().nonnegative(),
    unitKey: z.string(),
    image: z.string(),
    weightRequired: z.boolean(),
    expectedWeightGrams: z.number().int().nonnegative(),
    toleranceGrams: z.number().int().nonnegative(),
  })
  .strict();

const contentCategorySchema = z
  .object({
    id: z.string().min(1),
    labelKey: z.string().min(1),
    color: z.string().min(1),
  })
  .strict();

const contentProductSchema = z
  .object({
    id: z.string().min(1),
    barcode: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    categoryId: z.string().min(1),
    priceCents: z.number().int().nonnegative(),
    unitKey: z.string().min(1),
    image: z.string().startsWith("/"),
    weightCheck: z
      .object({
        required: z.boolean(),
        expectedGrams: z.number().int().nonnegative(),
        toleranceGrams: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

const contentCouponSchema = z
  .object({
    code: z.string().min(1),
    description: z.string().min(1),
    kind: z.enum(["percent", "fixed"]),
    value: z.number().int().positive(),
    minimumSubtotalCents: z.number().int().nonnegative(),
    maximumDiscountCents: z.number().int().positive(),
    categoryIds: z.array(z.string().min(1)),
  })
  .strict();

const requiredTextMessages = [
  "kioskEyebrow",
  "marketMonogram",
  "marketName",
  "marketDescriptor",
  "approvedMark",
  "releaseVersion",
  "welcomeTitle",
  "welcomeDescription",
  "startCheckout",
  "sessionLabel",
  "sessionReady",
  "scanStage",
  "reviewStage",
  "payStage",
  "receiptStage",
  "searchProducts",
  "searchPlaceholder",
  "barcode",
  "barcodePlaceholder",
  "scanItem",
  "catalogHeading",
  "allCategories",
  "addToBasket",
  "itemAdded",
  "basketHeading",
  "emptyBasket",
  "quantity",
  "decreaseQuantity",
  "increaseQuantity",
  "removeItem",
  "couponLabel",
  "couponPlaceholder",
  "applyCoupon",
  "couponApplied",
  "couponRemoved",
  "subtotal",
  "discount",
  "estimatedTax",
  "total",
  "checkout",
  "weightCheckTitle",
  "weightExpected",
  "weightMeasured",
  "confirmWeight",
  "weightPassed",
  "weightMismatch",
  "attendantTitle",
  "attendantDescription",
  "approveWeight",
  "removeLastScanned",
  "paymentTitle",
  "paymentDisclaimer",
  "tenderMethod",
  "cashSimulation",
  "cardSimulation",
  "simulationOutcome",
  "approveSimulation",
  "declineSimulation",
  "runPayment",
  "paymentApproved",
  "paymentDeclined",
  "receiptTitle",
  "receiptDescription",
  "receiptNumber",
  "issuedAt",
  "printReceipt",
  "newCheckout",
  "cancelCheckout",
  "resetCheckout",
  "resetConfirm",
  "themeToggle",
  "serviceConnected",
  "serviceUnavailable",
  "loading",
  "retry",
  "emptySearch",
  "itemCount",
  "taxNote",
  "checkoutDisclaimer",
  "errorGeneric",
  "invalidBarcode",
  "invalidCoupon",
  "couponMinimum",
  "scaleOutOfRange",
  "sessionExpired",
  "stateScanning",
  "stateWeightCheck",
  "stateWeightCheckPending",
  "stateAttentionRequired",
  "stateReadyToPay",
  "statePaymentApproved",
  "statePaid",
  "stateReceiptIssued",
  "stateReset",
  "stateCancelled",
  "roleShopper",
  "roleAttendant",
  "roleAdministrator",
  "issueReceipt",
];

const requiredMessageGroups = {
  categories: ["produce", "bakery", "dairy", "pantry", "floral"],
  frequencies: ["each", "bag", "dozen", "bunch", "loaf"],
  errors: [
    "invalidRequest",
    "notFound",
    "originNotAllowed",
    "rateLimited",
    "server",
    "invalidState",
    "invalidQuantity",
    "invalidScale",
  ],
};

const messagesSchema = z
  .record(z.string(), z.union([z.string().min(1), z.record(z.string(), z.string().min(1))]))
  .superRefine((messages, context) => {
    const allowedKeys = new Set([...requiredTextMessages, ...Object.keys(requiredMessageGroups)]);
    for (const key of requiredTextMessages) {
      if (typeof messages[key] !== "string") {
        context.addIssue({ code: "custom", path: [key], message: "A required model message is missing or invalid." });
      }
    }
    for (const [groupKey, requiredKeys] of Object.entries(requiredMessageGroups)) {
      const values = messages[groupKey];
      if (typeof values !== "object" || values === null) {
        context.addIssue({ code: "custom", path: [groupKey], message: "A required model message group is missing." });
        continue;
      }
      for (const key of requiredKeys) {
        if (typeof values[key] !== "string") {
          context.addIssue({
            code: "custom",
            path: [groupKey, key],
            message: "A required model message is missing or invalid.",
          });
        }
      }
      if (Object.keys(values).some((key) => !requiredKeys.includes(key))) {
        context.addIssue({
          code: "custom",
          path: [groupKey],
          message: "The model message group contains an unknown key.",
        });
      }
    }
    if (Object.keys(messages).some((key) => !allowedKeys.has(key))) {
      context.addIssue({ code: "custom", message: "The model messages contain an unknown key." });
    }
  });

const appContentSchema = z
  .object({
    name: z.string(),
    descriptor: z.string(),
    description: z.string(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    themeStorageKey: z.string(),
    defaultTheme: z.enum(["light", "dark"]),
    maximumScanBatch: z.number().int().positive(),
    maximumBarcodeLength: z.number().int().positive(),
    maximumQuantity: z.number().int().positive(),
    maximumBodyBytes: z.number().int().positive(),
    taxRateBasisPoints: z.number().int().nonnegative().max(10000),
    scaleMinimumGrams: z.number().int().positive(),
    scaleMaximumGrams: z.number().int().positive(),
  })
  .strict()
  .refine((app) => app.scaleMinimumGrams <= app.scaleMaximumGrams, {
    message: "The scale minimum must not exceed the scale maximum.",
  });

export const publicModelSchema = z
  .object({
    version: z.literal(1),
    appId: z.literal("scango"),
    locale: z.string().min(2),
    messages: messagesSchema,
    data: z
      .object({
        app: appContentSchema,
        categories: z.array(contentCategorySchema).min(1),
        products: z.array(contentProductSchema).min(1),
        coupons: z.array(contentCouponSchema),
        simulator: z
          .object({
            tenderMethods: z.array(z.enum(["cash", "simulated_card"])).min(1),
            outcomes: z.array(z.enum(["approve", "decline"])).min(1),
            minimumScaleGrams: z.number().int().positive(),
            maximumScaleGrams: z.number().int().positive(),
            noCardData: z.literal(true),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const catalogSchema = z.object({
  categories: z.array(categorySchema),
  products: z.array(productSchema),
});

const sessionItemSchema = z.object({
  productId: z.string(),
  barcode: z.string(),
  name: z.string(),
  description: z.string(),
  categoryId: z.string(),
  image: z.string(),
  unitKey: z.string(),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  lineTotalCents: z.number().int().nonnegative(),
  weightStatus: z.enum(["not_required", "pending", "passed", "attention"]),
  expectedWeightGrams: z.number().int().nonnegative(),
  toleranceGrams: z.number().int().nonnegative(),
});

const tenderSchema = z.object({
  id: z.string(),
  method: z.enum(["cash", "simulated_card"]),
  outcome: z.enum(["approve", "decline"]),
  amountCents: z.number().int().nonnegative(),
  occurredAt: z.string(),
});

export const checkoutSessionSchema = z.object({
  id: z.string().uuid(),
  state: z.enum([
    "scanning",
    "weight_check_pending",
    "attention_required",
    "ready_to_pay",
    "paid",
    "receipt_issued",
    "reset",
  ]),
  couponCode: z.string().nullable(),
  paymentStatus: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resetAt: z.string().nullable(),
  items: z.array(sessionItemSchema),
  pendingWeight: sessionItemSchema.nullable(),
  latestTender: tenderSchema.nullable(),
  subtotalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  taxCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
});

export const tenderResultSchema = z.object({
  session: checkoutSessionSchema,
  approved: z.boolean(),
  message: z.string(),
});

export const receiptSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  receiptNumber: z.string(),
  subtotalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  taxCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  tenderMethod: z.enum(["cash", "simulated_card"]),
  items: z.array(
    z.object({
      productId: z.string(),
      name: z.string(),
      quantity: z.number().int().positive(),
      unitPriceCents: z.number().int().nonnegative(),
      lineTotalCents: z.number().int().nonnegative(),
    }),
  ),
  issuedAt: z.string(),
});

export const resetResultSchema = z.object({
  sessionId: z.string().uuid(),
  state: z.literal("reset"),
});
