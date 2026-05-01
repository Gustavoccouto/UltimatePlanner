import { NextResponse } from "next/server";
import { getApiContext, jsonError } from "@/lib/http/api";

export async function GET(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") || "").trim();

  const requestBuilder = query.length >= 2
    ? context.supabase.rpc("search_profiles_for_sharing", { search_text: query })
    : context.supabase.rpc("visible_profiles_for_user");

  const { data, error } = await requestBuilder;

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: data || [] });
}
