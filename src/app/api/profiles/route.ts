import { NextResponse } from "next/server";

import { getApiContext, jsonError } from "@/lib/http/api";
import { createSupabaseAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";

type ProfileLike = {
  id?: unknown;
  email?: unknown;
  display_name?: unknown;
  avatar_url?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

function normalizeSearch(value: string | null) {
  return (value || "").trim().toLowerCase();
}

function normalizeProfile(profile: ProfileLike) {
  return {
    id: String(profile.id || ""),
    email: typeof profile.email === "string" ? profile.email : null,
    display_name: typeof profile.display_name === "string" ? profile.display_name : null,
    avatar_url: typeof profile.avatar_url === "string" ? profile.avatar_url : null,
    created_at: typeof profile.created_at === "string" ? profile.created_at : null,
    updated_at: typeof profile.updated_at === "string" ? profile.updated_at : null
  };
}

async function searchFromAuthUsers(query: string, requesterId: string) {
  if (!hasSupabaseAdminKey()) return [];

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

  if (error) throw error;

  return (data.users || [])
    .filter((user) => user.id !== requesterId)
    .filter((user) => {
      const email = user.email || "";
      const meta = user.user_metadata || {};
      const name = String(meta.display_name || meta.full_name || meta.name || email.split("@")[0] || "");
      return `${email} ${name}`.toLowerCase().includes(query);
    })
    .slice(0, 20)
    .map((user) => {
      const meta = user.user_metadata || {};
      const email = user.email || "";
      return normalizeProfile({
        id: user.id,
        email,
        display_name: String(meta.display_name || meta.full_name || meta.name || email.split("@")[0] || "Usuário"),
        avatar_url: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
        created_at: user.created_at,
        updated_at: user.updated_at
      });
    });
}

export async function GET(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  const { searchParams } = new URL(request.url);
  const query = normalizeSearch(searchParams.get("q"));

  if (query.length < 2) {
    return NextResponse.json({ data: [] });
  }

  try {
    await context.supabase.rpc("ensure_current_user_profile");
  } catch {
    // A migration 0014 cria essa RPC. Se ainda não existir, seguimos para os fallbacks.
  }

  const rpcPayload = {
    search_text: query,
    requester_id: context.user.id
  };

  const search = await context.supabase.rpc("search_profiles_for_sharing", rpcPayload);

  if (!search.error) {
    const rpcProfiles = (search.data || []).map(normalizeProfile).filter((profile) => profile.id);

    if (rpcProfiles.length) {
      return NextResponse.json({ data: rpcProfiles });
    }
  }

  if (hasSupabaseAdminKey()) {
    try {
      const admin = createSupabaseAdminClient();

      await admin.rpc("sync_profiles_from_auth_users");

      const adminSearch = await admin.rpc("search_profiles_for_sharing", rpcPayload);

      if (!adminSearch.error) {
        const profiles = (adminSearch.data || []).map(normalizeProfile).filter((profile) => profile.id);

        if (profiles.length) {
          return NextResponse.json({ data: profiles });
        }
      }

      const authProfiles = await searchFromAuthUsers(query, context.user.id);
      return NextResponse.json({ data: authProfiles });
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Não foi possível buscar usuários.", 500);
    }
  }

  if (search.error) {
    return jsonError(
      `${search.error.message}. Rode a migration 0014_final_polish_sharing_reset_cards.sql no Supabase para liberar a busca segura de usuários.`,
      500
    );
  }

  return NextResponse.json({ data: [] });
}
