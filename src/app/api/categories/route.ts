import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, mergeMetadata, parseJson } from "@/lib/http/api";

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome da categoria é obrigatório."),
  type: z.enum(["income", "expense", "transfer", "investment", "project", "goal", "card"]).default("expense"),
  color: z.string().trim().optional().nullable(),
  icon: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({ id: z.string().uuid("Categoria inválida.") });

export async function GET() {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  const { data, error } = await context.supabase
    .from("categories")
    .select("*")
    .eq("owner_id", context.user.id)
    .eq("is_deleted", false)
    .order("name", { ascending: true });

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, categorySchema);
    const { data: existingRows, error: existingError } = await context.supabase
      .from("categories")
      .select("*")
      .eq("owner_id", context.user.id)
      .ilike("name", payload.name)
      .eq("type", payload.type)
      .limit(1);

    if (existingError) return jsonError(existingError.message, 500);

    const existing = existingRows?.[0];
    if (existing) {
      const { data, error } = await context.supabase
        .from("categories")
        .update({
          name: payload.name,
          type: payload.type,
          color: payload.color || existing.color || null,
          icon: payload.icon || existing.icon || null,
          is_archived: false,
          is_deleted: false,
          metadata: mergeMetadata(existing.metadata, { auto_created: false })
        })
        .eq("id", existing.id)
        .eq("owner_id", context.user.id)
        .select("*")
        .single();

      if (error) return jsonError(error.message, 500);
      return NextResponse.json({ data }, { status: 200 });
    }

    const { data, error } = await context.supabase
      .from("categories")
      .insert({ ...payload, owner_id: context.user.id, is_archived: false, is_deleted: false, metadata: { auto_created: false } })
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível salvar a categoria.");
  }
}

export async function PATCH(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, categorySchema.extend({ id: z.string().uuid("Categoria inválida.") }));
    const { data, error } = await context.supabase
      .from("categories")
      .update({ name: payload.name, type: payload.type, color: payload.color || null, icon: payload.icon || null })
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar a categoria.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, deleteSchema);
    const { error } = await context.supabase
      .from("categories")
      .update({ is_deleted: true, is_archived: true })
      .eq("id", payload.id)
      .eq("owner_id", context.user.id);

    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir a categoria.");
  }
}
