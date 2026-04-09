import { TRANSACTION_TYPES } from "./constants.js";
import { groupBy, sumBy } from "./helpers.js";
import {
  toMonthKey,
  isInMonth,
  isOnOrBeforeMonth,
  addMonthsToMonthKey,
  monthLabel,
  parseDateInput,
  compareDateInputs,
} from "./dates.js";

export function getCardBillingMonth(purchaseDate, closingDay, dueDay) {
  if (!purchaseDate) return "";
  const purchase = parseDateInput(purchaseDate);
  if (!purchase) return "";

  const closing = Math.min(Math.max(Number(closingDay || 31), 1), 31);
  const due = Math.min(Math.max(Number(dueDay || 1), 1), 31);
  const purchaseDay = purchase.getDate();
  const dueOffset = due > closing ? 0 : 1;
  const closingOffset = purchaseDay > closing ? 1 : 0;

  return addMonthsToMonthKey(
    toMonthKey(purchase),
    dueOffset + closingOffset,
  );
}

export function getBillingMonthDate(monthKey, dueDay) {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-").map(Number);
  const safeDueDay = Math.min(Math.max(Number(dueDay || 1), 1), 31);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(safeDueDay, lastDay)).padStart(2, "0")}`;
}

export function getCardsById(cards = []) {
  return cards.reduce((acc, card) => {
    if (card?.id) acc[card.id] = card;
    return acc;
  }, {});
}

export function getTransactionCompetenceMonth(transaction, cardsById = {}) {
  if (!transaction || transaction.isDeleted) return "";
  if (transaction.type === TRANSACTION_TYPES.cardExpense) {
    if (transaction.billingMonth) return transaction.billingMonth;

    const card = cardsById[transaction.cardId];
    return (
      getCardBillingMonth(transaction.date, card?.closingDay, card?.dueDay) ||
      toMonthKey(transaction.date)
    );
  }
  return toMonthKey(transaction.date);
}

export function isTransactionInMonth(
  transaction,
  selectedMonth,
  cardsById = {},
) {
  if (!selectedMonth) return !transaction?.isDeleted;
  return (
    getTransactionCompetenceMonth(transaction, cardsById) === selectedMonth
  );
}

export function isTransactionOnOrBeforeMonth(
  transaction,
  selectedMonth,
  cardsById = {},
) {
  if (!selectedMonth) return !transaction?.isDeleted;
  const txMonth = getTransactionCompetenceMonth(transaction, cardsById);
  return !!txMonth && txMonth <= selectedMonth;
}

export function getTransactionsForMonth(
  transactions,
  selectedMonth,
  cards = [],
) {
  const cardsById = getCardsById(cards);
  return transactions.filter(
    (tx) => !tx.isDeleted && isTransactionInMonth(tx, selectedMonth, cardsById),
  );
}

export function getTransactionsUpToMonth(
  transactions,
  selectedMonth,
  cards = [],
) {
  const cardsById = getCardsById(cards);
  return transactions.filter(
    (tx) =>
      !tx.isDeleted &&
      isTransactionOnOrBeforeMonth(tx, selectedMonth, cardsById),
  );
}

export function deriveAccountBalances(accounts, transactions, selectedMonth) {
  const scopedTransactions = selectedMonth
    ? getTransactionsUpToMonth(transactions, selectedMonth)
    : transactions.filter((tx) => !tx.isDeleted);

  return accounts.map((account) => {
    const relevant = scopedTransactions.filter(
      (tx) =>
        tx.accountId === account.id || tx.destinationAccountId === account.id,
    );

    const balance = relevant.reduce((sum, tx) => {
      const amount = Number(tx.amount || 0);
      if (tx.type === TRANSACTION_TYPES.income && tx.accountId === account.id)
        return sum + amount;
      if (tx.type === TRANSACTION_TYPES.expense && tx.accountId === account.id)
        return sum - amount;
      if (
        tx.type === TRANSACTION_TYPES.adjustment &&
        tx.accountId === account.id
      )
        return sum + amount;
      if (tx.type === TRANSACTION_TYPES.transfer) {
        if (tx.accountId === account.id) return sum - amount;
        if (tx.destinationAccountId === account.id) return sum + amount;
      }
      return sum;
    }, 0);

    return { ...account, derivedBalance: balance };
  });
}

export function deriveCardMetrics(
  cards,
  transactions,
  installmentPlans = [],
  selectedMonth = null,
) {
  const cardsById = getCardsById(cards);

  return cards
    .filter((card) => !card.isDeleted)
    .map((card) => {
      const cardExpenses = transactions.filter(
        (tx) =>
          !tx.isDeleted &&
          tx.type === TRANSACTION_TYPES.cardExpense &&
          tx.cardId === card.id,
      );
      const monthExpenses = selectedMonth
        ? cardExpenses.filter((tx) =>
            isTransactionInMonth(tx, selectedMonth, cardsById),
          )
        : cardExpenses;
      const invoiceOpen = monthExpenses.filter((tx) => !tx.isPaid);
      const unpaidAllCycles = cardExpenses.filter((tx) => !tx.isPaid);

      const currentInvoiceAmount = sumBy(invoiceOpen, (tx) => tx.amount);
      const usedLimit = sumBy(unpaidAllCycles, (tx) => tx.amount);
      const availableLimit = Math.max(
        0,
        Number(card.limitAmount || 0) - usedLimit,
      );
      const paidThisMonth = sumBy(
        monthExpenses.filter((tx) => tx.isPaid),
        (tx) => tx.amount,
      );
      const activeInstallments = installmentPlans.filter(
        (plan) =>
          !plan.isDeleted &&
          plan.cardId === card.id &&
          plan.remainingInstallments > 0 &&
          (!selectedMonth ||
            isOnOrBeforeMonth(plan.purchaseDate, selectedMonth)),
      );

      return {
        ...card,
        currentInvoiceAmount,
        availableLimit,
        usedLimit,
        paidThisMonth,
        activeInstallmentsCount: activeInstallments.length,
        invoiceMonth: selectedMonth,
        invoiceDueDate: getBillingMonthDate(selectedMonth, card.dueDay),
      };
    });
}

export function dashboardSummary({
  accounts,
  transactions,
  goals,
  creditCards,
  investments,
  installmentPlans,
  selectedMonth,
}) {
  const activeTx = getTransactionsForMonth(
    transactions,
    selectedMonth,
    creditCards,
  );
  const cardsWithMetrics = deriveCardMetrics(
    creditCards,
    transactions,
    installmentPlans,
    selectedMonth,
  );
  const balanceTotal = sumBy(accounts, (a) => a.derivedBalance || 0);
  const income = sumBy(
    activeTx.filter((t) => t.type === TRANSACTION_TYPES.income),
    (t) => t.amount,
  );
  const expense = sumBy(
    activeTx.filter((t) =>
      [TRANSACTION_TYPES.expense, TRANSACTION_TYPES.cardExpense].includes(
        t.type,
      ),
    ),
    (t) => t.amount,
  );
  const openInvoices = sumBy(
    cardsWithMetrics,
    (c) => c.currentInvoiceAmount || 0,
  );
  const goalsProgress = goals.length
    ? goals.reduce(
        (acc, goal) =>
          acc + ((goal.currentAmount || 0) / (goal.targetAmount || 1)) * 100,
        0,
      ) / goals.length
    : 0;
  const invested = sumBy(
    investments.filter((i) => !i.isDeleted),
    (i) => i.currentValue || i.amountInvested || 0,
  );
  const recentExpenses = activeTx
    .filter((t) =>
      [TRANSACTION_TYPES.expense, TRANSACTION_TYPES.cardExpense].includes(
        t.type,
      ),
    )
    .sort((a, b) => compareDateInputs(b.date, a.date))
    .slice(0, 5);
  const recentIncomes = activeTx
    .filter((t) => t.type === TRANSACTION_TYPES.income)
    .sort((a, b) => compareDateInputs(b.date, a.date))
    .slice(0, 5);

  return {
    balanceTotal,
    income,
    expense,
    net: income - expense,
    openInvoices,
    goalsProgress,
    invested,
    recentExpenses,
    recentIncomes,
    cardsWithMetrics,
  };
}

export function monthlyFlow(transactions, selectedMonth = null, cards = []) {
  const cardsById = getCardsById(cards);
  const grouped = groupBy(
    transactions.filter((t) => !t.isDeleted),
    (t) => getTransactionCompetenceMonth(t, cardsById),
  );
  let points = Object.entries(grouped)
    .filter(([month]) => !!month)
    .map(([month, items]) => ({
      month,
      income: sumBy(
        items.filter((i) => i.type === TRANSACTION_TYPES.income),
        (i) => i.amount,
      ),
      expense: sumBy(
        items.filter((i) =>
          [TRANSACTION_TYPES.expense, TRANSACTION_TYPES.cardExpense].includes(
            i.type,
          ),
        ),
        (i) => i.amount,
      ),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  if (selectedMonth) {
    points = points.filter((item) => item.month <= selectedMonth);
  }

  return points;
}

export function totalsByType(transactions) {
  return transactions
    .filter((item) => !item.isDeleted)
    .reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + Number(item.amount || 0);
      return acc;
    }, {});
}

export function buildCardFutureProjection(
  cards,
  transactions,
  selectedMonth,
  horizon = 4,
) {
  const cardsById = getCardsById(cards);
  const startMonth = selectedMonth || toMonthKey(new Date());

  return cards
    .filter((card) => !card.isDeleted)
    .map((card) => {
      const cardExpenses = transactions.filter(
        (tx) =>
          !tx.isDeleted &&
          tx.type === TRANSACTION_TYPES.cardExpense &&
          tx.cardId === card.id,
      );
      const months = Array.from({ length: horizon }, (_, index) => {
        const monthKey = addMonthsToMonthKey(startMonth, index);
        const invoiceItems = cardExpenses.filter(
          (tx) => !tx.isPaid && isTransactionInMonth(tx, monthKey, cardsById),
        );
        const projectedInvoiceAmount = sumBy(invoiceItems, (tx) => tx.amount);
        const projectedItemsCount = invoiceItems.length;
        const cumulativeOpenBalance = sumBy(
          cardExpenses.filter(
            (tx) =>
              !tx.isPaid &&
              getTransactionCompetenceMonth(tx, cardsById) <= monthKey,
          ),
          (tx) => tx.amount,
        );
        const projectedAvailableLimit = Math.max(
          0,
          Number(card.limitAmount || 0) - cumulativeOpenBalance,
        );

        return {
          monthKey,
          monthLabel: monthLabel(monthKey),
          dueDate: getBillingMonthDate(monthKey, card.dueDay),
          projectedInvoiceAmount,
          projectedItemsCount,
          cumulativeOpenBalance,
          projectedAvailableLimit,
        };
      });

      return {
        cardId: card.id,
        cardName: card.name,
        cardBrand: card.brand,
        limitAmount: Number(card.limitAmount || 0),
        months,
      };
    });
}
