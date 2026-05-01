# Etapa 3 — Recorrências + Parcelamento no Débito

Esta etapa migra para Next.js/Supabase os fluxos do módulo `transactions.js` ligados a automação financeira:

- receitas recorrentes;
- gastos recorrentes em conta;
- gastos recorrentes em cartão;
- materialização de lançamentos futuros;
- exclusão de recorrência removendo lançamentos futuros;
- parcelamento no débito;
- expansão/recolhimento dos parcelamentos;
- pagamento, adiantamento, edição e exclusão de parcelas individuais.

## Arquivos principais

- `src/components/transactions/transactions-client.tsx`
- `src/app/(app)/transactions/page.tsx`
- `src/app/api/recurring-rules/route.ts`
- `src/app/api/debit-installments/route.ts`
- `src/app/api/debit-installments/installments/route.ts`
- `src/lib/domain/planning.ts`
- `src/lib/server/planning.ts`
- `src/lib/server/card-ledger.ts`
- `supabase/migrations/0004_etapa_3_recorrencias_debito.sql`

## Comportamento preservado

O app antigo já tinha, dentro da área de transações, botões para nova transação, receita recorrente, gasto recorrente e parcelamento no débito. A tela também exibia uma tabela de histórico, regras recorrentes e cartões de parcelamentos com expansão de parcelas.

Nesta versão, as regras recorrentes são salvas em `recurring_rules` e geram transações futuras em `transactions`, com `recurring_rule_id` e `recurrence_key`. Isso impede duplicidade e permite que dashboard, histórico e saldos/projeções leiam os lançamentos como dados reais do banco.

Quando uma recorrência é excluída, a regra é desativada e os lançamentos futuros gerados por ela são cancelados. Lançamentos passados permanecem para preservar histórico.

## Parcelamento no débito

O parcelamento no débito cria:

- um registro em `installment_plans` com `payment_method = 'debit'`;
- parcelas em `installments`;
- transações do tipo `expense` em `transactions`, uma para cada parcela.

Cada parcela pode ser:

- marcada como paga;
- adiantada para hoje;
- editada individualmente;
- excluída individualmente.

Também é possível excluir o parcelamento inteiro, cancelando todas as transações e parcelas vinculadas.

## SQL necessário

Se você já aplicou as etapas anteriores, rode no Supabase SQL Editor:

```sql
-- arquivo: supabase/migrations/0004_etapa_3_recorrencias_debito.sql
```

Se está começando do zero, basta rodar o `supabase/schema.sql` completo.

## Testes mínimos da etapa

1. Criar uma receita recorrente mensal.
2. Verificar se os lançamentos aparecem no histórico dos meses futuros.
3. Criar um gasto recorrente em conta.
4. Criar um gasto recorrente em cartão e verificar a fatura correspondente.
5. Editar uma recorrência e confirmar que lançamentos futuros são recalculados.
6. Excluir uma recorrência e confirmar que lançamentos futuros somem, mas passados permanecem.
7. Criar um parcelamento no débito por valor total.
8. Criar um parcelamento no débito por valor de cada parcela.
9. Expandir o parcelamento e ver parcelas individuais.
10. Marcar parcela como paga.
11. Adiantar parcela futura.
12. Editar parcela individual.
13. Excluir parcela individual.
14. Excluir parcelamento inteiro.
