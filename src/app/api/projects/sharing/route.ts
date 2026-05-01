import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, parseJson } from "@/lib/http/api";
import { assertCanManageSharing, createActivityLog } from "@/lib/server/collaboration";

const shareSchema = z.object({
  project_id: z.string().uuid("Projeto inválido."),
  user_id: z.string().uuid("Usuário inválido."),
  role: z.enum(["viewer", "editor"]).default("editor"),
  action: z.enum(["add", "remove"]).default("add")
});

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, shareSchema);
    const access = await assertCanManageSharing(context.supabase, "project", payload.project_id, context.user.id);
    if (payload.user_id === context.user.id) return jsonError("O dono não precisa ser adicionado como participante.");

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, display_name, email")
      .eq("id", payload.user_id)
      .maybeSingle();

    if (!profile) return jsonError("Usuário não encontrado.", 404);

    if (payload.action === "remove") {
      const { error } = await context.supabase
        .from("shared_items")
        .delete()
        .eq("item_type", "project")
        .eq("item_id", payload.project_id)
        .eq("user_id", payload.user_id)
        .eq("owner_id", context.user.id);
      if (error) return jsonError(error.message, 500);

      await createActivityLog(context.supabase, {
        ownerId: access.ownerId,
        actorId: context.user.id,
        entityType: "project",
        entityId: payload.project_id,
        actionType: "project_share_removed",
        previousValue: profile.display_name || profile.email || profile.id,
        metadata: { related_user_id: payload.user_id }
      });

      return NextResponse.json({ ok: true });
    }

    const { data, error } = await context.supabase
      .from("shared_items")
      .upsert({
        owner_id: context.user.id,
        user_id: payload.user_id,
        item_type: "project",
        item_id: payload.project_id,
        role: payload.role
      }, { onConflict: "user_id,item_type,item_id" })
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);

    await createActivityLog(context.supabase, {
      ownerId: access.ownerId,
      actorId: context.user.id,
      entityType: "project",
      entityId: payload.project_id,
      actionType: "project_share_added",
      newValue: profile.display_name || profile.email || profile.id,
      metadata: { related_user_id: payload.user_id, role: payload.role }
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível alterar o compartilhamento.");
  }
}
