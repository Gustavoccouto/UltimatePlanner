"use client";

import { FormEvent, useMemo, useState } from "react";
import type { AiChatMessage } from "@/lib/domain/app-types";
import { currencyBRL, monthInput, monthLabel, todayInput } from "@/lib/domain/formatters";

type AiConsultantClientProps = {
  initialMessages: AiChatMessage[];
  initialContext: Record<string, unknown>;
};

type ChatPayload = {
  ok?: boolean;
  answer?: string;
  data?: AiChatMessage[];
  error?: string;
  message?: string;
};

type AiIntent = "general" | "purchase" | "budget" | "risk" | "planning";

type PurchaseScenario = {
  description: string;
  amount: string;
  paymentMethod: "cash" | "credit" | "debit_installment";
  installments: string;
  priority: "baixa" | "media" | "alta";
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
  if (!response.ok) throw new Error(payload.error || payload.message || "Erro inesperado.");
  return payload as T;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cashFlowFrom(context: Record<string, unknown>) {
  const cashFlow = asRecord(context.cash_flow);
  return {
    balance: Number(cashFlow.total_account_balance || 0),
    projected: Number(cashFlow.projected_month_end_balance || 0),
    income: Number(cashFlow.income_until_reference_date || 0),
    expenses: Number(cashFlow.cash_out_until_reference_date || 0),
    openInvoices: Number(cashFlow.open_card_invoices || 0),
    plannedIncoming: Number(cashFlow.planned_incoming_month || 0),
    plannedOutgoing: Number(cashFlow.planned_outgoing_month || 0)
  };
}

function decisionSupportFrom(context: Record<string, unknown>) {
  const support = asRecord(context.decision_support);
  return {
    safetyMarginNow: Number(support.safety_margin_now || 0),
    projectedSafetyMargin: Number(support.projected_safety_margin || 0),
    riskLevel: String(support.risk_level || "neutro"),
    summary: String(support.summary || "Ainda não há dados suficientes para um diagnóstico completo.")
  };
}

function formatMessage(content: string) {
  return content.split("\n").filter(Boolean).map((line, index) => <p key={`${line}-${index}`}>{line}</p>);
}

const quickQuestions: Array<{ label: string; intent: AiIntent; question: string }> = [
  { label: "Compra no crédito", intent: "purchase", question: "Posso comprar um teclado de R$300 no crédito este mês? Diferencie saldo atual e fatura futura." },
  { label: "Saúde do mês", intent: "budget", question: "O mês está apertado ou ainda tenho margem? Explique usando saldo atual, faturas e projeção." },
  { label: "Cortes inteligentes", intent: "risk", question: "Quais gastos eu deveria revisar primeiro sem comprometer metas e projetos?" },
  { label: "Plano de 30 dias", intent: "planning", question: "Monte um plano simples para os próximos 30 dias considerando contas, faturas, metas, projetos e investimentos." }
];

const initialScenario: PurchaseScenario = {
  description: "",
  amount: "300",
  paymentMethod: "credit",
  installments: "1",
  priority: "media"
};

export function AiConsultantClient({ initialMessages, initialContext }: AiConsultantClientProps) {
  const [messages, setMessages] = useState<AiChatMessage[]>(initialMessages);
  const [message, setMessage] = useState("");
  const [month, setMonth] = useState(monthInput());
  const [referenceDate, setReferenceDate] = useState(todayInput());
  const [intent, setIntent] = useState<AiIntent>("general");
  const [scenario, setScenario] = useState<PurchaseScenario>(initialScenario);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contextPreview, setContextPreview] = useState<Record<string, unknown>>(initialContext);

  const cashFlow = useMemo(() => cashFlowFrom(contextPreview), [contextPreview]);
  const decisionSupport = useMemo(() => decisionSupportFrom(contextPreview), [contextPreview]);

  async function refreshContext() {
    const refresh = await requestJson<{ context: Record<string, unknown>; data?: AiChatMessage[] }>(`/api/ai/chat?month=${encodeURIComponent(month)}&referenceDate=${encodeURIComponent(referenceDate)}`);
    setContextPreview(refresh.context || contextPreview);
    if (refresh.data) setMessages(refresh.data);
  }

  async function submitQuestion(question: string, options?: { intent?: AiIntent; scenario?: PurchaseScenario }) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    const optimisticUserMessage: AiChatMessage = {
      id: `local-user-${Date.now()}`,
      owner_id: "local",
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString()
    };

    setMessages((current) => [...current, optimisticUserMessage]);
    setMessage("");
    setLoading(true);
    setError("");

    try {
      const payload = await requestJson<ChatPayload>("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: trimmed,
          month,
          referenceDate,
          intent: options?.intent || intent,
          scenario: options?.scenario
        })
      });

      if (payload.answer && !payload.data) {
        setMessages((current) => [
          ...current,
          {
            id: `local-assistant-${Date.now()}`,
            owner_id: "local",
            role: "assistant",
            content: payload.answer || "Não consegui gerar uma resposta agora.",
            created_at: new Date().toISOString()
          }
        ]);
      }
      if (payload.data) setMessages(payload.data);
      if (payload.ok === false) throw new Error(payload.error || payload.message || "A IA não respondeu.");
      await refreshContext();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível consultar a IA.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitQuestion(message);
  }

  function buildScenarioQuestion() {
    const amount = Number(scenario.amount || 0);
    const installments = Number(scenario.installments || 1);
    const methodLabel = scenario.paymentMethod === "credit" ? "crédito" : scenario.paymentMethod === "debit_installment" ? "parcelamento no débito" : "à vista/débito";
    return [
      `Quero analisar uma compra${scenario.description ? `: ${scenario.description}` : ""}.`,
      `Valor: ${currencyBRL(amount)}.`,
      `Forma de pagamento: ${methodLabel}.`,
      `Parcelas: ${installments || 1}.`,
      `Prioridade pessoal: ${scenario.priority}.`,
      "Me dê um veredito claro, diferencie saldo atual e impacto futuro, e diga em quais condições essa compra seria segura."
    ].join(" ");
  }

  return (
    <div className="grid ai-page">
      <header className="page-header ai-hero-header">
        <div>
          <span className="eyebrow">Consultoria financeira com contexto real</span>
          <h1 className="page-title">Consultor IA</h1>
          <p className="page-caption">Pergunte sobre compras, faturas, metas, projetos e investimentos sem misturar saldo atual com obrigação futura.</p>
        </div>
        <div className="dashboard-reference-controls">
          <label className="inline-field">
            Mês de análise
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
          <label className="inline-field">
            Analisar até
            <input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} />
          </label>
          <button className="btn btn-muted" type="button" onClick={refreshContext} disabled={loading}>Atualizar contexto</button>
        </div>
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className="stats-grid ai-context-grid">
        <article className="stat-card"><div className="stat-label">Saldo em contas</div><div className="stat-value">{currencyBRL(cashFlow.balance)}</div></article>
        <article className="stat-card"><div className="stat-label">Projeção do mês</div><div className="stat-value">{currencyBRL(cashFlow.projected)}</div></article>
        <article className="stat-card"><div className="stat-label">Saídas até agora</div><div className="stat-value">{currencyBRL(cashFlow.expenses)}</div></article>
        <article className="stat-card"><div className="stat-label">Faturas abertas</div><div className="stat-value">{currencyBRL(cashFlow.openInvoices)}</div></article>
      </section>

      <section className="ai-layout ai-layout-enhanced">
        <div className="panel ai-chat-panel">
          <div className="section-heading">
            <div>
              <h2>Conversa</h2>
              <p>Contexto atual: {monthLabel(month)} até {referenceDate.split("-").reverse().join("/")}.</p>
            </div>
            <select className="select compact-select" value={intent} onChange={(event) => setIntent(event.target.value as AiIntent)}>
              <option value="general">Análise geral</option>
              <option value="purchase">Compra</option>
              <option value="budget">Orçamento</option>
              <option value="risk">Risco</option>
              <option value="planning">Planejamento</option>
            </select>
          </div>

          <div className="ai-messages" aria-live="polite">
            {messages.length ? messages.map((item) => (
              <article className={`ai-message ${item.role === "user" ? "ai-message-user" : "ai-message-assistant"}`} key={item.id}>
                <span>{item.role === "user" ? "Você" : "Consultor"}</span>
                <div className="ai-message-content">{formatMessage(item.content)}</div>
              </article>
            )) : (
              <div className="empty-state">Faça uma pergunta. Exemplo: “Posso comprar um teclado de R$300 no crédito?”</div>
            )}
            {loading ? <article className="ai-message ai-message-assistant"><span>Consultor</span><p>Analisando saldo, faturas, projeção e prioridades...</p></article> : null}
          </div>

          <form className="ai-chat-form" onSubmit={handleSubmit}>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Pergunte algo sobre uma compra, orçamento, fatura, meta, projeto ou investimento..."
              rows={3}
            />
            <button className="btn btn-primary" disabled={loading || !message.trim()} type="submit">
              {loading ? "Enviando..." : "Perguntar"}
            </button>
          </form>
        </div>

        <aside className="panel ai-side-panel ai-advisor-panel">
          <div className="section-heading">
            <div>
              <h2>Analisar compra</h2>
              <p>Preencha sem escrever prompt manual.</p>
            </div>
          </div>

          <div className="ai-scenario-form">
            <label className="field">Item ou motivo
              <input value={scenario.description} onChange={(event) => setScenario((current) => ({ ...current, description: event.target.value }))} placeholder="Ex.: teclado, viagem, curso" />
            </label>
            <label className="field">Valor
              <input type="number" min="0" step="0.01" value={scenario.amount} onChange={(event) => setScenario((current) => ({ ...current, amount: event.target.value }))} />
            </label>
            <label className="field">Forma de pagamento
              <select value={scenario.paymentMethod} onChange={(event) => setScenario((current) => ({ ...current, paymentMethod: event.target.value as PurchaseScenario["paymentMethod"] }))}>
                <option value="credit">Crédito</option>
                <option value="cash">Débito / à vista</option>
                <option value="debit_installment">Parcelado no débito</option>
              </select>
            </label>
            <label className="field">Parcelas
              <input type="number" min="1" max="48" value={scenario.installments} onChange={(event) => setScenario((current) => ({ ...current, installments: event.target.value }))} />
            </label>
            <label className="field">Prioridade
              <select value={scenario.priority} onChange={(event) => setScenario((current) => ({ ...current, priority: event.target.value as PurchaseScenario["priority"] }))}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </label>
            <button
              className="btn btn-primary full-width"
              type="button"
              disabled={loading || Number(scenario.amount || 0) <= 0}
              onClick={() => submitQuestion(buildScenarioQuestion(), { intent: "purchase", scenario })}
            >
              Analisar compra
            </button>
          </div>

          <div className="ai-context-box ai-decision-box">
            <strong>Leitura rápida</strong>
            <p>{decisionSupport.summary}</p>
            <div className="mini-metrics-grid">
              <span><small>Margem agora</small><b>{currencyBRL(decisionSupport.safetyMarginNow)}</b></span>
              <span><small>Margem projetada</small><b>{currencyBRL(decisionSupport.projectedSafetyMargin)}</b></span>
              <span><small>Risco</small><b>{decisionSupport.riskLevel}</b></span>
            </div>
          </div>

          <div className="section-heading compact-heading">
            <div>
              <h2>Perguntas rápidas</h2>
              <p>Atalhos para validar o consultor.</p>
            </div>
          </div>
          <div className="quick-question-list">
            {quickQuestions.map((question) => (
              <button key={question.question} className="quick-question" type="button" onClick={() => submitQuestion(question.question, { intent: question.intent })} disabled={loading}>
                <span>{question.label}</span>
                <small>{question.question}</small>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
