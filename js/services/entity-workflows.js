import { putOne } from "./storage.js";
import { enqueueSync } from "./sync.js";
import { createId } from "../utils/ids.js";
import { nowIso } from "../utils/dates.js";

export async function persistAndSync(storeName, record) {
  await putOne(storeName, record);
  await enqueueSync(storeName, record.id);
  return record;
}

export async function softDeleteAndSync(storeName, record, extra = {}) {
  if (!record?.id) return null;
  const deletedRecord = {
    ...record,
    isDeleted: true,
    updatedAt: nowIso(),
    version: Number(record.version || 0) + 1,
    syncStatus: "pending",
    ...extra,
  };
  await persistAndSync(storeName, deletedRecord);
  return deletedRecord;
}

export function buildActorMeta(currentUser) {
  return {
    actorUserId: currentUser?.id || null,
    actorUserName: currentUser?.name || "Usuário",
    actorLogin: currentUser?.login || "",
    actorWorkspaceKey: currentUser?.workspaceKey || "",
  };
}

export function normalizeSharedUsers(sharedUsers = [], ownerUserId = "") {
  const seen = new Set();
  return (Array.isArray(sharedUsers) ? sharedUsers : [])
    .map((user) => ({
      id: String(user?.id || user?.userId || "").trim(),
      name: String(user?.name || user?.userName || "").trim(),
      login: String(user?.login || "").trim(),
      workspaceKey: String(user?.workspaceKey || "").trim(),
    }))
    .filter((user) => user.id && user.id !== String(ownerUserId || ""))
    .filter((user) => {
      if (seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    });
}

export function getSharedUsers(entity = {}) {
  return normalizeSharedUsers(entity.sharedUsers || [], entity.ownerUserId);
}

export function getOwnerLabel(entity = {}, ownerFallback = "Dono", emptyLabel = "Sem dono") {
  if (entity.ownerUserName) return entity.ownerUserName;
  if (entity.ownerLogin) return `@${entity.ownerLogin}`;
  return entity.ownerUserId ? ownerFallback : emptyLabel;
}

export function isSharedEntityOwner(entity = {}, currentUser = null, getWorkspaceKey = null) {
  if (!currentUser) return false;
  if (entity.ownerUserId) return entity.ownerUserId === currentUser.id;
  const workspaceKey = typeof getWorkspaceKey === "function" ? getWorkspaceKey(entity) : entity.workspaceKey;
  return workspaceKey === currentUser.workspaceKey;
}

export function canEditSharedEntity(entity = {}, currentUser = null, getWorkspaceKey = null) {
  if (!currentUser) return false;
  if (isSharedEntityOwner(entity, currentUser, getWorkspaceKey)) return true;
  return getSharedUsers(entity).some((user) => user.id === currentUser.id);
}

export function matchesSharedUser(user, query = "") {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return true;
  const haystack = [user.name, user.login, user.workspaceKey, user.id]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return haystack.includes(term);
}

export async function createAuditLog({
  entityType,
  entityId,
  entityData = {},
  actionType,
  details = {},
  workspaceKey = "",
  actor = {},
}) {
  const timestamp = nowIso();
  const record = {
    id: createId("audit"),
    entityType,
    entityId,
    actionType,
    field: details.field || "",
    fieldLabel: details.fieldLabel || "",
    previousValue: typeof details.previousValue === "undefined" ? null : details.previousValue,
    newValue: typeof details.newValue === "undefined" ? null : details.newValue,
    relatedUserId: details.relatedUserId || null,
    relatedUserName: details.relatedUserName || "",
    relatedItemId: details.relatedItemId || null,
    relatedItemName: details.relatedItemName || "",
    amount:
      typeof details.amount === "undefined" || details.amount === null
        ? null
        : Number(details.amount || 0),
    notes: details.notes || "",
    timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: "pending",
    isDeleted: false,
    version: 1,
    workspaceKey,
    ...entityData,
    ...actor,
  };

  await persistAndSync("auditLogs", record);
  return record;
}

export async function logEntityFieldChanges({
  entityType,
  entityId,
  entityData = {},
  workspaceKey = "",
  actor = {},
  previous = {},
  next = {},
  fieldMap = {},
  actionType = `${entityType}_updated`,
}) {
  for (const [field, label] of Object.entries(fieldMap)) {
    if ((previous?.[field] ?? "") === (next?.[field] ?? "")) continue;
    await createAuditLog({
      entityType,
      entityId,
      entityData,
      workspaceKey,
      actor,
      actionType,
      details: {
        field,
        fieldLabel: label,
        previousValue: previous?.[field] ?? null,
        newValue: next?.[field] ?? null,
      },
    });
  }
}
