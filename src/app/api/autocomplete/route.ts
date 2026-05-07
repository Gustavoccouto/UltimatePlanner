import { NextResponse } from "next/server";

import { getApiContext, jsonError } from "@/lib/http/api";
import { buildFinancialAutocompleteSuggestions } from "@/lib/server/autocomplete";

export async function GET(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || "";
    const scope = searchParams.get("scope") || "all";
    const data = await buildFinancialAutocompleteSuggestions({
      supabase: context.supabase,
      ownerId: context.user.id,
      query,
      scope
    });

    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível carregar sugestões.", 500);
  }
}
