# Etapa 11 — Consultor IA aprimorado + seletor de cor premium

Esta etapa parte da Etapa 10 e mantém o foco em duas melhorias específicas:

1. tornar o Consultor IA mais útil para decisões reais de compra, orçamento, risco e planejamento;
2. substituir campos manuais de cor hexadecimal por um seletor visual bonito e coerente com o tema premium/fintech do UltimatePlanner.

## O que foi alterado

### Consultor IA

- Nova interface de análise rápida de compra.
- Campo de valor, forma de pagamento, parcelas e prioridade.
- Modo de análise: geral, compra, orçamento, risco e planejamento.
- Perguntas rápidas com rótulo e descrição.
- Respostas renderizadas com melhor leitura por parágrafos.
- Leitura rápida de margem atual, margem projetada e nível de risco.
- Prompt de sistema mais rígido para não confundir crédito com débito.
- Contexto enviado à IA agora inclui `decision_support` e `user_request`.

### Regras de interpretação reforçadas para IA

O prompt agora reforça que:

- compra no cartão não reduz saldo de conta no dia da compra;
- pagamento da fatura reduz caixa;
- investimento e caixa de corretora não devem ser tratados como dinheiro livre;
- compra no crédito deve ser comparada com fatura futura e projeção;
- compra à vista deve ser comparada com saldo atual e obrigações abertas.

### Seletor visual de cores

Substituído o campo manual `#2563eb` por `ColorPickerField` em:

- contas;
- categorias;
- cartões;
- projetos;
- metas;
- corretoras de investimento.

O novo componente usa:

- `input type="color"` nativo;
- preview grande da cor;
- presets rápidos;
- botão para voltar ao padrão do tema;
- CSS premium com bordas, sombra leve e integração visual.

## Banco de dados

Não há migration nova nesta etapa.

As cores continuam sendo salvas nos mesmos campos já existentes:

- `accounts.color`
- `categories.color`
- `credit_cards.color`
- `projects.color`
- `goals.color`
- `investment_accounts.color`

## Arquivos principais

- `src/components/ui/color-picker-field.tsx`
- `src/components/accounts/accounts-client.tsx`
- `src/components/categories/categories-client.tsx`
- `src/components/cards/cards-client.tsx`
- `src/components/projects/projects-client.tsx`
- `src/components/goals/goals-client.tsx`
- `src/components/investments/investments-client.tsx`
- `src/components/ai/ai-consultant-client.tsx`
- `src/app/api/ai/chat/route.ts`
- `src/lib/domain/financial-insights.ts`
- `src/app/globals.css`

## Como testar

1. Abra `/accounts` e crie uma conta com cor.
2. Edite a conta e confirme se a cor permanece.
3. Repita em categorias, cartões, projetos, metas e corretoras.
4. Abra `/ai`.
5. Use o formulário "Analisar compra".
6. Teste compra no crédito e compra à vista.
7. Confirme se a IA diferencia saldo atual, fatura futura e projeção.
8. Teste perguntas rápidas de orçamento, risco e planejamento.

## Observação

Esta etapa não mexe em regras de saldo, faturas, parcelas, RLS ou schema. O foco foi experiência de uso e inteligência do consultor.
