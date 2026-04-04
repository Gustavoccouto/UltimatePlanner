import { state, getDerivedAccounts, loadState } from '../state.js';
import { pageHeader, openModal, closeModal, toast, confirmDialog } from '../ui.js';
import { currency } from '../utils/formatters.js';
import { createId } from '../utils/ids.js';
import { nowIso } from '../utils/dates.js';
import { validateAccount } from '../utils/validators.js';
import { putOne, getOne } from '../services/storage.js';
import { enqueueSync } from '../services/sync.js';

export function renderAccounts() {
  const accounts = getDerivedAccounts().filter((account) => !account.isDeleted);
  const activeTransactions = state.data.transactions.filter((item) => !item.isDeleted);

  return `
    ${pageHeader('Contas', 'Gerencie bancos e contas com saldo sempre derivado pelas transações.', `<button id="new-account-btn" class="action-btn action-btn-primary"><i class="fa-solid fa-plus mr-2"></i>Nova conta</button>`)}

    <section class="module-stack">
      <div class="module-card-grid">
        ${accounts.map((account) => {
          const txCount = activeTransactions.filter((tx) => tx.accountId === account.id || tx.destinationAccountId === account.id).length;
          return `
            <article class="card account-showcase-card">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="text-sm text-slate-500">${account.bankName}</div>
                  <div class="text-2xl font-bold mt-1">${account.name}</div>
                </div>
                <span class="badge badge-muted">${labelByType(account.type)}</span>
              </div>
              <div class="text-4xl font-extrabold tracking-tight mt-7">${currency(account.derivedBalance)}</div>
              <div class="text-sm text-slate-500 mt-2">Saldo derivado de ${txCount} movimentação(ões)</div>
              <div class="mt-6 flex gap-3 flex-wrap">
                <button class="action-btn" data-account-edit="${account.id}"><i class="fa-solid fa-pen mr-2"></i>Editar</button>
                <button class="action-btn action-btn-danger-soft" data-account-delete="${account.id}"><i class="fa-solid fa-trash mr-2"></i>Excluir</button>
              </div>
            </article>`;
        }).join('') || emptyState('Nenhuma conta cadastrada', 'Adicione sua primeira conta para começar a derivar saldos e organizar movimentações.')}
      </div>

      <section class="card p-4 md:p-6 overflow-hidden">
        <div class="section-head section-head-spaced">
          <div>
            <div class="text-sm text-slate-500">Mapa das contas</div>
            <div class="section-title">Resumo operacional</div>
          </div>
          <span class="badge badge-muted">${accounts.length} conta(s)</span>
        </div>
        <div class="overflow-auto">
          <table class="data-table">
            <thead>
              <tr><th>Conta</th><th>Banco</th><th>Tipo</th><th>Saldo derivado</th><th>Ações</th></tr>
            </thead>
            <tbody>
              ${accounts.map((account) => `
                <tr>
                  <td><div class="font-semibold">${account.name}</div></td>
                  <td>${account.bankName}</td>
                  <td>${labelByType(account.type)}</td>
                  <td class="font-semibold">${currency(account.derivedBalance)}</td>
                  <td>
                    <div class="flex gap-2 flex-wrap">
                      <button class="table-action" data-account-edit="${account.id}">Editar</button>
                      <button class="table-action table-action-danger" data-account-delete="${account.id}">Excluir</button>
                    </div>
                  </td>
                </tr>`).join('') || `<tr><td colspan="5" class="text-center text-slate-500 py-10">Nenhuma conta cadastrada.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </section>`;
}

export function bindAccountsEvents() {
  document.getElementById('new-account-btn')?.addEventListener('click', () => openAccountModal());
  document.querySelectorAll('[data-account-edit]').forEach((button) => {
    button.addEventListener('click', async () => openAccountModal(button.dataset.accountEdit));
  });
  document.querySelectorAll('[data-account-delete]').forEach((button) => {
    button.addEventListener('click', () => confirmDelete(button.dataset.accountDelete));
  });
}

async function openAccountModal(accountId = null) {
  const existing = accountId ? await getOne('accounts', accountId) : null;
  openModal(`
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="text-2xl font-bold">${existing ? 'Editar conta' : 'Nova conta'}</div>
        <div class="text-sm text-slate-500 mt-1">Campos principais para cadastro, edição e exclusão segura.</div>
      </div>
      <button id="close-modal" class="action-btn">Fechar</button>
    </div>
    <form id="account-form" class="grid md:grid-cols-2 gap-4">
      <input type="hidden" name="id" value="${existing?.id || ''}" />
      <div><label class="text-sm font-semibold mb-2 block">Nome da conta</label><input name="name" class="field" value="${existing?.name || ''}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Banco</label><input name="bankName" class="field" value="${existing?.bankName || ''}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Tipo</label><select name="type" class="select"><option value="checking" ${selected(existing?.type, 'checking')}>Conta corrente</option><option value="savings" ${selected(existing?.type, 'savings')}>Poupança</option><option value="investment" ${selected(existing?.type, 'investment')}>Investimento</option></select></div>
      <div><label class="text-sm font-semibold mb-2 block">Moeda</label><input name="currency" class="field" value="${existing?.currency || 'BRL'}" /></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3">${existing?.notes || ''}</textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-account" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">${existing ? 'Salvar alterações' : 'Salvar conta'}</button></div>
    </form>`);

  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-account')?.addEventListener('click', closeModal);
  document.getElementById('account-form')?.addEventListener('submit', saveAccount);
}

async function saveAccount(event) {
  event.preventDefault();
  try {
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    validateAccount(payload);
    const timestamp = nowIso();
    const existing = payload.id ? await getOne('accounts', payload.id) : null;
    const record = {
      ...existing,
      ...payload,
      id: payload.id || createId('acct'),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      version: (existing?.version || 0) + 1,
      syncStatus: 'pending',
      isDeleted: false,
    };

    await putOne('accounts', record);
    await enqueueSync('accounts', record.id);
    await loadState();
    closeModal();
    toast(existing ? 'Conta atualizada com sucesso.' : 'Conta salva com sucesso.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function confirmDelete(accountId) {
  confirmDialog({
    title: 'Excluir conta',
    message: 'A conta será marcada como excluída. O histórico fica preservado para integridade dos dados.',
    confirmText: 'Excluir conta',
    onConfirm: async () => {
      const existing = await getOne('accounts', accountId);
      if (!existing) return;
      const record = { ...existing, isDeleted: true, updatedAt: nowIso(), version: (existing.version || 0) + 1, syncStatus: 'pending' };
      await putOne('accounts', record);
      await enqueueSync('accounts', record.id);
      await loadState();
      toast('Conta excluída.', 'success');
    }
  });
}

function selected(value, current) {
  return value === current ? 'selected' : '';
}

function labelByType(type) {
  return ({ checking: 'Conta corrente', savings: 'Poupança', investment: 'Investimento' })[type] || type;
}

function emptyState(title, text) {
  return `<div class="card p-10 text-center lg:col-span-3"><div class="text-xl font-bold">${title}</div><div class="text-slate-500 mt-2">${text}</div></div>`;
}
