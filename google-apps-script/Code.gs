/**
 * UltimatePlanner Web App backend.
 *
 * Publicação recomendada:
 * 1) Defina SPREADSHEET_ID com o ID da planilha ou salve em Script Properties.
 * 2) Deploy > New deployment > Web app.
 * 3) Execute as: Me.
 * 4) Who has access: Anyone.
 * 5) Use a URL /exec atualizada no app.
 */
const SPREADSHEET_ID = '14-V6ooCadcOym63VUxIl7DUAimk2EwxvScBioCUKc7g';

const SHEETS = {
  accounts: 'accounts',
  creditCards: 'cards',
  transactions: 'transactions',
  categories: 'categories',
  projects: 'projects',
  projectItems: 'project_items',
  projectParticipants: 'project_participants',
  goals: 'goals',
  investments: 'investments',
  installmentPlans: 'installment_plans',
  auditLogs: 'audit_logs',
  preferences: 'settings',
  syncMeta: 'sync_meta'
};

const DEFAULT_HEADERS = ['id', 'payload_json', 'updatedAt', 'entity'];
const CHUNK_PREFIX = 'sync_chunk';
const CHUNK_TTL_SECONDS = 600;

function doGet(e) {
  return handleRequest_(e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return handleRequest_(body || {});
  } catch (error) {
    return response_({ ok: false, message: error.message, stack: String(error.stack || '') }, null);
  }
}

function handleRequest_(input) {
  const callback = input.callback || null;
  const action = input.action || 'ping';
  const payload = parsePayload_(input.payload);

  try {
    switch (action) {
      case 'ping':
        return response_({ ok: true, message: 'pong', timestamp: new Date().toISOString() }, callback);
      case 'init':
        ensureAllSheets_();
        return response_({ ok: true, message: 'Estrutura inicial garantida.', sheets: Object.values(SHEETS) }, callback);
      case 'pullAll':
        ensureAllSheets_();
        return response_(pullAllData_(), callback);
      case 'syncEntity':
        ensureAllSheets_();
        return response_(syncEntity_(payload.entity, payload.records || []), callback);
      case 'syncEntityChunkStart':
        return response_(startChunkedSync_(payload), callback);
      case 'syncEntityChunkPart':
        return response_(storeChunkPart_(payload), callback);
      case 'syncEntityChunkCommit':
        ensureAllSheets_();
        return response_(commitChunkedSync_(payload), callback);
      case 'diagnose':
        ensureAllSheets_();
        return response_({
          ok: true,
          spreadsheetId: getSpreadsheetId_(),
          sheets: Object.values(SHEETS),
          timestamp: new Date().toISOString(),
          warning: 'Se esta ação responder, mas o front não sincronizar, confira a URL /exec, o deploy público e se o app está usando a versão mais nova do Code.gs.'
        }, callback);
      case 'resetAll':
        ensureAllSheets_();
        return response_(resetAllData_(), callback);
      default:
        return response_({ ok: false, message: 'Ação inválida.' }, callback);
    }
  } catch (error) {
    return response_({ ok: false, message: error.message, stack: String(error.stack || '') }, callback);
  }
}

function response_(obj, callback) {
  if (callback) {
    return ContentService.createTextOutput(`${callback}(${JSON.stringify(obj)})`).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function parsePayload_(payload) {
  if (!payload) return {};
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch (error) {
      throw new Error('Payload inválido.');
    }
  }
  return payload;
}

function getSpreadsheetId_() {
  const byProperty = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const spreadsheetId = byProperty || SPREADSHEET_ID;
  if (!spreadsheetId || spreadsheetId === 'COLE_AQUI_O_ID_DA_PLANILHA') {
    throw new Error('SPREADSHEET_ID não configurado. Cole o ID real da planilha ou defina a Script Property SPREADSHEET_ID.');
  }
  return spreadsheetId;
}

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getSpreadsheetId_());
}

function ensureSheet_(name) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(DEFAULT_HEADERS);
    sheet.setFrozenRows(1);
  }
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), DEFAULT_HEADERS.length)).getValues()[0];
  if (headers[0] !== 'id' || headers[1] !== 'payload_json') {
    sheet.clear();
    sheet.appendRow(DEFAULT_HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureAllSheets_() {
  Object.keys(SHEETS).forEach((entity) => ensureSheet_(SHEETS[entity]));
}

function syncEntity_(entity, records) {
  if (!SHEETS[entity]) throw new Error('Entidade não suportada: ' + entity);
  const sheet = ensureSheet_(SHEETS[entity]);
  const values = sheet.getDataRange().getValues();
  const indexById = {};

  for (let i = 1; i < values.length; i++) {
    if (values[i][0]) indexById[String(values[i][0])] = i + 1;
  }

  const rowsToAppend = [];
  records.forEach((record) => {
    if (!record || !record.id) throw new Error('Registro inválido sem id em ' + entity);
    const updatedAt = record.updatedAt || record.syncUpdatedAt || new Date().toISOString();
    const row = [String(record.id), JSON.stringify(record), updatedAt, entity];
    const existingRow = indexById[String(record.id)];
    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
    } else {
      rowsToAppend.push(row);
    }
  });

  if (rowsToAppend.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, DEFAULT_HEADERS.length).setValues(rowsToAppend);
  }

  return { ok: true, entity: entity, count: records.length };
}

function startChunkedSync_(payload) {
  const requestId = String(payload.requestId || '');
  const totalChunks = Number(payload.totalChunks || 0);
  const entity = String(payload.entity || '');

  if (!requestId || !entity || !totalChunks || totalChunks < 1) {
    throw new Error('Parâmetros inválidos para iniciar sincronização em partes.');
  }

  const cache = CacheService.getScriptCache();
  cache.put(chunkMetaKey_(requestId), JSON.stringify({ entity: entity, totalChunks: totalChunks }), CHUNK_TTL_SECONDS);

  return { ok: true, requestId: requestId, totalChunks: totalChunks };
}

function storeChunkPart_(payload) {
  const requestId = String(payload.requestId || '');
  const chunkIndex = Number(payload.chunkIndex);
  const totalChunks = Number(payload.totalChunks || 0);
  const chunk = String(payload.chunk || '');

  if (!requestId || Number.isNaN(chunkIndex) || chunkIndex < 0 || !totalChunks) {
    throw new Error('Parte de sincronização inválida.');
  }

  const cache = CacheService.getScriptCache();
  cache.put(chunkPartKey_(requestId, chunkIndex), chunk, CHUNK_TTL_SECONDS);
  cache.put(chunkMetaKey_(requestId), JSON.stringify({ entity: String(payload.entity || ''), totalChunks: totalChunks }), CHUNK_TTL_SECONDS);

  return { ok: true, requestId: requestId, chunkIndex: chunkIndex };
}

function commitChunkedSync_(payload) {
  const requestId = String(payload.requestId || '');
  const fallbackEntity = String(payload.entity || '');
  const fallbackTotalChunks = Number(payload.totalChunks || 0);
  if (!requestId) {
    throw new Error('requestId ausente ao finalizar sincronização em partes.');
  }

  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(chunkMetaKey_(requestId));
  const meta = metaRaw ? JSON.parse(metaRaw) : { entity: fallbackEntity, totalChunks: fallbackTotalChunks };
  const entity = meta.entity || fallbackEntity;
  const totalChunks = Number(meta.totalChunks || fallbackTotalChunks);

  if (!entity || !totalChunks) {
    throw new Error('Metadados da sincronização em partes não encontrados ou expirados.');
  }

  const chunks = [];
  for (let index = 0; index < totalChunks; index += 1) {
    const chunkValue = cache.get(chunkPartKey_(requestId, index));
    if (chunkValue === null) {
      throw new Error('Parte da sincronização expirou antes da finalização. Reenvie a operação.');
    }
    chunks.push(chunkValue);
  }

  const serialized = chunks.join('');
  let records;
  try {
    records = JSON.parse(serialized || '[]');
  } catch (error) {
    throw new Error('Não foi possível reconstruir os dados enviados em partes.');
  }

  const result = syncEntity_(entity, records);
  cleanupChunkedSync_(requestId, totalChunks);
  return result;
}

function cleanupChunkedSync_(requestId, totalChunks) {
  const cache = CacheService.getScriptCache();
  cache.remove(chunkMetaKey_(requestId));
  for (let index = 0; index < totalChunks; index += 1) {
    cache.remove(chunkPartKey_(requestId, index));
  }
}

function chunkMetaKey_(requestId) {
  return `${CHUNK_PREFIX}:${requestId}:meta`;
}

function chunkPartKey_(requestId, index) {
  return `${CHUNK_PREFIX}:${requestId}:${index}`;
}

function pullAllData_() {
  const data = {};
  const skipped = {};

  Object.keys(SHEETS).forEach((entity) => {
    const sheet = ensureSheet_(SHEETS[entity]);
    const values = sheet.getDataRange().getValues();
    let skippedCount = 0;

    data[entity] = values.slice(1).map((row) => {
      try {
        const parsed = JSON.parse(row[1] || '{}');
        if (!parsed || !parsed.id) {
          skippedCount += 1;
          return null;
        }
        return parsed;
      } catch (error) {
        skippedCount += 1;
        return null;
      }
    }).filter(Boolean);

    if (skippedCount) skipped[entity] = skippedCount;
  });

  return { ok: true, data: data, skippedInvalid: skipped };
}

function resetAllData_() {
  Object.keys(SHEETS).forEach((entity) => {
    const sheet = ensureSheet_(SHEETS[entity]);
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, DEFAULT_HEADERS.length).clearContent();
    }
  });
  return { ok: true, message: 'Todos os dados remotos foram apagados.', sheets: Object.values(SHEETS) };
}
