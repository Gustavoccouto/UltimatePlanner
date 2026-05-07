import { NextResponse } from "next/server";
import { z } from "zod";

import { buildCreditPurchaseDrafts } from "@/lib/domain/card-ledger";
import { getApiContext, jsonError, normalizeOptionalUuid, parseJson } from "@/lib/http/api";
import { calculateCardLimitImpact } from "@/lib/server/card-limit";
import { recalculateInvoicesForCardMonths } from "@/lib/server/card-ledger";
import { ensureCategoryByName, inferCategoryTypeFromTransaction } from "@/lib/server/categories";

const purchaseSchema = z.object({
  description: z.string().trim().min(1, "Descrição é obrigatória."),
  credit_card_id: z.string().uuid("Selecione um cartão."),
  category_id: z.string().uuid().optional().nullable(),
  category_name: z.string().trim().optional().nullable(),
  amount_mode: z.enum(["total", "installment"]).default("total"),
  amount_value: z.coerce.number().positive("Valor deve ser maior que zero."),
  installments_count: z.coerce.number().int().min(1, "Informe ao menos 1 parcela."),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data da compra inválida."),
  notes: z.string().trim().optional().nullable(),
  allow_over_limit: z.boolean().optional().default(false)
});

export async function POST(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, purchaseSchema);

    const { data: card, error: cardError } = await context.supabase
      .from("credit_cards")
      .select("*")
      .eq("id", payload.credit_card_id)
      .eq("owner_id", context.user.id)
      .eq("is_deleted", false)
      .single();

    if (cardError || !card) return jsonError("Cartão não encontrado.", 404);

    const purchase = buildCreditPurchaseDrafts({
      description: payload.description,
      amountMode: payload.amount_mode,
      amountValue: payload.amount_value,
      installmentsCount: payload.installments_count,
      purchaseDate: payload.purchase_date,
      card
    });

    if (purchase.totalAmount <= 0 || purchase.drafts.length === 0) {
      return jsonError("Valor e quantidade de parcelas devem ser maiores que zero.");
    }

    const limitImpact = await calculateCardLimitImpact(
      context.supabase,
      context.user.id,
      payload.credit_card_id,
      purchase.totalAmount
    );

    if (limitImpact.exceeds_limit && !payload.allow_over_limit) {
      return NextResponse.json(
        {
          error: limitImpact.message || "Essa compra ultrapassa o limite do cartão.",
          code: "CARD_LIMIT_EXCEEDED",
          data: limitImpact
        },
        { status: 409 }
      );
    }

    const categoryId =
      normalizeOptionalUuid(payload.category_id) ||
      (await ensureCategoryByName(
        context.supabase,
        context.user.id,
        payload.category_name,
        inferCategoryTypeFromTransaction("card_expense")
      ));

    const planRecord = {
      owner_id: context.user.id,
      description: payload.description,
      total_amount: purchase.totalAmount,
      installments_count: payload.installments_count,
      remaining_installments: payload.installments_count,
      payment_method: "credit_card",
      account_id: null,
      credit_card_id: payload.credit_card_id,
      category_id: categoryId,
      first_date: payload.purchase_date,
      status: "active",
      metadata: {
        notes: payload.notes || "",
        amount_entry_mode: payload.amount_mode,
        amount_entry_value: payload.amount_value,
        invoice_month: purchase.firstBillingMonth
      }
    };

    const { data: plan, error: planError } = await context.supabase
      .from("installment_plans")
      .insert(planRecord)
      .select("*")
      .single();

    if (planError || !plan) return jsonError(planError?.message || "Não foi possível criar o parcelamento.", 500);

    const installmentRows = purchase.drafts.map((draft) => ({
      owner_id: context.user.id,
      installment_plan_id: plan.id,
      installment_number: draft.installment_number,
      installments_count: draft.installments_count,
      description: draft.description,
      amount: draft.amount,
      due_date: draft.due_date,
      billing_month: draft.billing_month,
      account_id: null,
      credit_card_id: payload.credit_card_id,
      category_id: categoryId,
      status: "pending",
      metadata: { notes: payload.notes || "" }
    }));

    const { data: installments, error: installmentsError } = await context.supabase
      .from("installments")
      .insert(installmentRows)
      .select("*");

    if (installmentsError || !installments) {
      return jsonError(installmentsError?.message || "Não foi possível criar as parcelas.", 500);
    }

    const transactionRows = installments.map((installment: any) => ({
      owner_id: context.user.id,
      description: installment.description,
      type: "card_expense",
      amount: installment.amount,
      date: installment.due_date,
      billing_month: installment.billing_month,
      account_id: null,
      destination_account_id: null,
      credit_card_id: payload.credit_card_id,
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
        purchase_date: payload.purchase_date,
        amount_entry_mode: payload.amount_mode,
        amount_entry_value: payload.amount_value,
        over_limit_confirmed: Boolean(payload.allow_over_limit && limitImpact.exceeds_limit)
      },
      is_deleted: false
    }));

    const { data: transactions, error: transactionsError } = await context.supabase
      .from("transactions")
      .insert(transactionRows)
      .select("*");

    if (transactionsError || !transactions) {
      return jsonError(transactionsError?.message || "Não foi possível criar os lançamentos do cartão.", 500);
    }

    for (const transaction of transactions) {
      if (!transaction.installment_id) continue;

      const { error: linkError } = await context.supabase
        .from("installments")
        .update({ transaction_id: transaction.id })
        .eq("id", transaction.installment_id)
        .eq("owner_id", context.user.id);

      if (linkError) return jsonError(linkError.message, 500);
    }

    await recalculateInvoicesForCardMonths(
      context.supabase,
      context.user.id,
      payload.credit_card_id,
      purchase.drafts.map((draft) => draft.billing_month)
    );

    const updatedLimitImpact = await calculateCardLimitImpact(
      context.supabase,
      context.user.id,
      payload.credit_card_id,
      0
    );

    return NextResponse.json(
      {
        data: { plan, installments, transactions },
        limit: updatedLimitImpact,
        warning: limitImpact.near_limit || limitImpact.exceeds_limit ? limitImpact.message : null
      },
      { status: 201 }
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível lançar a compra no cartão.");
  }
}
