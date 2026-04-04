import { APP_CONFIG } from '../config.js';
import { apiRequest } from './api.js';

function createRequestId(prefix = 'sync') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function splitIntoChunks(text, maxSize = APP_CONFIG.syncChunkSize) {
  const chunks = [];
  for (let index = 0; index < text.length; index += maxSize) {
    chunks.push(text.slice(index, index + maxSize));
  }
  return chunks.length ? chunks : [''];
}

async function pushEntityChunked(entity, records) {
  const serialized = JSON.stringify(records || []);
  const chunks = splitIntoChunks(serialized, APP_CONFIG.syncChunkSize);
  const requestId = createRequestId(entity);

  await apiRequest('syncEntityChunkStart', {
    requestId,
    entity,
    totalChunks: chunks.length,
  });

  for (let index = 0; index < chunks.length; index += 1) {
    await apiRequest('syncEntityChunkPart', {
      requestId,
      entity,
      totalChunks: chunks.length,
      chunkIndex: index,
      chunk: chunks[index],
    });
  }

  return apiRequest('syncEntityChunkCommit', {
    requestId,
    entity,
    totalChunks: chunks.length,
  });
}

export const SheetsService = {
  async pushEntity(entity, records) {
    const serialized = JSON.stringify(records || []);
    if (serialized.length <= APP_CONFIG.syncChunkSize) {
      return apiRequest('syncEntity', { entity, records });
    }
    return pushEntityChunked(entity, records);
  },
  pullAll() {
    return apiRequest('pullAll', {});
  },
  ping() {
    return apiRequest('ping', {});
  },
  init() {
    return apiRequest('init', {});
  },
  diagnose() {
    return apiRequest('diagnose', {});
  },
  resetAll() {
    return apiRequest('resetAll', {});
  }
};
