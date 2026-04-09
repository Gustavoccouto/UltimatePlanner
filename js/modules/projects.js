import { state, loadState, patchUi } from "../state.js";
import {
  pageHeader,
  toast,
  openModal,
  closeModal,
  confirmDialog,
} from "../ui.js";
import { createId } from "../utils/ids.js";
import { nowIso, formatDateInput } from "../utils/dates.js";
import { putOne, getOne, getAll } from "../services/storage.js";
import { enqueueSync } from "../services/sync.js";
import { currency, percent, datePt } from "../utils/formatters.js";
import { getCurrentUser } from "./onboarding.js";

const PROJECT_TABS = ["checklist", "analytics", "financas"];
const STATUS_FILTERS = ["tudo", "pendentes", "concluidos"];
const DEFAULT_PROJECT_THEME = "aurora";
const PROJECT_THEMES = {
  aurora: {
    label: "Aurora",
    coverUrl:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80",
    accent: "99,102,241",
    accentAlt: "168,85,247",
  },
  viagem: {
    label: "Viagem",
    coverUrl:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80",
    accent: "14,165,233",
    accentAlt: "45,212,191",
  },
  setup: {
    label: "Setup",
    coverUrl:
      "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=80",
    accent: "79,70,229",
    accentAlt: "124,58,237",
  },
  casa: {
    label: "Casa",
    coverUrl:
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
    accent: "249,115,22",
    accentAlt: "234,88,12",
  },
  carro: {
    label: "Carro",
    coverUrl:
      "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80",
    accent: "239,68,68",
    accentAlt: "234,179,8",
  },
  estudo: {
    label: "Estudo",
    coverUrl:
      "https://images.unsplash.com/photo-1491841550275-ad7854e35ca6?auto=format&fit=crop&w=1200&q=80",
    accent: "16,185,129",
    accentAlt: "59,130,246",
  },
  evento: {
    label: "Evento",
    coverUrl:
      "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=80",
    accent: "236,72,153",
    accentAlt: "168,85,247",
  },
  negocio: {
    label: "Negócio",
    coverUrl:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80",
    accent: "15,23,42",
    accentAlt: "37,99,235",
  },
};

function guessProjectThemeKey(sourceText = "") {
  const text = String(sourceText || "").toLowerCase();
  if (!text) return DEFAULT_PROJECT_THEME;
  if (/(viagem|trip|f[eé]rias|ferias|praia|hotel|passagem|turismo)/.test(text)) return "viagem";
  if (/(setup|pc|computador|monitor|gamer|escritorio|escrit[oó]rio|notebook)/.test(text)) return "setup";
  if (/(carro|moto|ve[ií]culo|oficina|garagem|autom[oó]vel)/.test(text)) return "carro";
  if (/(casa|apartamento|reforma|m[oó]vel|decora[cç][aã]o|cozinha|quarto)/.test(text)) return "casa";
  if (/(estudo|curso|faculdade|livro|certifica[cç][aã]o|aula|p[oó]s)/.test(text)) return "estudo";
  if (/(casamento|festa|evento|anivers[aá]rio|ch[aá] de|formatura)/.test(text)) return "evento";
  if (/(neg[oó]cio|empresa|loja|cliente|side project|startup|trabalho)/.test(text)) return "negocio";
  return DEFAULT_PROJECT_THEME;
}

function normalizeProjectThemeKey(themeKey, fallbackText = "") {
  const normalized = String(themeKey || "").trim().toLowerCase();
  if (PROJECT_THEMES[normalized]) return normalized;
  return guessProjectThemeKey(fallbackText);
}

function resolveProjectTheme(project = {}) {
  const key = normalizeProjectThemeKey(
    project.themeKey,
    `${project.name || ""} ${project.notes || ""} ${project.desc || ""}`,
  );
  return {
    key,
    ...PROJECT_THEMES[key],
  };
}

function renderProjectThemeOptions(selectedKey = DEFAULT_PROJECT_THEME) {
  return Object.entries(PROJECT_THEMES)
    .map(
      ([key, theme]) =>
        `<option value="${key}" ${selectedKey === key ? "selected" : ""}>${theme.label}</option>`,
    )
    .join("");
}

function projectThemeStyle(theme) {
  return `style="--project-theme-image:url('${theme.coverUrl}');--project-accent-rgb:${theme.accent};--project-accent-rgb-alt:${theme.accentAlt};"`;
}

function getProjects() {
  return state.data.projects.filter((item) => !item.isDeleted);
}

function getSelectedProject() {
  const projects = getProjects();
  const selectedId = state.ui.selectedProjectId;
  return projects.find((item) => item.id === selectedId) || projects[0] || null;
}

function getProjectParticipants(projectId) {
  return state.data.projectParticipants.filter(
    (item) => !item.isDeleted && item.projectId === projectId,
  );
}

function getAllProjectEntries(projectId) {
  return state.data.projectItems.filter(
    (item) => !item.isDeleted && item.projectId === projectId,
  );
}

function isContribution(entry) {
  return (
    entry.entryKind === "contribution" ||
    (!!entry.amount && !!entry.contributorName)
  );
}

function isPlannedItem(entry) {
  return (
    entry.entryKind === "item" ||
    typeof entry.value !== "undefined" ||
    (!entry.amount && !entry.contributorName)
  );
}

function getProjectPlanItems(projectId) {
  return getAllProjectEntries(projectId).filter(isPlannedItem);
}

function getProjectContributions(projectId) {
  return getAllProjectEntries(projectId).filter(isContribution);
}

function getProjectSummary(projectId) {
  const items = getProjectPlanItems(projectId);
  const contributions = getProjectContributions(projectId);
  const totalEstimated = items.reduce(
    (sum, item) => sum + Number(item.value || 0),
    0,
  );
  const totalDone = items
    .filter((item) => item.done)
    .reduce((sum, item) => sum + Number(item.value || 0), 0);
  const cashBalance = contributions.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  const progress =
    totalEstimated > 0 ? Math.min((totalDone / totalEstimated) * 100, 100) : 0;
  return {
    items,
    contributions,
    totalEstimated,
    totalDone,
    cashBalance,
    progress,
    pendingCount: items.filter((item) => !item.done).length,
    completedCount: items.filter((item) => item.done).length,
  };
}

function getContributorOptions(projectId) {
  const currentUser = getCurrentUser();
  const participants = getProjectParticipants(projectId);
  const base = currentUser
    ? [
        {
          id: currentUser.id,
          label: `${currentUser.name} (você)`,
          type: "user",
        },
      ]
    : [];
  const extras = participants.map((item) => ({
    id: item.id,
    label: item.name,
    type: "participant",
  }));
  return [...base, ...extras];
}

function getCategoryOptions(projectId) {
  const categories = [
    ...new Set(
      getProjectPlanItems(projectId)
        .map((item) => String(item.category || "").trim())
        .filter(Boolean),
    ),
  ];
  return ["Tudo", ...categories];
}

function getVisibleProjectItems(projectId) {
  const selectedCategory = state.ui.projectFilterCategory || "Tudo";
  const selectedStatus = state.ui.projectFilterStatus || "tudo";
  return getProjectPlanItems(projectId).filter((item) => {
    const matchesCategory =
      selectedCategory === "Tudo" ||
      (item.category || "").trim() === selectedCategory;
    const matchesStatus =
      selectedStatus === "tudo" ||
      (selectedStatus === "pendentes" ? !item.done : !!item.done);
    return matchesCategory && matchesStatus;
  });
}

function projectGridCard(project) {
  const summary = getProjectSummary(project.id);
  const theme = resolveProjectTheme(project);
  return `
    <button
      type="button"
      class="card project-summary-card project-theme-card text-left"
      data-project-open="${project.id}"
      ${projectThemeStyle(theme)}
    >
      <div class="project-summary-media">
        <div class="project-summary-media-top">
          <span class="project-summary-theme-pill">${theme.label}</span>
          <span class="project-summary-media-icon">${project.icon || "✨"}</span>
        </div>
      </div>

      <div class="project-summary-body">
        <div class="project-summary-title-row">
          <div>
            <div class="eyebrow">Projeto</div>
            <div class="project-summary-title">${project.name}</div>
            <div class="project-summary-subtitle">${project.notes || project.desc || "Planejamento organizado por itens."}</div>
          </div>
          <i class="fa-solid fa-arrow-up-right-from-square text-slate-300"></i>
        </div>

        <div class="project-summary-metrics">
          <div><span>Total estimado</span><strong>${currency(summary.totalEstimated)}</strong></div>
          <div><span>Em caixa</span><strong>${currency(summary.cashBalance)}</strong></div>
          <div><span>Progresso</span><strong>${percent(summary.progress)}</strong></div>
        </div>
      </div>
    </button>`;
}

function renderProjectList() {
  const projects = getProjects();
  return `
    ${pageHeader("Projetos", "Projetos agora são separados de metas: aqui você monta itens planejados, soma o custo total e acompanha os aportes no caixa do projeto.", '<button id="new-project-btn" class="action-btn action-btn-primary"><i class="fa-solid fa-plus mr-2"></i>Novo projeto</button>')}

    <section class="card p-5 mb-6 card-glass project-create-card">
      <form id="project-form" class="grid lg:grid-cols-[1.1fr_1fr_.55fr_.8fr_auto] gap-3 items-end">
        <div>
          <label class="text-sm font-semibold block mb-2">Nome do projeto</label>
          <input name="name" class="field" placeholder="Ex.: Viagem, setup, carro" />
        </div>
        <div>
          <label class="text-sm font-semibold block mb-2">Descrição</label>
          <input name="notes" class="field" placeholder="Resumo rápido do objetivo" />
        </div>
        <div>
          <label class="text-sm font-semibold block mb-2">Ícone</label>
          <input name="icon" class="field" placeholder="✨" maxlength="2" />
        </div>
        <div>
          <label class="text-sm font-semibold block mb-2">Tema visual</label>
          <select name="themeKey" class="select">${renderProjectThemeOptions(DEFAULT_PROJECT_THEME)}</select>
        </div>
        <button class="action-btn action-btn-primary">Criar</button>
      </form>
      <div class="project-theme-helper mt-3">
        As imagens são aplicadas automaticamente de acordo com o tema escolhido.
      </div>
    </section>

    <section class="project-list-grid">
      ${
        projects.length
          ? projects.map(projectGridCard).join("")
          : `<div class="card p-8 text-center"><div class="text-lg font-bold">Nenhum projeto criado</div><p class="text-slate-500 mt-2">Crie o primeiro projeto e depois adicione itens, participantes e aportes em caixa.</p></div>`
      }
    </section>`;
}

function renderProjectHeader(project, summary) {
  const theme = resolveProjectTheme(project);
  return `
    <section class="project-detail-shell">
      <article class="card project-hero-card" ${projectThemeStyle(theme)}>
        <div class="project-hero-content">
          <div class="project-detail-topbar">
            <button type="button" class="project-back-btn" id="project-back-btn"><i class="fa-solid fa-arrow-left"></i></button>
            <div class="project-hero-chip-row">
              <span class="project-summary-theme-pill">${theme.label}</span>
              <span class="project-summary-theme-pill project-summary-theme-pill-soft">${project.icon || "✨"}</span>
            </div>
          </div>

          <div class="project-hero-main">
            <div class="project-detail-heading">
              <h1 class="page-title !mb-0">${project.name}</h1>
              <p class="page-subtitle project-hero-subtitle">${project.notes || project.desc || "Projeto personalizado no UltimatePlanner."}</p>
            </div>
            <div class="project-detail-actions">
              <button id="edit-project-btn" class="action-btn"><i class="fa-solid fa-pen mr-2"></i>Editar</button>
              <button id="delete-project-btn" class="action-btn action-btn-danger-soft"><i class="fa-solid fa-trash mr-2"></i>Excluir</button>
              <button id="new-project-btn" class="action-btn action-btn-primary"><i class="fa-solid fa-plus mr-2"></i>Novo projeto</button>
            </div>
          </div>
        </div>
      </article>

      <div class="project-tab-strip">
        ${PROJECT_TABS.map((tab) => {
          const active = (state.ui.projectTab || "checklist") === tab;
          const label =
            tab === "checklist"
              ? "Checklist"
              : tab === "analytics"
                ? "Analytics"
                : "Finanças";
          return `<button type="button" class="project-tab-btn ${active ? "project-tab-btn-active" : ""}" data-project-tab="${tab}">${label}</button>`;
        }).join("")}
      </div>

      <div class="project-kpi-grid">
        <article class="card project-kpi-card"><div class="eyebrow">Total estimado</div><div class="project-kpi-value">${currency(summary.totalEstimated)}</div></article>
        <article class="card project-kpi-card project-kpi-card-accent"><div class="eyebrow">Saldo em caixa</div><div class="project-kpi-value">${currency(summary.cashBalance)}</div></article>
        <article class="card project-kpi-card"><div class="eyebrow">Progresso geral</div><div class="project-progress-line mt-4"><span style="width:${summary.progress}%"></span></div><div class="project-kpi-progress">${percent(summary.progress)}</div></article>
      </div>
    </section>`;
}

function renderChecklistTab(project, summary) {
  const visibleItems = getVisibleProjectItems(project.id);
  const categories = getCategoryOptions(project.id);
  const categorySelected = state.ui.projectFilterCategory || "Tudo";
  const statusSelected = state.ui.projectFilterStatus || "tudo";

  return `
    <section class="project-section-head">
      <div>
        <div class="section-title project-section-title">Itens do Planejamento</div>
      </div>
      <div class="flex items-center gap-3 flex-wrap justify-end">
        <div class="project-status-switch">
          ${STATUS_FILTERS.map((status) => `<button type="button" data-project-status="${status}" class="project-inline-filter ${statusSelected === status ? "project-inline-filter-active" : ""}">${status === "tudo" ? "Tudo" : status === "pendentes" ? "Pendentes" : "Concluídos"}</button>`).join("")}
        </div>
        <button id="add-project-item-btn" class="action-btn action-btn-primary">+ Item</button>
      </div>
    </section>

    <div class="project-chip-row">
      ${categories.map((category) => `<button type="button" class="project-chip ${categorySelected === category ? "project-chip-active" : ""}" data-project-category="${category}">${category}</button>`).join("")}
    </div>

    <section class="project-items-grid">
      ${
        visibleItems.length
          ? visibleItems
              .map(
                (item) => `
        <article class="card project-item-card ${item.done ? "project-item-card-done" : ""}">
          <div class="project-item-top-row">
            <span class="project-item-badge">${item.category || "Sem categoria"}</span>
            <button type="button" class="project-check-toggle ${item.done ? "is-done" : ""}" data-project-toggle-item="${item.id}" aria-label="Marcar item"></button>
          </div>
          <div class="project-item-title">${item.name}</div>
          <div class="project-item-copy">${item.description || "Sem descrição adicional."}</div>
          <div class="project-item-footer">
            <strong>${currency(item.value || 0)}</strong>
            <div class="flex items-center gap-2"><button type="button" class="table-action" data-project-edit-item="${item.id}">Editar</button><button type="button" class="table-action table-action-danger" data-project-delete-item="${item.id}">Excluir</button></div>
          </div>
        </article>`,
              )
              .join("")
          : `<div class="card p-8 text-center text-slate-500">Nenhum item para esse filtro.</div>`
      }
    </section>`;
}

function renderAnalyticsTab(project, summary) {
  const byCategory = Object.entries(
    summary.items.reduce((acc, item) => {
      const key = item.category || "Sem categoria";
      acc[key] = (acc[key] || 0) + Number(item.value || 0);
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const contributionByPerson = Object.entries(
    summary.contributions.reduce((acc, item) => {
      const key = item.contributorName || "Sem identificação";
      acc[key] = (acc[key] || 0) + Number(item.amount || 0);
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  return `
    <section class="project-analytics-grid">
      <article class="card p-5">
        <div class="section-title !text-[1.1rem]">Distribuição por categoria</div>
        <div class="space-y-3 mt-5">
          ${byCategory.length ? byCategory.map(([name, total]) => `<div class="project-bar-row"><div class="flex items-center justify-between gap-3"><span>${name}</span><strong>${currency(total)}</strong></div><div class="project-progress-line mt-2"><span style="width:${summary.totalEstimated ? (total / summary.totalEstimated) * 100 : 0}%"></span></div></div>`).join("") : `<div class="text-slate-500">Sem itens suficientes para analytics.</div>`}
        </div>
      </article>
      <article class="card p-5">
        <div class="section-title !text-[1.1rem]">Aportes por pessoa</div>
        <div class="space-y-3 mt-5">
          ${contributionByPerson.length ? contributionByPerson.map(([name, total]) => `<div class="project-contributor-row"><span>${name}</span><strong>${currency(total)}</strong></div>`).join("") : `<div class="text-slate-500">Ainda não há aportes lançados.</div>`}
        </div>
      </article>
      <article class="card p-5">
        <div class="section-title !text-[1.1rem]">Visão rápida</div>
        <div class="grid grid-cols-2 gap-3 mt-5">
          <div class="surface-soft rounded-[24px] p-4"><div class="text-sm text-slate-500">Itens pendentes</div><div class="text-2xl font-bold mt-2">${summary.pendingCount}</div></div>
          <div class="surface-soft rounded-[24px] p-4"><div class="text-sm text-slate-500">Itens concluídos</div><div class="text-2xl font-bold mt-2">${summary.completedCount}</div></div>
          <div class="surface-soft rounded-[24px] p-4"><div class="text-sm text-slate-500">Concluído em valor</div><div class="text-2xl font-bold mt-2">${currency(summary.totalDone)}</div></div>
          <div class="surface-soft rounded-[24px] p-4"><div class="text-sm text-slate-500">Falta cobrir</div><div class="text-2xl font-bold mt-2">${currency(Math.max(summary.totalEstimated - summary.cashBalance, 0))}</div></div>
        </div>
      </article>
    </section>`;
}

function renderFinanceTab(project, summary) {
  const participants = getProjectParticipants(project.id);
  const options = getContributorOptions(project.id);
  return `
    <section class="project-section-head">
      <div>
        <div class="section-title project-section-title">Finanças do projeto</div>
      </div>
      <button id="add-project-contribution-btn" class="action-btn action-btn-primary">+ Aporte</button>
    </section>

    <section class="project-finance-grid">
      <article class="card p-5">
        <div class="flex items-center justify-between gap-3 mb-4"><div><div class="section-title !text-[1.1rem]">Participantes</div><div class="text-sm text-slate-500">Quem pode aportar nesse projeto</div></div></div>
        <form id="project-participant-form" data-project-id="${project.id}" class="flex gap-2 mb-4">
          <input name="name" class="field" placeholder="Nome da pessoa" />
          <button class="action-btn">Adicionar</button>
        </form>
        <div class="flex flex-wrap gap-2">
          ${options.length ? options.map((person) => `<div class="project-person-pill"><span>${person.label}</span></div>`).join("") : `<div class="text-slate-500">Nenhum participante.</div>`}
        </div>
      </article>

      <article class="card p-5">
        <div class="section-title !text-[1.1rem]">Histórico de aportes</div>
        <div class="overflow-auto mt-4">
          <table class="data-table">
            <thead><tr><th>Quem guardou</th><th>Descrição</th><th>Data</th><th>Valor</th></tr></thead>
            <tbody>
              ${
                summary.contributions.length
                  ? summary.contributions
                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                      .map(
                        (item) =>
                          `<tr><td>${item.contributorName || "Sem nome"}</td><td>${item.label || "Aporte"}</td><td>${datePt(item.date)}</td><td>${currency(item.amount || 0)}</td></tr>`,
                      )
                      .join("")
                  : `<tr><td colspan="4" class="text-slate-500">Nenhum aporte lançado ainda.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      </article>
    </section>`;
}

async function syncProjectAggregate(projectId) {
  const [projects, projectItems, projectParticipants] = await Promise.all([
    getAll("projects"),
    getAll("projectItems"),
    getAll("projectParticipants"),
  ]);

  const baseProject = projects.find((item) => item.id === projectId);
  if (!baseProject || baseProject.isDeleted) return null;

  const items = projectItems.filter(
    (item) =>
      !item.isDeleted && item.projectId === projectId && isPlannedItem(item),
  );
  const contributions = projectItems.filter(
    (item) =>
      !item.isDeleted && item.projectId === projectId && isContribution(item),
  );
  const participants = projectParticipants.filter(
    (item) => !item.isDeleted && item.projectId === projectId,
  );

  const totalEstimated = items.reduce(
    (sum, item) => sum + Number(item.value || 0),
    0,
  );
  const totalDone = items
    .filter((item) => item.done)
    .reduce((sum, item) => sum + Number(item.value || 0), 0);
  const cashBalance = contributions.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  const progress =
    totalEstimated > 0 ? Math.min((totalDone / totalEstimated) * 100, 100) : 0;

  const aggregatedProject = {
    ...baseProject,
    items,
    contributions,
    participants,
    totalEstimated,
    totalDone,
    cashBalance,
    progress,
    updatedAt: nowIso(),
    version: (baseProject.version || 0) + 1,
    syncStatus: "pending",
  };

  await putOne("projects", aggregatedProject);
  await enqueueSync("projects", aggregatedProject.id);
  return aggregatedProject;
}

function renderProjectDetail(project) {
  const summary = getProjectSummary(project.id);
  const tab = state.ui.projectTab || "checklist";
  const content =
    tab === "analytics"
      ? renderAnalyticsTab(project, summary)
      : tab === "financas"
        ? renderFinanceTab(project, summary)
        : renderChecklistTab(project, summary);
  return `${renderProjectHeader(project, summary)}${content}`;
}

export function renderProjects() {
  const project = getSelectedProject();
  return project && state.ui.selectedProjectId
    ? renderProjectDetail(project)
    : renderProjectList();
}

async function openProjectItemModal(projectId, itemId = null) {
  const existing = itemId ? await getOne("projectItems", itemId) : null;
  openModal(`
    <div class="flex items-center justify-between mb-6"><div><div class="text-2xl font-bold">${existing ? "Editar item do projeto" : "Novo item do projeto"}</div><div class="text-sm text-slate-500 mt-1">Itens do projeto somam o total estimado. Metas continuam sendo valores guardados.</div></div><button id="close-modal" class="action-btn">Fechar</button></div>
    <form id="project-item-form" data-project-id="${projectId}" data-item-id="${existing?.id || ""}" class="grid md:grid-cols-2 gap-4">
      <div><label class="text-sm font-semibold mb-2 block">Nome do item</label><input name="name" class="field" value="${existing?.name || ""}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Categoria</label><input name="category" class="field" value="${existing?.category || ""}" placeholder="Transporte, setup, lazer..." /></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor</label><input name="value" type="number" min="0.01" step="0.01" class="field" value="${existing?.value || ""}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Status inicial</label><select name="done" class="select"><option value="false" ${existing?.done ? "" : "selected"}>Pendente</option><option value="true" ${existing?.done ? "selected" : ""}>Concluído</option></select></div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Descrição</label><textarea name="description" class="textarea" rows="3">${existing?.description || ""}</textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-project-item" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">${existing ? "Salvar alterações" : "Salvar item"}</button></div>
    </form>`);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document
    .getElementById("cancel-project-item")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("project-item-form")
    ?.addEventListener("submit", saveProjectItem);
}

async function openProjectEditModal(projectId) {
  const existing = await getOne("projects", projectId);
  if (!existing) return;
  const theme = resolveProjectTheme(existing);

  openModal(`
    <div class="premium-modal-head">
      <div>
        <div class="premium-modal-kicker">Projetos</div>
        <div class="premium-modal-title">Editar projeto</div>
        <div class="premium-modal-subtitle">Atualize o nome, descrição, ícone e tema visual do projeto.</div>
      </div>
      <button id="close-modal" class="action-btn">Fechar</button>
    </div>

    <form id="project-edit-form" data-project-id="${existing.id}" class="grid md:grid-cols-2 gap-4">
      <div><label class="text-sm font-semibold mb-2 block">Nome do projeto</label><input name="name" class="field" value="${existing.name || ""}" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Ícone</label><input name="icon" class="field" maxlength="2" value="${existing.icon || "✨"}" /></div>
      <div><label class="text-sm font-semibold mb-2 block">Tema visual</label><select name="themeKey" class="select">${renderProjectThemeOptions(theme.key)}</select></div>
      <div class="project-theme-helper md:flex md:items-end">A capa é aplicada automaticamente conforme o tema selecionado.</div>
      <div class="md:col-span-2"><label class="text-sm font-semibold mb-2 block">Descrição</label><textarea name="notes" class="textarea" rows="3">${existing.notes || existing.desc || ""}</textarea></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-project-edit" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">Salvar projeto</button></div>
    </form>`);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document
    .getElementById("cancel-project-edit")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("project-edit-form")
    ?.addEventListener("submit", saveProjectEdit);
}

function openContributionModal(projectId) {
  const options = getContributorOptions(projectId);
  openModal(`
    <div class="flex items-center justify-between mb-6"><div><div class="text-2xl font-bold">Novo aporte no projeto</div><div class="text-sm text-slate-500 mt-1">Selecione quem guardou o valor para esse projeto.</div></div><button id="close-modal" class="action-btn">Fechar</button></div>
    <form id="project-contribution-form" data-project-id="${projectId}" class="grid md:grid-cols-2 gap-4">
      <div><label class="text-sm font-semibold mb-2 block">Quem guardou</label><select name="contributorKey" class="select">${options.map((item) => `<option value="${item.type}:${item.id}">${item.label}</option>`).join("")}</select></div>
      <div><label class="text-sm font-semibold mb-2 block">Valor</label><input name="amount" type="number" step="0.01" min="0.01" class="field" required /></div>
      <div><label class="text-sm font-semibold mb-2 block">Descrição</label><input name="label" class="field" placeholder="Ex.: aporte semanal" /></div>
      <div><label class="text-sm font-semibold mb-2 block">Data</label><input name="date" type="date" class="field" value="${formatDateInput()}" required /></div>
      <div class="md:col-span-2 flex justify-end gap-3 pt-2"><button type="button" id="cancel-project-contribution" class="action-btn">Cancelar</button><button class="action-btn action-btn-primary" type="submit">Salvar aporte</button></div>
    </form>`);

  document.getElementById("close-modal")?.addEventListener("click", closeModal);
  document
    .getElementById("cancel-project-contribution")
    ?.addEventListener("click", closeModal);
  document
    .getElementById("project-contribution-form")
    ?.addEventListener("submit", saveProjectContribution);
}

async function saveProjectItem(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const projectId = event.currentTarget.dataset.projectId;
  const itemId = event.currentTarget.dataset.itemId || null;
  const existing = itemId ? await getOne("projectItems", itemId) : null;
  const item = {
    ...existing,
    id: existing?.id || createId("project_item"),
    projectId,
    entryKind: "item",
    name: String(form.get("name") || "").trim(),
    category: String(form.get("category") || "").trim(),
    description: String(form.get("description") || "").trim(),
    value: Number(form.get("value") || 0),
    done: String(form.get("done")) === "true",
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
    syncStatus: "pending",
    isDeleted: false,
    version: (existing?.version || 0) + 1,
  };
  if (!item.name) return toast("Informe o nome do item.", "error");
  if (!(item.value > 0))
    return toast("Informe um valor válido para o item.", "error");
  await putOne("projectItems", item);
  await enqueueSync("projectItems", item.id);
  await syncProjectAggregate(projectId);
  await loadState();
  closeModal();
  toast(
    existing ? "Item do projeto atualizado." : "Item do projeto salvo.",
    "success",
  );
}

async function saveProjectContribution(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const projectId = event.currentTarget.dataset.projectId;
  const contributorKey = String(form.get("contributorKey") || "");
  const amount = Number(form.get("amount") || 0);
  const date = String(form.get("date") || "");
  if (!contributorKey) return toast("Selecione quem guardou o valor.", "error");
  if (!(amount > 0)) return toast("Informe um valor válido.", "error");
  const [contributorType, contributorId] = contributorKey.split(":");
  const currentUser = getCurrentUser();
  const participant = state.data.projectParticipants.find(
    (item) => item.id === contributorId,
  );
  const contributorName =
    contributorType === "user"
      ? currentUser?.name || "Usuário"
      : participant?.name || "Participante";
  const record = {
    id: createId("project_entry"),
    projectId,
    entryKind: "contribution",
    contributorType,
    contributorId,
    contributorName,
    amount,
    label: String(form.get("label") || "").trim(),
    date,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    syncStatus: "pending",
    isDeleted: false,
    version: 1,
  };
  await putOne("projectItems", record);
  await enqueueSync("projectItems", record.id);
  await syncProjectAggregate(projectId);
  await loadState();
  closeModal();
  toast(`Aporte registrado para ${contributorName}.`, "success");
}

async function saveProject(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const currentUser = getCurrentUser();
  const name = String(form.get("name") || "").trim();
  const notes = String(form.get("notes") || "").trim();
  const themeKey = normalizeProjectThemeKey(
    form.get("themeKey"),
    `${name} ${notes}`,
  );

  const project = {
    id: createId("project"),
    name,
    notes,
    icon: String(form.get("icon") || "").trim() || "✨",
    themeKey,
    coverImageUrl: PROJECT_THEMES[themeKey].coverUrl,
    ownerUserId: currentUser?.id || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    syncStatus: "pending",
    isDeleted: false,
    version: 1,
  };

  if (!project.name) return toast("Informe um nome para o projeto.", "error");
  await putOne("projects", project);
  await syncProjectAggregate(project.id);
  await loadState();
  patchUi({
    selectedProjectId: project.id,
    projectTab: "checklist",
    projectFilterCategory: "Tudo",
    projectFilterStatus: "tudo",
  });
  event.currentTarget.reset();
  toast("Projeto criado.", "success");
}

async function saveProjectEdit(event) {
  event.preventDefault();
  const projectId = event.currentTarget.dataset.projectId;
  const existing = await getOne("projects", projectId);
  if (!existing) return;
  const form = new FormData(event.currentTarget);
  const name = String(form.get("name") || "").trim();
  const notes = String(form.get("notes") || "").trim();
  const themeKey = normalizeProjectThemeKey(
    form.get("themeKey"),
    `${name} ${notes}`,
  );
  const updated = {
    ...existing,
    name,
    notes,
    icon: String(form.get("icon") || "").trim() || "✨",
    themeKey,
    coverImageUrl: PROJECT_THEMES[themeKey].coverUrl,
    updatedAt: nowIso(),
    syncStatus: "pending",
    version: (existing.version || 0) + 1,
  };
  if (!updated.name) return toast("Informe um nome para o projeto.", "error");
  await putOne("projects", updated);
  await syncProjectAggregate(projectId);
  await loadState();
  closeModal();
  toast("Projeto atualizado.", "success");
}

function deleteProject(projectId) {
  confirmDialog({
    title: "Excluir projeto",
    message:
      "O projeto será marcado como excluído. Os itens e participantes também serão removidos da visão atual.",
    confirmText: "Excluir projeto",
    tone: "danger",
    onConfirm: async () => {
      const [project, items, participants] = await Promise.all([
        getOne("projects", projectId),
        getAll("projectItems"),
        getAll("projectParticipants"),
      ]);
      if (!project) return;

      const projectUpdated = {
        ...project,
        isDeleted: true,
        updatedAt: nowIso(),
        syncStatus: "pending",
        version: (project.version || 0) + 1,
      };
      await putOne("projects", projectUpdated);
      await enqueueSync("projects", projectUpdated.id);

      const relatedItems = items.filter(
        (item) => item.projectId === projectId && !item.isDeleted,
      );
      for (const item of relatedItems) {
        const updatedItem = {
          ...item,
          isDeleted: true,
          updatedAt: nowIso(),
          syncStatus: "pending",
          version: (item.version || 0) + 1,
        };
        await putOne("projectItems", updatedItem);
        await enqueueSync("projectItems", updatedItem.id);
      }

      const relatedParticipants = participants.filter(
        (item) => item.projectId === projectId && !item.isDeleted,
      );
      for (const participant of relatedParticipants) {
        const updatedParticipant = {
          ...participant,
          isDeleted: true,
          updatedAt: nowIso(),
          syncStatus: "pending",
          version: (participant.version || 0) + 1,
        };
        await putOne("projectParticipants", updatedParticipant);
        await enqueueSync("projectParticipants", updatedParticipant.id);
      }

      await loadState();
      patchUi({
        selectedProjectId: null,
        projectTab: "checklist",
        projectFilterCategory: "Tudo",
        projectFilterStatus: "tudo",
      });
      toast("Projeto excluído.", "success");
    },
  });
}

async function saveParticipant(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const projectId = event.currentTarget.dataset.projectId;
  const name = String(form.get("name") || "").trim();
  if (!name) return toast("Informe o nome do participante.", "error");
  const exists = state.data.projectParticipants.some(
    (item) =>
      !item.isDeleted &&
      item.projectId === projectId &&
      item.name.toLowerCase() === name.toLowerCase(),
  );
  if (exists)
    return toast("Esse participante já existe nesse projeto.", "error");
  const participant = {
    id: createId("participant"),
    projectId,
    name,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    syncStatus: "pending",
    isDeleted: false,
    version: 1,
  };
  await putOne("projectParticipants", participant);
  await enqueueSync("projectParticipants", participant.id);
  await syncProjectAggregate(projectId);
  await loadState();
  toast("Participante adicionado.", "success");
  event.currentTarget.reset();
}

async function toggleProjectItem(itemId) {
  const existing = await getOne("projectItems", itemId);
  if (!existing) return;
  const updated = {
    ...existing,
    done: !existing.done,
    updatedAt: nowIso(),
    version: (existing.version || 0) + 1,
    syncStatus: "pending",
  };
  await putOne("projectItems", updated);
  await enqueueSync("projectItems", updated.id);
  await syncProjectAggregate(updated.projectId);
  await loadState();
}

function deleteProjectItem(itemId) {
  confirmDialog({
    title: "Excluir item do projeto",
    message:
      "Esse item será removido do planejamento e da soma total do projeto.",
    confirmText: "Excluir item",
    tone: "danger",
    onConfirm: async () => {
      const existing = await getOne("projectItems", itemId);
      if (!existing) return;
      const updated = {
        ...existing,
        isDeleted: true,
        updatedAt: nowIso(),
        version: (existing.version || 0) + 1,
        syncStatus: "pending",
      };
      await putOne("projectItems", updated);
      await enqueueSync("projectItems", updated.id);
      await syncProjectAggregate(updated.projectId);
      await loadState();
      toast("Item removido.", "success");
    },
  });
}

export function bindProjectsEvents() {
  document
    .getElementById("project-form")
    ?.addEventListener("submit", saveProject);
  document.getElementById("new-project-btn")?.addEventListener("click", () => {
    if (state.ui.selectedProjectId) {
      patchUi({
        selectedProjectId: null,
        projectTab: "checklist",
        projectFilterCategory: "Tudo",
        projectFilterStatus: "tudo",
      });
      return;
    }
    document
      .getElementById("project-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  document
    .getElementById("project-back-btn")
    ?.addEventListener("click", () =>
      patchUi({
        selectedProjectId: null,
        projectTab: "checklist",
        projectFilterCategory: "Tudo",
        projectFilterStatus: "tudo",
      }),
    );
  document
    .getElementById("add-project-item-btn")
    ?.addEventListener("click", () =>
      openProjectItemModal(getSelectedProject()?.id),
    );
  document
    .getElementById("edit-project-btn")
    ?.addEventListener("click", () =>
      openProjectEditModal(getSelectedProject()?.id),
    );
  document
    .getElementById("delete-project-btn")
    ?.addEventListener("click", () => deleteProject(getSelectedProject()?.id));
  document
    .getElementById("add-project-contribution-btn")
    ?.addEventListener("click", () =>
      openContributionModal(getSelectedProject()?.id),
    );
  document
    .getElementById("project-participant-form")
    ?.addEventListener("submit", saveParticipant);

  document
    .querySelectorAll("[data-project-open]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        patchUi({
          selectedProjectId: button.dataset.projectOpen,
          projectTab: "checklist",
          projectFilterCategory: "Tudo",
          projectFilterStatus: "tudo",
        }),
      ),
    );
  document
    .querySelectorAll("[data-project-tab]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        patchUi({ projectTab: button.dataset.projectTab }),
      ),
    );
  document
    .querySelectorAll("[data-project-category]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        patchUi({ projectFilterCategory: button.dataset.projectCategory }),
      ),
    );
  document
    .querySelectorAll("[data-project-status]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        patchUi({ projectFilterStatus: button.dataset.projectStatus }),
      ),
    );
  document
    .querySelectorAll("[data-project-toggle-item]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        toggleProjectItem(button.dataset.projectToggleItem),
      ),
    );
  document
    .querySelectorAll("[data-project-edit-item]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        openProjectItemModal(
          getSelectedProject()?.id,
          button.dataset.projectEditItem,
        ),
      ),
    );
  document
    .querySelectorAll("[data-project-delete-item]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        deleteProjectItem(button.dataset.projectDeleteItem),
      ),
    );
}
