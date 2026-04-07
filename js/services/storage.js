import { APP_CONFIG, ENTITY_STORES, getWorkspaceKey } from "../config.js";

let dbPromise;
let currentDbName = null;

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

function createGeneratedId(storeName) {
  const prefix = STORE_PREFIX[storeName] || "id";
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function hasValidId(record) {
  return (
    !!record &&
    record.id !== undefined &&
    record.id !== null &&
    String(record.id).trim() !== ""
  );
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

  if (!normalized.workspaceKey) {
    normalized.workspaceKey = getWorkspaceKey();
  }

  return normalized;
}

function getScopedDbName() {
  const workspaceKey = String(getWorkspaceKey() || "guest")
    .trim()
    .toLowerCase();
  return `${APP_CONFIG.dbName}__${workspaceKey}`;
}

function openDb(dbName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, APP_CONFIG.dbVersion);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      ENTITY_STORES.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("syncStatus", "syncStatus", { unique: false });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function resetDbConnection() {
  dbPromise = null;
  currentDbName = null;
}

export async function getDb() {
  const scopedName = getScopedDbName();

  if (!dbPromise || currentDbName !== scopedName) {
    dbPromise = openDb(scopedName);
    currentDbName = scopedName;
  }

  return dbPromise;
}

export async function getAll(storeName) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getOne(storeName, id) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const request = tx.objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function putOne(storeName, record, options = {}) {
  const normalized = normalizeRecord(storeName, record, options);
  const db = await getDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(normalized);
    tx.oncomplete = () => resolve(normalized);
    tx.onerror = () =>
      reject(tx.error || new Error(`Falha ao salvar em ${storeName}.`));
    tx.onabort = () =>
      reject(tx.error || new Error(`Transação abortada em ${storeName}.`));
  });
}

export async function bulkPut(storeName, records = [], options = {}) {
  const { skipInvalid = false, allowGenerateId = false } = options;
  const db = await getDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const accepted = [];

    for (const record of records || []) {
      try {
        const normalized = normalizeRecord(storeName, record, {
          allowGenerateId,
        });
        store.put(normalized);
        accepted.push(normalized);
      } catch (error) {
        if (!skipInvalid) {
          tx.abort();
          reject(error);
          return;
        }
      }
    }

    tx.oncomplete = () => resolve(accepted);
    tx.onerror = () =>
      reject(tx.error || new Error(`Falha em lote na store ${storeName}.`));
    tx.onabort = () =>
      reject(
        tx.error || new Error(`Transação abortada na store ${storeName}.`),
      );
  });
}

export async function removeOne(storeName, id) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearStore(storeName) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).clear();
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export function isValidStoreRecord(record) {
  return hasValidId(record);
}
