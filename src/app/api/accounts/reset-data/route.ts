import { NextResponse } from "next/server";

import { getApiContext, jsonError } from "@/lib/http/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const RESET_CONFIRMATION = "APAGAR MEUS DADOS";

export async function POST(request: Request) {
  const context = await getApiContext();

  if ("error" in context) {
    return context.error;
  }

  const body = await request.json().catch(() => null);

  if (!body || body.confirmation !== RESET_CONFIRMATION) {
    return jsonError(`Confirmação inválida. Digite exatamente: ${RESET_CONFIRMATION}`, 400);
  }

  try {
    const admin = createSupabaseAdminClient();

    const { error } = await admin.rpc("reset_user_data_admin", {
      target_user_id: context.user.id
    });

    if (error) {
      return jsonError(error.message || "Não foi possível apagar os dados da conta.", 500);
    }

    return NextResponse.json({
      ok: true,
      message: "Dados do usuário atual apagados com sucesso."
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Erro inesperado ao apagar os dados.", 500);
  }
}