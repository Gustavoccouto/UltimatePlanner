import { getOne, putOne } from "./storage.js";
import { enqueueSync } from "./sync.js";
import { createId } from "../utils/ids.js";
import { nowIso } from "../utils/dates.js";

export async function upsertLinkedPatrimonyTransaction({
  linkedTransactionId = "",
  idPrefix = "tx_link",
  description,
  accountId,
  amount,
  category = "Patrimônio",
  date,
  notes = "",
  relationFields = {},
  actorUserId = "",
  actorUserName = "",
  accountName = "",
}) {
  const normalizedAmount = Number(amount || 0);

  if (!accountId || !normalizedAmount) {
    if (linkedTransactionId) {
      await deleteLinkedPatrimonyTransaction(linkedTransactionId);
    }
    return { transactionId: null, accountName: accountName || "", transaction: null };
  }

  const existing = linkedTransactionId
    ? await getOne("transactions", linkedTransactionId)
    : null;
  const timestamp = nowIso();

  const record = {
    ...existing,
    id: existing?.id || linkedTransactionId || createId(idPrefix),
    description,
    type: "adjustment",
    accountId,
    amount: normalizedAmount,
    category,
    date,
    status: "posted",
    notes,
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
    createdByUserId: existing?.createdByUserId || actorUserId || "",
    createdByUserName: existing?.createdByUserName || actorUserName || "",
    version: Number(existing?.version || 0) + 1,
    syncStatus: "pending",
    isDeleted: false,
    ...relationFields,
  };

  await putOne("transactions", record);
  await enqueueSync("transactions", record.id);

  return {
    transactionId: record.id,
    accountName: accountName || "",
    transaction: record,
  };
}

export async function deleteLinkedPatrimonyTransaction(linkedTransactionId) {
  if (!linkedTransactionId) return null;

  const existing = await getOne("transactions", linkedTransactionId);
  if (!existing || existing.isDeleted) return null;

  const record = {
    ...existing,
    isDeleted: true,
    updatedAt: nowIso(),
    version: Number(existing.version || 0) + 1,
    syncStatus: "pending",
  };

  await putOne("transactions", record);
  await enqueueSync("transactions", record.id);
  return record.id;
}
