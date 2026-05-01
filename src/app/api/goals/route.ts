import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, mergeMetadata, parseJson } from "@/lib/http/api";
import { assertCanEdit, assertCanManageSharing, createActivityLog } from "@/lib/server/collaboration";

const goalSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome da meta é obrigatório."),
  description: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  target_amount: z.coerce.number().positive("Valor alvo precisa ser maior que zero."),
  current_amount: z.coerce.number().min(0, "Valor atual inválido.").default(0),
  due_date: z.string().trim().optional().nullable(),
  status: z.enum(["active", "completed", "archived", "canceled"]).default("active"),
  color: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({ id: z.string().uuid("Meta inválida.") });

async function safeProfiles(context: any) {
  const { data, error } = await context.supabase.rpc("visible_profiles_for_user");
  if (!error) return data || [];

  const fallback = await context.supabase
    .from("profiles")
    .select("id,email,display_name,avatar_url,created_at,updated_at")
    .eq("id", context.user.id);
  return fallback.data || [];
}

async function loadGoalsBundle(context: any) {
  const [goals, movements, shares, logs, profiles] = await Promise.all([
    context.supabase.from("goals").select("*").eq("is_deleted", false).order("created_at", { ascending: true }),
    context.supabase.from("goal_movements").select("*").eq("is_deleted", false).order("created_at", { ascending: false }),
    context.supabase.from("shared_items").select("*").eq("item_type", "goal").order("created_at", { ascending: true }),
    context.supabase.from("activity_logs").select("*").in("entity_type", ["goal", "goal_movement"]).order("created_at", { ascending: false }).limit(300),
    safeProfiles(context)
  ]);

  const error = goals.error || movements.error || shares.error || logs.error;
  if (error) throw new Error(`${error.message}. Verifique se as migrations 0005 e 0007 foram rodadas no Supabase.`);

  return {
    goals: goals.data || [],
    movements: movements.data || [],
    shares: shares.data || [],
    activityLogs: logs.data || [],
    profiles: profiles || []
  };
}

export async function GET() {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const bundle = await loadGoalsBundle(context);
    return NextResponse.json(bundle);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível carregar metas.", 500);
  }
}

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, goalSchema);
    const initialAmount = Math.min(payload.current_amount || 0, payload.target_amount);
    const record = {
      owner_id: context.user.id,
      name: payload.name,
      description: payload.description || null,
      target_amount: payload.target_amount,
      current_amount: initialAmount,
      due_date: payload.due_date || null,
      status: initialAmount >= payload.target_amount ? "completed" : payload.status,
      color: payload.color || null,
      is_deleted: false,
      metadata: { category: payload.category || "", notes: payload.notes || "" }
    };

    const { data, error } = await context.supabase.from("goals").insert(record).select("*").single();
    if (error) return jsonError(error.message, 500);

    if (initialAmount > 0) {
      await context.supabase.from("goal_movements").insert({
        owner_id: context.user.id,
        goal_id: data.id,
        actor_id: context.user.id,
        type: "add",
        amount: initialAmount,
        description: "Valor inicial",
        is_deleted: false
      });
    }

    await createActivityLog(context.supabase, {
      ownerId: context.user.id,
      actorId: context.user.id,
      entityType: "goal",
      entityId: data.id,
      actionType: "goal_created",
      newValue: data.name
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível salvar a meta.");
  }
}

export async function PATCH(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, goalSchema.extend({ id: z.string().uuid("Meta inválida.") }));
    const access = await assertCanEdit(context.supabase, "goal", payload.id, context.user.id);

    const { data: existing, error: existingError } = await context.supabase
      .from("goals")
      .select("*")
      .eq("id", payload.id)
      .single();

    if (existingError || !existing) return jsonError("Meta não encontrada.", 404);

    const currentAmount = Math.min(Number(existing.current_amount || 0), payload.target_amount);
    const status = currentAmount >= payload.target_amount ? "completed" : payload.status;
    const update = {
      name: payload.name,
      description: payload.description || null,
      target_amount: payload.target_amount,
      current_amount: currentAmount,
      due_date: payload.due_date || null,
      status,
      color: payload.color || null,
      metadata: mergeMetadata(existing.metadata, { category: payload.category || "", notes: payload.notes || "" })
    };

    const { data, error } = await context.supabase
      .from("goals")
      .update(update)
      .eq("id", payload.id)
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);

    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "goal",
      entityId: payload.id,
      actionType: "goal_updated",
      previousValue: { name: existing.name, target_amount: existing.target_amount, due_date: existing.due_date },
      newValue: { name: data.name, target_amount: data.target_amount, due_date: data.due_date }
    });

    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar a meta.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, deleteSchema);
    const access = await assertCanManageSharing(context.supabase, "goal", payload.id, context.user.id);
    const { error } = await context.supabase.from("goals").update({ is_deleted: true, status: "archived" }).eq("id", payload.id);
    if (error) return jsonError(error.message, 500);

    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "goal",
      entityId: payload.id,
      actionType: "goal_deleted"
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir a meta.");
  }
}
