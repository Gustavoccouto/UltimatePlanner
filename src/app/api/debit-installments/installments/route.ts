import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, mergeMetadata, normalizeOptionalUuid, parseJson } from "@/lib/http/api";
import { ensureCategoryByName, inferCategoryTypeFromTransaction } from "@/lib/server/categories";
import { reconcileInstallmentPlan } from "@/lib/server/card-ledger";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("pay"),
    id: z.string().uuid("Parcela inválida."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  }),
  z.object({
    action: z.literal("anticipate"),
    id: z.string().uuid("Parcela inválida."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  }),
  z.object({
    action: z.literal("edit"),
    id: z.string().uuid("Parcela inválida."),
    description: z.string().trim().min(1, "Descrição é obrigatória."),
    amount: z.coerce.number().positive("Valor deve ser maior que zero."),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
    category_id: z.string().uuid().optional().nullable(),
    category_name: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable()
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid("Parcela inválida.")
  })
]);

async function readDebitTransaction(context: Awaited<ReturnType<typeof getApiContext>>, id: string) {
  if ("error" in context) throw new Error("Não autenticado.");
  const { data, error } = await context.supabase
    .from("transactions")
    .select("*")
    .eq("owner_id", context.user.id)
    .eq("id", id)
    .single();

  if (error || !data) throw new Error("Parcela não encontrada.");
  if (data.type !== "expense" || !data.installment_id || !data.installment_plan_id || data.credit_card_id) {
    throw new Error("O lançamento selecionado não é uma parcela de débito válida.");
  }
  return data;
}

export async function PATCH(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, bodySchema);
    const transaction = await readDebitTransaction(context, payload.id);
    const now = new Date().toISOString();

    if (payload.action === "pay" || payload.action === "anticipate") {
      const isAnticipation = payload.action === "anticipate";
      const metadata = mergeMetadata(transaction.metadata, {
        installment_status: isAnticipation ? "anticipated" : "paid",
        paid_at: now,
        anticipated_at: isAnticipation ? now : undefined,
        anticipated_original_date: isAnticipation ? transaction.date : undefined
      });

      const { data, error } = await context.supabase
        .from("transactions")
        .update({
          date: isAnticipation ? payload.date : transaction.date,
          is_paid: true,
          metadata
        })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.id)
        .select("*")
        .single();
      if (error) return jsonError(error.message, 500);

      const { error: installmentError } = await context.supabase
        .from("installments")
        .update({
          due_date: isAnticipation ? payload.date : transaction.date,
          status: isAnticipation ? "anticipated" : "paid",
          anticipated_at: isAnticipation ? now : transaction.anticipated_at,
          metadata: { paid_at: now }
        })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.installment_id);
      if (installmentError) return jsonError(installmentError.message, 500);

      await reconcileInstallmentPlan(context.supabase, context.user.id, transaction.installment_plan_id);
      return NextResponse.json({ data });
    }

    if (payload.action === "edit") {
      const categoryId = normalizeOptionalUuid(payload.category_id) || await ensureCategoryByName(
        context.supabase,
        context.user.id,
        payload.category_name,
        inferCategoryTypeFromTransaction("expense")
      );

      const { data, error } = await context.supabase
        .from("transactions")
        .update({
          description: payload.description,
          amount: payload.amount,
          date: payload.due_date,
          category_id: categoryId,
          notes: payload.notes || null,
          metadata: mergeMetadata(transaction.metadata, { notes: payload.notes || "" })
        })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.id)
        .select("*")
        .single();
      if (error) return jsonError(error.message, 500);

      const { error: installmentError } = await context.supabase
        .from("installments")
        .update({
          description: payload.description,
          amount: payload.amount,
          due_date: payload.due_date,
          category_id: categoryId,
          metadata: { notes: payload.notes || "" }
        })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.installment_id);
      if (installmentError) return jsonError(installmentError.message, 500);

      await reconcileInstallmentPlan(context.supabase, context.user.id, transaction.installment_plan_id);
      return NextResponse.json({ data });
    }

    if (payload.action === "delete") {
      const { data, error } = await context.supabase
        .from("transactions")
        .update({ is_deleted: true, status: "canceled" })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.id)
        .select("*")
        .single();
      if (error) return jsonError(error.message, 500);

      const { error: installmentError } = await context.supabase
        .from("installments")
        .update({ status: "canceled" })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.installment_id);
      if (installmentError) return jsonError(installmentError.message, 500);

      await reconcileInstallmentPlan(context.supabase, context.user.id, transaction.installment_plan_id);
      return NextResponse.json({ data });
    }

    return jsonError("Ação inválida.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar a parcela.");
  }
}
