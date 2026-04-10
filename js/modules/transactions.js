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
  addMonthsToDateInput,
  compareDateInputs,
} from "../utils/dates.js";
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

const INSTALLMENT_AMOUNT_MODES = {
  total: "total",
  installment: "installment",
};

function resolveInstallmentAmounts(rawAmount, installmentCount, amountMode) {
  const normalizedCount = Number(installmentCount || 0);
  const normalizedAmount = Math.round(Number(rawAmount || 0) * 100) / 100;
  const safeMode =
    amountMode === INSTALLMENT_AMOUNT_MODES.installment
      ? INSTALLMENT_AMOUNT_MODES.installment
      : INSTALLMENT_AMOUNT_MODES.total;

  if (normalizedAmount <= 0 || normalizedCount < 1) {
    return { totalAmount: 0, amounts: [] };
  }

  if (safeMode === INSTALLMENT_AMOUNT_MODES.installment) {
    const installmentValue = normalizedAmount;
    const amounts = Array.from({ length: normalizedCount }, () => installmentValue);
    return {
      totalAmount:
        Math.round(installmentValue * normalizedCount * 100) / 100,
      amounts,
    };
  }

  const baseInstallmentValue =
    Math.round((normalizedAmount / normalizedCount) * 100) / 100;
  let consumed = 0;
  const amounts = Array.from({ length: normalizedCount }, (_, index) => {
    const installmentNumber = index + 1;
    const amount =
      installmentNumber === normalizedCount
        ? Math.round((normalizedAmount - consumed) * 100) / 100
        : baseInstallmentValue;
    consumed += amount;
    return amount;
  });

  return {
    totalAmount: Math.round(normalizedAmount * 100) / 100,
    amounts,
  };
}

function bindInstallmentAmountModePreview({
  modeSelectId,
  amountInputId,
  countInputId,
  labelId,
  hintId,
}) {
  const modeField = document.getElementById(modeSelectId);
  const amountField = document.getElementById(amountInputId);
  const countField = document.getElementById(countInputId);
  const label = document.getElementById(labelId);
  const hint = document.getElementById(hintId);
  if (!modeField || !amountField || !countField || !label || !hint) return;

  const sync = () => {
    const mode =
      modeField.value === INSTALLMENT_AMOUNT_MODES.installment
        ? INSTALLMENT_AMOUNT_MODES.installment
        : INSTALLMENT_AMOUNT_MODES.total;
    const installmentCount = Number(countField.value || 0);
    const enteredAmount = Number(amountField.value || 0);

    label.textContent =
      mode === INSTALLMENT_AMOUNT_MODES.installment
        ? "Valor de cada parcela"
        : "Valor total";

    if (enteredAmount > 0 && installmentCount > 0) {
      const resolved = resolveInstallmentAmounts(
        enteredAmount,
        installmentCount,
        mode,
      );
      const firstInstallment = Number(resolved.amounts[0] || 0);
      hint.textContent =
        mode === INSTALLMENT_AMOUNT_MODES.installment
          ? `Resultado: ${installmentCount}x de ${currency(firstInstallment)} • total ${currency(resolved.totalAmount)}`
          : `Resultado: ${installmentCount}x de ${currency(firstInstallment)} • total ${currency(resolved.totalAmount)}`;
      return;
    }

    hint.textContent =
      mode === INSTALLMENT_AMOUNT_MODES.installment
        ? "Informe quanto vale cada parcela para o app calcular o total automaticamente."
        : "Informe o valor total para o app distribuir entre as parcelas.";
  };

  modeField.addEventListener("change", sync);
  amountField.addEventListener("input", sync);
  countField.addEventListener("input", sync);
  sync();
}

export function renderTransactions() {
  const cardsById = getCardsById(state.data.creditCards);
  const rows = [...state.data.transactions]
    .filter(
      (transaction) =>
        !transaction.isDeleted &&
        isTransactionInMonth(transaction, state.ui.selectedMonth, cardsById),
    )
    .sort((a, b) => compareDateInputs(b.date, a.date));
  const accounts = getDerivedAccounts();
  const recurringRules = getRecurringRules(state.data.preferences).sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0) -
      new Date(a.updatedAt || a.createdAt || 0),
  );
  const debitPlans = getDebitInstallmentPlans(state.data.installmentPlans)
    .map((plan) => buildInstallmentPlanView(plan, state.data.transactions))
    .sort((a, b) => compareDateInputs(b.purchaseDate, a.purchaseDate));

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
        ${renderInstallmentExperienceStyles("debit")}
        <div class="section-head section-head-spaced">
          <div>
            <div class="text-sm text-slate-500">Parcelamentos</div>
            <div class="section-title">Parcelamentos no débito</div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="badge badge-muted">${debitPlans.reduce((sum, plan) => sum + plan.remainingInstallments, 0)} parcela(s) pendente(s)</span>
            ${
              debitPlans.length
                ? `<button class="table-action" id="expand-all-debit-plans-btn">Expandir tudo</button>
                   <button class="table-action" id="collapse-all-debit-plans-btn">Recolher tudo</button>`
                : ""
            }
          </div>
        </div>
        <div id="transactions-plans-root" class="installment-plan-grid">
          ${
            debitPlans.map(renderDebitPlanCard).join("") ||
            `<div class="installment-empty-state">Nenhum parcelamento no débito cadastrado.</div>`
          }
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

  bindDebitPlanInteractions();

  document
    .getElementById("expand-all-debit-plans-btn")
    ?.addEventListener("click", () => setAllDebitPlansExpanded(true));
  document
    .getElementById("collapse-all-debit-plans-btn")
    ?.addEventListener("click", () => setAllDebitPlansExpanded(false));
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
      <div>
        <label class="text-sm font-semibold mb-2 block">Como informar o valor</label>
        <select name="amountMode" id="debit-installment-amount-mode" class="select">
          <option value="total">Valor total</option>
          <option value="installment">Valor de cada parcela</option>
        </select>
      </div>
      <div>
        <label id="debit-installment-amount-label" class="text-sm font-semibold mb-2 block">Valor total</label>
        <input id="debit-installment-amount-input" name="amountValue" type="number" min="0.01" step="0.01" class="field" required />
        <div id="debit-installment-amount-hint" class="text-xs text-slate-500 mt-2">Informe o valor total para o app distribuir entre as parcelas.</div>
      </div>
      <div><label class="text-sm font-semibold mb-2 block">Parcelas</label><input id="debit-installment-count" name="installmentCount" type="number" min="2" max="36" value="2" class="field" required /></div>
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
  bindInstallmentAmountModePreview({
    modeSelectId: "debit-installment-amount-mode",
    amountInputId: "debit-installment-amount-input",
    countInputId: "debit-installment-count",
    labelId: "debit-installment-amount-label",
    hintId: "debit-installment-amount-hint",
  });
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

    const allowNegativeBalance = await confirmNegativeBalanceIfNeeded({
      existingRecord: existing,
      nextRecord: record,
      actionLabel: existing ? "salvar esta edição" : "registrar esta transação",
    });
    if (!allowNegativeBalance) return;

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
    const installmentCount = Number(payload.installmentCount);
    const amountMode =
      payload.amountMode === INSTALLMENT_AMOUNT_MODES.installment
        ? INSTALLMENT_AMOUNT_MODES.installment
        : INSTALLMENT_AMOUNT_MODES.total;
    const resolvedAmounts = resolveInstallmentAmounts(
      payload.amountValue,
      installmentCount,
      amountMode,
    );
    const totalAmount = Number(resolvedAmounts.totalAmount || 0);
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
      amountEntryMode: amountMode,
      amountEntryValue: Math.round(Number(payload.amountValue || 0) * 100) / 100,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      syncStatus: "pending",
      isDeleted: false,
    };

    const transactions = Array.from(
      { length: installmentCount },
      (_, index) => {
        const installmentNumber = index + 1;
        const amount = Number(resolvedAmounts.amounts[index] || 0);
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
          date: addMonthsToDateInput(payload.purchaseDate, index),
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

    const allowNegativeBalance = await confirmNegativeBalanceIfNeeded({
      nextRecord: {
        type: "expense",
        accountId: payload.accountId,
        amount: totalAmount,
      },
      actionLabel: "criar este parcelamento no débito",
    });
    if (!allowNegativeBalance) return;

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

    const timestamp = nowIso();
    const today = formatDateInput();
    const isAnticipation = nextStatus === INSTALLMENT_STATUS.anticipated;
    const updatedTransaction = {
      ...existing,
      installmentStatus: isAnticipation
        ? INSTALLMENT_STATUS.anticipated
        : INSTALLMENT_STATUS.paid,
      isPaid: true,
      paidAt: timestamp,
      anticipatedAt: isAnticipation ? timestamp : existing.anticipatedAt,
      anticipatedOriginalDate:
        isAnticipation && !existing.anticipatedOriginalDate
          ? existing.date
          : existing.anticipatedOriginalDate,
      date: isAnticipation ? today : existing.date,
      updatedAt: timestamp,
      version: (existing.version || 0) + 1,
      syncStatus: "pending",
    };

    await putOne("transactions", updatedTransaction);
    await enqueueSync("transactions", updatedTransaction.id);
    await reconcileInstallmentPlan(updatedTransaction.installmentPlanId);
    await loadState();
    toast(
      isAnticipation
        ? "Parcela adiantada e trazida para o mês atual."
        : "Parcela marcada como paga.",
      "success",
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

async function reconcileInstallmentPlan(planId) {
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
    expandedDebitPlans.delete(plan.id);
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
    (transaction) =>
      getInstallmentStatus(transaction) === INSTALLMENT_STATUS.pending,
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
      await reconcileInstallmentPlan(existing.installmentPlanId);
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

      expandedDebitPlans.delete(planId);
      await loadState();
      toast("Parcelamento excluído.", "success");
    },
  });
}

async function openDebitInstallmentEditModal(transactionId) {
  const existing = transactionId ? await getOne("transactions", transactionId) : null;
  if (!existing || existing.isDeleted || !existing.installmentPlanId) return;

  const plan = await getOne("installmentPlans", existing.installmentPlanId);
  const account = state.data.accounts.find((item) => item.id === existing.accountId);

  openModal(`
    <div class="flex items-center justify-between mb-6"><div><div class="text-2xl font-bold">Editar parcela</div><div class="text-sm text-slate-500 mt-1">Ajuste apenas esta parcela sem recriar o parcelamento.</div></div><button id="close-modal" class="action-btn">Fechar</button></div>
    <form id="debit-installment-edit-form" class="grid md:grid-cols-2 gap-4">
      <input type="hidden" name="id" value="${existing.id}" />
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Descrição</label><input name="description" class="field" value="${existing.description || plan?.description || ""}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Conta</label><input class="field" value="${account?.name || "Conta removida"}" disabled /></div>
      <div><label class="text-sm font-semibold mb-2 block">Categoria</label><input name="category" class="field" value="${existing.category || ""}" /></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor</label><input name="amount" type="number" min="0.01" step="0.01" class="field" value="${existing.amount || 0}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Data</label><input name="date" type="date" class="field" value="${existing.date || formatDateInput()}" required /></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Observações</label><textarea name="notes" class="textarea" rows="3">${existing.notes || ""}</textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-debit-installment-edit" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">Salvar parcela</button></div>
    </form>
  `);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document
    .getElementById("cancel-debit-installment-edit")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("debit-installment-edit-form")
    ?.addEventListener("submit", saveDebitInstallmentEdit);
}

async function saveDebitInstallmentEdit(event) {
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
      notes: payload.notes || "",
      updatedAt: timestamp,
      version: (existing.version || 0) + 1,
      syncStatus: "pending",
    };

    const allowNegativeBalance = await confirmNegativeBalanceIfNeeded({
      existingRecord: existing,
      nextRecord: updatedTransaction,
      actionLabel: "salvar esta edição da parcela",
    });
    if (!allowNegativeBalance) return;

    await putOne("transactions", updatedTransaction);
    await enqueueSync("transactions", existing.id);
    await reconcileInstallmentPlan(existing.installmentPlanId);
    await loadState();
    closeModal();
    toast("Parcela atualizada com sucesso.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
}

function confirmDeleteInstallment(transactionId) {
  confirmDialog({
    title: "Excluir parcela",
    message:
      "Somente esta parcela será removida. O plano será recalculado automaticamente.",
    confirmText: "Excluir parcela",
    onConfirm: async () => {
      const existing = await getOne("transactions", transactionId);
      if (!existing) return;

      await putOne("transactions", {
        ...existing,
        isDeleted: true,
        updatedAt: nowIso(),
        version: (existing.version || 0) + 1,
        syncStatus: "pending",
      });
      await enqueueSync("transactions", existing.id);
      await reconcileInstallmentPlan(existing.installmentPlanId);
      await loadState();
      toast("Parcela excluída.", "success");
    },
  });
}

const expandedDebitPlans = new Set();

function bindDebitPlanInteractions() {
  const root = document.getElementById("transactions-plans-root");
  if (!root) return;

  root.addEventListener("click", async (event) => {
    const toggleButton = event.target.closest("[data-plan-toggle]");
    if (toggleButton) {
      event.preventDefault();
      toggleDebitPlan(toggleButton.dataset.planToggle, root);
      return;
    }

    const editButton = event.target.closest("[data-installment-edit]");
    if (editButton) {
      event.preventDefault();
      await openDebitInstallmentEditModal(editButton.dataset.installmentEdit);
      return;
    }

    const installmentDeleteButton = event.target.closest(
      "[data-installment-delete]",
    );
    if (installmentDeleteButton) {
      event.preventDefault();
      confirmDeleteInstallment(installmentDeleteButton.dataset.installmentDelete);
      return;
    }

    const deleteButton = event.target.closest("[data-plan-delete]");
    if (deleteButton) {
      event.preventDefault();
      confirmDeleteInstallmentPlan(deleteButton.dataset.planDelete);
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

function toggleDebitPlan(planId, root) {
  if (!planId) return;
  const expanded = !expandedDebitPlans.has(planId);
  if (expanded) {
    expandedDebitPlans.add(planId);
  } else {
    expandedDebitPlans.delete(planId);
  }
  syncPlanCardState(root, planId, expanded);
}

function setAllDebitPlansExpanded(expanded) {
  const root = document.getElementById("transactions-plans-root");
  if (!root) return;
  const ids = Array.from(root.querySelectorAll("[data-plan-card]"))
    .map((card) => card.dataset.planCard)
    .filter(Boolean);

  ids.forEach((id) => {
    if (expanded) {
      expandedDebitPlans.add(id);
    } else {
      expandedDebitPlans.delete(id);
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

function renderDebitPlanCard(plan) {
  const account = state.data.accounts.find((item) => item.id === plan.accountId);
  const isExpanded = expandedDebitPlans.has(plan.id);

  return `
    <article class="installment-plan-card ${isExpanded ? "is-open" : ""}" data-plan-card="${plan.id}">
      <button
        type="button"
        class="installment-plan-summary"
        data-plan-toggle="${plan.id}"
        aria-expanded="${isExpanded ? "true" : "false"}"
      >
        <div class="installment-plan-summary-main">
          <span class="installment-plan-eyebrow">Parcelamento no débito • ${account?.name || "Conta removida"}</span>
          <h3>${plan.description}</h3>
          <p>${plan.category || "Sem categoria"} • início ${datePt(plan.purchaseDate)}</p>
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
            <span>Progresso</span>
            <strong>${plan.settledCount}/${plan.installmentCount}</strong>
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
            <span>Valor médio</span>
            <strong>${currency(plan.installments?.[0]?.amount || 0)}</strong>
          </div>
          <div class="installment-plan-meta-card">
            <span>Parcelas totais</span>
            <strong>${plan.installmentCount}</strong>
          </div>
          <div class="installment-plan-meta-card">
            <span>Última parcela</span>
            <strong>${plan.installments?.length ? datePt(plan.installments[plan.installments.length - 1].date) : "—"}</strong>
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
                      <div class="installment-timeline-subtitle">${datePt(installment.date)} • ${currency(installment.amount)}${installment.anticipatedAt ? " • antecipada para este mês" : ""}</div>
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

        <div class="installment-plan-footer">
          <button class="table-action table-action-danger" data-plan-delete="${plan.id}">Excluir parcelamento</button>
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
          radial-gradient(circle at top right, rgba(99, 102, 241, 0.12), transparent 30%),
          linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92));
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
        overflow: hidden;
        transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
      }

      .installment-plan-card:hover,
      .installment-plan-card.is-open {
        transform: translateY(-2px);
        box-shadow: 0 24px 54px rgba(15, 23, 42, 0.12);
        border-color: rgba(99, 102, 241, 0.24);
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
        background: linear-gradient(90deg, #4f46e5, #22c55e);
      }

      .installment-plan-content {
        padding: 18px 22px 22px;
        display: grid;
        gap: 18px;
        border-top: 1px solid rgba(226, 232, 240, 0.9);
        background: linear-gradient(180deg, rgba(248,250,252,0.2), rgba(248,250,252,0.82));
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

      .installment-plan-footer {
        display: flex;
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


function createAccountDeltaMap() {
  return new Map();
}

function appendAccountDelta(deltaMap, accountId, amount) {
  if (!accountId) return;
  const numericAmount = Number(amount || 0);
  if (!numericAmount) return;
  deltaMap.set(accountId, (deltaMap.get(accountId) || 0) + numericAmount);
}

function getTransactionAccountEffects(transaction) {
  const effects = createAccountDeltaMap();
  if (!transaction || transaction.isDeleted) return effects;

  const amount = Number(transaction.amount || 0);
  if (!amount) return effects;

  switch (transaction.type) {
    case "income":
      appendAccountDelta(effects, transaction.accountId, amount);
      break;
    case "expense":
      appendAccountDelta(effects, transaction.accountId, -amount);
      break;
    case "adjustment":
      appendAccountDelta(effects, transaction.accountId, amount);
      break;
    case "transfer":
      appendAccountDelta(effects, transaction.accountId, -amount);
      appendAccountDelta(effects, transaction.destinationAccountId, amount);
      break;
    default:
      break;
  }

  return effects;
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function getProjectedNegativeBalanceWarnings(existingRecord, nextRecord) {
  const accounts = getDerivedAccounts().filter((account) => !account.isDeleted);
  const balancesById = new Map(
    accounts.map((account) => [account.id, Number(account.derivedBalance || 0)]),
  );
  const accountNamesById = new Map(accounts.map((account) => [account.id, account.name]));
  const deltaMap = createAccountDeltaMap();

  for (const [accountId, effect] of getTransactionAccountEffects(existingRecord)) {
    appendAccountDelta(deltaMap, accountId, -effect);
  }
  for (const [accountId, effect] of getTransactionAccountEffects(nextRecord)) {
    appendAccountDelta(deltaMap, accountId, effect);
  }

  return [...deltaMap.entries()]
    .map(([accountId, delta]) => {
      const currentBalance = Number(balancesById.get(accountId) || 0);
      const projectedBalance = roundMoney(currentBalance + Number(delta || 0));
      return {
        accountId,
        accountName: accountNamesById.get(accountId) || "Conta",
        delta: roundMoney(delta),
        currentBalance: roundMoney(currentBalance),
        projectedBalance,
      };
    })
    .filter((item) => item.delta < 0 && item.projectedBalance < 0);
}

async function confirmNegativeBalanceIfNeeded({
  existingRecord = null,
  nextRecord = null,
  actionLabel = "salvar esta movimentação",
}) {
  const warnings = getProjectedNegativeBalanceWarnings(existingRecord, nextRecord);
  if (!warnings.length) return true;

  const message = warnings
    .map(
      (warning) =>
        `<strong>${warning.accountName}</strong>: saldo atual ${currency(
          warning.currentBalance,
        )} → saldo projetado ${currency(warning.projectedBalance)}`,
    )
    .join("<br>");

  return new Promise((resolve) => {
    confirmDialog({
      title: "Conta ficará negativa",
      message: `Ao ${actionLabel}, a conta pode ficar negativa.<br><br>${message}<br><br>Deseja continuar mesmo assim?`,
      confirmText: "Continuar mesmo negativo",
      tone: "danger",
      onConfirm: async () => {
        resolve(true);
      },
    });

    document.getElementById("confirm-cancel-btn")?.addEventListener(
      "click",
      () => resolve(false),
      { once: true },
    );
    document.querySelector("#modal-root .modal-backdrop")?.addEventListener(
      "click",
      (event) => {
        if (event.target.classList.contains("modal-backdrop")) resolve(false);
      },
      { once: true },
    );
  });
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
