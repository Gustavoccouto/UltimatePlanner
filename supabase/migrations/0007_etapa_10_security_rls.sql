-- Etapa 10: endurecimento de segurança, RLS e compartilhamento.
-- Rode esta migration depois da Etapa 9.
-- Objetivo: proteger dados por usuário, permitir compartilhamento controlado
-- de projetos/metas e reduzir exposição de perfis.

begin;

-- =========================================================
-- 1) Helpers de permissão para projetos/metas
-- =========================================================

create or replace function public.shared_item_owner(kind text, target_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when kind = 'project' then (select p.owner_id from public.projects p where p.id = target_id and coalesce(p.is_deleted, false) = false)
    when kind = 'goal' then (select g.owner_id from public.goals g where g.id = target_id and coalesce(g.is_deleted, false) = false)
    else null::uuid
  end;
$$;

create or replace function public.owns_shared_item(kind text, target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.shared_item_owner(kind, target_id) = auth.uid();
$$;

create or replace function public.can_access_shared_item(kind text, target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.shared_item_owner(kind, target_id) = auth.uid()
    or exists (
      select 1
      from public.shared_items s
      where s.item_type = kind
        and s.item_id = target_id
        and s.user_id = auth.uid()
    );
$$;

create or replace function public.can_edit_shared_item(kind text, target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.shared_item_owner(kind, target_id) = auth.uid()
    or exists (
      select 1
      from public.shared_items s
      where s.item_type = kind
        and s.item_id = target_id
        and s.user_id = auth.uid()
        and s.role = 'editor'
    );
$$;

create or replace function public.can_manage_shared_item(kind text, target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.shared_item_owner(kind, target_id) = auth.uid();
$$;

-- Perfis visíveis: o próprio usuário e usuários já relacionados por compartilhamento.
create or replace function public.visible_profiles_for_user()
returns table (
  id uuid,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.id, p.email, p.display_name, p.avatar_url, p.created_at, p.updated_at
  from public.profiles p
  where p.id = auth.uid()
     or exists (
       select 1
       from public.shared_items s
       where (s.owner_id = auth.uid() and s.user_id = p.id)
          or (s.user_id = auth.uid() and s.owner_id = p.id)
     )
  order by p.display_name nulls last, p.email nulls last;
$$;

-- Busca limitada para adicionar participantes.
-- Exige pelo menos 2 caracteres para evitar listagem ampla de usuários.
create or replace function public.search_profiles_for_sharing(search_text text)
returns table (
  id uuid,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.display_name, p.avatar_url, p.created_at, p.updated_at
  from public.profiles p
  where auth.uid() is not null
    and p.id <> auth.uid()
    and length(trim(coalesce(search_text, ''))) >= 2
    and (
      p.email ilike '%' || trim(search_text) || '%'
      or p.display_name ilike '%' || trim(search_text) || '%'
    )
  order by p.display_name nulls last, p.email nulls last
  limit 20;
$$;

grant execute on function public.shared_item_owner(text, uuid) to authenticated;
grant execute on function public.owns_shared_item(text, uuid) to authenticated;
grant execute on function public.can_access_shared_item(text, uuid) to authenticated;
grant execute on function public.can_edit_shared_item(text, uuid) to authenticated;
grant execute on function public.can_manage_shared_item(text, uuid) to authenticated;
grant execute on function public.visible_profiles_for_user() to authenticated;
grant execute on function public.search_profiles_for_sharing(text) to authenticated;

-- =========================================================
-- 2) Impede troca acidental/maliciosa de owner_id
-- =========================================================

create or replace function public.prevent_owner_id_change()
returns trigger
language plpgsql
as $$
begin
  if old.owner_id is distinct from new.owner_id then
    raise exception 'owner_id cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists accounts_prevent_owner_change on public.accounts;
create trigger accounts_prevent_owner_change before update on public.accounts for each row execute function public.prevent_owner_id_change();

drop trigger if exists categories_prevent_owner_change on public.categories;
create trigger categories_prevent_owner_change before update on public.categories for each row execute function public.prevent_owner_id_change();

drop trigger if exists transactions_prevent_owner_change on public.transactions;
create trigger transactions_prevent_owner_change before update on public.transactions for each row execute function public.prevent_owner_id_change();

drop trigger if exists credit_cards_prevent_owner_change on public.credit_cards;
create trigger credit_cards_prevent_owner_change before update on public.credit_cards for each row execute function public.prevent_owner_id_change();

drop trigger if exists invoices_prevent_owner_change on public.invoices;
create trigger invoices_prevent_owner_change before update on public.invoices for each row execute function public.prevent_owner_id_change();

drop trigger if exists recurring_rules_prevent_owner_change on public.recurring_rules;
create trigger recurring_rules_prevent_owner_change before update on public.recurring_rules for each row execute function public.prevent_owner_id_change();

drop trigger if exists installment_plans_prevent_owner_change on public.installment_plans;
create trigger installment_plans_prevent_owner_change before update on public.installment_plans for each row execute function public.prevent_owner_id_change();

drop trigger if exists installments_prevent_owner_change on public.installments;
create trigger installments_prevent_owner_change before update on public.installments for each row execute function public.prevent_owner_id_change();

drop trigger if exists projects_prevent_owner_change on public.projects;
create trigger projects_prevent_owner_change before update on public.projects for each row execute function public.prevent_owner_id_change();

drop trigger if exists project_items_prevent_owner_change on public.project_items;
create trigger project_items_prevent_owner_change before update on public.project_items for each row execute function public.prevent_owner_id_change();

drop trigger if exists project_movements_prevent_owner_change on public.project_movements;
create trigger project_movements_prevent_owner_change before update on public.project_movements for each row execute function public.prevent_owner_id_change();

drop trigger if exists goals_prevent_owner_change on public.goals;
create trigger goals_prevent_owner_change before update on public.goals for each row execute function public.prevent_owner_id_change();

drop trigger if exists goal_movements_prevent_owner_change on public.goal_movements;
create trigger goal_movements_prevent_owner_change before update on public.goal_movements for each row execute function public.prevent_owner_id_change();

drop trigger if exists investment_accounts_prevent_owner_change on public.investment_accounts;
create trigger investment_accounts_prevent_owner_change before update on public.investment_accounts for each row execute function public.prevent_owner_id_change();

drop trigger if exists investments_prevent_owner_change on public.investments;
create trigger investments_prevent_owner_change before update on public.investments for each row execute function public.prevent_owner_id_change();

drop trigger if exists investment_transactions_prevent_owner_change on public.investment_transactions;
create trigger investment_transactions_prevent_owner_change before update on public.investment_transactions for each row execute function public.prevent_owner_id_change();

drop trigger if exists activity_logs_prevent_owner_change on public.activity_logs;
create trigger activity_logs_prevent_owner_change before update on public.activity_logs for each row execute function public.prevent_owner_id_change();

drop trigger if exists ai_chat_messages_prevent_owner_change on public.ai_chat_messages;
create trigger ai_chat_messages_prevent_owner_change before update on public.ai_chat_messages for each row execute function public.prevent_owner_id_change();

-- =========================================================
-- 3) RLS habilitado nas tabelas usadas pelo app
-- =========================================================

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.credit_cards enable row level security;
alter table public.invoices enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.installment_plans enable row level security;
alter table public.installments enable row level security;
alter table public.transactions enable row level security;
alter table public.projects enable row level security;
alter table public.project_items enable row level security;
alter table public.project_movements enable row level security;
alter table public.goals enable row level security;
alter table public.goal_movements enable row level security;
alter table public.investment_accounts enable row level security;
alter table public.investments enable row level security;
alter table public.investment_transactions enable row level security;
alter table public.shared_items enable row level security;
alter table public.activity_logs enable row level security;
alter table public.ai_chat_messages enable row level security;

-- =========================================================
-- 4) Recriação segura de policies sensíveis
-- =========================================================

-- Profiles
-- Remove a policy antiga ampla, se existir.
drop policy if exists "profiles_select_authenticated" on public.profiles;
drop policy if exists "profiles_select_self_or_related" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_self_or_related" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.shared_items s
      where (s.owner_id = auth.uid() and s.user_id = profiles.id)
         or (s.user_id = auth.uid() and s.owner_id = profiles.id)
    )
  );

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Shared items
-- O dono gerencia, participante apenas visualiza o próprio vínculo.
drop policy if exists "shared_items_owner_or_user_select" on public.shared_items;
drop policy if exists "shared_items_owner_insert" on public.shared_items;
drop policy if exists "shared_items_owner_update" on public.shared_items;
drop policy if exists "shared_items_owner_delete" on public.shared_items;

create policy "shared_items_owner_or_user_select" on public.shared_items
  for select to authenticated
  using (owner_id = auth.uid() or user_id = auth.uid());

create policy "shared_items_owner_insert" on public.shared_items
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and user_id <> auth.uid()
    and public.can_manage_shared_item(item_type, item_id)
  );

create policy "shared_items_owner_update" on public.shared_items
  for update to authenticated
  using (owner_id = auth.uid() and public.can_manage_shared_item(item_type, item_id))
  with check (
    owner_id = auth.uid()
    and user_id <> auth.uid()
    and public.can_manage_shared_item(item_type, item_id)
  );

create policy "shared_items_owner_delete" on public.shared_items
  for delete to authenticated
  using (owner_id = auth.uid() and public.can_manage_shared_item(item_type, item_id));

-- Projects
drop policy if exists "projects_owner_or_shared_select" on public.projects;
drop policy if exists "projects_owner_insert" on public.projects;
drop policy if exists "projects_owner_update_delete" on public.projects;
drop policy if exists "projects_owner_delete" on public.projects;
drop policy if exists "projects_owner_or_editor_update" on public.projects;

create policy "projects_owner_or_shared_select" on public.projects
  for select to authenticated
  using (owner_id = auth.uid() or public.can_access_shared_item('project', id));

create policy "projects_owner_insert" on public.projects
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "projects_owner_or_editor_update" on public.projects
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', id))
  with check (owner_id = auth.uid() or public.can_edit_shared_item('project', id));

create policy "projects_owner_delete" on public.projects
  for delete to authenticated
  using (owner_id = auth.uid());

-- Project children
drop policy if exists "project_items_owner_or_shared_all" on public.project_items;
drop policy if exists "project_items_owner_or_editor_all" on public.project_items;
drop policy if exists "project_items_owner_or_shared_select" on public.project_items;
drop policy if exists "project_items_owner_or_editor_insert" on public.project_items;
drop policy if exists "project_items_owner_or_editor_update" on public.project_items;
drop policy if exists "project_items_owner_or_editor_delete" on public.project_items;

create policy "project_items_owner_or_shared_select" on public.project_items
  for select to authenticated
  using (owner_id = auth.uid() or public.can_access_shared_item('project', project_id));

create policy "project_items_owner_or_editor_insert" on public.project_items
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    or (
      public.can_edit_shared_item('project', project_id)
      and owner_id = public.shared_item_owner('project', project_id)
    )
  );

create policy "project_items_owner_or_editor_update" on public.project_items
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id))
  with check (
    owner_id = auth.uid()
    or (
      public.can_edit_shared_item('project', project_id)
      and owner_id = public.shared_item_owner('project', project_id)
    )
  );

create policy "project_items_owner_or_editor_delete" on public.project_items
  for delete to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));

-- Project movements
drop policy if exists "project_movements_owner_or_shared_all" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_all" on public.project_movements;
drop policy if exists "project_movements_owner_or_shared_select" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_insert" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_update" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_delete" on public.project_movements;

create policy "project_movements_owner_or_shared_select" on public.project_movements
  for select to authenticated
  using (owner_id = auth.uid() or public.can_access_shared_item('project', project_id));

create policy "project_movements_owner_or_editor_insert" on public.project_movements
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (
      owner_id = auth.uid()
      or (
        public.can_edit_shared_item('project', project_id)
        and owner_id = public.shared_item_owner('project', project_id)
      )
    )
  );

create policy "project_movements_owner_or_editor_update" on public.project_movements
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id))
  with check (
    actor_id = auth.uid()
    and (
      owner_id = auth.uid()
      or (
        public.can_edit_shared_item('project', project_id)
        and owner_id = public.shared_item_owner('project', project_id)
      )
    )
  );

create policy "project_movements_owner_or_editor_delete" on public.project_movements
  for delete to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));

-- Goals
drop policy if exists "goals_owner_or_shared_select" on public.goals;
drop policy if exists "goals_owner_insert" on public.goals;
drop policy if exists "goals_owner_update_delete" on public.goals;
drop policy if exists "goals_owner_delete" on public.goals;
drop policy if exists "goals_owner_or_editor_update" on public.goals;

create policy "goals_owner_or_shared_select" on public.goals
  for select to authenticated
  using (owner_id = auth.uid() or public.can_access_shared_item('goal', id));

create policy "goals_owner_insert" on public.goals
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy "goals_owner_or_editor_update" on public.goals
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('goal', id))
  with check (owner_id = auth.uid() or public.can_edit_shared_item('goal', id));

create policy "goals_owner_delete" on public.goals
  for delete to authenticated
  using (owner_id = auth.uid());

-- Goal movements
drop policy if exists "goal_movements_owner_or_shared_all" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_all" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_shared_select" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_insert" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_update" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_delete" on public.goal_movements;

create policy "goal_movements_owner_or_shared_select" on public.goal_movements
  for select to authenticated
  using (owner_id = auth.uid() or public.can_access_shared_item('goal', goal_id));

create policy "goal_movements_owner_or_editor_insert" on public.goal_movements
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and (
      owner_id = auth.uid()
      or (
        public.can_edit_shared_item('goal', goal_id)
        and owner_id = public.shared_item_owner('goal', goal_id)
      )
    )
  );

create policy "goal_movements_owner_or_editor_update" on public.goal_movements
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id))
  with check (
    actor_id = auth.uid()
    and (
      owner_id = auth.uid()
      or (
        public.can_edit_shared_item('goal', goal_id)
        and owner_id = public.shared_item_owner('goal', goal_id)
      )
    )
  );

create policy "goal_movements_owner_or_editor_delete" on public.goal_movements
  for delete to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id));

-- Activity logs
drop policy if exists "activity_logs_owner_select" on public.activity_logs;
drop policy if exists "activity_logs_owner_insert" on public.activity_logs;
drop policy if exists "activity_logs_owner_actor_or_shared_select" on public.activity_logs;
drop policy if exists "activity_logs_owner_actor_or_shared_insert" on public.activity_logs;
drop policy if exists "activity_logs_visible_to_related_users" on public.activity_logs;
drop policy if exists "activity_logs_insert_for_actor_or_owner" on public.activity_logs;

create policy "activity_logs_visible_to_related_users" on public.activity_logs
  for select to authenticated
  using (
    owner_id = auth.uid()
    or actor_id = auth.uid()
    or (
      entity_type in ('project','project_item','project_movement')
      and (
        public.can_access_shared_item('project', entity_id)
        or public.can_access_shared_item('project', nullif(metadata ->> 'project_id', '')::uuid)
      )
    )
    or (
      entity_type in ('goal','goal_movement')
      and (
        public.can_access_shared_item('goal', entity_id)
        or public.can_access_shared_item('goal', nullif(metadata ->> 'goal_id', '')::uuid)
      )
    )
  );

create policy "activity_logs_insert_for_actor_or_owner" on public.activity_logs
  for insert to authenticated
  with check (owner_id = auth.uid() or actor_id = auth.uid());

-- =========================================================
-- 5) Índices de segurança/permissão
-- =========================================================

create index if not exists idx_shared_items_owner_item_user on public.shared_items(owner_id, item_type, item_id, user_id);
create index if not exists idx_shared_items_user_item_role on public.shared_items(user_id, item_type, item_id, role);
create index if not exists idx_profiles_email_lower on public.profiles(lower(email));
create index if not exists idx_profiles_display_name_lower on public.profiles(lower(display_name));

commit;

notify pgrst, 'reload schema';
