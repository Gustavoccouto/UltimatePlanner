import { state, getDerivedAccounts } from "../state.js";
import { dashboardSummary, monthlyFlow } from "../utils/calculations.js";
import { monthLabel } from "../utils/dates.js";
import { currency, percent, datePt } from "../utils/formatters.js";
import { pageHeader } from "../ui.js";

let flowChartInstance = null;

export function renderDashboard() {
  const accounts = getDerivedAccounts();
  const summary = dashboardSummary({
    accounts,
    transactions: state.data.transactions,
    goals: state.data.goals,
    creditCards: state.data.creditCards,
    investments: state.data.investments,
    installmentPlans: state.data.installmentPlans,
    selectedMonth: state.ui.selectedMonth,
  });

  const topAccounts = [...accounts]
    .sort((a, b) => b.derivedBalance - a.derivedBalance)
    .slice(0, 4);

  return `
    ${pageHeader("Dashboard", "Visão geral premium das finanças, metas e operações pendentes.")}

    <section class="dashboard-shell dashboard-shell-balanced">
      <div class="dashboard-main-stack">
        <article class="dashboard-hero card summary-card card-glass">
          <div class="eyebrow">Saldo principal</div>
          <div class="dashboard-hero-grid dashboard-hero-grid-safe">
            <div class="dashboard-hero-main">
              <div class="text-sm text-slate-500">Saldo total derivado</div>
              <div class="dashboard-hero-value">${currency(summary.balanceTotal)}</div>
              <p class="dashboard-hero-copy">Baseado nas transações registradas, compras parceladas e transferências consistentes entre contas.</p>
            </div>
            <div class="dashboard-hero-side dashboard-hero-side-compact">
              <div class="hero-mini-card"><span>Receitas</span><strong>${currency(summary.income)}</strong></div>
              <div class="hero-mini-card"><span>Despesas</span><strong>${currency(summary.expense)}</strong></div>
              <div class="hero-mini-card"><span>Economia líquida</span><strong>${currency(summary.net)}</strong></div>
            </div>
          </div>
        </article>

        <article class="card p-6 chart-panel">
          <div class="section-head">
            <div>
              <div class="text-sm text-slate-500">Fluxo mensal</div>
              <div class="section-title">Entradas vs saídas</div>
            </div>
            <span class="badge badge-muted">Base ${monthLabel(state.ui.selectedMonth)}</span>
          </div>
          <div class="chart-box chart-box-fixed"><canvas id="flowChart"></canvas></div>
        </article>
      </div>

      <div class="dashboard-aux-stack">
        <div class="dashboard-side-grid dashboard-side-grid-tall">
          ${compactStatCard("Faturas abertas", currency(summary.openInvoices), "fa-credit-card")}
          ${compactStatCard("Metas em andamento", percent(summary.goalsProgress), "fa-bullseye")}
          ${compactStatCard("Investimentos", currency(summary.invested), "fa-chart-pie")}
          ${compactStatCard("Contas monitoradas", String(accounts.length), "fa-building-columns")}
        </div>

        <article class="card p-6 list-panel">
          <div class="section-head">
            <div>
              <div class="text-sm text-slate-500">Resumo operacional</div>
              <div class="section-title">Movimentações recentes</div>
            </div>
          </div>
          <div class="split-list split-list-mobile-safe">
            <div>
              <div class="list-caption">Últimas receitas</div>
              ${summary.recentIncomes.length ? summary.recentIncomes.map((item) => recordLine(item, "income")).join("") : emptyInline("Sem receitas registradas.")}
            </div>
            <div>
              <div class="list-caption">Últimas despesas</div>
              ${summary.recentExpenses.length ? summary.recentExpenses.map((item) => recordLine(item, "expense")).join("") : emptyInline("Sem despesas registradas.")}
            </div>
          </div>
        </article>
      </div>
    </section>

    <section class="card p-6 section-stack">
      <div class="section-head section-head-spaced">
        <div>
          <div class="text-sm text-slate-500">Contas em destaque</div>
          <div class="section-title">Distribuição por conta</div>
        </div>
      </div>
      <div class="account-grid">
        ${
          topAccounts
            .map(
              (account) => `
          <article class="account-balance-card card-glass">
            <div class="text-sm text-slate-500">${account.bankName}</div>
            <div class="text-xl font-bold mt-1">${account.name}</div>
            <div class="text-3xl font-extrabold tracking-tight mt-5">${currency(account.derivedBalance)}</div>
            <div class="text-sm text-slate-500 mt-3">Atualizado com base nas transações válidas</div>
          </article>`,
            )
            .join("") ||
          `<div class="text-slate-500">Cadastre contas para visualizar o saldo por banco.</div>`
        }
      </div>
    </section>`;
}

export function mountDashboardCharts() {
  const canvas = document.getElementById("flowChart");
  if (!canvas || typeof Chart === "undefined") return;

  if (flowChartInstance) {
    flowChartInstance.destroy();
    flowChartInstance = null;
  }

  const points = monthlyFlow(
    state.data.transactions,
    state.ui.selectedMonth,
    state.data.creditCards,
  ).slice(-6);
  if (!points.length) return;

  const ctx = canvas.getContext("2d");
  flowChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: points.map((item) => item.month),
      datasets: [
        {
          label: "Receitas",
          data: points.map((item) => item.income),
          borderRadius: 14,
          maxBarThickness: 34,
          backgroundColor: "rgba(125, 211, 252, .85)",
        },
        {
          label: "Despesas",
          data: points.map((item) => item.expense),
          borderRadius: 14,
          maxBarThickness: 34,
          backgroundColor: "rgba(244, 114, 182, .55)",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      resizeDelay: 200,
      plugins: {
        legend: {
          position: "bottom",
          labels: { usePointStyle: true, boxWidth: 8 },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#64748b" } },
        y: {
          beginAtZero: true,
          ticks: { color: "#64748b" },
          grid: { color: "rgba(148,163,184,.12)" },
        },
      },
    },
  });
}

function compactStatCard(label, value, icon) {
  return `
    <article class="card compact-stat-card">
      <div class="compact-stat-icon"><i class="fa-solid ${icon}"></i></div>
      <div class="compact-stat-label">${label}</div>
      <div class="compact-stat-value">${value}</div>
    </article>`;
}

function recordLine(item, tone) {
  return `
    <div class="record-line">
      <div>
        <div class="font-semibold">${item.description}</div>
        <div class="text-sm text-slate-500">${item.category || "Sem categoria"} • ${datePt(item.date)}</div>
      </div>
      <div class="font-bold ${tone === "income" ? "text-emerald-600" : "text-rose-600"}">${currency(item.amount)}</div>
    </div>`;
}

function emptyInline(text) {
  return `<div class="text-sm text-slate-500 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">${text}</div>`;
}
