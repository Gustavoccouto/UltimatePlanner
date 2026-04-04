import { state, loadState, getDerivedAccounts } from '../state.js';
import { pageHeader, openModal, closeModal, toast, confirmDialog } from '../ui.js';
import { currency, datePt } from '../utils/formatters.js';
import { createId } from '../utils/ids.js';
import { nowIso, formatDateInput, monthLabel } from '../utils/dates.js';
import { validateTransaction } from '../utils/validators.js';
import { putOne, getOne } from '../services/storage.js';
import { enqueueSync } from '../services/sync.js';
import { getCardsById, isTransactionInMonth } from '../utils/calculations.js';

export function renderTransactions() {
  const cardsById = getCardsById(state.data.creditCards);
  const rows = [...state.data.transactions]
    .filter((tx) => !tx.isDeleted && isTransactionInMonth(tx, state.ui.selectedMonth, cardsById))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const accounts = getDerivedAccounts();

  return `
    ${pageHeader('Transações', 'Receitas, despesas, transferências e ajustes com consistência de dados.', `<button id="new-transaction-btn" class="action-btn action-btn-primary"><i class="fa-solid fa-plus mr-2"></i>Nova transação</button>`) }

    <section class="module-stack">
      <div class="module-overview-grid module-overview-grid-3">
        <article class="card module-overview-card module-overview-card-primary module-overview-card-neutral-text">
          <div class="compact-stat-label">Receitas em ${monthLabel(state.ui.selectedMonth)}</div>
          <div class="module-overview-value">${currency(rows.filter((tx) => tx.type === 'income').reduce((sum, item) => sum + Number(item.amount || 0), 0))}</div>
        </article>
        <article class="card module-overview-card">
          <div class="compact-stat-label">Despesas em ${monthLabel(state.ui.selectedMonth)}</div>
          <div class="compact-stat-value">${currency(rows.filter((tx) => ['expense', 'card_expense'].includes(tx.type)).reduce((sum, item) => sum + Number(item.amount || 0), 0))}</div>
        </article>
        <article class="card module-overview-card">
          <div class="compact-stat-label">Transferências no mês</div>
          <div class="compact-stat-value">${rows.filter((tx) => tx.type === 'transfer').length}</div>
        </article>
      </div>

      <section class="card p-4 md:p-6 overflow-hidden">
        <div class="section-head section-head-spaced">
          <div>
            <div class="text-sm text-slate-500">Histórico</div>
            <div class="section-title">Lançamentos de ${monthLabel(state.ui.selectedMonth)}</div>
          </div>
          <span class="badge badge-muted">${rows.length} registro(s)</span>
        </div>
        <div class="overflow-auto">
          <table class="data-table">
            <thead>
              <tr><th>Descrição</th><th>Tipo</th><th>Conta</th><th>Data</th><th>Valor</th><th>Status</th><th>Ações</th></tr>
            </thead>
            <tbody>
              ${rows.map((tx) => {
                const account = accounts.find((item) => item.id === tx.accountId);
                const destination = accounts.find((item) => item.id === tx.destinationAccountId);
                const card = state.data.creditCards.find((item) => item.id === tx.cardId);
                return `<tr>
                  <td><div class="font-semibold">${tx.description}</div><div class="text-sm text-slate-500">${tx.category || 'Sem categoria'}${destination ? ` • para ${destination.name}` : ''}${card ? ` • ${card.name}` : ''}</div></td>
                  <td><span class="badge ${badgeByType(tx.type)}">${labelByType(tx.type)}</span></td>
                  <td>${tx.type === 'card_expense' ? (card?.name || 'Cartão removido') : (account?.name || 'Conta removida')}</td>
                  <td>${datePt(tx.date)}${tx.type === 'card_expense' ? `<div class="text-xs text-slate-500 mt-1">Comp. ${tx.billingMonth || '—'}</div>` : ''}</td>
                  <td class="font-semibold">${currency(tx.amount)}</td>
                  <td><span class="badge ${tx.syncStatus === 'synced' ? 'badge-success' : tx.syncStatus === 'failed' ? 'badge-danger' : 'badge-warning'}">${tx.syncStatus || 'pending'}</span></td>
                  <td>
                    <div class="flex gap-2 flex-wrap">
                      <button class="table-action" data-transaction-edit="${tx.id}">Editar</button>
                      <button class="table-action table-action-danger" data-transaction-delete="${tx.id}">Excluir</button>
                    </div>
                  </td>
                </tr>`;
              }).join('') || `<tr><td colspan="7" class="text-center text-slate-500 py-10">Nenhuma transação para ${monthLabel(state.ui.selectedMonth)}.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </section>`;
}

export function bindTransactionsEvents() {
  document.getElementById('new-transaction-btn')?.addEventListener('click', () => openTransactionModal());
  document.querySelectorAll('[data-transaction-edit]').forEach((button) => {
    button.addEventListener('click', () => openTransactionModal(button.dataset.transactionEdit));
  });
  document.querySelectorAll('[data-transaction-delete]').forEach((button) => {
    button.addEventListener('click', () => confirmDelete(button.dataset.transactionDelete));
  });
}

async function openTransactionModal(transactionId = null) {
  const accounts = getDerivedAccounts();
  if (!accounts.length) {
    toast('Cadastre ao menos uma conta antes de criar transações.', 'error');
    return;
  }

  const existing = transactionId ? await getOne('transactions', transactionId) : null;
  openModal(`
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="text-2xl font-bold">${existing ? 'Editar transação' : 'Nova transação'}</div>
        <div class="text-sm text-slate-500 mt-1">Suporta receita, despesa, transferência e ajuste.</div>
      </div>
      <button id="close-modal" class="action-btn">Fechar</button>
    </div>
    <form id="transaction-form" class="grid md:grid-cols-2 gap-4">
      <input type="hidden" name="id" value="${existing?.id || ''}" />
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Descrição</label><input name="description" class="field" value="${existing?.description || ''}" placeholder="Ex.: Mercado mensal" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Tipo</label><select name="type" class="select"><option value="expense" ${selected(existing?.type, 'expense')}>Despesa</option><option value="income" ${selected(existing?.type, 'income')}>Receita</option><option value="transfer" ${selected(existing?.type, 'transfer')}>Transferência</option><option value="adjustment" ${selected(existing?.type, 'adjustment')}>Ajuste</option></select></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor</label><input name="amount" type="number" min="0.01" step="0.01" class="field" value="${existing?.amount || ''}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Conta origem</label><select name="accountId" class="select">${accounts.map((item) => `<option value="${item.id}" ${selected(existing?.accountId, item.id)}>${item.name}</option>`).join('')}</select></div>
      <div><label class="text-sm font-semibold mb-2 block">Conta destino</label><select name="destinationAccountId" class="select"><option value="">Nenhuma</option>${accounts.map((item) => `<option value="${item.id}" ${selected(existing?.destinationAccountId, item.id)}>${item.name}</option>`).join('')}</select></div>
      <div><label class="text-sm font-semibold mb-2 block">Categoria</label><input name="category" class="field" value="${existing?.category || ''}" placeholder="Ex.: Alimentação" /></div>
      <div><label class="text-sm font-semibold mb-2 block">Data</label><input name="date" type="date" class="field" value="${existing?.date ? formatDateInput(existing.date) : formatDateInput()}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Status</label><select name="status" class="select"><option value="posted" ${selected(existing?.status, 'posted')}>Lançada</option><option value="scheduled" ${selected(existing?.status, 'scheduled')}>Agendada</option></select></div>
      <div><label class="text-sm font-semibold mb-2 block">Projeto vinculado</label><select name="projectId" class="select"><option value="">Nenhum</option>${state.data.projects.filter((item) => !item.isDeleted).map((item) => `<option value="${item.id}" ${selected(existing?.projectId, item.id)}>${item.name}</option>`).join('')}</select></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3">${existing?.notes || ''}</textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-transaction" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">${existing ? 'Salvar alterações' : 'Salvar transação'}</button></div>
    </form>`);

  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-transaction')?.addEventListener('click', closeModal);
  document.getElementById('transaction-form')?.addEventListener('submit', saveTransaction);
}

async function saveTransaction(event) {
  event.preventDefault();
  try {
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    validateTransaction(payload);
    const existing = payload.id ? await getOne('transactions', payload.id) : null;
    const timestamp = nowIso();
    const record = {
      ...existing,
      ...payload,
      id: payload.id || createId('tx'),
      amount: Number(payload.amount),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      version: (existing?.version || 0) + 1,
      syncStatus: 'pending',
      isDeleted: false,
    };
    await putOne('transactions', record);
    await enqueueSync('transactions', record.id);
    await loadState();
    closeModal();
    toast(existing ? 'Transação atualizada com sucesso.' : 'Transação salva com sucesso.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function confirmDelete(transactionId) {
  confirmDialog({
    title: 'Excluir transação',
    message: 'A transação será marcada como excluída e deixará de compor os saldos derivados.',
    confirmText: 'Excluir transação',
    onConfirm: async () => {
      const existing = await getOne('transactions', transactionId);
      if (!existing) return;
      const record = { ...existing, isDeleted: true, updatedAt: nowIso(), version: (existing.version || 0) + 1, syncStatus: 'pending' };
      await putOne('transactions', record);
      await enqueueSync('transactions', record.id);
      await loadState();
      toast('Transação excluída.', 'success');
    }
  });
}

function selected(value, current) {
  return value === current ? 'selected' : '';
}

function labelByType(type) {
  return ({ income: 'Receita', expense: 'Despesa', transfer: 'Transferência', adjustment: 'Ajuste', card_expense: 'Compra no cartão' })[type] || type;
}

function badgeByType(type) {
  return ({ income: 'badge-success', expense: 'badge-danger', transfer: 'badge-muted', adjustment: 'badge-warning', card_expense: 'badge-warning' })[type] || 'badge-muted';
}
