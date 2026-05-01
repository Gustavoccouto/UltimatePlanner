import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, mergeMetadata, parseJson } from "@/lib/http/api";
import { createInvestmentActivityLog } from "@/lib/server/investments";

const accountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome da corretora é obrigatório."),
  institution: z.string().trim().optional().nullable(),
  type: z.string().trim().default("brokerage"),
  cash_balance: z.coerce.number().default(0),
  color: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({ id: z.string().uuid("Corretora inválida.") });

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, accountSchema);
    const record = {
      owner_id: context.user.id,
      name: payload.name,
      institution: payload.institution || null,
      type: payload.type || "brokerage",
      cash_balance: payload.cash_balance,
      color: payload.color || null,
      is_deleted: false,
      metadata: { notes: payload.notes || "" }
    };

    const { data, error } = await context.supabase.from("investment_accounts").insert(record).select("*").single();
    if (error) return jsonError(error.message, 500);

    await createInvestmentActivityLog(context.supabase, {
      ownerId: context.user.id,
      actorId: context.user.id,
      entityType: "investment_account",
      entityId: data.id,
      actionType: "investment_account_created",
      newValue: data.name
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível salvar a corretora.");
  }
}

export async function PATCH(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, accountSchema.extend({ id: z.string().uuid("Corretora inválida.") }));
    const { data: existing, error: existingError } = await context.supabase
      .from("investment_accounts")
      .select("*")
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .maybeSingle();

    if (existingError || !existing) return jsonError("Corretora não encontrada.", 404);

    const update = {
      name: payload.name,
      institution: payload.institution || null,
      type: payload.type || "brokerage",
      cash_balance: payload.cash_balance,
      color: payload.color || null,
      metadata: mergeMetadata(existing.metadata, { notes: payload.notes || "" })
    };

    const { data, error } = await context.supabase
      .from("investment_accounts")
      .update(update)
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);

    await createInvestmentActivityLog(context.supabase, {
      ownerId: context.user.id,
      actorId: context.user.id,
      entityType: "investment_account",
      entityId: payload.id,
      actionType: "investment_account_updated",
      previousValue: { name: existing.name, cash_balance: existing.cash_balance },
      newValue: { name: data.name, cash_balance: data.cash_balance }
    });

    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar a corretora.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, deleteSchema);
    const { error } = await context.supabase
      .from("investment_accounts")
      .update({ is_deleted: true })
      .eq("id", payload.id)
      .eq("owner_id", context.user.id);

    if (error) return jsonError(error.message, 500);

    await createInvestmentActivityLog(context.supabase, {
      ownerId: context.user.id,
      actorId: context.user.id,
      entityType: "investment_account",
      entityId: payload.id,
      actionType: "investment_account_deleted"
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir a corretora.");
  }
}
