# Etapa 1 — Contas, Categorias e Transações

## Análise do projeto original

O módulo original de contas renderiza cartões e tabela, usa saldo derivado por transações, cria/edita contas via modal e exclui por marcação lógica. O módulo original de transações suporta receita, despesa, transferência, ajuste, recorrências e parcelamento no débito. Nesta etapa foram migradas as partes fundamentais: contas, categorias e transações simples.

## Decisões técnicas

- Mantido o conceito de saldo derivado.
- Exclusão continua lógica (`is_deleted`), não exclusão física.
- RLS continua protegendo dados por `owner_id`.
- Regras de cálculo ficaram em `src/lib/domain/account-balances.ts` para serem reutilizadas por Dashboard, Contas e Transações.
- CRUD foi centralizado em Route Handlers para não deixar regra crítica apenas no front-end.

## Arquivos criados/alterados

Criados:

- `src/lib/supabase/env.ts`
- `src/lib/domain/app-types.ts`
- `src/lib/domain/formatters.ts`
- `src/lib/domain/account-balances.ts`
- `src/lib/http/api.ts`
- `src/app/api/accounts/route.ts`
- `src/app/api/categories/route.ts`
- `src/components/accounts/accounts-client.tsx`
- `src/components/categories/categories-client.tsx`
- `src/components/transactions/transactions-client.tsx`
- `src/app/(app)/categories/page.tsx`
- `supabase/migrations/0002_etapa_1_accounts_categories_transactions.sql`

Alterados:

- `.env.example`
- `README.md`
- `src/app/globals.css`
- `src/app/(app)/accounts/page.tsx`
- `src/app/(app)/transactions/page.tsx`
- `src/app/(app)/dashboard/page.tsx`
- `src/components/app-shell.tsx`
- `src/lib/supabase/browser.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/middleware.ts`
- `supabase/schema.sql`

## Limites desta etapa

Ainda não foram migrados de forma funcional:

- cartões;
- faturas;
- parcelas de crédito;
- parcelamento no débito completo;
- recorrências automáticas;
- metas/projetos com compartilhamento;
- investimentos;
- chat IA integrado ao contexto financeiro completo.

Eles continuam na estrutura do projeto e entram nas próximas etapas.
