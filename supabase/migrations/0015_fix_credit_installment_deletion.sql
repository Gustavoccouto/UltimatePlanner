begin;

create or replace function public.delete_credit_installment_from_transaction(target_transaction_id uuid)
returns table (
  card_id uuid,
  billing_months text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  selected_transaction public.transactions%rowtype;
  touched_months text[];
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
  into selected_transaction
  from public.transactions
  where id = target_transaction_id
    and owner_id = current_user_id
  for update;

  if not found then
    raise exception 'Parcela não encontrada ou já removida.';
  end if;

  if selected_transaction.installment_id is null and selected_transaction.installment_plan_id is null then
    raise exception 'Esta parcela não está vinculada a um parcelamento.';
  end if;

  if selected_transaction.credit_card_id is null then
    raise exception 'Esta parcela não está vinculada a um cartão de crédito.';
  end if;

  select coalesce(
    array_agg(distinct billing_month) filter (where billing_month is not null),
    array[]::text[]
  )
  into touched_months
  from public.transactions
  where owner_id = current_user_id
    and (
      id = target_transaction_id
      or installment_plan_id = selected_transaction.installment_plan_id
    );

  update public.transactions
  set
    is_deleted = true,
    status = 'canceled',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_single_installment', true,
      'installment_deleted_at', now(),
      'notice', 'Parcela individual excluída.'
    )
  where id = target_transaction_id
    and owner_id = current_user_id;

  if selected_transaction.installment_id is not null then
    update public.installments
    set
      status = 'canceled',
      transaction_id = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'deleted_single_installment', true,
        'installment_deleted_at', now(),
        'notice', 'Parcela individual excluída.'
      )
    where id = selected_transaction.installment_id
      and owner_id = current_user_id;
  end if;

  if selected_transaction.installment_plan_id is not null then
    update public.installment_plans plan
    set
      paid_installments = coalesce((
        select count(*)::int
        from public.installments i
        where i.owner_id = current_user_id
          and i.installment_plan_id = plan.id
          and i.status = 'paid'
      ), 0),
      status = case
        when not exists (
          select 1
          from public.installments i
          where i.owner_id = current_user_id
            and i.installment_plan_id = plan.id
            and i.status <> 'canceled'
        ) then 'canceled'
        when not exists (
          select 1
          from public.installments i
          where i.owner_id = current_user_id
            and i.installment_plan_id = plan.id
            and i.status not in ('paid', 'canceled')
        ) then 'completed'
        else 'active'
      end,
      metadata = coalesce(plan.metadata, '{}'::jsonb) || jsonb_build_object(
        'last_installment_deleted_at', now()
      )
    where plan.id = selected_transaction.installment_plan_id
      and plan.owner_id = current_user_id;
  end if;

  card_id := selected_transaction.credit_card_id;
  billing_months := touched_months;

  return next;
end;
$$;

revoke all on function public.delete_credit_installment_from_transaction(uuid) from public;
grant execute on function public.delete_credit_installment_from_transaction(uuid) to authenticated;


create or replace function public.delete_credit_installment_plan(target_plan_id uuid)
returns table (
  card_id uuid,
  billing_months text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  plan_card_id uuid;
  touched_months text[];
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select credit_card_id
  into plan_card_id
  from public.installment_plans
  where id = target_plan_id
    and owner_id = current_user_id
  for update;

  if not found then
    raise exception 'Parcelamento não encontrado ou já removido.';
  end if;

  select coalesce(
    array_agg(distinct billing_month) filter (where billing_month is not null),
    array[]::text[]
  )
  into touched_months
  from public.transactions
  where owner_id = current_user_id
    and installment_plan_id = target_plan_id;

  update public.transactions
  set
    is_deleted = true,
    status = 'canceled',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_with_installment_plan', true,
      'installment_plan_deleted_at', now(),
      'notice', 'Compra parcelada inteira excluída.'
    )
  where owner_id = current_user_id
    and installment_plan_id = target_plan_id;

  update public.installments
  set
    status = 'canceled',
    transaction_id = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_with_installment_plan', true,
      'installment_plan_deleted_at', now(),
      'notice', 'Parcela cancelada pela exclusão da compra inteira.'
    )
  where owner_id = current_user_id
    and installment_plan_id = target_plan_id;

  update public.installment_plans
  set
    status = 'canceled',
    paid_installments = 0,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_at', now(),
      'safe_delete', true,
      'delete_behavior', 'compra_parcelada_inteira_cancelada'
    )
  where owner_id = current_user_id
    and id = target_plan_id;

  card_id := plan_card_id;
  billing_months := touched_months;

  return next;
end;
$$;

revoke all on function public.delete_credit_installment_plan(uuid) from public;
grant execute on function public.delete_credit_installment_plan(uuid) to authenticated;


create or replace function public.delete_credit_installment_plan_from_transaction(target_transaction_id uuid)
returns table (
  card_id uuid,
  billing_months text[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  selected_plan_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select installment_plan_id
  into selected_plan_id
  from public.transactions
  where id = target_transaction_id
    and owner_id = current_user_id;

  if selected_plan_id is null then
    raise exception 'Esta parcela não pertence a uma compra parcelada.';
  end if;

  return query
  select *
  from public.delete_credit_installment_plan(selected_plan_id);
end;
$$;

revoke all on function public.delete_credit_installment_plan_from_transaction(uuid) from public;
grant execute on function public.delete_credit_installment_plan_from_transaction(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
