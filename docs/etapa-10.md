# Etapa 10 — Segurança, RLS e compartilhamento

Esta etapa endurece as regras de segurança do Supabase sem alterar o visual, o fluxo principal do app ou as regras financeiras da Etapa 9.

## Objetivo

Garantir que:

- cada usuário leia e altere apenas seus próprios dados;
- projetos e metas compartilhados apareçam apenas para dono e participantes;
- `viewer` visualize, mas não edite;
- `editor` consiga movimentar/editar dentro do item compartilhado;
- somente o dono gerencie participantes;
- `owner_id` não possa ser trocado por update acidental ou malicioso;
- a listagem de perfis não exponha todos os usuários livremente.

## Arquivos alterados

- `supabase/migrations/0007_etapa_10_security_rls.sql`
- `supabase/schema.sql`
- `src/app/api/profiles/route.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/goals/route.ts`

## O que mudou no banco

A migration `0007_etapa_10_security_rls.sql` adiciona/reforça:

- funções de permissão:
  - `shared_item_owner(kind, target_id)`;
  - `owns_shared_item(kind, target_id)`;
  - `can_access_shared_item(kind, target_id)`;
  - `can_edit_shared_item(kind, target_id)`;
  - `can_manage_shared_item(kind, target_id)`;
- funções de perfil:
  - `visible_profiles_for_user()`;
  - `search_profiles_for_sharing(search_text)`;
- triggers para impedir alteração de `owner_id`;
- RLS habilitado nas tabelas principais;
- policies mais restritas para:
  - `profiles`;
  - `shared_items`;
  - `projects`;
  - `project_items`;
  - `project_movements`;
  - `goals`;
  - `goal_movements`;
  - `activity_logs`.

## O que mudou no app

A rota `/api/profiles` deixou de fazer `select` aberto em `profiles`.

Agora:

- sem busca, retorna apenas perfis visíveis/relacionados ao usuário;
- com `?q=texto`, usa uma função RPC limitada para buscar usuários por e-mail/nome;
- a busca exige pelo menos 2 caracteres;
- projetos e metas usam `visible_profiles_for_user()` para mostrar participantes relacionados.

## Como aplicar

Se você vem da Etapa 9, rode no Supabase SQL Editor:

```sql
supabase/migrations/0007_etapa_10_security_rls.sql
```

Depois aguarde alguns segundos e recarregue o app.

## Checklist de validação

- [ ] Usuário A cria conta, transação, cartão, projeto, meta e investimento.
- [ ] Usuário B não enxerga os dados privados de A.
- [ ] Usuário A compartilha um projeto com B como `viewer`.
- [ ] Usuário B enxerga o projeto, mas não consegue editar.
- [ ] Usuário A muda B para `editor`.
- [ ] Usuário B consegue adicionar item/movimento no projeto.
- [ ] Usuário B não consegue gerenciar participantes.
- [ ] Usuário A remove B do compartilhamento.
- [ ] Usuário B deixa de ver o projeto.
- [ ] Repetir o mesmo fluxo com metas.
- [ ] Testar `/api/profiles` sem busca e com busca.
- [ ] Confirmar que `owner_id` não é alterável por update.
