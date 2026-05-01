import { addMonths, getCardBillingMonth } from "./billing";
import type { CreditCardLike, InstallmentPlanInput } from "./types";

export function splitInstallmentAmount(totalAmount: number, count: number): number[] {
  const cents = Math.round(totalAmount * 100);
  const base = Math.floor(cents / count);
  const remainder = cents % count;

  return Array.from({ length: count }, (_, index) => Number(((base + (index < remainder ? 1 : 0)) / 100).toFixed(2)));
}

export function buildInstallments(planId: string, input: InstallmentPlanInput, card?: CreditCardLike) {
  const amounts = splitInstallmentAmount(input.total_amount, input.installments_count);

  return amounts.map((amount, index) => {
    const purchaseDate = addMonths(input.first_date, index);
    const isCredit = input.payment_method === "credit_card";

    return {
      owner_id: input.owner_id,
      installment_plan_id: planId,
      installment_number: index + 1,
      installments_count: input.installments_count,
      description: `${input.description} (${index + 1}/${input.installments_count})`,
      amount,
      due_date: purchaseDate,
      status: "pending",
      account_id: isCredit ? null : input.account_id || null,
      credit_card_id: isCredit ? input.credit_card_id || null : null,
      category_id: input.category_id || null,
      billing_month: isCredit && card ? getCardBillingMonth(purchaseDate, card.closing_day, card.due_day) : null
    };
  });
}
