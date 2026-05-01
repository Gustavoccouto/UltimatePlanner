import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const idParamSchema = z.object({ id: z.string().uuid() });

export async function listOwned<T>(supabase: SupabaseClient, table: string, ownerId: string, orderBy = "created_at") {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("owner_id", ownerId)
    .order(orderBy, { ascending: false });

  if (error) throw error;
  return (data || []) as T[];
}

export async function insertOwned<T>(supabase: SupabaseClient, table: string, ownerId: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase
    .from(table)
    .insert({ ...payload, owner_id: ownerId })
    .select("*")
    .single();

  if (error) throw error;
  return data as T;
}

export async function softDeleteOwned(supabase: SupabaseClient, table: string, ownerId: string, id: string) {
  const { error } = await supabase
    .from(table)
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", ownerId);

  if (error) throw error;
  return true;
}
