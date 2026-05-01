import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "./env";

export function createSupabaseBrowserClient() {
  const { url, key } = getSupabasePublicConfig();
  return createBrowserClient(url, key);
}
