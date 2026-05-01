-- Etapa 12: estabilização de CRUD, categorias inteligentes e colunas usadas pela UI.
-- Rode depois da Etapa 10/11 se projetos, metas ou investimentos estiverem falhando ao carregar/criar.

begin;

-- Colunas de soft delete e cor usadas pelo app.
alter table if exists public.accounts add column if not exists is_deleted boolean not null default false;
alter table if exists public.categories add column if not exists is_deleted boolean not null default false;
alter table if exists public.transactions add column if not exists is_deleted boolean not null default false;
alter table if exists public.credit_cards add column if not exists is_deleted boolean not null default false;
alter table if exists public.projects add column if not exists is_deleted boolean not null default false;
alter table if exists public.project_items add column if not exists is_deleted boolean not null default false;
alter table if exists public.project_movements add column if not exists is_deleted boolean not null default false;
alter table if exists public.goals add column if not exists is_deleted boolean not null default false;
alter table if exists public.goal_movements add column if not exists is_deleted boolean not null default false;
alter table if exists public.investment_accounts
  add column if not exists cash_balance numeric(14,2) not null default 0,
  add column if not exists color text,
  add column if not exists is_deleted boolean not null default false;
alter table if exists public.investments
  add column if not exists purchase_date date,
  add column if not exists is_deleted boolean not null default false;
alter table if exists public.investment_transactions
  add column if not exists fees numeric(14,2) not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists is_deleted boolean not null default false;

-- Tipos de transação esperados pelas telas atuais.
alter table if exists public.transactions drop constraint if exists transactions_type_check;
alter table if exists public.transactions
  add constraint transactions_type_check
  check (type in ('income','expense','transfer','adjust','card_expense','invoice_payment'));

alter table if exists public.investment_transactions drop constraint if exists investment_transactions_type_check;
alter table if exists public.investment_transactions
  add constraint investment_transactions_type_check
  check (type in ('buy','sell','deposit','withdraw','dividend','yield','fee','adjust'));

-- Alocação alvo de investimentos, caso a migration da Etapa 5 não tenha sido rodada.
create table if not exists public.investment_allocation_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  target_scope text not null check (target_scope in ('asset_type','asset')),
  target_key text not null,
  label text not null,
  target_percent numeric(5,2) not null default 0 check (target_percent >= 0 and target_percent <= 100),
  is_deleted boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.investment_allocation_targets enable row level security;
drop policy if exists "investment_allocation_targets_owner_all" on public.investment_allocation_targets;
create policy "investment_allocation_targets_owner_all" on public.investment_allocation_targets
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop trigger if exists investment_allocation_targets_set_updated_at on public.investment_allocation_targets;
create trigger investment_allocation_targets_set_updated_at
  before update on public.investment_allocation_targets
  for each row execute function public.set_updated_at();

-- Funções de permissão, caso a Etapa 10 não tenha sido aplicada por completo.
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

grant execute on function public.shared_item_owner(text, uuid) to authenticated;
grant execute on function public.can_access_shared_item(text, uuid) to authenticated;
grant execute on function public.can_edit_shared_item(text, uuid) to authenticated;
grant execute on function public.can_manage_shared_item(text, uuid) to authenticated;
grant execute on function public.visible_profiles_for_user() to authenticated;

-- Índices usados pelos CRUDs e telas analíticas.
create index if not exists idx_accounts_owner_deleted on public.accounts(owner_id, is_deleted);
create index if not exists idx_categories_owner_deleted on public.categories(owner_id, is_deleted);
create index if not exists idx_categories_owner_name_lower on public.categories(owner_id, lower(name));
create index if not exists idx_transactions_owner_deleted on public.transactions(owner_id, is_deleted);
create index if not exists idx_transactions_owner_category_date on public.transactions(owner_id, category_id, date desc) where is_deleted = false;
create index if not exists idx_projects_owner_deleted on public.projects(owner_id, is_deleted, status);
create index if not exists idx_project_items_project_deleted on public.project_items(project_id, is_deleted, status);
create index if not exists idx_project_movements_project_deleted on public.project_movements(project_id, is_deleted, created_at desc);
create index if not exists idx_goals_owner_deleted on public.goals(owner_id, is_deleted, status);
create index if not exists idx_goal_movements_goal_deleted on public.goal_movements(goal_id, is_deleted, created_at desc);
create index if not exists idx_investment_accounts_owner_deleted on public.investment_accounts(owner_id, is_deleted);
create index if not exists idx_investments_owner_account_deleted on public.investments(owner_id, investment_account_id, is_deleted);
create index if not exists idx_investment_transactions_owner_date_deleted on public.investment_transactions(owner_id, is_deleted, date desc);
create index if not exists idx_investment_allocation_targets_owner_deleted on public.investment_allocation_targets(owner_id, is_deleted, target_scope);

commit;

notify pgrst, 'reload schema';
