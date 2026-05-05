import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiContext, jsonError, parseJson } from "@/lib/http/api";

const bodySchema = z.object({
  goal_id: z.string().uuid("Meta inválida."),
  user_id: z.string().uuid("Usuário inválido."),
  role: z.enum(["viewer", "editor"]).default("editor"),
  action: z.enum(["add", "remove"]).default("add")
});

export async function POST(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, bodySchema);

    if (payload.user_id === context.user.id) {
      return jsonError("Você já é dono ou participante da sua própria sessão.");
    }

    const { data: goal, error: goalError } = await context.supabase
      .from("goals")
      .select("id, owner_id, name")
      .eq("id", payload.goal_id)
      .single();

    if (goalError || !goal) return jsonError("Meta não encontrada.", 404);
    if (goal.owner_id !== context.user.id) return jsonError("Somente o dono pode gerenciar participantes desta meta.", 403);

    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("id, email, display_name")
      .eq("id", payload.user_id)
      .single();

    if (profileError || !profile) return jsonError("Usuário não encontrado. Peça para ele entrar no app ao menos uma vez e tente novamente.", 404);

    if (payload.action === "remove") {
      const { error } = await context.supabase
        .from("shared_items")
        .delete()
        .eq("owner_id", context.user.id)
        .eq("item_type", "goal")
        .eq("item_id", payload.goal_id)
        .eq("user_id", payload.user_id);

      if (error) return jsonError(error.message, 500);

      await context.supabase.from("activity_logs").insert({
        owner_id: context.user.id,
        actor_id: context.user.id,
        entity_type: "goal",
        entity_id: payload.goal_id,
        action_type: "goal_share_removed",
        metadata: { goal_id: payload.goal_id, user_id: payload.user_id }
      });

      return NextResponse.json({ ok: true, action: "removed" });
    }

    const { data, error } = await context.supabase
      .from("shared_items")
      .upsert(
        {
          owner_id: context.user.id,
          user_id: payload.user_id,
          item_type: "goal",
          item_id: payload.goal_id,
          role: payload.role
        },
        { onConflict: "user_id,item_type,item_id" }
      )
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);

    await context.supabase.from("activity_logs").insert({
      owner_id: context.user.id,
      actor_id: context.user.id,
      entity_type: "goal",
      entity_id: payload.goal_id,
      action_type: "goal_share_added",
      metadata: { goal_id: payload.goal_id, user_id: payload.user_id, role: payload.role }
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível alterar o compartilhamento.");
  }
}
