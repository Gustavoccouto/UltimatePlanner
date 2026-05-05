import { NextResponse } from "next/server";

import { getApiContext, jsonError } from "@/lib/http/api";

const RESET_CONFIRMATION = "APAGAR MEUS DADOS";

export async function POST(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  const body = await request.json().catch(() => null);

  if (!body || body.confirmation !== RESET_CONFIRMATION) {
    return jsonError(`Confirmação inválida. Digite exatamente: ${RESET_CONFIRMATION}`, 400);
  }

  const { error } = await context.supabase.rpc("reset_current_user_data_hard");

  if (error) {
    return jsonError(
      `${error.message} Rode a migration 0014_final_polish_sharing_reset_cards.sql no Supabase e tente novamente.`,
      500
    );
  }

  return NextResponse.json({ ok: true, message: "Dados do usuário atual apagados com sucesso." });
}
