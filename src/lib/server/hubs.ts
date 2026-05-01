export async function getSharedRole(supabase: any, userId: string, itemType: "project" | "goal", itemId: string) {
  const { data } = await supabase
    .from("shared_items")
    .select("role")
    .eq("user_id", userId)
    .eq("item_type", itemType)
    .eq("item_id", itemId)
    .maybeSingle();
  return data?.role || null;
}

export async function assertItemAccess(supabase: any, userId: string, itemType: "project" | "goal", itemId: string, mode: "view" | "edit" | "owner" = "view") {
  const table = itemType === "project" ? "projects" : "goals";
  const { data: item, error } = await supabase.from(table).select("*").eq("id", itemId).maybeSingle();
  if (error || !item || item.is_deleted) throw new Error(itemType === "project" ? "Projeto não encontrado." : "Meta não encontrada.");

  if (item.owner_id === userId) return item;
  if (mode === "owner") throw new Error("Somente o dono pode fazer essa ação.");

  const role = await getSharedRole(supabase, userId, itemType, itemId);
  if (!role) throw new Error("Você não tem acesso a este item.");
  if (mode === "edit" && role !== "editor") throw new Error("Você não tem permissão para editar este item.");
  return item;
}

export async function createActivityLog(supabase: any, params: {
  ownerId: string;
  actorId: string;
  entityType: "project" | "goal";
  entityId: string;
  actionType: string;
  fieldName?: string;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
}) {
  await supabase.from("activity_logs").insert({
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
}

export async function syncProjectAggregate(supabase: any, projectId: string) {
  const [{ data: items }, { data: movements }] = await Promise.all([
    supabase.from("project_items").select("amount,status,is_deleted").eq("project_id", projectId),
    supabase.from("project_movements").select("amount,type,is_deleted").eq("project_id", projectId)
  ]);
  const activeItems = (items || []).filter((item: any) => !item.is_deleted);
  const targetAmount = activeItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
  const currentAmount = (movements || []).filter((item: any) => !item.is_deleted).reduce((sum: number, item: any) => {
    return item.type === "remove" ? sum - Number(item.amount || 0) : sum + Number(item.amount || 0);
  }, 0);
  await supabase.from("projects").update({ target_amount: targetAmount, current_amount: currentAmount }).eq("id", projectId);
}

export async function syncGoalAggregate(supabase: any, goalId: string) {
  const { data: movements } = await supabase.from("goal_movements").select("amount,type,is_deleted").eq("goal_id", goalId);
  const currentAmount = (movements || []).filter((item: any) => !item.is_deleted).reduce((sum: number, item: any) => {
    return item.type === "remove" ? sum - Number(item.amount || 0) : sum + Number(item.amount || 0);
  }, 0);
  await supabase.from("goals").update({ current_amount: currentAmount }).eq("id", goalId);
}
