# Etapa 5 — Investimentos, corretoras, posições, movimentações e alocação

Esta etapa migra o módulo de investimentos para uma tela real em Next.js/Supabase, preservando a lógica do app original: separar corretoras, posições, caixa, movimentações, proventos/rendimentos e planejamento de alocação.

## O que foi implementado

- Tela real de Investimentos conectada ao Supabase.
- Corretoras/contas de investimento.
- Caixa por corretora.
- Posições iniciais por ativo.
- Tipos de ativo: ações, ETFs, FIIs, renda fixa, cripto, fundos, poupança e outros.
- Movimentações: aporte, retirada, compra, venda, dividendo/provento, rendimento, taxa e ajuste manual.
- Atualização automática de caixa da corretora.
- Atualização automática de quantidade e preço médio em compras/vendas.
- Edição e exclusão lógica de corretoras, ativos e movimentações.
- Reversão do efeito financeiro ao editar/excluir movimentação.
- Distribuição por tipo de ativo.
- Distribuição por corretora.
- Planejamento de alocação alvo por classe ou ativo.
- Histórico de atividade.

## Banco de dados

Se já veio da Etapa 4, rode:

```txt
supabase/migrations/0006_etapa_5_investments.sql
```

Se for criar do zero, rode:

```txt
supabase/schema.sql
```

## Arquivos principais

```txt
src/app/(app)/investments/page.tsx
src/components/investments/investments-client.tsx
src/app/api/investments/route.ts
src/app/api/investments/accounts/route.ts
src/app/api/investments/assets/route.ts
src/app/api/investments/transactions/route.ts
src/app/api/investments/allocation-targets/route.ts
src/lib/domain/investments.ts
src/lib/server/investments.ts
supabase/migrations/0006_etapa_5_investments.sql
```

## Como testar

1. Criar uma corretora.
2. Informar caixa inicial da corretora.
3. Criar uma posição inicial.
4. Registrar aporte na corretora.
5. Registrar compra de ativo.
6. Confirmar redução do caixa.
7. Confirmar aumento da quantidade do ativo.
8. Registrar venda.
9. Confirmar aumento do caixa e redução da posição.
10. Registrar dividendo/provento.
11. Registrar taxa.
12. Editar uma movimentação e confirmar reversão/reaplicação.
13. Excluir uma movimentação e confirmar reversão do efeito.
14. Criar alocação alvo por tipo de ativo.
15. Criar alocação alvo por ativo específico.
16. Conferir distribuição por classe e corretora.
17. Conferir responsividade no mobile.
