import { ENTITY_STORES, getWorkspaceKey } from "../config.js";

const MEMORY_STORES = new Map(
  ENTITY_STORES.map((storeName) => [storeName, new Map()]),
);

const STORE_PREFIX = {
  accounts: "acct",
  creditCards: "card",
  transactions: "tx",
  categories: "cat",
  projects: "project",
  projectItems: "project_item",
  projectParticipants: "participant",
  goals: "goal",
  investments: "inv",
  installmentPlans: "inst",
  auditLogs: "audit",
  preferences: "pref",
  syncQueue: "sync",
  syncErrors: "sync_error",
  meta: "meta",
};

function getStore(storeName) {
  if (!MEMORY_STORES.has(storeName)) {
    MEMORY_STORES.set(storeName, new Map());
  }
  return MEMORY_STORES.get(storeName);
}

function createGeneratedId(storeName) {
  const prefix = STORE_PREFIX[storeName] || "id";
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hasValidId(record) {
  return !!record && record.id !== undefined && record.id !== null && String(record.id).trim() !== "";
}

function normalizeRecord(storeName, record, { allowGenerateId = false } = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`Registro inválido para "${storeName}".`);
  }

  const normalized = { ...record };

  if (!hasValidId(normalized)) {
    if (allowGenerateId) {
      normalized.id = createGeneratedId(storeName);
    } else {
      throw new Error(`Registro inválido para "${storeName}": id ausente.`);
    }
  }

  if (!normalized.updatedAt) {
    normalized.updatedAt = new Date().toISOString();
  }

  if (!normalized.workspaceKey && storeName !== "preferences" && storeName !== "meta") {
    normalized.workspaceKey = getWorkspaceKey();
  }

  return normalized;
}

export function resetDbConnection() {
  ENTITY_STORES.forEach((storeName) => {
    getStore(storeName).clear();
  });
}

export async function getDb() {
  return null;
}

export async function deleteCurrentWorkspaceDb() {
  resetDbConnection();
  return true;
}

export async function getAll(storeName) {
  return Array.from(getStore(storeName).values()).map((record) => ({ ...record }));
}

export async function getOne(storeName, id) {
  const record = getStore(storeName).get(id);
  return record ? { ...record } : null;
}

export async function putOne(storeName, record, options = {}) {
  const normalized = normalizeRecord(storeName, record, options);
  getStore(storeName).set(normalized.id, normalized);
  return { ...normalized };
}

export async function bulkPut(storeName, records = [], options = {}) {
  const { skipInvalid = false, allowGenerateId = false } = options;
  const accepted = [];

  for (const record of records || []) {
    try {
      const normalized = normalizeRecord(storeName, record, { allowGenerateId });
      getStore(storeName).set(normalized.id, normalized);
      accepted.push({ ...normalized });
    } catch (error) {
      if (!skipInvalid) {
        throw error;
      }
    }
  }

  return accepted;
}

export async function removeOne(storeName, id) {
  getStore(storeName).delete(id);
  return true;
}

export async function clearStore(storeName) {
  getStore(storeName).clear();
  return true;
}

export function subscribeToExternalStorageChanges(_listener) {
  return () => {};
}

export function isValidStoreRecord(record) {
  return hasValidId(record);
}
