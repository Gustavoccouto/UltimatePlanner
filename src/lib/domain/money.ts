import type { MoneyInput } from "./types";

export function toCents(value: MoneyInput): number {
  if (value === null || value === undefined || value === "") return 0;
  const normalized = typeof value === "string" ? value.replace(".", "").replace(",", ".") : value;
  return Math.round(Number(normalized) * 100);
}

export function fromCents(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

export function currencyBRL(value: MoneyInput): string {
  const number = typeof value === "number" ? value : Number(value || 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
}
