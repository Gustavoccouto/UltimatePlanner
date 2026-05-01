import type {
  Account,
  AiChatMessage,
  CreditCard,
  Invoice,
  Goal,
  Installment,
  Investment,
  InvestmentAccount,
  InvestmentTransaction,
  Project,
  ProjectMovement,
  Transaction
} from "@/lib/domain/app-types";
import { buildAiContext, buildDashboardReferenceSummary, type FinancialSnapshotInput } from "@/lib/domain/financial-insights";
import { monthInput, todayInput } from "@/lib/domain/formatters";

type SupabaseLike = {
  from: (table: string) => any;
};

async function selectData<T>(query: any): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message || "Erro ao buscar dados financeiros.");
  return (data || []) as T[];
}

export async function loadFinancialSnapshotData(supabase: SupabaseLike, ownerId: string): Promise<FinancialSnapshotInput> {
  const [
    accounts,
    transactions,
    creditCards,
    invoices,
    installments,
    projects,
    projectMovements,
    goals,
    investments,
    investmentAccounts,
    investmentTransactions
  ] = await Promise.all([
    selectData<Account>(supabase.from("accounts").select("*").eq("owner_id", ownerId).eq("is_deleted", false).order("created_at", { ascending: true })),
    selectData<Transaction>(supabase.from("transactions").select("*").eq("owner_id", ownerId).eq("is_deleted", false).order("date", { ascending: false }).order("created_at", { ascending: false }).limit(500)),
    selectData<CreditCard>(supabase.from("credit_cards").select("*").eq("owner_id", ownerId).eq("is_deleted", false).order("created_at", { ascending: true })),
    selectData<Invoice>(supabase.from("invoices").select("*").eq("owner_id", ownerId).order("billing_month", { ascending: false }).limit(300)),
    selectData<Installment>(supabase.from("installments").select("*").eq("owner_id", ownerId).order("due_date", { ascending: true }).limit(300)),
    selectData<Project>(supabase.from("projects").select("*").eq("owner_id", ownerId).eq("is_deleted", false).order("created_at", { ascending: false })),
    selectData<ProjectMovement>(supabase.from("project_movements").select("*").eq("owner_id", ownerId).eq("is_deleted", false).order("created_at", { ascending: false }).limit(300)),
    selectData<Goal>(supabase.from("goals").select("*").eq("owner_id", ownerId).eq("is_deleted", false).order("created_at", { ascending: false })),
    selectData<Investment>(supabase.from("investments").select("*").eq("owner_id", ownerId).eq("is_deleted", false).order("created_at", { ascending: false })),
    selectData<InvestmentAccount>(supabase.from("investment_accounts").select("*").eq("owner_id", ownerId).eq("is_deleted", false).order("created_at", { ascending: true })),
    selectData<InvestmentTransaction>(supabase.from("investment_transactions").select("*").eq("owner_id", ownerId).eq("is_deleted", false).order("date", { ascending: false }).limit(500))
  ]);

  return {
    accounts,
    transactions,
    creditCards,
    invoices,
    installments,
    projects,
    projectMovements,
    goals,
    investments,
    investmentAccounts,
    investmentTransactions
  };
}

export async function loadAiChatHistory(supabase: SupabaseLike, ownerId: string, limit = 24): Promise<AiChatMessage[]> {
  const data = await selectData<AiChatMessage>(
    supabase
      .from("ai_chat_messages")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(limit)
  );
  return data.reverse();
}

export async function buildCurrentFinancialContext(supabase: SupabaseLike, ownerId: string, params?: { month?: string; referenceDate?: string }) {
  const data = await loadFinancialSnapshotData(supabase, ownerId);
  const month = params?.month || monthInput();
  const referenceDate = params?.referenceDate || todayInput();
  const summary = buildDashboardReferenceSummary(data, month, referenceDate);
  const aiContext = buildAiContext(data, summary);
  return { data, summary, aiContext };
}
