import { NextResponse } from "next/server";
import { getApiContext } from "@/lib/http/api";

const checks = [
  { table: "accounts", columns: "id,owner_id,name,is_deleted", writeHint: "contas" },
  { table: "categories", columns: "id,owner_id,name,type,is_deleted", writeHint: "categorias" },
  { table: "transactions", columns: "id,owner_id,type,amount,date,is_deleted", writeHint: "transações" },
  { table: "credit_cards", columns: "id,owner_id,name,closing_day,due_day,is_deleted", writeHint: "cartões" },
  { table: "invoices", columns: "id,owner_id,credit_card_id,billing_month,total_amount,paid_amount", writeHint: "faturas" },
  { table: "recurring_rules", columns: "id,owner_id,name,rule_type,is_active", writeHint: "recorrências" },
  { table: "installment_plans", columns: "id,owner_id,description,payment_method,status", writeHint: "parcelamentos" },
  { table: "installments", columns: "id,owner_id,installment_plan_id,status", writeHint: "parcelas" },
  { table: "projects", columns: "id,owner_id,name,is_deleted,status", writeHint: "projetos" },
  { table: "project_items", columns: "id,owner_id,project_id,is_deleted,status", writeHint: "itens de projeto" },
  { table: "project_movements", columns: "id,owner_id,project_id,is_deleted,type", writeHint: "movimentos de projeto" },
  { table: "goals", columns: "id,owner_id,name,is_deleted,status", writeHint: "metas" },
  { table: "goal_movements", columns: "id,owner_id,goal_id,is_deleted,type", writeHint: "movimentos de meta" },
  { table: "investment_accounts", columns: "id,owner_id,name,cash_balance,color,is_deleted", writeHint: "corretoras" },
  { table: "investments", columns: "id,owner_id,name,asset_type,is_deleted", writeHint: "ativos" },
  { table: "investment_transactions", columns: "id,owner_id,type,amount,is_deleted", writeHint: "movimentações de investimento" },
  { table: "investment_allocation_targets", columns: "id,owner_id,target_scope,target_key,is_deleted", writeHint: "alocação alvo" },
  { table: "shared_items", columns: "id,owner_id,user_id,item_type,item_id,role", writeHint: "compartilhamento" },
  { table: "activity_logs", columns: "id,owner_id,entity_type,action_type", writeHint: "histórico" },
  { table: "ai_chat_messages", columns: "id,owner_id,role,content", writeHint: "chat IA" }
];

export async function GET() {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  const results = [];
  for (const check of checks) {
    const response = await context.supabase
      .from(check.table)
      .select(check.columns)
      .limit(1);

    results.push({
      table: check.table,
      area: check.writeHint,
      ok: !response.error,
      error: response.error?.message || null
    });
  }

  const failed = results.filter((item) => !item.ok);
  return NextResponse.json({ ok: failed.length === 0, failed, results });
}
