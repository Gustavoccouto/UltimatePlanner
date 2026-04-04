import { pageHeader } from '../ui.js';
import { state, getDerivedAccounts } from '../state.js';
import { currency, percent } from '../utils/formatters.js';
import { monthlyFlow, getTransactionsForMonth } from '../utils/calculations.js';
import { monthLabel } from '../utils/dates.js';

let reportChartOne = null;
let reportChartTwo = null;

export function renderReports() {
  const activeTransactions = getTransactionsForMonth(state.data.transactions, state.ui.selectedMonth, state.data.creditCards);
  const accounts = getDerivedAccounts();
  const categoryTotals = aggregate(activeTransactions.filter((item) => ['expense', 'card_expense'].includes(item.type)), 'category');
  const accountTotals = activeTransactions
    .filter((item) => item.accountId)
    .reduce((acc, item) => {
      const account = accounts.find((accItem) => accItem.id === item.accountId);
      const key = account?.name || 'Sem conta';
      acc[key] = (acc[key] || 0) + Number(item.amount || 0);
      return acc;
    }, {});
  const projectCosts = activeTransactions
    .filter((item) => item.projectId && !item.isDeleted)
    .reduce((acc, item) => {
      acc[item.projectId] = (acc[item.projectId] || 0) + Number(item.amount || 0);
      return acc;
    }, {});
  const topProjectRows = Object.entries(projectCosts)
    .map(([projectId, total]) => ({
      name: state.data.projects.find((project) => project.id === projectId)?.name || 'Projeto removido',
      total
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const topCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const income = activeTransactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expense = activeTransactions.filter((item) => ['expense', 'card_expense'].includes(item.type)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const savingsRate = income ? ((income - expense) / income) * 100 : 0;

  return `
    ${pageHeader('Relatórios', 'Leitura analítica das finanças com foco em categorias, bancos, fluxo e projetos.')}

    <section class="module-stack">
      <div class="grid md:grid-cols-3 gap-4">
        ${metricCard(`Receitas em ${monthLabel(state.ui.selectedMonth)}`, currency(income), 'fa-arrow-trend-up')}
        ${metricCard(`Despesas em ${monthLabel(state.ui.selectedMonth)}`, currency(expense), 'fa-arrow-trend-down')}
        ${metricCard('Taxa de economia', percent(savingsRate), 'fa-piggy-bank')}
      </div>

      <div class="grid xl:grid-cols-[1.2fr_.8fr] gap-6">
        <article class="card p-6">
          <div class="section-head section-head-spaced"><div><div class="text-sm text-slate-500">Fluxo mensal</div><div class="section-title">Comparação até ${monthLabel(state.ui.selectedMonth)}</div></div><span class="badge badge-muted">Receitas x despesas</span></div>
          <div class="chart-box chart-box-fixed"><canvas id="reportFlowChart"></canvas></div>
        </article>
        <article class="card p-6">
          <div class="section-head section-head-spaced"><div><div class="text-sm text-slate-500">Categorias</div><div class="section-title">Gasto por categoria</div></div><span class="badge badge-muted">${monthLabel(state.ui.selectedMonth)}</span></div>
          <div class="chart-box chart-box-fixed"><canvas id="reportCategoryChart"></canvas></div>
        </article>
      </div>

      <div class="grid xl:grid-cols-[1fr_1fr] gap-6">
        <article class="card p-6 overflow-hidden">
          <div class="section-head section-head-spaced"><div><div class="text-sm text-slate-500">Bancos e contas</div><div class="section-title">Movimento por conta</div></div></div>
          ${Object.keys(accountTotals).length ? `<div class="overflow-auto"><table class="data-table"><thead><tr><th>Conta</th><th>Total movimentado</th></tr></thead><tbody>${Object.entries(accountTotals).sort((a,b)=>b[1]-a[1]).map(([name,total])=>`<tr><td class="font-semibold">${name}</td><td>${currency(total)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="text-slate-500">Ainda não há movimentações suficientes para ${monthLabel(state.ui.selectedMonth)}.</div>`}
        </article>
        <article class="card p-6 overflow-hidden">
          <div class="section-head section-head-spaced"><div><div class="text-sm text-slate-500">Projetos</div><div class="section-title">Custos por projeto</div></div></div>
          ${topProjectRows.length ? `<div class="overflow-auto"><table class="data-table"><thead><tr><th>Projeto</th><th>Custo</th></tr></thead><tbody>${topProjectRows.map((row)=>`<tr><td class="font-semibold">${row.name}</td><td>${currency(row.total)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="text-slate-500">Nenhum custo de projeto identificado em ${monthLabel(state.ui.selectedMonth)}.</div>`}
        </article>
      </div>

      <article class="card p-6 overflow-hidden">
        <div class="section-head section-head-spaced"><div><div class="text-sm text-slate-500">Leitura rápida</div><div class="section-title">Top categorias de saída</div></div></div>
        ${topCategories.length ? `<div class="grid md:grid-cols-2 xl:grid-cols-5 gap-3">${topCategories.map(([name, total]) => `<div class="rounded-[24px] border border-slate-100 bg-slate-50/80 px-4 py-5"><div class="text-sm text-slate-500">${name || 'Sem categoria'}</div><div class="text-2xl font-bold mt-2">${currency(total)}</div></div>`).join('')}</div>` : `<div class="text-slate-500">Sem categorias suficientes para leitura analítica em ${monthLabel(state.ui.selectedMonth)}.</div>`}
      </article>
    </section>`;
}

export function mountReportCharts() {
  const flowCanvas = document.getElementById('reportFlowChart');
  const categoryCanvas = document.getElementById('reportCategoryChart');
  if (typeof Chart === 'undefined' || !flowCanvas || !categoryCanvas) return;

  if (reportChartOne) reportChartOne.destroy();
  if (reportChartTwo) reportChartTwo.destroy();

  const flowPoints = monthlyFlow(state.data.transactions, state.ui.selectedMonth, state.data.creditCards).slice(-8);
  const expenseByCategory = aggregate(getTransactionsForMonth(state.data.transactions, state.ui.selectedMonth, state.data.creditCards).filter((item) => ['expense', 'card_expense'].includes(item.type)), 'category');
  const topCategories = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);

  reportChartOne = new Chart(flowCanvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: flowPoints.map((item) => item.month),
      datasets: [
        { label: 'Receitas', data: flowPoints.map((item) => item.income), tension: .35, borderWidth: 3, pointRadius: 3, borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,.14)', fill: true },
        { label: 'Despesas', data: flowPoints.map((item) => item.expense), tension: .35, borderWidth: 3, pointRadius: 3, borderColor: '#fb7185', backgroundColor: 'rgba(251,113,133,.14)', fill: true }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b' } },
        y: { beginAtZero: true, ticks: { color: '#64748b' }, grid: { color: 'rgba(148,163,184,.12)' } }
      }
    }
  });

  reportChartTwo = new Chart(categoryCanvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: topCategories.map(([name]) => name || 'Sem categoria'),
      datasets: [{ data: topCategories.map(([, total]) => total), backgroundColor: ['#10b981', '#38bdf8', '#818cf8', '#fb7185', '#f59e0b'], borderWidth: 0, hoverOffset: 6 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      cutout: '68%',
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } }
    }
  });
}

function metricCard(label, value, icon) {
  return `<article class="card p-5"><div class="compact-stat-icon"><i class="fa-solid ${icon}"></i></div><div class="compact-stat-label mt-4">${label}</div><div class="compact-stat-value">${value}</div></article>`;
}

function aggregate(items, key) {
  return items.reduce((acc, item) => {
    const bucket = item[key] || 'Sem categoria';
    acc[bucket] = (acc[bucket] || 0) + Number(item.amount || 0);
    return acc;
  }, {});
}
