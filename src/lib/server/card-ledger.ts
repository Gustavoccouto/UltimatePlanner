import { getInvoiceDates, normalizeBillingMonth } from "@/lib/domain/billing";

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

type SupabaseLike = {
  from: (table: string) => any;
};

export async function recalculateInvoiceForCardMonth(supabase: SupabaseLike, ownerId: string, cardId: string, billingMonthInput: string) {
  const billingMonth = normalizeBillingMonth(billingMonthInput);

  const { data: card, error: cardError } = await supabase
    .from("credit_cards")
    .select("*")
    .eq("id", cardId)
    .eq("owner_id", ownerId)
    .single();

  if (cardError || !card) throw new Error("Cartão não encontrado para recalcular a fatura.");

  const { data: cardTransactions, error: transactionsError } = await supabase
    .from("transactions")
    .select("amount")
    .eq("owner_id", ownerId)
    .eq("credit_card_id", cardId)
    .eq("billing_month", billingMonth)
    .eq("type", "card_expense")
    .eq("is_deleted", false)
    .neq("status", "canceled");

  if (transactionsError) throw new Error(transactionsError.message);

  const totalAmount = money((cardTransactions || []).reduce((sum: number, transaction: { amount: number | string }) => sum + money(transaction.amount), 0));

  const { data: existing } = await supabase
    .from("invoices")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("credit_card_id", cardId)
    .eq("billing_month", billingMonth)
    .maybeSingle();

  const paidAmount = Math.min(money(existing?.paid_amount), totalAmount);
  const dates = getInvoiceDates(billingMonth, Number(card.closing_day), Number(card.due_day));
  const status = totalAmount <= 0 && paidAmount <= 0 ? "open" : paidAmount >= totalAmount && totalAmount > 0 ? "paid" : "open";

  const { data, error } = await supabase
    .from("invoices")
    .upsert(
      {
        id: existing?.id,
        owner_id: ownerId,
        credit_card_id: cardId,
        billing_month: billingMonth,
        closing_date: dates.closing_date,
        due_date: dates.due_date,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        status,
        metadata: existing?.metadata || {}
      },
      { onConflict: "credit_card_id,billing_month" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function recalculateInvoicesForCardMonths(supabase: SupabaseLike, ownerId: string, cardId: string, billingMonths: Array<string | null | undefined>) {
  const uniqueMonths = Array.from(new Set(billingMonths.filter(Boolean).map((month) => normalizeBillingMonth(month || ""))));
  const results = [];
  for (const month of uniqueMonths) {
    results.push(await recalculateInvoiceForCardMonth(supabase, ownerId, cardId, month));
  }
  return results;
}

export async function reconcileInstallmentPlan(supabase: SupabaseLike, ownerId: string, planId: string) {
  const { data: installments, error: installmentsError } = await supabase
    .from("installments")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("installment_plan_id", planId)
    .neq("status", "canceled")
    .order("installment_number", { ascending: true });

  if (installmentsError) throw new Error(installmentsError.message);

  const activeInstallments = installments || [];
  const remaining = activeInstallments.filter((installment: any) => installment.status === "pending").length;
  const total = money(activeInstallments.reduce((sum: number, installment: any) => sum + money(installment.amount), 0));
  const status = activeInstallments.length === 0 ? "canceled" : remaining === 0 ? "settled" : "active";

  const { data, error } = await supabase
    .from("installment_plans")
    .update({
      total_amount: total,
      installments_count: activeInstallments.length,
      remaining_installments: remaining,
      status
    })
    .eq("owner_id", ownerId)
    .eq("id", planId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function applyInvoicePaymentToOpenInstallments(supabase: SupabaseLike, ownerId: string, input: {
  creditCardId: string;
  billingMonth: string;
  amount: number;
  paymentTransactionId: string;
}) {
  let remaining = money(input.amount);
  const billingMonth = normalizeBillingMonth(input.billingMonth);

  const { data: openTransactions, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("credit_card_id", input.creditCardId)
    .eq("billing_month", billingMonth)
    .eq("type", "card_expense")
    .eq("is_deleted", false)
    .eq("is_paid", false)
    .neq("status", "canceled")
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const touchedPlans = new Set<string>();
  const paidTransactionIds: string[] = [];

  for (const transaction of openTransactions || []) {
    const amount = money(transaction.amount);
    if (remaining + 0.00001 < amount) break;
    remaining = money(remaining - amount);
    paidTransactionIds.push(transaction.id);
    if (transaction.installment_plan_id) touchedPlans.add(transaction.installment_plan_id);

    const metadata = transaction.metadata && typeof transaction.metadata === "object" ? transaction.metadata : {};
    const { error: updateTxError } = await supabase
      .from("transactions")
      .update({
        is_paid: true,
        metadata: { ...metadata, installment_status: "paid", payment_transaction_id: input.paymentTransactionId, paid_at: new Date().toISOString() }
      })
      .eq("owner_id", ownerId)
      .eq("id", transaction.id);
    if (updateTxError) throw new Error(updateTxError.message);

    if (transaction.installment_id) {
      const { error: updateInstallmentError } = await supabase
        .from("installments")
        .update({ status: "paid", metadata: { payment_transaction_id: input.paymentTransactionId, paid_at: new Date().toISOString() } })
        .eq("owner_id", ownerId)
        .eq("id", transaction.installment_id);
      if (updateInstallmentError) throw new Error(updateInstallmentError.message);
    }
  }

  for (const planId of touchedPlans) {
    await reconcileInstallmentPlan(supabase, ownerId, planId);
  }

  return { paidTransactionIds, remaining };
}
