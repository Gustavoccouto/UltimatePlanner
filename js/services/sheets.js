import { APP_CONFIG } from "../config.js";
import { apiRequest } from "./api.js";

function createRequestId(prefix = "sync") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function splitIntoChunks(text, maxSize = APP_CONFIG.syncChunkSize) {
  const chunks = [];
  for (let index = 0; index < text.length; index += maxSize) {
    chunks.push(text.slice(index, index + maxSize));
  }
  return chunks.length ? chunks : [""];
}

async function pushEntityChunked(entity, records) {
  const serialized = JSON.stringify(records || []);
  const chunks = splitIntoChunks(serialized, APP_CONFIG.syncChunkSize);
  const requestId = createRequestId(entity);

  await apiRequest("syncEntityChunkStart", {
    requestId,
    entity,
    totalChunks: chunks.length,
  });

  for (let index = 0; index < chunks.length; index += 1) {
    await apiRequest("syncEntityChunkPart", {
      requestId,
      entity,
      totalChunks: chunks.length,
      chunkIndex: index,
      chunk: chunks[index],
    });
  }

  return apiRequest("syncEntityChunkCommit", {
    requestId,
    entity,
    totalChunks: chunks.length,
  });
}

export const SheetsService = {
  async pushEntity(entity, records) {
    const serialized = JSON.stringify(records || []);
    if (serialized.length <= APP_CONFIG.syncChunkSize) {
      return apiRequest("syncEntity", { entity, records });
    }
    return pushEntityChunked(entity, records);
  },

  pullAll() {
    return apiRequest("pullAll", {});
  },

  ping() {
    return apiRequest("ping", {}, { skipAuth: true });
  },

  init() {
    return apiRequest("init", {}, { skipAuth: true });
  },

  diagnose() {
    return apiRequest("diagnose", {}, { skipAuth: true });
  },

  resetAll() {
    return apiRequest("resetAll", {});
  },

  bootstrapAuth() {
    return apiRequest("bootstrapAuth", {}, { skipAuth: true });
  },

  login(login, password) {
    return apiRequest("login", { login, password }, { skipAuth: true });
  },

  signup({ name, login, password, workspaceKey }) {
    return apiRequest(
      "signup",
      { name, login, password, workspaceKey },
      { skipAuth: true },
    );
  },

  createUser({ name, login, password, role, workspaceKey }) {
    return apiRequest("createUser", {
      name,
      login,
      password,
      role,
      workspaceKey,
    });
  },

  listUsers() {
    return apiRequest("listUsers", {});
  },

  askFinancialAdvisor({ question, recentMessages, selectedMonth, userName }) {
    return apiRequest('askFinancialAdvisor', {
      question,
      recentMessages,
      selectedMonth,
      userName,
    });
  },
};
