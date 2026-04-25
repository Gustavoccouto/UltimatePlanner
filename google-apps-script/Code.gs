/**
 * UltimatePlanner Web App backend
 *
 * Ajuste estes valores antes do deploy:
 * - SPREADSHEET_ID
 * - AUTH_SECRET
 * - DEFAULT_OWNER_PASSWORD
 * - SELF_SIGNUP_INVITE_CODE
 */

const SPREADSHEET_ID = '14-V6ooCadcOym63VUxIl7DUAimk2EwxvScBioCUKc7g';

const AUTH_SECRET = '2fv3b2nbf-fb32f32fe-gews';
const DEFAULT_OWNER_NAME = 'Gustavo';
const DEFAULT_OWNER_LOGIN = 'gustavo';
const DEFAULT_OWNER_PASSWORD = '2202';
const DEFAULT_WORKSPACE_KEY = 'gustavo';
const SELF_SIGNUP_INVITE_CODE = 'Acesso pessoal';

const GROQ_DEFAULT_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_DEFAULT_MODEL = 'llama-3.1-70b-versatile';
const AI_MAX_QUESTION_LENGTH = 600;
const AI_MAX_HISTORY_MESSAGES = 6;
const AI_MAX_HISTORY_CONTENT = 280;

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
  recurringRules: 'recurring_rules',
  auditLogs: 'audit_logs',
  preferences: 'settings',
  syncMeta: 'sync_meta',
  authUsers: 'auth_users'
};

const DEFAULT_HEADERS = ['id', 'payload_json', 'updatedAt', 'entity', 'workspaceKey'];
const AUTH_HEADERS = ['id', 'payload_json', 'updatedAt', 'entity', 'workspaceKey'];
const CHUNK_PREFIX = 'sync_chunk';
const CHUNK_TTL_SECONDS = 600;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dias

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
        ensureDefaultOwner_();
        return response_({
          ok: true,
          message: 'Estrutura inicial garantida.',
          sheets: Object.values(SHEETS)
        }, callback);

      case 'bootstrapAuth':
        ensureAllSheets_();
        ensureDefaultOwner_();
        return response_(bootstrapAuth_(), callback);

      case 'login':
        ensureAllSheets_();
        ensureDefaultOwner_();
        return response_(login_(payload), callback);

      case 'signup':
        ensureAllSheets_();
        ensureDefaultOwner_();
        return response_(signup_(payload), callback);

      case 'createUser':
        ensureAllSheets_();
        ensureDefaultOwner_();
        return response_(createUser_(payload), callback);

      case 'listUsers':
        ensureAllSheets_();
        ensureDefaultOwner_();
        return response_(listUsers_(payload), callback);

      case 'pullAll':
        ensureAllSheets_();
        return response_(pullAllData_(requireAuth_(payload)), callback);

      case 'syncEntity':
        ensureAllSheets_();
        return response_(syncEntity_(payload.entity, payload.records || [], requireAuth_(payload)), callback);

      case 'syncEntityChunkStart':
        return response_(startChunkedSync_(payload), callback);

      case 'syncEntityChunkPart':
        return response_(storeChunkPart_(payload), callback);

      case 'syncEntityChunkCommit':
        ensureAllSheets_();
        return response_(commitChunkedSync_(payload), callback);

      case 'diagnose':
        ensureAllSheets_();
        ensureDefaultOwner_();
        return response_({
          ok: true,
          spreadsheetId: getSpreadsheetId_(),
          sheets: Object.values(SHEETS),
          timestamp: new Date().toISOString(),
          warning: 'Se esta ação responder, mas o front não sincronizar, confira a URL /exec, o deploy público e se o app está usando a versão mais nova do Code.gs.'
        }, callback);

      case 'resetAll':
        ensureAllSheets_();
        return response_(resetAllData_(requireAuth_(payload)), callback);

      case 'askFinancialAdvisor':
        ensureAllSheets_();
        return response_(askFinancialAdvisor_(payload, requireAuth_(payload)), callback);

      default:
        return response_({ ok: false, message: 'Ação inválida.' }, callback);
    }
  } catch (error) {
    return response_({ ok: false, message: error.message, stack: String(error.stack || '') }, callback);
  }
}

function response_(obj, callback) {
  if (callback) {
    return ContentService
      .createTextOutput(`${callback}(${JSON.stringify(obj)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
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

function getScriptProperty_(name, fallback) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  return value !== null && value !== '' ? value : fallback;
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

function ensureSheet_(name, headers) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }

  const expected = headers;
  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), expected.length)).getValues()[0];

  const isDifferent = expected.some((header, index) => current[index] !== header);

  if (isDifferent) {
    if (sheet.getLastRow() <= 1) {
      sheet.clear();
      sheet.appendRow(expected);
      sheet.setFrozenRows(1);
    }
  }

  return sheet;
}

function ensureAllSheets_() {
  Object.keys(SHEETS).forEach((entity) => {
    const headers = entity === 'authUsers' ? AUTH_HEADERS : DEFAULT_HEADERS;
    ensureSheet_(SHEETS[entity], headers);
  });
}

function nowIso_() {
  return new Date().toISOString();
}

function normalizeWorkspaceKey_(value) {
  return String(value || DEFAULT_WORKSPACE_KEY)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || DEFAULT_WORKSPACE_KEY;
}

function isDeletedRecord_(record) {
  return !!record && (
    record.isDeleted === true ||
    record.isDeleted === 'true' ||
    record.deleted === true ||
    record.deleted === 'true'
  );
}


function getRecordKey_(id, workspaceKey) {
  return `${String(id || '')}::${normalizeWorkspaceKey_(workspaceKey)}`;
}

function getSharedUsers_(record) {
  return (Array.isArray(record && record.sharedUsers) ? record.sharedUsers : [])
    .map((user) => ({
      id: String(user && (user.id || user.userId) || '').trim(),
      name: String(user && (user.name || user.userName) || '').trim(),
      login: String(user && user.login || '').trim(),
      workspaceKey: String(user && user.workspaceKey || '').trim(),
    }))
    .filter((user) => user.id);
}

function getSharedUserIds_(record) {
  return getSharedUsers_(record).map((user) => user.id);
}

function normalizeUserListKey_(users) {
  return getSharedUsers_({ sharedUsers: users }).map((user) => user.id).sort().join('|');
}

function readEntityState_(entity) {
  const sheet = ensureSheet_(SHEETS[entity], DEFAULT_HEADERS);
  const values = sheet.getDataRange().getValues();
  const indexByKey = {};
  const recordByKey = {};
  const rows = [];

  for (let i = 1; i < values.length; i += 1) {
    const rowId = String(values[i][0] || '');
    const rowWorkspace = normalizeWorkspaceKey_(values[i][4] || DEFAULT_WORKSPACE_KEY);
    const key = getRecordKey_(rowId, rowWorkspace);
    let parsed = null;

    try {
      parsed = JSON.parse(values[i][1] || '{}');
      if (parsed && typeof parsed === 'object') {
        parsed.workspaceKey = rowWorkspace;
      }
    } catch (error) {
      parsed = null;
    }

    if (rowId) {
      indexByKey[key] = i + 1;
      if (parsed && parsed.id) {
        recordByKey[key] = parsed;
      }
    }

    rows.push({
      rowNumber: i + 1,
      rowId,
      rowWorkspace,
      parsed,
      raw: values[i]
    });
  }

  return { sheet, values, indexByKey, recordByKey, rows };
}

function canUserAccessProjectRecord_(record, session) {
  if (!record || isDeletedRecord_(record)) return false;
  const sessionWorkspace = normalizeWorkspaceKey_(session.workspaceKey);
  const recordWorkspace = normalizeWorkspaceKey_(record.workspaceKey || DEFAULT_WORKSPACE_KEY);
  if (recordWorkspace === sessionWorkspace) return true;
  if (String(record.ownerUserId || '') === String(session.userId || '')) return true;
  return getSharedUserIds_(record).includes(String(session.userId || ''));
}

function canUserAccessGoalRecord_(record, session) {
  if (!record || isDeletedRecord_(record)) return false;
  const sessionWorkspace = normalizeWorkspaceKey_(session.workspaceKey);
  const recordWorkspace = normalizeWorkspaceKey_(record.workspaceKey || DEFAULT_WORKSPACE_KEY);
  if (recordWorkspace === sessionWorkspace) return true;
  if (String(record.ownerUserId || '') === String(session.userId || '')) return true;
  return getSharedUserIds_(record).includes(String(session.userId || ''));
}

function prepareOwnedSharedRecord_(record, existingRecord, session, targetWorkspace) {
  const sessionUserId = String(session.userId || '');
  const ownerUserId = String(existingRecord && existingRecord.ownerUserId || record.ownerUserId || sessionUserId);
  const existingSharedUsers = getSharedUsers_(existingRecord || {});
  const incomingSharedUsers = getSharedUsers_(record || {});
  const isOwner = ownerUserId === sessionUserId || (!existingRecord && targetWorkspace === normalizeWorkspaceKey_(session.workspaceKey));

  if (targetWorkspace !== normalizeWorkspaceKey_(session.workspaceKey)) {
    const existingSharedIds = getSharedUserIds_(existingRecord || {});
    if (!isOwner && existingSharedIds.indexOf(sessionUserId) === -1) {
      throw new Error('Você não tem permissão para editar esse registro compartilhado.');
    }
  }

  if (!isOwner && existingRecord) {
    if (normalizeUserListKey_(existingSharedUsers) !== normalizeUserListKey_(incomingSharedUsers)) {
      throw new Error('Somente o dono pode gerenciar o compartilhamento.');
    }
    if (String(record.ownerUserId || ownerUserId) !== String(existingRecord.ownerUserId || ownerUserId)) {
      throw new Error('O dono do item não pode ser alterado.');
    }
  }

  const finalSharedUsers = isOwner ? incomingSharedUsers : existingSharedUsers;
  return {
    ...record,
    ownerUserId,
    ownerUserName: String(existingRecord && existingRecord.ownerUserName || record.ownerUserName || session.name || '').trim(),
    ownerLogin: String(existingRecord && existingRecord.ownerLogin || record.ownerLogin || session.login || '').trim(),
    ownerWorkspaceKey: normalizeWorkspaceKey_(existingRecord && existingRecord.ownerWorkspaceKey || record.ownerWorkspaceKey || targetWorkspace),
    sharedUsers: finalSharedUsers,
    sharedUserIds: finalSharedUsers.map((user) => user.id),
    workspaceKey: targetWorkspace,
  };
}
function sha256_(value) {
  const raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  );
  return raw.map((b) => {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function sign_(value) {
  const raw = Utilities.computeHmacSha256Signature(value, AUTH_SECRET, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(raw).replace(/=+$/g, '');
}

function encodeToken_(payloadObj) {
  const json = JSON.stringify(payloadObj);
  const body = Utilities.base64EncodeWebSafe(json).replace(/=+$/g, '');
  const sig = sign_(body);
  return `${body}.${sig}`;
}

function decodeToken_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) throw new Error('Token inválido.');

  const [body, sig] = parts;
  const expected = sign_(body);

  if (sig !== expected) throw new Error('Assinatura do token inválida.');

  const json = Utilities.newBlob(Utilities.base64DecodeWebSafe(body)).getDataAsString();
  const parsed = JSON.parse(json);

  if (!parsed.exp || Date.now() > parsed.exp) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  return parsed;
}

function requireAuth_(payload) {
  const authToken = String((payload && payload.authToken) || '').trim();
  if (!authToken) throw new Error('Autenticação necessária.');

  const session = decodeToken_(authToken);
  if (!session.userId || !session.workspaceKey) {
    throw new Error('Sessão inválida.');
  }

  return session;
}

function requireAdmin_(payload) {
  const session = requireAuth_(payload);
  if (!['owner', 'admin'].includes(String(session.role || ''))) {
    throw new Error('Apenas owner/admin podem executar esta ação.');
  }
  return session;
}

function authSheet_() {
  return ensureSheet_(SHEETS.authUsers, AUTH_HEADERS);
}

function readAuthUsers_() {
  const sheet = authSheet_();
  const values = sheet.getDataRange().getValues();

  return values.slice(1).map((row) => {
    try {
      const parsed = JSON.parse(row[1] || '{}');
      if (!parsed || !parsed.id) return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }).filter(Boolean);
}

function writeAuthUsers_(users) {
  const sheet = authSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, AUTH_HEADERS.length).clearContent();
  }

  const rows = (users || []).map((user) => [
    String(user.id),
    JSON.stringify(user),
    user.updatedAt || nowIso_(),
    'auth_user',
    normalizeWorkspaceKey_(user.workspaceKey)
  ]);

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, AUTH_HEADERS.length).setValues(rows);
  }
}

function findUserByLogin_(login) {
  const normalized = String(login || '').trim().toLowerCase();
  return readAuthUsers_().find((user) => String(user.login || '').toLowerCase() === normalized) || null;
}

function publicUser_(user) {
  return {
    id: user.id,
    name: user.name,
    login: user.login,
    role: user.role,
    workspaceKey: user.workspaceKey,
    createdAt: user.createdAt,
    isActive: user.isActive !== false
  };
}

function ensureDefaultOwner_() {
  const users = readAuthUsers_();
  if (users.length) return;

  const owner = {
    id: 'user_owner_gustavo',
    name: DEFAULT_OWNER_NAME,
    login: DEFAULT_OWNER_LOGIN,
    role: 'owner',
    workspaceKey: DEFAULT_WORKSPACE_KEY,
    passwordHash: sha256_(DEFAULT_OWNER_PASSWORD),
    createdAt: nowIso_(),
    updatedAt: nowIso_(),
    isActive: true
  };

  writeAuthUsers_([owner]);
}

function bootstrapAuth_() {
  const users = readAuthUsers_().filter((user) => user.isActive !== false);

  return {
    ok: true,
    defaultWorkspaceKey: DEFAULT_WORKSPACE_KEY,
    signupEnabled: true,
    defaultOwnerLogin: DEFAULT_OWNER_LOGIN,
    users: users.map(publicUser_)
  };
}

function issueSession_(user) {
  const token = encodeToken_({
    userId: user.id,
    login: user.login,
    name: user.name,
    role: user.role,
    workspaceKey: normalizeWorkspaceKey_(user.workspaceKey),
    exp: Date.now() + TOKEN_TTL_MS
  });

  return {
    token,
    user: publicUser_(user)
  };
}

function login_(payload) {
  const login = String(payload.login || '').trim().toLowerCase();
  const password = String(payload.password || '');

  if (!login || !password) {
    throw new Error('Informe login e senha.');
  }

  const user = findUserByLogin_(login);
  if (!user || user.isActive === false) {
    throw new Error('Usuário não encontrado.');
  }

  if (user.passwordHash !== sha256_(password)) {
    throw new Error('Senha inválida.');
  }

  return {
    ok: true,
    ...issueSession_(user)
  };
}

function signup_(payload) {
  const name = String(payload.name || '').trim();
  const login = String(payload.login || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const requestedWorkspace = String(payload.workspaceKey || '').trim();
  const workspaceKey = normalizeWorkspaceKey_(requestedWorkspace || login);

  if (!name || !login || !password) {
    throw new Error('Preencha nome, login e senha.');
  }

  if (password.length < 4) {
    throw new Error('A senha precisa ter pelo menos 4 caracteres.');
  }

  const users = readAuthUsers_();

  if (users.some((user) => String(user.login || '').toLowerCase() === login)) {
    throw new Error('Esse login já existe.');
  }

  if (users.some((user) => normalizeWorkspaceKey_(user.workspaceKey) === workspaceKey)) {
    throw new Error('Esse identificador de workspace já está em uso. Escolha outro.');
  }

  const newUser = {
    id: `user_${new Date().getTime().toString(36)}`,
    name,
    login,
    role: 'owner',
    workspaceKey,
    passwordHash: sha256_(password),
    createdAt: nowIso_(),
    updatedAt: nowIso_(),
    isActive: true
  };

  users.unshift(newUser);
  writeAuthUsers_(users);

  return {
    ok: true,
    ...issueSession_(newUser)
  };
}

function createUser_(payload) {
  const admin = requireAdmin_(payload);
  const name = String(payload.name || '').trim();
  const login = String(payload.login || '').trim().toLowerCase();
  const password = String(payload.password || '');
  const role = ['owner', 'admin', 'member'].includes(payload.role) ? payload.role : 'member';
  const workspaceKey = normalizeWorkspaceKey_(payload.workspaceKey || admin.workspaceKey);

  if (!name || !login || !password) {
    throw new Error('Preencha nome, login e senha.');
  }

  const users = readAuthUsers_();

  if (users.some((user) => String(user.login || '').toLowerCase() === login)) {
    throw new Error('Esse login já existe.');
  }

  const newUser = {
    id: `user_${new Date().getTime().toString(36)}`,
    name,
    login,
    role,
    workspaceKey,
    passwordHash: sha256_(password),
    createdAt: nowIso_(),
    updatedAt: nowIso_(),
    isActive: true
  };

  users.unshift(newUser);
  writeAuthUsers_(users);

  return {
    ok: true,
    user: publicUser_(newUser)
  };
}

function listUsers_(payload) {
  requireAuth_(payload);
  const users = readAuthUsers_();

  return {
    ok: true,
    users: users
      .filter((user) => user.isActive !== false)
      .map(publicUser_)
  };
}

function syncEntity_(entity, records, session) {
  if (!SHEETS[entity] || entity === 'authUsers') {
    throw new Error('Entidade não suportada: ' + entity);
  }

  const sessionWorkspace = normalizeWorkspaceKey_(session.workspaceKey);
  const entityState = readEntityState_(entity);
  const projectsState = entity === 'projects' ? entityState : readEntityState_('projects');
  const goalsState = entity === 'goals' ? entityState : readEntityState_('goals');
  const indexByIdWorkspace = entityState.indexByKey;
  const recordByKey = entityState.recordByKey;
  const rowsToAppend = [];
  const rowsToDelete = [];

  records.forEach((record) => {
    if (!record || !record.id) {
      throw new Error('Registro inválido sem id em ' + entity);
    }

    let targetWorkspace = normalizeWorkspaceKey_(record.workspaceKey || sessionWorkspace);
    let sanitized = { ...record };
    let existingRecord = recordByKey[getRecordKey_(record.id, targetWorkspace)] || null;

    if ((entity === 'projects' || entity === 'goals') && !existingRecord && !record.workspaceKey) {
      targetWorkspace = sessionWorkspace;
      existingRecord = recordByKey[getRecordKey_(record.id, targetWorkspace)] || null;
    }

    if (entity === 'projects' || entity === 'goals') {
      sanitized = prepareOwnedSharedRecord_(record, existingRecord, session, targetWorkspace);
    } else if (entity === 'projectItems' || entity === 'projectParticipants') {
      const projectId = String(record.projectId || existingRecord && existingRecord.projectId || '');
      const projectRecord = projectsState.recordByKey[getRecordKey_(projectId, targetWorkspace)];
      if (!projectRecord || !canUserAccessProjectRecord_(projectRecord, session)) {
        throw new Error('Você não tem permissão para alterar dados desse projeto compartilhado.');
      }
      sanitized = {
        ...record,
        workspaceKey: targetWorkspace,
      };
    } else if (entity === 'auditLogs') {
      const entityType = String(record.entityType || existingRecord && existingRecord.entityType || '').trim();
      const entityId = String(record.entityId || record.projectId || record.goalId || existingRecord && existingRecord.entityId || '');
      if (entityType === 'project') {
        const projectRecord = projectsState.recordByKey[getRecordKey_(entityId, targetWorkspace)];
        if (!projectRecord || !canUserAccessProjectRecord_(projectRecord, session)) {
          throw new Error('Você não tem permissão para registrar atividade nesse projeto.');
        }
      } else if (entityType === 'goal') {
        const goalRecord = goalsState.recordByKey[getRecordKey_(entityId, targetWorkspace)];
        if (!goalRecord || !canUserAccessGoalRecord_(goalRecord, session)) {
          throw new Error('Você não tem permissão para registrar atividade nessa meta.');
        }
      } else if (targetWorkspace !== sessionWorkspace) {
        throw new Error('Logs remotos só podem ser registrados para projetos ou metas compartilhados.');
      }
      sanitized = {
        ...record,
        workspaceKey: targetWorkspace,
      };
    } else if (targetWorkspace !== sessionWorkspace) {
      throw new Error('Essa entidade não aceita sincronização em outro workspace.');
    } else {
      sanitized = {
        ...record,
        workspaceKey: targetWorkspace,
      };
    }

    const recordId = String(sanitized.id);
    const existingRow = indexByIdWorkspace[getRecordKey_(recordId, targetWorkspace)];

    if (isDeletedRecord_(sanitized)) {
      if (existingRow) {
        rowsToDelete.push(existingRow);
      }
      return;
    }

    const updatedAt = sanitized.updatedAt || sanitized.syncUpdatedAt || nowIso_();
    sanitized.updatedAt = updatedAt;

    const row = [
      recordId,
      JSON.stringify(sanitized),
      updatedAt,
      entity,
      targetWorkspace
    ];

    if (existingRow) {
      entityState.sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
    } else {
      rowsToAppend.push(row);
    }
  });

  if (rowsToDelete.length) {
    rowsToDelete
      .sort((a, b) => b - a)
      .forEach((rowNumber) => entityState.sheet.deleteRow(rowNumber));
  }

  if (rowsToAppend.length) {
    entityState.sheet.getRange(entityState.sheet.getLastRow() + 1, 1, rowsToAppend.length, DEFAULT_HEADERS.length).setValues(rowsToAppend);
  }

  return { ok: true, entity, count: records.length, workspaceKey: sessionWorkspace };
}

function startChunkedSync_(payload) {
  const session = requireAuth_(payload);
  const requestId = String(payload.requestId || '');
  const totalChunks = Number(payload.totalChunks || 0);
  const entity = String(payload.entity || '');

  if (!requestId || !entity || !totalChunks || totalChunks < 1) {
    throw new Error('Parâmetros inválidos para iniciar sincronização em partes.');
  }

  const cache = CacheService.getScriptCache();
  cache.put(
    chunkMetaKey_(requestId),
    JSON.stringify({
      entity,
      totalChunks,
      workspaceKey: normalizeWorkspaceKey_(session.workspaceKey),
      authToken: String(payload.authToken || '')
    }),
    CHUNK_TTL_SECONDS
  );

  return { ok: true, requestId, totalChunks };
}

function storeChunkPart_(payload) {
  requireAuth_(payload);

  const requestId = String(payload.requestId || '');
  const chunkIndex = Number(payload.chunkIndex);
  const totalChunks = Number(payload.totalChunks || 0);
  const chunk = String(payload.chunk || '');

  if (!requestId || Number.isNaN(chunkIndex) || chunkIndex < 0 || !totalChunks) {
    throw new Error('Parte de sincronização inválida.');
  }

  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(chunkMetaKey_(requestId));
  const meta = metaRaw ? JSON.parse(metaRaw) : null;

  cache.put(chunkPartKey_(requestId, chunkIndex), chunk, CHUNK_TTL_SECONDS);

  if (meta) {
    cache.put(chunkMetaKey_(requestId), JSON.stringify(meta), CHUNK_TTL_SECONDS);
  }

  return { ok: true, requestId, chunkIndex };
}

function commitChunkedSync_(payload) {
  const requestId = String(payload.requestId || '');
  if (!requestId) throw new Error('requestId ausente ao finalizar sincronização em partes.');

  const cache = CacheService.getScriptCache();
  const metaRaw = cache.get(chunkMetaKey_(requestId));
  if (!metaRaw) throw new Error('Metadados da sincronização em partes não encontrados ou expirados.');

  const meta = JSON.parse(metaRaw);
  const totalChunks = Number(meta.totalChunks || 0);
  const entity = String(meta.entity || '');

  if (!entity || !totalChunks) {
    throw new Error('Metadados da sincronização em partes inválidos.');
  }

  const authPayload = { authToken: meta.authToken };
  const session = requireAuth_(authPayload);

  const chunks = [];
  for (let index = 0; index < totalChunks; index += 1) {
    const chunkValue = cache.get(chunkPartKey_(requestId, index));
    if (chunkValue === null) {
      throw new Error('Parte da sincronização expirou antes da finalização. Reenvie a operação.');
    }
    chunks.push(chunkValue);
  }

  let records;
  try {
    records = JSON.parse(chunks.join('') || '[]');
  } catch (error) {
    throw new Error('Não foi possível reconstruir os dados enviados em partes.');
  }

  const result = syncEntity_(entity, records, session);
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

function pullAllData_(session) {
  const workspaceKey = normalizeWorkspaceKey_(session.workspaceKey);
  const data = {};
  const skipped = {};

  const projectsState = readEntityState_('projects');
  const goalsState = readEntityState_('goals');
  const accessibleProjectKeys = {};
  const accessibleGoalKeys = {};

  projectsState.rows.forEach((row) => {
    if (!row.parsed || !row.parsed.id || isDeletedRecord_(row.parsed)) return;
    if (canUserAccessProjectRecord_(row.parsed, session)) {
      accessibleProjectKeys[getRecordKey_(row.parsed.id, row.rowWorkspace)] = true;
    }
  });

  goalsState.rows.forEach((row) => {
    if (!row.parsed || !row.parsed.id || isDeletedRecord_(row.parsed)) return;
    if (canUserAccessGoalRecord_(row.parsed, session)) {
      accessibleGoalKeys[getRecordKey_(row.parsed.id, row.rowWorkspace)] = true;
    }
  });

  Object.keys(SHEETS).forEach((entity) => {
    if (entity === 'authUsers') return;

    const entityState = entity === 'projects' ? projectsState : entity === 'goals' ? goalsState : readEntityState_(entity);
    let skippedCount = 0;

    data[entity] = entityState.rows.map((row) => {
      try {
        const parsed = row.parsed;
        if (!parsed || !parsed.id) {
          skippedCount += 1;
          return null;
        }

        const rowWorkspace = row.rowWorkspace;
        if (isDeletedRecord_(parsed)) return null;

        if (entity === 'projects') {
          if (!accessibleProjectKeys[getRecordKey_(parsed.id, rowWorkspace)]) return null;
          return { ...parsed, workspaceKey: rowWorkspace };
        }

        if (entity === 'goals') {
          if (!accessibleGoalKeys[getRecordKey_(parsed.id, rowWorkspace)]) return null;
          return { ...parsed, workspaceKey: rowWorkspace };
        }

        if (entity === 'projectItems' || entity === 'projectParticipants') {
          if (!accessibleProjectKeys[getRecordKey_(parsed.projectId, rowWorkspace)]) return null;
          return { ...parsed, workspaceKey: rowWorkspace };
        }

        if (entity === 'auditLogs') {
          if (parsed.entityType === 'project' && accessibleProjectKeys[getRecordKey_(parsed.entityId || parsed.projectId, rowWorkspace)]) {
            return { ...parsed, workspaceKey: rowWorkspace };
          }
          if (parsed.entityType === 'goal' && accessibleGoalKeys[getRecordKey_(parsed.entityId || parsed.goalId, rowWorkspace)]) {
            return { ...parsed, workspaceKey: rowWorkspace };
          }
          if (rowWorkspace === workspaceKey) {
            return { ...parsed, workspaceKey: rowWorkspace };
          }
          return null;
        }

        if (rowWorkspace !== workspaceKey) return null;
        return { ...parsed, workspaceKey: rowWorkspace };
      } catch (error) {
        skippedCount += 1;
        return null;
      }
    }).filter(Boolean);

    if (skippedCount) skipped[entity] = skippedCount;
  });

  return {
    ok: true,
    data,
    skippedInvalid: skipped,
    workspaceKey
  };
}

function resetAllData_(session) {
  const workspaceKey = normalizeWorkspaceKey_(session.workspaceKey);
  const adminRoles = ['owner', 'admin'];

  if (!adminRoles.includes(String(session.role || ''))) {
    throw new Error('Apenas owner/admin podem limpar dados.');
  }

  Object.keys(SHEETS).forEach((entity) => {
    if (entity === 'authUsers') return;

    const sheet = ensureSheet_(SHEETS[entity], DEFAULT_HEADERS);
    const values = sheet.getDataRange().getValues();
    const rowsToDelete = [];

    for (let i = values.length - 1; i >= 1; i -= 1) {
      const rowWorkspace = normalizeWorkspaceKey_(values[i][4] || DEFAULT_WORKSPACE_KEY);
      if (rowWorkspace === workspaceKey) {
        rowsToDelete.push(i + 1);
      }
    }

    rowsToDelete.forEach((rowNumber) => sheet.deleteRow(rowNumber));
  });

  return {
    ok: true,
    message: `Todos os dados remotos do workspace "${workspaceKey}" foram apagados.`
  };
}


function askFinancialAdvisor_(payload, session) {
  const question = sanitizeText_(payload.question, AI_MAX_QUESTION_LENGTH);
  if (!question) {
    throw new Error('Envie uma pergunta para conversar com a IA.');
  }

  const selectedMonth = String(payload.selectedMonth || toMonthKey_(new Date())).trim() || toMonthKey_(new Date());
  const recentMessages = sanitizeRecentMessages_(payload.recentMessages || []);
  const currentUserName = sanitizeText_(payload.userName || session.name, 80) || 'usuário';
  const pullData = pullAllData_(session);
  const context = buildFinancialAdvisorContext_({
    selectedMonth,
    question,
    data: pullData.data || {}
  });
  const reply = callGroqAdvisor_(question, recentMessages, context, currentUserName);

  return {
    ok: true,
    reply,
    selectedMonth,
    workspaceKey: normalizeWorkspaceKey_(session.workspaceKey),
    contextMeta: context.meta
  };
}

function sanitizeRecentMessages_(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .slice(-AI_MAX_HISTORY_MESSAGES)
    .map((item) => ({
      role: item.role,
      content: sanitizeText_(item.content, AI_MAX_HISTORY_CONTENT)
    }))
    .filter((item) => item.content);
}

function buildFinancialAdvisorContext_(options) {
  const selectedMonth = options.selectedMonth || toMonthKey_(new Date());
  const question = String(options.question || '').toLowerCase();
  const data = options.data || {};

  const accounts = (data.accounts || []).filter(isActiveRecord_);
  const creditCards = (data.creditCards || []).filter(isActiveRecord_);
  const transactions = (data.transactions || []).filter(isActiveRecord_);
  const goals = (data.goals || []).filter(isActiveRecord_);
  const projects = (data.projects || []).filter(isActiveRecord_);
  const investments = (data.investments || []).filter(isActiveRecord_);
  const installmentPlans = (data.installmentPlans || []).filter(isActiveRecord_);
  const preferences = (data.preferences || []).filter(isActiveRecord_);

  const accountBalances = deriveAccountBalancesForContext_(accounts, transactions, selectedMonth);
  const accountBalanceTotal = sumBy_(accountBalances, function (item) {
    return item.derivedBalance || 0;
  });

  const cardsById = creditCards.reduce(function (acc, card) {
    if (card && card.id) acc[card.id] = card;
    return acc;
  }, {});

  const monthTransactions = transactions.filter(function (transaction) {
    return getTransactionCompetenceMonth_(transaction, cardsById) === selectedMonth;
  });

  const monthlyIncome = sumBy_(monthTransactions.filter(function (item) {
    return item.type === 'income';
  }), function (item) {
    return item.amount || 0;
  });

  const monthlyExpense = sumBy_(monthTransactions.filter(function (item) {
    return item.type === 'expense' || item.type === 'card_expense';
  }), function (item) {
    return item.amount || 0;
  });

  const monthlyNet = monthlyIncome - monthlyExpense;

  const recurringRules = preferences.filter(function (item) {
    return item.kind === 'transaction_rule';
  });

  const recurringIncome = sumBy_(recurringRules.filter(function (item) {
    return item.ruleType === 'recurring_income' && !item.isDeleted;
  }), function (item) {
    return item.amount || 0;
  });

  const recurringExpense = sumBy_(recurringRules.filter(function (item) {
    return item.ruleType === 'recurring_expense' && !item.isDeleted;
  }), function (item) {
    return item.amount || 0;
  });

  const openInvoices = buildOpenInvoicesContext_(creditCards, transactions, selectedMonth, cardsById);
  const nextInvoices = buildNextInvoicesContext_(creditCards, transactions, selectedMonth, cardsById);

  const recentPurchases = transactions
    .filter(function (item) {
      return item.type === 'expense' || item.type === 'card_expense';
    })
    .sort(function (a, b) {
      return compareDateDesc_(a.date, b.date);
    })
    .slice(0, 6)
    .map(function (item) {
      return (item.description || item.category || 'Compra') + ' • ' + formatCurrency_(item.amount) + ' • ' + formatDatePt_(item.date);
    });

  const installmentPreview = installmentPlans
    .filter(function (plan) {
      return !plan.isDeleted && Number(plan.remainingInstallments || 0) > 0;
    })
    .sort(function (a, b) {
      return compareDateDesc_(a.purchaseDate, b.purchaseDate);
    })
    .slice(0, 5)
    .map(function (plan) {
      return (plan.description || 'Parcelamento') + ' • ' + (plan.totalInstallments || 0) + 'x • restante ' + (plan.remainingInstallments || 0) + 'x';
    });

  const goalsSummary = goals.slice(0, 4).map(function (goal) {
    const current = Number(goal.currentAmount || 0);
    const target = Number(goal.targetAmount || 0);
    const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    const targetText = target > 0 ? formatCurrency_(target) : 'sem alvo';
    return (goal.name || 'Meta') + ' • ' + formatCurrency_(current) + ' de ' + targetText + ' • ' + formatPercent_(percent);
  });

  const projectSummary = projects.slice(0, 4).map(function (project) {
    return (project.name || 'Projeto') + ' • estimado ' + formatCurrency_(project.totalEstimated || 0) + ' • caixa ' + formatCurrency_(project.cashBalance || 0);
  });

  const investmentSummary = buildInvestmentContext_(investments);
  const topBalances = accountBalances
    .sort(function (a, b) {
      return Number(b.derivedBalance || 0) - Number(a.derivedBalance || 0);
    })
    .slice(0, 4)
    .map(function (account) {
      return (account.name || 'Conta') + ' • ' + formatCurrency_(account.derivedBalance || 0);
    });

  const highlightedAmount = extractQuestionAmount_(question);
  const simulatedNet = highlightedAmount ? monthlyNet - highlightedAmount : null;
  const simulatedBalance = highlightedAmount ? accountBalanceTotal - highlightedAmount : null;

  const sections = [];
  sections.push('Mês de análise: ' + selectedMonth);
  sections.push('Saldo total em contas: ' + formatCurrency_(accountBalanceTotal));
  sections.push('Fluxo do mês: receitas ' + formatCurrency_(monthlyIncome) + ', despesas ' + formatCurrency_(monthlyExpense) + ', líquido ' + formatCurrency_(monthlyNet));

  if (topBalances.length) {
    sections.push('Contas com maior saldo: ' + topBalances.join(' | '));
  }

  if (recurringIncome || recurringExpense) {
    sections.push('Recorrências mensais: entradas ' + formatCurrency_(recurringIncome) + ' e saídas ' + formatCurrency_(recurringExpense));
  }

  if (openInvoices.length) {
    sections.push('Faturas abertas: ' + openInvoices.join(' | '));
  }

  if (nextInvoices.length) {
    sections.push('Próximas faturas: ' + nextInvoices.join(' | '));
  }

  if (shouldIncludePurchaseContext_(question) && recentPurchases.length) {
    sections.push('Compras recentes: ' + recentPurchases.join(' | '));
  }

  if (shouldIncludePurchaseContext_(question) && installmentPreview.length) {
    sections.push('Parcelamentos relevantes: ' + installmentPreview.join(' | '));
  }

  if (goalsSummary.length) {
    sections.push('Metas relevantes: ' + goalsSummary.join(' | '));
  }

  if (projectSummary.length) {
    sections.push('Projetos relevantes: ' + projectSummary.join(' | '));
  }

  if (shouldIncludeInvestmentContext_(question)) {
    sections.push('Investimentos: ' + investmentSummary.summary);
    if (investmentSummary.positions.length) {
      sections.push('Posições principais: ' + investmentSummary.positions.join(' | '));
    }
    if (investmentSummary.allocation.length) {
      sections.push('Distribuição por tipo: ' + investmentSummary.allocation.join(' | '));
    }
  }

  if (highlightedAmount) {
    sections.push('Simulação simples se considerar ' + formatCurrency_(highlightedAmount) + ' agora: líquido do mês ' + formatCurrency_(simulatedNet) + ', saldo em contas ' + formatCurrency_(simulatedBalance));
  }

  return {
    text: sections.join('\n'),
    meta: {
      accounts: accounts.length,
      cards: creditCards.length,
      goals: goals.length,
      projects: projects.length,
      investments: investments.length
    }
  };
}

function isActiveRecord_(record) {
  return !!record && !record.isDeleted;
}

function deriveAccountBalancesForContext_(accounts, transactions, selectedMonth) {
  const scopedTransactions = transactions.filter(function (transaction) {
    if (!transaction || transaction.isDeleted) return false;
    const txMonth = toMonthKey_(transaction.date);
    return !selectedMonth || !txMonth || txMonth <= selectedMonth;
  });

  return accounts.map(function (account) {
    const balance = scopedTransactions.reduce(function (sum, tx) {
      const amount = Number(tx.amount || 0);
      if (tx.type === 'income' && tx.accountId === account.id) return sum + amount;
      if (tx.type === 'expense' && tx.accountId === account.id) return sum - amount;
      if (tx.type === 'adjustment' && tx.accountId === account.id) return sum + amount;
      if (tx.type === 'transfer') {
        if (tx.accountId === account.id) return sum - amount;
        if (tx.destinationAccountId === account.id) return sum + amount;
      }
      return sum;
    }, 0);

    return {
      id: account.id,
      name: account.name,
      derivedBalance: balance
    };
  });
}

function buildOpenInvoicesContext_(cards, transactions, selectedMonth, cardsById) {
  return cards
    .map(function (card) {
      const total = transactions
        .filter(function (tx) {
          return !tx.isDeleted &&
            tx.type === 'card_expense' &&
            tx.cardId === card.id &&
            !tx.isPaid &&
            getTransactionCompetenceMonth_(tx, cardsById) === selectedMonth;
        })
        .reduce(function (sum, tx) { return sum + Number(tx.amount || 0); }, 0);

      if (!total) return null;
      return (card.name || 'Cartão') + ' ' + formatCurrency_(total);
    })
    .filter(Boolean)
    .slice(0, 4);
}

function buildNextInvoicesContext_(cards, transactions, selectedMonth, cardsById) {
  return cards
    .map(function (card) {
      const future = transactions
        .filter(function (tx) {
          const month = getTransactionCompetenceMonth_(tx, cardsById);
          return !tx.isDeleted &&
            tx.type === 'card_expense' &&
            tx.cardId === card.id &&
            !tx.isPaid &&
            month && month > selectedMonth;
        })
        .sort(function (a, b) {
          return String(getTransactionCompetenceMonth_(a, cardsById)).localeCompare(String(getTransactionCompetenceMonth_(b, cardsById)));
        });

      if (!future.length) return null;

      const firstMonth = getTransactionCompetenceMonth_(future[0], cardsById);
      const amount = future
        .filter(function (tx) {
          return getTransactionCompetenceMonth_(tx, cardsById) === firstMonth;
        })
        .reduce(function (sum, tx) { return sum + Number(tx.amount || 0); }, 0);

      return (card.name || 'Cartão') + ' ' + firstMonth + ' ' + formatCurrency_(amount);
    })
    .filter(Boolean)
    .slice(0, 4);
}

function buildInvestmentContext_(investments) {
  const active = investments.filter(isActiveRecord_);
  const positions = active.filter(function (item) {
    return item.kind === 'position' || !item.kind;
  });
  const movements = active.filter(function (item) {
    return item.kind === 'movement';
  });

  const investedCost = sumBy_(positions, function (item) {
    return Number(item.amountInvested || item.costBasis || 0);
  });
  const currentValue = sumBy_(positions, function (item) {
    return Number(item.currentValue || item.amountInvested || 0);
  });
  const cashBalance = movements.reduce(function (sum, item) {
    const amount = Number(item.amount || 0);
    if (item.movementType === 'cash_in' || item.destination === 'broker_cash') return sum + amount;
    if (item.movementType === 'cash_out' || item.movementType === 'buy' || item.movementType === 'fee') return sum - amount;
    return sum;
  }, 0);

  const byType = {};
  positions.forEach(function (item) {
    const key = item.assetType || 'other';
    byType[key] = (byType[key] || 0) + Number(item.currentValue || item.amountInvested || 0);
  });

  const allocation = Object.keys(byType)
    .sort(function (a, b) { return byType[b] - byType[a]; })
    .slice(0, 4)
    .map(function (key) {
      const base = currentValue > 0 ? (byType[key] / currentValue) * 100 : 0;
      return translateAssetType_(key) + ' ' + formatPercent_(base);
    });

  const topPositions = positions
    .slice()
    .sort(function (a, b) { return Number(b.currentValue || 0) - Number(a.currentValue || 0); })
    .slice(0, 5)
    .map(function (item) {
      return (item.ticker || item.name || 'Ativo') + ' ' + formatCurrency_(item.currentValue || item.amountInvested || 0);
    });

  const profitLoss = currentValue - investedCost;

  return {
    summary: 'custo ' + formatCurrency_(investedCost) + ', valor atual ' + formatCurrency_(currentValue) + ', resultado ' + formatCurrency_(profitLoss) + ', caixa em corretoras ' + formatCurrency_(cashBalance),
    positions: topPositions,
    allocation: allocation
  };
}

function translateAssetType_(value) {
  switch (String(value || '').toLowerCase()) {
    case 'stock': return 'Ações';
    case 'etf': return 'ETFs';
    case 'fii': return 'FIIs';
    case 'fixed_income': return 'Renda fixa';
    case 'broker_cash': return 'Caixa';
    default: return 'Outros';
  }
}

function shouldIncludePurchaseContext_(question) {
  return /(compr|gasto|parcel|or[cç]amento|vista|teclado|compr(a|ar)|cart[aã]o|fatura|apert)/i.test(question || '');
}

function shouldIncludeInvestmentContext_(question) {
  return /(invest|aporte|corretora|dividend|provento|ativo|carteira|etf|a[cç][aã]o|fii)/i.test(question || '');
}

function callGroqAdvisor_(question, recentMessages, context, currentUserName) {
  const apiKey = getScriptProperty_('GROQ_API_KEY', '');
  if (!apiKey) {
    throw new Error('A IA não está configurada. Defina GROQ_API_KEY nas Script Properties do Apps Script.');
  }

  const model = getScriptProperty_('GROQ_MODEL', GROQ_DEFAULT_MODEL);
  const apiUrl = getScriptProperty_('GROQ_API_URL', GROQ_DEFAULT_API_URL);
  const maxTokens = Number(getScriptProperty_('GROQ_MAX_TOKENS', '550')) || 550;

  const messages = [
    {
      role: 'system',
      content: 'Você é um assistente de finanças pessoais integrado a um app de gestão financeira. Sua função é ajudar o usuário a refletir melhor sobre compras, orçamento, metas, parcelamentos, fluxo de caixa e planejamento financeiro. Use apenas os dados fornecidos no contexto. Nunca invente números. Seja direto, claro, útil e prudente. Se a compra comprometer orçamento, diga isso claramente. Se houver histórico relevante, mencione. Se existir conflito com metas, explique. Não aja como assessor financeiro regulamentado. Não prometa retornos. Responda em português do Brasil.'
    },
    {
      role: 'system',
      content: 'Usuário atual: ' + currentUserName + '. Contexto financeiro resumido:\n' + context.text
    }
  ];

  recentMessages.forEach(function (item) {
    messages.push({
      role: item.role,
      content: item.content
    });
  });

  messages.push({
    role: 'user',
    content: question
  });

  const payload = {
    model: model,
    temperature: 0.35,
    max_tokens: maxTokens,
    messages: messages
  };

  const response = UrlFetchApp.fetch(apiUrl, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + apiKey
    },
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });

  const status = response.getResponseCode();
  const bodyText = response.getContentText() || '{}';
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch (error) {
    parsed = null;
  }

  if (status < 200 || status >= 300) {
    const apiMessage = parsed && parsed.error && parsed.error.message
      ? parsed.error.message
      : 'Falha ao consultar a API de IA.';
    throw new Error(apiMessage);
  }

  const content = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content
    ? String(parsed.choices[0].message.content).trim()
    : '';

  if (!content) {
    throw new Error('A IA retornou uma resposta vazia.');
  }

  return content;
}

function sanitizeText_(value, maxLength) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength || 500);
}

function extractQuestionAmount_(question) {
  const normalized = String(question || '')
    .replace(/r\$\s*/gi, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  const match = normalized.match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) return 0;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : 0;
}

function sumBy_(items, getter) {
  return (items || []).reduce(function (sum, item) {
    return sum + Number(getter(item) || 0);
  }, 0);
}

function parseDateInput_(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parts = value.split('-').map(Number);
    const parsed = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toMonthKey_(value) {
  const parsed = parseDateInput_(value);
  if (!parsed) return '';
  return parsed.getFullYear() + '-' + pad2_(parsed.getMonth() + 1);
}

function formatDatePt_(value) {
  const parsed = parseDateInput_(value);
  if (!parsed) return 'sem data';
  return pad2_(parsed.getDate()) + '/' + pad2_(parsed.getMonth() + 1) + '/' + parsed.getFullYear();
}

function compareDateDesc_(left, right) {
  const a = parseDateInput_(left);
  const b = parseDateInput_(right);
  const aTime = a ? a.getTime() : 0;
  const bTime = b ? b.getTime() : 0;
  return bTime - aTime;
}

function pad2_(value) {
  return String(value).padStart(2, '0');
}

function getCardBillingMonth_(purchaseDate, closingDay, dueDay) {
  if (!purchaseDate) return '';
  const purchase = parseDateInput_(purchaseDate);
  if (!purchase) return '';

  const closing = Math.min(Math.max(Number(closingDay || 31), 1), 31);
  const due = Math.min(Math.max(Number(dueDay || 1), 1), 31);
  const purchaseDay = purchase.getDate();
  const dueOffset = due > closing ? 0 : 1;
  const closingOffset = purchaseDay > closing ? 1 : 0;
  const monthBase = toMonthKey_(purchase);
  return addMonthsToMonthKey_(monthBase, dueOffset + closingOffset);
}

function addMonthsToMonthKey_(monthKey, offset) {
  if (!monthKey) return '';
  const parts = String(monthKey).split('-').map(Number);
  const parsed = new Date(parts[0], (parts[1] - 1) + Number(offset || 0), 1, 12, 0, 0, 0);
  return parsed.getFullYear() + '-' + pad2_(parsed.getMonth() + 1);
}

function getTransactionCompetenceMonth_(transaction, cardsById) {
  if (!transaction || transaction.isDeleted) return '';
  if (transaction.type === 'card_expense') {
    if (transaction.billingMonth) return transaction.billingMonth;
    const card = cardsById[transaction.cardId] || {};
    return getCardBillingMonth_(transaction.date, card.closingDay, card.dueDay) || toMonthKey_(transaction.date);
  }
  return toMonthKey_(transaction.date);
}

function formatCurrency_(value) {
  const numeric = Number(value || 0);
  const sign = numeric < 0 ? '-' : '';
  const absolute = Math.abs(numeric);
  const fixed = absolute.toFixed(2).split('.');
  fixed[0] = fixed[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return sign + 'R$ ' + fixed[0] + ',' + fixed[1];
}

function formatPercent_(value) {
  const numeric = Number(value || 0);
  return numeric.toFixed(1).replace('.', ',') + '%';
}


function migrateLegacyDataForGustavo() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId_());

  const ENTITY_SHEETS = [
    'accounts',
    'cards',
    'transactions',
    'categories',
    'projects',
    'project_items',
    'project_participants',
    'goals',
    'investments',
    'installment_plans',
    'recurring_rules',
    'audit_logs',
    'settings',
    'sync_meta'
  ];

  const TARGET_WORKSPACE = 'gustavo';
  const NEW_OWNER_USER_ID = 'user_owner_gustavo';
  const LEGACY_USER_IDS = [
    'user_mnjw1x1x',
    'user_mnjz2q1b',
    'user_mnjzud7k'
  ];

  const summary = [];

  ENTITY_SHEETS.forEach((sheetName) => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      summary.push(`${sheetName}: aba não encontrada`);
      return;
    }

    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), 5);

    if (lastRow < 2) {
      summary.push(`${sheetName}: sem dados`);
      return;
    }

    const range = sheet.getRange(1, 1, lastRow, lastCol);
    const values = range.getValues();

    let changed = 0;
    let skippedInvalid = 0;
    let deletedBrokenRows = 0;

    if (!values[0][4]) {
      values[0][4] = 'workspaceKey';
    }

    for (let i = values.length - 1; i >= 1; i--) {
      const row = values[i];
      const rowId = String(row[0] || '').trim();
      const payloadRaw = row[1];
      const updatedAt = row[2];

      if (rowId && !payloadRaw) {
        sheet.deleteRow(i + 1);
        deletedBrokenRows++;
        continue;
      }

      if (!payloadRaw) {
        continue;
      }

      let payload;
      try {
        payload = JSON.parse(payloadRaw);
      } catch (error) {
        skippedInvalid++;
        continue;
      }

      if (!payload || typeof payload !== 'object') {
        skippedInvalid++;
        continue;
      }

      payload.workspaceKey = TARGET_WORKSPACE;
      row[4] = TARGET_WORKSPACE;

      if (!payload.updatedAt && updatedAt) {
        payload.updatedAt = updatedAt;
      }

      if (payload.ownerUserId && LEGACY_USER_IDS.includes(String(payload.ownerUserId))) {
        payload.ownerUserId = NEW_OWNER_USER_ID;
      }

      if (
        payload.contributorType === 'user' &&
        payload.contributorId &&
        LEGACY_USER_IDS.includes(String(payload.contributorId))
      ) {
        payload.contributorId = NEW_OWNER_USER_ID;
        if (!payload.contributorName) {
          payload.contributorName = 'Gustavo';
        }
      }

      if (Array.isArray(payload.contributions)) {
        payload.contributions = payload.contributions.map((entry) => {
          const cloned = { ...entry, workspaceKey: TARGET_WORKSPACE };
          if (
            cloned.contributorType === 'user' &&
            LEGACY_USER_IDS.includes(String(cloned.contributorId || ''))
          ) {
            cloned.contributorId = NEW_OWNER_USER_ID;
            if (!cloned.contributorName) cloned.contributorName = 'Gustavo';
          }
          return cloned;
        });
      }

      if (Array.isArray(payload.items)) {
        payload.items = payload.items.map((item) => ({
          ...item,
          workspaceKey: TARGET_WORKSPACE
        }));
      }

      if (Array.isArray(payload.participants)) {
        payload.participants = payload.participants.map((participant) => ({
          ...participant,
          workspaceKey: TARGET_WORKSPACE
        }));
      }

      row[1] = JSON.stringify(payload);
      values[i] = row;
      changed++;
    }

    const newLastRow = sheet.getLastRow();
    const newLastCol = Math.max(sheet.getLastColumn(), 5);

    if (newLastRow >= 1) {
      const freshValues = sheet.getRange(1, 1, newLastRow, newLastCol).getValues();

      if (!freshValues[0][4]) {
        freshValues[0][4] = 'workspaceKey';
      }

      for (let i = 1; i < freshValues.length; i++) {
        const payloadRaw = freshValues[i][1];
        if (!payloadRaw) continue;

        try {
          const payload = JSON.parse(payloadRaw);
          if (!payload || typeof payload !== 'object') continue;

          payload.workspaceKey = TARGET_WORKSPACE;
          freshValues[i][1] = JSON.stringify(payload);
          freshValues[i][4] = TARGET_WORKSPACE;
        } catch (e) {}
      }

      sheet.getRange(1, 1, freshValues.length, freshValues[0].length).setValues(freshValues);
    }

    summary.push(
      `${sheetName}: ${changed} ajustados, ${deletedBrokenRows} linhas quebradas removidas, ${skippedInvalid} inválidos ignorados`
    );
  });

  Logger.log(summary.join('\n'));
  return summary;
}
