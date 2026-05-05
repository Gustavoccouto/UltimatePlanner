import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiContext, jsonError, mergeMetadata, normalizeOptionalUuid, parseJson } from "@/lib/http/api";
import { ensureCategoryByName, inferCategoryTypeFromTransaction } from "@/lib/server/categories";
import { normalizeBillingMonth } from "@/lib/domain/billing";
import { reconcileInstallmentPlan, recalculateInvoicesForCardMonths } from "@/lib/server/card-ledger";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("anticipate"),
    id: z.string().uuid("Parcela inválida."),
    target_billing_month: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "Competência inválida."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  }),
  z.object({
    action: z.literal("pay"),
    id: z.string().uuid("Parcela inválida."),
    account_id: z.string().uuid("Selecione uma conta de pagamento."),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
    notes: z.string().trim().optional().nullable()
  }),
  z.object({
    action: z.literal("edit"),
    id: z.string().uuid("Parcela inválida."),
    description: z.string().trim().min(1, "Descrição é obrigatória."),
    amount: z.coerce.number().positive("Valor deve ser maior que zero."),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
    billing_month: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "Competência inválida."),
    category_id: z.string().uuid().optional().nullable(),
    category_name: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable()
  }),
  z.object({
    action: z.literal("delete"),
    id: z.string().uuid("Parcela inválida.")
  }),
  z.object({
    action: z.literal("delete_plan"),
    id: z.string().uuid("Parcela inválida.")
  })
]);

type ApiContext = Awaited<ReturnType<typeof getApiContext>>;

type DeletePlanResult = {
  card_id: string;
  billing_months: string[] | null;
};

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

async function readTransaction(context: ApiContext, id: string) {
  if ("error" in context) throw new Error("Não autenticado.");

  const { data, error } = await context.supabase
    .from("transactions")
    .select("*")
    .eq("owner_id", context.user.id)
    .eq("id", id)
    .single();

  if (error || !data) throw new Error("Parcela não encontrada.");

  if (data.type !== "card_expense" || !data.installment_id || !data.installment_plan_id || !data.credit_card_id) {
    throw new Error("O lançamento selecionado não é uma parcela de cartão válida.");
  }

  return data;
}

export async function PATCH(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, bodySchema);

    if (payload.action === "delete_plan") {
      const { data, error } = await context.supabase.rpc("delete_credit_installment_plan_from_transaction", {
        target_transaction_id: payload.id
      });

      if (error) return jsonError(error.message, 500);

      const result = Array.isArray(data) ? (data[0] as DeletePlanResult | undefined) : undefined;

      if (result?.card_id && result.billing_months?.length) {
        await recalculateInvoicesForCardMonths(context.supabase, context.user.id, result.card_id, result.billing_months);
      }

      return NextResponse.json({ ok: true, behavior: "entire_credit_installment_plan_deleted" });
    }

    const transaction = await readTransaction(context, payload.id);
    const previousBillingMonth = transaction.billing_month;

    if (payload.action === "anticipate") {
      const targetBillingMonth = normalizeBillingMonth(payload.target_billing_month);
      const metadata = mergeMetadata(transaction.metadata, {
        installment_status: "pending",
        anticipated_at: new Date().toISOString(),
        anticipated_from_billing_month: previousBillingMonth
      });

      const { data, error } = await context.supabase
        .from("transactions")
        .update({ billing_month: targetBillingMonth, date: payload.date, is_paid: false, metadata })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.id)
        .select("*")
        .single();

      if (error) return jsonError(error.message, 500);

      const { error: installmentError } = await context.supabase
        .from("installments")
        .update({ billing_month: targetBillingMonth, due_date: payload.date, status: "pending", anticipated_at: new Date().toISOString() })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.installment_id);

      if (installmentError) return jsonError(installmentError.message, 500);

      await recalculateInvoicesForCardMonths(context.supabase, context.user.id, transaction.credit_card_id, [
        previousBillingMonth,
        targetBillingMonth
      ]);

      return NextResponse.json({ data });
    }

    if (payload.action === "pay") {
      if (transaction.is_paid) return jsonError("Essa parcela já está paga.");

      const { data: payment, error: paymentError } = await context.supabase
        .from("transactions")
        .insert({
          owner_id: context.user.id,
          description: `Pagamento avulso • ${transaction.description}`,
          type: "invoice_payment",
          amount: money(transaction.amount),
          date: payload.date,
          billing_month: normalizeBillingMonth(transaction.billing_month),
          account_id: payload.account_id,
          destination_account_id: null,
          credit_card_id: transaction.credit_card_id,
          category_id: transaction.category_id,
          installment_plan_id: transaction.installment_plan_id,
          installment_id: transaction.installment_id,
          status: "posted",
          is_paid: true,
          notes: payload.notes || null,
          metadata: { linked_card_expense_id: transaction.id },
          is_deleted: false
        })
        .select("*")
        .single();

      if (paymentError || !payment) return jsonError(paymentError?.message || "Não foi possível registrar o pagamento.", 500);

      const { data, error } = await context.supabase
        .from("transactions")
        .update({
          is_paid: true,
          metadata: mergeMetadata(transaction.metadata, {
            installment_status: "paid",
            payment_transaction_id: payment.id,
            paid_at: new Date().toISOString()
          })
        })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.id)
        .select("*")
        .single();

      if (error) return jsonError(error.message, 500);

      const { error: installmentError } = await context.supabase
        .from("installments")
        .update({ status: "paid", metadata: { payment_transaction_id: payment.id, paid_at: new Date().toISOString() } })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.installment_id);

      if (installmentError) return jsonError(installmentError.message, 500);

      await reconcileInstallmentPlan(context.supabase, context.user.id, transaction.installment_plan_id);
      await recalculateInvoicesForCardMonths(context.supabase, context.user.id, transaction.credit_card_id, [transaction.billing_month]);

      return NextResponse.json({ data, payment });
    }

    if (payload.action === "edit") {
      const billingMonth = normalizeBillingMonth(payload.billing_month);
      const categoryId =
        normalizeOptionalUuid(payload.category_id) ||
        (await ensureCategoryByName(
          context.supabase,
          context.user.id,
          payload.category_name,
          inferCategoryTypeFromTransaction("card_expense")
        ));

      const { data, error } = await context.supabase
        .from("transactions")
        .update({
          description: payload.description,
          amount: payload.amount,
          date: payload.due_date,
          billing_month: billingMonth,
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
          billing_month: billingMonth,
          category_id: categoryId,
          metadata: { notes: payload.notes || "" }
        })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.installment_id);

      if (installmentError) return jsonError(installmentError.message, 500);

      await reconcileInstallmentPlan(context.supabase, context.user.id, transaction.installment_plan_id);
      await recalculateInvoicesForCardMonths(context.supabase, context.user.id, transaction.credit_card_id, [previousBillingMonth, billingMonth]);

      return NextResponse.json({ data });
    }

    if (payload.action === "delete") {
      const { data, error } = await context.supabase
        .from("transactions")
        .update({
          is_deleted: true,
          status: "canceled",
          metadata: mergeMetadata(transaction.metadata, {
            deleted_single_installment: true,
            installment_deleted_at: new Date().toISOString()
          })
        })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.id)
        .select("*")
        .single();

      if (error) return jsonError(error.message, 500);

      const { error: installmentError } = await context.supabase
        .from("installments")
        .update({
          status: "canceled",
          metadata: mergeMetadata(transaction.metadata, {
            deleted_single_installment: true,
            installment_deleted_at: new Date().toISOString()
          })
        })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.installment_id);

      if (installmentError) return jsonError(installmentError.message, 500);

      const paymentTransactionId =
        transaction.metadata && typeof transaction.metadata === "object" && !Array.isArray(transaction.metadata)
          ? (transaction.metadata as Record<string, unknown>).payment_transaction_id
          : null;

      if (typeof paymentTransactionId === "string") {
        await context.supabase
          .from("transactions")
          .update({ is_deleted: true, status: "canceled" })
          .eq("owner_id", context.user.id)
          .eq("id", paymentTransactionId);
      }

      await reconcileInstallmentPlan(context.supabase, context.user.id, transaction.installment_plan_id);
      await recalculateInvoicesForCardMonths(context.supabase, context.user.id, transaction.credit_card_id, [previousBillingMonth]);

      return NextResponse.json({ data });
    }

    return jsonError("Ação inválida.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar a parcela.");
  }
}
