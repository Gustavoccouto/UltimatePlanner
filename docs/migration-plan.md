# Plano de migração do UltimatePlanner

## Objetivo
Migrar o UltimatePlanner para Next.js + Supabase sem transformar o app em outro produto. A migração deve preservar layout, cores, componentes, navegação, modais, mobile e comportamento financeiro.

## Estratégia recomendada

1. Congelar o comportamento atual
   - Gerar prints desktop/mobile de cada tela.
   - Exportar dados reais do Google Sheets/Apps Script.
   - Criar casos de teste para faturas, recorrências e parcelas.

2. Criar a base Next.js
   - App Router.
   - Supabase Auth.
   - Supabase/Postgres com RLS.
   - CSS legado copiado para `src/app/globals.css` ou `src/styles/legacy`.

3. Migrar persistência
   - Mapear stores antigas para tabelas relacionais.
   - Manter `legacy_id` e `metadata` durante a transição.
   - Validar totais antes e depois da migração.

4. Migrar módulos por ordem de dependência
   - Auth/perfil.
   - Contas/categorias.
   - Cartões/faturas.
   - Transações.
   - Recorrências.
   - Parcelamentos.
   - Dashboard.
   - Projetos/metas/compartilhamento.
   - Investimentos.
   - IA.

5. Remover Google Sheets gradualmente
   - Primeiro modo somente leitura comparativo.
   - Depois escrita dupla opcional por curto período.
   - Por fim Supabase como fonte única de verdade.

## Atenção especial

- Fatura deve respeitar data de compra, fechamento e vencimento do cartão.
- Parcela de crédito não pode somar o total inteiro na primeira fatura.
- Parcela antecipada deve entrar no mês em que foi antecipada.
- Recorrência cancelada deve apagar ocorrências futuras e preservar passado.
- Usuário participante deve acessar projetos/metas compartilhados, mas não gerenciar dono/participantes.
- A chave da IA deve ficar apenas no servidor.
