import { NextResponse } from "next/server";
import { getApiContext, jsonError } from "@/lib/http/api";

function isMissingSchemaError(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message || "") : "";
  return /does not exist|schema cache|column .* not found|Could not find/i.test(message);
}

export async function GET() {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const [accounts, investments, transactions, logs] = await Promise.all([
      context.supabase
        .from("investment_accounts")
        .select("*")
        .eq("owner_id", context.user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("investments")
        .select("*")
        .eq("owner_id", context.user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("investment_transactions")
        .select("*")
        .eq("owner_id", context.user.id)
        .eq("is_deleted", false)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(300),
      context.supabase
        .from("activity_logs")
        .select("*")
        .eq("owner_id", context.user.id)
        .in("entity_type", ["investment_account", "investment", "investment_transaction", "investment_allocation_target"])
        .order("created_at", { ascending: false })
        .limit(200)
    ]);

    const error = accounts.error || investments.error || transactions.error || logs.error;
    if (error) throw new Error(`${error.message}. Verifique se a migration 0006 de investimentos foi rodada no Supabase.`);

    const allocationTargets = await context.supabase
      .from("investment_allocation_targets")
      .select("*")
      .eq("owner_id", context.user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });

    if (allocationTargets.error && !isMissingSchemaError(allocationTargets.error)) {
      throw allocationTargets.error;
    }

    return NextResponse.json({
      accounts: accounts.data || [],
      investments: investments.data || [],
      transactions: transactions.data || [],
      allocationTargets: allocationTargets.error ? [] : allocationTargets.data || [],
      activityLogs: logs.data || []
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível carregar investimentos.", 500);
  }
}
