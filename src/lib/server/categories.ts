import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryType } from "@/lib/domain/app-types";

export function normalizeCategoryName(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

export function inferCategoryTypeFromTransaction(type: string): CategoryType {
  if (type === "income" || type === "recurring_income") return "income";
  if (type === "transfer") return "transfer";
  if (type === "card_expense" || type === "invoice_payment") return "card";
  if (type === "investment") return "investment";
  return "expense";
}

export async function ensureCategoryByName(
  supabase: SupabaseClient,
  ownerId: string,
  categoryName?: string | null,
  preferredType: CategoryType = "expense"
): Promise<string | null> {
  const name = normalizeCategoryName(categoryName);
  if (!name) return null;

  const { data: existingRows, error: lookupError } = await supabase
    .from("categories")
    .select("id,name,type,is_deleted")
    .eq("owner_id", ownerId)
    .ilike("name", name)
    .eq("type", preferredType)
    .limit(1);

  if (lookupError) throw lookupError;

  const existing = existingRows?.[0];
  if (existing?.id) {
    if (existing.is_deleted) {
      const { error: restoreError } = await supabase
        .from("categories")
        .update({ is_deleted: false, is_archived: false })
        .eq("id", existing.id)
        .eq("owner_id", ownerId);
      if (restoreError) throw restoreError;
    }
    return existing.id;
  }

  const { data: sameNameRows, error: anyTypeError } = await supabase
    .from("categories")
    .select("id,type,is_deleted")
    .eq("owner_id", ownerId)
    .ilike("name", name)
    .limit(1);

  if (anyTypeError) throw anyTypeError;

  const sameNameAnyType = sameNameRows?.[0];
  if (sameNameAnyType?.id) {
    if (sameNameAnyType.is_deleted) {
      const { error: restoreError } = await supabase
        .from("categories")
        .update({ is_deleted: false, is_archived: false })
        .eq("id", sameNameAnyType.id)
        .eq("owner_id", ownerId);
      if (restoreError) throw restoreError;
    }
    return sameNameAnyType.id;
  }

  const { data: created, error: createError } = await supabase
    .from("categories")
    .insert({
      owner_id: ownerId,
      name,
      type: preferredType,
      color: null,
      icon: null,
      is_archived: false,
      is_deleted: false,
      metadata: { auto_created: true, source: "typed_category" }
    })
    .select("id")
    .single();

  if (createError) throw createError;
  return created?.id || null;
}
