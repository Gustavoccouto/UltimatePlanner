"use client";

import { CSSProperties, FormEvent, useMemo, useState } from "react";
import type { Account, AccountSummary, Transaction } from "@/lib/domain/app-types";
import { currencyBRL } from "@/lib/domain/formatters";
import { deriveAccountSummaries, labelAccountType } from "@/lib/domain/account-balances";
import { ColorPickerField } from "@/components/ui/color-picker-field";

type AccountForm = {
  id?: string;
  name: string;
  institution: string;
  type: "checking" | "savings" | "investment";
  initial_balance: string;
  color: string;
  notes: string;
};

const emptyForm: AccountForm = {
  name: "",
  institution: "",
  type: "checking",
  initial_balance: "0",
  color: "",
  notes: ""
};

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


function accentStyle(color?: string | null): CSSProperties | undefined {
  return color ? ({ "--item-accent": color } as CSSProperties) : undefined;
}

function notesFrom(account: Account) {
  const metadata = account.metadata || {};
  return typeof metadata.notes === "string" ? metadata.notes : "";
}

export function AccountsClient({ initialAccounts, initialTransactions }: { initialAccounts: Account[]; initialTransactions: Transaction[] }) {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [transactions] = useState<Transaction[]>(initialTransactions);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const summaries = useMemo(() => deriveAccountSummaries(accounts, transactions), [accounts, transactions]);
  const totalBalance = summaries.reduce((sum, account) => sum + account.derived_balance, 0);

  function openCreate() {
    setForm(emptyForm);
    setMessage("");
    setError("");
    setIsModalOpen(true);
  }

  function openEdit(account: AccountSummary) {
    setForm({
      id: account.id,
      name: account.name,
      institution: account.institution || "",
      type: account.type,
      initial_balance: String(account.initial_balance || 0),
      color: account.color || "",
      notes: notesFrom(account)
    });
    setMessage("");
    setError("");
    setIsModalOpen(true);
  }

  async function reloadAccounts() {
    const payload = await requestJson<{ data: Account[] }>("/api/accounts");
    setAccounts(payload.data);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await requestJson<{ data: Account }>("/api/accounts", {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify({
          ...form,
          initial_balance: Number(form.initial_balance || 0)
        })
      });
      await reloadAccounts();
      setIsModalOpen(false);
      setMessage(form.id ? "Conta atualizada com sucesso." : "Conta salva com sucesso.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(account: AccountSummary) {
    const confirmed = window.confirm(
      "Excluir conta\n\nA conta será marcada como excluída. O histórico fica preservado para integridade dos dados."
    );
    if (!confirmed) return;

    setLoading(true);
    setError("");
    setMessage("");
    try {
      await requestJson<{ ok: boolean }>("/api/accounts", {
        method: "DELETE",
        body: JSON.stringify({ id: account.id })
      });
      await reloadAccounts();
      setMessage("Conta excluída.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível excluir.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid">
      <header className="page-header">
        <div>
          <h1 className="page-title">Contas</h1>
          <p className="page-caption">Gerencie bancos e contas com saldo sempre derivado pelas transações.</p>
        </div>
        <button className="btn btn-primary" type="button" onClick={openCreate}>Nova conta</button>
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <section className="stats-grid accounts-stats-grid">
        <article className="stat-card">
          <div className="stat-label">Saldo total derivado</div>
          <div className="stat-value">{currencyBRL(totalBalance)}</div>
        </article>
        <article className="stat-card">
          <div className="stat-label">Contas ativas</div>
          <div className="stat-value">{summaries.length}</div>
        </article>
        <article className="stat-card">
          <div className="stat-label">Movimentações vinculadas</div>
          <div className="stat-value">{summaries.reduce((sum, account) => sum + account.transaction_count, 0)}</div>
        </article>
      </section>

      <section className="cards-grid">
        {summaries.length ? summaries.map((account) => (
          <article className="finance-card accent-card" key={account.id} style={accentStyle(account.color)}>
            <div className="finance-card-topline">
              <span className="finance-card-bank">{account.institution || "Banco não informado"}</span>
              <span className="badge">{labelAccountType(account.type)}</span>
            </div>
            <h2 className="finance-card-title">{account.name}</h2>
            <p className="finance-card-value">{currencyBRL(account.derived_balance)}</p>
            <p className="finance-card-caption">Saldo derivado de {account.transaction_count} movimentação(ões)</p>
            <div className="finance-card-actions">
              <button className="btn btn-muted" type="button" onClick={() => openEdit(account)}>Editar</button>
              <button className="btn btn-danger" type="button" onClick={() => handleDelete(account)} disabled={loading}>Excluir</button>
            </div>
          </article>
        )) : (
          <div className="empty-state wide">Nenhuma conta cadastrada. Adicione sua primeira conta para começar a derivar saldos e organizar movimentações.</div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Mapa das contas</h2>
            <p>Resumo operacional</p>
          </div>
          <span className="badge">{summaries.length} conta(s)</span>
        </div>
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr><th>Conta</th><th>Banco</th><th>Tipo</th><th>Saldo derivado</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {summaries.length ? summaries.map((account) => (
                <tr key={account.id}>
                  <td><span className="table-color-name" style={accentStyle(account.color)}><span className="category-dot" />{account.name}</span></td>
                  <td>{account.institution || "—"}</td>
                  <td>{labelAccountType(account.type)}</td>
                  <td>{currencyBRL(account.derived_balance)}</td>
                  <td className="table-actions">
                    <button className="link-button" type="button" onClick={() => openEdit(account)}>Editar</button>
                    <button className="link-button danger-text" type="button" onClick={() => handleDelete(account)} disabled={loading}>Excluir</button>
                  </td>
                </tr>
              )) : <tr><td colSpan={5}>Nenhuma conta cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal-card" onSubmit={handleSubmit}>
            <div className="modal-header">
              <div>
                <h2>{form.id ? "Editar conta" : "Nova conta"}</h2>
                <p>Campos principais para cadastro, edição e exclusão segura.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsModalOpen(false)}>Fechar</button>
            </div>
            <div className="form-grid two-columns">
              <label className="field">Nome da conta
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label className="field">Banco
                <input value={form.institution} onChange={(event) => setForm((current) => ({ ...current, institution: event.target.value }))} />
              </label>
              <label className="field">Tipo
                <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as AccountForm["type"] }))}>
                  <option value="checking">Conta corrente</option>
                  <option value="savings">Poupança</option>
                  <option value="investment">Investimento</option>
                </select>
              </label>
              <label className="field">Saldo inicial
                <input type="number" step="0.01" value={form.initial_balance} onChange={(event) => setForm((current) => ({ ...current, initial_balance: event.target.value }))} />
              </label>
              <ColorPickerField
                label="Cor da conta"
                value={form.color}
                onChange={(color) => setForm((current) => ({ ...current, color }))}
                helper="A cor aparece em cartões, filtros e identificação visual."
              />
              <label className="field full-span">Observações
                <textarea rows={4} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-muted" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? "Salvando..." : form.id ? "Salvar alterações" : "Salvar conta"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
