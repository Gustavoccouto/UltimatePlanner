# Etapa 2 — Cartões, faturas e parcelas de crédito

Esta etapa migra o módulo de cartões para Next.js + Supabase mantendo o comportamento do app original: cartões com limite, fechamento, vencimento, compras no crédito, parcelas por competência de fatura, pagamento de fatura e ações individuais nas parcelas.

## O que foi implementado

- Tela real de Cartões conectada ao Supabase.
- CRUD de cartões com exclusão lógica (`is_deleted`).
- Nova compra no cartão.
- Modo de valor total ou valor por parcela.
- Criação de `installment_plans`, `installments` e `transactions` do tipo `card_expense`.
- Competência de fatura calculada por data da compra e dia de fechamento do cartão.
- Faturas em `invoices` recalculadas a partir dos lançamentos do cartão.
- Pagamento de fatura com saída na conta (`invoice_payment`).
- Confirmação quando o pagamento pode deixar a conta negativa.
- Expansão/recolhimento de planos de parcelamento.
- Pagar parcela individual.
- Adiantar parcela para a competência selecionada.
- Editar parcela individual.
- Excluir parcela individual.
- Projeção das próximas faturas por cartão.

## Arquivos principais

- `src/app/(app)/cards/page.tsx`
- `src/components/cards/cards-client.tsx`
- `src/app/api/cards/route.ts`
- `src/app/api/cards/purchases/route.ts`
- `src/app/api/cards/invoice-payments/route.ts`
- `src/app/api/cards/installments/route.ts`
- `src/lib/domain/card-ledger.ts`
- `src/lib/server/card-ledger.ts`
- `supabase/migrations/0003_etapa_2_cards_invoices_installments.sql`

## Banco de dados

Se você já rodou as etapas anteriores, rode no SQL Editor do Supabase:

```sql
supabase/migrations/0003_etapa_2_cards_invoices_installments.sql
```

Se ainda não criou o banco, rode o `supabase/schema.sql` atualizado.

## Observações de fidelidade

O app antigo criava uma transação por parcela do cartão e usava a competência da fatura para decidir em qual mês ela entra. Esta etapa preserva essa ideia, mas troca a persistência local/Google Sheets por Supabase.

A regra importante corrigida aqui é que a compra parcelada não entra inteira no primeiro mês: cada parcela é distribuída em sua competência própria.
