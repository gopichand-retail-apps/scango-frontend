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

export { publicModelSchema, staffReasonCodes } from "./model-schema";

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
    "expired",
  ]),
  couponCode: z.string().nullable(),
  paymentStatus: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resetAt: z.string().nullable(),
  version: z.number().int().nonnegative(),
  expiresAt: z.string().nullable(),
  expiresInSeconds: z.number().int().nonnegative().nullable(),
  items: z.array(sessionItemSchema),
  pendingWeight: sessionItemSchema.nullable(),
  latestTender: tenderSchema.nullable(),
  subtotalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  taxCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
});

export const startedSessionSchema = checkoutSessionSchema.extend({
  accessToken: z.string().min(20),
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

export const staffSignInResultSchema = z.object({
  accessToken: z.string().min(20),
  expiresAt: z.string(),
  staff: z.object({ code: z.string(), name: z.string(), locationId: z.string() }),
});

export const staffExceptionSchema = z.object({
  sessionId: z.string().uuid(),
  version: z.number().int().nonnegative(),
  since: z.string(),
  line: z.object({
    productId: z.string(),
    name: z.string(),
    expectedWeightGrams: z.number().int().nonnegative(),
  }),
});

export const staffExceptionsSchema = z.object({ exceptions: z.array(staffExceptionSchema) });

export const interventionResultSchema = z.object({
  sessionId: z.string().uuid(),
  state: z.string(),
  version: z.number().int().nonnegative(),
});

export const signOutResultSchema = z.object({ signedOut: z.literal(true) });

export const resetResultSchema = z.object({
  sessionId: z.string().uuid(),
  state: z.literal("reset"),
});
