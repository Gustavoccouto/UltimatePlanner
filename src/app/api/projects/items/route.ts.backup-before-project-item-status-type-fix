import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiContext, jsonError, parseJson } from "@/lib/http/api";
import { assertCanEdit, createActivityLog } from "@/lib/server/collaboration";

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid("Projeto inválido."),
  name: z.string().trim().min(1, "Nome do item é obrigatório."),
  amount: z.coerce.number().min(0, "Valor não pode ser negativo.").default(0),
  category: z.string().trim().optional().nullable(),
  status: z.enum(["pending", "completed", "canceled"]).default("pending"),
  notes: z.string().trim().optional().nullable(),
  allow_negative: z.boolean().optional().default(false)
});

const deleteSchema = z.object({
  id: z.string().uuid("Item inválido."),
  project_id: z.string().uuid("Projeto inválido.")
});

type SupabaseLike = {
  from: (table: string) => any;
};

function money(value: number | string | null | undefined) {
  const parsed = Number(value || 0);

  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function movementDelta(type: string | null | undefined, amount: number | string | null | undefined) {
  return type === "remove" ? -Math.abs(money(amount)) : Math.abs(money(amount));
}

function mergeObjectMetadata(previous: unknown, next: Record<string, unknown>) {
  const base = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};

  return { ...base, ...next };
}

async function getProjectCashBalance(supabase: SupabaseLike, projectId: string) {
  const { data, error } = await supabase
    .from("project_movements")
    .select("type, amount")
    .eq("project_id", projectId)
    .eq("is_deleted", false);

  if (error) throw new Error(error.message);

  return money(
    (data || []).reduce((sum: number, movement: { type?: string | null; amount?: number | string | null }) => {
      return sum + movementDelta(movement.type, movement.amount);
    }, 0)
  );
}

async function recalcProjectCash(supabase: SupabaseLike, projectId: string) {
  const balance = await getProjectCashBalance(supabase, projectId);
  const { error } = await supabase.from("projects").update({ current_amount: balance }).eq("id", projectId);

  if (error) throw new Error(error.message);

  return balance;
}

async function findCompletionMovement(supabase: SupabaseLike, ownerId: string, projectId: string, itemId: string) {
  const { data, error } = await supabase
    .from("project_movements")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("project_id", projectId)
    .eq("is_deleted", false)
    .filter("metadata->>source", "eq", "project_item_completion")
    .filter("metadata->>project_item_id", "eq", itemId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return data || null;
}

async function softDeleteCompletionMovement(supabase: SupabaseLike, ownerId: string, projectId: string, itemId: string) {
  const movement = await findCompletionMovement(supabase, ownerId, projectId, itemId);

  if (!movement) return null;

  const { error } = await supabase
    .from("project_movements")
    .update({
      is_deleted: true,
      metadata: mergeObjectMetadata(movement.metadata, {
        deleted_because_project_item_reopened: true,
        deleted_at: new Date().toISOString()
      })
    })
    .eq("owner_id", ownerId)
    .eq("id", movement.id);

  if (error) throw new Error(error.message);

  return movement;
}

async function ensureCanCompleteItem(input: {
  supabase: SupabaseLike;
  projectId: string;
  itemId: string;
  amount: number;
  allowNegative: boolean;
  ownerId: string;
}) {
  const currentBalance = await getProjectCashBalance(input.supabase, input.projectId);
  const existingMovement = await findCompletionMovement(input.supabase, input.ownerId, input.projectId, input.itemId);
  const previousItemImpact = existingMovement ? money(existingMovement.amount) : 0;
  const projectedBalance = money(currentBalance + previousItemImpact - input.amount);

  if (projectedBalance < 0 && !input.allowNegative) {
    return {
      ok: false,
      currentBalance,
      itemAmount: input.amount,
      projectedBalance
    };
  }

  return {
    ok: true,
    currentBalance,
    itemAmount: input.amount,
    projectedBalance
  };
}

async function upsertCompletionMovement(input: {
  supabase: SupabaseLike;
  ownerId: string;
  actorId: string;
  projectId: string;
  itemId: string;
  itemName: string;
  amount: number;
  category: string | null;
  allowNegative: boolean;
}) {
  const existing = await findCompletionMovement(input.supabase, input.ownerId, input.projectId, input.itemId);

  const record = {
    owner_id: input.ownerId,
    project_id: input.projectId,
    account_id: null,
    actor_id: input.actorId,
    type: "remove",
    amount: input.amount,
    description: `Item concluído: ${input.itemName}`,
    is_deleted: false,
    metadata: mergeObjectMetadata(existing?.metadata, {
      source: "project_item_completion",
      project_item_id: input.itemId,
      item_name: input.itemName,
      category: input.category || "",
      allow_negative: input.allowNegative,
      updated_at: new Date().toISOString()
    })
  };

  if (existing) {
    const { data, error } = await input.supabase
      .from("project_movements")
      .update(record)
      .eq("owner_id", input.ownerId)
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return data;
  }

  const { data, error } = await input.supabase.from("project_movements").insert(record).select("*").single();

  if (error) throw new Error(error.message);

  return data;
}

export async function POST(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, itemSchema);
    const access = await assertCanEdit(context.supabase, "project", payload.project_id, context.user.id);
    const record = {
      owner_id: access.ownerId,
      project_id: payload.project_id,
      name: payload.name,
      amount: money(payload.amount),
      status: payload.status,
      is_deleted: false,
      metadata: {
        category: payload.category || "",
        notes: payload.notes || ""
      }
    };

    const { data, error } = await context.supabase.from("project_items").insert(record).select("*").single();

    if (error) return jsonError(error.message, 500);

    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "project_item",
      entityId: data.id,
      actionType: "project_item_created",
      newValue: data.name,
      metadata: { project_id: payload.project_id }
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível salvar o item.");
  }
}

export async function PATCH(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, itemSchema.extend({ id: z.string().uuid("Item inválido.") }));
    const access = await assertCanEdit(context.supabase, "project", payload.project_id, context.user.id);

    const { data: existing, error: existingError } = await context.supabase
      .from("project_items")
      .select("*")
      .eq("id", payload.id)
      .eq("project_id", payload.project_id)
      .single();

    if (existingError || !existing) return jsonError("Item não encontrado.", 404);

    const itemAmount = money(payload.amount);
    const previousStatus = String(existing.status || "pending");
    const nextStatus = payload.status;

    if (nextStatus === "completed") {
      const validation = await ensureCanCompleteItem({
        supabase: context.supabase,
        projectId: payload.project_id,
        itemId: payload.id,
        amount: itemAmount,
        allowNegative: payload.allow_negative,
        ownerId: access.ownerId
      });

      if (!validation.ok) {
        return NextResponse.json(
          {
            error: "O caixa do projeto ficará negativo ao concluir este item. Confirme para continuar.",
            code: "PROJECT_NEGATIVE_CONFIRMATION_REQUIRED",
            data: validation
          },
          { status: 409 }
        );
      }
    }

    const update = {
      name: payload.name,
      amount: itemAmount,
      status: nextStatus,
      metadata: mergeObjectMetadata(existing.metadata, {
        category: payload.category || "",
        notes: payload.notes || ""
      })
    };

    const { data, error } = await context.supabase
      .from("project_items")
      .update(update)
      .eq("id", payload.id)
      .eq("project_id", payload.project_id)
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);

    let linkedMovement = null;

    if (nextStatus === "completed") {
      linkedMovement = await upsertCompletionMovement({
        supabase: context.supabase,
        ownerId: access.ownerId,
        actorId: context.user.id,
        projectId: payload.project_id,
        itemId: payload.id,
        itemName: payload.name,
        amount: itemAmount,
        category: payload.category || null,
        allowNegative: payload.allow_negative
      });
    } else if (previousStatus === "completed" && nextStatus !== "completed") {
      linkedMovement = await softDeleteCompletionMovement(context.supabase, access.ownerId, payload.project_id, payload.id);
    }

    const newBalance = await recalcProjectCash(context.supabase, payload.project_id);

    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "project_item",
      entityId: payload.id,
      actionType: previousStatus !== nextStatus ? "project_item_toggled" : "project_item_updated",
      previousValue: { status: previousStatus, amount: existing.amount, name: existing.name },
      newValue: { status: nextStatus, amount: itemAmount, name: payload.name },
      metadata: {
        project_id: payload.project_id,
        linked_movement_id: linkedMovement?.id || null,
        project_cash_balance: newBalance
      }
    });

    return NextResponse.json({ data, movement: linkedMovement, project_cash_balance: newBalance });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar o item.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, deleteSchema);
    const access = await assertCanEdit(context.supabase, "project", payload.project_id, context.user.id);

    await softDeleteCompletionMovement(context.supabase, access.ownerId, payload.project_id, payload.id);

    const { error } = await context.supabase
      .from("project_items")
      .update({ is_deleted: true, status: "canceled" })
      .eq("id", payload.id)
      .eq("project_id", payload.project_id);

    if (error) return jsonError(error.message, 500);

    const newBalance = await recalcProjectCash(context.supabase, payload.project_id);

    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "project_item",
      entityId: payload.id,
      actionType: "project_item_deleted",
      metadata: {
        project_id: payload.project_id,
        project_cash_balance: newBalance
      }
    });

    return NextResponse.json({ ok: true, project_cash_balance: newBalance });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir o item.");
  }
}
