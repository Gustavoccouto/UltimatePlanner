import { bulkPut } from "./storage.js";
import { enqueueSync } from "./sync.js";
import { nowIso, formatDateInput, addMonthsToDateInput, compareDateInputs, getTodayDateInput, parseDateInput } from "../utils/dates.js";
import { getCardBillingMonth } from "../utils/calculations.js";

export const PLANNING_RULE_KIND = "transaction_rule";
export const RULE_TYPES = {
  recurringIncome: "recurring_income",
  recurringExpense: "recurring_expense",
};
export const DEBIT_INSTALLMENT_METHOD = "debit";
export const CREDIT_INSTALLMENT_METHOD = "credit_card";
export const INSTALLMENT_STATUS = {
  pending: "pending",
  paid: "paid",
  anticipated: "anticipated",
};

const MAX_RECURRING_OCCURRENCES = 240;
const PLANNING_HORIZON_MONTHS = 12;

export function isPlanningRule(record) {
  return record?.kind === PLANNING_RULE_KIND && !record.isDeleted;
}

export function getRecurringRules(preferences = []) {
  return preferences.filter(isPlanningRule);
}

export function getCreditInstallmentPlans(plans = []) {
  return plans.filter(
    (plan) => !plan.isDeleted && plan.paymentMethod !== DEBIT_INSTALLMENT_METHOD,
  );
}

export function getDebitInstallmentPlans(plans = []) {
  return plans.filter(
    (plan) => !plan.isDeleted && plan.paymentMethod === DEBIT_INSTALLMENT_METHOD,
  );
}

export function getInstallmentStatus(transaction) {
  if (transaction?.installmentStatus === INSTALLMENT_STATUS.anticipated) {
    return INSTALLMENT_STATUS.anticipated;
  }
  if (transaction?.installmentStatus === INSTALLMENT_STATUS.paid || transaction?.isPaid) {
    return INSTALLMENT_STATUS.paid;
  }
  return INSTALLMENT_STATUS.pending;
}

export function getInstallmentStatusLabel(status) {
  return ({
    [INSTALLMENT_STATUS.pending]: "Pendente",
    [INSTALLMENT_STATUS.paid]: "Pago",
    [INSTALLMENT_STATUS.anticipated]: "Antecipado",
  }[status] || "Pendente");
}

export function getInstallmentStatusBadge(status) {
  return ({
    [INSTALLMENT_STATUS.pending]: "badge-warning",
    [INSTALLMENT_STATUS.paid]: "badge-success",
    [INSTALLMENT_STATUS.anticipated]: "badge-muted",
  }[status] || "badge-warning");
}

export function buildInstallmentPlanView(plan, transactions = [], cards = []) {
  const cardById = cards.reduce((acc, card) => {
    if (card?.id) acc[card.id] = card;
    return acc;
  }, {});

  const installments = transactions
    .filter((transaction) => !transaction.isDeleted && transaction.installmentPlanId === plan.id)
    .sort((a, b) => {
      const aOrder = Number(a.installmentNumber || 0);
      const bOrder = Number(b.installmentNumber || 0);
      if (aOrder !== bOrder) return aOrder - bOrder;
      return compareDateInputs(a.date, b.date);
    })
    .map((transaction) => ({
      ...transaction,
      computedStatus: getInstallmentStatus(transaction),
    }));

  const settledCount = installments.filter(
    (transaction) => transaction.computedStatus !== INSTALLMENT_STATUS.pending,
  ).length;

  const remainingInstallments = installments.length - settledCount;

  return {
    ...plan,
    card: cardById[plan.cardId] || null,
    installments,
    settledCount,
    remainingInstallments,
    progressPercent: installments.length ? Math.round((settledCount / installments.length) * 100) : 0,
  };
}

export function describeRuleBinding(rule, accounts = [], cards = []) {
  if (rule.targetType === "card") {
    const card = cards.find((item) => item.id === rule.cardId);
    return card ? `Cartão • ${card.name}` : "Cartão removido";
  }
  const account = accounts.find((item) => item.id === rule.accountId);
  return account ? `Conta • ${account.name}` : "Conta removida";
}

export function getFrequencyLabel(frequency) {
  return ({
    monthly: "Mensal",
    weekly: "Semanal",
    quarterly: "Trimestral",
    yearly: "Anual",
  }[frequency] || "Mensal");
}

export function getRuleTypeLabel(ruleType) {
  return ({
    [RULE_TYPES.recurringIncome]: "Receita recorrente",
    [RULE_TYPES.recurringExpense]: "Gasto recorrente",
  }[ruleType] || "Regra recorrente");
}

export function getNextOccurrenceDate(rule, transactions = []) {
  if (!parseDateInput(rule.startDate)) return "";

  const generatedKeys = new Set(
    transactions
      .filter((transaction) => transaction.recurringRuleId === rule.id && !transaction.isDeleted)
      .map((transaction) => transaction.recurrenceKey),
  );

  let cursor = rule.startDate;
  let guard = 0;

  while (guard < MAX_RECURRING_OCCURRENCES) {
    const occurrenceDate = formatDateInput(cursor);
    if (!occurrenceDate) break;

    const occurrenceKey = `${rule.id}__${occurrenceDate}`;
    if (!generatedKeys.has(occurrenceKey) && isWithinRuleRange(rule, occurrenceDate)) {
      return occurrenceDate;
    }

    cursor = addFrequency(occurrenceDate, rule.frequency, 1);
    guard += 1;
    if (!cursor) break;
  }

  return "";
}

export function getRecurringRuleFutureCleanupUpdates(...args) {
  let ruleId = "";
  let transactions = [];
  let fromDate = getTodayDateInput();

  if (args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])) {
    const input = args[0];
    ruleId = input.ruleId || input.recurringRuleId || input.rule?.id || input.id || "";
    transactions = Array.isArray(input.transactions) ? input.transactions : [];
    fromDate = input.fromDate || input.cutoffDate || fromDate;
  } else {
    const [firstArg, secondArg, thirdArg] = args;
    if (typeof firstArg === "string") {
      ruleId = firstArg;
    } else if (firstArg && typeof firstArg === "object") {
      ruleId = firstArg.id || firstArg.ruleId || firstArg.recurringRuleId || "";
    }
    transactions = Array.isArray(secondArg) ? secondArg : [];
    fromDate = thirdArg || fromDate;
  }

  if (!ruleId || !Array.isArray(transactions) || !transactions.length) {
    return [];
  }

  const timestamp = nowIso();

  return transactions
    .filter((transaction) => {
      if (!transaction || transaction.isDeleted) return false;
      if (transaction.recurringRuleId !== ruleId) return false;
      if (!transaction.date) return false;
      return compareDateInputs(transaction.date, fromDate) >= 0;
    })
    .map((transaction) => ({
      ...transaction,
      isDeleted: true,
      updatedAt: timestamp,
      version: Number(transaction.version || 0) + 1,
      syncStatus: "pending",
    }));
}

export async function materializePlanningEntries({
  preferences = [],
  installmentPlans = [],
  transactions = [],
  creditCards = [],
} = {}) {
  const recurringRules = getRecurringRules(preferences);
  const duplicateTransactionUpdates = getDuplicatePlanningTransactionUpdates(transactions);
  const orphanRecurringFutureCleanupUpdates = getOrphanRecurringFutureCleanupUpdates(
    transactions,
    recurringRules,
  );

  const duplicateIds = new Set(duplicateTransactionUpdates.map((item) => item.id));
  const orphanCleanupIds = new Set(orphanRecurringFutureCleanupUpdates.map((item) => item.id));

  const effectiveTransactions = transactions.map((transaction) =>
    duplicateIds.has(transaction.id) || orphanCleanupIds.has(transaction.id)
      ? { ...transaction, isDeleted: true }
      : transaction,
  );

  const existingRecurrenceKeys = new Set(
    effectiveTransactions
      .filter((transaction) => !transaction.isDeleted && transaction.recurrenceKey)
      .map((transaction) => transaction.recurrenceKey),
  );

  const cardsById = creditCards.reduce((acc, card) => {
    if (card?.id) acc[card.id] = card;
    return acc;
  }, {});

  const horizonEnd = addMonthsToDateInput(getTodayDateInput(), PLANNING_HORIZON_MONTHS);
  const timestamp = nowIso();
  const generatedTransactions = [];

  for (const rule of recurringRules) {
    const occurrences = buildOccurrences(rule, horizonEnd);

    for (const occurrenceDate of occurrences) {
      const recurrenceKey = `${rule.id}__${occurrenceDate}`;
      if (existingRecurrenceKeys.has(recurrenceKey)) continue;

      const card = cardsById[rule.cardId];
      const isCardExpense =
        rule.ruleType === RULE_TYPES.recurringExpense && rule.targetType === "card";

      generatedTransactions.push({
        id: buildRecurringTransactionId(rule.id, occurrenceDate),
        description: rule.name,
        type:
          rule.ruleType === RULE_TYPES.recurringIncome
            ? "income"
            : isCardExpense
              ? "card_expense"
              : "expense",
        accountId: isCardExpense ? "" : rule.accountId || "",
        cardId: isCardExpense ? rule.cardId || "" : "",
        amount: Number(rule.amount || 0),
        category: rule.category || "",
        date: occurrenceDate,
        billingMonth: isCardExpense
          ? getCardBillingMonth(occurrenceDate, card?.closingDay, card?.dueDay)
          : "",
        notes: rule.notes || "",
        status: "posted",
        isPaid: false,
        recurringRuleId: rule.id,
        recurrenceKey,
        isRecurringGenerated: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
        syncStatus: "pending",
        isDeleted: false,
      });

      existingRecurrenceKeys.add(recurrenceKey);
    }
  }

  const planUpdates = getAllPlanRemainingUpdates(installmentPlans, effectiveTransactions);
  const transactionUpdates = [
    ...duplicateTransactionUpdates,
    ...orphanRecurringFutureCleanupUpdates,
  ];

  if (!generatedTransactions.length && !planUpdates.length && !transactionUpdates.length) {
    return { created: 0, updatedPlans: 0, deduped: 0, cleanedRecurringFuture: 0 };
  }

  if (transactionUpdates.length) {
    await bulkPut("transactions", transactionUpdates, { skipInvalid: true });
    await Promise.all(
      transactionUpdates.map((transaction) => enqueueSync("transactions", transaction.id)),
    );
  }

  if (generatedTransactions.length) {
    await bulkPut("transactions", generatedTransactions, { skipInvalid: true });
    await Promise.all(
      generatedTransactions.map((transaction) => enqueueSync("transactions", transaction.id)),
    );
  }

  if (planUpdates.length) {
    await bulkPut("installmentPlans", planUpdates, { skipInvalid: true });
    await Promise.all(planUpdates.map((plan) => enqueueSync("installmentPlans", plan.id)));
  }

  return {
    created: generatedTransactions.length,
    updatedPlans: planUpdates.length,
    deduped: duplicateTransactionUpdates.length,
    cleanedRecurringFuture: orphanRecurringFutureCleanupUpdates.length,
  };
}

export function getAllPlanRemainingUpdates(plans = [], transactions = []) {
  const timestamp = nowIso();

  return plans
    .filter((plan) => !plan.isDeleted)
    .map((plan) => {
      const relatedTransactions = transactions.filter(
        (transaction) => !transaction.isDeleted && transaction.installmentPlanId === plan.id,
      );

      if (!relatedTransactions.length) return null;

      const remainingInstallments = relatedTransactions.filter(
        (transaction) => getInstallmentStatus(transaction) === INSTALLMENT_STATUS.pending,
      ).length;

      if (remainingInstallments === Number(plan.remainingInstallments || 0)) {
        return null;
      }

      return {
        ...plan,
        remainingInstallments,
        updatedAt: timestamp,
        version: Number(plan.version || 0) + 1,
        syncStatus: "pending",
      };
    })
    .filter(Boolean);
}

function buildOccurrences(rule, horizonEnd) {
  if (!parseDateInput(rule.startDate)) return [];

  const occurrences = [];
  let cursor = rule.startDate;
  let guard = 0;

  while (
    cursor &&
    compareDateInputs(cursor, horizonEnd) <= 0 &&
    guard < MAX_RECURRING_OCCURRENCES
  ) {
    const occurrenceDate = formatDateInput(cursor);
    if (!occurrenceDate) break;

    if (isWithinRuleRange(rule, occurrenceDate)) {
      occurrences.push(occurrenceDate);
    }

    cursor = addFrequency(occurrenceDate, rule.frequency, 1);
    guard += 1;
  }

  return occurrences;
}

function isWithinRuleRange(rule, occurrenceDate) {
  if (!occurrenceDate) return false;
  if (rule.endDate && compareDateInputs(occurrenceDate, rule.endDate) > 0) {
    return false;
  }
  return compareDateInputs(occurrenceDate, rule.startDate) >= 0;
}

function addFrequency(dateInput, frequency = "monthly", step = 1) {
  const baseDate = parseDateInput(dateInput);
  if (!baseDate) return null;

  if (frequency === "weekly") {
    const nextDate = new Date(baseDate.getTime());
    nextDate.setDate(nextDate.getDate() + 7 * step);
    return formatDateInput(nextDate);
  }

  if (frequency === "quarterly") {
    return addMonthsToDateInput(dateInput, 3 * step);
  }

  if (frequency === "yearly") {
    return addMonthsToDateInput(dateInput, 12 * step);
  }

  return addMonthsToDateInput(dateInput, step);
}

function buildRecurringTransactionId(ruleId, occurrenceDate) {
  const safeRule = String(ruleId || "rule")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_");
  const safeDate = String(occurrenceDate || "date").replace(/[^0-9]/g, "");
  return `tx_rule_${safeRule}_${safeDate}`;
}

function getDuplicatePlanningTransactionUpdates(transactions = []) {
  const timestamp = nowIso();
  const candidates = transactions.filter((transaction) => !transaction.isDeleted);
  const duplicateUpdates = [];

  for (const keySelector of [
    (transaction) => transaction.recurrenceKey || "",
    (transaction) =>
      transaction.installmentPlanId && transaction.installmentNumber
        ? `plan__${transaction.installmentPlanId}__${transaction.installmentNumber}`
        : "",
  ]) {
    const grouped = new Map();

    for (const transaction of candidates) {
      const key = keySelector(transaction);
      if (!key) continue;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(transaction);
    }

    for (const group of grouped.values()) {
      if (group.length <= 1) continue;

      const sorted = [...group].sort((a, b) => {
        const aUpdated = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bUpdated = new Date(b.updatedAt || b.createdAt || 0).getTime();
        if (aUpdated !== bUpdated) return bUpdated - aUpdated;
        return String(b.id).localeCompare(String(a.id));
      });

      const keeper = sorted[0]?.id;

      sorted.slice(1).forEach((transaction) => {
        if (transaction.id === keeper) return;
        duplicateUpdates.push({
          ...transaction,
          isDeleted: true,
          updatedAt: timestamp,
          version: Number(transaction.version || 0) + 1,
          syncStatus: "pending",
        });
      });
    }
  }

  const uniqueById = new Map();
  duplicateUpdates.forEach((transaction) => {
    uniqueById.set(transaction.id, transaction);
  });

  return [...uniqueById.values()];
}

function getOrphanRecurringFutureCleanupUpdates(
  transactions = [],
  recurringRules = [],
  fromDate = getTodayDateInput(),
) {
  const activeRuleIds = new Set(recurringRules.map((rule) => rule.id));
  const timestamp = nowIso();

  return transactions
    .filter((transaction) => {
      if (!transaction || transaction.isDeleted) return false;
      if (!transaction.recurringRuleId) return false;
      if (activeRuleIds.has(transaction.recurringRuleId)) return false;
      if (!transaction.date) return false;
      return compareDateInputs(transaction.date, fromDate) >= 0;
    })
    .map((transaction) => ({
      ...transaction,
      isDeleted: true,
      updatedAt: timestamp,
      version: Number(transaction.version || 0) + 1,
      syncStatus: "pending",
    }));
}
