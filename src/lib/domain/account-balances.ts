import type { Account, AccountSummary, Transaction } from "./app-types";
import { deriveAccountSummariesStrict } from "./financial-ledger";

export function deriveAccountSummaries(accounts: Account[], transactions: Transaction[]): AccountSummary[] {
  return deriveAccountSummariesStrict(accounts, transactions, { mode: "realized" });
}

export function labelAccountType(type: string) {
  return (
    {
      checking: "Conta corrente",
      savings: "Poupança",
      investment: "Investimento"
    } as Record<string, string>
  )[type] || type;
}

export function labelTransactionType(type: string) {
  return (
    {
      income: "Receita",
      expense: "Despesa",
      transfer: "Transferência",
      adjust: "Ajuste",
      card_expense: "Despesa no cartão",
      invoice_payment: "Pagamento de fatura"
    } as Record<string, string>
  )[type] || type;
}

export function labelTransactionStatus(status: string) {
  return (
    {
      posted: "Lançada",
      planned: "Agendada",
      canceled: "Cancelada"
    } as Record<string, string>
  )[status] || status;
}

export function labelCategoryType(type: string) {
  return (
    {
      income: "Receita",
      expense: "Despesa",
      transfer: "Transferência",
      investment: "Investimento",
      project: "Projeto",
      goal: "Meta",
      card: "Cartão"
    } as Record<string, string>
  )[type] || type;
}
