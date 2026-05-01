# Etapa 12 — Categorias inteligentes, cores aplicadas e estabilização de CRUD

## Objetivo

Esta etapa corrige três pontos importantes observados na Etapa 11:

1. Categorias não devem exigir cadastro prévio para cada gasto.
2. Cores escolhidas precisam aparecer visualmente nas telas.
3. Projetos, metas e investimentos precisam carregar com mensagens melhores e menor fragilidade quando alguma migration estiver faltando.

## Categorias inteligentes

Agora a categoria é digitada diretamente nos lançamentos, compras no cartão, recorrências e parcelamentos no débito.

O app:

- mostra sugestões com base nas categorias já usadas;
- cria automaticamente a categoria ao salvar, se ela ainda não existir;
- reutiliza categorias existentes por nome;
- mantém a página de Categorias como análise de gastos, não como etapa obrigatória de cadastro.

## Página de categorias

A tela de Categorias agora foca em análise:

- total categorizado por mês;
- categoria mais pesada;
- número de categorias usadas;
- distribuição por categoria;
- barras percentuais;
- gerenciamento manual opcional.

## Cores aplicadas

As cores agora aparecem em:

- cards de contas;
- chips e análise de categorias;
- cartões de crédito;
- lista e destaque de projetos;
- cards de metas e barra de progresso;
- corretoras e cards de investimentos.

## CRUD e diagnóstico

Foi adicionada a rota:

```txt
/api/health/crud
```

Ela verifica se as tabelas/colunas principais usadas pelos CRUDs estão acessíveis no Supabase.

## Supabase

Rode a migration nova se estiver vindo da Etapa 11:

```txt
supabase/migrations/0008_etapa_12_crud_categories_colors.sql
```

Ela garante colunas como `cash_balance`, `color`, `is_deleted`, funções de compartilhamento e tabela de alocação alvo de investimentos.

## Validação local

Foi executado:

```bash
npx tsc --noEmit --pretty false --incremental false --skipLibCheck
```

A checagem TypeScript passou. O build completo pode depender das variáveis reais do Supabase no ambiente local.
