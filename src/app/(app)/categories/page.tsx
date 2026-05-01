import { CategoriesClient } from "@/components/categories/categories-client";
import { requireUser } from "@/lib/auth";
import type { Category, Transaction } from "@/lib/domain/app-types";

export default async function CategoriesPage() {
  const { supabase, user } = await requireUser();

  const [{ data: categories }, { data: transactions }] = await Promise.all([
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
      .limit(1000)
  ]);

  return <CategoriesClient initialCategories={(categories || []) as Category[]} initialTransactions={(transactions || []) as Transaction[]} />;
}
