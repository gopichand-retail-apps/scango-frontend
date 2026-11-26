import type { z } from "zod";
import {
  catalogSchema,
  checkoutSessionSchema,
  interventionResultSchema,
  publicModelSchema,
  receiptSchema,
  staffExceptionSchema,
  staffReasonCodes,
  staffSignInResultSchema,
  tenderResultSchema,
} from "./schemas";

export type PublicModel = z.infer<typeof publicModelSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type Product = Catalog["products"][number];
export type Category = Catalog["categories"][number];
export type CheckoutSession = z.infer<typeof checkoutSessionSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type TenderResult = z.infer<typeof tenderResultSchema>;
export type ThemeMode = "light" | "dark";
export type TenderMethod = "cash" | "simulated_card";
export type SimulationOutcome = "approve" | "decline";
export type StaffIdentity = z.infer<typeof staffSignInResultSchema>["staff"];
export type StaffException = z.infer<typeof staffExceptionSchema>;
export type InterventionResult = z.infer<typeof interventionResultSchema>;
export type StaffAction = "approve_weight" | "remove_item";
export type StaffReasonCode = (typeof staffReasonCodes)[number];
