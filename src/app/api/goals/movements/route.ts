import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, normalizeOptionalUuid, parseJson } from "@/lib/http/api";
import { assertCanEdit, createActivityLog, movementDelta } from "@/lib/server/collaboration";
import type { GoalMovement } from "@/lib/domain/app-types";

const movementSchema = z.object({
  goal_id: z.string().uuid("Meta inválida."),
  account_id: z.string().uuid().optional().nullable(),
  type: z.enum(["add", "remove", "adjust"]),
  amount: z.coerce.number().positive("Valor precisa ser maior que zero."),
  description: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({ id: z.string().uuid("Movimento inválido."), goal_id: z.string().uuid("Meta inválida.") });

async function recalcGoal(supabase: any, goalId: string) {
  const [{ data: movements, error: movementsError }, { data: goal, error: goalError }] = await Promise.all([
    supabase.from("goal_movements").select("type, amount").eq("goal_id", goalId).eq("is_deleted", false),
    supabase.from("goals").select("target_amount").eq("id", goalId).single()
  ]);
  if (movementsError || goalError) throw movementsError || goalError;
  const typedMovements = (movements || []) as Pick<GoalMovement, "type" | "amount">[];
  const current = Math.max(
    0,
    typedMovements.reduce(
      (sum: number, item: Pick<GoalMovement, "type" | "amount">) => sum + movementDelta(item.type, Number(item.amount || 0)),
      0
    )
  );
  const status = current >= Number(goal?.target_amount || 0) ? "completed" : "active";
  const { error } = await supabase.from("goals").update({ current_amount: current, status }).eq("id", goalId);
  if (error) throw error;
}

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, movementSchema);
    const access = await assertCanEdit(context.supabase, "goal", payload.goal_id, context.user.id);

    const record = {
      owner_id: access.ownerId,
      goal_id: payload.goal_id,
      account_id: normalizeOptionalUuid(payload.account_id),
      actor_id: context.user.id,
      type: payload.type,
      amount: payload.amount,
      description: payload.description || null,
      is_deleted: false
    };

    const { data, error } = await context.supabase.from("goal_movements").insert(record).select("*").single();
    if (error) return jsonError(error.message, 500);
    await recalcGoal(context.supabase, payload.goal_id);

    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "goal_movement",
      entityId: data.id,
      actionType: payload.type === "add" ? "goal_contribution_added" : "goal_contribution_removed",
      newValue: payload.amount,
      metadata: { goal_id: payload.goal_id, movement_type: payload.type, description: payload.description || "" }
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
    const access = await assertCanEdit(context.supabase, "goal", payload.goal_id, context.user.id);

    const { error } = await context.supabase
      .from("goal_movements")
      .update({ is_deleted: true })
      .eq("id", payload.id)
      .eq("goal_id", payload.goal_id);

    if (error) return jsonError(error.message, 500);
    await recalcGoal(context.supabase, payload.goal_id);

    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "goal_movement",
      entityId: payload.id,
      actionType: "goal_contribution_deleted",
      metadata: { goal_id: payload.goal_id }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir o movimento.");
  }
}
