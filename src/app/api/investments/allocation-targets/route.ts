import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, mergeMetadata, parseJson } from "@/lib/http/api";
import { createInvestmentActivityLog } from "@/lib/server/investments";

const allocationSchema = z.object({
  id: z.string().uuid().optional(),
  target_scope: z.enum(["asset_type", "asset"]),
  target_key: z.string().trim().min(1, "Informe o alvo da alocação."),
  label: z.string().trim().min(1, "Informe o rótulo da alocação."),
  target_percent: z.coerce.number().min(0, "Percentual não pode ser negativo.").max(100, "Percentual máximo é 100."),
  notes: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({ id: z.string().uuid("Alocação inválida.") });

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, allocationSchema);
    const record = {
      owner_id: context.user.id,
      target_scope: payload.target_scope,
      target_key: payload.target_key,
      label: payload.label,
      target_percent: payload.target_percent,
      is_deleted: false,
      metadata: { notes: payload.notes || "" }
    };

    const { data, error } = await context.supabase
      .from("investment_allocation_targets")
      .insert(record)
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);

    await createInvestmentActivityLog(context.supabase, {
      ownerId: context.user.id,
      actorId: context.user.id,
      entityType: "investment_allocation_target",
      entityId: data.id,
      actionType: "investment_allocation_target_created",
      newValue: { label: data.label, target_percent: data.target_percent }
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível salvar a alocação alvo.");
  }
}

export async function PATCH(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, allocationSchema.extend({ id: z.string().uuid("Alocação inválida.") }));
    const { data: existing, error: existingError } = await context.supabase
      .from("investment_allocation_targets")
      .select("*")
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (existingError || !existing) return jsonError("Alocação alvo não encontrada.", 404);

    const update = {
      target_scope: payload.target_scope,
      target_key: payload.target_key,
      label: payload.label,
      target_percent: payload.target_percent,
      metadata: mergeMetadata(existing.metadata, { notes: payload.notes || "" })
    };

    const { data, error } = await context.supabase
      .from("investment_allocation_targets")
      .update(update)
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);

    await createInvestmentActivityLog(context.supabase, {
      ownerId: context.user.id,
      actorId: context.user.id,
      entityType: "investment_allocation_target",
      entityId: payload.id,
      actionType: "investment_allocation_target_updated",
      previousValue: { label: existing.label, target_percent: existing.target_percent },
      newValue: { label: data.label, target_percent: data.target_percent }
    });

    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar a alocação alvo.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, deleteSchema);
    const { error } = await context.supabase
      .from("investment_allocation_targets")
      .update({ is_deleted: true })
      .eq("id", payload.id)
      .eq("owner_id", context.user.id);

    if (error) return jsonError(error.message, 500);

    await createInvestmentActivityLog(context.supabase, {
      ownerId: context.user.id,
      actorId: context.user.id,
      entityType: "investment_allocation_target",
      entityId: payload.id,
      actionType: "investment_allocation_target_deleted"
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir a alocação alvo.");
  }
}
