import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiContext, jsonError, mergeMetadata, normalizeOptionalUuid, parseJson } from "@/lib/http/api";
import { recalculateInvoicesForCardMonths } from "@/lib/server/card-ledger";

const cardSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome do cartão é obrigatório."),
  brand: z.string().trim().optional().nullable(),
  limit_amount: z.coerce.number().min(0, "Limite não pode ser negativo."),
  closing_day: z.coerce.number().int().min(1, "Fechamento inválido.").max(31, "Fechamento inválido."),
  due_day: z.coerce.number().int().min(1, "Vencimento inválido.").max(31, "Vencimento inválido."),
  account_id: z.string().uuid().optional().nullable(),
  color: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({
  id: z.string().uuid("Cartão inválido.")
});

type SafeDeleteCardResult = {
  card_id: string;
  billing_months: string[] | null;
};

export async function GET() {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  const { data, error } = await context.supabase
    .from("credit_cards")
    .select("*")
    .eq("owner_id", context.user.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, cardSchema);

    const record = {
      owner_id: context.user.id,
      account_id: normalizeOptionalUuid(payload.account_id),
      name: payload.name,
      brand: payload.brand || null,
      limit_amount: payload.limit_amount,
      closing_day: payload.closing_day,
      due_day: payload.due_day,
      color: payload.color || null,
      is_archived: false,
      is_deleted: false,
      metadata: { notes: payload.notes || "" }
    };

    const { data, error } = await context.supabase.from("credit_cards").insert(record).select("*").single();

    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível salvar o cartão.");
  }
}

export async function PATCH(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, cardSchema.extend({ id: z.string().uuid("Cartão inválido.") }));

    const { data: existing, error: existingError } = await context.supabase
      .from("credit_cards")
      .select("*")
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .single();

    if (existingError || !existing) return jsonError("Cartão não encontrado.", 404);

    const update = {
      account_id: normalizeOptionalUuid(payload.account_id),
      name: payload.name,
      brand: payload.brand || null,
      limit_amount: payload.limit_amount,
      closing_day: payload.closing_day,
      due_day: payload.due_day,
      color: payload.color || null,
      metadata: mergeMetadata(existing.metadata, { notes: payload.notes || "" })
    };

    const { data, error } = await context.supabase
      .from("credit_cards")
      .update(update)
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar o cartão.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, deleteSchema);

    const { data, error } = await context.supabase.rpc("safe_delete_credit_card", {
      target_card_id: payload.id
    });

    if (error) return jsonError(error.message, 500);

    const result = Array.isArray(data) ? (data[0] as SafeDeleteCardResult | undefined) : undefined;

    if (result?.card_id && result.billing_months?.length) {
      await recalculateInvoicesForCardMonths(context.supabase, context.user.id, result.card_id, result.billing_months);
    }

    return NextResponse.json({
      ok: true,
      behavior: "card_archived_installments_preserved_as_debt"
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir o cartão.");
  }
}