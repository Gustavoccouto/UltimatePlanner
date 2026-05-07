/*
  Etapa 8 — Preview de consistência.
  Rode logado pelo app usando a RPC abaixo, ou no SQL Editor trocando o e-mail.

  Opção app/API:
    supabase.rpc('financial_consistency_report')

  Opção SQL Editor:
*/

with target_user as (
  select id
  from auth.users
  where lower(email) = lower('SEU_EMAIL_AQUI')
  limit 1
),
deleted_accounts_linked_cards as (
  select count(*) as total
  from public.credit_cards c
  join public.accounts a on a.id = c.account_id
  join target_user u on u.id = c.owner_id
  where coalesce(c.is_deleted, false) = false
    and coalesce(a.is_deleted, false) = true
),
deleted_cards_active_transactions as (
  select count(*) as total
  from public.transactions t
  join public.credit_cards c on c.id = t.credit_card_id
  join target_user u on u.id = t.owner_id
  where coalesce(t.is_deleted, false) = false
    and coalesce(c.is_deleted, false) = true
),
card_plans_without_active_items as (
  select count(*) as total
  from public.installment_plans p
  join target_user u on u.id = p.owner_id
  where p.payment_method = 'credit_card'
    and coalesce(p.status, '') <> 'canceled'
    and not exists (
      select 1
      from public.transactions t
      where t.owner_id = p.owner_id
        and t.installment_plan_id = p.id
        and t.type = 'card_expense'
        and coalesce(t.is_deleted, false) = false
        and coalesce(t.status, '') <> 'canceled'
    )
    and not exists (
      select 1
      from public.installments i
      where i.owner_id = p.owner_id
        and i.installment_plan_id = p.id
        and coalesce(i.status, '') <> 'canceled'
    )
)
select
  (select total from deleted_accounts_linked_cards) as deleted_accounts_linked_cards,
  (select total from deleted_cards_active_transactions) as deleted_cards_active_transactions,
  (select total from card_plans_without_active_items) as card_plans_without_active_items;
