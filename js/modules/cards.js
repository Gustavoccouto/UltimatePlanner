import { state, loadState, getDerivedAccounts } from "../state.js";
import {
  pageHeader,
  openModal,
  closeModal,
  toast,
  confirmDialog,
} from "../ui.js";
import { currency, datePt } from "../utils/formatters.js";
import { createId } from "../utils/ids.js";
import {
  nowIso,
  formatDateInput,
  monthLabel,
  addMonthsToMonthKey,
  addMonthsToDateInput,
  compareDateInputs,
  toMonthKey,
} from "../utils/dates.js";
import { validateCard } from "../utils/validators.js";
import { putOne, getOne, getAll, bulkPut } from "../services/storage.js";
import { enqueueSync } from "../services/sync.js";
import {
  deriveCardMetrics,
  getCardBillingMonth,
  isTransactionInMonth,
  getCardsById,
  buildCardFutureProjection,
} from "../utils/calculations.js";
import {
  CREDIT_INSTALLMENT_METHOD,
  INSTALLMENT_STATUS,
  getCreditInstallmentPlans,
  getInstallmentStatus,
  getInstallmentStatusLabel,
  getInstallmentStatusBadge,
  buildInstallmentPlanView,
} from "../services/planning.js";

export function renderCards() {
  const cards = deriveCardMetrics(
    state.data.creditCards,
    state.data.transactions,
    state.data.installmentPlans,
    state.ui.selectedMonth,
  );
  const cardsById = getCardsById(state.data.creditCards);
  const unpaidInstallments = state.data.transactions.filter(
    (transaction) =>
      !transaction.isDeleted &&
      transaction.type === "card_expense" &&
      !transaction.isPaid &&
      isTransactionInMonth(transaction, state.ui.selectedMonth, cardsById),
  );
  const installmentPlans = getCreditInstallmentPlans(
    state.data.installmentPlans,
  )
    .map((plan) =>
      buildInstallmentPlanView(
        plan,
        state.data.transactions,
        state.data.creditCards,
      ),
    )
    .sort((a, b) => compareDateInputs(b.purchaseDate, a.purchaseDate));
  const futureProjection = buildCardFutureProjection(
    state.data.creditCards,
    state.data.transactions,
    state.ui.selectedMonth,
    4,
  );

  return `
    ${pageHeader(
      "Cartões",
      "Cartões, faturas, parcelamentos e pagamentos com leitura clara e edição completa.",
      `
      <button id="new-card-btn" class="action-btn action-btn-primary"><i class="fa-solid fa-plus mr-2"></i>Novo cartão</button>
      <button id="new-card-purchase-btn" class="action-btn"><i class="fa-solid fa-bag-shopping mr-2"></i>Nova compra</button>
      <button id="pay-invoice-btn" class="action-btn"><i class="fa-solid fa-wallet mr-2"></i>Pagar fatura</button>
    `,
    )}

    <section class="module-stack">
      <div class="module-card-grid">
        ${
          cards
            .map(
              (card) => `
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
          </article>`,
            )
            .join("") ||
          emptyState(
            "Nenhum cartão cadastrado",
            "Cadastre um cartão para controlar faturas e parcelamentos.",
          )
        }
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
              ${
                cards
                  .map(
                    (card) => `
                <tr>
                  <td class="font-semibold">${card.name}<div class="text-sm text-slate-500">${card.brand}</div></td>
                  <td>${currency(card.limitAmount)}</td><td>${currency(card.availableLimit)}</td><td>Dia ${card.closingDay}</td><td>Dia ${card.dueDay}</td><td>${currency(card.currentInvoiceAmount)}<div class="text-xs text-slate-500 mt-1">Comp. ${monthLabel(state.ui.selectedMonth)}</div></td>
                  <td><div class="flex gap-2 flex-wrap"><button class="table-action" data-card-edit="${card.id}">Editar</button><button class="table-action table-action-danger" data-card-delete="${card.id}">Excluir</button></div></td>
                </tr>`,
                  )
                  .join("") ||
                `<tr><td colspan="7" class="text-center text-slate-500 py-10">Nenhum cartão cadastrado.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card p-4 md:p-6 overflow-hidden">
        ${renderInstallmentExperienceStyles("credit")}
        <div class="section-head section-head-spaced">
          <div><div class="text-sm text-slate-500">Parcelamentos</div><div class="section-title">Planos ativos</div></div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="badge badge-muted">${installmentPlans.length} plano(s)</span>
            ${
              installmentPlans.length
                ? `<button class="table-action" id="expand-all-credit-plans-btn">Expandir tudo</button>
                   <button class="table-action" id="collapse-all-credit-plans-btn">Recolher tudo</button>`
                : ""
            }
          </div>
        </div>
        <div id="cards-plans-root" class="installment-plan-grid">
          ${
            installmentPlans.map(renderCreditInstallmentPlanCard).join("") ||
            `<div class="installment-empty-state">Nenhum parcelamento ativo.</div>`
          }
        </div>
      </section>

      <section class="card p-4 md:p-6 overflow-hidden">
        <div class="section-head section-head-spaced"><div><div class="text-sm text-slate-500">Projeção</div><div class="section-title">Próximas faturas por cartão</div></div><span class="badge badge-muted">4 competências a partir de ${monthLabel(state.ui.selectedMonth)}</span></div>
        <div class="space-y-4">
          ${
            futureProjection
              .map(
                (projection) => `
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
                    ${projection.months
                      .map(
                        (item) => `
                      <tr>
                        <td class="font-semibold">${item.monthLabel}</td>
                        <td>${datePt(item.dueDate)}</td>
                        <td>${item.projectedItemsCount}</td>
                        <td>${currency(item.projectedInvoiceAmount)}</td>
                        <td>${currency(item.cumulativeOpenBalance)}</td>
                        <td>${currency(item.projectedAvailableLimit)}</td>
                      </tr>`,
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            </div>`,
              )
              .join("") ||
            emptyState(
              "Sem cartões para projetar",
              "Cadastre um cartão e compras futuras para ver a projeção de faturas.",
            )
          }
        </div>
      </section>
    </section>`;
}

export function bindCardsEvents() {
  document
    .getElementById("new-card-btn")
    ?.addEventListener("click", () => openCardModal());
  document
    .getElementById("new-card-purchase-btn")
    ?.addEventListener("click", () => openPurchaseModal());
  document
    .getElementById("pay-invoice-btn")
    ?.addEventListener("click", () => openInvoicePaymentModal());
  document
    .querySelectorAll("[data-card-edit]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        openCardModal(button.dataset.cardEdit),
      ),
    );
  document
    .querySelectorAll("[data-card-delete]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        confirmDelete(button.dataset.cardDelete),
      ),
    );
  bindCreditPlanInteractions();
  document
    .getElementById("expand-all-credit-plans-btn")
    ?.addEventListener("click", () => setAllCreditPlansExpanded(true));
  document
    .getElementById("collapse-all-credit-plans-btn")
    ?.addEventListener("click", () => setAllCreditPlansExpanded(false));
}

async function openCardModal(cardId = null) {
  const existing = cardId ? await getOne("creditCards", cardId) : null;
  openModal(`
    <div class="flex items-center justify-between mb-6"><div><div class="text-2xl font-bold">${existing ? "Editar cartão" : "Novo cartão"}</div><div class="text-sm text-slate-500 mt-1">Defina bandeira, limite, fechamento e vencimento.</div></div><button id="close-modal" class="action-btn">Fechar</button></div>
    <form id="card-form" class="grid md:grid-cols-2 gap-4">
      <input type="hidden" name="id" value="${existing?.id || ""}" />
      <div><label class="text-sm font-semibold mb-2 block">Nome do cartão</label><input name="name" class="field" value="${existing?.name || ""}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Bandeira</label><input name="brand" class="field" value="${existing?.brand || ""}" placeholder="Visa, Mastercard..." required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Limite</label><input name="limitAmount" type="number" min="1" step="0.01" class="field" value="${existing?.limitAmount || ""}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Dia do fechamento</label><input name="closingDay" type="number" min="1" max="31" class="field" value="${existing?.closingDay || 1}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Dia do vencimento</label><input name="dueDay" type="number" min="1" max="31" class="field" value="${existing?.dueDay || 1}" required /></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3">${existing?.notes || ""}</textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-card" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">${existing ? "Salvar alterações" : "Salvar cartão"}</button></div>
    </form>`);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document.getElementById("cancel-card")?.addEventListener("click", closeModal);
  document.getElementById("card-form")?.addEventListener("submit", saveCard);
}

async function saveCard(event) {
  event.preventDefault();
  try {
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    validateCard(payload);
    const existing = payload.id
      ? await getOne("creditCards", payload.id)
      : null;
    const timestamp = nowIso();
    const record = {
      ...existing,
      ...payload,
      id: payload.id || createId("card"),
      limitAmount: Number(payload.limitAmount),
      dueDay: Number(payload.dueDay),
      closingDay: Number(payload.closingDay),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      version: (existing?.version || 0) + 1,
      syncStatus: "pending",
      isDeleted: false,
    };
    await putOne("creditCards", record);
    await enqueueSync("creditCards", record.id);
    await loadState();
    closeModal();
    toast(
      existing ? "Cartão atualizado com sucesso." : "Cartão salvo com sucesso.",
      "success",
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

function confirmDelete(cardId) {
  confirmDialog({
    title: "Excluir cartão",
    message:
      "O cartão será marcado como excluído. O histórico será mantido para referência.",
    confirmText: "Excluir cartão",
    onConfirm: async () => {
      const existing = await getOne("creditCards", cardId);
      if (!existing) return;
      const record = {
        ...existing,
        isDeleted: true,
        updatedAt: nowIso(),
        version: (existing.version || 0) + 1,
        syncStatus: "pending",
      };
      await putOne("creditCards", record);
      await enqueueSync("creditCards", record.id);
      await loadState();
      toast("Cartão excluído.", "success");
    },
  });
}

function openPurchaseModal() {
  const cards = state.data.creditCards.filter((item) => !item.isDeleted);
  if (!cards.length) {
    toast("Cadastre um cartão antes de lançar compras.", "error");
    return;
  }
  openModal(`
    <div class="flex items-center justify-between mb-6"><div><div class="text-2xl font-bold">Nova compra no cartão</div><div class="text-sm text-slate-500 mt-1">Lance compras únicas ou parceladas. Cada parcela vira um item expandível e sincronizável.</div></div><button id="close-modal" class="action-btn">Fechar</button></div>
    <form id="purchase-form" class="grid md:grid-cols-2 gap-4">
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Descrição</label><input name="description" class="field" placeholder="Ex.: Notebook" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Cartão</label><select name="cardId" class="select">${cards.map((card) => `<option value="${card.id}">${card.name}</option>`).join("")}</select></div>
      <div><label class="text-sm font-semibold mb-2 block">Categoria</label><input name="category" class="field" placeholder="Tecnologia" /></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor total</label><input name="totalAmount" type="number" min="0.01" step="0.01" class="field" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Parcelas</label><input name="installmentCount" type="number" min="1" max="36" value="1" class="field" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Data da compra</label><input name="purchaseDate" type="date" class="field" value="${formatDateInput()}" required /></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3"></textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-purchase" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">Salvar compra</button></div>
    </form>`);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document
    .getElementById("cancel-purchase")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("purchase-form")
    ?.addEventListener("submit", savePurchase);
}

async function savePurchase(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const totalAmount = Number(payload.totalAmount);
    const installmentCount = Number(payload.installmentCount);
    if (totalAmount <= 0 || installmentCount <= 0) {
      throw new Error(
        "Valor e quantidade de parcelas devem ser maiores que zero.",
      );
    }

    const timestamp = nowIso();
    const planId = createId("plan");
    const selectedCard = state.data.creditCards.find(
      (item) => item.id === payload.cardId,
    );
    if (!selectedCard) {
      throw new Error("Selecione um cartão válido para lançar a compra.");
    }

    const firstBillingMonth =
      getCardBillingMonth(
        payload.purchaseDate,
        selectedCard.closingDay,
        selectedCard.dueDay,
      ) || toMonthKey(payload.purchaseDate);

    const plan = {
      id: planId,
      paymentMethod: CREDIT_INSTALLMENT_METHOD,
      cardId: payload.cardId,
      description: payload.description,
      category: payload.category || "",
      totalAmount,
      installmentCount,
      remainingInstallments: installmentCount,
      purchaseDate: payload.purchaseDate,
      notes: payload.notes,
      invoiceMonth: firstBillingMonth,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      syncStatus: "pending",
      isDeleted: false,
    };

    const baseInstallmentValue =
      Math.round((totalAmount / installmentCount) * 100) / 100;
    let consumed = 0;
    const transactions = Array.from({ length: installmentCount }).map(
      (_, index) => {
        const installmentNumber = index + 1;
        const amount =
          installmentNumber === installmentCount
            ? Math.round((totalAmount - consumed) * 100) / 100
            : baseInstallmentValue;
        consumed += amount;
        const installmentDate = addMonthsToDateInput(payload.purchaseDate, index);
        return {
          id: createId("tx"),
          description: `${payload.description} ${installmentNumber}/${installmentCount}`,
          type: "card_expense",
          cardId: payload.cardId,
          installmentPlanId: planId,
          installmentNumber,
          installmentTotal: installmentCount,
          installmentStatus: INSTALLMENT_STATUS.pending,
          amount,
          category: payload.category,
          date: installmentDate,
          billingMonth: addMonthsToMonthKey(firstBillingMonth, index),
          notes: payload.notes,
          status: "posted",
          isPaid: false,
          createdAt: timestamp,
          updatedAt: timestamp,
          version: 1,
          syncStatus: "pending",
          isDeleted: false,
        };
      },
    );

    await putOne("installmentPlans", plan);
    await enqueueSync("installmentPlans", plan.id);
    await bulkPut("transactions", transactions);
    await Promise.all(
      transactions.map((transaction) =>
        enqueueSync("transactions", transaction.id),
      ),
    );
    await loadState();
    closeModal();
    toast("Compra lançada e parcelamento criado.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

function openInvoicePaymentModal() {
  const cards = deriveCardMetrics(
    state.data.creditCards,
    state.data.transactions,
    state.data.installmentPlans,
    state.ui.selectedMonth,
  ).filter((card) => Number(card.currentInvoiceAmount || 0) > 0);
  const accounts = getDerivedAccounts().filter((item) => !item.isDeleted);
  if (!accounts.length) {
    toast("Cadastre uma conta antes de pagar faturas.", "error");
    return;
  }
  if (!cards.length) {
    toast("Não há faturas em aberto na competência selecionada.", "error");
    return;
  }
  openModal(`
    <div class="flex items-center justify-between mb-6"><div><div class="text-2xl font-bold">Pagar fatura</div><div class="text-sm text-slate-500 mt-1">Ao pagar, o app cria a saída na conta e baixa apenas as parcelas em aberto da competência selecionada.</div></div><button id="close-modal" class="action-btn">Fechar</button></div>
    <form id="invoice-form" class="grid md:grid-cols-2 gap-4">
      <div><label class="text-sm font-semibold mb-2 block">Cartão</label><select name="cardId" id="invoice-card-id" class="select">${cards.map((card) => `<option value="${card.id}" data-amount="${card.currentInvoiceAmount}">${card.name} • ${currency(card.currentInvoiceAmount)}</option>`).join("")}</select></div>
      <div><label class="text-sm font-semibold mb-2 block">Conta de pagamento</label><select name="accountId" class="select">${accounts.map((account) => `<option value="${account.id}">${account.name}</option>`).join("")}</select></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor pago</label><input id="invoice-amount" name="amount" type="number" min="0.01" step="0.01" class="field" value="${cards[0]?.currentInvoiceAmount || 0}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Competência</label><input class="field" value="${monthLabel(state.ui.selectedMonth)}" disabled /></div>
      <div><label class="text-sm font-semibold mb-2 block">Data</label><input name="date" type="date" class="field" value="${formatDateInput()}" required /></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3"></textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-invoice" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">Registrar pagamento</button></div>
    </form>`);

  document
    .getElementById("invoice-card-id")
    ?.addEventListener("change", (event) => {
      const option = event.target.selectedOptions[0];
      document.getElementById("invoice-amount").value =
        option?.dataset?.amount || 0;
    });
  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document
    .getElementById("cancel-invoice")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("invoice-form")
    ?.addEventListener("submit", saveInvoicePayment);
}

async function saveInvoicePayment(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const amount = Number(payload.amount);
    if (amount <= 0) throw new Error("Valor pago deve ser maior que zero.");

    const cardMetrics = deriveCardMetrics(
      state.data.creditCards,
      state.data.transactions,
      state.data.installmentPlans,
      state.ui.selectedMonth,
    ).find((card) => card.id === payload.cardId);
    const currentInvoiceAmount = Number(cardMetrics?.currentInvoiceAmount || 0);
    if (!currentInvoiceAmount) {
      throw new Error("Não existe fatura em aberto para o cartão selecionado.");
    }
    if (amount > currentInvoiceAmount) {
      throw new Error("O valor pago não pode ser maior que a fatura em aberto.");
    }

    const timestamp = nowIso();
    const payment = {
      id: createId("tx"),
      description: `Pagamento de fatura ${monthLabel(state.ui.selectedMonth)}`,
      type: "expense",
      accountId: payload.accountId,
      amount,
      category: "Cartão de crédito",
      date: payload.date,
      cardId: payload.cardId,
      notes: payload.notes,
      invoiceMonth: state.ui.selectedMonth,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      syncStatus: "pending",
      isDeleted: false,
    };

    const allowNegativeBalance = await confirmNegativeBalanceForRecord(payment, {
      actionLabel: "registrar este pagamento de fatura",
    });
    if (!allowNegativeBalance) return;

    await putOne("transactions", payment);
    await enqueueSync("transactions", payment.id);

    const cardsById = getCardsById(state.data.creditCards);
    const openInstallments = state.data.transactions
      .filter(
        (transaction) =>
          !transaction.isDeleted &&
          transaction.type === "card_expense" &&
          transaction.cardId === payload.cardId &&
          !transaction.isPaid &&
          isTransactionInMonth(transaction, state.ui.selectedMonth, cardsById),
      )
      .sort((a, b) => compareDateInputs(a.date, b.date));

    let remaining = amount;
    const updates = [];
    for (const transaction of openInstallments) {
      if (remaining <= 0) break;
      if (remaining >= Number(transaction.amount)) {
        remaining -= Number(transaction.amount);
        updates.push({
          ...transaction,
          isPaid: true,
          installmentStatus: INSTALLMENT_STATUS.paid,
          paymentTransactionId: payment.id,
          updatedAt: timestamp,
          version: (transaction.version || 0) + 1,
          syncStatus: "pending",
        });
      }
    }

    if (updates.length) {
      await bulkPut("transactions", updates);
      await Promise.all(
        updates.map((transaction) =>
          enqueueSync("transactions", transaction.id),
        ),
      );
    }

    const plans = getCreditInstallmentPlans(state.data.installmentPlans);
    const planUpdates = plans
      .map((plan) => {
        const related = state.data.transactions.filter(
          (transaction) =>
            !transaction.isDeleted && transaction.installmentPlanId === plan.id,
        );
        const remainingInstallments = related.filter((transaction) => {
          const updated =
            updates.find((item) => item.id === transaction.id) || transaction;
          return getInstallmentStatus(updated) === INSTALLMENT_STATUS.pending;
        }).length;
        if (remainingInstallments === plan.remainingInstallments) return null;
        return {
          ...plan,
          remainingInstallments,
          updatedAt: timestamp,
          version: (plan.version || 0) + 1,
          syncStatus: "pending",
        };
      })
      .filter(Boolean);

    if (planUpdates.length) {
      await bulkPut("installmentPlans", planUpdates);
      await Promise.all(
        planUpdates.map((plan) => enqueueSync("installmentPlans", plan.id)),
      );
    }

    await loadState();
    closeModal();
    toast("Pagamento da fatura registrado com sucesso.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}


async function updateInstallmentStatus(transactionId, nextStatus) {
  try {
    const existing = await getOne("transactions", transactionId);
    if (!existing) return;

    if (nextStatus === INSTALLMENT_STATUS.anticipated) {
      const timestamp = nowIso();
      const today = formatDateInput();
      const targetBillingMonth = state.ui.selectedMonth || toMonthKey(today);
      const updatedTransaction = {
        ...existing,
        date: today,
        billingMonth: targetBillingMonth,
        isPaid: false,
        installmentStatus: INSTALLMENT_STATUS.pending,
        paidAt: "",
        paymentTransactionId: "",
        anticipatedAt: timestamp,
        anticipatedFromBillingMonth:
          existing.anticipatedFromBillingMonth || existing.billingMonth,
        updatedAt: timestamp,
        version: (existing.version || 0) + 1,
        syncStatus: "pending",
      };

      await putOne("transactions", updatedTransaction);
      await enqueueSync("transactions", updatedTransaction.id);
      await reconcileCreditInstallmentPlan(updatedTransaction.installmentPlanId);
      await loadState();
      toast(`Parcela adiantada para a fatura ${targetBillingMonth}.`, "success");
      return;
    }

    await openCreditInstallmentPaymentModal(transactionId);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function reconcileCreditInstallmentPlan(planId) {
  if (!planId) return;

  const plan = await getOne("installmentPlans", planId);
  if (!plan) return;

  const timestamp = nowIso();
  const allTransactions = await getAll("transactions");
  const relatedTransactions = allTransactions
    .filter(
      (transaction) =>
        !transaction.isDeleted && transaction.installmentPlanId === planId,
    )
    .sort((a, b) => {
      const aMonth = a.billingMonth || toMonthKey(a.date);
      const bMonth = b.billingMonth || toMonthKey(b.date);
      if (aMonth !== bMonth) return aMonth.localeCompare(bMonth);
      const byDate = compareDateInputs(a.date, b.date);
      if (byDate !== 0) return byDate;
      return Number(a.installmentNumber || 0) - Number(b.installmentNumber || 0);
    });

  if (!relatedTransactions.length) {
    await putOne("installmentPlans", {
      ...plan,
      installmentCount: 0,
      remainingInstallments: 0,
      totalAmount: 0,
      isDeleted: true,
      updatedAt: timestamp,
      version: (plan.version || 0) + 1,
      syncStatus: "pending",
    });
    await enqueueSync("installmentPlans", plan.id);
    expandedCreditPlans.delete(plan.id);
    return;
  }

  const totalInstallments = relatedTransactions.length;
  const resequenced = [];
  for (let index = 0; index < relatedTransactions.length; index += 1) {
    const transaction = relatedTransactions[index];
    const nextNumber = index + 1;
    const nextDescription = `${plan.description} ${nextNumber}/${totalInstallments}`;
    const needsUpdate =
      Number(transaction.installmentNumber || 0) !== nextNumber ||
      Number(transaction.installmentTotal || 0) !== totalInstallments ||
      transaction.description !== nextDescription;

    if (needsUpdate) {
      resequenced.push({
        ...transaction,
        installmentNumber: nextNumber,
        installmentTotal: totalInstallments,
        description: nextDescription,
        updatedAt: timestamp,
        version: (transaction.version || 0) + 1,
        syncStatus: "pending",
      });
    }
  }

  if (resequenced.length) {
    await bulkPut("transactions", resequenced);
    await Promise.all(
      resequenced.map((transaction) =>
        enqueueSync("transactions", transaction.id),
      ),
    );
  }

  const normalizedTransactions = relatedTransactions.map(
    (transaction) => resequenced.find((item) => item.id === transaction.id) || transaction,
  );
  const remainingInstallments = normalizedTransactions.filter(
    (transaction) => getInstallmentStatus(transaction) === INSTALLMENT_STATUS.pending,
  ).length;
  const totalAmount = Math.round(
    normalizedTransactions.reduce(
      (sum, transaction) => sum + Number(transaction.amount || 0),
      0,
    ) * 100,
  ) / 100;

  await putOne("installmentPlans", {
    ...plan,
    purchaseDate: normalizedTransactions[0]?.date || plan.purchaseDate,
    invoiceMonth:
      normalizedTransactions[0]?.billingMonth || plan.invoiceMonth,
    installmentCount: totalInstallments,
    remainingInstallments,
    totalAmount,
    updatedAt: timestamp,
    version: (plan.version || 0) + 1,
    syncStatus: "pending",
    isDeleted: false,
  });
  await enqueueSync("installmentPlans", plan.id);
}

async function openCreditInstallmentPaymentModal(transactionId) {
  const existing = transactionId ? await getOne("transactions", transactionId) : null;
  const accounts = getDerivedAccounts().filter((item) => !item.isDeleted);
  if (!existing || existing.isDeleted) return;
  if (!accounts.length) {
    toast("Cadastre uma conta antes de pagar a parcela.", "error");
    return;
  }

  openModal(`
    <div class="flex items-center justify-between mb-6"><div><div class="text-2xl font-bold">Pagar parcela do cartão</div><div class="text-sm text-slate-500 mt-1">Ao confirmar, o app registra a saída na conta e baixa somente esta parcela.</div></div><button id="close-modal" class="action-btn">Fechar</button></div>
    <form id="credit-installment-payment-form" class="grid md:grid-cols-2 gap-4">
      <input type="hidden" name="transactionId" value="${existing.id}" />
      <div class="md:col-span-2 rounded-[20px] border border-slate-200 bg-slate-50/80 p-4"><div class="font-semibold text-slate-900">${existing.description}</div><div class="text-sm text-slate-500 mt-1">${currency(existing.amount)} • fatura ${existing.billingMonth || "—"}</div></div>
      <div><label class="text-sm font-semibold mb-2 block">Conta de pagamento</label><select name="accountId" class="select">${accounts.map((account) => `<option value="${account.id}">${account.name}</option>`).join("")}</select></div>
      <div><label class="text-sm font-semibold mb-2 block">Data do pagamento</label><input name="date" type="date" class="field" value="${formatDateInput()}" required /></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3"></textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-credit-installment-payment" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">Registrar pagamento</button></div>
    </form>
  `);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document
    .getElementById("cancel-credit-installment-payment")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("credit-installment-payment-form")
    ?.addEventListener("submit", saveCreditInstallmentPayment);
}

async function saveCreditInstallmentPayment(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const existing = payload.transactionId
      ? await getOne("transactions", payload.transactionId)
      : null;
    if (!existing || existing.isDeleted) {
      throw new Error("Parcela não encontrada para pagamento.");
    }
    if (Number(existing.amount || 0) <= 0) {
      throw new Error("A parcela precisa ter um valor maior que zero.");
    }

    const timestamp = nowIso();
    const payment = {
      id: createId("tx"),
      description: `Pagamento avulso • ${existing.description}`,
      type: "expense",
      accountId: payload.accountId,
      amount: Number(existing.amount),
      category: "Cartão de crédito",
      date: payload.date,
      cardId: existing.cardId,
      notes: payload.notes || `Baixa manual da parcela ${existing.installmentNumber}/${existing.installmentTotal}`,
      invoiceMonth: existing.billingMonth,
      linkedInstallmentId: existing.id,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      syncStatus: "pending",
      isDeleted: false,
    };

    const allowNegativeBalance = await confirmNegativeBalanceForRecord(payment, {
      actionLabel: "registrar este pagamento da parcela",
    });
    if (!allowNegativeBalance) return;

    const updatedTransaction = {
      ...existing,
      installmentStatus: INSTALLMENT_STATUS.paid,
      isPaid: true,
      paidAt: timestamp,
      paymentTransactionId: payment.id,
      updatedAt: timestamp,
      version: (existing.version || 0) + 1,
      syncStatus: "pending",
    };

    await putOne("transactions", payment);
    await enqueueSync("transactions", payment.id);
    await putOne("transactions", updatedTransaction);
    await enqueueSync("transactions", updatedTransaction.id);
    await reconcileCreditInstallmentPlan(updatedTransaction.installmentPlanId);
    await loadState();
    closeModal();
    toast("Parcela paga e saída registrada na conta.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function openCreditInstallmentEditModal(transactionId) {
  const existing = transactionId ? await getOne("transactions", transactionId) : null;
  if (!existing || existing.isDeleted || !existing.installmentPlanId) return;

  openModal(`
    <div class="flex items-center justify-between mb-6"><div><div class="text-2xl font-bold">Editar parcela do crédito</div><div class="text-sm text-slate-500 mt-1">Ajuste apenas esta parcela sem recriar a compra inteira.</div></div><button id="close-modal" class="action-btn">Fechar</button></div>
    <form id="credit-installment-edit-form" class="grid md:grid-cols-2 gap-4">
      <input type="hidden" name="id" value="${existing.id}" />
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Descrição</label><input name="description" class="field" value="${existing.description || ""}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Categoria</label><input name="category" class="field" value="${existing.category || ""}" /></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor</label><input name="amount" type="number" min="0.01" step="0.01" class="field" value="${existing.amount || 0}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Data da parcela</label><input name="date" type="date" class="field" value="${existing.date || formatDateInput()}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Competência da fatura</label><input name="billingMonth" type="month" class="field" value="${existing.billingMonth || ""}" required /></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3">${existing.notes || ""}</textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-credit-installment-edit" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">Salvar parcela</button></div>
    </form>
  `);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document
    .getElementById("cancel-credit-installment-edit")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("credit-installment-edit-form")
    ?.addEventListener("submit", saveCreditInstallmentEdit);
}

async function saveCreditInstallmentEdit(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const existing = payload.id ? await getOne("transactions", payload.id) : null;
    if (!existing || existing.isDeleted || !existing.installmentPlanId) {
      throw new Error("Parcela não encontrada para edição.");
    }

    const amount = Number(payload.amount);
    if (amount <= 0) {
      throw new Error("Informe um valor maior que zero para a parcela.");
    }

    const timestamp = nowIso();
    const updatedTransaction = {
      ...existing,
      description: payload.description,
      category: payload.category || "",
      amount,
      date: payload.date,
      billingMonth: payload.billingMonth,
      notes: payload.notes || "",
      updatedAt: timestamp,
      version: (existing.version || 0) + 1,
      syncStatus: "pending",
    };

    await putOne("transactions", updatedTransaction);
    await enqueueSync("transactions", updatedTransaction.id);

    if (existing.paymentTransactionId) {
      const payment = await getOne("transactions", existing.paymentTransactionId);
      if (payment && !payment.isDeleted) {
        await putOne("transactions", {
          ...payment,
          description: `Pagamento avulso • ${payload.description}`,
          amount,
          date: payload.date,
          invoiceMonth: payload.billingMonth,
          notes: payload.notes || payment.notes,
          updatedAt: timestamp,
          version: (payment.version || 0) + 1,
          syncStatus: "pending",
        });
        await enqueueSync("transactions", payment.id);
      }
    }

    await reconcileCreditInstallmentPlan(existing.installmentPlanId);
    await loadState();
    closeModal();
    toast("Parcela atualizada com sucesso.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

function confirmDeleteCreditInstallment(transactionId) {
  confirmDialog({
    title: "Excluir parcela",
    message:
      "Somente esta parcela será removida. Se existir pagamento individual vinculado, ele também será excluído.",
    confirmText: "Excluir parcela",
    onConfirm: async () => {
      const existing = await getOne("transactions", transactionId);
      if (!existing) return;
      const timestamp = nowIso();

      await putOne("transactions", {
        ...existing,
        isDeleted: true,
        updatedAt: timestamp,
        version: (existing.version || 0) + 1,
        syncStatus: "pending",
      });
      await enqueueSync("transactions", existing.id);

      if (existing.paymentTransactionId) {
        const payment = await getOne("transactions", existing.paymentTransactionId);
        if (payment && !payment.isDeleted) {
          await putOne("transactions", {
            ...payment,
            isDeleted: true,
            updatedAt: timestamp,
            version: (payment.version || 0) + 1,
            syncStatus: "pending",
          });
          await enqueueSync("transactions", payment.id);
        }
      }

      await reconcileCreditInstallmentPlan(existing.installmentPlanId);
      await loadState();
      toast("Parcela excluída.", "success");
    },
  });
}

const expandedCreditPlans = new Set();

function bindCreditPlanInteractions() {
  const root = document.getElementById("cards-plans-root");
  if (!root) return;

  root.addEventListener("click", async (event) => {
    const toggleButton = event.target.closest("[data-plan-toggle]");
    if (toggleButton) {
      event.preventDefault();
      toggleCreditPlan(toggleButton.dataset.planToggle, root);
      return;
    }

    const editButton = event.target.closest("[data-installment-edit]");
    if (editButton) {
      event.preventDefault();
      await openCreditInstallmentEditModal(editButton.dataset.installmentEdit);
      return;
    }

    const deleteButton = event.target.closest("[data-installment-delete]");
    if (deleteButton) {
      event.preventDefault();
      confirmDeleteCreditInstallment(deleteButton.dataset.installmentDelete);
      return;
    }

    const actionButton = event.target.closest("[data-installment-action]");
    if (actionButton) {
      event.preventDefault();
      await updateInstallmentStatus(
        actionButton.dataset.transactionId,
        actionButton.dataset.installmentAction,
      );
    }
  });
}

function toggleCreditPlan(planId, root) {
  if (!planId) return;
  const expanded = !expandedCreditPlans.has(planId);
  if (expanded) {
    expandedCreditPlans.add(planId);
  } else {
    expandedCreditPlans.delete(planId);
  }
  syncPlanCardState(root, planId, expanded);
}

function setAllCreditPlansExpanded(expanded) {
  const root = document.getElementById("cards-plans-root");
  if (!root) return;
  const ids = Array.from(root.querySelectorAll("[data-plan-card]"))
    .map((card) => card.dataset.planCard)
    .filter(Boolean);

  ids.forEach((id) => {
    if (expanded) {
      expandedCreditPlans.add(id);
    } else {
      expandedCreditPlans.delete(id);
    }
    syncPlanCardState(root, id, expanded);
  });
}

function syncPlanCardState(root, planId, expanded) {
  const card = root?.querySelector(`[data-plan-card="${planId}"]`);
  if (!card) return;

  const content = card.querySelector("[data-plan-content]");
  const label = card.querySelector("[data-plan-label]");
  const toggle = card.querySelector("[data-plan-toggle]");

  card.classList.toggle("is-open", expanded);
  if (content) {
    content.hidden = !expanded;
    content.setAttribute("aria-hidden", String(!expanded));
  }
  if (toggle) toggle.setAttribute("aria-expanded", String(expanded));
  if (label) {
    label.textContent = expanded ? "Recolher detalhes" : "Ver parcelas";
  }
}

function renderCreditInstallmentPlanCard(plan) {
  const isExpanded = expandedCreditPlans.has(plan.id);
  const firstBillingMonth = plan.installments?.[0]?.billingMonth || "—";
  const lastBillingMonth = plan.installments?.length
    ? plan.installments[plan.installments.length - 1].billingMonth || "—"
    : "—";

  return `
    <article class="installment-plan-card ${isExpanded ? "is-open" : ""}" data-plan-card="${plan.id}">
      <button
        type="button"
        class="installment-plan-summary"
        data-plan-toggle="${plan.id}"
        aria-expanded="${isExpanded ? "true" : "false"}"
      >
        <div class="installment-plan-summary-main">
          <span class="installment-plan-eyebrow">Parcelamento no crédito • ${plan.card?.name || "Cartão removido"}</span>
          <h3>${plan.description}</h3>
          <p>${plan.category || "Sem categoria"} • compra em ${datePt(plan.purchaseDate)}</p>
        </div>
        <div class="installment-plan-kpis">
          <div class="installment-plan-kpi">
            <span>Total</span>
            <strong>${currency(plan.totalAmount)}</strong>
          </div>
          <div class="installment-plan-kpi">
            <span>Pendentes</span>
            <strong>${plan.remainingInstallments}</strong>
          </div>
          <div class="installment-plan-kpi">
            <span>Faixa</span>
            <strong>${firstBillingMonth} → ${lastBillingMonth}</strong>
          </div>
        </div>
        <span class="installment-plan-toggle-pill">
          <span data-plan-label>${isExpanded ? "Recolher detalhes" : "Ver parcelas"}</span>
          <i class="fa-solid fa-chevron-down"></i>
        </span>
      </button>

      <div class="installment-plan-progress">
        <span style="width:${clampPercent(plan.progressPercent)}%"></span>
      </div>

      <div class="installment-plan-content" data-plan-content ${isExpanded ? "" : "hidden"} aria-hidden="${isExpanded ? "false" : "true"}">
        <div class="installment-plan-meta-grid">
          <div class="installment-plan-meta-card">
            <span>Parcelas</span>
            <strong>${plan.installmentCount}</strong>
          </div>
          <div class="installment-plan-meta-card">
            <span>Compra</span>
            <strong>${datePt(plan.purchaseDate)}</strong>
          </div>
          <div class="installment-plan-meta-card">
            <span>Progresso</span>
            <strong>${plan.settledCount}/${plan.installmentCount}</strong>
          </div>
        </div>

        <div class="installment-plan-timeline">
          ${
            plan.installments
              .map(
                (installment) => `
                  <div class="installment-timeline-item">
                    <div>
                      <div class="installment-timeline-title">Parcela ${installment.installmentNumber}/${installment.installmentTotal}</div>
                      <div class="installment-timeline-subtitle">${datePt(installment.date)} • ${currency(installment.amount)} • Fatura ${installment.billingMonth || "—"}${installment.anticipatedAt ? ` • adiantada de ${installment.anticipatedFromBillingMonth || "—"}` : ""}</div>
                    </div>
                    <div class="installment-timeline-actions">
                      <span class="badge ${getInstallmentStatusBadge(installment.computedStatus)}">${getInstallmentStatusLabel(installment.computedStatus)}</span>
                      <div class="installment-inline-buttons">
                        ${
                          installment.computedStatus === INSTALLMENT_STATUS.pending
                            ? `<button class="table-action" data-installment-action="${INSTALLMENT_STATUS.paid}" data-transaction-id="${installment.id}">Marcar paga</button>
                               <button class="table-action" data-installment-action="${INSTALLMENT_STATUS.anticipated}" data-transaction-id="${installment.id}">Adiantar</button>`
                            : ""
                        }
                        <button class="table-action" data-installment-edit="${installment.id}">Editar</button>
                        <button class="table-action table-action-danger" data-installment-delete="${installment.id}">Excluir</button>
                      </div>
                    </div>
                  </div>`,
              )
              .join("") ||
            '<div class="installment-empty-inline">Nenhuma parcela encontrada.</div>'
          }
        </div>
      </div>
    </article>`;
}

function renderInstallmentExperienceStyles(scope) {
  return `
    <style id="installment-experience-styles-${scope}">
      .installment-plan-grid {
        display: grid;
        gap: 16px;
      }

      .installment-plan-card {
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 28px;
        background:
          radial-gradient(circle at top right, rgba(59, 130, 246, 0.14), transparent 32%),
          linear-gradient(180deg, rgba(255,255,255,0.97), rgba(248,250,252,0.94));
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
        overflow: hidden;
        transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
      }

      .installment-plan-card:hover,
      .installment-plan-card.is-open {
        transform: translateY(-2px);
        box-shadow: 0 24px 54px rgba(15, 23, 42, 0.12);
        border-color: rgba(59, 130, 246, 0.28);
      }

      .installment-plan-summary {
        width: 100%;
        border: 0;
        background: transparent;
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(240px, 1fr) auto;
        gap: 18px;
        padding: 22px;
        text-align: left;
        cursor: pointer;
      }

      .installment-plan-summary-main h3 {
        margin: 8px 0 6px;
        font-size: 1.1rem;
        font-weight: 800;
        color: #0f172a;
      }

      .installment-plan-summary-main p,
      .installment-plan-eyebrow,
      .installment-plan-meta-card span,
      .installment-timeline-subtitle {
        color: #64748b;
      }

      .installment-plan-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .installment-plan-kpis {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .installment-plan-kpi,
      .installment-plan-meta-card {
        border-radius: 20px;
        background: rgba(255,255,255,0.76);
        border: 1px solid rgba(148, 163, 184, 0.18);
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .installment-plan-kpi span {
        font-size: 0.78rem;
        color: #64748b;
      }

      .installment-plan-kpi strong,
      .installment-plan-meta-card strong,
      .installment-timeline-title {
        color: #0f172a;
        font-weight: 800;
      }

      .installment-plan-toggle-pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        align-self: start;
        padding: 12px 16px;
        border-radius: 999px;
        background: #0f172a;
        color: #fff;
        font-size: 0.86rem;
        font-weight: 700;
        white-space: nowrap;
      }

      .installment-plan-card.is-open .installment-plan-toggle-pill i {
        transform: rotate(180deg);
      }

      .installment-plan-toggle-pill i {
        transition: transform 0.18s ease;
      }

      .installment-plan-progress {
        height: 8px;
        background: rgba(226, 232, 240, 0.9);
        margin: 0 22px;
        border-radius: 999px;
        overflow: hidden;
      }

      .installment-plan-progress span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #2563eb, #06b6d4);
      }

      .installment-plan-content {
        padding: 18px 22px 22px;
        display: grid;
        gap: 18px;
        border-top: 1px solid rgba(226, 232, 240, 0.9);
        background: linear-gradient(180deg, rgba(248,250,252,0.24), rgba(248,250,252,0.84));
      }

      .installment-plan-content[hidden] {
        display: none !important;
      }

      .installment-plan-meta-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }

      .installment-plan-timeline {
        display: grid;
        gap: 12px;
      }

      .installment-timeline-item {
        border-radius: 22px;
        border: 1px solid rgba(148, 163, 184, 0.16);
        background: rgba(255,255,255,0.92);
        padding: 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 14px;
      }

      .installment-timeline-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
        flex-wrap: wrap;
      }

      .installment-inline-buttons {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .installment-empty-state,
      .installment-empty-inline {
        border: 1px dashed rgba(148, 163, 184, 0.4);
        border-radius: 22px;
        padding: 26px;
        text-align: center;
        color: #64748b;
        background: rgba(248,250,252,0.7);
      }

      @media (max-width: 980px) {
        .installment-plan-summary {
          grid-template-columns: 1fr;
        }

        .installment-plan-meta-grid,
        .installment-plan-kpis {
          grid-template-columns: 1fr;
        }

        .installment-timeline-item {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    </style>`;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function emptyState(title, text) {
  return `<div class="card p-10 text-center lg:col-span-3"><div class="text-xl font-bold">${title}</div><div class="text-slate-500 mt-2">${text}</div></div>`;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getProjectedNegativeBalanceWarningsForRecord(record) {
  const accounts = getDerivedAccounts().filter((account) => !account.isDeleted);
  const targetAccount = accounts.find((account) => account.id === record?.accountId);
  if (!targetAccount) return [];

  const amount = Number(record?.amount || 0);
  if (!(record?.type === "expense") || amount <= 0) return [];

  const currentBalance = Number(targetAccount.derivedBalance || 0);
  const projectedBalance = roundMoney(currentBalance - amount);
  if (projectedBalance >= 0) return [];

  return [
    {
      accountId: targetAccount.id,
      accountName: targetAccount.name || "Conta",
      currentBalance: roundMoney(currentBalance),
      projectedBalance,
    },
  ];
}

async function confirmNegativeBalanceForRecord(
  record,
  { actionLabel = "registrar esta saída" } = {},
) {
  const warnings = getProjectedNegativeBalanceWarningsForRecord(record);
  if (!warnings.length) return true;

  const warning = warnings[0];

  return new Promise((resolve) => {
    const existing = document.getElementById("negative-balance-confirm-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "negative-balance-confirm-modal";
    modal.innerHTML = `
      <div class="negative-modal-backdrop">
        <div class="negative-modal-card" role="dialog" aria-modal="true" aria-labelledby="negative-modal-title">
          <div class="negative-modal-header">
            <div class="negative-modal-icon-wrap">
              <div class="negative-modal-icon">!</div>
            </div>
            <div class="negative-modal-title-group">
              <h3 id="negative-modal-title">Conta ficará negativa</h3>
              <p>Essa ação pode deixar o saldo da conta abaixo de zero.</p>
            </div>
          </div>

          <div class="negative-modal-body">
            <div class="negative-modal-account">
              <span class="label">Conta</span>
              <strong>${escapeHtml(warning.accountName)}</strong>
            </div>

            <div class="negative-modal-message">
              Ao ${escapeHtml(actionLabel)}, o sistema identificou que essa movimentação pode deixar a conta negativa.
            </div>

            <div class="negative-balance-preview">
              <div class="balance-box">
                <span class="label">Saldo atual</span>
                <strong>${currency(warning.currentBalance)}</strong>
              </div>

              <div class="balance-arrow">→</div>

              <div class="balance-box projected ${
                warning.projectedBalance < 0 ? "is-negative" : ""
              }">
                <span class="label">Saldo projetado</span>
                <strong>${currency(warning.projectedBalance)}</strong>
              </div>
            </div>
          </div>

          <div class="negative-modal-actions">
            <button type="button" class="negative-btn negative-btn-secondary" data-action="cancel">
              Cancelar
            </button>
            <button type="button" class="negative-btn negative-btn-danger" data-action="confirm">
              Continuar mesmo assim
            </button>
          </div>
        </div>
      </div>
    `;

    if (!document.getElementById("negative-balance-confirm-styles")) {
      const style = document.createElement("style");
      style.id = "negative-balance-confirm-styles";
      style.textContent = `
        .negative-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.55);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          z-index: 99999;
          animation: negativeFadeIn 0.18s ease-out;
        }

        .negative-modal-card {
          width: min(100%, 560px);
          background: linear-gradient(180deg, #ffffff 0%, #fcfcfd 100%);
          border: 1px solid rgba(226, 232, 240, 0.95);
          border-radius: 24px;
          box-shadow:
            0 24px 60px rgba(15, 23, 42, 0.20),
            0 8px 24px rgba(15, 23, 42, 0.10);
          overflow: hidden;
          animation: negativeScaleIn 0.2s ease-out;
        }

        .negative-modal-header {
          display: flex;
          gap: 16px;
          align-items: center;
          padding: 24px 24px 18px;
          background:
            radial-gradient(circle at top left, rgba(239, 68, 68, 0.12), transparent 45%),
            linear-gradient(180deg, #fff7f7 0%, #ffffff 100%);
          border-bottom: 1px solid rgba(241, 245, 249, 1);
        }

        .negative-modal-icon-wrap {
          flex-shrink: 0;
        }

        .negative-modal-icon {
          width: 56px;
          height: 56px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          font-size: 28px;
          font-weight: 800;
          color: #b91c1c;
          background: linear-gradient(180deg, #fee2e2 0%, #fecaca 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
        }

        .negative-modal-title-group h3 {
          margin: 0;
          font-size: 1.3rem;
          line-height: 1.2;
          color: #0f172a;
        }

        .negative-modal-title-group p {
          margin: 6px 0 0;
          color: #475569;
          font-size: 0.96rem;
        }

        .negative-modal-body {
          padding: 22px 24px 10px;
        }

        .negative-modal-account {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 14px 16px;
          border-radius: 16px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          margin-bottom: 16px;
        }

        .negative-modal-message {
          color: #334155;
          font-size: 0.97rem;
          line-height: 1.5;
          margin-bottom: 18px;
        }

        .negative-balance-preview {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 12px;
          align-items: center;
        }

        .balance-box {
          padding: 16px;
          border-radius: 18px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .balance-box strong {
          font-size: 1.18rem;
          color: #0f172a;
        }

        .balance-box.projected.is-negative {
          background: linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%);
          border-color: #fecdd3;
        }

        .balance-box.projected.is-negative strong {
          color: #b91c1c;
        }

        .balance-arrow {
          font-size: 1.4rem;
          color: #94a3b8;
          font-weight: 700;
        }

        .label {
          font-size: 0.8rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #64748b;
        }

        .negative-modal-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          padding: 20px 24px 24px;
        }

        .negative-btn {
          border: none;
          border-radius: 18px;
          min-height: 60px;
          padding: 16px 18px;
          font-size: 1rem;
          font-weight: 800;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
        }

        .negative-btn:hover {
          transform: translateY(-1px);
        }

        .negative-btn:active {
          transform: translateY(0);
        }

        .negative-btn-secondary {
          background: #eef2f7;
          color: #0f172a;
          box-shadow: inset 0 0 0 1px #dbe2ea;
        }

        .negative-btn-secondary:hover {
          background: #e2e8f0;
        }

        .negative-btn-danger {
          background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%);
          color: white;
          box-shadow: 0 12px 24px rgba(220, 38, 38, 0.28);
        }

        .negative-btn-danger:hover {
          box-shadow: 0 16px 28px rgba(220, 38, 38, 0.34);
        }

        @keyframes negativeFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes negativeScaleIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (max-width: 640px) {
          .negative-modal-card {
            border-radius: 20px;
          }

          .negative-balance-preview {
            grid-template-columns: 1fr;
          }

          .balance-arrow {
            display: none;
          }

          .negative-modal-actions {
            grid-template-columns: 1fr;
          }
        }
      `;
      document.head.appendChild(style);
    }

    const root = document.getElementById("modal-root") || document.body;
    root.appendChild(modal);

    const backdrop = modal.querySelector(".negative-modal-backdrop");
    const confirmBtn = modal.querySelector('[data-action="confirm"]');
    const cancelBtn = modal.querySelector('[data-action="cancel"]');

    let settled = false;

    const cleanup = (result) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeyDown);
      modal.remove();
      resolve(result);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") cleanup(false);
      if (event.key === "Enter") cleanup(true);
    };

    confirmBtn?.addEventListener("click", () => cleanup(true), { once: true });
    cancelBtn?.addEventListener("click", () => cleanup(false), { once: true });

    backdrop?.addEventListener("click", (event) => {
      if (event.target === backdrop) cleanup(false);
    });

    document.addEventListener("keydown", onKeyDown);
    confirmBtn?.focus();
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}