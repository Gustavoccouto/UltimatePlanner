import { normalizeBillingMonth } from "@/lib/domain/billing";
import { invoiceOpenAmount, toMoney } from "@/lib/domain/financial-ledger";
import { recalculateInvoicesForCardMonths, reconcileInstallmentPlan } from "@/lib/server/card-ledger";

type SupabaseLike = {
  from: (table: string) => any;
};

export type FinancialAuditIssue = {
  severity: "info" | "warning" | "error";
  entity: string;
  entityId?: string | null;
  message: string;
};

function money(value: number | string | null | undefined) {
  return toMoney(value);
}

function sameMoney(a: number | string | null | undefined, b: number | string | null | undefined) {
  return Math.abs(money(a) - money(b)) < 0.01;
}

async function readAll<T>(query: any): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message || "Erro ao auditar dados financeiros.");
  return (data || []) as T[];
}

export async function runFinancialAudit(supabase: SupabaseLike, ownerId: string, options: { repair?: boolean } = {}) {
  const [transactions, cards, invoices, plans, installments] = await Promise.all([
    readAll<any>(supabase.from("transactions").select("*").eq("owner_id", ownerId).eq("is_deleted", false)),
    readAll<any>(supabase.from("credit_cards").select("*").eq("owner_id", ownerId).eq("is_deleted", false)),
    readAll<any>(supabase.from("invoices").select("*").eq("owner_id", ownerId)),
    readAll<any>(supabase.from("installment_plans").select("*").eq("owner_id", ownerId)),
    readAll<any>(supabase.from("installments").select("*").eq("owner_id", ownerId))
  ]);

  const issues: FinancialAuditIssue[] = [];
  const touchedCardMonths = new Map<string, Set<string>>();
  const planIds = new Set<string>();

  function touchCardMonth(cardId?: string | null, billingMonth?: string | null) {
    if (!cardId || !billingMonth) return;
    const normalized = normalizeBillingMonth(billingMonth);
    if (!touchedCardMonths.has(cardId)) touchedCardMonths.set(cardId, new Set());
    touchedCardMonths.get(cardId)?.add(normalized);
  }

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const installmentsById = new Map(installments.map((installment) => [installment.id, installment]));
  const transactionsByInstallment = new Map<string, any>();

  for (const transaction of transactions) {
    if (transaction.installment_id) transactionsByInstallment.set(transaction.installment_id, transaction);

    if (transaction.type === "card_expense") {
      if (!transaction.credit_card_id) {
        issues.push({ severity: "error", entity: "transactions", entityId: transaction.id, message: "Compra no cartão sem credit_card_id." });
      }
      if (!transaction.billing_month) {
        issues.push({ severity: "error", entity: "transactions", entityId: transaction.id, message: "Compra no cartão sem competência de fatura." });
      }
      if (transaction.credit_card_id && !cardsById.has(transaction.credit_card_id)) {
        issues.push({ severity: "warning", entity: "transactions", entityId: transaction.id, message: "Compra vinculada a cartão inexistente ou excluído." });
      }
      touchCardMonth(transaction.credit_card_id, transaction.billing_month);
    }

    if (transaction.installment_plan_id) planIds.add(transaction.installment_plan_id);

    if (transaction.installment_id && !installmentsById.has(transaction.installment_id)) {
      issues.push({ severity: "warning", entity: "transactions", entityId: transaction.id, message: "Transação aponta para parcela inexistente." });
    }
  }

  for (const installment of installments) {
    if (installment.status !== "canceled" && installment.installment_plan_id) planIds.add(installment.installment_plan_id);
    if (installment.status !== "canceled" && installment.transaction_id && !transactions.some((transaction) => transaction.id === installment.transaction_id)) {
      issues.push({ severity: "warning", entity: "installments", entityId: installment.id, message: "Parcela aponta para transação inexistente, excluída ou cancelada." });
    }
    if (installment.status !== "canceled" && !installment.transaction_id && !transactionsByInstallment.has(installment.id)) {
      issues.push({ severity: "warning", entity: "installments", entityId: installment.id, message: "Parcela sem transação financeira vinculada." });
    }
  }

  for (const invoice of invoices) {
    const cardTransactions = transactions.filter(
      (transaction) =>
        transaction.type === "card_expense" &&
        transaction.credit_card_id === invoice.credit_card_id &&
        normalizeBillingMonth(transaction.billing_month) === normalizeBillingMonth(invoice.billing_month) &&
        transaction.status !== "canceled" &&
        !transaction.is_deleted
    );
    const expectedTotal = cardTransactions.reduce((sum, transaction) => sum + money(transaction.amount), 0);
    if (!sameMoney(invoice.total_amount, expectedTotal)) {
      issues.push({
        severity: "warning",
        entity: "invoices",
        entityId: invoice.id,
        message: `Fatura ${normalizeBillingMonth(invoice.billing_month).slice(0, 7)} tem total ${money(invoice.total_amount).toFixed(2)}, mas os lançamentos somam ${money(expectedTotal).toFixed(2)}.`
      });
      touchCardMonth(invoice.credit_card_id, invoice.billing_month);
    }
    if (invoiceOpenAmount(invoice) < 0) {
      issues.push({ severity: "warning", entity: "invoices", entityId: invoice.id, message: "Fatura com valor pago maior que o total." });
      touchCardMonth(invoice.credit_card_id, invoice.billing_month);
    }
  }

  if (options.repair) {
    for (const [cardId, months] of touchedCardMonths.entries()) {
      await recalculateInvoicesForCardMonths(supabase, ownerId, cardId, Array.from(months));
    }
    for (const planId of planIds) {
      await reconcileInstallmentPlan(supabase, ownerId, planId);
    }
  }

  return {
    repaired: Boolean(options.repair),
    checked: {
      transactions: transactions.length,
      creditCards: cards.length,
      invoices: invoices.length,
      installmentPlans: plans.length,
      installments: installments.length
    },
    touchedCardMonths: Array.from(touchedCardMonths.entries()).map(([cardId, months]) => ({ cardId, months: Array.from(months) })),
    touchedInstallmentPlans: Array.from(planIds),
    issues
  };
}
