import { toNumber } from "@/lib/domain/investments";

export async function createInvestmentActivityLog(supabase: any, params: {
  ownerId: string;
  actorId: string;
  entityType: "investment_account" | "investment" | "investment_transaction" | "investment_allocation_target";
  entityId?: string | null;
  actionType: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
}) {
  await supabase.from("activity_logs").insert({
    owner_id: params.ownerId,
    actor_id: params.actorId,
    entity_type: params.entityType,
    entity_id: params.entityId || null,
    action_type: params.actionType,
    previous_value: typeof params.previousValue === "undefined" ? null : params.previousValue,
    new_value: typeof params.newValue === "undefined" ? null : params.newValue,
    metadata: params.metadata || {}
  });
}

export async function getOwnedInvestmentAccount(supabase: any, id: string, ownerId: string) {
  const { data, error } = await supabase
    .from("investment_accounts")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getOwnedInvestment(supabase: any, id: string, ownerId: string) {
  const { data, error } = await supabase
    .from("investments")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function applyBrokerageCashDelta(supabase: any, accountId: string | null | undefined, ownerId: string, delta: number) {
  if (!accountId || !Number.isFinite(delta) || delta === 0) return;
  const account = await getOwnedInvestmentAccount(supabase, accountId, ownerId);
  if (!account) throw new Error("Corretora não encontrada.");
  const nextBalance = toNumber(account.cash_balance) + delta;
  const { error } = await supabase
    .from("investment_accounts")
    .update({ cash_balance: nextBalance })
    .eq("id", accountId)
    .eq("owner_id", ownerId);
  if (error) throw error;
}

export async function applyInvestmentTransactionEffect(supabase: any, ownerId: string, transaction: {
  type: string;
  investment_id?: string | null;
  investment_account_id?: string | null;
  amount: number;
  quantity?: number | null;
  unit_price?: number | null;
  fees?: number | null;
}, direction: 1 | -1 = 1) {
  const amount = toNumber(transaction.amount);
  const quantity = toNumber(transaction.quantity);
  const unitPrice = toNumber(transaction.unit_price);
  const fees = toNumber(transaction.fees);
  const grossAmount = amount || quantity * unitPrice;
  const accountId = transaction.investment_account_id;

  if (transaction.type === "deposit") {
    await applyBrokerageCashDelta(supabase, accountId, ownerId, grossAmount * direction);
    return;
  }
  if (transaction.type === "withdraw") {
    await applyBrokerageCashDelta(supabase, accountId, ownerId, -grossAmount * direction);
    return;
  }
  if (["dividend", "yield"].includes(transaction.type)) {
    await applyBrokerageCashDelta(supabase, accountId, ownerId, grossAmount * direction);
    return;
  }
  if (transaction.type === "fee") {
    await applyBrokerageCashDelta(supabase, accountId, ownerId, -grossAmount * direction);
    return;
  }
  if (transaction.type === "adjust" && !transaction.investment_id) {
    await applyBrokerageCashDelta(supabase, accountId, ownerId, grossAmount * direction);
    return;
  }

  if (!transaction.investment_id) return;
  const investment = await getOwnedInvestment(supabase, transaction.investment_id, ownerId);
  if (!investment) throw new Error("Investimento não encontrado.");

  const currentQty = toNumber(investment.quantity);
  const currentAvg = toNumber(investment.average_price);
  let nextQty = currentQty;
  let nextAvg = currentAvg;
  let nextCurrentPrice = toNumber(investment.current_price);
  const resolvedAccountId = accountId || investment.investment_account_id;

  if (transaction.type === "buy") {
    const totalCost = grossAmount + fees;
    if (direction === 1) {
      nextQty = currentQty + quantity;
      nextAvg = nextQty > 0 ? ((currentQty * currentAvg) + totalCost) / nextQty : 0;
      nextCurrentPrice = nextCurrentPrice || unitPrice;
      await applyBrokerageCashDelta(supabase, resolvedAccountId, ownerId, -totalCost);
    } else {
      nextQty = Math.max(currentQty - quantity, 0);
      nextAvg = nextQty > 0 ? currentAvg : 0;
      await applyBrokerageCashDelta(supabase, resolvedAccountId, ownerId, totalCost);
    }
  }

  if (transaction.type === "sell") {
    const netAmount = Math.max(grossAmount - fees, 0);
    if (direction === 1) {
      nextQty = Math.max(currentQty - quantity, 0);
      await applyBrokerageCashDelta(supabase, resolvedAccountId, ownerId, netAmount);
    } else {
      nextQty = currentQty + quantity;
      await applyBrokerageCashDelta(supabase, resolvedAccountId, ownerId, -netAmount);
    }
  }

  if (transaction.type === "adjust") {
    nextCurrentPrice = unitPrice || nextCurrentPrice;
  }

  const { error } = await supabase
    .from("investments")
    .update({ quantity: nextQty, average_price: nextAvg, current_price: nextCurrentPrice })
    .eq("id", investment.id)
    .eq("owner_id", ownerId);
  if (error) throw error;
}
