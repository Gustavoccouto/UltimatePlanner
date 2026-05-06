begin;

create or replace function public.delete_credit_installment_any_hard(target_transaction_id uuid)
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
  target_card_id uuid;
  target_plan_id uuid;
  target_installment_id uuid;
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
    /*
      Botão idempotente: se o item não existe mais, não quebra a UX.
      Retorna vazio e permite o front atualizar a tela.
    */
    card_id := null;
    billing_months := array[]::text[];
    return next;
  end if;

  target_card_id := selected_transaction.credit_card_id;
  target_plan_id := selected_transaction.installment_plan_id;
  target_installment_id := selected_transaction.installment_id;

  select coalesce(
    array_agg(distinct billing_month) filter (where billing_month is not null),
    array[]::text[]
  )
  into touched_months
  from public.transactions
  where owner_id = current_user_id
    and (
      id = target_transaction_id
      or installment_id = target_installment_id
      or (
        target_plan_id is not null
        and installment_plan_id = target_plan_id
      )
    );

  /*
    Exclui/cancela a transação alvo, independentemente dela ter
    0, 1 ou várias relações penduradas.
  */
  update public.transactions
  set
    is_deleted = true,
    status = 'canceled',
    is_paid = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_single_installment', true,
      'installment_deleted_at', now(),
      'notice', 'Parcela individual excluída pelo usuário.'
    )
  where id = target_transaction_id
    and owner_id = current_user_id;

  /*
    Se a parcela tiver registro em installments, cancela também.
    Não apaga fisicamente, não decrementa installments_count e não viola check.
  */
  if target_installment_id is not null then
    update public.installments
    set
      status = 'canceled',
      transaction_id = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'deleted_single_installment', true,
        'installment_deleted_at', now(),
        'notice', 'Parcela individual excluída pelo usuário.'
      )
    where id = target_installment_id
      and owner_id = current_user_id;
  end if;

  /*
    Se havia pagamento avulso vinculado, cancela o pagamento também.
  */
  update public.transactions payment
  set
    is_deleted = true,
    status = 'canceled',
    metadata = coalesce(payment.metadata, '{}'::jsonb) || jsonb_build_object(
      'canceled_because_installment_deleted', true,
      'canceled_at', now()
    )
  where payment.owner_id = current_user_id
    and payment.is_deleted = false
    and payment.metadata ->> 'linked_card_expense_id' = target_transaction_id::text;

  /*
    Recalcula status do plano sem alterar installments_count.
    Isso evita o erro:
    installment_plans_installments_count_check.
  */
  if target_plan_id is not null then
    update public.installment_plans plan
    set
      paid_installments = greatest(
        0,
        coalesce((
          select count(*)::int
          from public.installments i
          where i.owner_id = current_user_id
            and i.installment_plan_id = target_plan_id
            and i.status = 'paid'
        ), 0)
      ),
      status = case
        when not exists (
          select 1
          from public.installments i
          where i.owner_id = current_user_id
            and i.installment_plan_id = target_plan_id
            and coalesce(i.status, '') <> 'canceled'
        ) then 'canceled'
        when exists (
          select 1
          from public.installments i
          where i.owner_id = current_user_id
            and i.installment_plan_id = target_plan_id
            and coalesce(i.status, '') not in ('paid', 'canceled')
        ) then 'active'
        else 'completed'
      end,
      metadata = coalesce(plan.metadata, '{}'::jsonb) || jsonb_build_object(
        'last_deleted_installment_at', now()
      )
    where plan.id = target_plan_id
      and plan.owner_id = current_user_id;
  end if;

  card_id := target_card_id;
  billing_months := touched_months;

  return next;
end;
$$;

revoke all on function public.delete_credit_installment_any_hard(uuid) from public;
grant execute on function public.delete_credit_installment_any_hard(uuid) to authenticated;


create or replace function public.delete_credit_installment_plan_hard(target_plan_id uuid)
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
  target_card_id uuid;
  touched_months text[];
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select credit_card_id
  into target_card_id
  from public.installment_plans
  where id = target_plan_id
    and owner_id = current_user_id
  for update;

  if not found then
    /*
      Idempotente: se já foi removido/cancelado, não quebra a tela.
    */
    card_id := null;
    billing_months := array[]::text[];
    return next;
  end if;

  select coalesce(
    array_agg(distinct billing_month) filter (where billing_month is not null),
    array[]::text[]
  )
  into touched_months
  from public.transactions
  where owner_id = current_user_id
    and installment_plan_id = target_plan_id;

  /*
    Cancela todas as transações do plano. Funciona com 0, 1 ou N parcelas.
  */
  update public.transactions
  set
    is_deleted = true,
    status = 'canceled',
    is_paid = false,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_with_installment_plan', true,
      'installment_plan_deleted_at', now(),
      'notice', 'Compra parcelada inteira excluída pelo usuário.'
    )
  where owner_id = current_user_id
    and installment_plan_id = target_plan_id;

  /*
    Cancela todas as linhas em installments. Não altera installments_count.
  */
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

  card_id := target_card_id;
  billing_months := touched_months;

  return next;
end;
$$;

revoke all on function public.delete_credit_installment_plan_hard(uuid) from public;
grant execute on function public.delete_credit_installment_plan_hard(uuid) to authenticated;


create or replace function public.delete_credit_installment_plan_from_any_transaction_hard(target_transaction_id uuid)
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
  target_plan_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select installment_plan_id
  into target_plan_id
  from public.transactions
  where id = target_transaction_id
    and owner_id = current_user_id;

  if target_plan_id is null then
    /*
      Não explode a UI: a transação não tem plano, então cancela só ela.
    */
    return query
    select *
    from public.delete_credit_installment_any_hard(target_transaction_id);
    return;
  end if;

  return query
  select *
  from public.delete_credit_installment_plan_hard(target_plan_id);
end;
$$;

revoke all on function public.delete_credit_installment_plan_from_any_transaction_hard(uuid) from public;
grant execute on function public.delete_credit_installment_plan_from_any_transaction_hard(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
