import { NextResponse } from "next/server";
import { z } from "zod";

import type { ProjectMovement } from "@/lib/domain/app-types";
import { getApiContext, jsonError, normalizeOptionalUuid, parseJson } from "@/lib/http/api";
import { assertCanEdit, createActivityLog, movementDelta } from "@/lib/server/collaboration";

const movementSchema = z.object({
  project_id: z.string().uuid("Projeto inválido."),
  account_id: z.string().uuid().optional().nullable(),
  type: z.enum(["add", "remove", "adjust"]),
  amount: z.coerce.number().positive("Valor precisa ser maior que zero."),
  description: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({
  id: z.string().uuid("Movimento inválido."),
  project_id: z.string().uuid("Projeto inválido.")
});

async function recalcProjectCash(supabase: any, projectId: string) {
  const { data, error } = await supabase
    .from("project_movements")
    .select("type, amount")
    .eq("project_id", projectId)
    .eq("is_deleted", false);

  if (error) throw error;

  const movements = (data || []) as Pick<ProjectMovement, "type" | "amount">[];
  const balance = movements.reduce(
    (sum, item) => sum + movementDelta(item.type, Number(item.amount || 0)),
    0
  );

  const { error: updateError } = await supabase.from("projects").update({ current_amount: balance }).eq("id", projectId);

  if (updateError) throw updateError;
}

async function createLinkedTransaction(input: {
  supabase: any;
  ownerId: string;
  actorId: string;
  projectId: string;
  movementId: string;
  accountId: string | null;
  type: "add" | "remove" | "adjust";
  amount: number;
  description: string | null;
}) {
  if (!input.accountId || input.type === "adjust") return null;

  const transactionType = input.type === "add" ? "expense" : "income";
  const descriptionPrefix = input.type === "add" ? "Aporte para projeto" : "Retirada de projeto";
  const description = input.description || `${descriptionPrefix}`;

  const { data, error } = await input.supabase
    .from("transactions")
    .insert({
      owner_id: input.ownerId,
      description: `${descriptionPrefix}: ${description}`,
      type: transactionType,
      amount: input.amount,
      date: new Date().toISOString().slice(0, 10),
      account_id: input.accountId,
      destination_account_id: null,
      credit_card_id: null,
      category_id: null,
      invoice_id: null,
      recurring_rule_id: null,
      installment_plan_id: null,
      installment_id: null,
      recurrence_key: null,
      status: "posted",
      is_paid: true,
      notes: input.description || null,
      metadata: {
        source: "project_movement",
        project_id: input.projectId,
        project_movement_id: input.movementId,
        actor_id: input.actorId,
        movement_type: input.type
      },
      is_deleted: false
    })
    .select("*")
    .single();

  if (error) throw error;

  return data;
}

async function cancelLinkedTransaction(supabase: any, ownerId: string, movementId: string) {
  const { error } = await supabase
    .from("transactions")
    .update({
      is_deleted: true,
      status: "canceled",
      metadata: {
        source: "project_movement",
        project_movement_id: movementId,
        canceled_because_project_movement_deleted: true,
        canceled_at: new Date().toISOString()
      }
    })
    .eq("owner_id", ownerId)
    .eq("is_deleted", false)
    .filter("metadata->>project_movement_id", "eq", movementId);

  if (error) throw error;
}

export async function POST(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, movementSchema);
    const access = await assertCanEdit(context.supabase, "project", payload.project_id, context.user.id);
    const accountId = normalizeOptionalUuid(payload.account_id);

    const record = {
      owner_id: access.ownerId,
      project_id: payload.project_id,
      account_id: accountId,
      actor_id: context.user.id,
      type: payload.type,
      amount: payload.amount,
      description: payload.description || null,
      is_deleted: false
    };

    const { data, error } = await context.supabase.from("project_movements").insert(record).select("*").single();

    if (error) return jsonError(error.message, 500);

    const linkedTransaction = await createLinkedTransaction({
      supabase: context.supabase,
      ownerId: access.ownerId,
      actorId: context.user.id,
      projectId: payload.project_id,
      movementId: data.id,
      accountId,
      type: payload.type,
      amount: payload.amount,
      description: payload.description || null
    });

    await recalcProjectCash(context.supabase, payload.project_id);

    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "project_movement",
      entityId: data.id,
      actionType: payload.type === "add" ? "project_contribution_added" : "project_contribution_removed",
      newValue: payload.amount,
      metadata: {
        project_id: payload.project_id,
        movement_type: payload.type,
        description: payload.description || "",
        account_id: accountId,
        transaction_id: linkedTransaction?.id || null
      }
    });

    return NextResponse.json({ data, transaction: linkedTransaction }, { status: 201 });
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

    await cancelLinkedTransaction(context.supabase, access.ownerId, payload.id);
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
