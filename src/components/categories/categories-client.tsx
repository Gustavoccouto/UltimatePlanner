"use client";

import { CSSProperties, FormEvent, useMemo, useState } from "react";
import type { Category, Transaction } from "@/lib/domain/app-types";
import { labelCategoryType } from "@/lib/domain/account-balances";
import { currencyBRL, isInMonth, monthInput, monthLabel } from "@/lib/domain/formatters";
import { ColorPickerField } from "@/components/ui/color-picker-field";

type CategoryForm = {
  id?: string;
  name: string;
  type: "income" | "expense" | "transfer" | "investment" | "project" | "goal" | "card";
  color: string;
  icon: string;
};

type CategorySummary = {
  id: string;
  name: string;
  type: string;
  color?: string | null;
  icon?: string | null;
  amount: number;
  count: number;
  percent: number;
};

const emptyForm: CategoryForm = { name: "", type: "expense", color: "", icon: "" };
const UNCATEGORIZED_ID = "__uncategorized__";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Erro inesperado.");
  return payload as T;
}

function categoryById(categories: Category[]) {
  return new Map(categories.map((category) => [category.id, category]));
}

function amountForCategoryAnalysis(transaction: Transaction) {
  if (["expense", "card_expense", "invoice_payment"].includes(transaction.type)) return Number(transaction.amount || 0);
  if (transaction.type === "income") return -Number(transaction.amount || 0);
  return 0;
}

function fallbackColor(index: number) {
  const colors = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16", "#f97316"];
  return colors[index % colors.length];
}

function accentStyle(color?: string | null): CSSProperties | undefined {
  return color ? ({ "--item-accent": color } as CSSProperties) : undefined;
}

export function CategoriesClient({ initialCategories, initialTransactions }: { initialCategories: Category[]; initialTransactions: Transaction[] }) {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [transactions] = useState<Transaction[]>(initialTransactions);
  const [selectedMonth, setSelectedMonth] = useState(monthInput());
  const [form, setForm] = useState<CategoryForm>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const summaries = useMemo<CategorySummary[]>(() => {
    const byId = categoryById(categories);
    const rows = new Map<string, CategorySummary>();

    transactions
      .filter((transaction) => !transaction.is_deleted)
      .filter((transaction) => isInMonth(transaction.date, selectedMonth) || isInMonth(transaction.billing_month || "", selectedMonth))
      .forEach((transaction) => {
        const amount = amountForCategoryAnalysis(transaction);
        if (amount === 0) return;
        const category = transaction.category_id ? byId.get(transaction.category_id) : undefined;
        const id = category?.id || UNCATEGORIZED_ID;
        const current = rows.get(id) || {
          id,
          name: category?.name || "Sem categoria",
          type: category?.type || (amount < 0 ? "income" : "expense"),
          color: category?.color || null,
          icon: category?.icon || null,
          amount: 0,
          count: 0,
          percent: 0
        };
        current.amount += Math.abs(amount);
        current.count += 1;
        rows.set(id, current);
      });

    const list = Array.from(rows.values()).sort((a, b) => b.amount - a.amount);
    const total = list.reduce((sum, row) => sum + row.amount, 0) || 1;
    return list.map((row, index) => ({ ...row, color: row.color || fallbackColor(index), percent: Math.round((row.amount / total) * 1000) / 10 }));
  }, [categories, selectedMonth, transactions]);

  const totalSpending = summaries.reduce((sum, row) => sum + row.amount, 0);
  const topCategory = summaries[0];
  const autoCreatedCount = categories.filter((category) => category.metadata?.auto_created).length;

  function openCreate() {
    setForm(emptyForm);
    setError("");
    setMessage("");
    setIsModalOpen(true);
  }

  function openEdit(category: Category) {
    setForm({
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color || "",
      icon: category.icon || ""
    });
    setError("");
    setMessage("");
    setIsModalOpen(true);
  }

  async function reload() {
    const payload = await requestJson<{ data: Category[] }>("/api/categories");
    setCategories(payload.data);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await requestJson<{ data: Category }>("/api/categories", {
        method: form.id ? "PATCH" : "POST",
        body: JSON.stringify(form)
      });
      await reload();
      setIsModalOpen(false);
      setMessage(form.id ? "Categoria atualizada." : "Categoria salva.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível salvar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(category: Category) {
    const confirmed = window.confirm("Excluir categoria\n\nA categoria será marcada como excluída. Transações antigas continuam preservadas.");
    if (!confirmed) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await requestJson<{ ok: boolean }>("/api/categories", {
        method: "DELETE",
        body: JSON.stringify({ id: category.id })
      });
      await reload();
      setMessage("Categoria excluída.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível excluir.");
    } finally {
      setLoading(false);
    }
  }

  const grouped = categories.reduce<Record<string, Category[]>>((acc, category) => {
    const key = category.type;
    acc[key] = acc[key] || [];
    acc[key].push(category);
    return acc;
  }, {});

  return (
    <div className="grid">
      <header className="page-header">
        <div>
          <h1 className="page-title">Categorias</h1>
          <p className="page-caption">Análise de gastos por categoria. Você digita a categoria no lançamento; o app sugere nomes já usados e cria automaticamente quando necessário.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-muted" type="button" onClick={() => setShowManager((current) => !current)}>{showManager ? "Ocultar cadastro" : "Gerenciar categorias"}</button>
          <button className="btn btn-primary" type="button" onClick={openCreate}>Nova categoria manual</button>
        </div>
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      <section className="filters-panel panel">
        <label className="field inline-field">Mês analisado
          <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
        </label>
        <div className="mini-card-grid wide">
          <div className="mini-card"><span>Total categorizado</span><strong>{currencyBRL(totalSpending)}</strong></div>
          <div className="mini-card"><span>Categoria mais pesada</span><strong>{topCategory ? topCategory.name : "—"}</strong></div>
          <div className="mini-card"><span>Categorias usadas</span><strong>{summaries.length}</strong></div>
          <div className="mini-card"><span>Criadas automaticamente</span><strong>{autoCreatedCount}</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Distribuição em {monthLabel(selectedMonth)}</h2>
            <p>Quanto cada categoria pesou no mês selecionado.</p>
          </div>
          <span className="badge">{summaries.length} categoria(s)</span>
        </div>

        {summaries.length ? (
          <div className="category-analysis-list">
            {summaries.map((row) => (
              <article className="category-analysis-row" key={row.id} style={accentStyle(row.color)}>
                <div className="category-analysis-head">
                  <div className="category-analysis-name">
                    <span className="category-dot" />
                    <strong>{row.icon ? `${row.icon} ` : ""}{row.name}</strong>
                    <small>{labelCategoryType(row.type)} • {row.count} lançamento(s)</small>
                  </div>
                  <div className="category-analysis-value">
                    <strong>{currencyBRL(row.amount)}</strong>
                    <span>{row.percent}%</span>
                  </div>
                </div>
                <div className="category-bar"><span style={{ width: `${Math.min(100, row.percent)}%` }} /></div>
              </article>
            ))}
          </div>
        ) : <div className="empty-state">Nenhum lançamento categorizado em {monthLabel(selectedMonth)}.</div>}
      </section>

      {showManager ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Cadastro e cores</h2>
              <p>O cadastro manual é opcional. A rotina principal agora é digitar a categoria direto na despesa/receita.</p>
            </div>
            <span className="badge">{categories.length} categoria(s)</span>
          </div>

          {categories.length ? (
            <div className="category-groups">
              {Object.entries(grouped).map(([type, rows]) => (
                <article className="category-group" key={type}>
                  <h3>{labelCategoryType(type)}</h3>
                  <div className="chip-list">
                    {rows.map((category) => (
                      <div className="category-chip accent-chip" key={category.id} style={accentStyle(category.color)}>
                        <span className="category-dot" />
                        <span>{category.icon || "•"}</span>
                        <strong>{category.name}</strong>
                        {category.metadata?.auto_created ? <small>auto</small> : null}
                        <button className="link-button" type="button" onClick={() => openEdit(category)}>Editar</button>
                        <button className="link-button danger-text" type="button" onClick={() => handleDelete(category)} disabled={loading}>Excluir</button>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : <div className="empty-state">Nenhuma categoria cadastrada.</div>}
        </section>
      ) : null}

      {isModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <form className="modal-card" onSubmit={handleSubmit}>
            <div className="modal-header">
              <div>
                <h2>{form.id ? "Editar categoria" : "Nova categoria"}</h2>
                <p>Use manualmente apenas quando quiser definir cor, ícone ou padronização antes do primeiro lançamento.</p>
              </div>
              <button className="icon-button" type="button" onClick={() => setIsModalOpen(false)}>Fechar</button>
            </div>
            <div className="form-grid two-columns">
              <label className="field">Nome
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </label>
              <label className="field">Tipo
                <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as CategoryForm["type"] }))}>
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                  <option value="transfer">Transferência</option>
                  <option value="investment">Investimento</option>
                  <option value="project">Projeto</option>
                  <option value="goal">Meta</option>
                  <option value="card">Cartão</option>
                </select>
              </label>
              <ColorPickerField
                label="Cor da categoria"
                value={form.color}
                onChange={(color) => setForm((current) => ({ ...current, color }))}
                helper="A cor aparece no gráfico, nos chips e nas análises."
              />
              <label className="field">Ícone opcional
                <input value={form.icon} onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))} placeholder="💳" />
              </label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-muted" type="button" onClick={() => setIsModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" type="submit" disabled={loading}>{loading ? "Salvando..." : form.id ? "Salvar alterações" : "Salvar categoria"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
