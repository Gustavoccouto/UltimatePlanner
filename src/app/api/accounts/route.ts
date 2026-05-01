import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiContext, jsonError, mergeMetadata, parseJson } from "@/lib/http/api";

const accountSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Nome da conta é obrigatório."),
  institution: z.string().trim().optional().nullable(),
  type: z.enum(["checking", "savings", "investment"]).default("checking"),
  initial_balance: z.coerce.number().default(0),
  color: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable()
});

const deleteSchema = z.object({ id: z.string().uuid("Conta inválida.") });

export async function GET() {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  const { data, error } = await context.supabase
    .from("accounts")
    .select("*")
    .eq("owner_id", context.user.id)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true });

  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ data: data || [] });
}

export async function POST(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, accountSchema);
    const record = {
      owner_id: context.user.id,
      name: payload.name,
      institution: payload.institution || null,
      type: payload.type,
      initial_balance: payload.initial_balance,
      current_balance: payload.initial_balance,
      color: payload.color || null,
      is_archived: false,
      is_deleted: false,
      metadata: { notes: payload.notes || "" }
    };

    const { data, error } = await context.supabase.from("accounts").insert(record).select("*").single();
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível salvar a conta.");
  }
}

export async function PATCH(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, accountSchema.extend({ id: z.string().uuid("Conta inválida.") }));
    const { data: existing, error: existingError } = await context.supabase
      .from("accounts")
      .select("*")
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .single();

    if (existingError || !existing) return jsonError("Conta não encontrada.", 404);

    const update = {
      name: payload.name,
      institution: payload.institution || null,
      type: payload.type,
      initial_balance: payload.initial_balance,
      color: payload.color || null,
      metadata: mergeMetadata(existing.metadata, { notes: payload.notes || "" })
    };

    const { data, error } = await context.supabase
      .from("accounts")
      .update(update)
      .eq("id", payload.id)
      .eq("owner_id", context.user.id)
      .select("*")
      .single();

    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível atualizar a conta.");
  }
}

export async function DELETE(request: Request) {
  const context = await getApiContext();
  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, deleteSchema);
    const { error } = await context.supabase
      .from("accounts")
      .update({ is_deleted: true, is_archived: true })
      .eq("id", payload.id)
      .eq("owner_id", context.user.id);

    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível excluir a conta.");
  }
}
