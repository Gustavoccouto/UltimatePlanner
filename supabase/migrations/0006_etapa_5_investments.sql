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
