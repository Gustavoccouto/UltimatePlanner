# Etapa 6 — Dashboard consolidado + Consultor IA

Esta etapa consolida os dados migrados das etapas anteriores e adiciona uma área real para o Consultor IA.

## O que foi implementado

- Dashboard consolidado com contas, transações, faturas, parcelas, metas, projetos e investimentos.
- Filtro por mês e data de referência, permitindo analisar um dia específico do mês.
- Cards de saldo em contas, resultado do mês, faturas abertas e patrimônio total.
- Separação entre receitas, saídas, entradas planejadas, saídas planejadas, faturas e cartão.
- Lista de contas em destaque, próximas parcelas e movimentações recentes.
- Avisos de atenção ao caixa.
- Rota `/ai` para o Consultor IA.
- Histórico de mensagens em `ai_chat_messages`.
- Contexto financeiro consolidado enviado para a IA, com diferenciação entre caixa atual, receitas futuras, faturas, parcelas, investimentos, metas e projetos.
- Compatibilidade com `GROQ_API_KEY` ou `LLM_API_KEY` no servidor.

## Arquivos principais

```txt
src/app/(app)/dashboard/page.tsx
src/components/dashboard/dashboard-client.tsx
src/app/(app)/ai/page.tsx
src/components/ai/ai-consultant-client.tsx
src/app/api/ai/chat/route.ts
src/lib/server/financial-snapshot.ts
src/lib/domain/financial-insights.ts
src/app/globals.css
```

## Variáveis de ambiente opcionais para IA

```env
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
LLM_API_KEY=
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile
```

Use apenas uma chave real no `.env.local` ou nas variáveis da Vercel. Nunca coloque chave real no código.

## Correções incluídas

- Compatibilidade com Zod atual em `src/app/api/ai/chat/route.ts`.
- Tipagem explícita em rotas de projetos/metas para evitar erro de `implicit any` no build com TypeScript estrito.

## Como testar

1. Rodar `npm install`.
2. Rodar `npm run build` para validar TypeScript.
3. Rodar `npm run dev`.
4. Acessar `/dashboard`.
5. Alterar mês e data de referência.
6. Conferir se o dashboard responde aos dados cadastrados.
7. Acessar `/ai`.
8. Fazer uma pergunta como: “Posso comprar um teclado de R$300 no crédito?”
9. Confirmar se a resposta considera caixa atual, fatura futura e dados do app.
