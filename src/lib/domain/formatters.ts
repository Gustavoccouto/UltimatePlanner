export function currencyBRL(value: number | string | null | undefined) {
  const normalized = Number(value || 0);
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number.isFinite(normalized) ? normalized : 0);
}

export function datePt(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1))
  );
}

export function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export function monthInput(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function isInMonth(date: string, month: string) {
  return Boolean(date?.startsWith(month));
}

export function percent(value: number | string | null | undefined) {
  const normalized = Number(value || 0);
  return `${Math.round(Number.isFinite(normalized) ? normalized : 0)}%`;
}
