import { initRouter, navigate } from "./router.js";
import {
  subscribe,
  state,
  loadState,
  patchUi,
  setSelectedMonth,
} from "./state.js";
import { renderShell, renderTopbar, toast, openMobileDrawer } from "./ui.js";
import { renderDashboard, mountDashboardCharts } from "./modules/dashboard.js";
import { renderAccounts, bindAccountsEvents } from "./modules/accounts.js";
import {
  renderTransactions,
  bindTransactionsEvents,
} from "./modules/transactions.js";
import { renderCards, bindCardsEvents } from "./modules/cards.js";
import { renderProjects, bindProjectsEvents } from "./modules/projects.js";
import { renderGoals, bindGoalsEvents } from "./modules/goals.js";
import {
  renderInvestments,
  bindInvestmentsEvents,
} from "./modules/investments.js";
import { renderReports, mountReportCharts } from "./modules/reports.js";
import { renderSettings, bindSettingsEvents } from "./modules/settings.js";
import { renderIntegrity, bindIntegrityEvents } from "./modules/integrity.js";
import { renderSearch, bindSearchEvents } from "./modules/search.js";
import {
  processSyncQueue,
  hasPendingSync,
  pullRemoteIntoLocal,
} from "./services/sync.js";
import { SheetsService } from "./services/sheets.js";
import { seedDemoData } from "./seed.js";
import {
  ensureDefaultUrl,
  getCurrentUser,
  openOnboardingModal,
} from "./modules/onboarding.js";
import { APP_CONFIG } from "./config.js";

const viewRoot = document.getElementById("view-root");
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

let syncLoopHandle = null;
let syncInFlight = false;

function renderApp() {
  renderShell();
  renderTopbar();

  const renderer = routeMap[state.route] || renderDashboard;
  viewRoot.innerHTML = state.ui.loading ? loadingView() : renderer();
  bindViewEvents();

  if (!state.ui.loading) {
    if (state.route === "dashboard") {
      requestAnimationFrame(() => mountDashboardCharts());
    }
    if (state.route === "reports") {
      requestAnimationFrame(() => mountReportCharts());
    }
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

  document.getElementById("global-search-input")?.addEventListener(
    "input",
    (event) => {
      const value = event.target.value;
      patchUi({ query: value });
      if (value.trim() && state.route !== "search") {
        navigate("search");
      }
    },
  );

  document.getElementById("global-search-input")?.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.target.value = "";
        patchUi({ query: "" });
        if (state.route === "search") navigate("dashboard");
      }
    },
  );

  document
    .getElementById("open-onboarding-btn")
    ?.addEventListener("click", () => openOnboardingModal(renderApp));
  document
    .getElementById("mobile-menu-btn")
    ?.addEventListener("click", openMobileDrawer);
  document
    .getElementById("global-month-picker")
    ?.addEventListener("change", (event) => {
      setSelectedMonth(event.target.value);
    });
}

function loadingView() {
  return `
    ${Array.from({ length: 8 })
      .map(
        () => `
          <div class="card p-4">
            <div class="skeleton h-5 w-32 mb-4"></div>
            <div class="skeleton h-10 w-full"></div>
          </div>`,
      )
      .join("")}
  `;
}

async function bootstrap() {
  ensureDefaultUrl();
  initRouter();
  subscribe(renderApp);
  renderApp();
  await loadState();
  setupConnectivity();

  if (!getCurrentUser()) {
    await new Promise((resolve) => {
      openOnboardingModal(() => resolve());
    });
  }

  await initIntegration();
  // await seedDemoData();
  await loadState();
  setupSyncLoop();
}

function setupConnectivity() {
  window.addEventListener("online", () =>
    patchUi({ offline: false, integrationLabel: "Conexão restaurada" }),
  );
  window.addEventListener("offline", () =>
    patchUi({ offline: true, integrationLabel: "Modo offline" }),
  );
}

async function initIntegration() {
  if (state.ui.offline) {
    patchUi({ integrationStatus: "offline", integrationLabel: "Offline" });
    return;
  }

  try {
    patchUi({
      integrationStatus: "testing",
      integrationLabel: "Preparando estrutura remota…",
    });
    await SheetsService.init();
    const result = await pullRemoteIntoLocal();
    await loadState();
    patchUi({
      integrationStatus: "online",
      integrationLabel: result.changed
        ? `${result.changed} item(ns) atualizados da nuvem`
        : "Apps Script conectado",
    });
  } catch (error) {
    console.error(error);
    patchUi({
      integrationStatus: "error",
      integrationLabel: "Falha na integração remota",
    });
    toast(error.message, "error");
  }
}

async function runSyncLoop() {
  if (
    syncInFlight ||
    state.ui.syncing ||
    state.ui.offline ||
    state.ui.integrationStatus === "error"
  ) {
    return;
  }

  const pending = await hasPendingSync();
  if (!pending) return;

  syncInFlight = true;
  let result = null;

  try {
    patchUi({ syncing: true, integrationLabel: "Sincronizando alterações…" });
    result = await processSyncQueue();

    if (result.processed) {
      patchUi({
        syncing: true,
        integrationStatus: "online",
        integrationLabel: `${result.processed} item(ns) sincronizados`,
      });
    } else if (result.failed) {
      patchUi({
        syncing: true,
        integrationStatus: "online",
        integrationLabel: `${result.failed} item(ns) com falha de sync`,
      });
    } else if (result.cleaned) {
      patchUi({
        syncing: true,
        integrationStatus: "online",
        integrationLabel: "Fila de sync reorganizada",
      });
    }
  } catch (error) {
    console.error(error);
    patchUi({ integrationStatus: "error", integrationLabel: "Falha de sync" });
    toast(error.message, "error");
  } finally {
    syncInFlight = false;
    patchUi({ syncing: false });
    if (result?.processed || result?.failed || result?.cleaned) {
      await loadState();
    }
  }
}

function setupSyncLoop() {
  if (syncLoopHandle) return;
  syncLoopHandle = window.setInterval(runSyncLoop, APP_CONFIG.syncIntervalMs);
  runSyncLoop();
}

bootstrap().catch((error) => {
  console.error(error);
  toast(error.message, "error");
});
