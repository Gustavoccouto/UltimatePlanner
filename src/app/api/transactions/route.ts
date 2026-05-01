import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, mergeMetadata, normalizeOptionalUuid, parseJson } from "@/lib/http/api";
import { recalculateInvoicesForCardMonths, reconcileInstallmentPlan } from "@/lib/server/card-ledger";
import { ensureCategoryByName, inferCategoryTypeFromTransaction } from "@/lib/server/categories";

const transactionSchema = z.object({
  id: z.string().uuid().optional(),
  description: z.string().trim().min(1, "Descrição é obrigatória."),
  type: z.enum(["income", "expense", "transfer", "adjust", "card_expense", "invoice_payment"]),
  amount: z.coerce.number().positive("Valor deve ser maior que zero."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  account_id: z.string().uuid().optional().nullable(),
  destination_account_id: z.string().uuid().optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  category_name: z.string().trim().optional().nullable(),
  status: z.enum(["posted", "planned", "canceled"]).default("posted"),
  notes: z.string().trim().optional().nullable(),
  adjustment_direction: z.enum(["add", "subtract"]).optional().nullable()
});

const deleteSchema = z.object({ id: z.string().uuid("Transação inválida.") });

function validateTransactionRelationships(payload: z.infer<typeof transactionSchema>) {
  if (["income", "expense", "adjust", "invoice_payment"].includes(payload.type) && !payload.account_id) {
    throw new Error("Selecione uma conta.");
  }
  if (payload.type === "transfer") {
    if (!payload.account_id || !payload.destination_account_id) {
      throw new Error("Transferência precisa de conta origem e conta destino.");
    }
    if (payload.account_id === payload.destination_account_id) {
      throw new Error("Conta origem e destino não podem ser iguais.");
    }
  }
}

export async function GET() {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  const { data, error } = await context.supabase
    .from("transactions")
    .select("*")
    .eq("owner_id", context.user.id)
    .eq("is_deleted", false)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, transactionSchema);
    validateTransactionRelationships(payload);

    const categoryId = normalizeOptionalUuid(payload.category_id) || await ensureCategoryByName(
      context.supabase,
      context.user.id,
      payload.category_name,
      inferCategoryTypeFromTransaction(payload.type)
    );

    const record = {
      owner_id: context.user.id,
      description: payload.description,
      type: payload.type,
      amount: payload.amount,
      date: payload.date,
      account_id: normalizeOptionalUuid(payload.account_id),
      destination_account_id: payload.type === "transfer" ? normalizeOptionalUuid(payload.destination_account_id) : null,
      category_id: categoryId,
      status: payload.status,
      notes: payload.notes || null,
      is_paid: payload.status === "posted",
      is_deleted: false,
      metadata: { adjustment_direction: payload.adjustment_direction || "add" }
    };

    const { data, error } = await context.supabase.from("transactions").insert(record).select("*").single();
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível salvar a transação.");
  }
}

export async function PATCH(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, transactionSchema.extend({ id: z.string().uuid("Transação inválida.") }));
    validateTransactionRelationships(payload);

    const { data: existing, error: existingError } = await context.supabase
      .from("transactions")
      .select("*")
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .single();

    if (existingError || !existing) return jsonError("Transação não encontrada.", 404);

    const categoryId = normalizeOptionalUuid(payload.category_id) || await ensureCategoryByName(
      context.supabase,
      context.user.id,
      payload.category_name,
      inferCategoryTypeFromTransaction(payload.type)
    );

    const update = {
      description: payload.description,
      type: payload.type,
      amount: payload.amount,
      date: payload.date,
      account_id: normalizeOptionalUuid(payload.account_id),
      destination_account_id: payload.type === "transfer" ? normalizeOptionalUuid(payload.destination_account_id) : null,
      category_id: categoryId,
      status: payload.status,
      notes: payload.notes || null,
      is_paid: payload.status === "posted",
      metadata: mergeMetadata(existing.metadata, { adjustment_direction: payload.adjustment_direction || "add" })
    };

    const { data, error } = await context.supabase
      .from("transactions")
      .update(update)
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar a transação.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, deleteSchema);
    const { data: existing, error: existingError } = await context.supabase
      .from("transactions")
      .select("*")
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .single();

    if (existingError || !existing) return jsonError("Transação não encontrada.", 404);

    const { error } = await context.supabase
      .from("transactions")
      .update({ is_deleted: true, status: "canceled" })
      .eq("id", payload.id)
      .eq("owner_id", context.user.id);

    if (error) return jsonError(error.message, 500);

    if (existing.type === "card_expense" && existing.credit_card_id && existing.billing_month) {
      await recalculateInvoicesForCardMonths(context.supabase, context.user.id, existing.credit_card_id, [existing.billing_month]);
    }

    if (existing.installment_plan_id) {
      await reconcileInstallmentPlan(context.supabase, context.user.id, existing.installment_plan_id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir a transação.");
  }
}
