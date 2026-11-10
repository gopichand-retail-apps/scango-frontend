import type { PublicModel } from "./types";

export function copy(model: PublicModel, key: string): string {
  const value = model.messages[key];
  if (typeof value !== "string") {
    throw new TypeError(`Missing content string: ${key}`);
  }
  return value;
}

export function nestedCopy(model: PublicModel, section: string, key: string): string {
  const values = model.messages[section];
  if (typeof values !== "object" || values === null || !Object.hasOwn(values, key)) {
    throw new TypeError(`Missing content string: ${section}.${key}`);
  }
  const value = Reflect.get(values, key);
  if (typeof value !== "string") {
    throw new TypeError(`Invalid content string: ${section}.${key}`);
  }
  return value;
}

export function formatMoney(model: PublicModel, cents: number): string {
  const negative = cents < 0;
  const absoluteCents = Math.abs(cents);
  const whole = Math.floor(absoluteCents / 100);
  const fraction = String(absoluteCents % 100).padStart(2, "0");
  const formattedWhole = new Intl.NumberFormat(model.locale, {
    style: "currency",
    currency: model.data.app.currency,
    maximumFractionDigits: 0,
  }).format(whole);
  return `${negative ? "-" : ""}${formattedWhole}.${fraction}`;
}

export function formatDate(model: PublicModel, value: string): string {
  return new Intl.DateTimeFormat(model.locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function formatNumber(model: PublicModel, value: number): string {
  return new Intl.NumberFormat(model.locale).format(value);
}
