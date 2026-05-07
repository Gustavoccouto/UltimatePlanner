import { NextResponse } from "next/server";

import { getApiContext, jsonError } from "@/lib/http/api";
import { createSupabaseAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";

type RawProfile = {
  id?: string | null;
  email?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type ProfileSearchResult = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function normalizeQuery(value: string | null) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 80);
}

function normalizeProfile(profile: RawProfile): ProfileSearchResult | null {
  const id = profile.id?.trim();

  if (!id) return null;

  const email = profile.email?.trim() || "";
  const displayName =
    profile.display_name?.trim() ||
    profile.full_name?.trim() ||
    profile.name?.trim() ||
    email.split("@")[0] ||
    "Usuário";

  return {
    id,
    email,
    display_name: displayName,
    avatar_url: profile.avatar_url || null,
    created_at: profile.created_at || null,
    updated_at: profile.updated_at || null
  };
}

function dedupeProfiles(profiles: Array<RawProfile | null | undefined>, currentUserId: string) {
  const map = new Map<string, ProfileSearchResult>();

  for (const raw of profiles) {
    if (!raw) continue;

    const profile = normalizeProfile(raw);

    if (!profile || profile.id === currentUserId) continue;

    map.set(profile.id, profile);
  }

  return Array.from(map.values())
    .sort((left, right) => {
      const leftName = `${left.display_name} ${left.email}`.toLowerCase();
      const rightName = `${right.display_name} ${right.email}`.toLowerCase();

      return leftName.localeCompare(rightName);
    })
    .slice(0, 20);
}

function escapeIlike(term: string) {
  return term.replace(/[%_\\]/g, "\\$&");
}

async function searchWithRpc(context: Exclude<Awaited<ReturnType<typeof getApiContext>>, { error: Response }>, query: string) {
  const { data, error } = await context.supabase.rpc("search_profiles_for_sharing", {
    search_text: query,
    requester_id: context.user.id
  });

  if (error) return null;

  return dedupeProfiles((data || []) as RawProfile[], context.user.id);
}

async function searchWithAdmin(context: Exclude<Awaited<ReturnType<typeof getApiContext>>, { error: Response }>, query: string) {
  if (!hasSupabaseAdminKey()) return null;

  const admin = createSupabaseAdminClient();
  const safeQuery = escapeIlike(query);
  const pattern = `%${safeQuery}%`;

  const [emailResult, nameResult] = await Promise.all([
    admin
      .from("profiles")
      .select("id,email,display_name,avatar_url,created_at,updated_at")
      .ilike("email", pattern)
      .neq("id", context.user.id)
      .limit(20),
    admin
      .from("profiles")
      .select("id,email,display_name,avatar_url,created_at,updated_at")
      .ilike("display_name", pattern)
      .neq("id", context.user.id)
      .limit(20)
  ]);

  if (emailResult.error && nameResult.error) return null;

  return dedupeProfiles([...(emailResult.data || []), ...(nameResult.data || [])] as RawProfile[], context.user.id);
}

async function searchWithUserClient(context: Exclude<Awaited<ReturnType<typeof getApiContext>>, { error: Response }>, query: string) {
  const safeQuery = escapeIlike(query);
  const pattern = `%${safeQuery}%`;

  const [emailResult, nameResult] = await Promise.all([
    context.supabase
      .from("profiles")
      .select("id,email,display_name,avatar_url,created_at,updated_at")
      .ilike("email", pattern)
      .neq("id", context.user.id)
      .limit(20),
    context.supabase
      .from("profiles")
      .select("id,email,display_name,avatar_url,created_at,updated_at")
      .ilike("display_name", pattern)
      .neq("id", context.user.id)
      .limit(20)
  ]);

  return dedupeProfiles([...(emailResult.data || []), ...(nameResult.data || [])] as RawProfile[], context.user.id);
}

export async function GET(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  const { searchParams } = new URL(request.url);
  const query = normalizeQuery(searchParams.get("q"));

  if (query.length < 2) {
    return NextResponse.json({ data: [] });
  }

  try {
    const rpcProfiles = await searchWithRpc(context, query);

    if (rpcProfiles) return NextResponse.json({ data: rpcProfiles });

    const adminProfiles = await searchWithAdmin(context, query);

    if (adminProfiles) return NextResponse.json({ data: adminProfiles });

    const fallbackProfiles = await searchWithUserClient(context, query);

    return NextResponse.json({ data: fallbackProfiles });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível buscar usuários.", 500);
  }
}
