import type { Account, AccountSummary, Invoice, Transaction } from "./app-types";
import { normalizeBillingMonth } from "./billing";

export type BalanceMode = "realized" | "projected";

export type AccountBalanceOptions = {
  /**
   * Data limite para cálculo. Transações depois desta data são ignoradas.
   * Use para dashboard por dia e projeções controladas.
   */
  referenceDate?: string;
  /**
   * realized = somente lançamentos efetivados/postados.
   * projected = inclui também lançamentos planejados até a data limite.
   */
  mode?: BalanceMode;
};

export type MonthLedger = {
  month: string;
  referenceDate: string;
  income: number;
  directExpenses: number;
  invoicePayments: number;
  cashOut: number;
  cashNet: number;
  cardPurchases: number;
  cardOpenInvoices: number;
  cardOpenPurchasesFallback: number;
  accrualExpenses: number;
  accrualNet: number;
  plannedIncoming: number;
  plannedOutgoing: number;
};

export function toMoney(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export function toCents(value: number | string | null | undefined) {
  return Math.round(toMoney(value) * 100);
}

export function fromCents(value: number) {
  return Math.round(value) / 100;
}

export function isActiveTransaction(transaction: Transaction) {
  return !transaction.is_deleted && transaction.status !== "canceled";
}

export function isRealizedTransaction(transaction: Transaction) {
  return isActiveTransaction(transaction) && transaction.status === "posted";
}

export function isIncludedInBalance(transaction: Transaction, options: AccountBalanceOptions = {}) {
  if (!isActiveTransaction(transaction)) return false;
  if (options.referenceDate && transaction.date > options.referenceDate) return false;
  if ((options.mode || "realized") === "realized" && transaction.status !== "posted") return false;
  return true;
}

export function transactionTouchesAccount(transaction: Transaction, accountId: string) {
  return transaction.account_id === accountId || transaction.destination_account_id === accountId;
}

export function accountImpactCents(transaction: Transaction, accountId: string) {
  if (!transactionTouchesAccount(transaction, accountId)) return 0;

  const amount = toCents(transaction.amount);

  switch (transaction.type) {
    case "income":
      return transaction.account_id === accountId ? amount : 0;
    case "expense":
    case "invoice_payment":
      return transaction.account_id === accountId ? -amount : 0;
    case "transfer":
      if (transaction.account_id === accountId) return -amount;
      if (transaction.destination_account_id === accountId) return amount;
      return 0;
    case "adjust": {
      if (transaction.account_id !== accountId) return 0;
      const direction = transaction.metadata?.adjustment_direction === "subtract" ? "subtract" : "add";
      return direction === "subtract" ? -amount : amount;
    }
    case "card_expense":
      return 0;
    default:
      return 0;
  }
}

export function deriveAccountSummariesStrict(accounts: Account[], transactions: Transaction[], options: AccountBalanceOptions = {}): AccountSummary[] {
  const activeTransactions = transactions.filter((transaction) => isIncludedInBalance(transaction, options));

  return accounts.map((account) => {
    let balanceCents = toCents(account.initial_balance);
    let transactionCount = 0;

    for (const transaction of activeTransactions) {
      const impact = accountImpactCents(transaction, account.id);
      if (impact === 0) continue;
      transactionCount += 1;
      balanceCents += impact;
    }

    const balance = fromCents(balanceCents);

    return {
      ...account,
      current_balance: balance,
      derived_balance: balance,
      transaction_count: transactionCount
    };
  });
}

export function getTransactionCompetenceMonth(transaction: Transaction) {
  if (transaction.type === "card_expense" && transaction.billing_month) {
    return normalizeBillingMonth(transaction.billing_month).slice(0, 7);
  }
  return transaction.date?.slice(0, 7) || "";
}

function isUntil(date: string | null | undefined, referenceDate: string) {
  return Boolean(date && date <= referenceDate);
}

function isInMonth(date: string | null | undefined, month: string) {
  return Boolean(date?.startsWith(month));
}

function sumTransactionsCents(transactions: Transaction[], predicate: (transaction: Transaction) => boolean) {
  return transactions.reduce((sum, transaction) => (predicate(transaction) ? sum + toCents(transaction.amount) : sum), 0);
}

export function invoiceOpenAmount(invoice: Invoice) {
  if (invoice.status === "canceled") return 0;
  return Math.max(0, toMoney(invoice.total_amount) - toMoney(invoice.paid_amount));
}

export function openInvoicesForMonth(invoices: Invoice[], month: string) {
  return invoices.filter((invoice) => normalizeBillingMonth(invoice.billing_month).slice(0, 7) === month && invoice.status !== "canceled");
}

export function openInvoiceAmountForMonth(invoices: Invoice[], month: string) {
  return fromCents(openInvoicesForMonth(invoices, month).reduce((sum, invoice) => sum + toCents(invoiceOpenAmount(invoice)), 0));
}

export function buildMonthLedger(input: {
  transactions: Transaction[];
  invoices?: Invoice[];
  month: string;
  referenceDate: string;
}): MonthLedger {
  const { transactions, month, referenceDate } = input;
  const activeTransactions = transactions.filter(isActiveTransaction);
  const realizedUntilReference = activeTransactions.filter((transaction) => transaction.status === "posted" && isUntil(transaction.date, referenceDate));
  const monthCompetenceUntilReference = realizedUntilReference.filter((transaction) => getTransactionCompetenceMonth(transaction) === month);

  const income = sumTransactionsCents(monthCompetenceUntilReference, (transaction) => transaction.type === "income");
  const directExpenses = sumTransactionsCents(monthCompetenceUntilReference, (transaction) => transaction.type === "expense");
  const invoicePayments = sumTransactionsCents(monthCompetenceUntilReference, (transaction) => transaction.type === "invoice_payment");
  const cardPurchases = sumTransactionsCents(monthCompetenceUntilReference, (transaction) => transaction.type === "card_expense");

  const plannedIncoming = sumTransactionsCents(activeTransactions, (transaction) => transaction.type === "income" && transaction.status === "planned" && isInMonth(transaction.date, month));
  const plannedOutgoing = sumTransactionsCents(activeTransactions, (transaction) => ["expense", "invoice_payment"].includes(transaction.type) && transaction.status === "planned" && isInMonth(transaction.date, month));
  const plannedCardPurchases = sumTransactionsCents(activeTransactions, (transaction) => transaction.type === "card_expense" && transaction.status === "planned" && getTransactionCompetenceMonth(transaction) === month);

  const cardOpenPurchasesFallback = sumTransactionsCents(
    activeTransactions,
    (transaction) => transaction.type === "card_expense" && getTransactionCompetenceMonth(transaction) === month && !transaction.is_paid
  );
  const cardOpenInvoices = input.invoices?.length ? toCents(openInvoiceAmountForMonth(input.invoices, month)) : cardOpenPurchasesFallback;

  const cashOut = directExpenses + invoicePayments;
  const accrualExpenses = directExpenses + cardPurchases;

  return {
    month,
    referenceDate,
    income: fromCents(income),
    directExpenses: fromCents(directExpenses),
    invoicePayments: fromCents(invoicePayments),
    cashOut: fromCents(cashOut),
    cashNet: fromCents(income - cashOut),
    cardPurchases: fromCents(cardPurchases),
    cardOpenInvoices: fromCents(cardOpenInvoices),
    cardOpenPurchasesFallback: fromCents(cardOpenPurchasesFallback),
    accrualExpenses: fromCents(accrualExpenses),
    accrualNet: fromCents(income - accrualExpenses),
    plannedIncoming: fromCents(plannedIncoming),
    plannedOutgoing: fromCents(plannedOutgoing + plannedCardPurchases)
  };
}

export function projectedAccountBalance(accounts: AccountSummary[], plannedIncoming: number, plannedOutgoing: number) {
  const current = accounts.reduce((sum, account) => sum + toMoney(account.derived_balance), 0);
  return toMoney(current + plannedIncoming - plannedOutgoing);
}
