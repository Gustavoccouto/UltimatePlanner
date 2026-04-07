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
import { nowIso, formatDateInput, monthLabel } from "../utils/dates.js";
import { validateTransaction } from "../utils/validators.js";
import { putOne, getOne, getAll, bulkPut } from "../services/storage.js";
import { enqueueSync } from "../services/sync.js";
import { getCardsById, isTransactionInMonth } from "../utils/calculations.js";
import {
  PLANNING_RULE_KIND,
  RULE_TYPES,
  DEBIT_INSTALLMENT_METHOD,
  INSTALLMENT_STATUS,
  getRecurringRules,
  getDebitInstallmentPlans,
  getInstallmentStatus,
  getInstallmentStatusLabel,
  getInstallmentStatusBadge,
  buildInstallmentPlanView,
  describeRuleBinding,
  getFrequencyLabel,
  getRuleTypeLabel,
  getNextOccurrenceDate,
} from "../services/planning.js";

export function renderTransactions() {
  const cardsById = getCardsById(state.data.creditCards);
  const rows = [...state.data.transactions]
    .filter(
      (transaction) =>
        !transaction.isDeleted &&
        isTransactionInMonth(transaction, state.ui.selectedMonth, cardsById),
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const accounts = getDerivedAccounts();
  const recurringRules = getRecurringRules(state.data.preferences).sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0) -
      new Date(a.updatedAt || a.createdAt || 0),
  );
  const debitPlans = getDebitInstallmentPlans(state.data.installmentPlans)
    .map((plan) => buildInstallmentPlanView(plan, state.data.transactions))
    .sort(
      (a, b) => new Date(b.purchaseDate || 0) - new Date(a.purchaseDate || 0),
    );

  return `
    ${pageHeader(
      "Transações",
      "Receitas, despesas, transferências, recorrências e parcelamentos no débito com consistência de dados.",
      `
        <button id="new-transaction-btn" class="action-btn action-btn-primary"><i class="fa-solid fa-plus mr-2"></i>Nova transação</button>
        <button id="new-recurring-income-btn" class="action-btn"><i class="fa-solid fa-repeat mr-2"></i>Receita recorrente</button>
        <button id="new-recurring-expense-btn" class="action-btn"><i class="fa-solid fa-rotate mr-2"></i>Gasto recorrente</button>
        <button id="new-debit-installment-btn" class="action-btn"><i class="fa-solid fa-layer-group mr-2"></i>Parcelar no débito</button>
      `,
    )}

    <section class="module-stack">
      <div class="module-overview-grid module-overview-grid-3">
        <article class="card module-overview-card module-overview-card-primary module-overview-card-neutral-text">
          <div class="compact-stat-label">Receitas em ${monthLabel(state.ui.selectedMonth)}</div>
          <div class="module-overview-value">${currency(
            rows
              .filter((transaction) => transaction.type === "income")
              .reduce((sum, item) => sum + Number(item.amount || 0), 0),
          )}</div>
        </article>
        <article class="card module-overview-card">
          <div class="compact-stat-label">Despesas em ${monthLabel(state.ui.selectedMonth)}</div>
          <div class="compact-stat-value">${currency(
            rows
              .filter((transaction) =>
                ["expense", "card_expense"].includes(transaction.type),
              )
              .reduce((sum, item) => sum + Number(item.amount || 0), 0),
          )}</div>
        </article>
        <article class="card module-overview-card">
          <div class="compact-stat-label">Parcelamentos no débito</div>
          <div class="compact-stat-value">${debitPlans.length}</div>
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
              <tr>
                <th>Descrição</th>
                <th>Tipo</th>
                <th>Conta</th>
                <th>Data</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows
                  .map((transaction) => {
                    const account = accounts.find(
                      (item) => item.id === transaction.accountId,
                    );
                    const destination = accounts.find(
                      (item) => item.id === transaction.destinationAccountId,
                    );
                    const card = state.data.creditCards.find(
                      (item) => item.id === transaction.cardId,
                    );
                    const installmentBadge = transaction.installmentPlanId
                      ? `<div class="text-xs text-slate-500 mt-1">Parcela ${transaction.installmentNumber || "—"}/${transaction.installmentTotal || "—"} • ${getInstallmentStatusLabel(getInstallmentStatus(transaction))}</div>`
                      : transaction.recurringRuleId
                        ? '<div class="text-xs text-slate-500 mt-1">Gerada por recorrência</div>'
                        : "";

                    return `
                      <tr>
                        <td>
                          <div class="font-semibold">${transaction.description}</div>
                          <div class="text-sm text-slate-500">${transaction.category || "Sem categoria"}${destination ? ` • para ${destination.name}` : ""}${card ? ` • ${card.name}` : ""}</div>
                          ${installmentBadge}
                        </td>
                        <td><span class="badge ${badgeByType(transaction.type)}">${labelByType(transaction.type)}</span></td>
                        <td>${
                          transaction.type === "card_expense"
                            ? card?.name || "Cartão removido"
                            : account?.name || "Conta removida"
                        }</td>
                        <td>${datePt(transaction.date)}${
                          transaction.type === "card_expense"
                            ? `<div class="text-xs text-slate-500 mt-1">Fatura ${transaction.billingMonth || "—"}</div>`
                            : ""
                        }</td>
                        <td class="font-semibold">${currency(transaction.amount)}</td>
                        <td><span class="badge ${statusBadgeForTransaction(transaction)}">${statusLabelForTransaction(transaction)}</span></td>
                        <td>
                          <div class="flex gap-2 flex-wrap">
                            <button class="table-action" data-transaction-edit="${transaction.id}">Editar</button>
                            <button class="table-action table-action-danger" data-transaction-delete="${transaction.id}">Excluir</button>
                          </div>
                        </td>
                      </tr>`;
                  })
                  .join("") ||
                `<tr><td colspan="7" class="text-center text-slate-500 py-10">Nenhuma transação para ${monthLabel(state.ui.selectedMonth)}.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card p-4 md:p-6 overflow-hidden">
        <div class="section-head section-head-spaced">
          <div>
            <div class="text-sm text-slate-500">Automação</div>
            <div class="section-title">Regras recorrentes</div>
          </div>
          <span class="badge badge-muted">${recurringRules.length} ativa(s)</span>
        </div>
        <div class="overflow-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Vínculo</th>
                <th>Frequência</th>
                <th>Início</th>
                <th>Próximo lançamento</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${
                recurringRules
                  .map(
                    (rule) => `
                    <tr>
                      <td>
                        <div class="font-semibold">${rule.name}</div>
                        <div class="text-sm text-slate-500">${rule.category || "Sem categoria"} • ${currency(rule.amount)}</div>
                      </td>
                      <td><span class="badge ${rule.ruleType === RULE_TYPES.recurringIncome ? "badge-success" : "badge-warning"}">${getRuleTypeLabel(rule.ruleType)}</span></td>
                      <td>${describeRuleBinding(rule, state.data.accounts, state.data.creditCards)}</td>
                      <td>${getFrequencyLabel(rule.frequency)}</td>
                      <td>${datePt(rule.startDate)}${rule.endDate ? `<div class="text-xs text-slate-500 mt-1">até ${datePt(rule.endDate)}</div>` : ""}</td>
                      <td>${getNextOccurrenceDate(rule, state.data.transactions) ? datePt(getNextOccurrenceDate(rule, state.data.transactions)) : "Sem novas ocorrências"}</td>
                      <td>
                        <div class="flex gap-2 flex-wrap">
                          <button class="table-action" data-recurring-edit="${rule.id}">Editar</button>
                          <button class="table-action table-action-danger" data-recurring-delete="${rule.id}">Excluir</button>
                        </div>
                      </td>
                    </tr>
                  `,
                  )
                  .join("") ||
                '<tr><td colspan="7" class="text-center text-slate-500 py-10">Nenhuma regra recorrente cadastrada.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card p-4 md:p-6 overflow-hidden">
        <div class="section-head section-head-spaced">
          <div>
            <div class="text-sm text-slate-500">Parcelamentos</div>
            <div class="section-title">Parcelamentos no débito</div>
          </div>
          <span class="badge badge-muted">${debitPlans.reduce((sum, plan) => sum + plan.remainingInstallments, 0)} parcela(s) pendente(s)</span>
        </div>
        <div class="overflow-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Conta</th>
                <th>Total</th>
                <th>Progresso</th>
                <th>Início</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              ${debitPlans.map(renderDebitPlanRows).join("") || '<tr><td colspan="6" class="text-center text-slate-500 py-10">Nenhum parcelamento no débito cadastrado.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>
    </section>`;
}

export function bindTransactionsEvents() {
  document
    .getElementById("new-transaction-btn")
    ?.addEventListener("click", () => openTransactionModal());
  document
    .getElementById("new-recurring-income-btn")
    ?.addEventListener("click", () =>
      openRecurringRuleModal(null, RULE_TYPES.recurringIncome),
    );
  document
    .getElementById("new-recurring-expense-btn")
    ?.addEventListener("click", () =>
      openRecurringRuleModal(null, RULE_TYPES.recurringExpense),
    );
  document
    .getElementById("new-debit-installment-btn")
    ?.addEventListener("click", () => openDebitInstallmentModal());

  document.querySelectorAll("[data-transaction-edit]").forEach((button) => {
    button.addEventListener("click", () =>
      openTransactionModal(button.dataset.transactionEdit),
    );
  });
  document.querySelectorAll("[data-transaction-delete]").forEach((button) => {
    button.addEventListener("click", () =>
      confirmDelete(button.dataset.transactionDelete),
    );
  });

  document.querySelectorAll("[data-recurring-edit]").forEach((button) => {
    button.addEventListener("click", () =>
      openRecurringRuleModal(button.dataset.recurringEdit),
    );
  });
  document.querySelectorAll("[data-recurring-delete]").forEach((button) => {
    button.addEventListener("click", () =>
      confirmDeleteRecurringRule(button.dataset.recurringDelete),
    );
  });

  document.querySelectorAll("[data-plan-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const detailRow = document.querySelector(
        `[data-plan-detail="${button.dataset.planToggle}"]`,
      );
      detailRow?.classList.toggle("hidden");
      button.textContent = detailRow?.classList.contains("hidden")
        ? "Expandir"
        : "Recolher";
    });
  });

  document.querySelectorAll("[data-plan-delete]").forEach((button) => {
    button.addEventListener("click", () =>
      confirmDeleteInstallmentPlan(button.dataset.planDelete),
    );
  });

  document.querySelectorAll("[data-installment-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      await updateInstallmentStatus(
        button.dataset.transactionId,
        button.dataset.installmentAction,
      );
    });
  });
}

async function openTransactionModal(transactionId = null) {
  const accounts = getDerivedAccounts();
  if (!accounts.length) {
    toast("Cadastre ao menos uma conta antes de criar transações.", "error");
    return;
  }

  const existing = transactionId
    ? await getOne("transactions", transactionId)
    : null;
  openModal(`
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="text-2xl font-bold">${existing ? "Editar transação" : "Nova transação"}</div>
        <div class="text-sm text-slate-500 mt-1">Suporta receita, despesa, transferência e ajuste.</div>
      </div>
      <button id="close-modal" class="action-btn">Fechar</button>
    </div>
    <form id="transaction-form" class="grid md:grid-cols-2 gap-4">
      <input type="hidden" name="id" value="${existing?.id || ""}" />
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Descrição</label><input name="description" class="field" value="${existing?.description || ""}" placeholder="Ex.: Mercado mensal" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Tipo</label><select name="type" class="select"><option value="expense" ${selected(existing?.type, "expense")}>Despesa</option><option value="income" ${selected(existing?.type, "income")}>Receita</option><option value="transfer" ${selected(existing?.type, "transfer")}>Transferência</option><option value="adjustment" ${selected(existing?.type, "adjustment")}>Ajuste</option></select></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor</label><input name="amount" type="number" min="0.01" step="0.01" class="field" value="${existing?.amount || ""}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Conta origem</label><select name="accountId" class="select">${accounts.map((item) => `<option value="${item.id}" ${selected(existing?.accountId, item.id)}>${item.name}</option>`).join("")}</select></div>
      <div><label class="text-sm font-semibold mb-2 block">Conta destino</label><select name="destinationAccountId" class="select"><option value="">Nenhuma</option>${accounts.map((item) => `<option value="${item.id}" ${selected(existing?.destinationAccountId, item.id)}>${item.name}</option>`).join("")}</select></div>
      <div><label class="text-sm font-semibold mb-2 block">Categoria</label><input name="category" class="field" value="${existing?.category || ""}" placeholder="Ex.: Alimentação" /></div>
      <div><label class="text-sm font-semibold mb-2 block">Data</label><input name="date" type="date" class="field" value="${existing?.date ? formatDateInput(existing.date) : formatDateInput()}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Status</label><select name="status" class="select"><option value="posted" ${selected(existing?.status, "posted")}>Lançada</option><option value="scheduled" ${selected(existing?.status, "scheduled")}>Agendada</option></select></div>
      <div><label class="text-sm font-semibold mb-2 block">Projeto vinculado</label><select name="projectId" class="select"><option value="">Nenhum</option>${state.data.projects
        .filter((item) => !item.isDeleted)
        .map(
          (item) =>
            `<option value="${item.id}" ${selected(existing?.projectId, item.id)}>${item.name}</option>`,
        )
        .join("")}</select></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3">${existing?.notes || ""}</textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-transaction" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">${existing ? "Salvar alterações" : "Salvar transação"}</button></div>
    </form>`);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document
    .getElementById("cancel-transaction")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("transaction-form")
    ?.addEventListener("submit", saveTransaction);
}

async function openRecurringRuleModal(ruleId = null, forcedRuleType = null) {
  const accounts = getDerivedAccounts().filter((account) => !account.isDeleted);
  const cards = state.data.creditCards.filter((card) => !card.isDeleted);
  const existing = ruleId ? await getOne("preferences", ruleId) : null;
  const ruleType =
    forcedRuleType || existing?.ruleType || RULE_TYPES.recurringExpense;
  const targetType =
    ruleType === RULE_TYPES.recurringIncome
      ? "account"
      : existing?.targetType || "account";

  openModal(`
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="text-2xl font-bold">${existing ? "Editar regra recorrente" : "Nova regra recorrente"}</div>
        <div class="text-sm text-slate-500 mt-1">Use a mesma estrutura do app atual e deixe os lançamentos entrarem automaticamente no período correto.</div>
      </div>
      <button id="close-modal" class="action-btn">Fechar</button>
    </div>
    <form id="recurring-form" class="grid md:grid-cols-2 gap-4">
      <input type="hidden" name="id" value="${existing?.id || ""}" />
      <input type="hidden" name="kind" value="${PLANNING_RULE_KIND}" />
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Nome</label><input name="name" class="field" value="${existing?.name || ""}" placeholder="Ex.: Salário, Condomínio, Dividendos" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Tipo</label><select name="ruleType" id="recurring-rule-type" class="select"><option value="${RULE_TYPES.recurringIncome}" ${selected(ruleType, RULE_TYPES.recurringIncome)}>Receita recorrente</option><option value="${RULE_TYPES.recurringExpense}" ${selected(ruleType, RULE_TYPES.recurringExpense)}>Gasto recorrente</option></select></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor</label><input name="amount" type="number" min="0.01" step="0.01" class="field" value="${existing?.amount || ""}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Categoria</label><input name="category" class="field" value="${existing?.category || ""}" placeholder="Ex.: Salário, Moradia, Dividendos" /></div>
      <div><label class="text-sm font-semibold mb-2 block">Frequência</label><select name="frequency" class="select"><option value="monthly" ${selected(existing?.frequency, "monthly")}>Mensal</option><option value="weekly" ${selected(existing?.frequency, "weekly")}>Semanal</option><option value="quarterly" ${selected(existing?.frequency, "quarterly")}>Trimestral</option><option value="yearly" ${selected(existing?.frequency, "yearly")}>Anual</option></select></div>
      <div><label class="text-sm font-semibold mb-2 block">Data de início</label><input name="startDate" type="date" class="field" value="${existing?.startDate ? formatDateInput(existing.startDate) : formatDateInput()}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Data de fim</label><input name="endDate" type="date" class="field" value="${existing?.endDate ? formatDateInput(existing.endDate) : ""}" /></div>
      <div><label class="text-sm font-semibold mb-2 block">Vínculo</label><select name="targetType" id="recurring-target-type" class="select" ${ruleType === RULE_TYPES.recurringIncome ? "disabled" : ""}><option value="account" ${selected(targetType, "account")}>Conta</option><option value="card" ${selected(targetType, "card")}>Cartão</option></select></div>
      <div id="recurring-account-wrap"><label class="text-sm font-semibold mb-2 block">Conta</label><select name="accountId" class="select"><option value="">Selecione</option>${accounts.map((account) => `<option value="${account.id}" ${selected(existing?.accountId, account.id)}>${account.name}</option>`).join("")}</select></div>
      <div id="recurring-card-wrap"><label class="text-sm font-semibold mb-2 block">Cartão</label><select name="cardId" class="select"><option value="">Selecione</option>${cards.map((card) => `<option value="${card.id}" ${selected(existing?.cardId, card.id)}>${card.name}</option>`).join("")}</select></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3">${existing?.notes || ""}</textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-recurring" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">${existing ? "Salvar alterações" : "Salvar regra"}</button></div>
    </form>`);

  const syncRecurringTargetVisibility = () => {
    const currentRuleType = document.getElementById(
      "recurring-rule-type",
    )?.value;
    const targetSelect = document.getElementById("recurring-target-type");
    const currentTargetType =
      currentRuleType === RULE_TYPES.recurringIncome
        ? "account"
        : targetSelect?.value || "account";

    if (targetSelect)
      targetSelect.disabled = currentRuleType === RULE_TYPES.recurringIncome;
    document
      .getElementById("recurring-account-wrap")
      ?.classList.toggle("hidden", currentTargetType === "card");
    document
      .getElementById("recurring-card-wrap")
      ?.classList.toggle(
        "hidden",
        currentTargetType !== "card" ||
          currentRuleType === RULE_TYPES.recurringIncome
          ? true
          : false,
      );
  };

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document
    .getElementById("cancel-recurring")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("recurring-rule-type")
    ?.addEventListener("change", syncRecurringTargetVisibility);
  document
    .getElementById("recurring-target-type")
    ?.addEventListener("change", syncRecurringTargetVisibility);
  document
    .getElementById("recurring-form")
    ?.addEventListener("submit", saveRecurringRule);
  syncRecurringTargetVisibility();
}

async function openDebitInstallmentModal() {
  const accounts = getDerivedAccounts().filter((account) => !account.isDeleted);
  if (!accounts.length) {
    toast("Cadastre uma conta antes de parcelar no débito.", "error");
    return;
  }

  openModal(`
    <div class="flex items-center justify-between mb-6">
      <div>
        <div class="text-2xl font-bold">Parcelar no débito</div>
        <div class="text-sm text-slate-500 mt-1">O parcelamento vira um item principal expandível e cada parcela fica visível individualmente.</div>
      </div>
      <button id="close-modal" class="action-btn">Fechar</button>
    </div>
    <form id="debit-installment-form" class="grid md:grid-cols-2 gap-4">
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Descrição</label><input name="description" class="field" placeholder="Ex.: Curso parcelado" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Conta</label><select name="accountId" class="select">${accounts.map((account) => `<option value="${account.id}">${account.name}</option>`).join("")}</select></div>
      <div><label class="text-sm font-semibold mb-2 block">Categoria</label><input name="category" class="field" placeholder="Educação" /></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor total</label><input name="totalAmount" type="number" min="0.01" step="0.01" class="field" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Parcelas</label><input name="installmentCount" type="number" min="2" max="36" value="2" class="field" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Primeira parcela</label><input name="purchaseDate" type="date" class="field" value="${formatDateInput()}" required /></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3"></textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-debit-installment" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">Salvar parcelamento</button></div>
    </form>`);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document
    .getElementById("cancel-debit-installment")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("debit-installment-form")
    ?.addEventListener("submit", saveDebitInstallmentPlan);
}

async function saveTransaction(event) {
  event.preventDefault();
  try {
    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    validateTransaction(payload);
    const existing = payload.id
      ? await getOne("transactions", payload.id)
      : null;
    const timestamp = nowIso();
    const record = {
      ...existing,
      ...payload,
      id: payload.id || createId("tx"),
      amount: Number(payload.amount),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      version: (existing?.version || 0) + 1,
      syncStatus: "pending",
      isDeleted: false,
    };
    await putOne("transactions", record);
    await enqueueSync("transactions", record.id);
    await loadState();
    closeModal();
    toast(
      existing
        ? "Transação atualizada com sucesso."
        : "Transação salva com sucesso.",
      "success",
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

async function saveRecurringRule(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    if (!payload.name?.trim()) throw new Error("Nome é obrigatório.");
    if (Number(payload.amount) <= 0)
      throw new Error("Valor deve ser maior que zero.");
    if (!payload.startDate) throw new Error("Data de início é obrigatória.");
    if (payload.endDate && payload.endDate < payload.startDate) {
      throw new Error("A data de fim não pode ser anterior ao início.");
    }

    const ruleType = payload.ruleType || RULE_TYPES.recurringExpense;
    const targetType =
      ruleType === RULE_TYPES.recurringIncome
        ? "account"
        : payload.targetType || "account";

    if (targetType === "card" && !payload.cardId) {
      throw new Error("Selecione um cartão para o gasto recorrente.");
    }

    if (targetType === "account" && !payload.accountId) {
      throw new Error("Selecione uma conta para a recorrência.");
    }

    const existing = payload.id
      ? await getOne("preferences", payload.id)
      : null;
    const timestamp = nowIso();
    const record = {
      ...existing,
      id: payload.id || createId("pref"),
      kind: PLANNING_RULE_KIND,
      ruleType,
      targetType,
      name: payload.name.trim(),
      amount: Number(payload.amount),
      category: payload.category?.trim() || "",
      frequency: payload.frequency || "monthly",
      startDate: payload.startDate,
      endDate: payload.endDate || "",
      accountId: targetType === "account" ? payload.accountId || "" : "",
      cardId: targetType === "card" ? payload.cardId || "" : "",
      notes: payload.notes?.trim() || "",
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      version: (existing?.version || 0) + 1,
      syncStatus: "pending",
      isDeleted: false,
    };

    await putOne("preferences", record);
    await enqueueSync("preferences", record.id);
    await loadState();
    closeModal();
    toast(
      existing ? "Regra recorrente atualizada." : "Regra recorrente criada.",
      "success",
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

async function saveDebitInstallmentPlan(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const totalAmount = Number(payload.totalAmount);
    const installmentCount = Number(payload.installmentCount);
    if (totalAmount <= 0 || installmentCount < 2) {
      throw new Error("Informe um valor válido e pelo menos 2 parcelas.");
    }

    const timestamp = nowIso();
    const planId = createId("plan");
    const plan = {
      id: planId,
      paymentMethod: DEBIT_INSTALLMENT_METHOD,
      accountId: payload.accountId,
      description: payload.description,
      category: payload.category || "",
      totalAmount,
      installmentCount,
      remainingInstallments: installmentCount,
      purchaseDate: payload.purchaseDate,
      notes: payload.notes || "",
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      syncStatus: "pending",
      isDeleted: false,
    };

    const baseInstallmentValue =
      Math.round((totalAmount / installmentCount) * 100) / 100;
    let consumed = 0;
    const transactions = Array.from(
      { length: installmentCount },
      (_, index) => {
        const installmentNumber = index + 1;
        const amount =
          installmentNumber === installmentCount
            ? Math.round((totalAmount - consumed) * 100) / 100
            : baseInstallmentValue;
        consumed += amount;
        return {
          id: createId("tx"),
          description: `${payload.description} ${installmentNumber}/${installmentCount}`,
          type: "expense",
          accountId: payload.accountId,
          installmentPlanId: planId,
          installmentNumber,
          installmentTotal: installmentCount,
          installmentStatus: INSTALLMENT_STATUS.pending,
          amount,
          category: payload.category || "",
          date: addMonths(payload.purchaseDate, index),
          notes: payload.notes || "",
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
    toast("Parcelamento no débito criado com sucesso.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function updateInstallmentStatus(transactionId, nextStatus) {
  try {
    const existing = await getOne("transactions", transactionId);
    if (!existing) return;

    const status =
      nextStatus === INSTALLMENT_STATUS.anticipated
        ? INSTALLMENT_STATUS.anticipated
        : INSTALLMENT_STATUS.paid;
    const timestamp = nowIso();
    const updatedTransaction = {
      ...existing,
      installmentStatus: status,
      isPaid: status !== INSTALLMENT_STATUS.pending,
      paidAt: timestamp,
      updatedAt: timestamp,
      version: (existing.version || 0) + 1,
      syncStatus: "pending",
    };

    await putOne("transactions", updatedTransaction);
    await enqueueSync("transactions", updatedTransaction.id);
    await syncInstallmentPlanRemaining(updatedTransaction.installmentPlanId);
    await loadState();
    toast(
      status === INSTALLMENT_STATUS.anticipated
        ? "Parcela antecipada com sucesso."
        : "Parcela marcada como paga.",
      "success",
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

async function syncInstallmentPlanRemaining(planId) {
  if (!planId) return;
  const plan = await getOne("installmentPlans", planId);
  if (!plan || plan.isDeleted) return;
  const transactions = await getAll("transactions");
  const pendingCount = transactions.filter(
    (transaction) =>
      !transaction.isDeleted &&
      transaction.installmentPlanId === planId &&
      getInstallmentStatus(transaction) === INSTALLMENT_STATUS.pending,
  ).length;

  if (pendingCount === Number(plan.remainingInstallments || 0)) return;

  await putOne("installmentPlans", {
    ...plan,
    remainingInstallments: pendingCount,
    updatedAt: nowIso(),
    version: (plan.version || 0) + 1,
    syncStatus: "pending",
  });
  await enqueueSync("installmentPlans", plan.id);
}

function confirmDelete(transactionId) {
  confirmDialog({
    title: "Excluir transação",
    message:
      "A transação será marcada como excluída e deixará de compor os saldos derivados.",
    confirmText: "Excluir transação",
    onConfirm: async () => {
      const existing = await getOne("transactions", transactionId);
      if (!existing) return;
      const record = {
        ...existing,
        isDeleted: true,
        updatedAt: nowIso(),
        version: (existing.version || 0) + 1,
        syncStatus: "pending",
      };
      await putOne("transactions", record);
      await enqueueSync("transactions", record.id);
      await syncInstallmentPlanRemaining(existing.installmentPlanId);
      await loadState();
      toast("Transação excluída.", "success");
    },
  });
}

function confirmDeleteRecurringRule(ruleId) {
  confirmDialog({
    title: "Excluir recorrência",
    message:
      "A regra será marcada como excluída. Os lançamentos já gerados permanecem preservados.",
    confirmText: "Excluir regra",
    onConfirm: async () => {
      const existing = await getOne("preferences", ruleId);
      if (!existing) return;
      await putOne("preferences", {
        ...existing,
        isDeleted: true,
        updatedAt: nowIso(),
        version: (existing.version || 0) + 1,
        syncStatus: "pending",
      });
      await enqueueSync("preferences", ruleId);
      await loadState();
      toast("Regra recorrente excluída.", "success");
    },
  });
}

function confirmDeleteInstallmentPlan(planId) {
  confirmDialog({
    title: "Excluir parcelamento",
    message:
      "O plano será marcado como excluído e as parcelas futuras deixam de aparecer na organização principal.",
    confirmText: "Excluir parcelamento",
    onConfirm: async () => {
      const existing = await getOne("installmentPlans", planId);
      if (!existing) return;
      await putOne("installmentPlans", {
        ...existing,
        isDeleted: true,
        updatedAt: nowIso(),
        version: (existing.version || 0) + 1,
        syncStatus: "pending",
      });
      await enqueueSync("installmentPlans", planId);

      const relatedTransactions = state.data.transactions.filter(
        (transaction) =>
          !transaction.isDeleted && transaction.installmentPlanId === planId,
      );
      const timestamp = nowIso();
      const updates = relatedTransactions.map((transaction) => ({
        ...transaction,
        isDeleted: true,
        updatedAt: timestamp,
        version: (transaction.version || 0) + 1,
        syncStatus: "pending",
      }));
      if (updates.length) {
        await bulkPut("transactions", updates);
        await Promise.all(
          updates.map((transaction) =>
            enqueueSync("transactions", transaction.id),
          ),
        );
      }

      await loadState();
      toast("Parcelamento excluído.", "success");
    },
  });
}

function renderDebitPlanRows(plan) {
  const account = state.data.accounts.find(
    (item) => item.id === plan.accountId,
  );
  return `
    <tr>
      <td>
        <div class="font-semibold">${plan.description}</div>
        <div class="text-sm text-slate-500">${plan.category || "Sem categoria"}</div>
      </td>
      <td>${account?.name || "Conta removida"}</td>
      <td>${currency(plan.totalAmount)}</td>
      <td>
        <div class="text-sm font-semibold text-slate-900">${plan.settledCount}/${plan.installmentCount}</div>
        <div class="progress-rail mt-2"><span style="width:${plan.progressPercent}%"></span></div>
      </td>
      <td>${datePt(plan.purchaseDate)}</td>
      <td>
        <div class="flex gap-2 flex-wrap">
          <button class="table-action" data-plan-toggle="${plan.id}">Expandir</button>
          <button class="table-action table-action-danger" data-plan-delete="${plan.id}">Excluir</button>
        </div>
      </td>
    </tr>
    <tr data-plan-detail="${plan.id}" class="hidden">
      <td colspan="6">
        <div class="rounded-[24px] border border-slate-100 bg-slate-50/80 p-4 space-y-3">
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div class="font-semibold text-slate-900">${plan.description}</div>
              <div class="text-sm text-slate-500">${plan.remainingInstallments} parcela(s) pendente(s) • ${currency(plan.totalAmount)}</div>
            </div>
            <span class="badge badge-muted">Progresso ${plan.progressPercent}%</span>
          </div>
          ${
            plan.installments
              .map(
                (installment) => `
                  <div class="rounded-[18px] border border-slate-200 bg-white p-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div>
                      <div class="font-semibold text-slate-900">Parcela ${installment.installmentNumber}/${installment.installmentTotal}</div>
                      <div class="text-sm text-slate-500">${datePt(installment.date)} • ${currency(installment.amount)}</div>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="badge ${getInstallmentStatusBadge(installment.computedStatus)}">${getInstallmentStatusLabel(installment.computedStatus)}</span>
                      ${
                        installment.computedStatus ===
                        INSTALLMENT_STATUS.pending
                          ? `<button class="table-action" data-installment-action="${INSTALLMENT_STATUS.paid}" data-transaction-id="${installment.id}">Marcar paga</button>
                             <button class="table-action" data-installment-action="${INSTALLMENT_STATUS.anticipated}" data-transaction-id="${installment.id}">Adiantar</button>`
                          : ""
                      }
                    </div>
                  </div>`,
              )
              .join("") ||
            '<div class="text-sm text-slate-500">Nenhuma parcela encontrada.</div>'
          }
        </div>
      </td>
    </tr>`;
}

function statusLabelForTransaction(transaction) {
  if (transaction.installmentPlanId) {
    return getInstallmentStatusLabel(getInstallmentStatus(transaction));
  }
  return transaction.syncStatus || "pending";
}

function statusBadgeForTransaction(transaction) {
  if (transaction.installmentPlanId) {
    return getInstallmentStatusBadge(getInstallmentStatus(transaction));
  }
  return transaction.syncStatus === "synced"
    ? "badge-success"
    : transaction.syncStatus === "failed"
      ? "badge-danger"
      : "badge-warning";
}

function addMonths(dateInput, months) {
  const date = new Date(dateInput);
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

function selected(value, current) {
  return value === current ? "selected" : "";
}

function labelByType(type) {
  return (
    {
      income: "Receita",
      expense: "Despesa",
      transfer: "Transferência",
      adjustment: "Ajuste",
      card_expense: "Compra no cartão",
    }[type] || type
  );
}

function badgeByType(type) {
  return (
    {
      income: "badge-success",
      expense: "badge-danger",
      transfer: "badge-muted",
      adjustment: "badge-warning",
      card_expense: "badge-warning",
    }[type] || "badge-muted"
  );
}
