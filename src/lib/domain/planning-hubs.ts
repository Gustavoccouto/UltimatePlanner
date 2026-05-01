import type { ActivityLog, Goal, GoalMovement, Metadata, Project, ProjectItem, ProjectMovement, SharedItem } from "./app-types";
import { currencyBRL, datePt } from "./formatters";

export const projectThemes = {
  aurora: {
    label: "Aurora",
    coverUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    accent: "#6366f1"
  },
  viagem: {
    label: "Viagem",
    coverUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    accent: "#0ea5e9"
  },
  setup: {
    label: "Setup",
    coverUrl: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=80",
    accent: "#4f46e5"
  },
  casa: {
    label: "Casa",
    coverUrl: "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
    accent: "#f97316"
  },
  carro: {
    label: "Carro",
    coverUrl: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80",
    accent: "#ef4444"
  },
  estudo: {
    label: "Estudo",
    coverUrl: "https://images.unsplash.com/photo-1491841550275-ad7854e35ca6?auto=format&fit=crop&w=1200&q=80",
    accent: "#10b981"
  },
  evento: {
    label: "Evento",
    coverUrl: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=80",
    accent: "#ec4899"
  },
  negocio: {
    label: "Negócio",
    coverUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
    accent: "#0f172a"
  }
} as const;

export type ProjectThemeKey = keyof typeof projectThemes;

export function getMetadata(record: { metadata?: Metadata | null } | null | undefined): Metadata {
  return record?.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata) ? record.metadata : {};
}

export function projectThemeKey(project: Project): ProjectThemeKey {
  const key = String(getMetadata(project).themeKey || "aurora");
  return key in projectThemes ? (key as ProjectThemeKey) : "aurora";
}

export function projectTheme(project: Project) {
  return projectThemes[projectThemeKey(project)];
}

export function projectIcon(project: Project) {
  return String(getMetadata(project).icon || "✨");
}

export function projectItemCategory(item: ProjectItem) {
  return String(getMetadata(item).category || "Sem categoria");
}

export function projectItemDescription(item: ProjectItem) {
  return String(getMetadata(item).description || "");
}

export function isProjectItemDone(item: ProjectItem) {
  return item.status === "completed";
}

export function projectSummary(project: Project, items: ProjectItem[], movements: ProjectMovement[]) {
  const activeItems = items.filter((item) => !item.is_deleted && item.project_id === project.id);
  const activeMovements = movements.filter((movement) => !movement.is_deleted && movement.project_id === project.id);
  const totalEstimated = activeItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalDone = activeItems.filter(isProjectItemDone).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const cashBalance = activeMovements.reduce((sum, movement) => {
    if (movement.type === "remove") return sum - Number(movement.amount || 0);
    return sum + Number(movement.amount || 0);
  }, 0);
  const progress = totalEstimated > 0 ? Math.min(100, (totalDone / totalEstimated) * 100) : 0;
  return {
    totalEstimated,
    totalDone,
    cashBalance,
    progress,
    pendingCount: activeItems.filter((item) => !isProjectItemDone(item)).length,
    completedCount: activeItems.filter(isProjectItemDone).length
  };
}

export function goalProgress(goal: Goal) {
  const target = Number(goal.target_amount || 0);
  const current = Number(goal.current_amount || 0);
  return target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
}

export function goalRemaining(goal: Goal) {
  return Math.max(Number(goal.target_amount || 0) - Number(goal.current_amount || 0), 0);
}

export function movementTotal(movements: GoalMovement[] | ProjectMovement[]) {
  return movements.reduce((sum, movement) => {
    if (movement.type === "remove") return sum - Number(movement.amount || 0);
    return sum + Number(movement.amount || 0);
  }, 0);
}

export function isOwner(ownerId: string, userId: string) {
  return ownerId === userId;
}

export function shareFor(sharedItems: SharedItem[], itemType: "project" | "goal", itemId: string, userId: string) {
  return sharedItems.find((item) => item.item_type === itemType && item.item_id === itemId && item.user_id === userId) || null;
}

export function canEditShared(ownerId: string, userId: string, sharedItems: SharedItem[], itemType: "project" | "goal", itemId: string) {
  if (isOwner(ownerId, userId)) return true;
  return shareFor(sharedItems, itemType, itemId, userId)?.role === "editor";
}

export function actorName(log: ActivityLog) {
  return log.actor?.display_name || log.actor?.email || "Usuário";
}

export function activityLabel(log: ActivityLog) {
  const actor = actorName(log);
  const meta = getMetadata(log);
  switch (log.action_type) {
    case "project_created": return `${actor} criou o projeto.`;
    case "project_updated": return `${actor} atualizou o projeto.`;
    case "project_deleted": return `${actor} excluiu o projeto.`;
    case "project_item_created": return `${actor} criou o item ${meta.itemName || ""}.`.trim();
    case "project_item_updated": return `${actor} atualizou o item ${meta.itemName || ""}.`.trim();
    case "project_item_toggled": return `${actor} marcou ${meta.itemName || "um item"} como ${meta.status === "completed" ? "concluído" : "pendente"}.`;
    case "project_item_deleted": return `${actor} excluiu o item ${meta.itemName || ""}.`.trim();
    case "project_contribution_added": return `${actor} adicionou ${currencyBRL(Number(meta.amount || 0))} ao caixa do projeto.`;
    case "project_contribution_removed": return `${actor} removeu ${currencyBRL(Number(meta.amount || 0))} do caixa do projeto.`;
    case "project_share_added": return `${actor} compartilhou com ${meta.userName || "um usuário"}.`;
    case "project_share_removed": return `${actor} removeu ${meta.userName || "um usuário"} do compartilhamento.`;
    case "goal_created": return `${actor} criou a meta.`;
    case "goal_updated": return `${actor} atualizou a meta.`;
    case "goal_deleted": return `${actor} excluiu a meta.`;
    case "goal_contribution_added": return `${actor} adicionou ${currencyBRL(Number(meta.amount || 0))} à meta.`;
    case "goal_contribution_removed": return `${actor} removeu ${currencyBRL(Number(meta.amount || 0))} da meta.`;
    case "goal_share_added": return `${actor} compartilhou com ${meta.userName || "um usuário"}.`;
    case "goal_share_removed": return `${actor} removeu ${meta.userName || "um usuário"} do compartilhamento.`;
    default: return `${actor} registrou uma atividade.`;
  }
}

export function activityMeta(log: ActivityLog) {
  return `${log.field_name || "Atividade"} • ${datePt((log.created_at || "").slice(0, 10))}`;
}
