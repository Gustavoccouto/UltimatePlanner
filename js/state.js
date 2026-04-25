import { getAll, bulkPut } from "./services/storage.js";
import { materializePlanningEntries } from "./services/planning.js";
import { deriveAccountBalances } from "./utils/calculations.js";
import { getCurrentMonthKey } from "./utils/dates.js";

const listeners = new Set();

export const state = {
  route: "dashboard",
  ui: {
    loading: true,
    modal: null,
    query: "",
    offline: !navigator.onLine,
    syncing: false,
    selectedMonth: getCurrentMonthKey(),
    advisorMessages: [],
    advisorLoading: false,
  },
  data: {
    accounts: [],
    creditCards: [],
    transactions: [],
    categories: [],
    projects: [],
    projectItems: [],
    projectParticipants: [],
    goals: [],
    investments: [],
    installmentPlans: [],
    auditLogs: [],
    preferences: [],
    syncQueue: [],
    syncErrors: [],
    meta: [],
  },
};

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify() {
  listeners.forEach((listener) => listener(state));
}

export function setRoute(route) {
  state.route = route;
  notify();
}

export function patchUi(partial) {
  Object.assign(state.ui, partial);
  notify();
}

export function setSelectedMonth(monthKey) {
  state.ui.selectedMonth = monthKey || getCurrentMonthKey();
  notify();
}

export function getEntity(name) {
  return state.data[name] || [];
}

export function getDerivedAccounts() {
  return deriveAccountBalances(
    state.data.accounts.filter((account) => !account.isDeleted),
    state.data.transactions,
    state.ui.selectedMonth,
  );
}

export async function loadState() {
  state.ui.loading = true;
  notify();

  await hydrateStateData();

  const planningResult = await materializePlanningEntries({
    preferences: state.data.preferences,
    installmentPlans: state.data.installmentPlans,
    transactions: state.data.transactions,
    creditCards: state.data.creditCards,
  });

  if (
    planningResult.created ||
    planningResult.updatedPlans ||
    planningResult.deduped
  ) {
    await hydrateStateData();
  }

  state.ui.loading = false;
  notify();
}

export async function replaceEntity(storeName, records) {
  await bulkPut(storeName, records, { skipInvalid: true });
  state.data[storeName] = await getAll(storeName);
  notify();
}

async function hydrateStateData() {
  const keys = Object.keys(state.data);
  const values = await Promise.all(keys.map((key) => getAll(key)));
  keys.forEach((key, index) => {
    state.data[key] = values[index] || [];
  });
}
