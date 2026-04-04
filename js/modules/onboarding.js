import { DEFAULT_APPS_SCRIPT_URL } from '../config.js';
import { closeModal, openModal, toast } from '../ui.js';

const USERS_KEY = 'wiseplan_users';
const CURRENT_USER_KEY = 'wiseplan_current_user';

export function getUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function getCurrentUser() {
  const currentId = localStorage.getItem(CURRENT_USER_KEY);
  return getUsers().find((user) => user.id === currentId) || null;
}

export function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function setCurrentUser(userId) {
  localStorage.setItem(CURRENT_USER_KEY, userId);
}

export function ensureDefaultUrl() {
  if (!localStorage.getItem('wiseplan_apps_script_url')) {
    localStorage.setItem('wiseplan_apps_script_url', DEFAULT_APPS_SCRIPT_URL);
  }
}

function userCard(user) {
  return `
    <button class="user-pick-card" data-user-id="${user.id}">
      <span class="user-pick-avatar">${(user.name || 'U').slice(0,1).toUpperCase()}</span>
      <span>
        <strong class="block text-slate-900">${user.name}</strong>
        <span class="text-xs text-slate-500">Usar perfil existente</span>
      </span>
    </button>`;
}

export function openOnboardingModal(onComplete = () => {}) {
  ensureDefaultUrl();
  const users = getUsers();

  openModal(`
    <div class="space-y-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="eyebrow">Início rápido</div>
          <h2 class="text-2xl font-extrabold tracking-tight">Escolha seu perfil e confirme a integração</h2>
          <p class="text-slate-500 mt-2">A URL padrão já vem preenchida. Você só seleciona o usuário, ou cria um novo, e entra no app.</p>
        </div>
        <div class="glass-orb"></div>
      </div>

      <div class="grid lg:grid-cols-[1.15fr_.85fr] gap-5">
        <section class="card p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold">Perfis</h3>
            <span class="badge badge-muted">${users.length} salvo(s)</span>
          </div>
          <div class="space-y-3 ${users.length ? '' : 'hidden'}" id="existing-users-list">
            ${users.map(userCard).join('')}
          </div>
          <div id="empty-users-state" class="${users.length ? 'hidden' : ''} text-sm text-slate-500 rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-5">Nenhum perfil ainda. Crie seu nome ao lado para começar.</div>
        </section>

        <section class="card card-glass p-5">
          <div class="mb-4">
            <h3 class="text-lg font-bold">Novo perfil</h3>
            <p class="text-sm text-slate-500 mt-1">Seu nome aparece nos projetos, aportes e resumo geral.</p>
          </div>
          <div class="space-y-4">
            <div>
              <label class="text-sm font-semibold block mb-2">Seu nome</label>
              <input id="onboarding-user-name" class="field" placeholder="Ex.: João" />
            </div>
            <div>
              <label class="text-sm font-semibold block mb-2">URL do Google Apps Script</label>
              <input id="onboarding-url" class="field" value="${localStorage.getItem('wiseplan_apps_script_url') || DEFAULT_APPS_SCRIPT_URL}" />
            </div>
            <button id="create-user-btn" class="action-btn action-btn-primary w-full">Criar e entrar</button>
          </div>
        </section>
      </div>
    </div>
  `);

  document.querySelectorAll('[data-user-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const user = users.find((item) => item.id === button.dataset.userId);
      const url = document.getElementById('onboarding-url')?.value?.trim() || DEFAULT_APPS_SCRIPT_URL;
      localStorage.setItem('wiseplan_apps_script_url', url);
      setCurrentUser(user.id);
      closeModal();
      toast(`Bem-vindo de volta, ${user.name}.`, 'success');
      onComplete(user);
    });
  });

  document.getElementById('create-user-btn')?.addEventListener('click', () => {
    const name = document.getElementById('onboarding-user-name')?.value?.trim();
    const url = document.getElementById('onboarding-url')?.value?.trim() || DEFAULT_APPS_SCRIPT_URL;

    if (!name) {
      toast('Informe seu nome para criar o perfil.', 'error');
      return;
    }

    const user = {
      id: `user_${Date.now().toString(36)}`,
      name,
      createdAt: new Date().toISOString()
    };

    saveUsers([user, ...users]);
    setCurrentUser(user.id);
    localStorage.setItem('wiseplan_apps_script_url', url);
    closeModal();
    toast(`Perfil ${name} criado com sucesso.`, 'success');
    onComplete(user);
  });
}
