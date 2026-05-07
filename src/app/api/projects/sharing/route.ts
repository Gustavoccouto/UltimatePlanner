import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiContext, jsonError, parseJson } from "@/lib/http/api";

const bodySchema = z.object({
  project_id: z.string().uuid("Projeto inválido."),
  user_id: z.string().uuid("Usuário inválido."),
  role: z.enum(["viewer", "editor"]).default("editor"),
  action: z.enum(["add", "remove"]).default("add")
});

export async function POST(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, bodySchema);

    const { data, error } = await context.supabase.rpc("manage_item_share", {
      target_item_type: "project",
      target_item_id: payload.project_id,
      target_user_id: payload.user_id,
      target_role: payload.role,
      target_action: payload.action
    });

    if (error) {
      return jsonError(error.message, 400);
    }

    return NextResponse.json({
      ok: true,
      action: payload.action === "remove" ? "removed" : "added",
      data
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível alterar o compartilhamento.");
  }
}
