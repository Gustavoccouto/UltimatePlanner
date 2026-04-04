import { navigate } from './router.js';
import { state } from './state.js';
import { monthLabel } from './utils/dates.js';
import { getCurrentUser } from './modules/onboarding.js';

const navItems = [
  ['dashboard', 'fa-chart-line', 'Dashboard'],
  ['accounts', 'fa-building-columns', 'Contas'],
  ['transactions', 'fa-arrow-right-arrow-left', 'Transações'],
  ['cards', 'fa-credit-card', 'Cartões'],
  ['projects', 'fa-briefcase', 'Projetos'],
  ['goals', 'fa-bullseye', 'Metas'],
  ['investments', 'fa-chart-pie', 'Investimentos'],
  ['reports', 'fa-chart-column', 'Relatórios'],
  ['integrity', 'fa-shield-halved', 'Integridade'],
  ['settings', 'fa-gear', 'Configurações'],
];

export function renderShell() {
  renderSidebar();
  renderTopbar();
  renderMobileNav();
  renderMobileDrawer();
}

export function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  const currentUser = getCurrentUser();
  sidebar.innerHTML = `
    <div class="h-full flex flex-col p-5">
      <div class="mb-8">
        <div class="brand-chip">UltimatePlanner</div>
        <div class="mt-5 flex items-center justify-between gap-4">
          <div>
            <div class="text-[11px] uppercase tracking-[0.28em] text-slate-400">Finance workspace</div>
            <div class="text-[1.9rem] leading-none tracking-tight font-extrabold mt-2">Premium Personal Hub</div>
          </div>
          <div class="logo-mark"><i class="fa-solid fa-layer-group"></i></div>
        </div>
      </div>

      <div class="card p-4 mb-5 surface-soft">
        <div class="text-xs uppercase tracking-[0.2em] text-slate-400">Perfil ativo</div>
        <div class="flex items-center gap-3 mt-3">
          <span class="user-pick-avatar">${(currentUser?.name || 'U').slice(0,1).toUpperCase()}</span>
          <div>
            <div class="font-bold text-slate-900">${currentUser?.name || 'Sem perfil'}</div>
            <button id="open-onboarding-btn" class="text-sm text-emerald-600 font-semibold mt-0.5">trocar perfil</button>
          </div>
        </div>
      </div>

      <nav class="space-y-2 flex-1">
        ${navItems.map(navButton).join('')}
      </nav>

      <div class="card card-glass p-4 mt-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-sm text-slate-500">Integração</div>
            <div class="text-lg font-bold mt-1">${state.ui.integrationLabel || (state.ui.offline ? 'Modo offline' : 'Aguardando sync')}</div>
          </div>
          <span class="badge ${state.ui.offline ? 'badge-warning' : state.ui.integrationStatus === 'error' ? 'badge-danger' : 'badge-success'}">${state.ui.offline ? 'offline' : state.ui.integrationStatus || 'online'}</span>
        </div>
      </div>
    </div>`;

  bindNav(sidebar);
}

export function renderTopbar() {
  const topbar = document.getElementById('topbar');
  const currentUser = getCurrentUser();
  topbar.innerHTML = `
    <div class="h-full flex items-center gap-4 px-4 lg:px-6 py-4">
      <button id="mobile-menu-btn" class="lg:hidden action-btn h-11 w-11 !p-0 flex items-center justify-center"><i class="fa-solid fa-bars"></i></button>
      <div class="search-shell">
        <i class="fa-solid fa-magnifying-glass text-slate-400"></i>
        <input id="global-search-input" class="w-full bg-transparent outline-none" placeholder="Buscar em contas, transações, cartões, metas e projetos" value="${state.ui.query || ''}" />
      </div>
      <div class="topbar-month-filter">
        <span class="text-slate-400 text-xs">Mês</span>
        <input id="global-month-picker" type="month" value="${state.ui.selectedMonth}" class="month-field" />
      </div>
      <div class="hidden md:flex items-center gap-3">
        <div class="mini-stat"><span class="text-slate-400">Perfil</span><strong>${currentUser?.name || '—'}</strong></div>
        <div class="mini-stat"><span class="text-slate-400">Sync</span><strong>${state.ui.syncing ? 'Sincronizando' : state.ui.offline ? 'Offline' : 'Estável'}</strong></div>
        <div class="mini-stat"><span class="text-slate-400">Apps Script</span><strong>${state.ui.integrationStatus === 'error' ? 'Falha' : 'Conectado'}</strong></div>
      </div>
    </div>`;
}

export function renderMobileNav() {
  let mobileNav = document.querySelector('.mobile-nav');
  if (!mobileNav) {
    mobileNav = document.createElement('div');
    mobileNav.className = 'mobile-nav lg:hidden';
    document.body.appendChild(mobileNav);
  }

  mobileNav.innerHTML = `
    <div class="grid grid-cols-5 gap-1 text-center text-[11px]">
      ${navItems.slice(0, 4).map(([route, icon, label]) => `
        <button data-route="${route}" class="rounded-2xl px-2 py-2 ${state.route === route ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500'}">
          <i class="fa-solid ${icon} block mb-1"></i>${label}
        </button>`).join('')}
      <button id="mobile-more-btn" class="rounded-2xl px-2 py-2 text-slate-500"><i class="fa-solid fa-ellipsis block mb-1"></i>Mais</button>
    </div>`;

  bindNav(mobileNav);
  mobileNav.querySelector('#mobile-more-btn')?.addEventListener('click', openMobileDrawer);
}

export function renderMobileDrawer() {
  let drawer = document.getElementById('mobile-drawer');
  if (!drawer) {
    drawer = document.createElement('div');
    drawer.id = 'mobile-drawer';
    drawer.className = 'mobile-drawer';
    document.body.appendChild(drawer);
  }

  drawer.innerHTML = `
    <div class="mobile-drawer-backdrop"></div>
    <div class="mobile-drawer-panel">
      <div class="flex items-center justify-between mb-4">
        <div>
          <div class="text-sm text-slate-500">Navegação</div>
          <div class="text-xl font-bold">Mais módulos</div>
        </div>
        <button id="close-mobile-drawer" class="action-btn h-10 w-10 !p-0"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="grid grid-cols-2 gap-2">${navItems.map(navDrawerButton).join('')}</div>
    </div>`;

  drawer.querySelector('.mobile-drawer-backdrop')?.addEventListener('click', closeMobileDrawer);
  drawer.querySelector('#close-mobile-drawer')?.addEventListener('click', closeMobileDrawer);
  bindNav(drawer, true);
}

function bindNav(root, closeOnClick = false) {
  root.querySelectorAll('[data-route]').forEach((button) => {
    button.addEventListener('click', () => {
      navigate(button.dataset.route);
      if (closeOnClick) closeMobileDrawer();
    });
  });
}

function navButton([route, icon, label]) {
  return `
    <button data-route="${route}" class="nav-btn w-full flex items-center gap-3 px-4 py-3 rounded-2xl ${state.route === route ? 'nav-btn-active' : 'text-slate-600 hover:bg-white'}">
      <i class="fa-solid ${icon} w-5"></i>
      <span class="font-semibold">${label}</span>
    </button>`;
}

function navDrawerButton([route, icon, label]) {
  return `
    <button data-route="${route}" class="drawer-nav-btn ${state.route === route ? 'drawer-nav-btn-active' : ''}">
      <i class="fa-solid ${icon}"></i>
      <span>${label}</span>
    </button>`;
}

export function openMobileDrawer() {
  document.body.classList.add('drawer-open');
  document.getElementById('mobile-drawer')?.classList.add('is-open');
}

export function closeMobileDrawer() {
  document.body.classList.remove('drawer-open');
  document.getElementById('mobile-drawer')?.classList.remove('is-open');
}

export function openModal(content) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal-panel">${content}</div></div>`;
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  });
}

export function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

export function confirmDialog({ title, message, confirmText = 'Confirmar', tone = 'danger', onConfirm }) {
  openModal(`
    <div class="space-y-5">
      <div>
        <div class="text-2xl font-bold">${title}</div>
        <p class="text-slate-500 mt-2">${message}</p>
      </div>
      <div class="flex justify-end gap-3">
        <button id="confirm-cancel-btn" class="action-btn">Cancelar</button>
        <button id="confirm-accept-btn" class="action-btn ${tone === 'danger' ? 'action-btn-danger' : 'action-btn-primary'}">${confirmText}</button>
      </div>
    </div>`);

  document.getElementById('confirm-cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('confirm-accept-btn')?.addEventListener('click', async () => {
    try {
      await onConfirm?.();
    } finally {
      closeModal();
    }
  });
}

export function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="font-semibold mb-1">${type === 'error' ? 'Erro' : type === 'success' ? 'Sucesso' : 'Aviso'}</div><div class="text-sm text-slate-200">${message}</div>`;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function pageHeader(title, subtitle, actions = '') {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">${title}</h1>
        <p class="page-subtitle">${subtitle}</p>
      </div>
      <div class="flex items-center gap-3 flex-wrap justify-end">${actions}</div>
    </div>`;
}
