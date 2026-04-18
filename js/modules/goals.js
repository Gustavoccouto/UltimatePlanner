import { state, loadState, getDerivedAccounts } from "../state.js";
import {
  pageHeader,
  openModal,
  closeModal,
  toast,
  confirmDialog,
} from "../ui.js";
import { currency, percent, datePt } from "../utils/formatters.js";
import { putOne, getOne } from "../services/storage.js";
import { enqueueSync } from "../services/sync.js";
import { createId } from "../utils/ids.js";
import { nowIso, formatDateInput } from "../utils/dates.js";
import {
  validateRequired,
  validatePositive,
  validateNonNegative,
} from "../utils/validators.js";
import { SheetsService } from "../services/sheets.js";
import { getCurrentUser } from "./onboarding.js";

let goalShareModalState = null;

function getCurrentActorMeta() {
  const user = getCurrentUser();
  return {
    actorUserId: user?.id || null,
    actorUserName: user?.name || "Usuário",
    actorLogin: user?.login || "",
    actorWorkspaceKey: user?.workspaceKey || "",
  };
}

function normalizeSharedUsers(sharedUsers = [], ownerUserId = "") {
  const seen = new Set();
  return (Array.isArray(sharedUsers) ? sharedUsers : [])
    .map((user) => ({
      id: String(user?.id || user?.userId || "").trim(),
      name: String(user?.name || user?.userName || "").trim(),
      login: String(user?.login || "").trim(),
      workspaceKey: String(user?.workspaceKey || "").trim(),
    }))
    .filter((user) => user.id && user.id !== String(ownerUserId || ""))
    .filter((user) => {
      if (seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    });
}

function getGoalSharedUsers(goal = {}) {
  return normalizeSharedUsers(goal.sharedUsers || [], goal.ownerUserId);
}

function getGoalWorkspaceKey(goal = {}) {
  const currentUser = getCurrentUser();
  return (
    goal.workspaceKey ||
    goal.ownerWorkspaceKey ||
    currentUser?.workspaceKey ||
    null
  );
}

function isGoalOwner(goal = {}) {
  const currentUser = getCurrentUser();
  if (!currentUser) return false;
  if (goal.ownerUserId) return goal.ownerUserId === currentUser.id;
  return getGoalWorkspaceKey(goal) === currentUser.workspaceKey;
}

function canEditGoal(goal = {}) {
  const currentUser = getCurrentUser();
  if (!currentUser) return false;
  if (isGoalOwner(goal)) return true;
  return getGoalSharedUsers(goal).some((user) => user.id === currentUser.id);
}

function getGoalOwnerLabel(goal = {}) {
  if (goal.ownerUserName) return goal.ownerUserName;
  if (goal.ownerLogin) return `@${goal.ownerLogin}`;
  return goal.ownerUserId ? "Dono da meta" : "Sem dono";
}

function getVisibleGoals() {
  return state.data.goals.filter((item) => !item.isDeleted);
}

function getTransferableAccounts() {
  return getDerivedAccounts().filter((account) => !account.isDeleted);
}

function renderTransferAccountOptions(selectedId = "") {
  const accounts = getTransferableAccounts();
  return `
    <option value="">Não movimentar conta</option>
    ${accounts
      .map(
        (account) => `<option value="${account.id}" ${selectedId === account.id ? "selected" : ""}>${account.name} • ${currency(Number(account.derivedBalance || 0))}</option>`,
      )
      .join("")}
  `;
}

async function createGoalLinkedAccountAdjustment(goal, amount, bankAccountId, mode, date, notes = "") {
  if (!bankAccountId) return null;

  const record = {
    id: createId("tx"),
    description: `${mode === "remove" ? "[Meta] Resgate" : "[Meta] Aporte"} • ${goal.name}`,
    type: "adjustment",
    accountId: bankAccountId,
    amount: mode === "remove" ? Number(amount || 0) : -Number(amount || 0),
    date: date || formatDateInput(),
    category: "Meta",
    notes: notes || `${mode === "remove" ? "Resgate" : "Aporte"} vinculado à meta ${goal.name}`,
    relatedEntityType: "goal",
    relatedEntityId: goal.id,
    relatedMovementKind: mode === "remove" ? "goal_withdrawal" : "goal_contribution",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    version: 1,
    syncStatus: "pending",
    isDeleted: false,
  };

  await putOne("transactions", record);
  await enqueueSync("transactions", record.id);
  return record;
}

function getGoalActivity(goalId) {
  return state.data.auditLogs
    .filter(
      (item) =>
        !item.isDeleted && item.entityType === "goal" && item.entityId === goalId,
    )
    .sort(
      (a, b) =>
        new Date(b.timestamp || b.updatedAt || 0) -
        new Date(a.timestamp || a.updatedAt || 0),
    );
}

function formatActivityValue(value) {
  if (value === null || typeof value === "undefined" || value === "") return "—";
  if (typeof value === "number") return currency(value);
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  return String(value);
}

function buildGoalActivityLabel(log) {
  const actor = log.actorUserName || "Alguém";
  const fieldLabel = log.fieldLabel || log.field || "campo";

  switch (log.actionType) {
    case "goal_created":
      return `${actor} criou a meta.`;
    case "goal_deleted":
      return `${actor} excluiu a meta.`;
    case "goal_share_added":
      return `${actor} compartilhou com ${log.relatedUserName || log.newValue || "um usuário"}.`;
    case "goal_share_removed":
      return `${actor} removeu ${log.relatedUserName || log.previousValue || "um usuário"} do compartilhamento.`;
    case "goal_contribution_added":
      return `${actor} adicionou ${currency(Number(log.newValue || 0))} à meta.`;
    case "goal_contribution_removed":
      return `${actor} removeu ${currency(Number(log.newValue || 0))} da meta.`;
    case "goal_account_transfer_linked":
      return `${actor} vinculou uma movimentação com a conta ${log.relatedUserName || log.newValue || "selecionada"}.`;
    case "goal_updated":
      return `${actor} alterou ${fieldLabel} de ${formatActivityValue(log.previousValue)} para ${formatActivityValue(log.newValue)}.`;
    default:
      return `${actor} registrou uma atividade na meta.`;
  }
}

function renderGoalActivityPreview(goalId) {
  const logs = getGoalActivity(goalId).slice(0, 3);
  if (!logs.length) {
    return `<div class="text-sm text-slate-500">Sem atividade recente.</div>`;
  }
  return logs
    .map(
      (log) => `
        <div class="surface-soft rounded-[20px] p-3 border border-slate-100">
          <div class="font-semibold text-slate-900">${buildGoalActivityLabel(log)}</div>
          <div class="text-xs text-slate-500 mt-1">${datePt((log.timestamp || log.updatedAt || "").slice(0, 10))}</div>
        </div>`,
    )
    .join("");
}

async function createGoalAuditLog(goal, actionType, details = {}) {
  const timestamp = nowIso();
  const record = {
    id: createId("audit"),
    entityType: "goal",
    entityId: goal.id,
    goalId: goal.id,
    goalName: goal.name,
    actionType,
    field: details.field || "",
    fieldLabel: details.fieldLabel || "",
    previousValue:
      typeof details.previousValue === "undefined" ? null : details.previousValue,
    newValue: typeof details.newValue === "undefined" ? null : details.newValue,
    relatedUserId: details.relatedUserId || null,
    relatedUserName: details.relatedUserName || "",
    timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: "pending",
    isDeleted: false,
    version: 1,
    workspaceKey: getGoalWorkspaceKey(goal),
    ...getCurrentActorMeta(),
  };

  await putOne("auditLogs", record);
  await enqueueSync("auditLogs", record.id);
}

async function logGoalFieldChanges(goal, previous = {}, next = {}, fieldMap = {}) {
  for (const [field, label] of Object.entries(fieldMap)) {
    if ((previous?.[field] ?? "") === (next?.[field] ?? "")) continue;
    await createGoalAuditLog(goal, "goal_updated", {
      field,
      fieldLabel: label,
      previousValue: previous?.[field] ?? null,
      newValue: next?.[field] ?? null,
    });
  }
}

function matchesShareUser(user, query = "") {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return true;
  const haystack = [user.name, user.login, user.workspaceKey, user.id]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return haystack.includes(term);
}

export function renderGoals() {
  const goals = getVisibleGoals();
  const activeGoals = goals.length;
  const totalTarget = goals.reduce(
    (sum, goal) => sum + Number(goal.targetAmount || 0),
    0,
  );
  const totalCurrent = goals.reduce(
    (sum, goal) => sum + Number(goal.currentAmount || 0),
    0,
  );
  const dueSoon = goals.filter(
    (goal) => goal.targetDate && new Date(goal.targetDate) <= addDays(45),
  ).length;

  return `
    ${pageHeader("Metas", "Cadastre metas com progresso, prazo e aportes acumulados.", `<button id="new-goal-btn" class="action-btn action-btn-primary"><i class="fa-solid fa-plus mr-2"></i>Nova meta</button>`) }

    <section class="module-stack">
      <div class="grid md:grid-cols-3 gap-4">
        ${metricCard("Metas ativas", String(activeGoals), "fa-bullseye")}
        ${metricCard("Valor alvo consolidado", currency(totalTarget), "fa-flag-checkered")}
        ${metricCard("A vencer em 45 dias", String(dueSoon), "fa-hourglass-half")}
      </div>

      <div class="module-card-grid">
        ${goals.map((goal) => renderGoalCard(goal)).join("") || emptyState("Nenhuma meta cadastrada", "Crie metas para acompanhar objetivos financeiros com progresso visível.")}
      </div>
    </section>`;
}

export function bindGoalsEvents() {
  document
    .getElementById("new-goal-btn")
    ?.addEventListener("click", () => openGoalModal());
  document
    .querySelectorAll("[data-goal-edit]")
    .forEach((button) =>
      button.addEventListener("click", () => openGoalModal(button.dataset.goalEdit)),
    );
  document
    .querySelectorAll("[data-goal-delete]")
    .forEach((button) =>
      button.addEventListener("click", () => confirmGoalDelete(button.dataset.goalDelete)),
    );
  document
    .querySelectorAll("[data-goal-share]")
    .forEach((button) =>
      button.addEventListener("click", () => openGoalShareModal(button.dataset.goalShare)),
    );
  document
    .querySelectorAll("[data-goal-history]")
    .forEach((button) =>
      button.addEventListener("click", () => openGoalHistoryModal(button.dataset.goalHistory)),
    );
  document
    .querySelectorAll("[data-goal-contribute]")
    .forEach((button) =>
      button.addEventListener("click", () => openGoalContributionModal(button.dataset.goalContribute, "add")),
    );
  document
    .querySelectorAll("[data-goal-withdraw]")
    .forEach((button) =>
      button.addEventListener("click", () => openGoalContributionModal(button.dataset.goalWithdraw, "remove")),
    );
}

function renderGoalCard(goal) {
  const progress = Math.min(
    100,
    Math.round(
      (Number(goal.currentAmount || 0) /
        Math.max(Number(goal.targetAmount || 1), 1)) *
        100,
    ),
  );
  const sharedUsers = getGoalSharedUsers(goal);
  const canOwnerManage = isGoalOwner(goal);
  const canEdit = canEditGoal(goal);
  return `
    <article class="card p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="text-sm text-slate-500">${goal.category || "Meta financeira"}</div>
          <div class="text-2xl font-bold mt-1">${goal.name}</div>
          <div class="text-xs text-slate-500 mt-2">Dono: ${getGoalOwnerLabel(goal)}${sharedUsers.length ? ` • Compartilhado com ${sharedUsers.length}` : ""}</div>
        </div>
        <span class="badge ${progress >= 100 ? "badge-success" : "badge-muted"}">${percent(progress)}</span>
      </div>
      <div class="mt-6">
        <div class="flex items-center justify-between text-sm text-slate-500 mb-2"><span>Acumulado</span><span>${currency(goal.currentAmount || 0)} de ${currency(goal.targetAmount || 0)}</span></div>
        <div class="progress-rail"><span style="width:${progress}%"></span></div>
      </div>
      <div class="grid md:grid-cols-2 gap-3 mt-5 text-sm text-slate-500">
        <div class="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">Prazo<br><strong class="text-slate-900">${goal.targetDate ? datePt(goal.targetDate) : "Sem prazo"}</strong></div>
        <div class="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">Aporte recente<br><strong class="text-slate-900">${currency(goal.lastContribution || 0)}</strong></div>
      </div>
      <div class="flex flex-wrap gap-2 mt-4">
        ${sharedUsers.length ? sharedUsers.map((user) => `<span class="project-person-pill">${user.name || `@${user.login}`}</span>`).join("") : `<span class="text-xs text-slate-500">Meta individual</span>`}
      </div>
      <div class="mt-5 space-y-3">
        ${renderGoalActivityPreview(goal.id)}
      </div>
      <div class="mt-5 flex gap-3 flex-wrap">
        ${canEdit ? `<button class="action-btn action-btn-primary" data-goal-contribute="${goal.id}">Adicionar valor</button>` : ""}
        ${canEdit ? `<button class="action-btn action-btn-danger-soft" data-goal-withdraw="${goal.id}">Remover valor</button>` : ""}
        ${canEdit ? `<button class="action-btn" data-goal-edit="${goal.id}">Editar</button>` : ""}
        <button class="action-btn" data-goal-history="${goal.id}">Atividade</button>
        ${canOwnerManage ? `<button class="action-btn" data-goal-share="${goal.id}">Compartilhar</button>` : ""}
        ${canOwnerManage ? `<button class="action-btn action-btn-danger-soft" data-goal-delete="${goal.id}">Excluir</button>` : ""}
      </div>
    </article>`;
}

async function openGoalModal(goalId = null) {
  const existing = goalId ? await getOne("goals", goalId) : null;
  if (existing && !canEditGoal(existing)) {
    toast("Você não tem permissão para editar essa meta.", "error");
    return;
  }
  openModal(`
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="text-2xl font-bold">${existing ? "Editar meta" : "Nova meta"}</div>
        <div class="text-sm text-slate-500 mt-1">Defina valor alvo, acumulado atual, prazo e contexto.</div>
      </div>
      <button id="close-modal" class="action-btn">Fechar</button>
    </div>
    <form id="goal-form" class="grid md:grid-cols-2 gap-4">
      <input type="hidden" name="id" value="${existing?.id || ""}" />
      <div><label class="text-sm font-semibold mb-2 block">Nome</label><input name="name" class="field" value="${existing?.name || ""}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Categoria</label><input name="category" class="field" value="${existing?.category || ""}" placeholder="Reserva, viagem, carro..." /></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor alvo</label><input name="targetAmount" type="number" min="0.01" step="0.01" class="field" value="${existing?.targetAmount || ""}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor atual</label><input name="currentAmount" type="number" min="0" step="0.01" class="field" value="${existing?.currentAmount || 0}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Último aporte</label><input name="lastContribution" type="number" min="0" step="0.01" class="field" value="${existing?.lastContribution || 0}" /></div>
      <div><label class="text-sm font-semibold mb-2 block">Prazo</label><input name="targetDate" type="date" class="field" value="${existing?.targetDate || formatDateInput()}" /></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3">${existing?.notes || ""}</textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-goal" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">${existing ? "Salvar alterações" : "Salvar meta"}</button></div>
    </form>`);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document.getElementById("cancel-goal")?.addEventListener("click", closeModal);
  document.getElementById("goal-form")?.addEventListener("submit", saveGoal);
}

async function saveGoal(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    validateRequired(payload.name, "Nome");
    validatePositive(payload.targetAmount, "Valor alvo");
    validateNonNegative(payload.currentAmount, "Valor atual");
    validateNonNegative(payload.lastContribution || 0, "Último aporte");

    const timestamp = nowIso();
    const existing = payload.id ? await getOne("goals", payload.id) : null;
    if (existing && !canEditGoal(existing)) {
      throw new Error("Você não tem permissão para editar essa meta.");
    }

    const currentUser = getCurrentUser();
    const sharedUsers = existing ? getGoalSharedUsers(existing) : [];
    const record = {
      ...existing,
      ...payload,
      targetAmount: Number(payload.targetAmount),
      currentAmount: Number(payload.currentAmount),
      lastContribution: Number(payload.lastContribution || 0),
      id: payload.id || createId("goal"),
      ownerUserId: existing?.ownerUserId || currentUser?.id || null,
      ownerUserName: existing?.ownerUserName || currentUser?.name || "",
      ownerLogin: existing?.ownerLogin || currentUser?.login || "",
      ownerWorkspaceKey:
        existing?.ownerWorkspaceKey || currentUser?.workspaceKey || "",
      sharedUsers,
      sharedUserIds: sharedUsers.map((user) => user.id),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      version: (existing?.version || 0) + 1,
      syncStatus: "pending",
      isDeleted: false,
      workspaceKey: getGoalWorkspaceKey(existing || { ownerWorkspaceKey: currentUser?.workspaceKey, workspaceKey: currentUser?.workspaceKey }),
    };

    await putOne("goals", record);
    await enqueueSync("goals", record.id);

    if (!existing) {
      await createGoalAuditLog(record, "goal_created", { newValue: record.name });
    } else {
      await logGoalFieldChanges(record, existing, record, {
        name: "Nome",
        category: "Categoria",
        targetAmount: "Valor alvo",
        currentAmount: "Valor atual",
        lastContribution: "Último aporte",
        targetDate: "Prazo",
        notes: "Observações",
      });
    }

    await loadState();
    closeModal();
    toast(existing ? "Meta atualizada com sucesso." : "Meta salva com sucesso.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

function buildGoalShareRows(goal, users, search = "") {
  const sharedIds = new Set(getGoalSharedUsers(goal).map((user) => user.id));
  const filtered = users.filter((user) => matchesShareUser(user, search));

  if (!filtered.length) {
    return `<div class="text-sm text-slate-500 p-4 text-center">Nenhum usuário encontrado para esse filtro.</div>`;
  }

  return filtered
    .map((user) => {
      const isShared = sharedIds.has(user.id);
      return `
        <div class="flex items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-white px-4 py-3">
          <div class="min-w-0">
            <div class="font-semibold text-slate-900 truncate">${user.name || user.login || user.id}</div>
            <div class="text-sm text-slate-500 truncate">@${user.login || "sem-login"} • ${user.workspaceKey || "sem-workspace"}</div>
          </div>
          <button type="button" class="action-btn ${isShared ? "action-btn-danger-soft" : "action-btn-primary"}" data-goal-share-toggle="${user.id}">${isShared ? "Remover" : "Adicionar"}</button>
        </div>`;
    })
    .join("");
}

async function renderGoalShareModal(goalId) {
  const goal = await getOne("goals", goalId);
  if (!goal) return;
  const users = goalShareModalState?.users || [];
  const search = goalShareModalState?.search || "";
  openModal(`
    <div class="flex items-center justify-between mb-6 gap-4">
      <div>
        <div class="text-2xl font-bold">Compartilhar meta</div>
        <div class="text-sm text-slate-500 mt-1">Somente o dono pode adicionar ou remover usuários nessa meta.</div>
      </div>
      <button id="close-modal" class="action-btn">Fechar</button>
    </div>
    <div class="surface-soft rounded-[24px] p-4 mb-4 border border-slate-100">
      <div class="text-xs uppercase tracking-[0.14em] text-slate-400">Dono</div>
      <div class="font-semibold text-slate-900 mt-1">${getGoalOwnerLabel(goal)}</div>
    </div>
    <label class="block mb-4">
      <span class="text-sm font-semibold block mb-2">Buscar usuário</span>
      <input id="goal-share-search" class="field" value="${search}" placeholder="Buscar por nome, login ou workspace" />
    </label>
    <div class="space-y-3 max-h-[50vh] overflow-auto">${buildGoalShareRows(goal, users, search)}</div>
  `);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document.getElementById("goal-share-search")?.addEventListener("input", (event) => {
    goalShareModalState = { ...(goalShareModalState || {}), search: event.target.value || "" };
    renderGoalShareModal(goalId);
  });
  document.querySelectorAll("[data-goal-share-toggle]").forEach((button) => {
    button.addEventListener("click", () =>
      toggleGoalSharedUser(goalId, button.dataset.goalShareToggle),
    );
  });
}

async function openGoalShareModal(goalId) {
  const goal = await getOne("goals", goalId);
  if (!goal) return;
  if (!isGoalOwner(goal)) {
    toast("Somente o dono pode gerenciar o compartilhamento.", "error");
    return;
  }

  try {
    const result = await SheetsService.listUsers();
    const users = (Array.isArray(result?.users) ? result.users : [])
      .filter((user) => user.id !== goal.ownerUserId)
      .map((user) => ({
        id: user.id,
        name: user.name,
        login: user.login,
        workspaceKey: user.workspaceKey,
      }));

    goalShareModalState = { goalId, users, search: "" };
    await renderGoalShareModal(goalId);
  } catch (error) {
    toast(error.message || "Não foi possível carregar os usuários.", "error");
  }
}

async function toggleGoalSharedUser(goalId, userId) {
  const goal = await getOne("goals", goalId);
  if (!goal) return;
  if (!isGoalOwner(goal)) {
    toast("Somente o dono pode gerenciar o compartilhamento.", "error");
    return;
  }

  const users = goalShareModalState?.users || [];
  const targetUser = users.find((user) => user.id === userId);
  if (!targetUser) return;

  const sharedUsers = getGoalSharedUsers(goal);
  const exists = sharedUsers.some((user) => user.id === userId);
  const nextSharedUsers = exists
    ? sharedUsers.filter((user) => user.id !== userId)
    : normalizeSharedUsers([...sharedUsers, targetUser], goal.ownerUserId);

  const updated = {
    ...goal,
    ownerUserId: goal.ownerUserId || getCurrentUser()?.id || null,
    ownerUserName: goal.ownerUserName || getCurrentUser()?.name || "",
    ownerLogin: goal.ownerLogin || getCurrentUser()?.login || "",
    ownerWorkspaceKey:
      goal.ownerWorkspaceKey || getCurrentUser()?.workspaceKey || getGoalWorkspaceKey(goal),
    sharedUsers: nextSharedUsers,
    sharedUserIds: nextSharedUsers.map((user) => user.id),
    updatedAt: nowIso(),
    version: (goal.version || 0) + 1,
    syncStatus: "pending",
    workspaceKey: getGoalWorkspaceKey(goal),
  };

  await putOne("goals", updated);
  await enqueueSync("goals", updated.id);
  await createGoalAuditLog(updated, exists ? "goal_share_removed" : "goal_share_added", {
    relatedUserId: targetUser.id,
    relatedUserName: targetUser.name || `@${targetUser.login}`,
    previousValue: exists ? targetUser.name || targetUser.login : null,
    newValue: exists ? null : targetUser.name || targetUser.login,
  });
  await loadState();
  await renderGoalShareModal(goalId);
  toast(exists ? "Usuário removido do compartilhamento." : "Usuário adicionado ao compartilhamento.", "success");
}

async function openGoalHistoryModal(goalId) {
  const goal = await getOne("goals", goalId);
  if (!goal) return;
  const logs = getGoalActivity(goalId);
  openModal(`
    <div class="flex items-center justify-between mb-6 gap-4">
      <div>
        <div class="text-2xl font-bold">Atividade da meta</div>
        <div class="text-sm text-slate-500 mt-1">Histórico simples e persistido das alterações realizadas nessa meta.</div>
      </div>
      <button id="close-modal" class="action-btn">Fechar</button>
    </div>
    <div class="space-y-3 max-h-[55vh] overflow-auto">
      ${logs.length ? logs.map((log) => `<article class="surface-soft rounded-[22px] p-4 border border-slate-100"><div class="font-semibold text-slate-900">${buildGoalActivityLabel(log)}</div><div class="text-sm text-slate-500 mt-2">${log.fieldLabel || log.field || "Atividade"} • ${log.actorUserName || "Usuário"} • ${datePt((log.timestamp || log.updatedAt || "").slice(0, 10))}</div></article>`).join("") : `<div class="text-sm text-slate-500">Nenhuma atividade registrada ainda.</div>`}
    </div>
  `);
  document.getElementById("close-modal")?.addEventListener("click", closeModal);
}


async function openGoalContributionModal(goalId, mode = "add") {
  const goal = await getOne("goals", goalId);
  if (!goal) return;

  if (!canEditGoal(goal)) {
    toast("Você não tem permissão para movimentar essa meta.", "error");
    return;
  }

  const isRemove = mode === "remove";
  const title = isRemove ? "Remover valor" : "Adicionar valor";
  const helper = isRemove
    ? "Registre uma retirada manual dessa meta/reserva."
    : "Registre um aporte manual para esta meta/reserva.";

  openModal(`
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="text-2xl font-bold">${title}</div>
        <div class="text-sm text-slate-500 mt-1">${helper}</div>
      </div>
      <button id="close-modal" class="action-btn">Fechar</button>
    </div>
    <form id="goal-contribution-form" class="grid gap-4">
      <input type="hidden" name="goalId" value="${goal.id}" />
      <input type="hidden" name="mode" value="${mode}" />
      <div class="surface-soft rounded-[22px] p-4 border border-slate-100">
        <div class="text-xs uppercase tracking-[0.14em] text-slate-400">Meta</div>
        <div class="text-xl font-bold text-slate-900 mt-2">${goal.name}</div>
        <div class="text-sm text-slate-500 mt-2">Atual: ${currency(Number(goal.currentAmount || 0))} de ${currency(Number(goal.targetAmount || 0))}</div>
      </div>
      <div>
        <label class="text-sm font-semibold mb-2 block">Valor da ${isRemove ? "retirada" : "movimentação"}</label>
        <input name="amount" type="number" min="0.01" step="0.01" class="field" placeholder="0,00" required />
      </div>
      <div class="grid md:grid-cols-2 gap-4">
        <div>
          <label class="text-sm font-semibold mb-2 block">Data</label>
          <input name="date" type="date" class="field" value="${formatDateInput()}" required />
        </div>
        <div>
          <label class="text-sm font-semibold mb-2 block">${isRemove ? "Conta para receber" : "Conta de origem"}</label>
          <select name="bankAccountId" class="select">${renderTransferAccountOptions("")}</select>
          <div class="text-xs text-slate-500 mt-2">${isRemove ? "Opcional: credita o valor resgatado em uma conta." : "Opcional: debita o aporte de uma conta do app."}</div>
        </div>
      </div>
      <div>
        <label class="text-sm font-semibold mb-2 block">Observação</label>
        <textarea name="notes" class="textarea" rows="3" placeholder="Ex.: resgate da reserva, uso parcial, aporte mensal..."></textarea>
      </div>
      <div class="flex justify-end gap-3 pt-2 flex-wrap">
        <button type="button" id="cancel-goal-contribution" class="action-btn">Cancelar</button>
        <button class="action-btn ${isRemove ? "action-btn-danger-soft" : "action-btn-primary"}" type="submit">${isRemove ? "Salvar retirada" : "Salvar aporte"}</button>
      </div>
    </form>
  `);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document.getElementById("cancel-goal-contribution")?.addEventListener("click", closeModal);
  document
    .getElementById("goal-contribution-form")
    ?.addEventListener("submit", saveGoalContribution);
}

async function saveGoalContribution(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    validatePositive(payload.amount, "Valor da movimentação");
    validateRequired(payload.date, "Data");

    const goal = await getOne("goals", payload.goalId);
    if (!goal) throw new Error("Meta não encontrada.");
    if (!canEditGoal(goal)) {
      throw new Error("Você não tem permissão para movimentar essa meta.");
    }

    const isRemove = payload.mode === "remove";
    const amount = Number(payload.amount || 0);
    const timestamp = nowIso();
    const currentAmount = Number(goal.currentAmount || 0);

    if (isRemove && amount > currentAmount) {
      throw new Error("Não é possível remover mais do que o valor acumulado na meta.");
    }

    const nextAmount = isRemove ? currentAmount - amount : currentAmount + amount;
    const updated = {
      ...goal,
      currentAmount: nextAmount,
      lastContribution: isRemove ? -amount : amount,
      notes: goal.notes || "",
      updatedAt: timestamp,
      version: (goal.version || 0) + 1,
      syncStatus: "pending",
    };

    await putOne("goals", updated);
    await enqueueSync("goals", updated.id);

    const linkedTransaction = await createGoalLinkedAccountAdjustment(
      updated,
      amount,
      payload.bankAccountId || "",
      payload.mode,
      payload.date,
      payload.notes || "",
    );

    await createGoalAuditLog(updated, isRemove ? "goal_contribution_removed" : "goal_contribution_added", {
      field: "currentAmount",
      fieldLabel: isRemove ? "Retirada" : "Aporte",
      previousValue: currentAmount,
      newValue: amount,
    });

    if (payload.bankAccountId) {
      const linkedAccount = getTransferableAccounts().find((account) => account.id === payload.bankAccountId);
      await createGoalAuditLog(updated, "goal_account_transfer_linked", {
        field: "bankAccountId",
        fieldLabel: isRemove ? "Conta de destino" : "Conta de origem",
        previousValue: null,
        newValue: linkedAccount?.name || payload.bankAccountId,
        relatedUserId: linkedAccount?.id || null,
        relatedUserName: linkedAccount?.name || "",
      });
    }

    if (payload.notes) {
      await createGoalAuditLog(updated, "goal_updated", {
        field: isRemove ? "withdrawNote" : "contributionNote",
        fieldLabel: isRemove ? "Observação da retirada" : "Observação do aporte",
        previousValue: null,
        newValue: payload.notes,
      });
    }

    await loadState();
    closeModal();
    toast(
      linkedTransaction
        ? isRemove
          ? "Valor removido da meta e creditado na conta."
          : "Valor adicionado à meta e debitado da conta."
        : isRemove
          ? "Valor removido da meta com sucesso."
          : "Valor adicionado à meta com sucesso.",
      "success",
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

function confirmGoalDelete(goalId) {
  confirmDialog({
    title: "Excluir meta",
    message: "A meta será marcada como excluída, preservando histórico e sincronização.",
    confirmText: "Excluir meta",
    onConfirm: async () => {
      const existing = await getOne("goals", goalId);
      if (!existing) return;
      if (!isGoalOwner(existing)) {
        return toast("Somente o dono pode excluir a meta.", "error");
      }
      const record = {
        ...existing,
        isDeleted: true,
        updatedAt: nowIso(),
        version: (existing.version || 0) + 1,
        syncStatus: "pending",
      };
      await putOne("goals", record);
      await enqueueSync("goals", record.id);
      await createGoalAuditLog(existing, "goal_deleted", {
        previousValue: existing.name,
      });
      await loadState();
      toast("Meta excluída.", "success");
    },
  });
}

function metricCard(label, value, icon) {
  return `<article class="card p-5"><div class="compact-stat-icon"><i class="fa-solid ${icon}"></i></div><div class="compact-stat-label mt-4">${label}</div><div class="compact-stat-value">${value}</div></article>`;
}

function emptyState(title, text) {
  return `<div class="card p-10 text-center lg:col-span-3"><div class="text-xl font-bold">${title}</div><div class="text-slate-500 mt-2">${text}</div></div>`;
}

function addDays(days) {
  const base = new Date();
  base.setDate(base.getDate() + days);
  return base;
}
