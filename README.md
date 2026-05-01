# UltimatePlanner — Next.js + Supabase

Migração incremental do UltimatePlanner para uma aplicação web moderna com Next.js App Router, TypeScript, Supabase/Postgres, Supabase Auth e deploy na Vercel.

A regra principal continua sendo: mesma aplicação, mesmo comportamento, sem redesign global e sem remover funcionalidades.

## Etapas já incluídas

### Etapa 1

- Contas.
- Categorias.
- Transações básicas.
- Saldo derivado por transações.
- Exclusão lógica.

### Etapa 2

- Cartões.
- Faturas.
- Compras no cartão.
- Parcelas no crédito.
- Pagamento de fatura.
- Adiantamento, edição e exclusão de parcelas de cartão.

### Etapa 3

- Receitas recorrentes.
- Gastos recorrentes em conta.
- Gastos recorrentes em cartão.
- Materialização de lançamentos futuros.
- Exclusão de recorrência com limpeza de lançamentos futuros.
- Parcelamento no débito.
- Pagamento, adiantamento, edição e exclusão de parcelas no débito.

### Etapa 4

- Projetos com temas, ícones e capa.
- Itens planejados do projeto.
- Concluir/reabrir/editar/excluir itens.
- Caixa do projeto com aportes e retiradas.
- Analytics simples por categoria.
- Metas com alvo, acumulado, prazo e progresso.
- Aportes e retiradas em metas.
- Compartilhamento de projetos/metas com `viewer` e `editor`.
- Histórico de atividade com autor da ação.
- RLS ajustado para dono e participantes.

## Stack

- Next.js App Router
- TypeScript
- Supabase Auth
- Supabase/Postgres
- Supabase Client
- Vercel

## Variáveis de ambiente

Crie `.env.local` com:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
GROQ_MODEL=
```

Você pode usar `NEXT_PUBLIC_SUPABASE_ANON_KEY` ou `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. O projeto aceita os dois nomes para facilitar a tela atual do Supabase.

## Banco de dados

Se for começar do zero, rode no Supabase SQL Editor:

```txt
supabase/schema.sql
```

Se você já estava na Etapa 4, rode apenas:

```txt
supabase/migrations/0006_etapa_5_investments.sql
```

## Rodar localmente

```bash
npm install
npm run dev
```

Acesse:

```txt
http://localhost:3000/login
```

## Publicar na Vercel

1. Suba o projeto para o GitHub.
2. Importe na Vercel.
3. Configure as mesmas variáveis de ambiente.
4. Rode o SQL no Supabase.
5. Faça o deploy.
6. Teste login, RLS, transações, cartões, recorrências, projetos, metas, compartilhamento e investimentos.

### Etapa 5

- Investimentos reais conectados ao Supabase.
- Corretoras/contas de investimento.
- Caixa por corretora.
- Posições iniciais por ativo.
- Movimentações de aporte, retirada, compra, venda, provento, rendimento, taxa e ajuste.
- Atualização automática de caixa, quantidade e preço médio.
- Edição/exclusão com reversão do efeito financeiro.
- Distribuição por classe e corretora.
- Alocação alvo por classe ou ativo.
- Histórico de atividade.

## Próxima etapa recomendada

Etapa 6 — Consultor IA + dashboard consolidado com investimentos, projetos, metas, faturas e projeções.

## Etapa 6 — Dashboard consolidado + Consultor IA

Esta versão inclui a consolidação do Dashboard e a tela `/ai` do Consultor IA. O consultor usa dados reais do Supabase para montar contexto financeiro antes de chamar o modelo configurado por `GROQ_API_KEY` ou `LLM_API_KEY`.

Para rodar em desenvolvimento:

```bash
npm install
npm run dev
```

Para validar build:

```bash
npm run build
```

Não rode `npm audit fix --force` durante a migração, porque ele pode trocar versões principais de dependências e quebrar o projeto.

## Etapa 7 — UI/UX fiel + mobile

Esta versão melhora a camada visual e a navegação sem alterar regras financeiras ou banco de dados. Foram adicionados sidebar desktop, drawer mobile, navegação ativa, topbar com seção atual, rota inicial redirecionando para `/login`, `proxy.ts` para Next 16 e ajustes globais de responsividade inspirados no visual original do UltimatePlanner.

### Rodar a Etapa 7

```bash
npm install
npm run build
npm run dev
```

Acesse `http://localhost:3000`. A rota inicial redireciona para `/login`.


## Etapa 9 — revisão financeira

Esta versão adiciona uma camada central de regras financeiras em `src/lib/domain/financial-ledger.ts` e uma rota de auditoria em `/api/finance/audit`.

A principal correção conceitual é separar:

- **caixa**: receitas, despesas diretas e pagamentos de fatura;
- **competência do cartão**: compras que entram na fatura pelo fechamento;
- **fatura em aberto**: `total_amount - paid_amount`.

Isso evita dupla contagem entre compra no cartão e pagamento da fatura.

Não há migration nova nesta etapa.

## Etapa 10 — Segurança, RLS e compartilhamento

Esta versão endurece as regras de segurança do Supabase sem alterar design nem regras financeiras.

Principais mudanças:

- RLS reforçado para perfis, compartilhamentos, projetos, metas e históricos.
- Funções auxiliares para verificar acesso, edição e gerenciamento de itens compartilhados.
- Busca de perfis mais limitada para evitar listagem ampla de usuários.
- Triggers para impedir alteração de `owner_id` em updates.
- `/api/profiles` agora usa RPCs seguras em vez de listar todos os perfis diretamente.

Para aplicar no banco, rode:

```sql
supabase/migrations/0007_etapa_10_security_rls.sql
```

Depois teste com dois usuários diferentes: dono, participante `viewer` e participante `editor`.

## Etapa 11 — Consultor IA aprimorado + cores visuais

Esta versão adiciona uma experiência melhor para o Consultor IA e troca campos manuais de cor hexadecimal por um seletor visual premium em contas, categorias, cartões, projetos, metas e corretoras. Não há migration nova nesta etapa.

Para detalhes, veja `docs/etapa-11.md`.

## Etapa 12 — Categorias inteligentes, cores e CRUD

Esta versão inclui:

- categoria digitável com autosugestão;
- criação automática de categoria ao lançar uma compra/gasto/receita;
- tela de Categorias convertida em análise de gastos por categoria;
- aplicação real das cores em contas, cartões, categorias, projetos, metas e investimentos;
- fallback de perfis em Projetos/Metas para evitar tela quebrada quando a migration de segurança não foi rodada;
- rota `/api/health/crud` para diagnosticar tabelas/colunas do Supabase;
- migration `supabase/migrations/0008_etapa_12_crud_categories_colors.sql`.

Depois de copiar o `.env.local`, rode:

```bash
npm install
npm run build
npm run dev
```

Se projetos, metas ou investimentos falharem no Supabase, rode a migration `0008_etapa_12_crud_categories_colors.sql` no SQL Editor.
