import { initRouter, navigate } from './router.js';
import { subscribe, state, loadState, patchUi, setSelectedMonth } from './state.js';
import { renderShell, renderTopbar, toast, openMobileDrawer } from './ui.js';
import { renderDashboard, mountDashboardCharts } from './modules/dashboard.js';
import { renderAccounts, bindAccountsEvents } from './modules/accounts.js';
import { renderTransactions, bindTransactionsEvents } from './modules/transactions.js';
import { renderCards, bindCardsEvents } from './modules/cards.js';
import { renderProjects, bindProjectsEvents } from './modules/projects.js';
import { renderGoals, bindGoalsEvents } from './modules/goals.js';
import { renderInvestments, bindInvestmentsEvents } from './modules/investments.js';
import { renderReports, mountReportCharts } from './modules/reports.js';
import { renderSettings, bindSettingsEvents } from './modules/settings.js';
import { renderIntegrity, bindIntegrityEvents } from './modules/integrity.js';
import { renderSearch, bindSearchEvents } from './modules/search.js';
import { processSyncQueue, hasPendingSync, pullRemoteIntoLocal } from './services/sync.js';
import { SheetsService } from './services/sheets.js';
import { seedDemoData } from './seed.js';
import { ensureDefaultUrl, getCurrentUser, openOnboardingModal } from './modules/onboarding.js';
import { APP_CONFIG } from './config.js';

const viewRoot = document.getElementById('view-root');

const routeMap = {
  dashboard: renderDashboard,
  accounts: renderAccounts,
  transactions: renderTransactions,
  cards: renderCards,
  projects: renderProjects,
  goals: renderGoals,
  investments: renderInvestments,
  reports: renderReports,
  settings: renderSettings,
  integrity: renderIntegrity,
  search: renderSearch,
};

function renderApp() {
  renderShell();
  renderTopbar();
  const renderer = routeMap[state.route] || renderDashboard;
  viewRoot.innerHTML = state.ui.loading ? loadingView() : renderer();
  bindViewEvents();
  if (!state.ui.loading) {
    if (state.route === 'dashboard') requestAnimationFrame(() => mountDashboardCharts());
    if (state.route === 'reports') requestAnimationFrame(() => mountReportCharts());
  }
}

function bindViewEvents() {
  bindAccountsEvents();
  bindTransactionsEvents();
  bindCardsEvents();
  bindProjectsEvents();
  bindGoalsEvents();
  bindInvestmentsEvents();
  bindSettingsEvents();
  bindIntegrityEvents();
  bindSearchEvents();

  document.getElementById('global-search-input')?.addEventListener('input', (event) => {
    const value = event.target.value;
    patchUi({ query: value });
    if (value.trim()) {
      if (state.route !== 'search') navigate('search');
    }
  });
  document.getElementById('global-search-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.target.value = '';
      patchUi({ query: '' });
      if (state.route === 'search') navigate('dashboard');
    }
  });
  document.getElementById('open-onboarding-btn')?.addEventListener('click', () => openOnboardingModal(renderApp));
  document.getElementById('mobile-menu-btn')?.addEventListener('click', openMobileDrawer);
  document.getElementById('global-month-picker')?.addEventListener('change', (event) => {
    setSelectedMonth(event.target.value);
  });
}

function loadingView() {
  return `<div class="grid md:grid-cols-2 xl:grid-cols-4 gap-5">${Array.from({ length: 8 }).map(() => `<div class="skeleton h-32"></div>`).join('')}</div>`;
}

async function bootstrap() {
  ensureDefaultUrl();
  initRouter();
  subscribe(renderApp);
  renderApp();
  await loadState();
  setupConnectivity();
  if (!getCurrentUser()) {
    openOnboardingModal(renderApp);
  }
  await initIntegration();
  // await seedDemoData();
  await loadState();
  setupSyncLoop();
}

function setupConnectivity() {
  window.addEventListener('online', () => patchUi({ offline: false, integrationLabel: 'Conexão restaurada' }));
  window.addEventListener('offline', () => patchUi({ offline: true, integrationLabel: 'Modo offline' }));
}

async function initIntegration() {
  if (state.ui.offline) {
    patchUi({ integrationStatus: 'offline', integrationLabel: 'Offline' });
    return;
  }
  try {
    patchUi({ integrationStatus: 'testing', integrationLabel: 'Preparando estrutura remota…' });
    await SheetsService.init();
    const result = await pullRemoteIntoLocal();
    await loadState();
    patchUi({ integrationStatus: 'online', integrationLabel: result.changed ? `${result.changed} item(ns) atualizados da nuvem` : 'Apps Script conectado' });
  } catch (error) {
    console.error(error);
    patchUi({ integrationStatus: 'error', integrationLabel: 'Falha na integração remota' });
    toast(error.message, 'error');
  }
}

function setupSyncLoop() {
  setInterval(async () => {
    if (state.ui.offline || state.ui.integrationStatus === 'error') return;
    const pending = await hasPendingSync();
    if (!pending) return;

    try {
      patchUi({ syncing: true, integrationLabel: 'Sincronizando alterações…' });
      const result = await processSyncQueue();
      if (result.processed) {
        patchUi({ integrationStatus: 'online', integrationLabel: `${result.processed} item(ns) sincronizados` });
      }
    } catch (error) {
      console.error(error);
      patchUi({ integrationStatus: 'error', integrationLabel: 'Falha de sync' });
      toast(error.message, 'error');
    } finally {
      patchUi({ syncing: false });
      await loadState();
    }
  }, APP_CONFIG.syncIntervalMs);
}

bootstrap().catch((error) => {
  console.error(error);
  toast(error.message, 'error');
});
