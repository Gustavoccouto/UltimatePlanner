import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const RESET_CONFIRMATION = "APAGAR MEUS DADOS";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || body.confirmation !== RESET_CONFIRMATION) {
    return NextResponse.json(
      {
        error: `Confirmação inválida. Digite exatamente: ${RESET_CONFIRMATION}`
      },
      { status: 400 }
    );
  }

  const { error } = await supabase.rpc("reset_current_user_data");

  if (error) {
    return NextResponse.json(
      {
        error: error.message || "Não foi possível apagar os dados da conta."
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Dados do usuário atual apagados com sucesso."
  });
}