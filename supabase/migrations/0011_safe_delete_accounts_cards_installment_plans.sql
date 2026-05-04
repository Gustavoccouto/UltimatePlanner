begin;

create or replace function public.safe_delete_credit_card(target_card_id uuid)
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
  card_record public.credit_cards%rowtype;
  touched_months text[];
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
  into card_record
  from public.credit_cards
  where id = target_card_id
    and owner_id = current_user_id
    and is_deleted = false
  for update;

  if not found then
    raise exception 'Cartão não encontrado.';
  end if;

  select coalesce(array_agg(distinct billing_month) filter (where billing_month is not null), array[]::text[])
  into touched_months
  from public.transactions
  where owner_id = current_user_id
    and credit_card_id = target_card_id
    and is_deleted = false;

  update public.transactions
  set
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'card_deleted', true,
      'deleted_card_id', target_card_id,
      'deleted_card_name', card_record.name,
      'card_deleted_at', now(),
      'detached_debt', true,
      'notice', 'Cartão excluído; obrigação preservada como dívida/fatura histórica.'
    )
  where owner_id = current_user_id
    and credit_card_id = target_card_id
    and is_deleted = false;

  update public.installments
  set
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'card_deleted', true,
      'deleted_card_id', target_card_id,
      'deleted_card_name', card_record.name,
      'card_deleted_at', now(),
      'detached_debt', true,
      'notice', 'Cartão excluído; parcela preservada como dívida/fatura histórica.'
    )
  where owner_id = current_user_id
    and credit_card_id = target_card_id;

  update public.credit_cards
  set
    is_deleted = true,
    is_archived = true,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_at', now(),
      'safe_delete', true,
      'delete_behavior', 'parcelas_preservadas_como_dividas'
    )
  where id = target_card_id
    and owner_id = current_user_id;

  card_id := target_card_id;
  billing_months := touched_months;

  return next;
end;
$$;

revoke all on function public.safe_delete_credit_card(uuid) from public;
grant execute on function public.safe_delete_credit_card(uuid) to authenticated;


create or replace function public.safe_delete_account(target_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  account_record public.accounts%rowtype;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
  into account_record
  from public.accounts
  where id = target_account_id
    and owner_id = current_user_id
    and is_deleted = false
  for update;

  if not found then
    raise exception 'Conta não encontrada.';
  end if;

  update public.transactions
  set
    account_id = case when account_id = target_account_id then null else account_id end,
    destination_account_id = case when destination_account_id = target_account_id then null else destination_account_id end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'account_deleted', true,
      'deleted_account_id', target_account_id,
      'deleted_account_name', account_record.name,
      'account_deleted_at', now(),
      'notice', 'Conta excluída; lançamento preservado no histórico.'
    )
  where owner_id = current_user_id
    and is_deleted = false
    and (
      account_id = target_account_id
      or destination_account_id = target_account_id
    );

  update public.credit_cards
  set
    account_id = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'payment_account_deleted', true,
      'deleted_account_id', target_account_id,
      'deleted_account_name', account_record.name,
      'account_deleted_at', now(),
      'notice', 'Conta de pagamento excluída; cartão preservado sem conta vinculada.'
    )
  where owner_id = current_user_id
    and account_id = target_account_id
    and is_deleted = false;

  update public.accounts
  set
    is_deleted = true,
    is_archived = true,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_at', now(),
      'safe_delete', true,
      'delete_behavior', 'historico_preservado'
    )
  where id = target_account_id
    and owner_id = current_user_id;
end;
$$;

revoke all on function public.safe_delete_account(uuid) from public;
grant execute on function public.safe_delete_account(uuid) to authenticated;


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
    and is_deleted = false
  for update;

  if not found then
    raise exception 'Parcela não encontrada.';
  end if;

  if selected_transaction.type <> 'card_expense'
     or selected_transaction.installment_plan_id is null
     or selected_transaction.credit_card_id is null then
    raise exception 'O lançamento selecionado não pertence a uma compra parcelada no crédito.';
  end if;

  select coalesce(array_agg(distinct billing_month) filter (where billing_month is not null), array[]::text[])
  into touched_months
  from public.transactions
  where owner_id = current_user_id
    and installment_plan_id = selected_transaction.installment_plan_id
    and is_deleted = false;

  update public.transactions
  set
    is_deleted = true,
    status = 'canceled',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_with_installment_plan', true,
      'deleted_installment_plan_id', selected_transaction.installment_plan_id,
      'installment_plan_deleted_at', now(),
      'notice', 'Compra parcelada inteira excluída.'
    )
  where owner_id = current_user_id
    and installment_plan_id = selected_transaction.installment_plan_id
    and is_deleted = false;

  update public.installments
  set
    status = 'canceled',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_with_installment_plan', true,
      'deleted_installment_plan_id', selected_transaction.installment_plan_id,
      'installment_plan_deleted_at', now(),
      'notice', 'Parcela cancelada pela exclusão da compra parcelada inteira.'
    )
  where owner_id = current_user_id
    and installment_plan_id = selected_transaction.installment_plan_id;

  update public.installment_plans
  set
    status = 'canceled',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_at', now(),
      'safe_delete', true,
      'delete_behavior', 'compra_parcelada_inteira_cancelada'
    )
  where owner_id = current_user_id
    and id = selected_transaction.installment_plan_id;

  card_id := selected_transaction.credit_card_id;
  billing_months := touched_months;

  return next;
end;
$$;

revoke all on function public.delete_credit_installment_plan_from_transaction(uuid) from public;
grant execute on function public.delete_credit_installment_plan_from_transaction(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;