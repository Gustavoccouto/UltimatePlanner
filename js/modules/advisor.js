import { pageHeader, toast } from "../ui.js";
import { state, patchUi } from "../state.js";
import { SheetsService } from "../services/sheets.js";
import { APP_CONFIG } from "../config.js";
import { getCurrentUser } from "./onboarding.js";

const QUICK_PROMPTS = [
  "O que acha de eu comprar um teclado novo de 300 reais?",
  "Esse gasto vai apertar meu orçamento do mês?",
  "Essa compra atrapalha minha meta principal?",
  "Faz sentido investir esse valor este mês?",
  "Compensa parcelar ou pagar à vista neste cenário?",
];

export function renderAdvisor() {
  const messages = Array.isArray(state.ui.advisorMessages) ? state.ui.advisorMessages : [];
  const loading = Boolean(state.ui.advisorLoading);

  return `
    ${pageHeader(
      "Consultor IA",
      "Converse com um assistente financeiro prático usando o contexto real do seu app.",
      `<div class="flex items-center gap-3 flex-wrap justify-end">${renderQuickBadges()}<button id="advisor-clear-btn" class="action-btn">Limpar conversa</button></div>`,
    )}

    <section class="module-stack">
      <article class="card p-5 md:p-6">
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_340px]">
          <div class="grid gap-4 min-w-0">
            <div class="rounded-[28px] border border-slate-100 bg-slate-50/80 p-4 md:p-5">
              <div class="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div class="eyebrow">Conversa contextual</div>
                  <div class="section-title mt-2">Use perguntas sobre compras, metas, fluxo de caixa e investimentos</div>
                  <p class="text-slate-500 mt-2">A IA responde em português com base nos seus dados atuais. Ela não executa ações nem inventa números.</p>
                </div>
                <span class="badge badge-muted">Memória curta</span>
              </div>
            </div>

            <div class="rounded-[30px] border border-slate-100 bg-slate-50/70 p-3 md:p-4">
              <div class="grid gap-3" id="advisor-thread">
                ${messages.length ? messages.map(renderMessage).join("") : renderEmptyThread()}
                ${loading ? renderLoadingMessage() : ""}
              </div>
            </div>

            <form id="advisor-form" class="grid gap-3">
              <label class="grid gap-2">
                <span class="text-sm font-semibold text-slate-700">Sua pergunta</span>
                <textarea id="advisor-question" class="textarea min-h-[120px]" maxlength="${APP_CONFIG.aiMaxQuestionLength}" placeholder="Ex.: O que acha de eu comprar um teclado novo de 300 reais?"></textarea>
              </label>
              <div class="flex items-center justify-between gap-3 flex-wrap">
                <div class="text-sm text-slate-500">A pergunta pode ter até ${APP_CONFIG.aiMaxQuestionLength} caracteres.</div>
                <button class="action-btn action-btn-primary" type="submit" ${loading ? 'disabled' : ''}>${loading ? 'Consultando…' : 'Perguntar para a IA'}</button>
              </div>
            </form>
          </div>

          <aside class="grid gap-4 content-start">
            <article class="card p-5">
              <div class="eyebrow">Sugestões rápidas</div>
              <div class="section-title mt-2">Perguntas que funcionam bem</div>
              <div class="grid gap-2 mt-4">
                ${QUICK_PROMPTS.map((prompt) => `<button type="button" class="text-left rounded-[20px] border border-slate-100 bg-slate-50/80 px-4 py-3 hover:bg-white transition" data-advisor-suggestion="${escapeAttr(prompt)}">${escapeHtml(prompt)}</button>`).join("")}
              </div>
            </article>

            <article class="card p-5">
              <div class="eyebrow">Base da análise</div>
              <div class="section-title mt-2">Contexto automático usado</div>
              <div class="grid gap-2 mt-4 text-sm text-slate-600">
                <div>• saldo atual em conta</div>
                <div>• receitas e gastos do mês</div>
                <div>• faturas abertas e próximas</div>
                <div>• metas e projetos relevantes</div>
                <div>• compras recentes e parcelamentos</div>
                <div>• investimentos e caixa em corretoras</div>
              </div>
            </article>
          </aside>
        </div>
      </article>
    </section>`;
}

export function bindAdvisorEvents() {
  document.getElementById('advisor-form')?.addEventListener('submit', submitAdvisorQuestion);
  document.getElementById('advisor-clear-btn')?.addEventListener('click', clearConversation);
  document.querySelectorAll('[data-advisor-suggestion]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById('advisor-question');
      if (!input) return;
      input.value = button.dataset.advisorSuggestion || '';
      input.focus();
    });
  });
}

async function submitAdvisorQuestion(event) {
  event.preventDefault();
  if (state.ui.advisorLoading) return;

  const textarea = document.getElementById('advisor-question');
  const question = String(textarea?.value || '').trim();
  if (!question) {
    toast('Digite uma pergunta antes de enviar.', 'error');
    return;
  }

  const userMessage = createMessage('user', question);
  const nextMessages = [...getMessages(), userMessage];
  patchUi({ advisorMessages: nextMessages, advisorLoading: true });
  if (textarea) textarea.value = '';

  try {
    const response = await SheetsService.askFinancialAdvisor({
      question,
      recentMessages: buildRecentMessages(nextMessages),
      selectedMonth: state.ui.selectedMonth,
      userName: getCurrentUser()?.name || '',
    });

    const assistantText = String(response.reply || '').trim();
    if (!assistantText) {
      throw new Error('A IA retornou uma resposta vazia.');
    }

    patchUi({
      advisorMessages: [...nextMessages, createMessage('assistant', assistantText)],
      advisorLoading: false,
    });
  } catch (error) {
    patchUi({ advisorMessages: nextMessages, advisorLoading: false });
    toast(error.message || 'Não foi possível consultar a IA.', 'error');
  }
}

function clearConversation() {
  patchUi({ advisorMessages: [], advisorLoading: false });
}

function getMessages() {
  return Array.isArray(state.ui.advisorMessages) ? state.ui.advisorMessages : [];
}

function buildRecentMessages(messages) {
  return messages
    .filter((item) => item && (item.role === 'user' || item.role === 'assistant'))
    .slice(-APP_CONFIG.aiRecentMessages)
    .map((item) => ({ role: item.role, content: item.content }));
}

function createMessage(role, content) {
  return {
    id: `advisor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    content: String(content || '').trim(),
    createdAt: new Date().toISOString(),
  };
}

function renderEmptyThread() {
  return `
    <div class="rounded-[24px] border border-dashed border-slate-200 bg-white/80 px-5 py-8 text-center text-slate-500">
      <div class="font-semibold text-slate-800">Comece a conversa</div>
      <p class="mt-2">Pergunte sobre compras, orçamento, parcelamentos, metas, projetos e investimentos.</p>
    </div>`;
}

function renderLoadingMessage() {
  return `
    <div class="flex justify-start">
      <div class="max-w-[860px] rounded-[24px] border border-slate-100 bg-white px-4 py-4 shadow-sm">
        <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">IA</div>
        <div class="mt-2 flex items-center gap-2 text-slate-500">
          <span class="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Consultando seu contexto financeiro…</span>
        </div>
      </div>
    </div>`;
}

function renderMessage(message) {
  const isUser = message.role === 'user';
  return `
    <div class="flex ${isUser ? 'justify-end' : 'justify-start'}">
      <article class="max-w-[860px] ${isUser ? 'bg-slate-950 text-white border-slate-950' : 'bg-white text-slate-800 border-slate-100'} rounded-[24px] border px-4 py-4 shadow-sm">
        <div class="flex items-center justify-between gap-3 mb-2">
          <span class="text-xs font-bold uppercase tracking-[0.16em] ${isUser ? 'text-slate-300' : 'text-slate-400'}">${isUser ? 'Você' : 'IA'}</span>
          <span class="text-xs ${isUser ? 'text-slate-400' : 'text-slate-400'}">${formatTime(message.createdAt)}</span>
        </div>
        <div class="text-[0.98rem] leading-7 whitespace-pre-wrap break-words">${escapeHtml(message.content)}</div>
      </article>
    </div>`;
}

function renderQuickBadges() {
  return `<span class="badge badge-muted">Compras</span><span class="badge badge-muted">Orçamento</span><span class="badge badge-muted">Metas</span><span class="badge badge-muted">Investimentos</span>`;
}

function formatTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", '&#39;');
}
