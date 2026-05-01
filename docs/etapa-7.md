# Etapa 7 — UI/UX fiel + mobile

Esta etapa é visual e estrutural de navegação. Não altera regras financeiras, banco de dados, Route Handlers, cálculos de fatura, parcelamento, recorrência, projetos, metas, investimentos ou Consultor IA.

## Referência do projeto original

O UltimatePlanner original descreve uma interface minimalista, moderna, com predominância de branco, cartões com estética fintech, uso leve de glassmorphism e responsividade desktop/mobile. A etapa usa essa identidade como direção visual para aproximar a base Next.js do app antigo sem fazer redesign de produto.

## O que foi implementado

- Shell premium com sidebar em desktop.
- Navegação ativa por rota.
- Ícones textuais simples para não adicionar dependências.
- Topbar com seção atual, status online e saída da conta.
- Drawer mobile com backdrop, safe-area e fechamento automático ao navegar.
- Rota inicial `/` redirecionando para `/login`.
- Troca de `middleware.ts` para `proxy.ts`, compatível com Next 16.
- Login com layout mais próximo de landing/modal premium, sem alterar autenticação.
- Paleta ajustada para verde/emerald do app original.
- Cards, painéis, botões, badges, inputs e modais com glassmorphism leve.
- Responsividade global mais segura para grids, tabelas, cards, modais e chat.
- `.env.example`, `.gitignore`, `eslint.config.mjs` e scripts estabilizados.

## Arquivos alterados

- `src/components/app-shell.tsx`
- `src/app/(auth)/login/page.tsx`
- `src/app/(app)/layout.tsx`
- `src/app/page.tsx`
- `src/proxy.ts`
- `src/app/globals.css`
- `.env.example`
- `.gitignore`
- `eslint.config.mjs`
- `package.json`
- `README.md`
- `docs/tree.txt`
- `docs/etapa-7.md`

## Como testar

1. Rodar `npm install`.
2. Criar/copiar `.env.local`.
3. Rodar `npm run build`.
4. Rodar `npm run dev`.
5. Acessar `/` e confirmar redirecionamento para `/login`.
6. Entrar e navegar por todas as telas.
7. Reduzir a largura do navegador para testar o drawer mobile.
8. Confirmar que tabelas fazem scroll horizontal em telas pequenas.
9. Confirmar que modais continuam utilizáveis no mobile.
10. Confirmar que sair da conta volta para `/login`.

## O que não foi mexido

- SQL/Supabase.
- RLS.
- Serviços financeiros.
- APIs de contas, transações, cartões, recorrências, projetos, metas, investimentos e IA.
- Modelagem de dados.
