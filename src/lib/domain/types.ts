export type TransactionType = "income" | "expense" | "transfer" | "card_expense" | "invoice_payment";
export type TransactionStatus = "planned" | "posted" | "canceled";
export type InstallmentStatus = "pending" | "paid" | "anticipated";
export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";

export type MoneyInput = number | string | null | undefined;

export interface CreditCardLike {
  id: string;
  name?: string;
  closing_day: number;
  due_day: number;
}

export interface RecurringRuleLike {
  id: string;
  name: string;
  rule_type: "recurring_income" | "recurring_expense";
  target_type: "account" | "card";
  account_id?: string | null;
  credit_card_id?: string | null;
  category_id?: string | null;
  amount: number;
  frequency: Frequency;
  start_date: string;
  end_date?: string | null;
  notes?: string | null;
}

export interface InstallmentPlanInput {
  owner_id: string;
  description: string;
  total_amount: number;
  installments_count: number;
  first_date: string;
  payment_method: "debit" | "credit_card";
  account_id?: string | null;
  credit_card_id?: string | null;
  category_id?: string | null;
}
