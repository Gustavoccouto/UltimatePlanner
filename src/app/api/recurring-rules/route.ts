import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, normalizeOptionalUuid, parseJson } from "@/lib/http/api";
import { ensureCategoryByName, inferCategoryTypeFromTransaction } from "@/lib/server/categories";
import { cleanupFutureRecurringTransactions, materializeRecurringRules } from "@/lib/server/planning";

const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome é obrigatório."),
  rule_type: z.enum(["recurring_income", "recurring_expense"]),
  target_type: z.enum(["account", "card"]).default("account"),
  account_id: z.string().uuid().optional().nullable(),
  credit_card_id: z.string().uuid().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  category_name: z.string().trim().optional().nullable(),
  amount: z.coerce.number().positive("Valor deve ser maior que zero."),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]).default("monthly"),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inicial inválida."),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data final inválida.").optional().nullable(),
  notes: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({
  id: z.string().uuid("Recorrência inválida."),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de corte inválida.").optional().nullable()
});

function validateRule(payload: z.infer<typeof ruleSchema>) {
  if (payload.end_date && payload.end_date < payload.start_date) throw new Error("A data final não pode ser anterior ao início.");

  const targetType = payload.rule_type === "recurring_income" ? "account" : payload.target_type;
  if (targetType === "card" && !payload.credit_card_id) throw new Error("Selecione um cartão para o gasto recorrente.");
  if (targetType === "account" && !payload.account_id) throw new Error("Selecione uma conta para a recorrência.");
}

function buildRecord(ownerId: string, payload: z.infer<typeof ruleSchema>, categoryId: string | null) {
  const targetType = payload.rule_type === "recurring_income" ? "account" : payload.target_type;
  return {
    owner_id: ownerId,
    name: payload.name,
    rule_type: payload.rule_type,
    target_type: targetType,
    account_id: targetType === "account" ? normalizeOptionalUuid(payload.account_id) : null,
    credit_card_id: targetType === "card" ? normalizeOptionalUuid(payload.credit_card_id) : null,
    category_id: categoryId,
    amount: payload.amount,
    frequency: payload.frequency,
    start_date: payload.start_date,
    end_date: payload.end_date || null,
    notes: payload.notes || null,
    is_active: true,
    metadata: {}
  };
}

export async function GET() {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  const { data, error } = await context.supabase
    .from("recurring_rules")
    .select("*")
    .eq("owner_id", context.user.id)
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, ruleSchema);
    validateRule(payload);

    const categoryId = normalizeOptionalUuid(payload.category_id) || await ensureCategoryByName(
      context.supabase,
      context.user.id,
      payload.category_name,
      inferCategoryTypeFromTransaction(payload.rule_type)
    );

    const { data, error } = await context.supabase.from("recurring_rules").insert(buildRecord(context.user.id, payload, categoryId)).select("*").single();
    if (error || !data) return jsonError(error?.message || "Não foi possível criar a recorrência.", 500);

    const materialized = await materializeRecurringRules(context.supabase, context.user.id, [data.id]);
    return NextResponse.json({ data, materialized }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível salvar a recorrência.");
  }
}

export async function PATCH(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, ruleSchema.extend({ id: z.string().uuid("Recorrência inválida.") }));
    validateRule(payload);

    const { data: existing, error: existingError } = await context.supabase
      .from("recurring_rules")
      .select("*")
      .eq("owner_id", context.user.id)
      .eq("id", payload.id)
      .single();
    if (existingError || !existing) return jsonError("Recorrência não encontrada.", 404);

    const cleaned = await cleanupFutureRecurringTransactions(context.supabase, context.user.id, payload.id);

    const { data, error } = await context.supabase
      .from("recurring_rules")
      .update(buildRecord(context.user.id, payload, normalizeOptionalUuid(payload.category_id) || await ensureCategoryByName(
        context.supabase,
        context.user.id,
        payload.category_name,
        inferCategoryTypeFromTransaction(payload.rule_type)
      )))
      .eq("owner_id", context.user.id)
      .eq("id", payload.id)
      .select("*")
      .single();
    if (error || !data) return jsonError(error?.message || "Não foi possível atualizar a recorrência.", 500);

    const materialized = await materializeRecurringRules(context.supabase, context.user.id, [data.id]);
    return NextResponse.json({ data, cleaned, materialized });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar a recorrência.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, deleteSchema);
    const cleaned = await cleanupFutureRecurringTransactions(context.supabase, context.user.id, payload.id, payload.from_date || undefined);

    const { error } = await context.supabase
      .from("recurring_rules")
      .update({ is_active: false, next_occurrence: null })
      .eq("owner_id", context.user.id)
      .eq("id", payload.id);

    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true, cleaned });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir a recorrência.");
  }
}
