import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getApiContext() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) } as const;
  }

  return { supabase, user: data.user } as const;
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function parseJson<T>(request: Request, schema: z.Schema<T>) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new Error("Corpo da requisição inválido.");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message || "Dados inválidos.");
  }
  return result.data;
}

export function normalizeOptionalUuid(value: string | null | undefined) {
  if (!value || value === "none") return null;
  return value;
}

export function mergeMetadata(previous: unknown, next: Record<string, unknown>) {
  const base = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
  return { ...base, ...next };
}
