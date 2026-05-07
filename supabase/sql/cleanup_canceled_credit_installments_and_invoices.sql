/*
  Limpeza opcional para rodar no Supabase SQL Editor.

  Objetivo:
  - marcar como canceled planos de parcelamento de crédito que não têm nenhuma parcela ativa;
  - recalcular as faturas com base apenas em transactions ativas;
  - limpar faturas sem compras ativas e sem pagamento.

  Troque o e-mail antes de rodar.
*/

begin;

do $$
declare
  target_email text := 'SEU_EMAIL_AQUI';
  target_user_id uuid;
begin
  select id
  into target_user_id
  from auth.users
  where lower(email) = lower(target_email)
  limit 1;

  if target_user_id is null then
    raise exception 'Usuário com e-mail % não encontrado.', target_email;
  end if;

  update public.installment_plans plan
  set
    status = 'canceled',
    remaining_installments = 0,
    metadata = coalesce(plan.metadata, '{}'::jsonb) || jsonb_build_object(
      'auto_canceled_because_no_active_installments', true,
      'auto_canceled_at', now()
    )
  where plan.owner_id = target_user_id
    and plan.payment_method = 'credit_card'
    and plan.status <> 'canceled'
    and not exists (
      select 1
      from public.installments i
      where i.owner_id = target_user_id
        and i.installment_plan_id = plan.id
        and coalesce(i.status, '') <> 'canceled'
    );

  with invoice_totals as (
    select
      t.owner_id,
      t.credit_card_id,
      t.billing_month,
      round(coalesce(sum(t.amount), 0)::numeric, 2) as total_amount
    from public.transactions t
    where t.owner_id = target_user_id
      and t.type = 'card_expense'
      and t.credit_card_id is not null
      and t.billing_month is not null
      and coalesce(t.is_deleted, false) = false
      and coalesce(t.status, '') <> 'canceled'
    group by t.owner_id, t.credit_card_id, t.billing_month
  )
  update public.invoices inv
  set
    total_amount = coalesce(src.total_amount, 0),
    paid_amount = least(coalesce(inv.paid_amount, 0), coalesce(src.total_amount, 0)),
    status = case
      when coalesce(src.total_amount, 0) <= 0 then 'open'
      when least(coalesce(inv.paid_amount, 0), coalesce(src.total_amount, 0)) >= coalesce(src.total_amount, 0) then 'paid'
      else 'open'
    end
  from invoice_totals src
  where inv.owner_id = src.owner_id
    and inv.credit_card_id = src.credit_card_id
    and inv.billing_month = src.billing_month
    and inv.owner_id = target_user_id;

  delete from public.invoices inv
  where inv.owner_id = target_user_id
    and inv.credit_card_id is not null
    and coalesce(inv.paid_amount, 0) = 0
    and not exists (
      select 1
      from public.transactions t
      where t.owner_id = target_user_id
        and t.credit_card_id = inv.credit_card_id
        and t.billing_month = inv.billing_month
        and t.type = 'card_expense'
        and coalesce(t.is_deleted, false) = false
        and coalesce(t.status, '') <> 'canceled'
    );

  raise notice 'Limpeza concluída para %.', target_email;
end $$;

commit;
