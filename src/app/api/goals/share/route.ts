import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, parseJson } from "@/lib/http/api";
import { assertItemAccess, createActivityLog } from "@/lib/server/hubs";

const shareSchema = z.object({
  item_id: z.string().uuid("Meta inválida."),
  user_id: z.string().uuid("Usuário inválido."),
  role: z.enum(["viewer", "editor"]).default("editor")
});

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;
  try {
    const payload = await parseJson(request, shareSchema);
    const goal = await assertItemAccess(context.supabase, context.user.id, "goal", payload.item_id, "owner");
    if (payload.user_id === context.user.id) return jsonError("O dono já tem acesso à meta.");
    const { data: profile } = await context.supabase.from("profiles").select("id,email,display_name").eq("id", payload.user_id).maybeSingle();
    if (!profile) return jsonError("Usuário não encontrado.", 404);
    const { data, error } = await context.supabase
      .from("shared_items")
      .upsert({ owner_id: goal.owner_id, user_id: payload.user_id, item_type: "goal", item_id: goal.id, role: payload.role }, { onConflict: "user_id,item_type,item_id" })
      .select("*")
      .single();
    if (error) return jsonError(error.message, 500);
    await createActivityLog(context.supabase, { ownerId: goal.owner_id, actorId: context.user.id, entityType: "goal", entityId: goal.id, actionType: "goal_share_added", metadata: { userName: profile.display_name || profile.email, role: payload.role } });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível compartilhar a meta.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;
  try {
    const payload = await parseJson(request, shareSchema.pick({ item_id: true, user_id: true }));
    const goal = await assertItemAccess(context.supabase, context.user.id, "goal", payload.item_id, "owner");
    const { data: profile } = await context.supabase.from("profiles").select("id,email,display_name").eq("id", payload.user_id).maybeSingle();
    const { error } = await context.supabase.from("shared_items").delete().eq("item_type", "goal").eq("item_id", goal.id).eq("user_id", payload.user_id).eq("owner_id", context.user.id);
    if (error) return jsonError(error.message, 500);
    await createActivityLog(context.supabase, { ownerId: goal.owner_id, actorId: context.user.id, entityType: "goal", entityId: goal.id, actionType: "goal_share_removed", metadata: { userName: profile?.display_name || profile?.email || payload.user_id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível remover o compartilhamento.");
  }
}
