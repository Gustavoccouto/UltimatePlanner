import type { Frequency, RecurringRuleLike } from "./types";
import { addMonths, getCardBillingMonth } from "./billing";

function addFrequency(dateInput: string, frequency: Frequency): string {
  if (frequency === "weekly") {
    const next = new Date(`${dateInput}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 7);
    return next.toISOString().slice(0, 10);
  }
  if (frequency === "quarterly") return addMonths(dateInput, 3);
  if (frequency === "yearly") return addMonths(dateInput, 12);
  return addMonths(dateInput, 1);
}

export function buildRecurringOccurrences(rule: RecurringRuleLike, horizonDate: string) {
  const occurrences: string[] = [];
  let cursor = rule.start_date;
  let guard = 0;

  while (cursor <= horizonDate && guard < 240) {
    if (!rule.end_date || cursor <= rule.end_date) {
      occurrences.push(cursor);
    }
    cursor = addFrequency(cursor, rule.frequency);
    guard += 1;
  }

  return occurrences;
}

export function materializeRecurringTransaction(rule: RecurringRuleLike, occurrenceDate: string, card?: { closing_day: number; due_day: number }) {
  const isCardExpense = rule.rule_type === "recurring_expense" && rule.target_type === "card";

  return {
    description: rule.name,
    type: rule.rule_type === "recurring_income" ? "income" : isCardExpense ? "card_expense" : "expense",
    account_id: isCardExpense ? null : rule.account_id || null,
    credit_card_id: isCardExpense ? rule.credit_card_id || null : null,
    category_id: rule.category_id || null,
    amount: rule.amount,
    date: occurrenceDate,
    billing_month: isCardExpense && card ? getCardBillingMonth(occurrenceDate, card.closing_day, card.due_day) : null,
    recurring_rule_id: rule.id,
    recurrence_key: `${rule.id}__${occurrenceDate}`,
    status: "planned",
    is_paid: false
  };
}
