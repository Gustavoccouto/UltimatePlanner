export const DEFAULT_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwu1ffq33WzwQAWtH8BEImjKHFWRk75vQ32tq9ZHwYYKt4otgOHrlUQSPZvnmzIAriB/exec';

export const APP_CONFIG = {
  appName: 'UltimatePlanner',
  dbName: 'ultimateplanner_local_db',
  dbVersion: 3,
  defaultCurrency: 'BRL',
  syncIntervalMs: 15000,
  maxSyncBatchSize: 25,
  defaultAppsScriptUrl: DEFAULT_APPS_SCRIPT_URL,
  jsonpTimeoutMs: 25000,
  syncChunkSize: 900,
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
  return normalizeAppsScriptUrl(localStorage.getItem('ultimateplanner_apps_script_url') || DEFAULT_APPS_SCRIPT_URL);
}

export function isValidAppsScriptUrl(url = '') {
  return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/i.test(normalizeAppsScriptUrl(url));
}
