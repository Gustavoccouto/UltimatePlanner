import { state, loadState } from "../state.js";
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

export function renderInvestments() {
  const investments = state.data.investments.filter((item) => !item.isDeleted);
  const totalInvested = investments.reduce(
    (sum, item) => sum + Number(item.amountInvested || 0),
    0,
  );
  const currentValue = investments.reduce(
    (sum, item) => sum + Number(item.currentValue || item.amountInvested || 0),
    0,
  );
  const profitability = totalInvested
    ? ((currentValue - totalInvested) / totalInvested) * 100
    : 0;

  return `
    ${pageHeader(
      "Investimentos",
      "Controle aportes, valor atual, tipo, corretora e evolução.",
      `<button id="new-investment-btn" class="action-btn action-btn-primary"><i class="fa-solid fa-plus mr-2"></i>Novo investimento</button>`,
    )}

    <section class="module-stack">
      <div class="grid md:grid-cols-3 gap-4">
        ${metricCard("Aportado", currency(totalInvested), "fa-wallet")}
        ${metricCard("Valor atual", currency(currentValue), "fa-chart-line")}
        ${metricCard("Rentabilidade simples", percent(profitability), "fa-sparkles")}
      </div>

      <div class="module-card-grid investment-card-grid">
        ${
          investments.map((investment) => renderInvestmentCard(investment)).join("") ||
          emptyState(
            "Nenhum investimento cadastrado",
            "Adicione ativos para acompanhar valor aportado e valor atual.",
          )
        }
      </div>
    </section>`;
}

export function bindInvestmentsEvents() {
  document
    .getElementById("new-investment-btn")
    ?.addEventListener("click", () => openInvestmentModal());
  document
    .querySelectorAll("[data-investment-edit]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        openInvestmentModal(button.dataset.investmentEdit),
      ),
    );
  document
    .querySelectorAll("[data-investment-delete]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        confirmDelete(button.dataset.investmentDelete),
      ),
    );
}

function renderInvestmentCard(investment) {
  const invested = Number(investment.amountInvested || 0);
  const current = Number(investment.currentValue || invested);
  const profitability = invested ? ((current - invested) / invested) * 100 : 0;
  const isPositive = profitability >= 0;

  return `
    <article class="card investment-showcase-card">
      <div class="investment-showcase-top ${isPositive ? "is-positive" : "is-negative"}">
        <div class="investment-chip">${investment.type || "Ativo"}</div>
        <span class="badge ${isPositive ? "badge-success" : "badge-danger"}">${percent(profitability)}</span>
      </div>

      <div class="investment-showcase-body">
        <div class="investment-showcase-title">${investment.name}</div>
        <div class="investment-showcase-subtitle">${investment.broker || "Sem corretora definida"}</div>

        <div class="investment-metrics-grid">
          <div class="investment-metric-tile">
            <span>Aportado</span>
            <strong>${currency(invested)}</strong>
          </div>
          <div class="investment-metric-tile">
            <span>Atual</span>
            <strong>${currency(current)}</strong>
          </div>
          <div class="investment-metric-tile">
            <span>Último aporte</span>
            <strong>${investment.purchaseDate ? datePt(investment.purchaseDate) : "—"}</strong>
          </div>
          <div class="investment-metric-tile">
            <span>Resultado</span>
            <strong class="${isPositive ? "text-emerald-600" : "text-rose-600"}">${currency(current - invested)}</strong>
          </div>
        </div>

        <div class="investment-action-row">
          <button class="action-btn" data-investment-edit="${investment.id}">
            <i class="fa-solid fa-pen mr-2"></i>Editar
          </button>
          <button class="action-btn action-btn-danger-soft" data-investment-delete="${investment.id}">
            <i class="fa-solid fa-trash mr-2"></i>Excluir
          </button>
        </div>
      </div>
    </article>`;
}

async function openInvestmentModal(investmentId = null) {
  const existing = investmentId
    ? await getOne("investments", investmentId)
    : null;

  openModal(`
    <div class="premium-modal-head">
      <div>
        <div class="premium-modal-kicker">Investimentos</div>
        <div class="premium-modal-title">${existing ? "Editar investimento" : "Novo investimento"}</div>
        <div class="premium-modal-subtitle">Guarde tipo, corretora, valor aportado e valor atual em JSON.</div>
      </div>
      <button id="close-modal" class="action-btn">Fechar</button>
    </div>

    <form id="investment-form" class="grid md:grid-cols-2 gap-4">
      <input type="hidden" name="id" value="${existing?.id || ""}" />

      <div>
        <label class="text-sm font-semibold mb-2 block">Nome</label>
        <input name="name" class="field" value="${existing?.name || ""}" required />
      </div>

      <div>
        <label class="text-sm font-semibold mb-2 block">Tipo</label>
        <input name="type" class="field" value="${existing?.type || ""}" placeholder="Tesouro, ETF, ação..." required />
      </div>

      <div>
        <label class="text-sm font-semibold mb-2 block">Corretora</label>
        <input name="broker" class="field" value="${existing?.broker || ""}" />
      </div>

      <div>
        <label class="text-sm font-semibold mb-2 block">Data</label>
        <input name="purchaseDate" type="date" class="field" value="${existing?.purchaseDate || formatDateInput()}" />
      </div>

      <div>
        <label class="text-sm font-semibold mb-2 block">Valor aportado</label>
        <input name="amountInvested" type="number" min="0.01" step="0.01" class="field" value="${existing?.amountInvested || ""}" required />
      </div>

      <div>
        <label class="text-sm font-semibold mb-2 block">Valor atual</label>
        <input name="currentValue" type="number" min="0" step="0.01" class="field" value="${existing?.currentValue || existing?.amountInvested || ""}" required />
      </div>

      <div class="md:col-span-2">
        <label class="text-sm font-semibold mb-2 block">Observações</label>
        <textarea name="notes" class="textarea" rows="3">${existing?.notes || ""}</textarea>
      </div>

      <div class="md:col-span-2 flex justify-end gap-3 pt-2">
        <button type="button" id="cancel-investment" class="action-btn">Cancelar</button>
        <button class="action-btn action-btn-primary" type="submit">
          ${existing ? "Salvar alterações" : "Salvar investimento"}
        </button>
      </div>
    </form>`);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document
    .getElementById("cancel-investment")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("investment-form")
    ?.addEventListener("submit", saveInvestment);
}

async function saveInvestment(event) {
  event.preventDefault();
  try {
    const payload = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    validateRequired(payload.name, "Nome");
    validateRequired(payload.type, "Tipo");
    validatePositive(payload.amountInvested, "Valor aportado");
    validateNonNegative(payload.currentValue, "Valor atual");

    const timestamp = nowIso();
    const existing = payload.id
      ? await getOne("investments", payload.id)
      : null;
    const record = {
      ...existing,
      ...payload,
      amountInvested: Number(payload.amountInvested),
      currentValue: Number(payload.currentValue),
      id: payload.id || createId("inv"),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      version: (existing?.version || 0) + 1,
      syncStatus: "pending",
      isDeleted: false,
    };

    await putOne("investments", record);
    await enqueueSync("investments", record.id);
    await loadState();
    closeModal();
    toast(
      existing
        ? "Investimento atualizado com sucesso."
        : "Investimento salvo com sucesso.",
      "success",
    );
  } catch (error) {
    toast(error.message, "error");
  }
}

function confirmDelete(investmentId) {
  confirmDialog({
    title: "Excluir investimento",
    message:
      "O investimento será marcado como excluído, preservando histórico e sincronização.",
    confirmText: "Excluir investimento",
    onConfirm: async () => {
      const existing = await getOne("investments", investmentId);
      if (!existing) return;
      const record = {
        ...existing,
        isDeleted: true,
        updatedAt: nowIso(),
        version: (existing.version || 0) + 1,
        syncStatus: "pending",
      };
      await putOne("investments", record);
      await enqueueSync("investments", record.id);
      await loadState();
      toast("Investimento excluído.", "success");
    },
  });
}

function metricCard(label, value, icon) {
  return `
    <article class="card investment-metric-card">
      <div class="compact-stat-icon"><i class="fa-solid ${icon}"></i></div>
      <div class="compact-stat-label mt-4">${label}</div>
      <div class="compact-stat-value">${value}</div>
    </article>`;
}

function emptyState(title, text) {
  return `
    <div class="card p-10 text-center lg:col-span-3">
      <div class="text-xl font-bold">${title}</div>
      <div class="text-slate-500 mt-2">${text}</div>
    </div>`;
}
