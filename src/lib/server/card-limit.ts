type SupabaseLike = {
  from: (table: string) => any;
};

export type CardLimitSnapshot = {
  card_id: string;
  limit_amount: number;
  used_limit: number;
  available_limit: number;
  open_transactions_count: number;
};

export type CardLimitImpact = CardLimitSnapshot & {
  purchase_amount: number;
  projected_used_limit: number;
  projected_available_limit: number;
  usage_percent_after_purchase: number;
  near_limit: boolean;
  exceeds_limit: boolean;
  message: string | null;
};

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function currencyBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function getCardLimitSnapshot(
  supabase: SupabaseLike,
  ownerId: string,
  cardId: string
): Promise<CardLimitSnapshot> {
  const { data: card, error: cardError } = await supabase
    .from("credit_cards")
    .select("id,limit_amount")
    .eq("id", cardId)
    .eq("owner_id", ownerId)
    .eq("is_deleted", false)
    .single();

  if (cardError || !card) {
    throw new Error("Cartão não encontrado para validar limite.");
  }

  const { data: openPurchases, error: purchasesError } = await supabase
    .from("transactions")
    .select("amount")
    .eq("owner_id", ownerId)
    .eq("credit_card_id", cardId)
    .eq("type", "card_expense")
    .eq("is_deleted", false)
    .eq("is_paid", false)
    .neq("status", "canceled");

  if (purchasesError) {
    throw new Error(purchasesError.message);
  }

  const usedLimit = money(
    (openPurchases || []).reduce((sum: number, transaction: { amount: number | string }) => {
      return sum + money(transaction.amount);
    }, 0)
  );
  const limitAmount = money(card.limit_amount);

  return {
    card_id: card.id,
    limit_amount: limitAmount,
    used_limit: usedLimit,
    available_limit: money(limitAmount - usedLimit),
    open_transactions_count: (openPurchases || []).length
  };
}

export async function calculateCardLimitImpact(
  supabase: SupabaseLike,
  ownerId: string,
  cardId: string,
  purchaseAmountInput: number | string,
  nearLimitThreshold = 0.9
): Promise<CardLimitImpact> {
  const snapshot = await getCardLimitSnapshot(supabase, ownerId, cardId);
  const purchaseAmount = money(purchaseAmountInput);
  const projectedUsed = money(snapshot.used_limit + purchaseAmount);
  const projectedAvailable = money(snapshot.limit_amount - projectedUsed);
  const usagePercent = snapshot.limit_amount > 0 ? Math.round((projectedUsed / snapshot.limit_amount) * 100) : 0;
  const exceedsLimit = snapshot.limit_amount > 0 && projectedUsed > snapshot.limit_amount;
  const nearLimit = !exceedsLimit && snapshot.limit_amount > 0 && projectedUsed >= snapshot.limit_amount * nearLimitThreshold;

  return {
    ...snapshot,
    purchase_amount: purchaseAmount,
    projected_used_limit: projectedUsed,
    projected_available_limit: projectedAvailable,
    usage_percent_after_purchase: usagePercent,
    near_limit: nearLimit,
    exceeds_limit: exceedsLimit,
    message: exceedsLimit
      ? `Essa compra ultrapassa o limite do cartão. Limite disponível: ${currencyBRL(snapshot.available_limit)}.`
      : nearLimit
        ? `Essa compra deixa o cartão próximo do limite (${usagePercent}% usado).`
        : null
  };
}
