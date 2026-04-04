import { state, loadState, getDerivedAccounts } from '../state.js';
import { pageHeader, openModal, closeModal, toast, confirmDialog } from '../ui.js';
import { currency, datePt } from '../utils/formatters.js';
import { createId } from '../utils/ids.js';
import { nowIso, formatDateInput, monthLabel, addMonthsToMonthKey } from '../utils/dates.js';
import { validateCard } from '../utils/validators.js';
import { putOne, getOne, bulkPut } from '../services/storage.js';
import { enqueueSync } from '../services/sync.js';
import { deriveCardMetrics, getCardBillingMonth, isTransactionInMonth, getCardsById, buildCardFutureProjection } from '../utils/calculations.js';

export function renderCards() {
  const cards = deriveCardMetrics(state.data.creditCards, state.data.transactions, state.data.installmentPlans, state.ui.selectedMonth);
  const cardsById = getCardsById(state.data.creditCards);
  const unpaidInstallments = state.data.transactions.filter((tx) => !tx.isDeleted && tx.type === 'card_expense' && !tx.isPaid && isTransactionInMonth(tx, state.ui.selectedMonth, cardsById));
  const installmentPlans = state.data.installmentPlans.filter((plan) => !plan.isDeleted);
  const futureProjection = buildCardFutureProjection(state.data.creditCards, state.data.transactions, state.ui.selectedMonth, 4);

  return `
    ${pageHeader('Cartões', 'Cartões, faturas, parcelamentos e pagamentos com leitura clara e edição completa.', `
      <button id="new-card-btn" class="action-btn action-btn-primary"><i class="fa-solid fa-plus mr-2"></i>Novo cartão</button>
      <button id="new-card-purchase-btn" class="action-btn"><i class="fa-solid fa-bag-shopping mr-2"></i>Nova compra</button>
      <button id="pay-invoice-btn" class="action-btn"><i class="fa-solid fa-wallet mr-2"></i>Pagar fatura</button>
    `)}

    <section class="module-stack">
      <div class="module-card-grid">
        ${cards.map((card) => `
          <article class="premium-card-shell">
            <div>
              <div class="premium-card-brand-row"><span class="eyebrow !text-white/60">${card.brand}</span><i class="fa-solid fa-credit-card"></i></div>
              <div class="text-3xl font-extrabold mt-8">${card.name}</div>
              <div class="premium-card-meta"><span>Fechamento ${card.closingDay}</span><span>Vencimento ${card.dueDay}</span></div>
            </div>
            <div class="space-y-2 mt-6">
              <div class="quick-info-row"><span>Fatura ${monthLabel(state.ui.selectedMonth)}</span><strong>${currency(card.currentInvoiceAmount)}</strong></div>
              <div class="quick-info-row"><span>Limite disponível</span><strong>${currency(card.availableLimit)}</strong></div>
              <div class="quick-info-row"><span>Limite utilizado</span><strong>${currency(card.usedLimit)}</strong></div>
              <div class="quick-info-row"><span>Parcelamentos ativos</span><strong>${card.activeInstallmentsCount}</strong></div>
              <div class="mt-5 flex gap-2 flex-wrap">
                <button class="action-btn action-btn-light" data-card-edit="${card.id}">Editar</button>
                <button class="action-btn action-btn-light" data-card-delete="${card.id}">Excluir</button>
              </div>
            </div>
          </article>`).join('') || emptyState('Nenhum cartão cadastrado', 'Cadastre um cartão para controlar faturas e parcelamentos.')}
      </div>

      <div class="module-overview-grid module-overview-grid-3">
        <article class="card module-overview-card module-overview-card-neutral-text"><div class="compact-stat-label">Limite total</div><div class="module-overview-value">${currency(cards.reduce((sum, item) => sum + Number(item.limitAmount || 0), 0))}</div></article>
        <article class="card module-overview-card"><div class="compact-stat-label">Fatura em ${monthLabel(state.ui.selectedMonth)}</div><div class="compact-stat-value">${currency(cards.reduce((sum, item) => sum + Number(item.currentInvoiceAmount || 0), 0))}</div></article>
        <article class="card module-overview-card"><div class="compact-stat-label">Parcelas em ${monthLabel(state.ui.selectedMonth)}</div><div class="compact-stat-value">${unpaidInstallments.length}</div></article>
      </div>

      <section class="card p-4 md:p-6 overflow-hidden">
        <div class="section-head section-head-spaced"><div><div class="text-sm text-slate-500">Controle</div><div class="section-title">Cartões cadastrados</div></div></div>
        <div class="overflow-auto">
          <table class="data-table">
            <thead><tr><th>Cartão</th><th>Limite</th><th>Disponível</th><th>Fechamento</th><th>Vencimento</th><th>Fatura</th><th>Ações</th></tr></thead>
            <tbody>
              ${cards.map((card) => `
                <tr>
                  <td class="font-semibold">${card.name}<div class="text-sm text-slate-500">${card.brand}</div></td>
                  <td>${currency(card.limitAmount)}</td><td>${currency(card.availableLimit)}</td><td>Dia ${card.closingDay}</td><td>Dia ${card.dueDay}</td><td>${currency(card.currentInvoiceAmount)}<div class="text-xs text-slate-500 mt-1">Comp. ${monthLabel(state.ui.selectedMonth)}</div></td>
                  <td><div class="flex gap-2 flex-wrap"><button class="table-action" data-card-edit="${card.id}">Editar</button><button class="table-action table-action-danger" data-card-delete="${card.id}">Excluir</button></div></td>
                </tr>`).join('') || `<tr><td colspan="7" class="text-center text-slate-500 py-10">Nenhum cartão cadastrado.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card p-4 md:p-6 overflow-hidden">
        <div class="section-head section-head-spaced"><div><div class="text-sm text-slate-500">Parcelamentos</div><div class="section-title">Planos ativos</div></div></div>
        <div class="overflow-auto">
          <table class="data-table">
            <thead><tr><th>Descrição</th><th>Cartão</th><th>Total</th><th>Parcelas</th><th>Restantes</th><th>Compra</th></tr></thead>
            <tbody>
              ${installmentPlans.map((plan) => {
                const card = cards.find((item) => item.id === plan.cardId);
                return `<tr><td class="font-semibold">${plan.description}</td><td>${card?.name || 'Cartão removido'}</td><td>${currency(plan.totalAmount)}</td><td>${plan.installmentCount}</td><td>${plan.remainingInstallments}</td><td>${datePt(plan.purchaseDate)}</td></tr>`;
              }).join('') || `<tr><td colspan="6" class="text-center text-slate-500 py-10">Nenhum parcelamento ativo.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card p-4 md:p-6 overflow-hidden">
        <div class="section-head section-head-spaced"><div><div class="text-sm text-slate-500">Projeção</div><div class="section-title">Próximas faturas por cartão</div></div><span class="badge badge-muted">4 competências a partir de ${monthLabel(state.ui.selectedMonth)}</span></div>
        <div class="space-y-4">
          ${futureProjection.map((projection) => `
            <div class="rounded-[28px] border border-slate-100 bg-slate-50/70 p-4 md:p-5">
              <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div>
                  <div class="text-base font-bold text-slate-900">${projection.cardName}</div>
                  <div class="text-sm text-slate-500">${projection.cardBrand} • Limite ${currency(projection.limitAmount)}</div>
                </div>
                <div class="text-sm text-slate-500">Projeção de competências em aberto</div>
              </div>
              <div class="overflow-auto">
                <table class="data-table">
                  <thead><tr><th>Competência</th><th>Vencimento</th><th>Itens</th><th>Fatura projetada</th><th>Saldo aberto acumulado</th><th>Limite disponível projetado</th></tr></thead>
                  <tbody>
                    ${projection.months.map((item) => `
                      <tr>
                        <td class="font-semibold">${item.monthLabel}</td>
                        <td>${datePt(item.dueDate)}</td>
                        <td>${item.projectedItemsCount}</td>
                        <td>${currency(item.projectedInvoiceAmount)}</td>
                        <td>${currency(item.cumulativeOpenBalance)}</td>
                        <td>${currency(item.projectedAvailableLimit)}</td>
                      </tr>`).join('')}
                  </tbody>
                </table>
              </div>
            </div>`).join('') || emptyState('Sem cartões para projetar', 'Cadastre um cartão e compras futuras para ver a projeção de faturas.')}
        </div>
      </section>
    </section>`;
}

export function bindCardsEvents() {
  document.getElementById('new-card-btn')?.addEventListener('click', () => openCardModal());
  document.getElementById('new-card-purchase-btn')?.addEventListener('click', () => openPurchaseModal());
  document.getElementById('pay-invoice-btn')?.addEventListener('click', () => openInvoicePaymentModal());
  document.querySelectorAll('[data-card-edit]').forEach((button) => button.addEventListener('click', () => openCardModal(button.dataset.cardEdit)));
  document.querySelectorAll('[data-card-delete]').forEach((button) => button.addEventListener('click', () => confirmDelete(button.dataset.cardDelete)));
}

async function openCardModal(cardId = null) {
  const existing = cardId ? await getOne('creditCards', cardId) : null;
  openModal(`
    <div class="flex items-center justify-between mb-6"><div><div class="text-2xl font-bold">${existing ? 'Editar cartão' : 'Novo cartão'}</div><div class="text-sm text-slate-500 mt-1">Defina bandeira, limite, fechamento e vencimento.</div></div><button id="close-modal" class="action-btn">Fechar</button></div>
    <form id="card-form" class="grid md:grid-cols-2 gap-4">
      <input type="hidden" name="id" value="${existing?.id || ''}" />
      <div><label class="text-sm font-semibold mb-2 block">Nome do cartão</label><input name="name" class="field" value="${existing?.name || ''}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Bandeira</label><input name="brand" class="field" value="${existing?.brand || ''}" placeholder="Visa, Mastercard..." required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Limite</label><input name="limitAmount" type="number" min="1" step="0.01" class="field" value="${existing?.limitAmount || ''}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Dia do fechamento</label><input name="closingDay" type="number" min="1" max="31" class="field" value="${existing?.closingDay || 1}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Dia do vencimento</label><input name="dueDay" type="number" min="1" max="31" class="field" value="${existing?.dueDay || 1}" required /></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3">${existing?.notes || ''}</textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-card" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">${existing ? 'Salvar alterações' : 'Salvar cartão'}</button></div>
    </form>`);

  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-card')?.addEventListener('click', closeModal);
  document.getElementById('card-form')?.addEventListener('submit', saveCard);
}

async function saveCard(event) {
  event.preventDefault();
  try {
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    validateCard(payload);
    const existing = payload.id ? await getOne('creditCards', payload.id) : null;
    const timestamp = nowIso();
    const record = {
      ...existing,
      ...payload,
      id: payload.id || createId('card'),
      limitAmount: Number(payload.limitAmount),
      dueDay: Number(payload.dueDay),
      closingDay: Number(payload.closingDay),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      version: (existing?.version || 0) + 1,
      syncStatus: 'pending',
      isDeleted: false,
    };
    await putOne('creditCards', record);
    await enqueueSync('creditCards', record.id);
    await loadState();
    closeModal();
    toast(existing ? 'Cartão atualizado com sucesso.' : 'Cartão salvo com sucesso.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function confirmDelete(cardId) {
  confirmDialog({
    title: 'Excluir cartão',
    message: 'O cartão será marcado como excluído. O histórico será mantido para referência.',
    confirmText: 'Excluir cartão',
    onConfirm: async () => {
      const existing = await getOne('creditCards', cardId);
      if (!existing) return;
      const record = { ...existing, isDeleted: true, updatedAt: nowIso(), version: (existing.version || 0) + 1, syncStatus: 'pending' };
      await putOne('creditCards', record);
      await enqueueSync('creditCards', record.id);
      await loadState();
      toast('Cartão excluído.', 'success');
    }
  });
}

function openPurchaseModal() {
  const cards = state.data.creditCards.filter((item) => !item.isDeleted);
  if (!cards.length) {
    toast('Cadastre um cartão antes de lançar compras.', 'error');
    return;
  }
  openModal(`
    <div class="flex items-center justify-between mb-6"><div><div class="text-2xl font-bold">Nova compra no cartão</div><div class="text-sm text-slate-500 mt-1">Lance compras únicas ou parceladas. Cada parcela vira um item JSON sincronizável.</div></div><button id="close-modal" class="action-btn">Fechar</button></div>
    <form id="purchase-form" class="grid md:grid-cols-2 gap-4">
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Descrição</label><input name="description" class="field" placeholder="Ex.: Notebook" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Cartão</label><select name="cardId" class="select">${cards.map((card) => `<option value="${card.id}">${card.name}</option>`).join('')}</select></div>
      <div><label class="text-sm font-semibold mb-2 block">Categoria</label><input name="category" class="field" placeholder="Tecnologia" /></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor total</label><input name="totalAmount" type="number" min="0.01" step="0.01" class="field" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Parcelas</label><input name="installmentCount" type="number" min="1" max="36" value="1" class="field" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Data da compra</label><input name="purchaseDate" type="date" class="field" value="${formatDateInput()}" required /></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3"></textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-purchase" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">Salvar compra</button></div>
    </form>`);

  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-purchase')?.addEventListener('click', closeModal);
  document.getElementById('purchase-form')?.addEventListener('submit', savePurchase);
}

async function savePurchase(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const totalAmount = Number(payload.totalAmount);
    const installmentCount = Number(payload.installmentCount);
    if (totalAmount <= 0 || installmentCount <= 0) throw new Error('Valor e quantidade de parcelas devem ser maiores que zero.');

    const timestamp = nowIso();
    const planId = createId('plan');
    const plan = {
      id: planId,
      cardId: payload.cardId,
      description: payload.description,
      totalAmount,
      installmentCount,
      remainingInstallments: installmentCount,
      purchaseDate: payload.purchaseDate,
      notes: payload.notes,
      invoiceMonth: state.ui.selectedMonth,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      syncStatus: 'pending',
      isDeleted: false,
    };

    const baseInstallmentValue = Math.round((totalAmount / installmentCount) * 100) / 100;
    let consumed = 0;
    const txs = Array.from({ length: installmentCount }).map((_, index) => {
      const number = index + 1;
      const amount = number === installmentCount ? Math.round((totalAmount - consumed) * 100) / 100 : baseInstallmentValue;
      consumed += amount;
      return {
        id: createId('tx'),
        description: `${payload.description} ${number}/${installmentCount}`,
        type: 'card_expense',
        cardId: payload.cardId,
        installmentPlanId: planId,
        installmentNumber: number,
        installmentTotal: installmentCount,
        amount,
        category: payload.category,
        date: addMonths(payload.purchaseDate, index),
        billingMonth: addMonthsToMonthKey(getCardBillingMonth(payload.purchaseDate, state.data.creditCards.find((item) => item.id === payload.cardId)?.closingDay), index),
        notes: payload.notes,
        status: 'posted',
        isPaid: false,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
        syncStatus: 'pending',
        isDeleted: false,
      };
    });

    await putOne('installmentPlans', plan);
    await enqueueSync('installmentPlans', plan.id);
    await bulkPut('transactions', txs);
    await Promise.all(txs.map((tx) => enqueueSync('transactions', tx.id)));
    await loadState();
    closeModal();
    toast('Compra lançada e parcelamento criado.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function openInvoicePaymentModal() {
  const cards = deriveCardMetrics(state.data.creditCards, state.data.transactions, state.data.installmentPlans, state.ui.selectedMonth);
  const accounts = getDerivedAccounts().filter((item) => !item.isDeleted);
  if (!cards.length || !accounts.length) {
    toast('Cadastre conta e cartão antes de pagar faturas.', 'error');
    return;
  }
  openModal(`
    <div class="flex items-center justify-between mb-6"><div><div class="text-2xl font-bold">Pagar fatura</div><div class="text-sm text-slate-500 mt-1">Ao pagar, o app cria a saída na conta e baixa apenas as parcelas em aberto da competência selecionada.</div></div><button id="close-modal" class="action-btn">Fechar</button></div>
    <form id="invoice-form" class="grid md:grid-cols-2 gap-4">
      <div><label class="text-sm font-semibold mb-2 block">Cartão</label><select name="cardId" id="invoice-card-id" class="select">${cards.map((card) => `<option value="${card.id}" data-amount="${card.currentInvoiceAmount}">${card.name} • ${currency(card.currentInvoiceAmount)}</option>`).join('')}</select></div>
      <div><label class="text-sm font-semibold mb-2 block">Conta de pagamento</label><select name="accountId" class="select">${accounts.map((account) => `<option value="${account.id}">${account.name}</option>`).join('')}</select></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor pago</label><input id="invoice-amount" name="amount" type="number" min="0.01" step="0.01" class="field" value="${cards[0]?.currentInvoiceAmount || 0}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Competência</label><input class="field" value="${monthLabel(state.ui.selectedMonth)}" disabled /></div>
      <div><label class="text-sm font-semibold mb-2 block">Data</label><input name="date" type="date" class="field" value="${formatDateInput()}" required /></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3"></textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-invoice" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">Registrar pagamento</button></div>
    </form>`);

  document.getElementById('invoice-card-id')?.addEventListener('change', (event) => {
    const option = event.target.selectedOptions[0];
    document.getElementById('invoice-amount').value = option?.dataset?.amount || 0;
  });
  document.getElementById('close-modal')?.addEventListener('click', closeModal);
  document.getElementById('cancel-invoice')?.addEventListener('click', closeModal);
  document.getElementById('invoice-form')?.addEventListener('submit', saveInvoicePayment);
}

async function saveInvoicePayment(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const amount = Number(payload.amount);
    if (amount <= 0) throw new Error('Valor pago deve ser maior que zero.');

    const timestamp = nowIso();
    const payment = {
      id: createId('tx'),
      description: `Pagamento de fatura ${monthLabel(state.ui.selectedMonth)}`,
      type: 'expense',
      accountId: payload.accountId,
      amount,
      category: 'Cartão de crédito',
      date: payload.date,
      cardId: payload.cardId,
      notes: payload.notes,
      invoiceMonth: state.ui.selectedMonth,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      syncStatus: 'pending',
      isDeleted: false,
    };

    await putOne('transactions', payment);
    await enqueueSync('transactions', payment.id);

    const cardsById = getCardsById(state.data.creditCards);
    const openInstallments = state.data.transactions
      .filter((tx) => !tx.isDeleted && tx.type === 'card_expense' && tx.cardId === payload.cardId && !tx.isPaid && isTransactionInMonth(tx, state.ui.selectedMonth, cardsById))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    let remaining = amount;
    const updates = [];
    for (const tx of openInstallments) {
      if (remaining <= 0) break;
      if (remaining >= Number(tx.amount)) {
        remaining -= Number(tx.amount);
        updates.push({ ...tx, isPaid: true, paymentTransactionId: payment.id, updatedAt: timestamp, version: (tx.version || 0) + 1, syncStatus: 'pending' });
      }
    }

    if (updates.length) {
      await bulkPut('transactions', updates);
      await Promise.all(updates.map((tx) => enqueueSync('transactions', tx.id)));
    }

    const plans = state.data.installmentPlans.filter((plan) => !plan.isDeleted);
    const planUpdates = plans.map((plan) => {
      const related = state.data.transactions.filter((tx) => !tx.isDeleted && tx.installmentPlanId === plan.id);
      const remainingInstallments = related.filter((tx) => {
        const updated = updates.find((item) => item.id === tx.id) || tx;
        return !updated.isPaid;
      }).length;
      if (remainingInstallments === plan.remainingInstallments) return null;
      return { ...plan, remainingInstallments, updatedAt: timestamp, version: (plan.version || 0) + 1, syncStatus: 'pending' };
    }).filter(Boolean);

    if (planUpdates.length) {
      await bulkPut('installmentPlans', planUpdates);
      await Promise.all(planUpdates.map((plan) => enqueueSync('installmentPlans', plan.id)));
    }

    await loadState();
    closeModal();
    toast('Pagamento da fatura registrado com sucesso.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function addMonths(dateInput, months) {
  const d = new Date(dateInput);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}


function emptyState(title, text) {
  return `<div class="card p-10 text-center lg:col-span-3"><div class="text-xl font-bold">${title}</div><div class="text-slate-500 mt-2">${text}</div></div>`;
}
