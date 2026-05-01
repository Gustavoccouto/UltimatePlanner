"use client";

import { CSSProperties, FormEvent, useMemo, useState } from "react";
import type { ActivityLog, Investment, InvestmentAccount, InvestmentTransaction } from "@/lib/domain/app-types";
import {
  assetTypeLabel,
  investmentCost,
  investmentCurrentValue,
  investmentProfitability,
  investmentResult,
  investmentTransactionLabel,
  portfolioSummary,
  toNumber
} from "@/lib/domain/investments";
import { currencyBRL, datePt } from "@/lib/domain/formatters";
import { ColorPickerField } from "@/components/ui/color-picker-field";

type AllocationTarget = {
  id: string;
  owner_id: string;
  target_scope: "asset_type" | "asset";
  target_key: string;
  label: string;
  target_percent: number | string;
  is_deleted?: boolean;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

type InvestmentsPayload = {
  accounts: InvestmentAccount[];
  investments: Investment[];
  transactions: InvestmentTransaction[];
  allocationTargets?: AllocationTarget[];
  activityLogs: ActivityLog[];
};

type BrokerForm = {
  id?: string;
  name: string;
  institution: string;
  type: string;
  cash_balance: string;
  color: string;
  notes: string;
};

type AssetForm = {
  id?: string;
  investment_account_id: string;
  name: string;
  ticker: string;
  asset_type: string;
  quantity: string;
  average_price: string;
  current_price: string;
  purchase_date: string;
  notes: string;
};

type MovementForm = {
  id?: string;
  type: string;
  investment_account_id: string;
  investment_id: string;
  amount: string;
  quantity: string;
  unit_price: string;
  fees: string;
  date: string;
  notes: string;
};

type TargetForm = {
  id?: string;
  target_scope: "asset_type" | "asset";
  target_key: string;
  label: string;
  target_percent: string;
  notes: string;
};

type ModalMode = "broker" | "asset" | "movement" | "target" | null;

const emptyBrokerForm: BrokerForm = {
  name: "",
  institution: "",
  type: "brokerage",
  cash_balance: "0",
  color: "",
  notes: ""
};

const emptyAssetForm: AssetForm = {
  investment_account_id: "",
  name: "",
  ticker: "",
  asset_type: "stock",
  quantity: "0",
  average_price: "0",
  current_price: "0",
  purchase_date: new Date().toISOString().slice(0, 10),
  notes: ""
};

const emptyMovementForm: MovementForm = {
  type: "buy",
  investment_account_id: "",
  investment_id: "",
  amount: "0",
  quantity: "0",
  unit_price: "0",
  fees: "0",
  date: new Date().toISOString().slice(0, 10),
  notes: ""
};

const emptyTargetForm: TargetForm = {
  target_scope: "asset_type",
  target_key: "stock",
  label: "Ações",
  target_percent: "0",
  notes: ""
};

const assetTypes = [
  ["stock", "Ações"],
  ["etf", "ETFs"],
  ["fii", "FIIs"],
  ["fixed_income", "Renda fixa"],
  ["crypto", "Cripto"],
  ["fund", "Fundos"],
  ["savings", "Poupança"],
  ["other", "Outros"]
] as const;

const movementTypes = [
  ["deposit", "Aporte em corretora"],
  ["withdraw", "Retirada da corretora"],
  ["buy", "Compra de ativo"],
  ["sell", "Venda de ativo"],
  ["dividend", "Dividendo/provento"],
  ["yield", "Rendimento"],
  ["fee", "Taxa/custo"],
  ["adjust", "Ajuste manual"]
] as const;

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Erro inesperado.");
  return payload as T;
}

function metadataNote(record: { metadata?: Record<string, unknown> | null; notes?: string | null }) {
  if (typeof record.notes === "string") return record.notes;
  const metadata = record.metadata || {};
  return typeof metadata.notes === "string" ? metadata.notes : "";
}

function accentStyle(color?: string | null): CSSProperties | undefined {
  return color ? ({ "--item-accent": color } as CSSProperties) : undefined;
}

function formatPercent(value: number | string | null | undefined) {
  const normalized = toNumber(value);
  return `${normalized.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function brokerName(accounts: InvestmentAccount[], accountId?: string | null) {
  if (!accountId) return "Sem corretora";
  return accounts.find((account) => account.id === accountId)?.name || "Corretora não encontrada";
}

function investmentName(investments: Investment[], id?: string | null) {
  if (!id) return "Caixa da corretora";
  const investment = investments.find((item) => item.id === id);
  return investment ? `${investment.ticker || investment.name} • ${investment.name}` : "Ativo não encontrado";
}

function distributionByType(investments: Investment[]) {
  const grouped = new Map<string, number>();
  investments.filter((investment) => !investment.is_deleted).forEach((investment) => {
    const key = investment.asset_type || "other";
    grouped.set(key, (grouped.get(key) || 0) + investmentCurrentValue(investment));
  });
  return Array.from(grouped.entries())
    .map(([key, value]) => ({ key, label: assetTypeLabel(key), value }))
    .sort((a, b) => b.value - a.value);
}

function distributionByBroker(accounts: InvestmentAccount[], investments: Investment[]) {
  return accounts.filter((account) => !account.is_deleted).map((account) => {
    const assetsValue = investments
      .filter((investment) => !investment.is_deleted && investment.investment_account_id === account.id)
      .reduce((sum, investment) => sum + investmentCurrentValue(investment), 0);
    return {
      key: account.id,
      label: account.name,
      value: assetsValue + toNumber(account.cash_balance)
    };
  }).sort((a, b) => b.value - a.value);
}

function currentAllocationPercent(target: AllocationTarget, investments: Investment[], totalCurrentValue: number) {
  if (totalCurrentValue <= 0) return 0;
  const value = investments.filter((investment) => !investment.is_deleted).reduce((sum, investment) => {
    if (target.target_scope === "asset") {
      const key = investment.ticker || investment.name;
      return key === target.target_key ? sum + investmentCurrentValue(investment) : sum;
    }
    return investment.asset_type === target.target_key ? sum + investmentCurrentValue(investment) : sum;
  }, 0);
  return (value / totalCurrentValue) * 100;
}

export function InvestmentsClient({ initialData }: { initialData: InvestmentsPayload }) {
  const [accounts, setAccounts] = useState<InvestmentAccount[]>(initialData.accounts || []);
  const [investments, setInvestments] = useState<Investment[]>(initialData.investments || []);
  const [transactions, setTransactions] = useState<InvestmentTransaction[]>(initialData.transactions || []);
  const [allocationTargets, setAllocationTargets] = useState<AllocationTarget[]>(initialData.allocationTargets || []);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>(initialData.activityLogs || []);
  const [activeTab, setActiveTab] = useState<"overview" | "positions" | "movements" | "allocation">("overview");
  const [brokerFilter, setBrokerFilter] = useState("all");
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [brokerForm, setBrokerForm] = useState<BrokerForm>(emptyBrokerForm);
  const [assetForm, setAssetForm] = useState<AssetForm>(emptyAssetForm);
  const [movementForm, setMovementForm] = useState<MovementForm>(emptyMovementForm);
  const [targetForm, setTargetForm] = useState<TargetForm>(emptyTargetForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const filteredInvestments = useMemo(() => {
    return investments.filter((investment) => !investment.is_deleted && (brokerFilter === "all" || investment.investment_account_id === brokerFilter));
  }, [investments, brokerFilter]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => !transaction.is_deleted && (brokerFilter === "all" || transaction.investment_account_id === brokerFilter));
  }, [transactions, brokerFilter]);

  const summary = useMemo(() => portfolioSummary(investments, accounts, transactions), [investments, accounts, transactions]);
  const byType = useMemo(() => distributionByType(filteredInvestments), [filteredInvestments]);
  const byBroker = useMemo(() => distributionByBroker(accounts, investments), [accounts, investments]);

  async function reload() {
    const payload = await requestJson<InvestmentsPayload>("/api/investments");
    setAccounts(payload.accounts || []);
    setInvestments(payload.investments || []);
    setTransactions(payload.transactions || []);
    setAllocationTargets(payload.allocationTargets || []);
    setActivityLogs(payload.activityLogs || []);
  }

  function closeModal() {
    setModalMode(null);
    setError("");
  }

  function openBroker(account?: InvestmentAccount) {
    setMessage("");
    setError("");
    setBrokerForm(account ? {
      id: account.id,
      name: account.name,
      institution: account.institution || "",
      type: account.type || "brokerage",
      cash_balance: String(account.cash_balance || 0),
      color: account.color || "",
      notes: metadataNote(account)
    } : emptyBrokerForm);
    setModalMode("broker");
  }

  function openAsset(investment?: Investment) {
    setMessage("");
    setError("");
    setAssetForm(investment ? {
      id: investment.id,
      investment_account_id: investment.investment_account_id || "",
      name: investment.name,
      ticker: investment.ticker || "",
      asset_type: investment.asset_type || "other",
      quantity: String(investment.quantity || 0),
      average_price: String(investment.average_price || 0),
      current_price: String(investment.current_price || 0),
      purchase_date: investment.purchase_date || new Date().toISOString().slice(0, 10),
      notes: metadataNote(investment)
    } : { ...emptyAssetForm, investment_account_id: brokerFilter === "all" ? "" : brokerFilter });
    setModalMode("asset");
  }

  function openMovement(transaction?: InvestmentTransaction, preselectedInvestmentId?: string) {
    setMessage("");
    setError("");
    if (transaction) {
      setMovementForm({
        id: transaction.id,
        type: transaction.type,
        investment_account_id: transaction.investment_account_id || "",
        investment_id: transaction.investment_id || "",
        amount: String(transaction.amount || 0),
        quantity: String(transaction.quantity || 0),
        unit_price: String(transaction.unit_price || 0),
        fees: String(transaction.fees || 0),
        date: transaction.date,
        notes: transaction.notes || metadataNote(transaction)
      });
    } else {
      const selectedInvestment = investments.find((investment) => investment.id === preselectedInvestmentId);
      setMovementForm({
        ...emptyMovementForm,
        investment_id: preselectedInvestmentId || "",
        investment_account_id: selectedInvestment?.investment_account_id || (brokerFilter === "all" ? "" : brokerFilter)
      });
    }
    setModalMode("movement");
  }

  function openTarget(target?: AllocationTarget) {
    setMessage("");
    setError("");
    setTargetForm(target ? {
      id: target.id,
      target_scope: target.target_scope,
      target_key: target.target_key,
      label: target.label,
      target_percent: String(target.target_percent || 0),
      notes: metadataNote(target)
    } : emptyTargetForm);
    setModalMode("target");
  }

  async function submitBroker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await requestJson("/api/investments/accounts", {
        method: brokerForm.id ? "PATCH" : "POST",
        body: JSON.stringify({ ...brokerForm, cash_balance: Number(brokerForm.cash_balance || 0) })
      });
      await reload();
      closeModal();
      setMessage(brokerForm.id ? "Corretora atualizada." : "Corretora criada.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar a corretora.");
    } finally {
      setLoading(false);
    }
  }

  async function submitAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await requestJson("/api/investments/assets", {
        method: assetForm.id ? "PATCH" : "POST",
        body: JSON.stringify({
          ...assetForm,
          investment_account_id: assetForm.investment_account_id || null,
          quantity: Number(assetForm.quantity || 0),
          average_price: Number(assetForm.average_price || 0),
          current_price: Number(assetForm.current_price || 0)
        })
      });
      await reload();
      closeModal();
      setMessage(assetForm.id ? "Posição atualizada." : "Posição criada.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar a posição.");
    } finally {
      setLoading(false);
    }
  }

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await requestJson("/api/investments/transactions", {
        method: movementForm.id ? "PATCH" : "POST",
        body: JSON.stringify({
          ...movementForm,
          investment_account_id: movementForm.investment_account_id || null,
          investment_id: movementForm.investment_id || null,
          amount: Number(movementForm.amount || 0),
          quantity: Number(movementForm.quantity || 0),
          unit_price: Number(movementForm.unit_price || 0),
          fees: Number(movementForm.fees || 0)
        })
      });
      await reload();
      closeModal();
      setMessage(movementForm.id ? "Movimentação atualizada." : "Movimentação registrada.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar a movimentação.");
    } finally {
      setLoading(false);
    }
  }

  async function submitTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await requestJson("/api/investments/allocation-targets", {
        method: targetForm.id ? "PATCH" : "POST",
        body: JSON.stringify({ ...targetForm, target_percent: Number(targetForm.target_percent || 0) })
      });
      await reload();
      closeModal();
      setMessage(targetForm.id ? "Alocação alvo atualizada." : "Alocação alvo criada.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar a alocação alvo.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteRecord(url: string, id: string, confirmText: string, successText: string) {
    if (!window.confirm(confirmText)) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await requestJson(url, { method: "DELETE", body: JSON.stringify({ id }) });
      await reload();
      setMessage(successText);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível excluir.");
    } finally {
      setLoading(false);
    }
  }

  const selectedInvestmentForTarget = investments.find((investment) => (investment.ticker || investment.name) === targetForm.target_key);

  return (
    <div className="grid investments-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Investimentos</h1>
          <p className="page-caption">Controle corretoras, posições, movimentações, caixa e alocação sem misturar investimento com despesa comum.</p>
        </div>
        <div className="actions-row">
          <button className="btn btn-muted" type="button" onClick={() => openBroker()}>Nova corretora</button>
          <button className="btn btn-muted" type="button" onClick={() => openAsset()}>Posição inicial</button>
          <button className="btn btn-primary" type="button" onClick={() => openMovement()}>Movimentação</button>
          <button className="btn btn-muted" type="button" onClick={() => openTarget()}>Alocação alvo</button>
        </div>
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <section className="stats-grid investments-stats-grid">
        <article className="stat-card"><div className="stat-label">Total investido</div><div className="stat-value">{currencyBRL(summary.totalInvested)}</div></article>
        <article className="stat-card"><div className="stat-label">Valor atual</div><div className="stat-value">{currencyBRL(summary.currentValue)}</div></article>
        <article className="stat-card"><div className="stat-label">Resultado</div><div className={`stat-value ${summary.result >= 0 ? "positive-text" : "danger-text"}`}>{currencyBRL(summary.result)}</div><p>{formatPercent(summary.profitability)}</p></article>
        <article className="stat-card"><div className="stat-label">Caixa em corretoras</div><div className="stat-value">{currencyBRL(summary.brokerageCash)}</div></article>
        <article className="stat-card"><div className="stat-label">Patrimônio total</div><div className="stat-value">{currencyBRL(summary.totalPatrimony)}</div></article>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Visão consolidada</h2>
            <p>Filtre por corretora e acompanhe posições, caixa e movimentações.</p>
          </div>
          <label className="inline-field">Corretora
            <select value={brokerFilter} onChange={(event) => setBrokerFilter(event.target.value)}>
              <option value="all">Todas</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
        </div>
        <div className="tabs-row">
          <button className={`tab-button ${activeTab === "overview" ? "active" : ""}`} type="button" onClick={() => setActiveTab("overview")}>Corretoras</button>
          <button className={`tab-button ${activeTab === "positions" ? "active" : ""}`} type="button" onClick={() => setActiveTab("positions")}>Posições</button>
          <button className={`tab-button ${activeTab === "movements" ? "active" : ""}`} type="button" onClick={() => setActiveTab("movements")}>Histórico</button>
          <button className={`tab-button ${activeTab === "allocation" ? "active" : ""}`} type="button" onClick={() => setActiveTab("allocation")}>Alocação</button>
        </div>

        {activeTab === "overview" ? (
          <div className="investments-layout">
            <div className="cards-grid broker-grid">
              {accounts.length ? accounts.map((account) => {
                const accountPositions = investments.filter((investment) => !investment.is_deleted && investment.investment_account_id === account.id);
                const assetsValue = accountPositions.reduce((sum, investment) => sum + investmentCurrentValue(investment), 0);
                const cost = accountPositions.reduce((sum, investment) => sum + investmentCost(investment), 0);
                const result = assetsValue - cost;
                const total = assetsValue + toNumber(account.cash_balance);
                return (
                  <article className="finance-card investment-broker-card accent-card" key={account.id} style={accentStyle(account.color)}>
                    <div className="finance-card-topline"><span>Corretora</span><span className="badge">{accountPositions.length} ativo(s)</span></div>
                    <h2 className="finance-card-title">{account.name}</h2>
                    <p className="finance-card-caption">{account.institution || "Instituição não informada"}</p>
                    <div className="mini-metrics-grid">
                      <div><span>Patrimônio</span><strong>{currencyBRL(assetsValue)}</strong></div>
                      <div><span>Caixa</span><strong>{currencyBRL(account.cash_balance)}</strong></div>
                      <div><span>Total</span><strong>{currencyBRL(total)}</strong></div>
                      <div><span>Resultado</span><strong className={result >= 0 ? "positive-text" : "danger-text"}>{currencyBRL(result)}</strong></div>
                    </div>
                    <p className="finance-card-caption">Principais ativos: {accountPositions.slice(0, 3).map((item) => item.ticker || item.name).join(", ") || "Sem ativos"}</p>
                    <div className="finance-card-actions">
                      <button className="btn btn-muted" type="button" onClick={() => openBroker(account)}>Editar</button>
                      <button className="btn btn-danger" type="button" disabled={loading} onClick={() => deleteRecord("/api/investments/accounts", account.id, "Excluir corretora? As posições ligadas não serão apagadas automaticamente.", "Corretora excluída.")}>Excluir</button>
                    </div>
                  </article>
                );
              }) : <div className="empty-state wide">Nenhuma corretora cadastrada. Crie uma corretora para separar seus investimentos.</div>}
            </div>
            <div className="surface-soft-card">
              <h3>Distribuição por tipo</h3>
              {byType.length ? byType.map((item) => (
                <div className="bar-row" key={item.key}>
                  <div><strong>{item.label}</strong><span>{currencyBRL(item.value)}</span></div>
                  <i><b style={{ width: `${summary.currentValue > 0 ? Math.min(100, (item.value / summary.currentValue) * 100) : 0}%` }} /></i>
                </div>
              )) : <p className="muted-text">Sem posições para calcular distribuição.</p>}
            </div>
          </div>
        ) : null}

        {activeTab === "positions" ? (
          <div className="cards-grid positions-grid">
            {filteredInvestments.length ? filteredInvestments.map((investment) => {
              const result = investmentResult(investment);
              return (
                <article className="finance-card position-card accent-card" key={investment.id} style={accentStyle(accounts.find((account) => account.id === investment.investment_account_id)?.color)}>
                  <div className="finance-card-topline"><span>{assetTypeLabel(investment.asset_type)}</span><span className="badge">{brokerName(accounts, investment.investment_account_id)}</span></div>
                  <h2 className="finance-card-title">{investment.ticker || investment.name}</h2>
                  <p className="finance-card-caption">{investment.name}</p>
                  <div className="mini-metrics-grid">
                    <div><span>Quantidade</span><strong>{toNumber(investment.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 8 })}</strong></div>
                    <div><span>Preço médio</span><strong>{currencyBRL(investment.average_price)}</strong></div>
                    <div><span>Custo</span><strong>{currencyBRL(investmentCost(investment))}</strong></div>
                    <div><span>Valor atual</span><strong>{currencyBRL(investmentCurrentValue(investment))}</strong></div>
                    <div><span>Resultado</span><strong className={result >= 0 ? "positive-text" : "danger-text"}>{currencyBRL(result)}</strong></div>
                    <div><span>Rentabilidade</span><strong>{formatPercent(investmentProfitability(investment))}</strong></div>
                  </div>
                  <div className="finance-card-actions">
                    <button className="btn btn-muted" type="button" onClick={() => openAsset(investment)}>Editar</button>
                    <button className="btn btn-muted" type="button" onClick={() => openMovement(undefined, investment.id)}>Movimentar</button>
                    <button className="btn btn-danger" type="button" disabled={loading} onClick={() => deleteRecord("/api/investments/assets", investment.id, "Excluir posição? O histórico fica preservado por exclusão lógica.", "Posição excluída.")}>Excluir</button>
                  </div>
                </article>
              );
            }) : <div className="empty-state wide">Nenhuma posição encontrada. Cadastre uma posição inicial ou registre uma compra de ativo.</div>}
          </div>
        ) : null}

        {activeTab === "movements" ? (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Data</th><th>Tipo</th><th>Ativo/caixa</th><th>Corretora</th><th>Valor</th><th>Ações</th></tr></thead>
              <tbody>
                {filteredTransactions.length ? filteredTransactions.slice(0, 80).map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{datePt(transaction.date)}</td>
                    <td>{investmentTransactionLabel(transaction.type)}</td>
                    <td>{investmentName(investments, transaction.investment_id)}</td>
                    <td>{brokerName(accounts, transaction.investment_account_id)}</td>
                    <td>{currencyBRL(transaction.amount)}</td>
                    <td className="table-actions">
                      <button className="link-button" type="button" onClick={() => openMovement(transaction)}>Editar</button>
                      <button className="link-button danger-text" type="button" disabled={loading} onClick={() => deleteRecord("/api/investments/transactions", transaction.id, "Excluir movimentação? O efeito no ativo/caixa será revertido.", "Movimentação excluída.")}>Excluir</button>
                    </td>
                  </tr>
                )) : <tr><td colSpan={6}>Nenhuma movimentação registrada.</td></tr>}
              </tbody>
            </table>
          </div>
        ) : null}

        {activeTab === "allocation" ? (
          <div className="analytics-grid">
            <div className="surface-soft-card">
              <h3>Planejamento de alocação</h3>
              {allocationTargets.length ? allocationTargets.map((target) => {
                const current = currentAllocationPercent(target, investments, summary.currentValue);
                const diff = current - toNumber(target.target_percent);
                return (
                  <div className="allocation-row" key={target.id}>
                    <div>
                      <strong>{target.label}</strong>
                      <span>{target.target_scope === "asset" ? "Ativo" : "Classe"} • {target.target_key}</span>
                    </div>
                    <div><span>Atual</span><strong>{formatPercent(current)}</strong></div>
                    <div><span>Desejado</span><strong>{formatPercent(target.target_percent)}</strong></div>
                    <div><span>Diferença</span><strong className={diff <= 0 ? "positive-text" : "danger-text"}>{diff <= 0 ? "Abaixo" : "Acima"} {formatPercent(Math.abs(diff))}</strong></div>
                    <div className="table-actions">
                      <button className="link-button" type="button" onClick={() => openTarget(target)}>Editar</button>
                      <button className="link-button danger-text" type="button" disabled={loading} onClick={() => deleteRecord("/api/investments/allocation-targets", target.id, "Excluir alocação alvo?", "Alocação alvo excluída.")}>Excluir</button>
                    </div>
                  </div>
                );
              }) : <p className="muted-text">Nenhum alvo definido. Defina percentuais por classe ou ativo para planejar o próximo aporte.</p>}
            </div>
            <div className="surface-soft-card">
              <h3>Distribuição por corretora</h3>
              {byBroker.length ? byBroker.map((item) => (
                <div className="bar-row" key={item.key}>
                  <div><strong>{item.label}</strong><span>{currencyBRL(item.value)}</span></div>
                  <i><b style={{ width: `${summary.totalPatrimony > 0 ? Math.min(100, (item.value / summary.totalPatrimony) * 100) : 0}%` }} /></i>
                </div>
              )) : <p className="muted-text">Sem corretoras para calcular distribuição.</p>}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="section-heading"><div><h2>Atividade recente</h2><p>Histórico técnico das últimas ações em investimentos.</p></div><span className="badge">{activityLogs.length} registro(s)</span></div>
        <div className="activity-feed">
          {activityLogs.slice(0, 8).map((log) => (
            <div className="activity-item" key={log.id}>
              <strong>{log.action_type.replaceAll("_", " ")}</strong>
              <span>{new Date(log.created_at || "").toLocaleString("pt-BR")}</span>
            </div>
          ))}
          {!activityLogs.length ? <div className="empty-state">Nenhuma atividade registrada ainda.</div> : null}
        </div>
      </section>

      {modalMode === "broker" ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal-card" onSubmit={submitBroker}>
            <div className="modal-header"><div><h2>{brokerForm.id ? "Editar corretora" : "Nova corretora"}</h2><p>Separe seus investimentos por instituição ou conta.</p></div><button className="icon-button" type="button" onClick={closeModal}>Fechar</button></div>
            <div className="form-grid two-columns">
              <label className="field">Nome<input value={brokerForm.name} onChange={(event) => setBrokerForm((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label className="field">Instituição<input value={brokerForm.institution} onChange={(event) => setBrokerForm((current) => ({ ...current, institution: event.target.value }))} /></label>
              <label className="field">Tipo<input value={brokerForm.type} onChange={(event) => setBrokerForm((current) => ({ ...current, type: event.target.value }))} /></label>
              <label className="field">Caixa inicial/atual<input type="number" step="0.01" value={brokerForm.cash_balance} onChange={(event) => setBrokerForm((current) => ({ ...current, cash_balance: event.target.value }))} /></label>
              <ColorPickerField
                label="Cor da corretora"
                value={brokerForm.color}
                onChange={(color) => setBrokerForm((current) => ({ ...current, color }))}
                helper="Ajuda a separar corretoras e carteiras no visual."
              />
              <label className="field full-span">Observações<textarea rows={4} value={brokerForm.notes} onChange={(event) => setBrokerForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            </div>
            <div className="modal-actions"><button className="btn btn-muted" type="button" onClick={closeModal}>Cancelar</button><button className="btn btn-primary" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</button></div>
          </form>
        </div>
      ) : null}

      {modalMode === "asset" ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal-card" onSubmit={submitAsset}>
            <div className="modal-header"><div><h2>{assetForm.id ? "Editar posição" : "Cadastrar posição inicial"}</h2><p>Use para registrar ativos que você já possui hoje.</p></div><button className="icon-button" type="button" onClick={closeModal}>Fechar</button></div>
            <div className="form-grid two-columns">
              <label className="field">Corretora<select value={assetForm.investment_account_id} onChange={(event) => setAssetForm((current) => ({ ...current, investment_account_id: event.target.value }))}><option value="">Sem corretora</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
              <label className="field">Tipo de ativo<select value={assetForm.asset_type} onChange={(event) => setAssetForm((current) => ({ ...current, asset_type: event.target.value }))}>{assetTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field">Nome<input value={assetForm.name} onChange={(event) => setAssetForm((current) => ({ ...current, name: event.target.value }))} required /></label>
              <label className="field">Ticker / identificador<input value={assetForm.ticker} onChange={(event) => setAssetForm((current) => ({ ...current, ticker: event.target.value }))} /></label>
              <label className="field">Quantidade<input type="number" step="0.00000001" value={assetForm.quantity} onChange={(event) => setAssetForm((current) => ({ ...current, quantity: event.target.value }))} /></label>
              <label className="field">Preço médio<input type="number" step="0.01" value={assetForm.average_price} onChange={(event) => setAssetForm((current) => ({ ...current, average_price: event.target.value }))} /></label>
              <label className="field">Valor atual unitário<input type="number" step="0.01" value={assetForm.current_price} onChange={(event) => setAssetForm((current) => ({ ...current, current_price: event.target.value }))} /></label>
              <label className="field">Data de referência<input type="date" value={assetForm.purchase_date} onChange={(event) => setAssetForm((current) => ({ ...current, purchase_date: event.target.value }))} /></label>
              <label className="field full-span">Observações<textarea rows={4} value={assetForm.notes} onChange={(event) => setAssetForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            </div>
            <div className="modal-actions"><button className="btn btn-muted" type="button" onClick={closeModal}>Cancelar</button><button className="btn btn-primary" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</button></div>
          </form>
        </div>
      ) : null}

      {modalMode === "movement" ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal-card" onSubmit={submitMovement}>
            <div className="modal-header"><div><h2>{movementForm.id ? "Editar movimentação" : "Nova movimentação"}</h2><p>Registre aporte, compra, venda, provento, taxa ou retirada.</p></div><button className="icon-button" type="button" onClick={closeModal}>Fechar</button></div>
            <div className="form-grid two-columns">
              <label className="field">Tipo<select value={movementForm.type} onChange={(event) => setMovementForm((current) => ({ ...current, type: event.target.value }))}>{movementTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field">Data<input type="date" value={movementForm.date} onChange={(event) => setMovementForm((current) => ({ ...current, date: event.target.value }))} required /></label>
              <label className="field">Corretora<select value={movementForm.investment_account_id} onChange={(event) => setMovementForm((current) => ({ ...current, investment_account_id: event.target.value }))}><option value="">Sem corretora</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
              <label className="field">Ativo<select value={movementForm.investment_id} onChange={(event) => {
                const selected = investments.find((investment) => investment.id === event.target.value);
                setMovementForm((current) => ({ ...current, investment_id: event.target.value, investment_account_id: selected?.investment_account_id || current.investment_account_id }));
              }}><option value="">Nenhum / caixa</option>{investments.map((investment) => <option key={investment.id} value={investment.id}>{investment.ticker || investment.name} • {investment.name}</option>)}</select></label>
              <label className="field">Quantidade<input type="number" step="0.00000001" value={movementForm.quantity} onChange={(event) => setMovementForm((current) => ({ ...current, quantity: event.target.value }))} /></label>
              <label className="field">Preço unitário<input type="number" step="0.01" value={movementForm.unit_price} onChange={(event) => setMovementForm((current) => ({ ...current, unit_price: event.target.value }))} /></label>
              <label className="field">Valor total<input type="number" step="0.01" value={movementForm.amount} onChange={(event) => setMovementForm((current) => ({ ...current, amount: event.target.value }))} /></label>
              <label className="field">Taxas<input type="number" step="0.01" value={movementForm.fees} onChange={(event) => setMovementForm((current) => ({ ...current, fees: event.target.value }))} /></label>
              <label className="field full-span">Observações<textarea rows={4} value={movementForm.notes} onChange={(event) => setMovementForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            </div>
            <p className="form-note">Aportes e retiradas ajustam o caixa da corretora. Compras e vendas atualizam quantidade/preço médio do ativo.</p>
            <div className="modal-actions"><button className="btn btn-muted" type="button" onClick={closeModal}>Cancelar</button><button className="btn btn-primary" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</button></div>
          </form>
        </div>
      ) : null}

      {modalMode === "target" ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal-card" onSubmit={submitTarget}>
            <div className="modal-header"><div><h2>{targetForm.id ? "Editar alocação alvo" : "Nova alocação alvo"}</h2><p>Planejamento simples, sem recomendação automática.</p></div><button className="icon-button" type="button" onClick={closeModal}>Fechar</button></div>
            <div className="form-grid two-columns">
              <label className="field">Escopo<select value={targetForm.target_scope} onChange={(event) => setTargetForm((current) => ({ ...current, target_scope: event.target.value as TargetForm["target_scope"], target_key: event.target.value === "asset" ? (investments[0]?.ticker || investments[0]?.name || "") : "stock", label: event.target.value === "asset" ? (investments[0]?.ticker || investments[0]?.name || "Ativo") : "Ações" }))}><option value="asset_type">Classe de ativo</option><option value="asset">Ativo específico</option></select></label>
              <label className="field">Alvo{targetForm.target_scope === "asset_type" ? (
                <select value={targetForm.target_key} onChange={(event) => setTargetForm((current) => ({ ...current, target_key: event.target.value, label: assetTypeLabel(event.target.value) }))}>{assetTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              ) : (
                <select value={targetForm.target_key} onChange={(event) => {
                  const selected = investments.find((investment) => (investment.ticker || investment.name) === event.target.value);
                  setTargetForm((current) => ({ ...current, target_key: event.target.value, label: selected?.ticker || selected?.name || current.label }));
                }}><option value="">Escolha um ativo</option>{investments.map((investment) => <option key={investment.id} value={investment.ticker || investment.name}>{investment.ticker || investment.name} • {investment.name}</option>)}</select>
              )}</label>
              <label className="field">Rótulo<input value={targetForm.label} onChange={(event) => setTargetForm((current) => ({ ...current, label: event.target.value }))} required /></label>
              <label className="field">Percentual desejado<input type="number" step="0.01" value={targetForm.target_percent} onChange={(event) => setTargetForm((current) => ({ ...current, target_percent: event.target.value }))} /></label>
              <label className="field full-span">Observações<textarea rows={4} value={targetForm.notes} onChange={(event) => setTargetForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            </div>
            {targetForm.target_scope === "asset" && selectedInvestmentForTarget ? <p className="form-note">Ativo selecionado: {selectedInvestmentForTarget.name}</p> : null}
            <div className="modal-actions"><button className="btn btn-muted" type="button" onClick={closeModal}>Cancelar</button><button className="btn btn-primary" disabled={loading}>{loading ? "Salvando..." : "Salvar"}</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
