import {
  APP_CONFIG,
  getAppsScriptUrl,
  getAuthSession,
  isValidAppsScriptUrl,
  normalizeAppsScriptUrl
} from '../config.js';

function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    query.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  });

  return query.toString();
}

function jsonpRequest(url) {
  return new Promise((resolve, reject) => {
    const callbackName = `ultimateplanner_jsonp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const script = document.createElement('script');

    const cleanup = () => {
      try {
        delete window[callbackName];
      } catch {}
      script.remove();
    };

    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Tempo esgotado ao conectar com o Google Apps Script. No celular, isso costuma acontecer quando a sincronização envia dados grandes demais de uma vez.'));
    }, APP_CONFIG.jsonpTimeoutMs);

    window[callbackName] = (data) => {
      window.clearTimeout(timeout);
      cleanup();
      resolve(data);
    };

    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeout);
      cleanup();
      reject(new Error('Não foi possível carregar o Web App do Google Apps Script. Verifique se a URL termina em /exec, se o deploy está público e se a URL salva no dispositivo é a mais recente.'));
    };

    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

export async function apiRequest(action, payload = {}, { skipAuth = false } = {}) {
  const endpoint = normalizeAppsScriptUrl(getAppsScriptUrl());

  if (!endpoint) throw new Error('URL do Google Apps Script não configurada.');
  if (!isValidAppsScriptUrl(endpoint)) {
    throw new Error('A URL do Google Apps Script está inválida. Ela precisa terminar em /exec.');
  }

  const session = getAuthSession();
  const fullPayload = {
    ...payload,
    authToken: skipAuth ? undefined : session?.token
  };

  let data;

  try {
    data = await jsonpRequest(`${endpoint}?${buildQuery({ action, payload: fullPayload })}`);
  } catch (error) {
    throw new Error(`${error.message} O app usa JSONP para evitar CORS no GitHub Pages e no localhost.`);
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Resposta inválida da integração.');
  }

  if (!data.ok) {
    const message = String(data.message || 'Erro na integração.');

    if (message.includes('SPREADSHEET_ID')) {
      throw new Error('O Code.gs foi publicado sem o ID real da planilha. Cole o ID e faça um novo deploy.');
    }

    throw new Error(message);
  }

  return data;
}
