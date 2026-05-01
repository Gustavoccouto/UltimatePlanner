import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, normalizeOptionalUuid, parseJson } from "@/lib/http/api";
import { applyInvestmentTransactionEffect, createInvestmentActivityLog, getOwnedInvestment } from "@/lib/server/investments";
import { toNumber } from "@/lib/domain/investments";

const movementSchema = z.object({
  id: z.string().uuid().optional(),
  investment_id: z.string().uuid().optional().nullable(),
  investment_account_id: z.string().uuid().optional().nullable(),
  type: z.enum(["buy", "sell", "deposit", "withdraw", "dividend", "yield", "fee", "adjust"]),
  amount: z.coerce.number().nonnegative("Valor não pode ser negativo.").default(0),
  quantity: z.coerce.number().nonnegative("Quantidade não pode ser negativa.").optional().nullable(),
  unit_price: z.coerce.number().nonnegative("Preço unitário não pode ser negativo.").optional().nullable(),
  fees: z.coerce.number().nonnegative("Taxas não podem ser negativas.").optional().nullable(),
  date: z.string().trim().min(1, "Data é obrigatória."),
  notes: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({ id: z.string().uuid("Movimentação inválida.") });

function computedAmount(payload: z.infer<typeof movementSchema>) {
  const explicit = toNumber(payload.amount);
  const quantity = toNumber(payload.quantity);
  const unitPrice = toNumber(payload.unit_price);
  if (explicit > 0) return explicit;
  if (["buy", "sell"].includes(payload.type)) return quantity * unitPrice;
  return explicit;
}

async function normalizeMovementAccountId(context: Awaited<ReturnType<typeof getApiContext>>, payload: z.infer<typeof movementSchema>) {
  if ("error" in context) return null;
  let investmentAccountId = normalizeOptionalUuid(payload.investment_account_id);
  if (!investmentAccountId && payload.investment_id) {
    const investment = await getOwnedInvestment(context.supabase, payload.investment_id, context.user.id);
    investmentAccountId = investment?.investment_account_id || null;
  }
  return investmentAccountId;
}

function validateMovement(payload: z.infer<typeof movementSchema>) {
  if (["buy", "sell", "dividend", "yield"].includes(payload.type) && !payload.investment_id) {
    throw new Error("Escolha um investimento para esta movimentação.");
  }
  if (["buy", "sell"].includes(payload.type) && toNumber(payload.quantity) <= 0) {
    throw new Error("Informe a quantidade da compra ou venda.");
  }
  if (["deposit", "withdraw", "fee", "adjust"].includes(payload.type) && toNumber(payload.amount) <= 0) {
    throw new Error("Informe um valor maior que zero.");
  }
}

function movementRecord(ownerId: string, payload: z.infer<typeof movementSchema>, investmentAccountId: string | null) {
  const amount = computedAmount(payload);
  return {
    owner_id: ownerId,
    investment_id: normalizeOptionalUuid(payload.investment_id),
    investment_account_id: investmentAccountId,
    type: payload.type,
    amount,
    quantity: payload.quantity || null,
    unit_price: payload.unit_price || null,
    fees: payload.fees || 0,
    date: payload.date,
    notes: payload.notes || null,
    is_deleted: false,
    metadata: {}
  };
}

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, movementSchema);
    validateMovement(payload);
    const investmentAccountId = await normalizeMovementAccountId(context, payload);
    const record = movementRecord(context.user.id, payload, investmentAccountId);

    await applyInvestmentTransactionEffect(context.supabase, context.user.id, {
      type: record.type,
      investment_id: record.investment_id,
      investment_account_id: record.investment_account_id,
      amount: Number(record.amount),
      quantity: record.quantity === null ? null : Number(record.quantity),
      unit_price: record.unit_price === null ? null : Number(record.unit_price),
      fees: Number(record.fees || 0)
    }, 1);

    const { data, error } = await context.supabase.from("investment_transactions").insert(record).select("*").single();
    if (error) return jsonError(error.message, 500);

    await createInvestmentActivityLog(context.supabase, {
      ownerId: context.user.id,
      actorId: context.user.id,
      entityType: "investment_transaction",
      entityId: data.id,
      actionType: `investment_transaction_${data.type}`,
      newValue: data.amount,
      metadata: { investment_id: data.investment_id, investment_account_id: data.investment_account_id }
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível salvar a movimentação.");
  }
}

export async function PATCH(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, movementSchema.extend({ id: z.string().uuid("Movimentação inválida.") }));
    validateMovement(payload);

    const { data: existing, error: existingError } = await context.supabase
      .from("investment_transactions")
      .select("*")
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (existingError || !existing) return jsonError("Movimentação não encontrada.", 404);

    await applyInvestmentTransactionEffect(context.supabase, context.user.id, {
      type: existing.type,
      investment_id: existing.investment_id,
      investment_account_id: existing.investment_account_id,
      amount: Number(existing.amount || 0),
      quantity: existing.quantity === null ? null : Number(existing.quantity),
      unit_price: existing.unit_price === null ? null : Number(existing.unit_price),
      fees: Number(existing.fees || 0)
    }, -1);

    const investmentAccountId = await normalizeMovementAccountId(context, payload);
    const record = movementRecord(context.user.id, payload, investmentAccountId);

    await applyInvestmentTransactionEffect(context.supabase, context.user.id, {
      type: record.type,
      investment_id: record.investment_id,
      investment_account_id: record.investment_account_id,
      amount: Number(record.amount),
      quantity: record.quantity === null ? null : Number(record.quantity),
      unit_price: record.unit_price === null ? null : Number(record.unit_price),
      fees: Number(record.fees || 0)
    }, 1);

    const { data, error } = await context.supabase
      .from("investment_transactions")
      .update(record)
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);

    await createInvestmentActivityLog(context.supabase, {
      ownerId: context.user.id,
      actorId: context.user.id,
      entityType: "investment_transaction",
      entityId: payload.id,
      actionType: "investment_transaction_updated",
      previousValue: { type: existing.type, amount: existing.amount },
      newValue: { type: data.type, amount: data.amount },
      metadata: { investment_id: data.investment_id, investment_account_id: data.investment_account_id }
    });

    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar a movimentação.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, deleteSchema);
    const { data: existing, error: existingError } = await context.supabase
      .from("investment_transactions")
      .select("*")
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (existingError || !existing) return jsonError("Movimentação não encontrada.", 404);

    await applyInvestmentTransactionEffect(context.supabase, context.user.id, {
      type: existing.type,
      investment_id: existing.investment_id,
      investment_account_id: existing.investment_account_id,
      amount: Number(existing.amount || 0),
      quantity: existing.quantity === null ? null : Number(existing.quantity),
      unit_price: existing.unit_price === null ? null : Number(existing.unit_price),
      fees: Number(existing.fees || 0)
    }, -1);

    const { error } = await context.supabase
      .from("investment_transactions")
      .update({ is_deleted: true })
      .eq("id", payload.id)
      .eq("owner_id", context.user.id);

    if (error) return jsonError(error.message, 500);

    await createInvestmentActivityLog(context.supabase, {
      ownerId: context.user.id,
      actorId: context.user.id,
      entityType: "investment_transaction",
      entityId: payload.id,
      actionType: "investment_transaction_deleted",
      previousValue: existing.amount,
      metadata: { investment_id: existing.investment_id, investment_account_id: existing.investment_account_id }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir a movimentação.");
  }
}
