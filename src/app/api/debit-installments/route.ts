import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, normalizeOptionalUuid, parseJson } from "@/lib/http/api";
import { ensureCategoryByName, inferCategoryTypeFromTransaction } from "@/lib/server/categories";
import { buildDebitInstallmentDrafts } from "@/lib/domain/planning";

const createSchema = z.object({
  description: z.string().trim().min(1, "Descrição é obrigatória."),
  account_id: z.string().uuid("Selecione uma conta."),
  category_id: z.string().uuid().optional().nullable(),
  category_name: z.string().trim().optional().nullable(),
  amount_mode: z.enum(["total", "installment"]).default("total"),
  amount_value: z.coerce.number().positive("Valor deve ser maior que zero."),
  installments_count: z.coerce.number().int().min(2, "Informe ao menos 2 parcelas."),
  first_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data da primeira parcela inválida."),
  notes: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({ id: z.string().uuid("Parcelamento inválido.") });

export async function GET() {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  const [{ data: plans, error: plansError }, { data: installments, error: installmentsError }] = await Promise.all([
    context.supabase
      .from("installment_plans")
      .select("*")
      .eq("owner_id", context.user.id)
      .eq("payment_method", "debit")
      .neq("status", "canceled")
      .order("first_date", { ascending: false }),
    context.supabase
      .from("installments")
      .select("*")
      .eq("owner_id", context.user.id)
      .is("credit_card_id", null)
      .neq("status", "canceled")
      .order("due_date", { ascending: true })
  ]);

  if (plansError) return jsonError(plansError.message, 500);
  if (installmentsError) return jsonError(installmentsError.message, 500);
  return NextResponse.json({ data: { plans: plans || [], installments: installments || [] } });
}


export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, createSchema);
    const categoryId = normalizeOptionalUuid(payload.category_id) || await ensureCategoryByName(
      context.supabase,
      context.user.id,
      payload.category_name,
      inferCategoryTypeFromTransaction("expense")
    );

    const debit = buildDebitInstallmentDrafts({
      description: payload.description,
      amountMode: payload.amount_mode,
      amountValue: payload.amount_value,
      installmentsCount: payload.installments_count,
      firstDate: payload.first_date
    });

    if (debit.totalAmount <= 0 || debit.drafts.length < 2) {
      return jsonError("Valor e quantidade de parcelas devem ser válidos.");
    }

    const planRecord = {
      owner_id: context.user.id,
      description: payload.description,
      total_amount: debit.totalAmount,
      installments_count: payload.installments_count,
      remaining_installments: payload.installments_count,
      payment_method: "debit",
      account_id: payload.account_id,
      credit_card_id: null,
      category_id: categoryId,
      first_date: payload.first_date,
      status: "active",
      metadata: {
        notes: payload.notes || "",
        amount_entry_mode: payload.amount_mode,
        amount_entry_value: payload.amount_value
      }
    };

    const { data: plan, error: planError } = await context.supabase.from("installment_plans").insert(planRecord).select("*").single();
    if (planError || !plan) return jsonError(planError?.message || "Não foi possível criar o parcelamento.", 500);

    const installmentRows = debit.drafts.map((draft) => ({
      owner_id: context.user.id,
      installment_plan_id: plan.id,
      installment_number: draft.installment_number,
      installments_count: draft.installments_count,
      description: draft.description,
      amount: draft.amount,
      due_date: draft.due_date,
      billing_month: null,
      account_id: payload.account_id,
      credit_card_id: null,
      category_id: categoryId,
      status: "pending",
      metadata: { notes: payload.notes || "" }
    }));

    const { data: installments, error: installmentsError } = await context.supabase.from("installments").insert(installmentRows).select("*");
    if (installmentsError || !installments) return jsonError(installmentsError?.message || "Não foi possível criar as parcelas.", 500);

    const transactionRows = installments.map((installment: any) => ({
      owner_id: context.user.id,
      description: installment.description,
      type: "expense",
      amount: installment.amount,
      date: installment.due_date,
      billing_month: null,
      account_id: payload.account_id,
      destination_account_id: null,
      credit_card_id: null,
      category_id: categoryId,
      invoice_id: null,
      installment_plan_id: plan.id,
      installment_id: installment.id,
      status: "posted",
      is_paid: false,
      notes: payload.notes || null,
      metadata: {
        installment_number: installment.installment_number,
        installments_count: installment.installments_count,
        installment_status: "pending",
        payment_method: "debit",
        amount_entry_mode: payload.amount_mode,
        amount_entry_value: payload.amount_value
      },
      is_deleted: false
    }));

    const { data: transactions, error: transactionsError } = await context.supabase.from("transactions").insert(transactionRows).select("*");
    if (transactionsError || !transactions) return jsonError(transactionsError?.message || "Não foi possível criar os lançamentos do parcelamento.", 500);

    for (const transaction of transactions) {
      if (!transaction.installment_id) continue;
      const { error: linkError } = await context.supabase
        .from("installments")
        .update({ transaction_id: transaction.id })
        .eq("owner_id", context.user.id)
        .eq("id", transaction.installment_id);
      if (linkError) return jsonError(linkError.message, 500);
    }

    return NextResponse.json({ data: { plan, installments, transactions } }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível criar o parcelamento no débito.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, deleteSchema);

    const { error: transactionsError } = await context.supabase
      .from("transactions")
      .update({ is_deleted: true, status: "canceled" })
      .eq("owner_id", context.user.id)
      .eq("installment_plan_id", payload.id);
    if (transactionsError) return jsonError(transactionsError.message, 500);

    const { error: installmentsError } = await context.supabase
      .from("installments")
      .update({ status: "canceled" })
      .eq("owner_id", context.user.id)
      .eq("installment_plan_id", payload.id);
    if (installmentsError) return jsonError(installmentsError.message, 500);

    const { error: planError } = await context.supabase
      .from("installment_plans")
      .update({ status: "canceled", remaining_installments: 0 })
      .eq("owner_id", context.user.id)
      .eq("id", payload.id)
      .eq("payment_method", "debit");
    if (planError) return jsonError(planError.message, 500);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir o parcelamento.");
  }
}
