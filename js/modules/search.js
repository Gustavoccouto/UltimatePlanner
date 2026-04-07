import { pageHeader } from "../ui.js";
import { state } from "../state.js";
import { navigate } from "../router.js";
import { currency, datePt, percent } from "../utils/formatters.js";

const SEARCH_GROUPS = [
  {
    title: "Contas",
    route: "accounts",
    emptyLabel: "Conta",
    getItems: () => state.data.accounts.filter((item) => !item.isDeleted),
    matcher: (item) => [item.name, item.bankName, item.notes, item.type],
    renderMeta: (item) =>
      `${item.bankName || "Banco"} • ${item.type || "Conta"}`,
  },
  {
    title: "Transações",
    route: "transactions",
    emptyLabel: "Transação",
    getItems: () => state.data.transactions.filter((item) => !item.isDeleted),
    matcher: (item) => [item.description, item.category, item.notes, item.type],
    renderMeta: (item) =>
      `${item.category || "Sem categoria"} • ${datePt(item.date)}`,
    renderValue: (item) => currency(item.amount || 0),
  },
  {
    title: "Cartões",
    route: "cards",
    emptyLabel: "Cartão",
    getItems: () => state.data.creditCards.filter((item) => !item.isDeleted),
    matcher: (item) => [item.name, item.brand, item.notes],
    renderMeta: (item) =>
      `${item.brand || "Bandeira"} • venc. ${item.dueDay || "-"} / fecha ${item.closingDay || "-"}`,
    renderValue: (item) => currency(item.limitAmount || 0),
  },
  {
    title: "Projetos",
    route: "projects",
    emptyLabel: "Projeto",
    getItems: () => state.data.projects.filter((item) => !item.isDeleted),
    matcher: (item) => [item.name, item.status, item.notes],
    renderMeta: (item) =>
      `${item.status || "Em andamento"} • prazo ${item.deadline ? datePt(item.deadline) : "aberto"}`,
    renderValue: (item) => currency(item.budget || 0),
  },
  {
    title: "Metas",
    route: "goals",
    emptyLabel: "Meta",
    getItems: () => state.data.goals.filter((item) => !item.isDeleted),
    matcher: (item) => [item.name, item.category, item.notes],
    renderMeta: (item) =>
      `${item.category || "Meta"} • prazo ${item.targetDate ? datePt(item.targetDate) : "aberto"}`,
    renderValue: (item) =>
      percent(
        Math.min(
          100,
          (Number(item.currentAmount || 0) /
            Math.max(Number(item.targetAmount || 1), 1)) *
            100,
        ),
      ),
  },
  {
    title: "Investimentos",
    route: "investments",
    emptyLabel: "Investimento",
    getItems: () => state.data.investments.filter((item) => !item.isDeleted),
    matcher: (item) => [item.name, item.type, item.broker, item.notes],
    renderMeta: (item) =>
      `${item.type || "Investimento"} • ${item.broker || "Sem corretora"}`,
    renderValue: (item) =>
      currency(item.currentValue || item.amountInvested || 0),
  },
];

export function renderSearch() {
  const query = String(state.ui.query || "")
    .trim()
    .toLowerCase();
  const groups = SEARCH_GROUPS.map((group) => ({
    ...group,
    items: group
      .getItems()
      .filter((item) => includesAny(group.matcher(item), query))
      .slice(0, 6),
  })).filter((group) => group.items.length);

  const total = groups.reduce((acc, group) => acc + group.items.length, 0);

  return `
    ${pageHeader("Busca global", "Pesquise em contas, transações, cartões, projetos, metas e investimentos.")}

    <section class="module-stack">
      <article class="card p-5 md:p-6">
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div class="eyebrow">Busca ativa</div>
            <div class="section-title mt-2">${query ? `Resultados para “${escapeHtml(query)}”` : "Digite para encontrar qualquer dado do app"}</div>
            <p class="text-slate-500 mt-2">${query ? `${total} resultado(s) agrupados por entidade.` : "A barra do topo agora abre automaticamente esta tela enquanto você digita."}</p>
          </div>
          ${query ? `<button id="clear-search-btn" class="action-btn">Limpar busca</button>` : ""}
        </div>
      </article>

      ${query ? (groups.length ? groups.map(renderGroup).join("") : `<article class="card p-10 text-center text-slate-500">Nenhum resultado encontrado para essa busca.</article>`) : `<article class="card p-10 text-center text-slate-500">Comece digitando na busca global do topo. Você verá resultados agrupados, com atalhos para abrir o módulo certo.</article>`}
    </section>`;
}

export function bindSearchEvents() {
  document.getElementById("clear-search-btn")?.addEventListener("click", () => {
    const input = document.getElementById("global-search-input");
    if (input) input.value = "";
    state.ui.query = "";
    navigate("dashboard");
  });

  document.querySelectorAll("[data-search-route]").forEach((button) => {
    button.addEventListener("click", () => {
      navigate(button.dataset.searchRoute);
    });
  });
}

function renderGroup(group) {
  return `
    <article class="card p-5 md:p-6">
      <div class="section-head section-head-spaced">
        <div>
          <div class="text-sm text-slate-500">${group.items.length} resultado(s)</div>
          <div class="section-title">${group.title}</div>
        </div>
        <button data-search-route="${group.route}" class="action-btn">Abrir módulo</button>
      </div>
      <div class="grid gap-3">
        ${group.items
          .map(
            (item) => `
          <button data-search-route="${group.route}" class="text-left rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-4 hover:bg-white hover:shadow-sm transition">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <div class="font-semibold">${escapeHtml(item.name || item.description || group.emptyLabel)}</div>
                <div class="text-sm text-slate-500 mt-1">${escapeHtml(group.renderMeta?.(item) || item.id)}</div>
              </div>
              ${group.renderValue ? `<div class="font-bold text-slate-900">${escapeHtml(group.renderValue(item))}</div>` : ""}
            </div>
          </button>`,
          )
          .join("")}
      </div>
    </article>`;
}

function includesAny(fields, query) {
  if (!query) return false;
  return fields.some((field) =>
    String(field || "")
      .toLowerCase()
      .includes(query),
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
