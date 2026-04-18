import { loadState } from "../state.js";
import { closeModal, confirmDialog, toast } from "../ui.js";
import { putOne, bulkPut } from "./storage.js";
import { enqueueSync } from "./sync.js";

export function bindModalDismiss(ids = []) {
  const list = Array.isArray(ids) ? ids : [ids];
  list.forEach((id) => {
    document.getElementById(id)?.addEventListener("click", closeModal);
  });
}

export async function withFormFeedback(event, task) {
  event?.preventDefault?.();
  try {
    return await task(event);
  } catch (error) {
    toast(error?.message || "Não foi possível concluir a ação.", "error");
    return null;
  }
}

export async function persistAndSyncRecord(storeName, record) {
  await putOne(storeName, record);
  await enqueueSync(storeName, record.id);
  return record;
}

export async function persistAndSyncRecords(storeName, records = [], options = {}) {
  const valid = (Array.isArray(records) ? records : []).filter(Boolean);
  if (!valid.length) return [];
  await bulkPut(storeName, valid, { skipInvalid: true, ...options });
  await Promise.all(valid.map((record) => enqueueSync(storeName, record.id)));
  return valid;
}

export async function finishFlow({
  message = "",
  close = true,
  reload = true,
  resetForm = null,
  afterLoad = null,
  tone = "success",
} = {}) {
  if (reload) {
    await loadState();
  }

  if (typeof afterLoad === "function") {
    await afterLoad();
  }

  if (resetForm && typeof resetForm.reset === "function") {
    resetForm.reset();
  }

  if (close) {
    closeModal();
  }

  if (message) {
    toast(message, tone);
  }
}

export function confirmWorkflow({
  title,
  message,
  confirmText,
  tone = "danger",
  onConfirm,
}) {
  confirmDialog({
    title,
    message,
    confirmText,
    tone,
    onConfirm: async () => {
      try {
        await onConfirm();
      } catch (error) {
        toast(error?.message || "Não foi possível concluir a ação.", "error");
      }
    },
  });
}
