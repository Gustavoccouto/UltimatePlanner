import { requireUser } from "@/lib/auth";
import type { Account, Category, CreditCard, Installment, InstallmentPlan, Invoice, Transaction } from "@/lib/domain/app-types";
import { CardsClient } from "@/components/cards/cards-client";

export default async function CardsPage() {
  const { supabase, user } = await requireUser();

  const [accountsResult, categoriesResult, cardsResult, invoicesResult, plansResult, installmentsResult, transactionsResult] = await Promise.all([
    supabase.from("accounts").select("*").eq("owner_id", user.id).eq("is_deleted", false).order("created_at", { ascending: true }),
    supabase.from("categories").select("*").eq("owner_id", user.id).eq("is_deleted", false).order("name", { ascending: true }),
    supabase.from("credit_cards").select("*").eq("owner_id", user.id).eq("is_deleted", false).order("created_at", { ascending: true }),
    supabase.from("invoices").select("*").eq("owner_id", user.id).order("billing_month", { ascending: false }),
    supabase.from("installment_plans").select("*").eq("owner_id", user.id).eq("payment_method", "credit_card").order("first_date", { ascending: false }),
    supabase.from("installments").select("*").eq("owner_id", user.id).order("due_date", { ascending: true }),
    supabase.from("transactions").select("*").eq("owner_id", user.id).eq("is_deleted", false).order("date", { ascending: false })
  ]);

  return (
    <CardsClient
      initialAccounts={(accountsResult.data || []) as Account[]}
      initialCategories={(categoriesResult.data || []) as Category[]}
      initialCards={(cardsResult.data || []) as CreditCard[]}
      initialInvoices={(invoicesResult.data || []) as Invoice[]}
      initialPlans={(plansResult.data || []) as InstallmentPlan[]}
      initialInstallments={(installmentsResult.data || []) as Installment[]}
      initialTransactions={(transactionsResult.data || []) as Transaction[]}
    />
  );
}
