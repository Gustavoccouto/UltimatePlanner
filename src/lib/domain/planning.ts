import type { CreditCard, Installment, InstallmentPlan, Transaction } from "./app-types";
import { getCardBillingMonth } from "./billing";

export type RecurringFrequency = "weekly" | "monthly" | "quarterly" | "yearly";
export type RecurringRuleType = "recurring_income" | "recurring_expense";
export type RecurringTargetType = "account" | "card";
export type InstallmentAmountMode = "total" | "installment";

export type RecurringRule = {
  id: string;
  owner_id: string;
  legacy_id?: string | null;
  name: string;
  rule_type: RecurringRuleType;
  target_type: RecurringTargetType;
  account_id?: string | null;
  credit_card_id?: string | null;
  category_id?: string | null;
  amount: number | string;
  frequency: RecurringFrequency;
  start_date: string;
  end_date?: string | null;
  next_occurrence?: string | null;
  notes?: string | null;
  is_active: boolean;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

const MAX_RECURRING_OCCURRENCES = 240;
const DEFAULT_PLANNING_HORIZON_MONTHS = 12;

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateInput: string, days: number) {
  const [year, month, day] = dateInput.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addMonths(dateInput: string, months: number) {
  const [year, month, day] = dateInput.split("-").map(Number);
  const safeYear = year || new Date().getUTCFullYear();
  const safeMonth = month || 1;
  const safeDay = day || 1;
  const date = new Date(Date.UTC(safeYear, safeMonth - 1 + months, 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(safeDay, lastDay));
  return date.toISOString().slice(0, 10);
}

export function addFrequency(dateInput: string, frequency: RecurringFrequency, step = 1) {
  if (frequency === "weekly") return addDays(dateInput, 7 * step);
  if (frequency === "quarterly") return addMonths(dateInput, 3 * step);
  if (frequency === "yearly") return addMonths(dateInput, 12 * step);
  return addMonths(dateInput, step);
}

export function buildOccurrences(rule: Pick<RecurringRule, "start_date" | "end_date" | "frequency">, horizonEndInput?: string) {
  const horizonEnd = horizonEndInput || addMonths(todayInput(), DEFAULT_PLANNING_HORIZON_MONTHS);
  const occurrences: string[] = [];
  let cursor = rule.start_date;
  let guard = 0;

  while (cursor && cursor <= horizonEnd && guard < MAX_RECURRING_OCCURRENCES) {
    if (!rule.end_date || cursor <= rule.end_date) occurrences.push(cursor);
    cursor = addFrequency(cursor, rule.frequency || "monthly", 1);
    guard += 1;
  }

  return occurrences;
}

export function getNextOccurrenceDate(rule: RecurringRule, transactions: Transaction[] = [], fromDate = todayInput()) {
  const generatedKeys = new Set(
    transactions
      .filter((transaction) => transaction.recurring_rule_id === rule.id && !transaction.is_deleted)
      .map((transaction) => transaction.recurrence_key)
  );

  for (const occurrenceDate of buildOccurrences(rule)) {
    if (occurrenceDate < fromDate) continue;
    const key = `${rule.id}__${occurrenceDate}`;
    if (!generatedKeys.has(key)) return occurrenceDate;
  }

  return "";
}

export function labelFrequency(frequency: string | null | undefined) {
  return (
    {
      weekly: "Semanal",
      monthly: "Mensal",
      quarterly: "Trimestral",
      yearly: "Anual"
    } as Record<string, string>
  )[frequency || ""] || "Mensal";
}

export function labelRuleType(type: string | null | undefined) {
  return (
    {
      recurring_income: "Receita recorrente",
      recurring_expense: "Gasto recorrente"
    } as Record<string, string>
  )[type || ""] || "Recorrência";
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
  return { totalAmount: amount, amounts };
}

export function buildDebitInstallmentDrafts(input: {
  description: string;
  amountValue: number;
  amountMode: InstallmentAmountMode;
  installmentsCount: number;
  firstDate: string;
}) {
  const resolved = resolveInstallmentAmounts(input.amountValue, input.installmentsCount, input.amountMode);
  const drafts = resolved.amounts.map((amount, index) => {
    const installmentNumber = index + 1;
    return {
      installment_number: installmentNumber,
      installments_count: input.installmentsCount,
      description: `${input.description} ${installmentNumber}/${input.installmentsCount}`,
      amount,
      due_date: addMonths(input.firstDate, index)
    };
  });

  return { totalAmount: resolved.totalAmount, amounts: resolved.amounts, drafts };
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

export function buildDebitPlanViews(plans: InstallmentPlan[], installments: Installment[], transactions: Transaction[]) {
  return plans
    .filter((plan) => plan.payment_method === "debit" && plan.status !== "canceled")
    .map((plan) => {
      const planInstallments = installments
        .filter((installment) => installment.installment_plan_id === plan.id && installment.status !== "canceled")
        .sort((a, b) => a.installment_number - b.installment_number)
        .map((installment) => {
          const transaction = transactions.find((item) => item.id === installment.transaction_id || item.installment_id === installment.id);
          return { ...installment, transaction };
        });

      const settledCount = planInstallments.filter((item) => item.status !== "pending").length;
      const remainingCount = planInstallments.length - settledCount;
      return {
        ...plan,
        installments: planInstallments,
        settled_count: settledCount,
        remaining_count: remainingCount,
        progress_percent: planInstallments.length ? Math.round((settledCount / planInstallments.length) * 100) : 0
      };
    })
    .sort((a, b) => String(b.first_date || "").localeCompare(String(a.first_date || "")));
}

export function buildRecurringTransactionDraft(rule: RecurringRule, occurrenceDate: string, card?: Pick<CreditCard, "closing_day" | "due_day"> | null) {
  const isCardExpense = rule.rule_type === "recurring_expense" && rule.target_type === "card";
  const recurrenceKey = `${rule.id}__${occurrenceDate}`;
  return {
    description: rule.name,
    type: rule.rule_type === "recurring_income" ? "income" : isCardExpense ? "card_expense" : "expense",
    amount: money(rule.amount),
    date: occurrenceDate,
    billing_month: isCardExpense && card ? getCardBillingMonth(occurrenceDate, card.closing_day, card.due_day) : null,
    account_id: isCardExpense ? null : rule.account_id || null,
    destination_account_id: null,
    credit_card_id: isCardExpense ? rule.credit_card_id || null : null,
    category_id: rule.category_id || null,
    recurring_rule_id: rule.id,
    recurrence_key: recurrenceKey,
    status: "posted",
    is_paid: false,
    notes: rule.notes || null,
    metadata: { is_recurring_generated: true, recurrence_key: recurrenceKey },
    is_deleted: false
  };
}
