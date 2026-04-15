import { getAll, putOne, bulkPut, clearStore, isValidStoreRecord } from "./storage.js";
import { SheetsService } from "./sheets.js";
import { nowIso } from "../utils/dates.js";
import { createId } from "../utils/ids.js";
import { ENTITY_STORES } from "../config.js";

const LOCAL_ONLY_STORES = new Set(["syncQueue", "syncErrors"]);
const REMOTE_SYNCABLE = ENTITY_STORES.filter((name) => !LOCAL_ONLY_STORES.has(name));
const REMOTE_BATCH_SIZE = 1;

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

export async function enqueueSync(storeName, recordId, action = "upsert") {
  if (!recordId) {
    await logSyncError(
      storeName,
      null,
      `Tentativa de enfileirar sincronização sem id em ${storeName}.`,
    );
    throw new Error(`Não foi possível sincronizar "${storeName}": id ausente.`);
  }

  await putOne("syncQueue", {
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

function buildDeleteTombstone(item) {
  return {
    id: item.recordId,
    isDeleted: true,
    updatedAt: nowIso(),
    syncUpdatedAt: nowIso(),
  };
}

export async function processSyncQueue() {
  const queue = (await getAll("syncQueue")).filter((item) => item.syncStatus !== "done");
  if (!queue.length) return { processed: 0, failed: 0 };

  const grouped = queue.reduce((acc, item) => {
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
      const payloadMap = new Map();

      for (const item of chunk) {
        const record = recordMap.get(item.recordId);

        if (record && record.id) {
          payloadMap.set(record.id, {
            ...record,
            syncUpdatedAt: nowIso(),
          });
          continue;
        }

        if (item.action === "delete") {
          payloadMap.set(item.recordId, buildDeleteTombstone(item));
          continue;
        }

        await logSyncError(
          item.entity,
          item.recordId,
          `Registro ausente ou inválido para sincronização em ${item.entity}.`,
        );
      }

      const validPayload = [...payloadMap.values()];
      if (!validPayload.length) {
        await bulkPut(
          "syncQueue",
          chunk.map((item) => ({
            ...item,
            syncStatus: "done",
            updatedAt: nowIso(),
          })),
          { skipInvalid: true },
        );
        continue;
      }

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

  if (processed > 0) {
    await pullRemoteIntoLocal();
  }

  return { processed, failed };
}

export async function pullRemoteIntoLocal() {
  const response = await SheetsService.pullAll();
  const remoteData = response.data || {};
  let changed = 0;

  for (const storeName of ENTITY_STORES) {
    if (LOCAL_ONLY_STORES.has(storeName)) {
      await clearStore(storeName);
      continue;
    }

    const remoteRecords = Array.isArray(remoteData[storeName]) ? remoteData[storeName] : [];
    await clearStore(storeName);

    if (remoteRecords.length) {
      await bulkPut(
        storeName,
        remoteRecords.map((record) => ({
          ...record,
          syncStatus: "synced",
        })),
        { skipInvalid: true },
      );
    }

    changed += remoteRecords.length;
  }

  return { changed };
}

export async function requeueFailedSync() {
  const queue = await getAll("syncQueue");
  const failed = queue.filter((item) => item.syncStatus === "failed");
  if (!failed.length) return 0;

  await bulkPut(
    "syncQueue",
    failed.map((item) => ({
      ...item,
      syncStatus: "pending",
      updatedAt: nowIso(),
    })),
    { skipInvalid: true },
  );

  return failed.length;
}
