import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, normalizeOptionalUuid, parseJson } from "@/lib/http/api";
import { assertCanEdit, createActivityLog, movementDelta } from "@/lib/server/collaboration";
import type { ProjectMovement } from "@/lib/domain/app-types";

const movementSchema = z.object({
  project_id: z.string().uuid("Projeto inválido."),
  account_id: z.string().uuid().optional().nullable(),
  type: z.enum(["add", "remove", "adjust"]),
  amount: z.coerce.number().positive("Valor precisa ser maior que zero."),
  description: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({ id: z.string().uuid("Movimento inválido."), project_id: z.string().uuid("Projeto inválido.") });

async function recalcProjectCash(supabase: any, projectId: string) {
  const { data, error } = await supabase
    .from("project_movements")
    .select("type, amount")
    .eq("project_id", projectId)
    .eq("is_deleted", false);
  if (error) throw error;
  const movements = (data || []) as Pick<ProjectMovement, "type" | "amount">[];
  const balance = movements.reduce(
    (sum: number, item: Pick<ProjectMovement, "type" | "amount">) => sum + movementDelta(item.type, Number(item.amount || 0)),
    0
  );
  const { error: updateError } = await supabase.from("projects").update({ current_amount: balance }).eq("id", projectId);
  if (updateError) throw updateError;
}

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, movementSchema);
    const access = await assertCanEdit(context.supabase, "project", payload.project_id, context.user.id);

    const record = {
      owner_id: access.ownerId,
      project_id: payload.project_id,
      account_id: normalizeOptionalUuid(payload.account_id),
      actor_id: context.user.id,
      type: payload.type,
      amount: payload.amount,
      description: payload.description || null,
      is_deleted: false
    };

    const { data, error } = await context.supabase.from("project_movements").insert(record).select("*").single();
    if (error) return jsonError(error.message, 500);
    await recalcProjectCash(context.supabase, payload.project_id);

    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "project_movement",
      entityId: data.id,
      actionType: payload.type === "add" ? "project_contribution_added" : "project_contribution_removed",
      newValue: payload.amount,
      metadata: { project_id: payload.project_id, movement_type: payload.type, description: payload.description || "" }
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível registrar o movimento.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, deleteSchema);
    const access = await assertCanEdit(context.supabase, "project", payload.project_id, context.user.id);

    const { error } = await context.supabase
      .from("project_movements")
      .update({ is_deleted: true })
      .eq("id", payload.id)
      .eq("project_id", payload.project_id);

    if (error) return jsonError(error.message, 500);
    await recalcProjectCash(context.supabase, payload.project_id);

    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "project_movement",
      entityId: payload.id,
      actionType: "project_contribution_deleted",
      metadata: { project_id: payload.project_id }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir o movimento.");
  }
}
