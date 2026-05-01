import type { CreditCard, RecurringRule } from "@/lib/domain/app-types";
import { buildOccurrences, buildRecurringTransactionDraft, getNextOccurrenceDate, todayInput } from "@/lib/domain/planning";
import { recalculateInvoicesForCardMonths } from "@/lib/server/card-ledger";

type SupabaseLike = {
  from: (table: string) => any;
};

function normalizeMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export async function materializeRecurringRules(supabase: SupabaseLike, ownerId: string, ruleIds?: string[]) {
  let query = supabase
    .from("recurring_rules")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (ruleIds?.length) query = query.in("id", ruleIds);

  const { data: rules, error: rulesError } = await query;
  if (rulesError) throw new Error(rulesError.message);

  const activeRules = (rules || []) as RecurringRule[];
  if (!activeRules.length) return { created: 0, updatedRules: 0, touchedCardMonths: 0 };

  const [{ data: cards, error: cardsError }, { data: existingTransactions, error: transactionsError }] = await Promise.all([
    supabase.from("credit_cards").select("*").eq("owner_id", ownerId).eq("is_deleted", false),
    supabase.from("transactions").select("*").eq("owner_id", ownerId).eq("is_deleted", false)
  ]);

  if (cardsError) throw new Error(cardsError.message);
  if (transactionsError) throw new Error(transactionsError.message);

  type BillingCard = Pick<CreditCard, "closing_day" | "due_day">;
  const cardEntries: Array<[string, BillingCard]> = ((cards || []) as CreditCard[])
    .filter((card) => Boolean(card.id))
    .map((card) => [
      card.id,
      {
        closing_day: Number(card.closing_day || 1),
        due_day: Number(card.due_day || 1)
      }
    ]);
  const cardsById = new Map<string, BillingCard>(cardEntries);
  const existingKeys = new Set(
    (existingTransactions || [])
      .filter((transaction: any) => transaction.recurrence_key)
      .map((transaction: any) => transaction.recurrence_key)
  );

  const transactionRows: any[] = [];
  const ruleUpdates: Array<Promise<unknown>> = [];
  const touchedCardMonths = new Map<string, Set<string>>();

  for (const rule of activeRules) {
    const occurrences = buildOccurrences(rule);

    for (const occurrenceDate of occurrences) {
      const recurrenceKey = `${rule.id}__${occurrenceDate}`;
      if (existingKeys.has(recurrenceKey)) continue;

      const card = rule.credit_card_id ? cardsById.get(rule.credit_card_id) : null;
      const draft = buildRecurringTransactionDraft(rule, occurrenceDate, card || null);
      transactionRows.push({ owner_id: ownerId, ...draft });
      existingKeys.add(recurrenceKey);

      if (draft.credit_card_id && draft.billing_month) {
        if (!touchedCardMonths.has(draft.credit_card_id)) touchedCardMonths.set(draft.credit_card_id, new Set());
        touchedCardMonths.get(draft.credit_card_id)?.add(draft.billing_month);
      }
    }

    const nextOccurrence = getNextOccurrenceDate(rule, [...(existingTransactions || []), ...transactionRows]);
    ruleUpdates.push(
      supabase
        .from("recurring_rules")
        .update({ next_occurrence: nextOccurrence || null, metadata: normalizeMetadata(rule.metadata) })
        .eq("owner_id", ownerId)
        .eq("id", rule.id)
    );
  }

  if (transactionRows.length) {
    const { error: insertError } = await supabase.from("transactions").insert(transactionRows);
    if (insertError) throw new Error(insertError.message);
  }

  await Promise.all(ruleUpdates);

  for (const [cardId, months] of touchedCardMonths.entries()) {
    await recalculateInvoicesForCardMonths(supabase, ownerId, cardId, Array.from(months));
  }

  return { created: transactionRows.length, updatedRules: ruleUpdates.length, touchedCardMonths: touchedCardMonths.size };
}

export async function cleanupFutureRecurringTransactions(supabase: SupabaseLike, ownerId: string, ruleId: string, fromDate = todayInput()) {
  const { data: rows, error: readError } = await supabase
    .from("transactions")
    .select("id, credit_card_id, billing_month")
    .eq("owner_id", ownerId)
    .eq("recurring_rule_id", ruleId)
    .eq("is_deleted", false)
    .gte("date", fromDate);

  if (readError) throw new Error(readError.message);

  const touchedCardMonths = new Map<string, Set<string>>();
  for (const row of rows || []) {
    if (row.credit_card_id && row.billing_month) {
      if (!touchedCardMonths.has(row.credit_card_id)) touchedCardMonths.set(row.credit_card_id, new Set());
      touchedCardMonths.get(row.credit_card_id)?.add(row.billing_month);
    }
  }

  const ids = (rows || []).map((row: any) => row.id);
  if (ids.length) {
    const { error } = await supabase
      .from("transactions")
      .update({ is_deleted: true, status: "canceled" })
      .eq("owner_id", ownerId)
      .in("id", ids);
    if (error) throw new Error(error.message);
  }

  for (const [cardId, months] of touchedCardMonths.entries()) {
    await recalculateInvoicesForCardMonths(supabase, ownerId, cardId, Array.from(months));
  }

  return ids.length;
}
