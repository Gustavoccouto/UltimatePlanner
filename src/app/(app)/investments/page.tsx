import { InvestmentsClient } from "@/components/investments/investments-client";
import { requireUser } from "@/lib/auth";
import type { ActivityLog, Investment, InvestmentAccount, InvestmentTransaction } from "@/lib/domain/app-types";

type AllocationTarget = {
  id: string;
  owner_id: string;
  target_scope: "asset_type" | "asset";
  target_key: string;
  label: string;
  target_percent: number | string;
  is_deleted?: boolean;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export default async function InvestmentsPage() {
  const { supabase, user } = await requireUser();

  const [accounts, investments, transactions, allocationTargets, activityLogs] = await Promise.all([
    supabase
      .from("investment_accounts")
      .select("*")
      .eq("owner_id", user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("investments")
      .select("*")
      .eq("owner_id", user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("investment_transactions")
      .select("*")
      .eq("owner_id", user.id)
      .eq("is_deleted", false)
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("investment_allocation_targets")
      .select("*")
      .eq("owner_id", user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("activity_logs")
      .select("*")
      .eq("owner_id", user.id)
      .in("entity_type", ["investment_account", "investment", "investment_transaction", "investment_allocation_target"])
      .order("created_at", { ascending: false })
      .limit(200)
  ]);

  return (
    <InvestmentsClient
      initialData={{
        accounts: (accounts.data || []) as InvestmentAccount[],
        investments: (investments.data || []) as Investment[],
        transactions: (transactions.data || []) as InvestmentTransaction[],
        allocationTargets: (allocationTargets.data || []) as AllocationTarget[],
        activityLogs: (activityLogs.data || []) as ActivityLog[]
      }}
    />
  );
}
