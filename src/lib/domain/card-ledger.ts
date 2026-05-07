import type { CreditCard, Installment, InstallmentPlan, Invoice, Transaction } from "./app-types";
import {
  addMonths,
  addMonthsToBillingMonth,
  getCardBillingMonth,
  getInvoiceDates,
  monthKey,
  normalizeBillingMonth
} from "./billing";
import { toMoney } from "./financial-ledger";

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

function isActiveTransaction(transaction: Transaction) {
  return !transaction.is_deleted && transaction.status !== "canceled";
}

function isActiveInvoice(invoice: Invoice) {
  return invoice.status !== "canceled";
}

function activeCardExpenses(transactions: Transaction[], cardId: string) {
  return transactions.filter(
    (transaction) =>
      transaction.credit_card_id === cardId &&
      transaction.type === "card_expense" &&
      isActiveTransaction(transaction)
  );
}

function invoicePaidAmountForMonth(invoices: Invoice[] | undefined, cardId: string, selectedMonth: string) {
  const normalized = normalizeBillingMonth(selectedMonth);
  const invoice = (invoices || []).find(
    (item) =>
      item.credit_card_id === cardId &&
      normalizeBillingMonth(item.billing_month) === normalized &&
      isActiveInvoice(item)
  );

  return money(invoice?.paid_amount || 0);
}

export function resolveInstallmentAmounts(
  rawAmount: number,
  installmentsCount: number,
  amountMode: InstallmentAmountMode
) {
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
  const amounts = Array.from({ length: count }, (_, index) =>
    Number(((base + (index < remainder ? 1 : 0)) / 100).toFixed(2))
  );

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

  return { totalAmount: resolved.totalAmount, amounts: resolved.amounts, firstBillingMonth, drafts };
}

export function isCardExpenseOpen(transaction: Transaction) {
  return transaction.type === "card_expense" && isActiveTransaction(transaction) && !transaction.is_paid;
}

export function invoiceAmountForMonth(transactions: Transaction[], cardId: string, selectedMonth: string) {
  const normalized = normalizeBillingMonth(selectedMonth);

  return money(
    activeCardExpenses(transactions, cardId)
      .filter(
        (transaction) =>
          !transaction.is_paid &&
          normalizeBillingMonth(transaction.billing_month || transaction.date) === normalized
      )
      .reduce((sum, transaction) => sum + money(transaction.amount), 0)
  );
}

export function invoiceTotalForMonth(transactions: Transaction[], cardId: string, selectedMonth: string) {
  const normalized = normalizeBillingMonth(selectedMonth);

  return money(
    activeCardExpenses(transactions, cardId)
      .filter((transaction) => normalizeBillingMonth(transaction.billing_month || transaction.date) === normalized)
      .reduce((sum, transaction) => sum + money(transaction.amount), 0)
  );
}

function invoiceOpenAmountFromTransactions(
  transactions: Transaction[],
  invoices: Invoice[] | undefined,
  cardId: string,
  selectedMonth: string
) {
  const total = invoiceTotalForMonth(transactions, cardId, selectedMonth);
  const paid = invoicePaidAmountForMonth(invoices, cardId, selectedMonth);

  return money(Math.max(total - paid, 0));
}

export function openBalanceForCard(transactions: Transaction[], cardId: string, invoices?: Invoice[]) {
  /*
   * Fonte de verdade do limite: transactions ativas.
   *
   * Antes, quando existiam invoices, o limite podia ser calculado por faturas antigas/stale.
   * Isso fazia compras já excluídas/canceladas continuarem consumindo limite.
   */
  const months = new Set(
    activeCardExpenses(transactions, cardId).map((transaction) =>
      normalizeBillingMonth(transaction.billing_month || transaction.date)
    )
  );

  return money(
    Array.from(months).reduce((sum, billingMonth) => {
      return sum + invoiceOpenAmountFromTransactions(transactions, invoices, cardId, billingMonth);
    }, 0)
  );
}

export function deriveCreditCardMetrics(
  cards: CreditCard[],
  transactions: Transaction[],
  plans: InstallmentPlan[],
  selectedMonth: string,
  invoices?: Invoice[]
): CreditCardMetrics[] {
  return cards.map((card) => {
    const currentInvoiceTotal = invoiceTotalForMonth(transactions, card.id, selectedMonth);
    const currentInvoicePaid = Math.min(invoicePaidAmountForMonth(invoices, card.id, selectedMonth), currentInvoiceTotal);
    const currentInvoiceOpen = money(Math.max(currentInvoiceTotal - currentInvoicePaid, 0));
    const openBalance = openBalanceForCard(transactions, card.id, invoices);
    const limit = money(card.limit_amount);
    const dates = getInvoiceDates(normalizeBillingMonth(selectedMonth), card.closing_day, card.due_day);
    const activePlanIds = new Set(
      activeCardExpenses(transactions, card.id)
        .filter((transaction) => isCardExpenseOpen(transaction) && transaction.installment_plan_id)
        .map((transaction) => transaction.installment_plan_id)
    );

    return {
      ...card,
      current_invoice_amount: currentInvoiceOpen,
      current_invoice_total: currentInvoiceTotal,
      current_invoice_paid: currentInvoicePaid,
      open_balance: openBalance,
      used_limit: openBalance,
      available_limit: money(limit - openBalance),
      active_installments_count: activePlanIds.size,
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

  const metadata = transaction.metadata as Record<string, unknown> | null | undefined;
  const fromMetadata = typeof metadata?.installment_status === "string" ? metadata.installment_status : null;

  return fromMetadata || "pending";
}

export function buildPlanViews(
  plans: InstallmentPlan[],
  installments: Installment[],
  transactions: Transaction[],
  cards: CreditCard[]
) {
  return plans
    .filter((plan) => plan.payment_method === "credit_card" && plan.status !== "canceled")
    .map((plan) => {
      const card = cards.find((item) => item.id === plan.credit_card_id);

      const planInstallments = installments
        .filter((item) => item.installment_plan_id === plan.id && item.status !== "canceled")
        .sort((a, b) => a.installment_number - b.installment_number)
        .map((installment) => {
          const transaction = transactions.find(
            (item) =>
              (item.id === installment.transaction_id || item.installment_id === installment.id) &&
              isActiveTransaction(item)
          );

          const status = transaction ? getInstallmentStatusFromTransaction(transaction) : installment.status;

          return { ...installment, transaction, status };
        })
        .filter((installment) => installment.status !== "canceled");

      const remaining = planInstallments.filter((item) => item.status === "pending" || item.status === "anticipated").length;
      const paid = planInstallments.filter((item) => item.status === "paid").length;
      const first = planInstallments[0];
      const last = planInstallments[planInstallments.length - 1];
      const metadata = plan.metadata as Record<string, unknown> | null | undefined;

      return {
        ...plan,
        card,
        installments: planInstallments,
        remaining_count: remaining,
        paid_count: paid,
        first_billing_month: first?.billing_month || metadata?.invoice_month || null,
        last_billing_month: last?.billing_month || null
      };
    })
    .filter((plan) => plan.installments.length > 0 && plan.status !== "canceled")
    .sort((a, b) => String(b.first_date || "").localeCompare(String(a.first_date || "")));
}

export function buildCardFutureProjection(
  cards: CreditCard[],
  transactions: Transaction[],
  selectedMonth: string,
  monthsAhead = 4,
  invoices?: Invoice[]
) {
  return cards.map((card) => {
    let cumulativeOpenBalance = 0;

    const months = Array.from({ length: monthsAhead }, (_, index) => {
      const billingMonth = addMonthsToBillingMonth(normalizeBillingMonth(selectedMonth), index);
      const invoiceAmount = invoiceOpenAmountFromTransactions(transactions, invoices, card.id, billingMonth);

      cumulativeOpenBalance = money(cumulativeOpenBalance + invoiceAmount);

      const invoiceDates = getInvoiceDates(billingMonth, card.closing_day, card.due_day);
      const projectedItemsCount = activeCardExpenses(transactions, card.id).filter(
        (transaction) =>
          !transaction.is_paid &&
          normalizeBillingMonth(transaction.billing_month || transaction.date) === billingMonth
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
