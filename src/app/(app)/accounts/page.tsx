import { AccountsClient } from "@/components/accounts/accounts-client";
import { requireUser } from "@/lib/auth";
import type { Account, Transaction } from "@/lib/domain/app-types";

export default async function AccountsPage() {
  const { supabase, user } = await requireUser();

  const [{ data: accounts }, { data: transactions }] = await Promise.all([
    supabase
      .from("accounts")
      .select("*")
      .eq("owner_id", user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("transactions")
      .select("*")
      .eq("owner_id", user.id)
      .eq("is_deleted", false)
  ]);

  return <AccountsClient initialAccounts={(accounts || []) as Account[]} initialTransactions={(transactions || []) as Transaction[]} />;
}
