# Etapa 4 — Projetos, metas, compartilhamento e histórico

Esta etapa migra a base funcional de Projetos e Metas do UltimatePlanner para Next.js + Supabase, preservando a lógica central do app antigo:

- projetos com itens planejados;
- caixa/aportes por projeto;
- analytics simples por categoria;
- metas com valor alvo, valor atual e prazo;
- aportes e retiradas em metas;
- compartilhamento com participantes;
- histórico/audit log por ação relevante;
- permissão de dono x participante.

## O que foi implementado

### Projetos

- Criar, editar e arquivar projeto.
- Manter tema visual, ícone e capa.
- Criar, editar, concluir/reabrir e excluir item planejado.
- Calcular total estimado, concluído, caixa e progresso.
- Registrar aporte e retirada.
- Excluir movimentação.
- Analytics por categoria e por tipo de movimento.
- Histórico com ator da ação.
- Compartilhamento por usuário com papel `editor` ou `viewer`.

### Metas

- Criar, editar e arquivar meta.
- Valor alvo, valor atual inicial, categoria, prazo e observações.
- Registrar aporte e retirada.
- Progresso automático.
- Status automático para `completed` quando o valor atual atinge o alvo.
- Histórico com ator da ação.
- Compartilhamento por usuário com papel `editor` ou `viewer`.

### Segurança

- RLS ajustado para:
  - dono ver/editar seus próprios projetos/metas;
  - participante ver itens compartilhados;
  - participante `editor` editar projetos/metas, itens e movimentos;
  - participante `viewer` apenas visualizar;
  - apenas dono gerenciar compartilhamento.

## Arquivos principais

- `src/app/(app)/projects/page.tsx`
- `src/components/projects/projects-client.tsx`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/items/route.ts`
- `src/app/api/projects/movements/route.ts`
- `src/app/api/projects/sharing/route.ts`
- `src/app/(app)/goals/page.tsx`
- `src/components/goals/goals-client.tsx`
- `src/app/api/goals/route.ts`
- `src/app/api/goals/movements/route.ts`
- `src/app/api/goals/sharing/route.ts`
- `src/app/api/profiles/route.ts`
- `src/lib/server/collaboration.ts`
- `supabase/migrations/0005_etapa_4_projects_goals_sharing.sql`

## Como atualizar banco existente

Se você já rodou as etapas anteriores, execute no SQL Editor do Supabase:

```sql
-- arquivo: supabase/migrations/0005_etapa_4_projects_goals_sharing.sql
```

Se estiver criando o projeto do zero, rode direto:

```sql
-- arquivo: supabase/schema.sql
```

## Checklist específico

1. Criar dois usuários no Supabase Auth.
2. Logar com o usuário principal.
3. Criar projeto.
4. Criar itens planejados.
5. Marcar item como concluído e reabrir.
6. Adicionar aporte no projeto.
7. Adicionar retirada no projeto.
8. Ver analytics e histórico.
9. Compartilhar projeto com segundo usuário como `viewer`.
10. Confirmar que `viewer` visualiza, mas não deve editar.
11. Alterar compartilhamento para `editor`.
12. Confirmar que `editor` consegue editar/adicionar item/movimento.
13. Remover compartilhamento.
14. Confirmar que o segundo usuário deixa de ver o projeto.
15. Repetir o fluxo com metas.
