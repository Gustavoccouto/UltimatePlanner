import { TransactionsClient } from "@/components/transactions/transactions-client";
import { requireUser } from "@/lib/auth";
import type { Account, Category, CreditCard, Installment, InstallmentPlan, RecurringRule, Transaction } from "@/lib/domain/app-types";
import { materializeRecurringRules } from "@/lib/server/planning";

export default async function TransactionsPage() {
  const { supabase, user } = await requireUser();

  await materializeRecurringRules(supabase, user.id).catch(() => null);

  const [{ data: accounts }, { data: categories }, { data: transactions }, { data: recurringRules }, { data: plans }, { data: installments }, { data: cards }] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .eq("owner_id", user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("categories")
      .select("*")
      .eq("owner_id", user.id)
      .eq("is_deleted", false)
      .order("name", { ascending: true }),
    supabase
      .from("transactions")
      .select("*")
      .eq("owner_id", user.id)
      .eq("is_deleted", false)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("recurring_rules")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("installment_plans")
      .select("*")
      .eq("owner_id", user.id)
      .eq("payment_method", "debit")
      .neq("status", "canceled")
      .order("first_date", { ascending: false }),
    supabase
      .from("installments")
      .select("*")
      .eq("owner_id", user.id)
      .is("credit_card_id", null)
      .neq("status", "canceled")
      .order("due_date", { ascending: true }),
    supabase
      .from("credit_cards")
      .select("*")
      .eq("owner_id", user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
  ]);

  return (
    <TransactionsClient
      initialAccounts={(accounts || []) as Account[]}
      initialCategories={(categories || []) as Category[]}
      initialTransactions={(transactions || []) as Transaction[]}
      initialRecurringRules={(recurringRules || []) as RecurringRule[]}
      initialDebitPlans={(plans || []) as InstallmentPlan[]}
      initialDebitInstallments={(installments || []) as Installment[]}
      initialCreditCards={(cards || []) as CreditCard[]}
    />
  );
}
