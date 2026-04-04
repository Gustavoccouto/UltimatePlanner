import {
  DEFAULT_APPS_SCRIPT_URL,
  STORAGE_KEYS,
  clearAuthSession,
  getAuthSession,
  setAppsScriptUrl,
  setAuthSession
} from '../config.js';
import { resetDbConnection } from '../services/storage.js';
import { SheetsService } from '../services/sheets.js';
import { closeModal, openModal, toast } from '../ui.js';

export function ensureDefaultUrl() {
  if (!localStorage.getItem(STORAGE_KEYS.appsScriptUrl)) {
    localStorage.setItem(STORAGE_KEYS.appsScriptUrl, DEFAULT_APPS_SCRIPT_URL);
  }
}

export function getCurrentUser() {
  return getAuthSession()?.user || null;
}

export function logoutCurrentUser() {
  clearAuthSession();
  resetDbConnection();
}

function getInitial(name = '') {
  return (String(name || 'U').trim().slice(0, 1) || 'U').toUpperCase();
}

function userCard(user) {
  return `
    <button class="user-pick-card" data-login-card="${user.login}">
      <span class="user-pick-avatar">${getInitial(user.name)}</span>
      <span style="display:flex; flex-direction:column; gap:2px;">
        <strong style="font-size:.95rem; color:#0f172a;">${user.name}</strong>
        <span style="font-size:.78rem; color:#64748b;">@${user.login}</span>
        <span style="font-size:.72rem; color:#94a3b8;">${user.workspaceKey}</span>
      </span>
    </button>
  `;
}

function buildAccessQuickList(users = []) {
  if (!users.length) {
    return `
      <div class="card" style="padding:16px; border-style:dashed; color:#64748b;">
        Nenhum perfil ainda. Entre com o Gustavo ou crie uma nova conta ao lado para começar.
      </div>
    `;
  }

  return `
    <div style="display:grid; gap:12px;">
      ${users.map(userCard).join('')}
    </div>
  `;
}

export async function openOnboardingModal(onComplete = () => {}) {
  ensureDefaultUrl();

  let bootstrap;
  try {
    bootstrap = await SheetsService.bootstrapAuth();
  } catch (error) {
    openModal(`
      <div class="modal-panel">
        <div class="card card-glass" style="padding:24px;">
          <div class="badge badge-danger" style="margin-bottom:12px;">Falha</div>
          <h3 style="margin:0 0 8px; color:#0f172a;">Falha ao preparar login</h3>
          <p style="margin:0; color:#64748b;">${error.message}</p>
        </div>
      </div>
    `);
    return;
  }

  const users = Array.isArray(bootstrap.users) ? bootstrap.users : [];
  const ownerLogin = bootstrap.defaultOwnerLogin || 'gustavo';
  const currentUrl = localStorage.getItem(STORAGE_KEYS.appsScriptUrl) || DEFAULT_APPS_SCRIPT_URL;

  openModal(`
    <div class="modal-panel">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:18px;">
        <div>
          <div class="badge badge-muted" style="margin-bottom:10px;">Início rápido</div>
          <h2 style="margin:0; font-size:1.55rem; line-height:1.15; color:#0f172a;">
            Escolha seu perfil e confirme a integração
          </h2>
          <p style="margin:10px 0 0; color:#64748b; max-width:720px;">
            Entre com sua conta ou crie uma nova para gerenciar seu próprio financeiro.
            A URL padrão já vem preenchida.
          </p>
        </div>

        <div
          aria-hidden="true"
          style="
            width:54px;
            height:54px;
            border-radius:18px;
            background:linear-gradient(135deg, rgba(16,185,129,.16), rgba(255,255,255,.95));
            border:1px solid rgba(255,255,255,.9);
            box-shadow:0 14px 34px rgba(15,23,42,.08);
            flex:0 0 auto;
          "
        ></div>
      </div>

      <div style="display:grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, .95fr); gap:18px;">
        <section class="card" style="padding:18px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px;">
            <h3 style="margin:0; font-size:1rem; color:#0f172a;">Perfis</h3>
            <span class="badge badge-muted">${users.length} salvo(s)</span>
          </div>

          ${buildAccessQuickList(users)}

          <div style="margin-top:16px; display:grid; gap:12px;">
            <label style="display:grid; gap:6px;">
              <span style="font-size:.82rem; font-weight:700; color:#475569;">URL do Google Apps Script</span>
              <input
                id="onboarding-url"
                class="field"
                value="${currentUrl}"
                placeholder="https://script.google.com/macros/s/.../exec"
              />
            </label>

            <button id="quick-gustavo-btn" class="action-btn">
              Preencher login do Gustavo
            </button>
          </div>
        </section>

        <section style="display:grid; gap:18px;">
          <div class="card" style="padding:18px;">
            <h3 style="margin:0 0 6px; font-size:1rem; color:#0f172a;">Entrar</h3>
            <p style="margin:0 0 14px; color:#64748b; font-size:.9rem;">
              Entre e continue de onde parou.
            </p>

            <div style="display:grid; gap:12px;">
              <label style="display:grid; gap:6px;">
                <span style="font-size:.82rem; font-weight:700; color:#475569;">Login</span>
                <input
                  id="login-user"
                  class="field"
                  placeholder="Ex.: ${ownerLogin}"
                  autocomplete="username"
                />
              </label>

              <label style="display:grid; gap:6px;">
                <span style="font-size:.82rem; font-weight:700; color:#475569;">Senha</span>
                <input
                  id="login-password"
                  class="field"
                  type="password"
                  placeholder="Sua senha"
                  autocomplete="current-password"
                />
              </label>

              <button id="login-btn" class="action-btn action-btn-primary">
                Entrar e manter conectado
              </button>
            </div>
          </div>

          <div class="card" style="padding:18px;">
            <h3 style="margin:0 0 6px; font-size:1rem; color:#0f172a;">Nova conta</h3>
            <p style="margin:0 0 14px; color:#64748b; font-size:.9rem;">
              Crie sua conta e seu próprio workspace para gerenciar seu financeiro separadamente.
            </p>

            <div style="display:grid; gap:12px;">
              <label style="display:grid; gap:6px;">
                <span style="font-size:.82rem; font-weight:700; color:#475569;">Seu nome</span>
                <input
                  id="signup-name"
                  class="field"
                  placeholder="Ex.: João"
                  autocomplete="name"
                />
              </label>

              <label style="display:grid; gap:6px;">
                <span style="font-size:.82rem; font-weight:700; color:#475569;">Login</span>
                <input
                  id="signup-login"
                  class="field"
                  placeholder="Ex.: isa"
                  autocomplete="username"
                />
              </label>

              <label style="display:grid; gap:6px;">
                <span style="font-size:.82rem; font-weight:700; color:#475569;">Senha</span>
                <input
                  id="signup-password"
                  class="field"
                  type="password"
                  placeholder="Crie sua senha"
                  autocomplete="new-password"
                />
              </label>

              <label style="display:grid; gap:6px;">
                <span style="font-size:.82rem; font-weight:700; color:#475569;">Workspace</span>
                <input
                  id="signup-workspace"
                  class="field"
                  placeholder="Ex.: isa, camilly, financeiro-casa"
                />
              </label>

              <button id="signup-btn" class="action-btn action-btn-primary">
                Criar conta e entrar
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  `);

  document.querySelectorAll('[data-login-card]').forEach((button) => {
    button.addEventListener('click', () => {
      const loginInput = document.getElementById('login-user');
      const passwordInput = document.getElementById('login-password');

      if (loginInput) loginInput.value = button.dataset.loginCard || '';
      passwordInput?.focus();
    });
  });

  document.getElementById('quick-gustavo-btn')?.addEventListener('click', () => {
    const loginInput = document.getElementById('login-user');
    const passwordInput = document.getElementById('login-password');

    if (loginInput) loginInput.value = ownerLogin;
    passwordInput?.focus();
  });

  document.getElementById('login-btn')?.addEventListener('click', async () => {
    try {
      const url = document.getElementById('onboarding-url')?.value?.trim() || DEFAULT_APPS_SCRIPT_URL;
      const login = document.getElementById('login-user')?.value?.trim();
      const password = document.getElementById('login-password')?.value || '';

      if (!login || !password) {
        toast('Informe login e senha.', 'error');
        return;
      }

      setAppsScriptUrl(url);

      const result = await SheetsService.login(login, password);

      setAuthSession({
        token: result.token,
        user: result.user
      });

      resetDbConnection();
      closeModal();
      toast(`Bem-vindo, ${result.user.name}.`, 'success');
      onComplete(result.user);
    } catch (error) {
      toast(error.message, 'error');
    }
  });

  document.getElementById('signup-btn')?.addEventListener('click', async () => {
    try {
      const url = document.getElementById('onboarding-url')?.value?.trim() || DEFAULT_APPS_SCRIPT_URL;
      const name = document.getElementById('signup-name')?.value?.trim();
      const login = document.getElementById('signup-login')?.value?.trim();
      const password = document.getElementById('signup-password')?.value || '';
      const workspaceKey = document.getElementById('signup-workspace')?.value?.trim() || login;

      if (!name || !login || !password) {
        toast('Preencha nome, login e senha.', 'error');
        return;
      }

      setAppsScriptUrl(url);

      const result = await SheetsService.signup({
        name,
        login,
        password,
        workspaceKey
      });

      setAuthSession({
        token: result.token,
        user: result.user
      });

      resetDbConnection();
      closeModal();
      toast(`Conta criada com sucesso. Bem-vindo, ${result.user.name}.`, 'success');
      onComplete(result.user);
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}