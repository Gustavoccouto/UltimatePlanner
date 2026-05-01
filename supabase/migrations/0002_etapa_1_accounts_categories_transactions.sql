-- Etapa 1: compatibilidade para contas, categorias e transações migradas para Next.js.
-- Rode este arquivo se você já tinha executado o schema.sql da versão starter anterior.

alter table public.accounts
  add column if not exists is_deleted boolean not null default false;

alter table public.categories
  add column if not exists is_deleted boolean not null default false;

alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check
  check (type in ('income','expense','transfer','adjust','card_expense','invoice_payment'));

create index if not exists idx_accounts_owner_deleted on public.accounts(owner_id, is_deleted);
create index if not exists idx_categories_owner_deleted on public.categories(owner_id, is_deleted);
create index if not exists idx_transactions_owner_deleted on public.transactions(owner_id, is_deleted);
