# Etapa 9 — Revisão pesada das regras financeiras

Esta etapa não muda o design e não adiciona banco novo. O foco é reduzir risco de erro financeiro em saldo, fatura, parcelas, recorrências, projeção e dashboard.

## Principais correções

- Centralização das regras de saldo em `src/lib/domain/financial-ledger.ts`.
- Saldo de conta agora ignora compra no cartão até existir pagamento de fatura.
- Compra no cartão entra na competência da fatura, mas não reduz saldo da conta no dia da compra.
- Pagamento de fatura reduz caixa e não deve ser somado como se fosse uma nova compra de cartão.
- Dashboard separa visão de caixa e visão por competência para evitar dupla contagem.
- Faturas abertas agora consideram `invoices.total_amount - invoices.paid_amount`, permitindo leitura melhor de pagamento parcial.
- Exclusão de transação vinculada a cartão ou parcelamento recalcula faturas e reconcilia planos.
- Métricas de cartão aceitam faturas salvas, não apenas transações em aberto.
- Contexto enviado ao consultor IA deixa explícito o que é caixa, cartão, fatura e competência.

## Auditoria financeira

Nova rota:

```txt
/api/finance/audit
```

### Apenas auditar

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/finance/audit" -Method GET -WebSession $session
```

### Auditar e reparar o que for seguro

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/finance/audit" -Method POST -ContentType "application/json" -Body '{"repair":true}' -WebSession $session
```

O reparo seguro faz:

- recalcular faturas de meses/cartões tocados;
- reconciliar totais e status de planos de parcelamento.

Ele não inventa dados ausentes, não apaga histórico e não mexe em valores manuais de contas.

## Como testar

1. Criar conta com saldo inicial.
2. Criar receita lançada e confirmar aumento do saldo.
3. Criar despesa lançada e confirmar redução do saldo.
4. Criar transferência e confirmar origem menor/destino maior.
5. Criar ajuste de soma e subtração.
6. Criar compra no cartão e confirmar que o saldo da conta não muda no dia da compra.
7. Confirmar que a compra aparece na fatura correta conforme fechamento.
8. Pagar fatura e confirmar que o saldo da conta diminui.
9. Fazer pagamento parcial e confirmar que a fatura aberta diminui pelo pago.
10. Criar parcelamento no crédito e confirmar que cada parcela cai em uma competência diferente.
11. Adiantar parcela futura e confirmar que a competência muda.
12. Editar parcela e confirmar que a fatura antiga e a nova recalculam.
13. Excluir parcela e confirmar que o plano e a fatura recalculam.
14. Criar parcelamento no débito e confirmar que cada parcela afeta a conta na data correta.
15. Criar recorrência de receita, despesa em conta e despesa em cartão.
16. Excluir recorrência e confirmar que só lançamentos futuros somem.
17. Conferir dashboard por data de referência.
18. Rodar `/api/finance/audit` e verificar se não existem erros críticos.
