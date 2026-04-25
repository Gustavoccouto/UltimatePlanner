export const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwu1ffq33WzwQAWtH8BEImjKHFWRk75vQ32tq9ZHwYYKt4otgOHrlUQSPZvnmzIAriB/exec';

export const STORAGE_KEYS = {
  appsScriptUrl: 'wiseplan_apps_script_url',
  authSession: 'ultimateplanner_auth_session',
};

export const APP_CONFIG = {
  appName: 'UltimatePlanner',
  dbName: 'ultimateplanner_local_db',
  dbVersion: 4,
  defaultCurrency: 'BRL',
  syncIntervalMs: 15000,
  maxSyncBatchSize: 25,
  defaultAppsScriptUrl: DEFAULT_APPS_SCRIPT_URL,
  jsonpTimeoutMs: 25000,
  syncChunkSize: 900,
  aiMaxQuestionLength: 600,
  aiRecentMessages: 6,
};

export const ENTITY_STORES = [
  'accounts',
  'creditCards',
  'transactions',
  'categories',
  'projects',
  'projectItems',
  'projectParticipants',
  'goals',
  'investments',
  'installmentPlans',
  'auditLogs',
  'preferences',
  'syncQueue',
  'syncErrors',
  'meta'
];

export function normalizeAppsScriptUrl(url = '') {
  return String(url || '').trim().replace(/\/+$/, '');
}

export function getAppsScriptUrl() {
  return normalizeAppsScriptUrl(localStorage.getItem(STORAGE_KEYS.appsScriptUrl) || DEFAULT_APPS_SCRIPT_URL);
}

export function setAppsScriptUrl(url) {
  localStorage.setItem(STORAGE_KEYS.appsScriptUrl, normalizeAppsScriptUrl(url || DEFAULT_APPS_SCRIPT_URL));
}

export function isValidAppsScriptUrl(url = '') {
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/i.test(normalizeAppsScriptUrl(url));
}

export function getAuthSession() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.authSession) || 'null');
  } catch {
    return null;
  }
}

export function setAuthSession(session) {
  localStorage.setItem(STORAGE_KEYS.authSession, JSON.stringify(session));
}

export function clearAuthSession() {
  localStorage.removeItem(STORAGE_KEYS.authSession);
}

export function getWorkspaceKey() {
  return getAuthSession()?.user?.workspaceKey || 'guest';
}
