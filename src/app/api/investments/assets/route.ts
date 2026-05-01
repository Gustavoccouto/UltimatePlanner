import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, mergeMetadata, normalizeOptionalUuid, parseJson } from "@/lib/http/api";
import { createInvestmentActivityLog } from "@/lib/server/investments";

const assetSchema = z.object({
  id: z.string().uuid().optional(),
  investment_account_id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1, "Nome do investimento é obrigatório."),
  ticker: z.string().trim().optional().nullable(),
  asset_type: z.enum(["stock", "etf", "fii", "fixed_income", "crypto", "fund", "savings", "other"]).default("other"),
  quantity: z.coerce.number().nonnegative("Quantidade não pode ser negativa.").default(1),
  average_price: z.coerce.number().nonnegative("Preço médio não pode ser negativo.").default(0),
  current_price: z.coerce.number().nonnegative("Preço atual não pode ser negativo.").default(0),
  purchase_date: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({ id: z.string().uuid("Investimento inválido.") });

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, assetSchema);
    const record = {
      owner_id: context.user.id,
      investment_account_id: normalizeOptionalUuid(payload.investment_account_id),
      name: payload.name,
      ticker: payload.ticker ? payload.ticker.toUpperCase() : null,
      asset_type: payload.asset_type,
      quantity: payload.quantity,
      average_price: payload.average_price,
      current_price: payload.current_price,
      purchase_date: payload.purchase_date || null,
      is_deleted: false,
      metadata: { notes: payload.notes || "" }
    };

    const { data, error } = await context.supabase.from("investments").insert(record).select("*").single();
    if (error) return jsonError(error.message, 500);

    await createInvestmentActivityLog(context.supabase, {
      ownerId: context.user.id,
      actorId: context.user.id,
      entityType: "investment",
      entityId: data.id,
      actionType: "investment_created",
      newValue: data.name
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível salvar o investimento.");
  }
}

export async function PATCH(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, assetSchema.extend({ id: z.string().uuid("Investimento inválido.") }));
    const { data: existing, error: existingError } = await context.supabase
      .from("investments")
      .select("*")
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .maybeSingle();

    if (existingError || !existing) return jsonError("Investimento não encontrado.", 404);

    const update = {
      investment_account_id: normalizeOptionalUuid(payload.investment_account_id),
      name: payload.name,
      ticker: payload.ticker ? payload.ticker.toUpperCase() : null,
      asset_type: payload.asset_type,
      quantity: payload.quantity,
      average_price: payload.average_price,
      current_price: payload.current_price,
      purchase_date: payload.purchase_date || null,
      metadata: mergeMetadata(existing.metadata, { notes: payload.notes || "" })
    };

    const { data, error } = await context.supabase
      .from("investments")
      .update(update)
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);

    await createInvestmentActivityLog(context.supabase, {
      ownerId: context.user.id,
      actorId: context.user.id,
      entityType: "investment",
      entityId: payload.id,
      actionType: "investment_updated",
      previousValue: { name: existing.name, quantity: existing.quantity, average_price: existing.average_price, current_price: existing.current_price },
      newValue: { name: data.name, quantity: data.quantity, average_price: data.average_price, current_price: data.current_price }
    });

    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar o investimento.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, deleteSchema);
    const { error } = await context.supabase
      .from("investments")
      .update({ is_deleted: true })
      .eq("id", payload.id)
      .eq("owner_id", context.user.id);

    if (error) return jsonError(error.message, 500);

    await createInvestmentActivityLog(context.supabase, {
      ownerId: context.user.id,
      actorId: context.user.id,
      entityType: "investment",
      entityId: payload.id,
      actionType: "investment_deleted"
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir o investimento.");
  }
}
