import type { CreditCard, Installment, InstallmentPlan, Invoice, Transaction } from "./app-types";
import { addMonths, addMonthsToBillingMonth, getCardBillingMonth, getInvoiceDates, monthKey, normalizeBillingMonth } from "./billing";
import { invoiceOpenAmount, openInvoiceAmountForMonth, toMoney } from "./financial-ledger";

export type InstallmentAmountMode = "total" | "installment";

export type CreditCardMetrics = CreditCard & {
  current_invoice_amount: number;
  current_invoice_total: number;
  current_invoice_paid: number;
  open_balance: number;
  used_limit: number;
  available_limit: number;
  active_installments_count: number;
  due_date?: string | null;
};

export type PurchaseInstallmentDraft = {
  installment_number: number;
  installments_count: number;
  description: string;
  amount: number;
  due_date: string;
  billing_month: string;
};

function money(value: number | string | null | undefined) {
  return toMoney(value);
}

export function resolveInstallmentAmounts(rawAmount: number, installmentsCount: number, amountMode: InstallmentAmountMode) {
  const count = Math.max(0, Math.trunc(Number(installmentsCount || 0)));
  const amount = money(rawAmount);
  const mode = amountMode === "installment" ? "installment" : "total";

  if (count < 1 || amount <= 0) return { totalAmount: 0, amounts: [] as number[] };

  if (mode === "installment") {
    const amounts = Array.from({ length: count }, () => amount);
    return { totalAmount: money(amount * count), amounts };
  }

  const cents = Math.round(amount * 100);
  const base = Math.floor(cents / count);
  const remainder = cents % count;
  const amounts = Array.from({ length: count }, (_, index) => Number(((base + (index < remainder ? 1 : 0)) / 100).toFixed(2)));
  return { totalAmount: money(amount), amounts };
}

export function buildCreditPurchaseDrafts(input: {
  description: string;
  amountValue: number;
  amountMode: InstallmentAmountMode;
  installmentsCount: number;
  purchaseDate: string;
  card: Pick<CreditCard, "closing_day" | "due_day">;
}) {
  const resolved = resolveInstallmentAmounts(input.amountValue, input.installmentsCount, input.amountMode);
  const firstBillingMonth = getCardBillingMonth(input.purchaseDate, input.card.closing_day, input.card.due_day);
  const drafts: PurchaseInstallmentDraft[] = resolved.amounts.map((amount, index) => {
    const installmentNumber = index + 1;
    return {
      installment_number: installmentNumber,
      installments_count: input.installmentsCount,
      description: `${input.description} ${installmentNumber}/${input.installmentsCount}`,
      amount,
      due_date: addMonths(input.purchaseDate, index),
      billing_month: addMonthsToBillingMonth(firstBillingMonth, index)
    };
  });

  return {
    totalAmount: resolved.totalAmount,
    amounts: resolved.amounts,
    firstBillingMonth,
    drafts
  };
}

export function isCardExpenseOpen(transaction: Transaction) {
  return transaction.type === "card_expense" && !transaction.is_deleted && transaction.status !== "canceled" && !transaction.is_paid;
}

export function invoiceAmountForMonth(transactions: Transaction[], cardId: string, selectedMonth: string) {
  const normalized = normalizeBillingMonth(selectedMonth);
  return money(
    transactions
      .filter((transaction) => transaction.credit_card_id === cardId && isCardExpenseOpen(transaction) && normalizeBillingMonth(transaction.billing_month) === normalized)
      .reduce((sum, transaction) => sum + money(transaction.amount), 0)
  );
}

export function invoiceTotalForMonth(transactions: Transaction[], cardId: string, selectedMonth: string) {
  const normalized = normalizeBillingMonth(selectedMonth);
  return money(
    transactions
      .filter((transaction) => transaction.credit_card_id === cardId && transaction.type === "card_expense" && !transaction.is_deleted && transaction.status !== "canceled" && normalizeBillingMonth(transaction.billing_month) === normalized)
      .reduce((sum, transaction) => sum + money(transaction.amount), 0)
  );
}

function invoiceForCardMonth(invoices: Invoice[] | undefined, cardId: string, selectedMonth: string) {
  const normalized = normalizeBillingMonth(selectedMonth);
  return (invoices || []).find((invoice) => invoice.credit_card_id === cardId && normalizeBillingMonth(invoice.billing_month) === normalized && invoice.status !== "canceled");
}

export function openBalanceForCard(transactions: Transaction[], cardId: string, invoices?: Invoice[]) {
  if (invoices?.length) {
    return money(invoices.filter((invoice) => invoice.credit_card_id === cardId).reduce((sum, invoice) => sum + invoiceOpenAmount(invoice), 0));
  }

  return money(
    transactions
      .filter((transaction) => transaction.credit_card_id === cardId && isCardExpenseOpen(transaction))
      .reduce((sum, transaction) => sum + money(transaction.amount), 0)
  );
}

export function deriveCreditCardMetrics(cards: CreditCard[], transactions: Transaction[], plans: InstallmentPlan[], selectedMonth: string, invoices?: Invoice[]): CreditCardMetrics[] {
  return cards.map((card) => {
    const invoice = invoiceForCardMonth(invoices, card.id, selectedMonth);
    const fallbackOpenInvoice = invoiceAmountForMonth(transactions, card.id, selectedMonth);
    const fallbackInvoiceTotal = invoiceTotalForMonth(transactions, card.id, selectedMonth);
    const currentInvoiceTotal = invoice ? money(invoice.total_amount) : fallbackInvoiceTotal;
    const currentInvoicePaid = invoice ? money(invoice.paid_amount) : 0;
    const currentInvoiceOpen = invoice ? money(money(invoice.total_amount) - money(invoice.paid_amount)) : fallbackOpenInvoice;
    const openBalance = openBalanceForCard(transactions, card.id, invoices);
    const limit = money(card.limit_amount);
    const dates = getInvoiceDates(normalizeBillingMonth(selectedMonth), card.closing_day, card.due_day);

    return {
      ...card,
      current_invoice_amount: currentInvoiceOpen,
      current_invoice_total: currentInvoiceTotal,
      current_invoice_paid: currentInvoicePaid,
      open_balance: openBalance,
      used_limit: openBalance,
      available_limit: money(limit - openBalance),
      active_installments_count: plans.filter((plan) => plan.credit_card_id === card.id && plan.status === "active" && Number(plan.remaining_installments || 0) > 0).length,
      due_date: dates.due_date
    };
  });
}

export function getInstallmentStatusLabel(status: string | null | undefined) {
  return (
    {
      pending: "Pendente",
      paid: "Paga",
      anticipated: "Adiantada",
      canceled: "Cancelada"
    } as Record<string, string>
  )[status || ""] || "Pendente";
}

export function getInstallmentStatusFromTransaction(transaction: Transaction) {
  if (transaction.is_deleted || transaction.status === "canceled") return "canceled";
  if (transaction.is_paid) return "paid";
  const fromMetadata = typeof transaction.metadata?.installment_status === "string" ? transaction.metadata.installment_status : null;
  return fromMetadata || "pending";
}

export function buildPlanViews(plans: InstallmentPlan[], installments: Installment[], transactions: Transaction[], cards: CreditCard[]) {
  return plans
    .filter((plan) => plan.payment_method === "credit_card" && plan.status !== "canceled")
    .map((plan) => {
      const card = cards.find((item) => item.id === plan.credit_card_id);
      const planInstallments = installments
        .filter((item) => item.installment_plan_id === plan.id && item.status !== "canceled")
        .sort((a, b) => a.installment_number - b.installment_number)
        .map((installment) => {
          const transaction = transactions.find((item) => item.id === installment.transaction_id || item.installment_id === installment.id);
          return { ...installment, transaction, status: transaction ? getInstallmentStatusFromTransaction(transaction) : installment.status };
        });

      const remaining = planInstallments.filter((item) => item.status === "pending" || item.status === "anticipated").length;
      const paid = planInstallments.filter((item) => item.status === "paid").length;
      const first = planInstallments[0];
      const last = planInstallments[planInstallments.length - 1];

      return {
        ...plan,
        card,
        installments: planInstallments,
        remaining_count: remaining,
        paid_count: paid,
        first_billing_month: first?.billing_month || plan.metadata?.invoice_month || null,
        last_billing_month: last?.billing_month || null
      };
    })
    .sort((a, b) => String(b.first_date || "").localeCompare(String(a.first_date || "")));
}

export function buildCardFutureProjection(cards: CreditCard[], transactions: Transaction[], selectedMonth: string, monthsAhead = 4, invoices?: Invoice[]) {
  return cards.map((card) => {
    let cumulativeOpenBalance = 0;
    const months = Array.from({ length: monthsAhead }, (_, index) => {
      const billingMonth = addMonthsToBillingMonth(normalizeBillingMonth(selectedMonth), index);
      const invoice = invoiceForCardMonth(invoices, card.id, billingMonth);
      const invoiceAmount = invoice ? invoiceOpenAmount(invoice) : invoiceAmountForMonth(transactions, card.id, billingMonth);
      cumulativeOpenBalance = money(cumulativeOpenBalance + invoiceAmount);
      const invoiceDates = getInvoiceDates(billingMonth, card.closing_day, card.due_day);
      const projectedItemsCount = transactions.filter(
        (transaction) => transaction.credit_card_id === card.id && isCardExpenseOpen(transaction) && normalizeBillingMonth(transaction.billing_month) === billingMonth
      ).length;

      return {
        billing_month: billingMonth,
        month_label_key: monthKey(billingMonth),
        due_date: invoiceDates.due_date,
        projected_invoice_amount: invoiceAmount,
        projected_items_count: projectedItemsCount,
        cumulative_open_balance: cumulativeOpenBalance,
        projected_available_limit: money(Number(card.limit_amount || 0) - cumulativeOpenBalance)
      };
    });

    return { card, months };
  });
}

export function mergeMetadata(previous: unknown, next: Record<string, unknown>) {
  const base = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
  return { ...base, ...next };
}
