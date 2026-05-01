import type { SupabaseClient } from "@supabase/supabase-js";
import type { SharedItemRole, SharedItemType } from "@/lib/domain/app-types";

export type AccessResult = {
  ownerId: string;
  isOwner: boolean;
  role: SharedItemRole | null;
  canEdit: boolean;
  canManageSharing: boolean;
};

const TABLE_BY_KIND: Record<SharedItemType, string> = {
  project: "projects",
  goal: "goals"
};

export async function getItemAccess(
  supabase: SupabaseClient,
  kind: SharedItemType,
  itemId: string,
  userId: string
): Promise<AccessResult | null> {
  const table = TABLE_BY_KIND[kind];
  const { data: item, error } = await supabase
    .from(table)
    .select("id, owner_id, is_deleted")
    .eq("id", itemId)
    .maybeSingle();

  if (error) throw error;
  if (!item || item.is_deleted) return null;

  const isOwner = item.owner_id === userId;
  if (isOwner) {
    return { ownerId: item.owner_id, isOwner: true, role: "editor", canEdit: true, canManageSharing: true };
  }

  const { data: share, error: shareError } = await supabase
    .from("shared_items")
    .select("role")
    .eq("item_type", kind)
    .eq("item_id", itemId)
    .eq("user_id", userId)
    .maybeSingle();

  if (shareError) throw shareError;
  if (!share) return null;

  const role = share.role as SharedItemRole;
  return {
    ownerId: item.owner_id,
    isOwner: false,
    role,
    canEdit: role === "editor",
    canManageSharing: false
  };
}

export async function assertCanView(
  supabase: SupabaseClient,
  kind: SharedItemType,
  itemId: string,
  userId: string
) {
  const access = await getItemAccess(supabase, kind, itemId, userId);
  if (!access) throw new Error(kind === "project" ? "Projeto não encontrado ou sem permissão." : "Meta não encontrada ou sem permissão.");
  return access;
}

export async function assertCanEdit(
  supabase: SupabaseClient,
  kind: SharedItemType,
  itemId: string,
  userId: string
) {
  const access = await assertCanView(supabase, kind, itemId, userId);
  if (!access.canEdit) throw new Error("Você não tem permissão para editar este item.");
  return access;
}

export async function assertCanManageSharing(
  supabase: SupabaseClient,
  kind: SharedItemType,
  itemId: string,
  userId: string
) {
  const access = await assertCanView(supabase, kind, itemId, userId);
  if (!access.canManageSharing) throw new Error("Somente o dono pode gerenciar o compartilhamento.");
  return access;
}

export async function createActivityLog(
  supabase: SupabaseClient,
  params: {
    ownerId: string;
    actorId: string;
    entityType: SharedItemType | "project_item" | "project_movement" | "goal_movement";
    entityId: string;
    actionType: string;
    fieldName?: string | null;
    previousValue?: unknown;
    newValue?: unknown;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from("activity_logs").insert({
    owner_id: params.ownerId,
    actor_id: params.actorId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    action_type: params.actionType,
    field_name: params.fieldName || null,
    previous_value: typeof params.previousValue === "undefined" ? null : params.previousValue,
    new_value: typeof params.newValue === "undefined" ? null : params.newValue,
    metadata: params.metadata || {}
  });

  if (error) throw error;
}

export function movementDelta(type: "add" | "remove" | "adjust", amount: number) {
  if (type === "remove") return -Math.abs(amount);
  return Math.abs(amount);
}
