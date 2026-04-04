import { state, loadState } from '../state.js';
import { pageHeader, openModal, closeModal, toast, confirmDialog } from '../ui.js';
import { currency, percent, datePt } from '../utils/formatters.js';
import { putOne, getOne } from '../services/storage.js';
import { enqueueSync } from '../services/sync.js';
import { createId } from '../utils/ids.js';
import { nowIso, formatDateInput } from '../utils/dates.js';
import { validateRequired, validatePositive, validateNonNegative } from '../utils/validators.js';

export function renderGoals() {
  const goals = state.data.goals.filter((item) => !item.isDeleted);
  const activeGoals = goals.length;
  const totalTarget = goals.reduce((sum, goal) => sum + Number(goal.targetAmount || 0), 0);
  const totalCurrent = goals.reduce((sum, goal) => sum + Number(goal.currentAmount || 0), 0);
  const dueSoon = goals.filter((goal) => goal.targetDate && new Date(goal.targetDate) <= addDays(45)).length;

  return `
    ${pageHeader('Metas', 'Cadastre metas com progresso, prazo e aportes acumulados.', `<button id="new-goal-btn" class="action-btn action-btn-primary"><i class="fa-solid fa-plus mr-2"></i>Nova meta</button>`)}

    <section class="module-stack">
      <div class="grid md:grid-cols-3 gap-4">
        ${metricCard('Metas ativas', String(activeGoals), 'fa-bullseye')}
        ${metricCard('Valor alvo consolidado', currency(totalTarget), 'fa-flag-checkered')}
        ${metricCard('A vencer em 45 dias', String(dueSoon), 'fa-hourglass-half')}
      </div>

      <div class="module-card-grid">
        ${goals.map((goal) => renderGoalCard(goal)).join('') || emptyState('Nenhuma meta cadastrada', 'Crie metas para acompanhar objetivos financeiros com progresso visível.')}
      </div>
    </section>`;
}

export function bindGoalsEvents() {
  document.getElementById('new-goal-btn')?.addEventListener('click', () => openGoalModal());
  document.querySelectorAll('[data-goal-edit]').forEach((button) => button.addEventListener('click', () => openGoalModal(button.dataset.goalEdit)));
  document.querySelectorAll('[data-goal-delete]').forEach((button) => button.addEventListener('click', () => confirmGoalDelete(button.dataset.goalDelete)));
}

function renderGoalCard(goal) {
  const progress = Math.min(100, Math.round((Number(goal.currentAmount || 0) / Math.max(Number(goal.targetAmount || 1), 1)) * 100));
  return `
    <article class="card p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="text-sm text-slate-500">${goal.category || 'Meta financeira'}</div>
          <div class="text-2xl font-bold mt-1">${goal.name}</div>
        </div>
        <span class="badge ${progress >= 100 ? 'badge-success' : 'badge-muted'}">${percent(progress)}</span>
      </div>
      <div class="mt-6">
        <div class="flex items-center justify-between text-sm text-slate-500 mb-2"><span>Acumulado</span><span>${currency(goal.currentAmount || 0)} de ${currency(goal.targetAmount || 0)}</span></div>
        <div class="progress-rail"><span style="width:${progress}%"></span></div>
      </div>
      <div class="grid md:grid-cols-2 gap-3 mt-5 text-sm text-slate-500">
        <div class="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">Prazo<br><strong class="text-slate-900">${goal.targetDate ? datePt(goal.targetDate) : 'Sem prazo'}</strong></div>
        <div class="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">Aporte recente<br><strong class="text-slate-900">${currency(goal.lastContribution || 0)}</strong></div>
      </div>
      <div class="mt-5 flex gap-3 flex-wrap">
        <button class="action-btn" data-goal-edit="${goal.id}">Editar</button>
        <button class="action-btn action-btn-danger-soft" data-goal-delete="${goal.id}">Excluir</button>
      </div>
    </article>`;
}

async function openGoalModal(goalId = null) {
  const existing = goalId ? await getOne('goals', goalId) : null;
  openModal(`
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="text-2xl font-bold">${existing ? 'Editar meta' : 'Nova meta'}</div>
        <div class="text-sm text-slate-500 mt-1">Defina valor alvo, acumulado atual, prazo e contexto.</div>
      </div>
      <button id="close-modal" class="action-btn">Fechar</button>
    </div>
    <form id="goal-form" class="grid md:grid-cols-2 gap-4">
      <input type="hidden" name="id" value="${existing?.id || ''}" />
      <div><label class="text-sm font-semibold mb-2 block">Nome</label><input name="name" class="field" value="${existing?.name || ''}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Categoria</label><input name="category" class="field" value="${existing?.category || ''}" placeholder="Reserva, viagem, carro..." /></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor alvo</label><input name="targetAmount" type="number" min="0.01" step="0.01" class="field" value="${existing?.targetAmount || ''}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor atual</label><input name="currentAmount" type="number" min="0" step="0.01" class="field" value="${existing?.currentAmount || 0}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Último aporte</label><input name="lastContribution" type="number" min="0" step="0.01" class="field" value="${existing?.lastContribution || 0}" /></div>
      <div><label class="text-sm font-semibold mb-2 block">Prazo</label><input name="targetDate" type="date" class="field" value="${existing?.targetDate || formatDateInput()}" /></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3">${existing?.notes || ''}</textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-goal" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">${existing ? 'Salvar alterações' : 'Salvar meta'}</button></div>
    </form>`);

  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-goal')?.addEventListener('click', closeModal);
  document.getElementById('goal-form')?.addEventListener('submit', saveGoal);
}

async function saveGoal(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    validateRequired(payload.name, 'Nome');
    validatePositive(payload.targetAmount, 'Valor alvo');
    validateNonNegative(payload.currentAmount, 'Valor atual');
    validateNonNegative(payload.lastContribution || 0, 'Último aporte');

    const timestamp = nowIso();
    const existing = payload.id ? await getOne('goals', payload.id) : null;
    const record = {
      ...existing,
      ...payload,
      targetAmount: Number(payload.targetAmount),
      currentAmount: Number(payload.currentAmount),
      lastContribution: Number(payload.lastContribution || 0),
      id: payload.id || createId('goal'),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      version: (existing?.version || 0) + 1,
      syncStatus: 'pending',
      isDeleted: false,
    };

    await putOne('goals', record);
    await enqueueSync('goals', record.id);
    await loadState();
    closeModal();
    toast(existing ? 'Meta atualizada com sucesso.' : 'Meta salva com sucesso.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function confirmGoalDelete(goalId) {
  confirmDialog({
    title: 'Excluir meta',
    message: 'A meta será marcada como excluída, preservando histórico e sincronização.',
    confirmText: 'Excluir meta',
    onConfirm: async () => {
      const existing = await getOne('goals', goalId);
      if (!existing) return;
      const record = { ...existing, isDeleted: true, updatedAt: nowIso(), version: (existing.version || 0) + 1, syncStatus: 'pending' };
      await putOne('goals', record);
      await enqueueSync('goals', record.id);
      await loadState();
      toast('Meta excluída.', 'success');
    }
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
