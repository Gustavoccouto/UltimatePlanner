"use client";

import { useMemo, useState } from "react";
import type { FinancialSnapshotInput } from "@/lib/domain/financial-insights";
import { buildDashboardReferenceSummary } from "@/lib/domain/financial-insights";
import { labelTransactionType } from "@/lib/domain/account-balances";
import { currencyBRL, datePt, monthInput, monthLabel, percent, todayInput } from "@/lib/domain/formatters";

type DashboardClientProps = {
  snapshot: FinancialSnapshotInput;
};

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return todayInput();
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <article className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {helper ? <p className="muted-line">{helper}</p> : null}
    </article>
  );
}

function SplitPanel({ label, value, helper, tone }: { label: string; value: string; helper: string; tone: "income" | "expense" }) {
  return (
    <article className={`flow-split-panel ${tone === "income" ? "flow-income" : "flow-expense"}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}

export function DashboardClient({ snapshot }: DashboardClientProps) {
  const [month, setMonth] = useState(monthInput());
  const [referenceDate, setReferenceDate] = useState(todayInput());

  const summary = useMemo(() => buildDashboardReferenceSummary(snapshot, month, referenceDate), [snapshot, month, referenceDate]);
  const expenseRatio = summary.income > 0 ? (summary.expenses / summary.income) * 100 : 0;
  const positiveNet = summary.net >= 0;

  function useMonthEnd() {
    setReferenceDate(monthEnd(month));
  }

  function useToday() {
    const today = todayInput();
    setReferenceDate(today);
    setMonth(today.slice(0, 7));
  }

  return (
    <div className="grid dashboard-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-caption">Visão consolidada das contas, faturas, parcelas, metas, projetos e investimentos.</p>
        </div>
        <div className="dashboard-reference-controls">
          <label className="inline-field">
            Mês
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <label className="inline-field">
            Analisar até
            <input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} />
          </label>
          <button className="btn btn-muted" type="button" onClick={useMonthEnd}>Fechamento do mês</button>
          <button className="btn btn-primary" type="button" onClick={useToday}>Hoje</button>
        </div>
      </header>

      {summary.warnings.length ? (
        <section className="dashboard-warning-panel">
          <strong>Atenção ao caixa</strong>
          <div>
            {summary.warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        </section>
      ) : null}

      <section className="stats-grid dashboard-stats-grid">
        <StatCard label="Saldo em contas" value={currencyBRL(summary.totalAccountBalance)} helper="Saldo derivado pelas transações até a data de referência." />
        <StatCard label="Resultado de caixa" value={currencyBRL(summary.cashNet)} helper={positiveNet ? "Entradas maiores que saídas de caixa até agora." : "Saídas de caixa maiores que entradas até agora."} />
        <StatCard label="Faturas abertas" value={currencyBRL(summary.openCardInvoices)} helper="Valor em aberto por fatura, já descontando pagamentos parciais." />
        <StatCard label="Saldo projetado" value={currencyBRL(summary.projectedMonthEndBalance)} helper="Contas atuais + entradas planejadas - saídas planejadas." />
      </section>

      <section className="dashboard-flow-grid">
        <div className="panel dashboard-flow-panel">
          <div className="section-heading">
            <div>
              <h2>Fluxo de {monthLabel(month)}</h2>
              <p>Base diária em {datePt(referenceDate)}.</p>
            </div>
            <span className="badge">{positiveNet ? "Superávit" : "Déficit"}</span>
          </div>
          <div className="flow-split-grid">
            <SplitPanel label="Receitas" value={currencyBRL(summary.income)} helper="Tudo que entrou até a data escolhida." tone="income" />
            <SplitPanel label="Saídas de caixa" value={currencyBRL(summary.cashOut)} helper="Despesas pagas e pagamentos de fatura, sem duplicar compras no cartão." tone="expense" />
          </div>
          <div className="flow-vertical-track" aria-label="Uso das receitas por despesas">
            <span style={{ width: `${clampPercent(expenseRatio)}%` }} />
          </div>
          <p className="muted-line">As saídas de caixa representam {percent(expenseRatio)} das receitas registradas até a data de referência. Compras no cartão aparecem abaixo por competência da fatura.</p>
        </div>

        <div className="panel dashboard-breakdown-panel">
          <div className="section-heading">
            <div>
              <h2>Projeções e compromissos</h2>
              <p>Valores que precisam de atenção antes de comprar ou assumir novas despesas.</p>
            </div>
          </div>
          <div className="mini-card-grid">
            <div className="mini-card"><span>Entradas planejadas</span><strong>{currencyBRL(summary.plannedIncoming)}</strong></div>
            <div className="mini-card"><span>Saídas planejadas</span><strong>{currencyBRL(summary.plannedOutgoing)}</strong></div>
            <div className="mini-card"><span>Cartão por competência</span><strong>{currencyBRL(summary.cardExpenses)}</strong></div>
            <div className="mini-card"><span>Faturas pagas</span><strong>{currencyBRL(summary.invoicePayments)}</strong></div>
          </div>
        </div>
      </section>

      <section className="stats-grid dashboard-goals-grid">
        <StatCard label="Metas em andamento" value={percent(summary.goalsProgressAverage)} helper={`Faltam ${currencyBRL(summary.goalsMissingAmount)} para concluir.`} />
        <StatCard label="Caixa em projetos" value={currencyBRL(summary.projectsCash)} helper={`Faltam ${currencyBRL(summary.projectsMissingAmount)} para os projetos.`} />
        <StatCard label="Investimentos" value={currencyBRL(summary.investmentsCurrentValue)} helper={`Caixa em corretoras: ${currencyBRL(summary.investmentsCash)}.`} />
      </section>

      <section className="dashboard-lists-grid">
        <div className="panel">
          <div className="section-heading">
            <div>
              <h2>Contas em destaque</h2>
              <p>Saldos derivados até {datePt(referenceDate)}.</p>
            </div>
          </div>
          <div className="dashboard-mini-list">
            {summary.accounts.length ? summary.accounts.slice(0, 5).map((account) => (
              <div className="dashboard-mini-row" key={account.id}>
                <div><strong>{account.name}</strong><span>{account.institution || "Conta"}</span></div>
                <b className={Number(account.derived_balance) < 0 ? "danger-text" : "positive-text"}>{currencyBRL(account.derived_balance)}</b>
              </div>
            )) : <p className="empty-state">Nenhuma conta ativa cadastrada.</p>}
          </div>
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <h2>Próximas parcelas</h2>
              <p>Parcelas pendentes e antecipáveis.</p>
            </div>
          </div>
          <div className="dashboard-mini-list">
            {summary.upcomingInstallments.length ? summary.upcomingInstallments.map((installment) => (
              <div className="dashboard-mini-row" key={installment.id}>
                <div><strong>{installment.description}</strong><span>{installment.installment_number}/{installment.installments_count} • {datePt(installment.due_date)}</span></div>
                <b>{currencyBRL(installment.amount)}</b>
              </div>
            )) : <p className="empty-state">Nenhuma parcela pendente encontrada.</p>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Movimentações recentes</h2>
            <p>Últimos registros da competência selecionada.</p>
          </div>
        </div>
        {summary.recentTransactions.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Valor</th></tr></thead>
              <tbody>
                {summary.recentTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{datePt(transaction.date)}</td>
                    <td>{transaction.description}</td>
                    <td>{labelTransactionType(transaction.type)}</td>
                    <td>{currencyBRL(transaction.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">Nenhuma movimentação encontrada para o mês e data selecionados.</div>}
      </section>
    </div>
  );
}
