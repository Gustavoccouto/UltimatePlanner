import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiContext, jsonError, mergeMetadata, normalizeOptionalUuid, parseJson } from "@/lib/http/api";
import { normalizeBillingMonth } from "@/lib/domain/billing";
import { ensureCategoryByName, inferCategoryTypeFromTransaction } from "@/lib/server/categories";
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
  }),

  z.object({
    action: z.literal("delete_plan_by_id"),
    id: z.string().uuid("Parcelamento inválido.")
  })
]);

type AuthedContext = {
  supabase: any;
  user: {
    id: string;
  };
};

type TransactionRow = {
  id: string;
  owner_id: string;
  description: string;
  type: string;
  amount: number | string | null;
  date: string;
  billing_month: string | null;
  account_id: string | null;
  destination_account_id: string | null;
  credit_card_id: string | null;
  category_id: string | null;
  installment_plan_id: string | null;
  installment_id: string | null;
  status: string;
  is_paid: boolean;
  notes: string | null;
  metadata: unknown;
  is_deleted: boolean;
};

type InstallmentStatusRow = {
  status: string | null;
};

type DeleteExecution = {
  found: boolean;
  cardId: string | null;
  billingMonths: string[];
};

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function uniqueMonths(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((item) => String(item || "").slice(0, 7)).filter(Boolean)));
}

function getPaymentTransactionId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>).payment_transaction_id;

  return typeof value === "string" ? value : null;
}

async function readTransaction(context: AuthedContext, id: string) {
  const { data, error } = await context.supabase
    .from("transactions")
    .select("*")
    .eq("owner_id", context.user.id)
    .eq("id", id)
    .eq("is_deleted", false)
    .single();

  if (error || !data) {
    throw new Error("Parcela não encontrada ou já removida.");
  }

  const transaction = data as TransactionRow;

  if (transaction.type !== "card_expense" || !transaction.credit_card_id) {
    throw new Error("O lançamento selecionado não é uma parcela de cartão válida.");
  }

  return transaction;
}

async function refreshPlanStatus(context: AuthedContext, planId: string, metadata: unknown = {}) {
  const { data } = await context.supabase
    .from("installments")
    .select("status")
    .eq("owner_id", context.user.id)
    .eq("installment_plan_id", planId);

  const rows = ((data || []) as InstallmentStatusRow[]).filter((item) => item.status !== "canceled");
  const paidInstallments = rows.filter((item) => item.status === "paid").length;

  const status = rows.length === 0 ? "canceled" : rows.every((item) => item.status === "paid") ? "completed" : "active";

  await context.supabase
    .from("installment_plans")
    .update({
      status,
      paid_installments: paidInstallments,
      metadata: mergeMetadata(metadata, {
        last_installment_delete_recalculated_at: new Date().toISOString()
      })
    })
    .eq("owner_id", context.user.id)
    .eq("id", planId);
}

async function recalculateAffectedInvoices(context: AuthedContext, cardId: string | null, billingMonths: string[]) {
  if (!cardId || !billingMonths.length) {
    return;
  }

  await recalculateInvoicesForCardMonths(context.supabase, context.user.id, cardId, billingMonths);
}

async function deleteSingleInstallment(context: AuthedContext, transactionId: string): Promise<DeleteExecution> {
  const { data: transactionData } = await context.supabase
    .from("transactions")
    .select("*")
    .eq("owner_id", context.user.id)
    .eq("id", transactionId)
    .single();

  if (!transactionData) {
    return {
      found: false,
      cardId: null,
      billingMonths: []
    };
  }

  const transaction = transactionData as TransactionRow;
  const cardId = transaction.credit_card_id;
  const planId = transaction.installment_plan_id;
  const installmentId = transaction.installment_id;
  const billingMonths = uniqueMonths([transaction.billing_month, transaction.date]);

  await context.supabase
    .from("transactions")
    .update({
      is_deleted: true,
      status: "canceled",
      is_paid: false,
      metadata: mergeMetadata(transaction.metadata, {
        deleted_single_installment: true,
        installment_deleted_at: new Date().toISOString(),
        notice: "Parcela individual excluída pelo usuário."
      })
    })
    .eq("owner_id", context.user.id)
    .eq("id", transaction.id);

  if (installmentId) {
    await context.supabase
      .from("installments")
      .update({
        status: "canceled",
        transaction_id: null,
        metadata: mergeMetadata(transaction.metadata, {
          deleted_single_installment: true,
          installment_deleted_at: new Date().toISOString(),
          notice: "Parcela individual excluída pelo usuário."
        })
      })
      .eq("owner_id", context.user.id)
      .eq("id", installmentId);
  }

  const paymentTransactionId = getPaymentTransactionId(transaction.metadata);

  if (paymentTransactionId) {
    await context.supabase
      .from("transactions")
      .update({
        is_deleted: true,
        status: "canceled"
      })
      .eq("owner_id", context.user.id)
      .eq("id", paymentTransactionId);
  }

  await context.supabase
    .from("transactions")
    .update({
      is_deleted: true,
      status: "canceled",
      metadata: {
        canceled_because_installment_deleted: true,
        canceled_at: new Date().toISOString()
      }
    })
    .eq("owner_id", context.user.id)
    .eq("is_deleted", false)
    .filter("metadata->>linked_card_expense_id", "eq", transaction.id);

  if (planId) {
    const { data: planData } = await context.supabase
      .from("installment_plans")
      .select("metadata")
      .eq("owner_id", context.user.id)
      .eq("id", planId)
      .single();

    await refreshPlanStatus(context, planId, planData?.metadata);
  }

  return {
    found: true,
    cardId,
    billingMonths
  };
}

async function deleteInstallmentPlanById(context: AuthedContext, planId: string): Promise<DeleteExecution> {
  const { data: planData } = await context.supabase
    .from("installment_plans")
    .select("*")
    .eq("owner_id", context.user.id)
    .eq("id", planId)
    .single();

  if (!planData) {
    return {
      found: false,
      cardId: null,
      billingMonths: []
    };
  }

  const plan = planData as {
    id: string;
    credit_card_id?: string | null;
    metadata?: unknown;
  };

  const { data: transactionsData } = await context.supabase
    .from("transactions")
    .select("id,billing_month,date,credit_card_id")
    .eq("owner_id", context.user.id)
    .eq("installment_plan_id", planId);

  const relatedTransactions = (transactionsData || []) as Array<{
    id: string;
    billing_month: string | null;
    date: string | null;
    credit_card_id: string | null;
  }>;

  const cardId = plan.credit_card_id || relatedTransactions.find((item) => item.credit_card_id)?.credit_card_id || null;
  const billingMonths = uniqueMonths(
    relatedTransactions.flatMap((item) => [item.billing_month, item.date])
  );

  await context.supabase
    .from("transactions")
    .update({
      is_deleted: true,
      status: "canceled",
      is_paid: false,
      metadata: {
        deleted_with_installment_plan: true,
        installment_plan_deleted_at: new Date().toISOString(),
        notice: "Compra parcelada inteira excluída pelo usuário."
      }
    })
    .eq("owner_id", context.user.id)
    .eq("installment_plan_id", planId);

  await context.supabase
    .from("installments")
    .update({
      status: "canceled",
      transaction_id: null,
      metadata: {
        deleted_with_installment_plan: true,
        installment_plan_deleted_at: new Date().toISOString(),
        notice: "Parcela cancelada pela exclusão da compra inteira."
      }
    })
    .eq("owner_id", context.user.id)
    .eq("installment_plan_id", planId);

  await context.supabase
    .from("installment_plans")
    .update({
      status: "canceled",
      paid_installments: 0,
      metadata: mergeMetadata(plan.metadata, {
        deleted_at: new Date().toISOString(),
        safe_delete: true,
        delete_behavior: "compra_parcelada_inteira_cancelada"
      })
    })
    .eq("owner_id", context.user.id)
    .eq("id", planId);

  return {
    found: true,
    cardId,
    billingMonths
  };
}

async function deleteInstallmentPlanFromTransaction(context: AuthedContext, transactionId: string) {
  const { data } = await context.supabase
    .from("transactions")
    .select("installment_plan_id")
    .eq("owner_id", context.user.id)
    .eq("id", transactionId)
    .single();

  const planId = typeof data?.installment_plan_id === "string" ? data.installment_plan_id : null;

  if (planId) {
    return deleteInstallmentPlanById(context, planId);
  }

  return deleteSingleInstallment(context, transactionId);
}

export async function PATCH(request: Request) {
  const contextResult = await getApiContext();

  if ("error" in contextResult) return contextResult.error;

  const context = contextResult as AuthedContext;

  try {
    const payload = await parseJson(request, bodySchema);

    if (payload.action === "delete") {
      const result = await deleteSingleInstallment(context, payload.id);

      await recalculateAffectedInvoices(context, result.cardId, result.billingMonths);

      return NextResponse.json({
        ok: true,
        behavior: "single_credit_installment_deleted"
      });
    }

    if (payload.action === "delete_plan_by_id") {
      const result = await deleteInstallmentPlanById(context, payload.id);

      await recalculateAffectedInvoices(context, result.cardId, result.billingMonths);

      return NextResponse.json({
        ok: true,
        behavior: result.found ? "entire_credit_installment_plan_deleted" : "already_deleted"
      });
    }

    if (payload.action === "delete_plan") {
      const planResult = await deleteInstallmentPlanById(context, payload.id);
      const result = planResult.found ? planResult : await deleteInstallmentPlanFromTransaction(context, payload.id);

      await recalculateAffectedInvoices(context, result.cardId, result.billingMonths);

      return NextResponse.json({
        ok: true,
        behavior: result.found ? "entire_credit_installment_plan_deleted" : "already_deleted"
      });
    }

    const transaction = await readTransaction(context, payload.id);
    const creditCardId = transaction.credit_card_id;

    if (!creditCardId) {
      return jsonError("Esta parcela não está vinculada a um cartão.", 400);
    }

    const previousBillingMonth = normalizeBillingMonth(transaction.billing_month || transaction.date);

    if (payload.action === "anticipate") {
      const targetBillingMonth = normalizeBillingMonth(payload.target_billing_month);

      const metadata = mergeMetadata(transaction.metadata, {
        installment_status: "pending",
        anticipated_at: new Date().toISOString(),
        anticipated_from_billing_month: previousBillingMonth
      });

      const { data, error } = await context.supabase
        .from("transactions")
        .update({
          billing_month: targetBillingMonth,
          date: payload.date,
          is_paid: false,
          metadata
        })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.id)
        .select("*")
        .single();

      if (error) return jsonError(error.message, 500);

      if (transaction.installment_id) {
        const { error: installmentError } = await context.supabase
          .from("installments")
          .update({
            billing_month: targetBillingMonth,
            due_date: payload.date,
            status: "pending",
            anticipated_at: new Date().toISOString()
          })
          .eq("owner_id", context.user.id)
          .eq("id", transaction.installment_id);

        if (installmentError) return jsonError(installmentError.message, 500);
      }

      await recalculateInvoicesForCardMonths(context.supabase, context.user.id, creditCardId, [
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
          billing_month: normalizeBillingMonth(transaction.billing_month || transaction.date),
          account_id: payload.account_id,
          destination_account_id: null,
          credit_card_id: creditCardId,
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

      if (paymentError || !payment) {
        return jsonError(paymentError?.message || "Não foi possível registrar o pagamento.", 500);
      }

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

      if (transaction.installment_id) {
        const { error: installmentError } = await context.supabase
          .from("installments")
          .update({
            status: "paid",
            metadata: {
              payment_transaction_id: payment.id,
              paid_at: new Date().toISOString()
            }
          })
          .eq("owner_id", context.user.id)
          .eq("id", transaction.installment_id);

        if (installmentError) return jsonError(installmentError.message, 500);
      }

      if (transaction.installment_plan_id) {
        await reconcileInstallmentPlan(context.supabase, context.user.id, transaction.installment_plan_id);
      }

      await recalculateInvoicesForCardMonths(context.supabase, context.user.id, creditCardId, [previousBillingMonth]);

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

      if (transaction.installment_id) {
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
      }

      if (transaction.installment_plan_id) {
        await reconcileInstallmentPlan(context.supabase, context.user.id, transaction.installment_plan_id);
      }

      await recalculateInvoicesForCardMonths(context.supabase, context.user.id, creditCardId, [
        previousBillingMonth,
        billingMonth
      ]);

      return NextResponse.json({ data });
    }

    return jsonError("Ação inválida.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar a parcela.", 500);
  }
}
