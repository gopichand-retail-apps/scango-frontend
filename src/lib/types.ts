import type { z } from "zod";
import { catalogSchema, checkoutSessionSchema, publicModelSchema, receiptSchema, tenderResultSchema } from "./schemas";

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
