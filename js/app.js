import { initRouter, navigate } from "./router.js";
import {
  subscribe,
  state,
  loadState,
  patchUi,
  setSelectedMonth,
} from "./state.js";
import {
  renderShell,
  renderTopbar,
  toast,
  openMobileDrawer,
  closeMobileDrawer,
} from "./ui.js";
import {
  renderDashboard,
  bindDashboardEvents,
  mountDashboardCharts,
} from "./modules/dashboard.js";
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
import { subscribeToExternalStorageChanges } from "./services/storage.js";
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

const REMOTE_PULL_INTERVAL_MS = Math.max(APP_CONFIG.syncIntervalMs * 2, 30000);
const MAX_SYNC_DRAIN_PASSES = 4;

let syncLoopHandle = null;
let syncInFlight = false;
let lastRemotePullAt = 0;
let externalStorageUnsubscribe = null;
let externalReloadTimer = null;
let externalReloadInFlight = false;

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
  bindDashboardEvents();
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
    .getElementById("mobile-menu-btn")
    ?.addEventListener("click", openMobileDrawer);

  document
    .querySelectorAll("#open-onboarding-btn, #open-mobile-onboarding-btn")
    .forEach((button) => {
      button.addEventListener("click", () => {
        closeMobileDrawer();
        openOnboardingModal(renderApp);
      });
    });

  document
    .querySelectorAll("#global-month-picker, #mobile-month-picker")
    .forEach((input) => {
      input.addEventListener("change", (event) => {
        const nextMonth = event.target.value;
        if (!nextMonth) return;
        setSelectedMonth(nextMonth);

        if (event.target.id === "mobile-month-picker") {
          closeMobileDrawer();
        }
      });
    });
}

function loadingView() {
  return `
    ${Array.from({ length: 8 })
      .map(
        () => `
          <div class="card p-6 animate-pulse">
            <div class="h-6 w-40 rounded-full bg-slate-200 mb-3"></div>
            <div class="h-4 w-full rounded-full bg-slate-100 mb-2"></div>
            <div class="h-4 w-5/6 rounded-full bg-slate-100"></div>
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
  setupExternalStateWatchers();

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

function setupExternalStateWatchers() {
  if (!externalStorageUnsubscribe) {
    externalStorageUnsubscribe = subscribeToExternalStorageChanges(() => {
      scheduleExternalReload("Dados atualizados em outra aba");
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      maybePullRemoteUpdates(true).catch((error) => {
        console.error(error);
      });
    }
  });
}

function scheduleExternalReload(label) {
  window.clearTimeout(externalReloadTimer);

  externalReloadTimer = window.setTimeout(async () => {
    if (externalReloadInFlight || state.ui.loading) return;

    externalReloadInFlight = true;

    try {
      await loadState();
      patchUi({ integrationLabel: label });
    } catch (error) {
      console.error(error);
    } finally {
      externalReloadInFlight = false;
    }
  }, 220);
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
    lastRemotePullAt = Date.now();
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

async function maybePullRemoteUpdates(force = false) {
  if (
    state.ui.offline ||
    state.ui.integrationStatus === "error" ||
    state.ui.integrationStatus === "testing"
  ) {
    return { changed: 0 };
  }

  const now = Date.now();

  if (!force && now - lastRemotePullAt < REMOTE_PULL_INTERVAL_MS) {
    return { changed: 0 };
  }

  lastRemotePullAt = now;
  const result = await pullRemoteIntoLocal();

  if (result.changed) {
    await loadState();
    patchUi({
      integrationStatus: "online",
      integrationLabel: `${result.changed} item(ns) recebidos da nuvem`,
    });
  }

  return result;
}

async function drainPendingSync() {
  const aggregate = { processed: 0, failed: 0, cleaned: 0 };

  for (let pass = 0; pass < MAX_SYNC_DRAIN_PASSES; pass += 1) {
    const pending = await hasPendingSync();
    if (!pending) break;

    const passResult = await processSyncQueue();

    aggregate.processed += passResult.processed || 0;
    aggregate.failed += passResult.failed || 0;
    aggregate.cleaned += passResult.cleaned || 0;

    if (!passResult.processed && !passResult.failed && !passResult.cleaned) {
      break;
    }
  }

  return aggregate;
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

  syncInFlight = true;
  let result = null;

  try {
    const pending = await hasPendingSync();

    if (!pending) {
      await maybePullRemoteUpdates();
      return;
    }

    patchUi({ syncing: true, integrationLabel: "Sincronizando alterações…" });
    result = await drainPendingSync();

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
      await maybePullRemoteUpdates(true).catch((error) => {
        console.error(error);
      });
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
