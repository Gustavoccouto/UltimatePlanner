import { NextResponse } from "next/server";

import { getApiContext, jsonError } from "@/lib/http/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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

function normalizeSearch(value: string | null) {
  return (value || "").trim().toLowerCase();
}

function normalizeProfile(profile: RawProfile): ProfileSearchResult | null {
  const id = profile.id?.trim();

  if (!id) {
    return null;
  }

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

function filterProfiles(rawProfiles: RawProfile[]) {
  return rawProfiles
    .map(normalizeProfile)
    .filter((profile): profile is ProfileSearchResult => Boolean(profile?.id));
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

    const { data: rpcProfiles, error: rpcError } = await admin.rpc("search_profiles_for_sharing", {
      search_text: query,
      requester_id: context.user.id
    });

    if (!rpcError) {
      const profiles = filterProfiles((rpcProfiles || []) as RawProfile[]);
      return NextResponse.json({ data: profiles });
    }

    const { data: tableProfiles, error: tableError } = await admin
      .from("profiles")
      .select("id,email,display_name,avatar_url,created_at,updated_at")
      .neq("id", context.user.id)
      .or(`email.ilike.%${query}%,display_name.ilike.%${query}%`)
      .limit(20);

    if (tableError) {
      return jsonError(
        "Não foi possível buscar usuários para compartilhar. Verifique se a migration de perfis foi aplicada no Supabase.",
        500
      );
    }

    const profiles = filterProfiles((tableProfiles || []) as RawProfile[]);

    return NextResponse.json({ data: profiles });
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Não foi possível buscar usuários para compartilhar.",
      500
    );
  }
}
