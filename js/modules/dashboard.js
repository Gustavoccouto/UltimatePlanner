import { state, patchUi, setSelectedMonth } from "../state.js";
import {
  monthlyFlow,
  getCardsById,
  getTransactionCompetenceMonth,
} from "../utils/calculations.js";
import {
  monthLabel,
  formatDateInput,
  toMonthKey,
  compareDateInputs,
  parseDateInput,
} from "../utils/dates.js";
import { currency, percent, datePt } from "../utils/formatters.js";

let flowChartInstance = null;

export function renderDashboard() {
  const referenceDate = getDashboardReferenceDate();
  const summary = buildDashboardReferenceSummary(referenceDate);
  const topAccounts = [...summary.accounts]
    .sort((a, b) => b.derivedBalance - a.derivedBalance)
    .slice(0, 3);

  return `
    <section class="mb-8">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle max-w-none whitespace-nowrap overflow-hidden text-ellipsis">Visão geral premium das finanças, metas e operações pendentes. Base diária em ${datePt(referenceDate)}.</p>
      </div>
      <div class="mt-4 flex items-center gap-3 flex-wrap">
        <label class="text-sm font-semibold text-slate-600">Analisar até</label>
        <input id="dashboard-reference-date" type="date" class="field min-w-[180px]" value="${referenceDate}" />
        <button id="dashboard-reference-month-end" class="action-btn">Fechamento do mês</button>
        <button id="dashboard-reference-today" class="action-btn">Hoje</button>
      </div>
    </section>

    <section class="module-stack">
      <div class="grid gap-5 xl:grid-cols-[1.7fr_1.05fr]">
        <article class="card p-5 md:p-6 overflow-hidden">
          <div class="grid gap-6 lg:grid-cols-[1.3fr_.7fr] items-start">
            <div>
              <div class="compact-stat-label">Saldo principal</div>
              <div class="text-sm text-slate-500 mt-8">Saldo total derivado</div>
              <div class="text-[clamp(2.2rem,6vw,4.2rem)] leading-[0.92] font-black tracking-[-0.05em] text-slate-950 mt-2 break-words">${currency(summary.balanceTotal)}</div>
              <div class="text-sm text-slate-500 mt-5 max-w-[42ch]">Baseado nas transações registradas, compras parceladas, recorrências e transferências consistentes entre contas.</div>
            </div>
            <div class="grid gap-3 md:gap-4">
              ${summaryMetricBlock("Receitas", currency(summary.income))}
              ${summaryMetricBlock("Despesas", currency(summary.expense))}
              ${summaryMetricBlock("Economia líquida", currency(summary.net))}
            </div>
          </div>
        </article>

        <div class="grid gap-4 sm:grid-cols-2">
          <article class="card compact-stat-card min-h-[150px]">
            ${compactStatCard("Faturas abertas", currency(summary.openInvoices), "fa-credit-card")}
          </article>
          <article class="card compact-stat-card min-h-[150px]">
            ${compactStatCard("Metas em andamento", percent(summary.goalsProgress), "fa-bullseye")}
          </article>
          <article class="card compact-stat-card min-h-[150px]">
            ${compactStatCard("Investimentos", currency(summary.invested), "fa-chart-pie")}
          </article>
          <article class="card compact-stat-card min-h-[150px]">
            ${compactStatCard("Contas monitoradas", String(summary.accounts.length), "fa-building-columns")}
          </article>
        </div>
      </div>

      <div class="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
        <section class="card p-5 md:p-6 overflow-hidden h-full flex flex-col">
          <div class="section-head section-head-spaced items-start gap-4">
            <div>
              <div class="text-sm text-slate-500">Fluxo mensal</div>
              <div class="section-title">Entradas vs saídas</div>
            </div>
            <span class="badge badge-muted">Base ${monthLabel(state.ui.selectedMonth)}</span>
          </div>

          <div class="mt-5 flex-1 rounded-[30px] overflow-hidden border border-slate-200 bg-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,.8)]">
            <div class="grid h-full min-h-[300px] md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/70">
              ${flowSplitHalf("Receitas", currency(summary.income), "Tudo que entrou até a data de referência.", "income")}
              ${flowSplitHalf("Despesas", currency(summary.expense), "Tudo que saiu até a data de referência.", "expense")}
            </div>
            <div class="px-5 py-3 border-t border-white/70 bg-white/70 flex items-center justify-between gap-3 flex-wrap">
              <span class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Resumo diário</span>
              <span class="text-sm text-slate-500">Comparativo visual em bloco 50/50 para leitura rápida do mês.</span>
            </div>
          </div>
        </section>

        <section class="card p-5 md:p-6 overflow-hidden">
          <div class="section-head section-head-spaced items-start gap-4">
            <div>
              <div class="text-sm text-slate-500">Resumo operacional</div>
              <div class="section-title">Movimentações recentes</div>
            </div>
          </div>
          <div class="grid gap-6 lg:grid-cols-2 mt-5">
            <div>
              <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-3">Últimas receitas</div>
              ${summary.recentIncomes.length ? summary.recentIncomes.map((item) => recordLine(item, "income")).join("") : emptyInline("Sem receitas registradas até esta data.")}
            </div>
            <div>
              <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-3">Últimas despesas</div>
              ${summary.recentExpenses.length ? summary.recentExpenses.map((item) => recordLine(item, "expense")).join("") : emptyInline("Sem despesas registradas até esta data.")}
            </div>
          </div>
        </section>
      </div>

      ${topAccounts.length
        ? `
        <section class="card p-5 md:p-6 overflow-hidden">
          <div class="section-head section-head-spaced items-start gap-4">
            <div>
              <div class="text-sm text-slate-500">Contas em destaque</div>
              <div class="section-title">Saldos monitorados</div>
            </div>
            <span class="badge badge-muted">${datePt(referenceDate)}</span>
          </div>
          <div class="grid gap-4 md:grid-cols-3 mt-5">
            ${topAccounts
              .map(
                (account) => `
                  <article class="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,.45)]">
                    <div class="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">${account.bankName || "Conta"}</div>
                    <div class="text-lg font-extrabold text-slate-950 mt-2">${account.name}</div>
                    <div class="text-2xl font-black tracking-[-0.04em] text-slate-950 mt-4">${currency(account.derivedBalance)}</div>
                  </article>`,
              )
              .join("")}
          </div>
        </section>`
        : ""}
    </section>
  `;
}

export function bindDashboardEvents() {
  document
    .getElementById("dashboard-reference-date")
    ?.addEventListener("change", (event) => {
      const nextDate = event.target.value;
      if (!nextDate) return;
      patchUi({ dashboardReferenceDate: nextDate });
      const nextMonth = toMonthKey(nextDate);
      if (nextMonth && nextMonth !== state.ui.selectedMonth) {
        setSelectedMonth(nextMonth);
      }
    });

  document
    .getElementById("dashboard-reference-month-end")
    ?.addEventListener("click", () => {
      patchUi({ dashboardReferenceDate: getMonthEndDateInput(state.ui.selectedMonth) });
    });

  document
    .getElementById("dashboard-reference-today")
    ?.addEventListener("click", () => {
      const today = formatDateInput();
      patchUi({ dashboardReferenceDate: today });
      const currentMonth = toMonthKey(today);
      if (currentMonth && currentMonth !== state.ui.selectedMonth) {
        setSelectedMonth(currentMonth);
      }
    });
}

export function mountDashboardCharts() {
  if (flowChartInstance) {
    flowChartInstance.destroy();
    flowChartInstance = null;
  }
}

function buildDashboardReferenceSummary(referenceDate) {
  const selectedMonth = state.ui.selectedMonth;
  const cardsById = getCardsById(state.data.creditCards);
  const monthTransactions = state.data.transactions
    .filter(
      (transaction) =>
        !transaction.isDeleted &&
        getTransactionCompetenceMonth(transaction, cardsById) === selectedMonth &&
        compareDateInputs(transaction.date, referenceDate) <= 0,
    )
    .sort((a, b) => compareDateInputs(b.date, a.date));

  const accounts = state.data.accounts
    .filter((account) => !account.isDeleted)
    .map((account) => ({
      ...account,
      derivedBalance: deriveBalanceForAccountAtDate(account.id, referenceDate),
    }));

  const income = sumTransactionsByType(monthTransactions, ["income"]);
  const expense = sumTransactionsByType(monthTransactions, ["expense", "card_expense"]);
  const openInvoices = sumTransactions(
    monthTransactions.filter(
      (transaction) => transaction.type === "card_expense" && !transaction.isPaid,
    ),
  );
  const invested = state.data.investments
    .filter((investment) => !investment.isDeleted)
    .reduce(
      (sum, investment) =>
        sum + Number(investment.currentValue || investment.amountInvested || 0),
      0,
    );
  const goals = state.data.goals.filter((goal) => !goal.isDeleted);
  const goalsProgress = goals.length
    ? goals.reduce(
        (acc, goal) =>
          acc + ((Number(goal.currentAmount || 0) / Number(goal.targetAmount || 1)) * 100),
        0,
      ) / goals.length
    : 0;

  return {
    referenceDate,
    accounts,
    balanceTotal: accounts.reduce(
      (sum, account) => sum + Number(account.derivedBalance || 0),
      0,
    ),
    income,
    expense,
    net: income - expense,
    openInvoices,
    goalsProgress,
    invested,
    recentExpenses: monthTransactions
      .filter((transaction) => ["expense", "card_expense"].includes(transaction.type))
      .slice(0, 5),
    recentIncomes: monthTransactions
      .filter((transaction) => transaction.type === "income")
      .slice(0, 5),
  };
}

function deriveBalanceForAccountAtDate(accountId, referenceDate) {
  return state.data.transactions
    .filter(
      (transaction) =>
        !transaction.isDeleted && compareDateInputs(transaction.date, referenceDate) <= 0,
    )
    .reduce((sum, transaction) => {
      const amount = Number(transaction.amount || 0);
      if (transaction.type === "income" && transaction.accountId === accountId) {
        return sum + amount;
      }
      if (transaction.type === "expense" && transaction.accountId === accountId) {
        return sum - amount;
      }
      if (transaction.type === "adjustment" && transaction.accountId === accountId) {
        return sum + amount;
      }
      if (transaction.type === "transfer") {
        if (transaction.accountId === accountId) return sum - amount;
        if (transaction.destinationAccountId === accountId) return sum + amount;
      }
      return sum;
    }, 0);
}

function buildDashboardFlowPoints(referenceDate) {
  const selectedMonth = state.ui.selectedMonth;
  const cardsById = getCardsById(state.data.creditCards);
  const points = monthlyFlow(
    state.data.transactions,
    selectedMonth,
    state.data.creditCards,
  ).map((point) => ({
    ...point,
    monthLabel: monthLabel(point.month),
  }));

  const currentMonthPoint = points.find((point) => point.month === selectedMonth);
  if (!currentMonthPoint) return points;

  const scopedMonthTransactions = state.data.transactions.filter(
    (transaction) =>
      !transaction.isDeleted &&
      getTransactionCompetenceMonth(transaction, cardsById) === selectedMonth &&
      compareDateInputs(transaction.date, referenceDate) <= 0,
  );

  currentMonthPoint.income = sumTransactionsByType(scopedMonthTransactions, ["income"]);
  currentMonthPoint.expense = sumTransactionsByType(scopedMonthTransactions, ["expense", "card_expense"]);
  return points;
}

function getDashboardReferenceDate() {
  const selectedMonth = state.ui.selectedMonth || toMonthKey(new Date());
  const referenceDate = state.ui.dashboardReferenceDate;
  if (referenceDate && toMonthKey(referenceDate) === selectedMonth) {
    return referenceDate;
  }
  return getMonthEndDateInput(selectedMonth);
}

function getMonthEndDateInput(monthKey) {
  const parsed = parseDateInput(`${monthKey}-01`);
  if (!parsed) return formatDateInput();
  return formatDateInput(
    new Date(parsed.getFullYear(), parsed.getMonth() + 1, 0, 12, 0, 0, 0),
  );
}

function sumTransactions(items = []) {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

function sumTransactionsByType(items = [], types = []) {
  return sumTransactions(items.filter((item) => types.includes(item.type)));
}

function compactStatCard(label, value, icon) {
  return `
    <div class="compact-stat-icon"><i class="fa-solid ${icon}"></i></div>
    <div>
      <div class="compact-stat-label">${label}</div>
      <div class="compact-stat-value">${value}</div>
    </div>`;
}

function summaryMetricBlock(label, value) {
  return `
    <div class="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_18px_45px_-34px_rgba(15,23,42,.35)]">
      <div class="text-sm text-slate-500">${label}</div>
      <div class="text-[1.9rem] leading-none font-black tracking-[-0.04em] text-slate-950 mt-3">${value}</div>
    </div>`;
}

function flowSplitHalf(label, value, helper, tone) {
  const toneClass = tone === "income"
    ? {
        panel: "bg-[linear-gradient(135deg,rgba(239,246,255,.95),rgba(224,242,254,.88))]",
        label: "text-sky-700",
        value: "text-sky-700",
        accent: "bg-sky-500/15 text-sky-700 border-sky-200",
      }
    : {
        panel: "bg-[linear-gradient(135deg,rgba(253,242,248,.95),rgba(252,231,243,.9))]",
        label: "text-pink-700",
        value: "text-pink-700",
        accent: "bg-pink-500/15 text-pink-700 border-pink-200",
      };

  return `
    <div class="relative min-h-[210px] p-6 md:p-7 ${toneClass.panel}">
      <div class="inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${toneClass.accent}">${label}</div>
      <div class="mt-8 text-sm font-medium text-slate-500">Valor acumulado</div>
      <div class="mt-2 text-[clamp(2rem,4.3vw,3rem)] leading-none font-black tracking-[-0.05em] ${toneClass.value}">${value}</div>
      <div class="mt-6 text-sm text-slate-500 max-w-[26ch]">${helper}</div>
    </div>`;
}

function recordLine(item, tone) {
  const valueClass = tone === "income" ? "text-emerald-600" : "text-rose-600";
  return `
    <div class="py-3 border-b border-slate-100 last:border-b-0">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="font-semibold text-slate-950">${item.description}</div>
          <div class="text-sm text-slate-500">${item.category || "Sem categoria"} • ${datePt(item.date)}</div>
        </div>
        <div class="font-black ${valueClass}">${currency(item.amount)}</div>
      </div>
    </div>`;
}

function emptyInline(text) {
  return `
    <div class="empty-state-inline">${text}</div>`;
}
