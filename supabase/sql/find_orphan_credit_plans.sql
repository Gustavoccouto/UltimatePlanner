/*
  Verificação opcional para achar parcelamentos de cartão que ainda aparecem
  mesmo sem transações ativas.

  Troque o e-mail e rode no Supabase SQL Editor.
*/

with target_user as (
  select id
  from auth.users
  where lower(email) = lower('SEU_EMAIL_AQUI')
  limit 1
),
orphan_credit_plans as (
  select p.id, p.description, p.status, p.created_at
  from public.installment_plans p
  join target_user u on u.id = p.owner_id
  where p.payment_method = 'credit_card'
    and p.status <> 'canceled'
    and not exists (
      select 1
      from public.transactions t
      where t.owner_id = p.owner_id
        and t.installment_plan_id = p.id
        and t.type = 'card_expense'
        and coalesce(t.is_deleted, false) = false
        and coalesce(t.status, '') <> 'canceled'
    )
)
select *
from orphan_credit_plans
order by created_at desc;
