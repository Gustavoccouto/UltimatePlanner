import { getAll, putOne, bulkPut, isValidStoreRecord } from "./storage.js";
import { SheetsService } from "./sheets.js";
import { nowIso } from "../utils/dates.js";
import { createId } from "../utils/ids.js";
import { APP_CONFIG, ENTITY_STORES } from "../config.js";

const REMOTE_SYNCABLE = ENTITY_STORES.filter(
  (name) => !["syncQueue", "syncErrors", "meta"].includes(name),
);
const REMOTE_BATCH_SIZE = Math.max(1, Number(APP_CONFIG.maxSyncBatchSize || 1));

async function logSyncError(entity, recordId, message) {
  await putOne(
    "syncErrors",
    {
      id: createId("sync_error"),
      entity,
      recordId: recordId || null,
      message,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
    { allowGenerateId: true },
  );
}

function getQueueIdentity(item) {
  return `${item.entity}::${item.recordId}::${item.action || "upsert"}`;
}

export async function enqueueSync(storeName, recordId, action = "upsert") {
  if (!recordId) {
    await logSyncError(
      storeName,
      null,
      `Tentativa de enfileirar sincronização sem id em ${storeName}.`,
    );
    throw new Error(`Não foi possível sincronizar "${storeName}": id ausente.`);
  }

  const queue = await getAll("syncQueue");
  const existing = queue.find(
    (item) =>
      item.entity === storeName &&
      item.recordId === recordId &&
      (item.action || "upsert") === action &&
      item.syncStatus !== "done",
  );

  if (existing) {
    return putOne("syncQueue", {
      ...existing,
      syncStatus: "pending",
      updatedAt: nowIso(),
    });
  }

  return putOne("syncQueue", {
    id: createId("sync"),
    entity: storeName,
    recordId,
    action,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    syncStatus: "pending",
  });
}

export async function hasPendingSync() {
  const queue = await getAll("syncQueue");
  return queue.some((item) => item.syncStatus !== "done");
}

export async function processSyncQueue() {
  const queue = (await getAll("syncQueue"))
    .filter((item) => item.syncStatus !== "done")
    .sort(
      (a, b) =>
        new Date(a.updatedAt || a.createdAt || 0) -
        new Date(b.updatedAt || b.createdAt || 0),
    );

  if (!queue.length) return { processed: 0, failed: 0, cleaned: 0 };

  const latestItems = new Map();
  for (const item of queue) {
    latestItems.set(getQueueIdentity(item), item);
  }

  const dedupedQueue = [...latestItems.values()];
  const latestIds = new Set(dedupedQueue.map((item) => item.id));
  const duplicatedItems = queue.filter((item) => !latestIds.has(item.id));

  if (duplicatedItems.length) {
    await bulkPut(
      "syncQueue",
      duplicatedItems.map((item) => ({
        ...item,
        syncStatus: "done",
        updatedAt: nowIso(),
      })),
      { skipInvalid: true },
    );
  }

  const grouped = dedupedQueue.reduce((acc, item) => {
    if (!item?.entity) return acc;
    if (!acc[item.entity]) acc[item.entity] = [];
    acc[item.entity].push(item);
    return acc;
  }, {});

  let processed = 0;
  let failed = 0;

  for (const [entity, items] of Object.entries(grouped)) {
    const records = await getAll(entity);
    const recordMap = new Map(
      records.filter(isValidStoreRecord).map((record) => [record.id, record]),
    );

    for (let index = 0; index < items.length; index += REMOTE_BATCH_SIZE) {
      const chunk = items.slice(index, index + REMOTE_BATCH_SIZE);
      const validPayload = [];
      const doneWithoutSync = [];

      for (const item of chunk) {
        const record = recordMap.get(item.recordId);
        if (!record || !record.id) {
          await logSyncError(
            item.entity,
            item.recordId,
            `Registro ausente ou inválido para sincronização em ${item.entity}.`,
          );
          doneWithoutSync.push({
            ...item,
            syncStatus: "done",
            updatedAt: nowIso(),
          });
          continue;
        }

        validPayload.push({ ...record, syncUpdatedAt: nowIso() });
      }

      if (doneWithoutSync.length) {
        await bulkPut("syncQueue", doneWithoutSync, { skipInvalid: true });
      }

      if (!validPayload.length) continue;

      try {
        await SheetsService.pushEntity(entity, validPayload);
        await bulkPut(
          entity,
          validPayload.map((record) => ({
            ...record,
            syncStatus: "synced",
            syncUpdatedAt: nowIso(),
          })),
          { skipInvalid: true },
        );
        await bulkPut(
          "syncQueue",
          chunk.map((item) => ({
            ...item,
            syncStatus: "done",
            updatedAt: nowIso(),
          })),
          { skipInvalid: true },
        );
        processed += validPayload.length;
      } catch (error) {
        failed += validPayload.length;
        for (const item of chunk) {
          await logSyncError(item.entity, item.recordId, error.message);
        }
        await bulkPut(
          "syncQueue",
          chunk.map((item) => ({
            ...item,
            syncStatus: "failed",
            updatedAt: nowIso(),
          })),
          { skipInvalid: true },
        );
      }
    }
  }

  return { processed, failed, cleaned: duplicatedItems.length };
}

function isRemoteNewer(localRecord, remoteRecord) {
  const localTime = new Date(
    localRecord?.updatedAt || localRecord?.syncUpdatedAt || 0,
  ).getTime();
  const remoteTime = new Date(
    remoteRecord?.updatedAt || remoteRecord?.syncUpdatedAt || 0,
  ).getTime();
  return remoteTime >= localTime;
}

export async function pullRemoteIntoLocal() {
  const response = await SheetsService.pullAll();
  const remoteData = response.data || {};
  let changed = 0;

  for (const storeName of REMOTE_SYNCABLE) {
    const remoteRecords = Array.isArray(remoteData[storeName])
      ? remoteData[storeName]
      : [];
    if (!remoteRecords.length) continue;

    const localRecords = await getAll(storeName);
    const merged = new Map(
      localRecords
        .filter(isValidStoreRecord)
        .map((record) => [record.id, record]),
    );

    for (const remoteRecord of remoteRecords) {
      if (!remoteRecord || !remoteRecord.id) {
        await logSyncError(
          storeName,
          null,
          `Registro remoto inválido ignorado em ${storeName}.`,
        );
        continue;
      }

      const localRecord = merged.get(remoteRecord.id);
      if (!localRecord || isRemoteNewer(localRecord, remoteRecord)) {
        merged.set(remoteRecord.id, { ...remoteRecord, syncStatus: "synced" });
        changed += 1;
      }
    }

    await bulkPut(storeName, [...merged.values()], { skipInvalid: true });
  }

  return { changed };
}

export async function requeueFailedSync() {
  const queue = await getAll("syncQueue");
  const failedItems = queue.filter((item) => item.syncStatus === "failed");
  if (!failedItems.length) return 0;

  await bulkPut(
    "syncQueue",
    failedItems.map((item) => ({
      ...item,
      syncStatus: "pending",
      updatedAt: nowIso(),
    })),
    { skipInvalid: true },
  );

  return failedItems.length;
}
