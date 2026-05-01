create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  legacy_id text,
  name text not null,
  institution text,
  type text not null default 'checking',
  initial_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  color text,
  icon text,
  is_archived boolean not null default false,
  is_deleted boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  legacy_id text,
  name text not null,
  type text not null check (type in ('income','expense','transfer','investment','project','goal','card')),
  color text,
  icon text,
  is_archived boolean not null default false,
  is_deleted boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  legacy_id text,
  name text not null,
  brand text,
  limit_amount numeric(14,2) not null default 0,
  closing_day int not null check (closing_day between 1 and 31),
  due_day int not null check (due_day between 1 and 31),
  color text,
  is_archived boolean not null default false,
  is_deleted boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards(id) on delete cascade,
  billing_month date not null,
  closing_date date,
  due_date date,
  total_amount numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('open','closed','paid','canceled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (credit_card_id, billing_month)
);

create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  legacy_id text,
  name text not null,
  rule_type text not null check (rule_type in ('recurring_income','recurring_expense')),
  target_type text not null check (target_type in ('account','card')),
  account_id uuid references public.accounts(id) on delete set null,
  credit_card_id uuid references public.credit_cards(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  amount numeric(14,2) not null,
  frequency text not null default 'monthly' check (frequency in ('weekly','monthly','quarterly','yearly')),
  start_date date not null,
  end_date date,
  next_occurrence date,
  notes text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  legacy_id text,
  description text not null,
  total_amount numeric(14,2) not null,
  installments_count int not null check (installments_count > 0),
  remaining_installments int not null default 0,
  payment_method text not null check (payment_method in ('debit','credit_card')),
  account_id uuid references public.accounts(id) on delete set null,
  credit_card_id uuid references public.credit_cards(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  first_date date not null,
  status text not null default 'active' check (status in ('active','settled','canceled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  installment_plan_id uuid not null references public.installment_plans(id) on delete cascade,
  installment_number int not null,
  installments_count int not null,
  description text not null,
  amount numeric(14,2) not null,
  due_date date not null,
  billing_month date,
  account_id uuid references public.accounts(id) on delete set null,
  credit_card_id uuid references public.credit_cards(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  transaction_id uuid,
  status text not null default 'pending' check (status in ('pending','paid','anticipated','canceled')),
  anticipated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installment_plan_id, installment_number)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  legacy_id text,
  description text not null,
  type text not null check (type in ('income','expense','transfer','adjust','card_expense','invoice_payment')),
  amount numeric(14,2) not null check (amount >= 0),
  date date not null,
  billing_month date,
  account_id uuid references public.accounts(id) on delete set null,
  destination_account_id uuid references public.accounts(id) on delete set null,
  credit_card_id uuid references public.credit_cards(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  recurring_rule_id uuid references public.recurring_rules(id) on delete set null,
  installment_plan_id uuid references public.installment_plans(id) on delete set null,
  installment_id uuid references public.installments(id) on delete set null,
  recurrence_key text,
  status text not null default 'posted' check (status in ('planned','posted','canceled')),
  is_paid boolean not null default false,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.installments
  drop constraint if exists installments_transaction_id_fkey;
alter table public.installments
  add constraint installments_transaction_id_fkey foreign key (transaction_id) references public.transactions(id) on delete set null;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  legacy_id text,
  name text not null,
  description text,
  target_amount numeric(14,2) not null default 0,
  current_amount numeric(14,2) not null default 0,
  status text not null default 'active' check (status in ('active','completed','archived','canceled')),
  color text,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  legacy_id text,
  name text not null,
  amount numeric(14,2) not null default 0,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('add','remove','adjust')),
  amount numeric(14,2) not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  legacy_id text,
  name text not null,
  description text,
  target_amount numeric(14,2) not null default 0,
  current_amount numeric(14,2) not null default 0,
  due_date date,
  status text not null default 'active' check (status in ('active','completed','archived','canceled')),
  color text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goal_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid not null references public.goals(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('add','remove','adjust')),
  amount numeric(14,2) not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.investment_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  legacy_id text,
  name text not null,
  institution text,
  type text not null default 'brokerage',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  investment_account_id uuid references public.investment_accounts(id) on delete set null,
  legacy_id text,
  name text not null,
  ticker text,
  asset_type text not null default 'other',
  quantity numeric(18,8) not null default 0,
  average_price numeric(14,2) not null default 0,
  current_price numeric(14,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  investment_id uuid references public.investments(id) on delete cascade,
  investment_account_id uuid references public.investment_accounts(id) on delete set null,
  type text not null check (type in ('buy','sell','deposit','withdraw','dividend','adjust')),
  amount numeric(14,2) not null,
  quantity numeric(18,8),
  unit_price numeric(14,2),
  date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.shared_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_type text not null check (item_type in ('project','goal')),
  item_id uuid not null,
  role text not null default 'editor' check (role in ('viewer','editor')),
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action_type text not null,
  field_name text,
  previous_value jsonb,
  new_value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_owner_date on public.transactions(owner_id, date desc);
create unique index if not exists idx_accounts_owner_legacy on public.accounts(owner_id, legacy_id);
create unique index if not exists idx_categories_owner_legacy on public.categories(owner_id, legacy_id);
create unique index if not exists idx_credit_cards_owner_legacy on public.credit_cards(owner_id, legacy_id);
create unique index if not exists idx_recurring_rules_owner_legacy on public.recurring_rules(owner_id, legacy_id);
create unique index if not exists idx_installment_plans_owner_legacy on public.installment_plans(owner_id, legacy_id);
create unique index if not exists idx_transactions_owner_legacy on public.transactions(owner_id, legacy_id);
create unique index if not exists idx_projects_owner_legacy on public.projects(owner_id, legacy_id);
create unique index if not exists idx_project_items_owner_legacy on public.project_items(owner_id, legacy_id);
create unique index if not exists idx_goals_owner_legacy on public.goals(owner_id, legacy_id);
create unique index if not exists idx_investment_accounts_owner_legacy on public.investment_accounts(owner_id, legacy_id);
create unique index if not exists idx_investments_owner_legacy on public.investments(owner_id, legacy_id);
create index if not exists idx_transactions_card_billing on public.transactions(credit_card_id, billing_month);
create index if not exists idx_installments_owner_due on public.installments(owner_id, due_date);
create index if not exists idx_shared_items_user on public.shared_items(user_id, item_type, item_id);

create or replace function public.can_access_shared_item(kind text, target_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shared_items si
    where si.item_type = kind and si.item_id = target_id and si.user_id = auth.uid()
  );
$$;

create or replace function public.owns_shared_item(kind text, target_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when kind = 'project' then exists (select 1 from public.projects p where p.id = target_id and p.owner_id = auth.uid())
    when kind = 'goal' then exists (select 1 from public.goals g where g.id = target_id and g.owner_id = auth.uid())
    else false
  end;
$$;

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

create policy "profiles_select_authenticated" on public.profiles for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "accounts_owner_all" on public.accounts for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "categories_owner_all" on public.categories for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "credit_cards_owner_all" on public.credit_cards for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "invoices_owner_all" on public.invoices for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "recurring_rules_owner_all" on public.recurring_rules for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "installment_plans_owner_all" on public.installment_plans for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "installments_owner_all" on public.installments for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "transactions_owner_all" on public.transactions for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "investment_accounts_owner_all" on public.investment_accounts for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "investments_owner_all" on public.investments for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "investment_transactions_owner_all" on public.investment_transactions for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "activity_logs_owner_select" on public.activity_logs for select to authenticated using (owner_id = auth.uid() or actor_id = auth.uid());
create policy "activity_logs_owner_insert" on public.activity_logs for insert to authenticated with check (owner_id = auth.uid() or actor_id = auth.uid());
create policy "ai_chat_messages_owner_all" on public.ai_chat_messages for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "projects_owner_or_shared_select" on public.projects for select to authenticated using (owner_id = auth.uid() or public.can_access_shared_item('project', id));
create policy "projects_owner_insert" on public.projects for insert to authenticated with check (owner_id = auth.uid());
create policy "projects_owner_update_delete" on public.projects for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "projects_owner_delete" on public.projects for delete to authenticated using (owner_id = auth.uid());

create policy "project_items_owner_or_shared_all" on public.project_items for all to authenticated using (owner_id = auth.uid() or public.can_access_shared_item('project', project_id)) with check (owner_id = auth.uid() or public.can_access_shared_item('project', project_id));
create policy "project_movements_owner_or_shared_all" on public.project_movements for all to authenticated using (owner_id = auth.uid() or public.can_access_shared_item('project', project_id)) with check (owner_id = auth.uid() or public.can_access_shared_item('project', project_id));

create policy "goals_owner_or_shared_select" on public.goals for select to authenticated using (owner_id = auth.uid() or public.can_access_shared_item('goal', id));
create policy "goals_owner_insert" on public.goals for insert to authenticated with check (owner_id = auth.uid());
create policy "goals_owner_update_delete" on public.goals for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "goals_owner_delete" on public.goals for delete to authenticated using (owner_id = auth.uid());
create policy "goal_movements_owner_or_shared_all" on public.goal_movements for all to authenticated using (owner_id = auth.uid() or public.can_access_shared_item('goal', goal_id)) with check (owner_id = auth.uid() or public.can_access_shared_item('goal', goal_id));

create policy "shared_items_owner_or_user_select" on public.shared_items for select to authenticated using (owner_id = auth.uid() or user_id = auth.uid());
create policy "shared_items_owner_insert" on public.shared_items for insert to authenticated with check (owner_id = auth.uid() and public.owns_shared_item(item_type, item_id));
create policy "shared_items_owner_delete" on public.shared_items for delete to authenticated using (owner_id = auth.uid() and public.owns_shared_item(item_type, item_id));

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger credit_cards_set_updated_at before update on public.credit_cards for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices for each row execute function public.set_updated_at();
create trigger recurring_rules_set_updated_at before update on public.recurring_rules for each row execute function public.set_updated_at();
create trigger installment_plans_set_updated_at before update on public.installment_plans for each row execute function public.set_updated_at();
create trigger installments_set_updated_at before update on public.installments for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions for each row execute function public.set_updated_at();
create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger project_items_set_updated_at before update on public.project_items for each row execute function public.set_updated_at();
create trigger goals_set_updated_at before update on public.goals for each row execute function public.set_updated_at();
create trigger investment_accounts_set_updated_at before update on public.investment_accounts for each row execute function public.set_updated_at();
create trigger investments_set_updated_at before update on public.investments for each row execute function public.set_updated_at();

-- Etapa 2 indexes
create index if not exists idx_credit_cards_owner_deleted on public.credit_cards(owner_id, is_deleted, is_archived);
create index if not exists idx_invoices_owner_card_month on public.invoices(owner_id, credit_card_id, billing_month);
create index if not exists idx_installment_plans_owner_method on public.installment_plans(owner_id, payment_method, status);
create index if not exists idx_installments_owner_plan on public.installments(owner_id, installment_plan_id, status);
create index if not exists idx_transactions_owner_card_invoice on public.transactions(owner_id, credit_card_id, billing_month, type, is_deleted, is_paid);

-- Etapa 3: índices adicionais de recorrências e parcelamentos no débito.
create unique index if not exists idx_transactions_owner_recurrence_key_active
  on public.transactions(owner_id, recurrence_key)
  where recurrence_key is not null and is_deleted = false;

create index if not exists idx_recurring_rules_owner_active_next
  on public.recurring_rules(owner_id, is_active, next_occurrence);

create index if not exists idx_transactions_owner_recurring_date
  on public.transactions(owner_id, recurring_rule_id, date)
  where recurring_rule_id is not null;

create index if not exists idx_installment_plans_owner_method_status
  on public.installment_plans(owner_id, payment_method, status);

create index if not exists idx_installments_owner_debit_due
  on public.installments(owner_id, due_date)
  where credit_card_id is null;
-- Etapa 4: projetos, metas, compartilhamento e histórico.

alter table public.projects add column if not exists is_deleted boolean not null default false;
alter table public.project_items add column if not exists is_deleted boolean not null default false;
alter table public.project_movements add column if not exists is_deleted boolean not null default false;
alter table public.goals add column if not exists is_deleted boolean not null default false;
alter table public.goal_movements add column if not exists is_deleted boolean not null default false;

create or replace function public.can_edit_shared_item(kind text, target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_items s
    where s.user_id = auth.uid()
      and s.item_type = kind
      and s.item_id = target_id
      and s.role = 'editor'
  );
$$;

-- Remove políticas antigas e também as novas, para a migration poder ser rodada mais de uma vez.
drop policy if exists "projects_owner_update_delete" on public.projects;
drop policy if exists "projects_owner_delete" on public.projects;
drop policy if exists "projects_owner_or_editor_update" on public.projects;
drop policy if exists "projects_owner_or_editor_delete" on public.projects;

drop policy if exists "project_items_owner_or_shared_all" on public.project_items;
drop policy if exists "project_items_owner_or_editor_all" on public.project_items;
drop policy if exists "project_items_owner_or_shared_select" on public.project_items;
drop policy if exists "project_items_owner_or_editor_insert" on public.project_items;
drop policy if exists "project_items_owner_or_editor_update" on public.project_items;
drop policy if exists "project_items_owner_or_editor_delete" on public.project_items;

drop policy if exists "project_movements_owner_or_shared_all" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_all" on public.project_movements;
drop policy if exists "project_movements_owner_or_shared_select" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_insert" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_update" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_delete" on public.project_movements;

drop policy if exists "goals_owner_update_delete" on public.goals;
drop policy if exists "goals_owner_delete" on public.goals;
drop policy if exists "goals_owner_or_editor_update" on public.goals;
drop policy if exists "goals_owner_or_editor_delete" on public.goals;

drop policy if exists "goal_movements_owner_or_shared_all" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_all" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_shared_select" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_insert" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_update" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_delete" on public.goal_movements;

drop policy if exists "activity_logs_owner_select" on public.activity_logs;
drop policy if exists "activity_logs_owner_insert" on public.activity_logs;
drop policy if exists "activity_logs_owner_actor_or_shared_select" on public.activity_logs;
drop policy if exists "activity_logs_owner_actor_or_shared_insert" on public.activity_logs;
drop policy if exists "activity_logs_visible_to_related_users" on public.activity_logs;
drop policy if exists "activity_logs_insert_for_actor_or_owner" on public.activity_logs;

create policy "projects_owner_or_editor_update" on public.projects
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', id))
  with check (owner_id = auth.uid() or public.can_edit_shared_item('project', id));
create policy "projects_owner_delete" on public.projects
  for delete to authenticated
  using (owner_id = auth.uid());

create policy "project_items_owner_or_shared_select" on public.project_items
  for select to authenticated
  using (owner_id = auth.uid() or public.can_access_shared_item('project', project_id));
create policy "project_items_owner_or_editor_insert" on public.project_items
  for insert to authenticated
  with check (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));
create policy "project_items_owner_or_editor_update" on public.project_items
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id))
  with check (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));
create policy "project_items_owner_or_editor_delete" on public.project_items
  for delete to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));

create policy "project_movements_owner_or_shared_select" on public.project_movements
  for select to authenticated
  using (owner_id = auth.uid() or public.can_access_shared_item('project', project_id));
create policy "project_movements_owner_or_editor_insert" on public.project_movements
  for insert to authenticated
  with check (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));
create policy "project_movements_owner_or_editor_update" on public.project_movements
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id))
  with check (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));
create policy "project_movements_owner_or_editor_delete" on public.project_movements
  for delete to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));

create policy "goals_owner_or_editor_update" on public.goals
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('goal', id))
  with check (owner_id = auth.uid() or public.can_edit_shared_item('goal', id));
create policy "goals_owner_delete" on public.goals
  for delete to authenticated
  using (owner_id = auth.uid());

create policy "goal_movements_owner_or_shared_select" on public.goal_movements
  for select to authenticated
  using (owner_id = auth.uid() or public.can_access_shared_item('goal', goal_id));
create policy "goal_movements_owner_or_editor_insert" on public.goal_movements
  for insert to authenticated
  with check (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id));
create policy "goal_movements_owner_or_editor_update" on public.goal_movements
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id))
  with check (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id));
create policy "goal_movements_owner_or_editor_delete" on public.goal_movements
  for delete to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id));

create policy "activity_logs_visible_to_related_users" on public.activity_logs
  for select to authenticated
  using (
    owner_id = auth.uid()
    or actor_id = auth.uid()
    or (entity_type in ('project','project_item','project_movement') and (
      public.can_access_shared_item('project', entity_id)
      or public.can_access_shared_item('project', nullif(metadata ->> 'project_id', '')::uuid)
    )
    or (entity_type in ('goal','goal_movement') and (
      public.can_access_shared_item('goal', entity_id)
      or public.can_access_shared_item('goal', nullif(metadata ->> 'goal_id', '')::uuid)
    )
  );
create policy "activity_logs_insert_for_actor_or_owner" on public.activity_logs
  for insert to authenticated
  with check (owner_id = auth.uid() or actor_id = auth.uid());

create index if not exists idx_projects_owner_deleted on public.projects(owner_id, is_deleted, status);
create index if not exists idx_project_items_project_deleted on public.project_items(project_id, is_deleted, status);
create index if not exists idx_project_movements_project_deleted on public.project_movements(project_id, is_deleted, created_at desc);
create index if not exists idx_goals_owner_deleted on public.goals(owner_id, is_deleted, status);
create index if not exists idx_goal_movements_goal_deleted on public.goal_movements(goal_id, is_deleted, created_at desc);
create index if not exists idx_activity_logs_entity_created on public.activity_logs(entity_type, entity_id, created_at desc);
create index if not exists idx_shared_items_item_role on public.shared_items(item_type, item_id, role);
-- Etapa 5: Investimentos, corretoras, movimentações e alocação alvo.
-- Rode este arquivo se você já aplicou as etapas anteriores.

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

alter table if exists public.investment_transactions
  drop constraint if exists investment_transactions_type_check;

alter table if exists public.investment_transactions
  add constraint investment_transactions_type_check
  check (type in ('buy','sell','deposit','withdraw','dividend','yield','fee','adjust'));

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

create index if not exists idx_investment_accounts_owner_deleted
  on public.investment_accounts(owner_id, is_deleted);

create index if not exists idx_investments_owner_account_deleted
  on public.investments(owner_id, investment_account_id, is_deleted);

create index if not exists idx_investment_transactions_owner_date_deleted
  on public.investment_transactions(owner_id, is_deleted, date desc);

create index if not exists idx_investment_transactions_owner_asset
  on public.investment_transactions(owner_id, investment_id, is_deleted);

create index if not exists idx_investment_allocation_targets_owner_deleted
  on public.investment_allocation_targets(owner_id, is_deleted, target_scope);

notify pgrst, 'reload schema';
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

-- Etapa 12 compatibility block: categorias inteligentes, cores e CRUD robusto.
-- If you are creating a fresh database from this schema, the following idempotent
-- commands keep it aligned with the latest app code.
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
create index if not exists idx_categories_owner_name_lower on public.categories(owner_id, lower(name));
create index if not exists idx_transactions_owner_category_date on public.transactions(owner_id, category_id, date desc) where is_deleted = false;
notify pgrst, 'reload schema';
