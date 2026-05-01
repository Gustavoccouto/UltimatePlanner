import type {
  Account,
  AccountSummary,
  CreditCard,
  Goal,
  Installment,
  Investment,
  InvestmentAccount,
  InvestmentTransaction,
  Invoice,
  Project,
  ProjectMovement,
  Transaction
} from "@/lib/domain/app-types";
import { investmentCurrentValue, portfolioSummary, toNumber } from "@/lib/domain/investments";
import {
  buildMonthLedger,
  deriveAccountSummariesStrict,
  getTransactionCompetenceMonth,
  projectedAccountBalance,
  toMoney
} from "@/lib/domain/financial-ledger";

export type FinancialSnapshotInput = {
  accounts: Account[];
  transactions: Transaction[];
  creditCards: CreditCard[];
  invoices: Invoice[];
  installments: Installment[];
  projects: Project[];
  projectMovements: ProjectMovement[];
  goals: Goal[];
  investments: Investment[];
  investmentAccounts: InvestmentAccount[];
  investmentTransactions: InvestmentTransaction[];
};

export type DashboardReferenceSummary = {
  month: string;
  referenceDate: string;
  accounts: AccountSummary[];
  totalAccountBalance: number;
  projectedMonthEndBalance: number;
  income: number;
  expenses: number;
  directExpenses: number;
  cashOut: number;
  cashNet: number;
  accrualExpenses: number;
  accrualNet: number;
  cardExpenses: number;
  invoicePayments: number;
  net: number;
  openCardInvoices: number;
  plannedIncoming: number;
  plannedOutgoing: number;
  goalsProgressAverage: number;
  goalsMissingAmount: number;
  projectsCash: number;
  projectsMissingAmount: number;
  investmentsCurrentValue: number;
  investmentsCash: number;
  totalPatrimony: number;
  recentTransactions: Transaction[];
  upcomingInstallments: Installment[];
  warnings: string[];
};

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function isActiveTransaction(transaction: Transaction) {
  return !transaction.is_deleted && transaction.status !== "canceled";
}

function isUntil(date: string | null | undefined, referenceDate: string) {
  return Boolean(date && date <= referenceDate);
}

function projectCash(project: Project, movements: ProjectMovement[]) {
  const movementTotal = movements
    .filter((movement) => !movement.is_deleted && movement.project_id === project.id)
    .reduce((sum, movement) => {
      const amount = toNumber(movement.amount);
      if (movement.type === "remove") return sum - amount;
      if (movement.type === "adjust") return amount;
      return sum + amount;
    }, 0);
  return movementTotal || toNumber(project.current_amount);
}

function goalProgress(goal: Goal) {
  const target = toNumber(goal.target_amount);
  return target > 0 ? Math.min((toNumber(goal.current_amount) / target) * 100, 100) : 0;
}

export function buildDashboardReferenceSummary(input: FinancialSnapshotInput, month: string, referenceDate: string): DashboardReferenceSummary {
  const activeTransactions = input.transactions.filter(isActiveTransaction);
  const scopedTransactions = activeTransactions
    .filter((transaction) => getTransactionCompetenceMonth(transaction) === month && isUntil(transaction.date, referenceDate))
    .sort((a, b) => `${b.date}${b.created_at || ""}`.localeCompare(`${a.date}${a.created_at || ""}`));

  const accounts = deriveAccountSummariesStrict(input.accounts.filter((account) => !account.is_deleted), activeTransactions, {
    referenceDate,
    mode: "realized"
  });

  const ledger = buildMonthLedger({
    transactions: activeTransactions,
    invoices: input.invoices,
    month,
    referenceDate
  });

  const activeGoals = input.goals.filter((goal) => !goal.is_deleted && goal.status !== "archived" && goal.status !== "canceled");
  const goalsProgressAverage = activeGoals.length
    ? activeGoals.reduce((sum, goal) => sum + goalProgress(goal), 0) / activeGoals.length
    : 0;
  const goalsMissingAmount = activeGoals.reduce((sum, goal) => sum + Math.max(toNumber(goal.target_amount) - toNumber(goal.current_amount), 0), 0);

  const activeProjects = input.projects.filter((project) => !project.is_deleted && project.status !== "archived" && project.status !== "canceled");
  const projectsCash = activeProjects.reduce((sum, project) => sum + projectCash(project, input.projectMovements), 0);
  const projectsMissingAmount = activeProjects.reduce((sum, project) => sum + Math.max(toNumber(project.target_amount) - projectCash(project, input.projectMovements), 0), 0);

  const portfolio = portfolioSummary(input.investments, input.investmentAccounts, input.investmentTransactions);
  const totalAccountBalance = accounts.reduce((sum, account) => sum + toMoney(account.derived_balance), 0);
  const projectedMonthEnd = projectedAccountBalance(accounts, ledger.plannedIncoming, ledger.plannedOutgoing);
  const warnings: string[] = [];

  for (const account of accounts) {
    if (toMoney(account.derived_balance) < 0) warnings.push(`Conta ${account.name} está negativa.`);
  }
  if (ledger.cashOut > ledger.income && ledger.income > 0) warnings.push("As saídas de caixa do mês estão acima das entradas até a data de referência.");
  if (ledger.cardOpenInvoices > totalAccountBalance && ledger.cardOpenInvoices > 0) warnings.push("Faturas abertas superam o saldo atual em contas.");
  if (projectedMonthEnd < 0) warnings.push("A projeção do mês fica negativa considerando entradas e saídas planejadas.");
  if (ledger.cardPurchases > 0 && ledger.invoicePayments > 0) warnings.push("Compras no cartão e pagamentos de fatura são mostrados separados para evitar dupla contagem no caixa.");

  return {
    month,
    referenceDate,
    accounts,
    totalAccountBalance: roundMoney(totalAccountBalance),
    projectedMonthEndBalance: roundMoney(projectedMonthEnd),
    income: roundMoney(ledger.income),
    expenses: roundMoney(ledger.cashOut),
    directExpenses: roundMoney(ledger.directExpenses),
    cashOut: roundMoney(ledger.cashOut),
    cashNet: roundMoney(ledger.cashNet),
    accrualExpenses: roundMoney(ledger.accrualExpenses),
    accrualNet: roundMoney(ledger.accrualNet),
    cardExpenses: roundMoney(ledger.cardPurchases),
    invoicePayments: roundMoney(ledger.invoicePayments),
    net: roundMoney(ledger.cashNet),
    openCardInvoices: roundMoney(ledger.cardOpenInvoices),
    plannedIncoming: roundMoney(ledger.plannedIncoming),
    plannedOutgoing: roundMoney(ledger.plannedOutgoing),
    goalsProgressAverage: Math.round(goalsProgressAverage),
    goalsMissingAmount: roundMoney(goalsMissingAmount),
    projectsCash: roundMoney(projectsCash),
    projectsMissingAmount: roundMoney(projectsMissingAmount),
    investmentsCurrentValue: roundMoney(portfolio.currentValue),
    investmentsCash: roundMoney(portfolio.brokerageCash),
    totalPatrimony: roundMoney(totalAccountBalance + portfolio.totalPatrimony),
    recentTransactions: scopedTransactions.slice(0, 8),
    upcomingInstallments: input.installments
      .filter((installment) => !["paid", "canceled"].includes(installment.status) && (installment.due_date >= referenceDate || String(installment.billing_month || "").slice(0, 7) >= month))
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 8),
    warnings
  };
}

export function buildAiContext(input: FinancialSnapshotInput, summary: DashboardReferenceSummary) {
  const topAccounts = summary.accounts
    .slice()
    .sort((a, b) => toNumber(b.derived_balance) - toNumber(a.derived_balance))
    .slice(0, 6)
    .map((account) => ({ name: account.name, institution: account.institution, balance: toNumber(account.derived_balance) }));

  const activeCards = input.creditCards
    .filter((card) => !card.is_deleted && !card.is_archived)
    .map((card) => ({ name: card.name, limit: toNumber(card.limit_amount), closing_day: card.closing_day, due_day: card.due_day }));

  const largestExpenses = input.transactions
    .filter((transaction) => !transaction.is_deleted && ["expense", "card_expense", "invoice_payment"].includes(transaction.type))
    .sort((a, b) => toNumber(b.amount) - toNumber(a.amount))
    .slice(0, 8)
    .map((transaction) => ({ description: transaction.description, type: transaction.type, amount: toNumber(transaction.amount), date: transaction.date, billing_month: transaction.billing_month }));

  const portfolio = portfolioSummary(input.investments, input.investmentAccounts, input.investmentTransactions);
  const investmentPositions = input.investments
    .filter((investment) => !investment.is_deleted)
    .sort((a, b) => investmentCurrentValue(b) - investmentCurrentValue(a))
    .slice(0, 8)
    .map((investment) => ({ name: investment.name, ticker: investment.ticker, type: investment.asset_type, quantity: toNumber(investment.quantity), current_value: investmentCurrentValue(investment) }));

  const goals = input.goals
    .filter((goal) => !goal.is_deleted && goal.status !== "archived")
    .slice(0, 8)
    .map((goal) => ({ name: goal.name, target: toNumber(goal.target_amount), current: toNumber(goal.current_amount), progress_percent: goalProgress(goal), due_date: goal.due_date }));

  const projects = input.projects
    .filter((project) => !project.is_deleted && project.status !== "archived")
    .slice(0, 8)
    .map((project) => ({ name: project.name, target: toNumber(project.target_amount), cash: projectCash(project, input.projectMovements), status: project.status }));

  const safetyMarginNow = roundMoney(summary.totalAccountBalance - summary.openCardInvoices);
  const projectedSafetyMargin = roundMoney(summary.projectedMonthEndBalance - summary.openCardInvoices);
  const riskLevel = projectedSafetyMargin < 0 || safetyMarginNow < 0
    ? "alto"
    : projectedSafetyMargin < Math.max(summary.income * 0.08, 250)
      ? "médio"
      : "baixo";
  const decisionSummary = riskLevel === "alto"
    ? "A margem está pressionada: faturas abertas e projeção exigem cautela antes de assumir novo gasto."
    : riskLevel === "médio"
      ? "Existe alguma margem, mas compras novas precisam respeitar prioridade e data de pagamento."
      : "A margem parece saudável pelos dados atuais, mantendo atenção a faturas e gastos planejados.";

  return {
    generated_at: new Date().toISOString(),
    reference: {
      month: summary.month,
      reference_date: summary.referenceDate
    },
    cash_flow: {
      total_account_balance: summary.totalAccountBalance,
      projected_month_end_balance: summary.projectedMonthEndBalance,
      income_until_reference_date: summary.income,
      cash_out_until_reference_date: summary.cashOut,
      cash_net_until_reference_date: summary.cashNet,
      direct_expenses_until_reference_date: summary.directExpenses,
      card_purchases_by_invoice_competence: summary.cardExpenses,
      invoice_payments_until_reference_date: summary.invoicePayments,
      accrual_net_without_double_counting_invoice_payment: summary.accrualNet,
      planned_incoming_month: summary.plannedIncoming,
      planned_outgoing_month: summary.plannedOutgoing,
      open_card_invoices: summary.openCardInvoices
    },
    patrimony: {
      total_with_investments: summary.totalPatrimony,
      investments_current_value: summary.investmentsCurrentValue,
      investments_cash: summary.investmentsCash,
      brokerage_cash: portfolio.brokerageCash,
      investment_result: portfolio.result,
      investment_profitability: portfolio.profitability
    },
    top_accounts: topAccounts,
    credit_cards: activeCards,
    largest_recent_expenses: largestExpenses,
    goals,
    projects,
    investment_positions: investmentPositions,
    warnings: summary.warnings,
    interpretation_rules: [
      "Pagamento de fatura reduz caixa; compra no cartão entra na competência da fatura, mas não reduz saldo de conta no dia da compra.",
      "cash_net evita dupla contagem entre compras no cartão e pagamento de fatura.",
      "accrual_net mostra a visão por competência financeira, sem somar pagamento da mesma fatura como nova despesa."
    ],
    decision_support: {
      safety_margin_now: safetyMarginNow,
      projected_safety_margin: projectedSafetyMargin,
      risk_level: riskLevel,
      summary: decisionSummary,
      purchase_evaluation_rules: [
        "Para compra no crédito, compare a parcela/fatura com a projeção da data de pagamento, não apenas com saldo de hoje.",
        "Para débito ou compra à vista, compare com saldo atual e obrigações abertas.",
        "Para compra parcelada, considere o compromisso mensal total e não apenas a primeira parcela."
      ]
    }
  };
}
