import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, parseJson } from "@/lib/http/api";
import { normalizeBillingMonth } from "@/lib/domain/billing";
import { applyInvoicePaymentToOpenInstallments, recalculateInvoiceForCardMonth } from "@/lib/server/card-ledger";

const paymentSchema = z.object({
  credit_card_id: z.string().uuid("Selecione um cartão."),
  account_id: z.string().uuid("Selecione uma conta de pagamento."),
  billing_month: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "Competência inválida."),
  amount: z.coerce.number().positive("Valor pago deve ser maior que zero."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  notes: z.string().trim().optional().nullable()
});

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, paymentSchema);
    const billingMonth = normalizeBillingMonth(payload.billing_month);
    const invoice = await recalculateInvoiceForCardMonth(context.supabase, context.user.id, payload.credit_card_id, billingMonth);
    const invoiceTotal = money(invoice.total_amount);
    const paidAmount = money(invoice.paid_amount);
    const openAmount = money(invoiceTotal - paidAmount);

    if (openAmount <= 0) return jsonError("A fatura selecionada já está quitada.");
    if (payload.amount > openAmount) return jsonError("O valor pago não pode ser maior que a fatura em aberto.");

    const { data: payment, error: paymentError } = await context.supabase
      .from("transactions")
      .insert({
        owner_id: context.user.id,
        description: `Pagamento de fatura ${billingMonth.slice(0, 7)}`,
        type: "invoice_payment",
        amount: payload.amount,
        date: payload.date,
        billing_month: billingMonth,
        account_id: payload.account_id,
        destination_account_id: null,
        credit_card_id: payload.credit_card_id,
        category_id: null,
        invoice_id: invoice.id,
        status: "posted",
        is_paid: true,
        notes: payload.notes || null,
        metadata: { invoice_billing_month: billingMonth },
        is_deleted: false
      })
      .select("*")
      .single();

    if (paymentError || !payment) return jsonError(paymentError?.message || "Não foi possível registrar o pagamento.", 500);

    const nextPaidAmount = money(paidAmount + payload.amount);
    const { error: invoiceUpdateError } = await context.supabase
      .from("invoices")
      .update({ paid_amount: nextPaidAmount, status: nextPaidAmount >= invoiceTotal ? "paid" : "open" })
      .eq("id", invoice.id)
      .eq("owner_id", context.user.id);

    if (invoiceUpdateError) return jsonError(invoiceUpdateError.message, 500);

    const settlement = await applyInvoicePaymentToOpenInstallments(context.supabase, context.user.id, {
      creditCardId: payload.credit_card_id,
      billingMonth,
      amount: payload.amount,
      paymentTransactionId: payment.id
    });

    const updatedInvoice = await recalculateInvoiceForCardMonth(context.supabase, context.user.id, payload.credit_card_id, billingMonth);
    const restoredPaidAmount = money(nextPaidAmount);
    await context.supabase
      .from("invoices")
      .update({ paid_amount: restoredPaidAmount, status: restoredPaidAmount >= money(updatedInvoice.total_amount) ? "paid" : "open" })
      .eq("id", invoice.id)
      .eq("owner_id", context.user.id);

    return NextResponse.json({ data: { payment, settlement } }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível pagar a fatura.");
  }
}
