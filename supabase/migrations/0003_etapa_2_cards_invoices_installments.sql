-- Etapa 2 - Cartoes, faturas e parcelamentos no credito.
alter table public.credit_cards add column if not exists is_deleted boolean not null default false;
alter table public.credit_cards add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table public.installments add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.transactions add column if not exists installment_id uuid references public.installments(id) on delete set null;
alter table public.transactions add column if not exists invoice_id uuid references public.invoices(id) on delete set null;
create index if not exists idx_credit_cards_owner_deleted on public.credit_cards(owner_id, is_deleted, is_archived);
create index if not exists idx_invoices_owner_card_month on public.invoices(owner_id, credit_card_id, billing_month);
create index if not exists idx_installment_plans_owner_method on public.installment_plans(owner_id, payment_method, status);
create index if not exists idx_installments_owner_plan on public.installments(owner_id, installment_plan_id, status);
create index if not exists idx_transactions_owner_card_invoice on public.transactions(owner_id, credit_card_id, billing_month, type, is_deleted, is_paid);
