import type { Investment, InvestmentAccount, InvestmentTransaction } from "@/lib/domain/app-types";

export function toNumber(value: number | string | null | undefined) {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

export function investmentCost(investment: Pick<Investment, "quantity" | "average_price">) {
  return toNumber(investment.quantity) * toNumber(investment.average_price);
}

export function investmentCurrentValue(investment: Pick<Investment, "quantity" | "current_price">) {
  return toNumber(investment.quantity) * toNumber(investment.current_price);
}

export function investmentResult(investment: Pick<Investment, "quantity" | "average_price" | "current_price">) {
  return investmentCurrentValue(investment) - investmentCost(investment);
}

export function investmentProfitability(investment: Pick<Investment, "quantity" | "average_price" | "current_price">) {
  const cost = investmentCost(investment);
  return cost > 0 ? (investmentResult(investment) / cost) * 100 : 0;
}

export function portfolioSummary(investments: Investment[], accounts: InvestmentAccount[] = [], transactions: InvestmentTransaction[] = []) {
  const activeInvestments = investments.filter((investment) => !investment.is_deleted);
  const activeAccounts = accounts.filter((account) => !account.is_deleted);
  const activeTransactions = transactions.filter((transaction) => !transaction.is_deleted);

  const totalInvested = activeInvestments.reduce((sum, investment) => sum + investmentCost(investment), 0);
  const currentValue = activeInvestments.reduce((sum, investment) => sum + investmentCurrentValue(investment), 0);
  const result = currentValue - totalInvested;
  const profitability = totalInvested > 0 ? (result / totalInvested) * 100 : 0;
  const brokerageCash = activeAccounts.reduce((sum, account) => sum + toNumber(account.cash_balance), 0);
  const dividends = activeTransactions
    .filter((transaction) => ["dividend", "yield"].includes(transaction.type))
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);
  const fees = activeTransactions
    .filter((transaction) => transaction.type === "fee")
    .reduce((sum, transaction) => sum + toNumber(transaction.amount), 0);

  return {
    totalInvested,
    currentValue,
    result,
    profitability,
    brokerageCash,
    dividends,
    fees,
    totalPatrimony: currentValue + brokerageCash,
    activeAssets: activeInvestments.length,
    brokerages: activeAccounts.length
  };
}

export function assetTypeLabel(type: string) {
  switch (type) {
    case "stock": return "Ação";
    case "etf": return "ETF";
    case "fii": return "FII";
    case "fixed_income": return "Renda fixa";
    case "crypto": return "Cripto";
    case "fund": return "Fundo";
    case "savings": return "Poupança";
    default: return "Outro";
  }
}

export function investmentTransactionLabel(type: string) {
  switch (type) {
    case "buy": return "Compra";
    case "sell": return "Venda";
    case "deposit": return "Depósito";
    case "withdraw": return "Retirada";
    case "dividend": return "Dividendo/provento";
    case "yield": return "Rendimento";
    case "fee": return "Taxa/custo";
    case "adjust": return "Ajuste";
    default: return type;
  }
}
