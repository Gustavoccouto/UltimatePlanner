import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiContext, jsonError, parseJson } from "@/lib/http/api";
import { buildCurrentFinancialContext, loadAiChatHistory } from "@/lib/server/financial-snapshot";

const scenarioSchema = z
  .object({
    description: z.string().optional(),
    amount: z.union([z.string(), z.number()]).optional(),
    paymentMethod: z.enum(["cash", "credit", "debit_installment"]).optional(),
    installments: z.union([z.string(), z.number()]).optional(),
    priority: z.enum(["baixa", "media", "alta"]).optional()
  })
  .optional();

const bodySchema = z.object({
  message: z.string().trim().min(1, "Digite uma pergunta."),
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  intent: z.enum(["general", "purchase", "budget", "risk", "planning"]).optional(),
  scenario: scenarioSchema
});

function systemPrompt(intent = "general") {
  return [
    "Você é o consultor financeiro do UltimatePlanner.",
    "Responda em português do Brasil, de forma direta, prática, prudente e sem inventar dados.",
    "Use somente o contexto financeiro JSON enviado pelo app. Se faltar dado, diga exatamente qual dado está faltando.",
    "Diferencie obrigatoriamente: saldo disponível agora, projeção do mês, receitas futuras, faturas futuras, parcelas futuras, metas/projetos e investimentos.",
    "Nunca trate investimento ou caixa de corretora como dinheiro livre para gasto cotidiano, a menos que o usuário peça explicitamente para considerar resgate.",
    "Compra no cartão não reduz saldo de conta no dia da compra; ela aumenta obrigação futura na fatura. Pagamento da fatura reduz caixa.",
    "Não diga que o orçamento está apertado apenas porque o débito atual está baixo se a pergunta for sobre crédito; compare com fatura futura, projeção e margem de segurança.",
    "Não prometa rentabilidade, não dê recomendação de investimento como certeza e não incentive endividamento.",
    "Nunca peça senha, token, chave de API ou dados sensíveis.",
    `Modo solicitado: ${intent}.`,
    "Formato preferencial para respostas de compra: Veredito, Por quê, Condições para ser seguro, Risco principal e Próxima ação.",
    "Formato preferencial para orçamento: Diagnóstico, números usados, riscos, prioridades e plano simples."
  ].join("\n");
}

function getLLMConfig() {
  const apiKey = process.env.GROQ_API_KEY || process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";

  const configuredModel = process.env.GROQ_MODEL || process.env.LLM_MODEL;
  const deprecatedModels = new Set(["llama-3.1-70b-versatile", "llama3-70b-8192"]);

  const model = !configuredModel || deprecatedModels.has(configuredModel)
    ? "llama-3.3-70b-versatile"
    : configuredModel;

  return { apiKey, baseUrl, model };
}

function extractAiErrorMessage(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message || parsed?.message;

    if (typeof message === "string") {
      return message;
    }
  } catch {
    // mantém fallback abaixo
  }

  return raw;
}

export async function GET(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  const url = new URL(request.url);
  const month = url.searchParams.get("month") || undefined;
  const referenceDate = url.searchParams.get("referenceDate") || undefined;

  try {
    const [{ aiContext }, messages] = await Promise.all([
      buildCurrentFinancialContext(context.supabase, context.user.id, { month, referenceDate }),
      loadAiChatHistory(context.supabase, context.user.id)
    ]);

    return NextResponse.json({ data: messages, context: aiContext });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível carregar o consultor IA.", 500);
  }
}

export async function POST(request: Request) {
  const context = await getApiContext();

  if ("error" in context) return context.error;

  try {
    const payload = await parseJson(request, bodySchema);

    const { aiContext } = await buildCurrentFinancialContext(context.supabase, context.user.id, {
      month: payload.month,
      referenceDate: payload.referenceDate
    });

    const history = await loadAiChatHistory(context.supabase, context.user.id, 10);
    const { apiKey, baseUrl, model } = getLLMConfig();

    if (!apiKey) {
      return jsonError("GROQ_API_KEY ou LLM_API_KEY não configurada no servidor.", 500);
    }

    const requestContext = {
      ...aiContext,
      user_request: {
        intent: payload.intent || "general",
        scenario: payload.scenario || null
      }
    };

    const { error: userInsertError } = await context.supabase.from("ai_chat_messages").insert({
      owner_id: context.user.id,
      role: "user",
      content: payload.message,
      context: requestContext
    });

    if (userInsertError) return jsonError(userInsertError.message, 500);

    const messages = [
      { role: "system", content: systemPrompt(payload.intent || "general") },
      {
        role: "system",
        content: `Contexto financeiro consolidado do usuário em JSON:\n${JSON.stringify(requestContext, null, 2)}`
      },
      ...history
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => ({ role: item.role, content: item.content })),
      { role: "user", content: payload.message }
    ];

    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 1000,
        messages
      })
    });

    if (!response.ok) {
      const text = await response.text();
      const errorMessage = extractAiErrorMessage(text);

      return jsonError(
        `Não foi possível consultar a IA agora. Detalhe: ${errorMessage || "erro no provedor de IA."}`,
        502
      );
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "Não consegui gerar uma resposta agora.";

    const { error: assistantInsertError } = await context.supabase.from("ai_chat_messages").insert({
      owner_id: context.user.id,
      role: "assistant",
      content: answer,
      context: {
        model,
        intent: payload.intent || "general",
        scenario: payload.scenario || null,
        reference: aiContext.reference || null
      }
    });

    if (assistantInsertError) return jsonError(assistantInsertError.message, 500);

    const freshHistory = await loadAiChatHistory(context.supabase, context.user.id);

    return NextResponse.json({ ok: true, answer, data: freshHistory });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Não foi possível consultar a IA.", 500);
  }
}