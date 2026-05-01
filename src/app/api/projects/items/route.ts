import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, mergeMetadata, parseJson } from "@/lib/http/api";
import { assertCanEdit, createActivityLog } from "@/lib/server/collaboration";
import type { ProjectItem } from "@/lib/domain/app-types";

const itemSchema = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid("Projeto inválido."),
  name: z.string().trim().min(1, "Nome do item é obrigatório."),
  amount: z.coerce.number().min(0, "Valor inválido."),
  category: z.string().trim().optional().nullable(),
  status: z.enum(["pending", "completed", "canceled"]).default("pending"),
  notes: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({ id: z.string().uuid("Item inválido."), project_id: z.string().uuid("Projeto inválido.") });

async function refreshProjectTarget(supabase: any, projectId: string) {
  const { data, error } = await supabase
    .from("project_items")
    .select("amount, status")
    .eq("project_id", projectId)
    .eq("is_deleted", false);
  if (error) throw error;
  const items = (data || []) as Pick<ProjectItem, "amount" | "status">[];
  const total = items
    .filter((item: Pick<ProjectItem, "amount" | "status">) => item.status !== "canceled")
    .reduce((sum: number, item: Pick<ProjectItem, "amount" | "status">) => sum + Number(item.amount || 0), 0);
  const { error: updateError } = await supabase.from("projects").update({ target_amount: total }).eq("id", projectId);
  if (updateError) throw updateError;
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
      amount: payload.amount,
      status: payload.status,
      is_deleted: false,
      metadata: { category: payload.category || "", notes: payload.notes || "" }
    };

    const { data, error } = await context.supabase.from("project_items").insert(record).select("*").single();
    if (error) return jsonError(error.message, 500);

    await refreshProjectTarget(context.supabase, payload.project_id);
    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "project_item",
      entityId: data.id,
      actionType: "project_item_created",
      newValue: data.name,
      metadata: { project_id: payload.project_id, amount: payload.amount }
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

    const update = {
      name: payload.name,
      amount: payload.amount,
      status: payload.status,
      metadata: mergeMetadata(existing.metadata, { category: payload.category || "", notes: payload.notes || "" })
    };

    const { data, error } = await context.supabase
      .from("project_items")
      .update(update)
      .eq("id", payload.id)
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);
    await refreshProjectTarget(context.supabase, payload.project_id);

    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "project_item",
      entityId: payload.id,
      actionType: existing.status !== payload.status ? "project_item_toggled" : "project_item_updated",
      previousValue: { name: existing.name, amount: existing.amount, status: existing.status },
      newValue: { name: data.name, amount: data.amount, status: data.status },
      metadata: { project_id: payload.project_id }
    });

    return NextResponse.json({ data });
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

    const { data: existing } = await context.supabase
      .from("project_items")
      .select("name")
      .eq("id", payload.id)
      .eq("project_id", payload.project_id)
      .maybeSingle();

    const { error } = await context.supabase
      .from("project_items")
      .update({ is_deleted: true, status: "canceled" })
      .eq("id", payload.id)
      .eq("project_id", payload.project_id);

    if (error) return jsonError(error.message, 500);
    await refreshProjectTarget(context.supabase, payload.project_id);

    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "project_item",
      entityId: payload.id,
      actionType: "project_item_deleted",
      previousValue: existing?.name || null,
      metadata: { project_id: payload.project_id }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir o item.");
  }
}
