function asDate(dateInput: string): Date {
  const normalized = normalizeBillingMonth(dateInput).length === 10 ? normalizeBillingMonth(dateInput) : dateInput;
  const [year, month, day] = normalized.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day || 1));
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function clampDay(year: number, monthIndex: number, day: number): number {
  return Math.min(day, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate());
}

export function normalizeBillingMonth(month: string | null | undefined): string {
  if (!month) return "";
  if (/^\d{4}-\d{2}$/.test(month)) return `${month}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(month)) return `${month.slice(0, 7)}-01`;
  return month;
}

export function monthKey(month: string | null | undefined): string {
  if (!month) return "";
  return month.slice(0, 7);
}

export function addMonths(dateInput: string, months: number): string {
  const date = asDate(dateInput);
  const targetMonth = date.getUTCMonth() + months;
  const year = date.getUTCFullYear();
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(year, targetMonth, 1));
  target.setUTCDate(clampDay(target.getUTCFullYear(), target.getUTCMonth(), day));
  return formatDate(target);
}

export function addMonthsToBillingMonth(monthInput: string, months: number): string {
  return normalizeBillingMonth(addMonths(normalizeBillingMonth(monthInput), months));
}

export function getCardBillingMonth(purchaseDateInput: string, closingDay: number, dueDay: number): string {
  const purchaseDate = asDate(purchaseDateInput);
  const purchaseYear = purchaseDate.getUTCFullYear();
  const purchaseMonth = purchaseDate.getUTCMonth();
  const closingDate = new Date(Date.UTC(purchaseYear, purchaseMonth, clampDay(purchaseYear, purchaseMonth, closingDay)));

  const belongsToNextInvoice = purchaseDate.getTime() > closingDate.getTime();
  const invoiceMonthDate = new Date(Date.UTC(purchaseYear, purchaseMonth + (belongsToNextInvoice ? 1 : 0), 1));

  return `${invoiceMonthDate.getUTCFullYear()}-${String(invoiceMonthDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function getInvoiceDates(billingMonthInput: string, closingDay: number, dueDay: number) {
  const billingMonth = asDate(normalizeBillingMonth(billingMonthInput));
  const year = billingMonth.getUTCFullYear();
  const month = billingMonth.getUTCMonth();
  const closingDate = new Date(Date.UTC(year, month, clampDay(year, month, closingDay)));
  const dueMonthOffset = dueDay <= closingDay ? 1 : 0;
  const dueBase = new Date(Date.UTC(year, month + dueMonthOffset, 1));
  const dueDate = new Date(Date.UTC(dueBase.getUTCFullYear(), dueBase.getUTCMonth(), clampDay(dueBase.getUTCFullYear(), dueBase.getUTCMonth(), dueDay)));

  return {
    billing_month: formatDate(new Date(Date.UTC(year, month, 1))),
    closing_date: formatDate(closingDate),
    due_date: formatDate(dueDate)
  };
}
