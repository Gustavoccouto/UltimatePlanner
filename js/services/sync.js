import { getAll, putOne, bulkPut, isValidStoreRecord } from "./storage.js";
import { SheetsService } from "./sheets.js";
import { nowIso } from "../utils/dates.js";
import { createId } from "../utils/ids.js";
import { APP_CONFIG, ENTITY_STORES } from "../config.js";

const REMOTE_SYNCABLE = ENTITY_STORES.filter(
  (name) => !["syncQueue", "syncErrors", "meta"].includes(name),
);
const REMOTE_BATCH_SIZE = Math.max(1, Number(APP_CONFIG.maxSyncBatchSize || 1));

let queueProcessPromise = null;
let pullProcessPromise = null;

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

function toTime(value) {
  return new Date(value || 0).getTime() || 0;
}

function wasTouchedAfter(snapshot, current) {
  if (!snapshot || !current) return false;
  return (
    toTime(current.updatedAt || current.syncUpdatedAt || current.createdAt) >
    toTime(snapshot.updatedAt || snapshot.syncUpdatedAt || snapshot.createdAt)
  );
}

async function getStoreRecordMap(storeName) {
  const records = await getAll(storeName);
  return new Map(
    records.filter(isValidStoreRecord).map((record) => [record.id, record]),
  );
}

async function finalizeQueueChunk(chunk, nextStatus) {
  const queue = await getAll("syncQueue");
  const queueMap = new Map(queue.map((item) => [item.id, item]));
  const updates = [];
  const timestamp = nowIso();

  for (const snapshot of chunk) {
    const current = queueMap.get(snapshot.id);

    if (!current) continue;

    const touched = wasTouchedAfter(snapshot, current);

    if (touched && current.syncStatus === "pending") {
      continue;
    }

    updates.push({
      ...current,
      syncStatus: nextStatus,
      updatedAt: timestamp,
    });
  }

  if (updates.length) {
    await bulkPut("syncQueue", updates, { skipInvalid: true });
  }
}

async function markRecordsAsSynced(entity, pushedPayload = []) {
  if (!pushedPayload.length) return;

  const currentRecordMap = await getStoreRecordMap(entity);
  const updates = [];
  const timestamp = nowIso();

  for (const pushedRecord of pushedPayload) {
    const current = currentRecordMap.get(pushedRecord.id);
    if (!current || !current.id) continue;

    if (wasTouchedAfter(pushedRecord, current)) {
      continue;
    }

    updates.push({
      ...current,
      syncStatus: "synced",
      syncUpdatedAt: timestamp,
    });
  }

  if (updates.length) {
    await bulkPut(entity, updates, { skipInvalid: true });
  }
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

async function processSyncQueueInternal() {
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
    for (let index = 0; index < items.length; index += REMOTE_BATCH_SIZE) {
      const chunk = items.slice(index, index + REMOTE_BATCH_SIZE);
      const recordMap = await getStoreRecordMap(entity);
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
          doneWithoutSync.push(item);
          continue;
        }

        validPayload.push({
          ...record,
          syncUpdatedAt: nowIso(),
        });
      }

      if (doneWithoutSync.length) {
        await finalizeQueueChunk(doneWithoutSync, "done");
      }

      if (!validPayload.length) continue;

      try {
        await SheetsService.pushEntity(entity, validPayload);
        await markRecordsAsSynced(entity, validPayload);
        await finalizeQueueChunk(chunk, "done");
        processed += validPayload.length;
      } catch (error) {
        failed += validPayload.length;
        for (const item of chunk) {
          await logSyncError(item.entity, item.recordId, error.message);
        }
        await finalizeQueueChunk(chunk, "failed");
      }
    }
  }

  return { processed, failed, cleaned: duplicatedItems.length };
}

export async function processSyncQueue() {
  if (queueProcessPromise) {
    return queueProcessPromise;
  }

  queueProcessPromise = processSyncQueueInternal();

  try {
    return await queueProcessPromise;
  } finally {
    queueProcessPromise = null;
  }
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

async function pullRemoteIntoLocalInternal() {
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

export async function pullRemoteIntoLocal() {
  if (pullProcessPromise) {
    return pullProcessPromise;
  }

  pullProcessPromise = pullRemoteIntoLocalInternal();

  try {
    return await pullProcessPromise;
  } finally {
    pullProcessPromise = null;
  }
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
