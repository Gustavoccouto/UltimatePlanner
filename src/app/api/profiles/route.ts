import { NextResponse } from "next/server";

import { getApiContext, jsonError } from "@/lib/http/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function normalizeSearch(value: string | null) {
  return (value || "").trim().toLowerCase();
}

export async function GET(request: Request) {
  const context = await getApiContext();

  if ("error" in context) {
    return context.error;
  }

  const { searchParams } = new URL(request.url);
  const query = normalizeSearch(searchParams.get("q"));

  if (query.length < 2) {
    return NextResponse.json({ data: [] });
  }

  try {
    const admin = createSupabaseAdminClient();

    const { data, error } = await admin.rpc("search_profiles_for_sharing", {
      search_text: query,
      requester_id: context.user.id
    });

    if (error) {
      return jsonError(error.message, 500);
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível buscar usuários.", 500);
  }
}