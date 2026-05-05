begin;

/* Perfis: garante que usuários existentes e novos apareçam para compartilhamento. */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.sync_profiles_from_auth_users()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, email, display_name, avatar_url)
  select
    u.id,
    u.email,
    coalesce(
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(u.email, ''), '@', 1)
    ),
    nullif(u.raw_user_meta_data ->> 'avatar_url', '')
  from auth.users u
  where u.deleted_at is null
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
    avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
    updated_at = now();
end;
$$;

select public.sync_profiles_from_auth_users();

create or replace function public.ensure_current_user_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  insert into public.profiles(id, email, display_name)
  select
    u.id,
    u.email,
    coalesce(
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(u.email, ''), '@', 1)
    )
  from auth.users u
  where u.id = current_user_id
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
    updated_at = now();
end;
$$;

revoke all on function public.ensure_current_user_profile() from public;
grant execute on function public.ensure_current_user_profile() to authenticated;

create or replace function public.search_profiles_for_sharing(
  search_text text,
  requester_id uuid default auth.uid()
)
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
  select
    p.id,
    p.email,
    p.display_name,
    p.avatar_url,
    p.created_at,
    p.updated_at
  from public.profiles p
  where
    requester_id is not null
    and p.id <> requester_id
    and length(trim(coalesce(search_text, ''))) >= 2
    and (
      lower(coalesce(p.email, '')) like '%' || lower(trim(search_text)) || '%'
      or lower(coalesce(p.display_name, '')) like '%' || lower(trim(search_text)) || '%'
      or lower(split_part(coalesce(p.email, ''), '@', 1)) like '%' || lower(trim(search_text)) || '%'
    )
  order by
    case
      when lower(coalesce(p.email, '')) = lower(trim(search_text)) then 0
      when lower(split_part(coalesce(p.email, ''), '@', 1)) = lower(trim(search_text)) then 1
      when lower(coalesce(p.email, '')) like lower(trim(search_text)) || '%' then 2
      when lower(coalesce(p.display_name, '')) like lower(trim(search_text)) || '%' then 3
      else 4
    end,
    p.display_name nulls last,
    p.email nulls last
  limit 20;
$$;

revoke all on function public.search_profiles_for_sharing(text, uuid) from public;
grant execute on function public.search_profiles_for_sharing(text, uuid) to authenticated;
grant execute on function public.search_profiles_for_sharing(text, uuid) to service_role;

/* Exclusões seguras de conta/cartão preservando histórico e obrigações. */
create or replace function public.safe_delete_credit_card(target_card_id uuid)
returns table (card_id uuid, billing_months text[])
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

  select * into card_record
  from public.credit_cards
  where id = target_card_id
    and owner_id = current_user_id
    and coalesce(is_deleted, false) = false
  for update;

  if not found then
    raise exception 'Cartão não encontrado.';
  end if;

  select coalesce(array_agg(distinct to_char(billing_month, 'YYYY-MM')) filter (where billing_month is not null), array[]::text[])
  into touched_months
  from public.transactions
  where owner_id = current_user_id
    and credit_card_id = target_card_id
    and coalesce(is_deleted, false) = false;

  update public.transactions
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'card_deleted', true,
      'deleted_card_id', target_card_id,
      'deleted_card_name', card_record.name,
      'card_deleted_at', now(),
      'detached_debt', true,
      'notice', 'Cartão excluído; obrigação preservada como dívida/fatura histórica.'
    )
  where owner_id = current_user_id
    and credit_card_id = target_card_id
    and coalesce(is_deleted, false) = false;

  update public.installments
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
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

  select * into account_record
  from public.accounts
  where id = target_account_id
    and owner_id = current_user_id
    and coalesce(is_deleted, false) = false
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
    and coalesce(is_deleted, false) = false
    and (account_id = target_account_id or destination_account_id = target_account_id);

  update public.installments
  set
    account_id = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'account_deleted', true,
      'deleted_account_id', target_account_id,
      'deleted_account_name', account_record.name,
      'account_deleted_at', now(),
      'notice', 'Conta excluída; parcela preservada sem conta vinculada.'
    )
  where owner_id = current_user_id
    and account_id = target_account_id;

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
    and coalesce(is_deleted, false) = false;

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
returns table (card_id uuid, billing_months text[])
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

  select * into selected_transaction
  from public.transactions
  where id = target_transaction_id
    and owner_id = current_user_id
    and coalesce(is_deleted, false) = false
  for update;

  if not found then
    raise exception 'Parcela não encontrada.';
  end if;

  if selected_transaction.type <> 'card_expense'
     or selected_transaction.installment_plan_id is null
     or selected_transaction.credit_card_id is null then
    raise exception 'O lançamento selecionado não pertence a uma compra parcelada no crédito.';
  end if;

  select coalesce(array_agg(distinct to_char(billing_month, 'YYYY-MM')) filter (where billing_month is not null), array[]::text[])
  into touched_months
  from public.transactions
  where owner_id = current_user_id
    and installment_plan_id = selected_transaction.installment_plan_id
    and coalesce(is_deleted, false) = false;

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
    and coalesce(is_deleted, false) = false;

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
    remaining_installments = 0,
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

/* Reset completo da conta atual, sem apagar outros usuários. */
create or replace function public._reset_user_data(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_user_id is null then
    raise exception 'Usuário inválido.';
  end if;

  delete from public.ai_chat_messages where owner_id = target_user_id;
  delete from public.activity_logs where owner_id = target_user_id or actor_id = target_user_id;
  delete from public.shared_items where owner_id = target_user_id or user_id = target_user_id;

  if to_regclass('public.investment_allocation_targets') is not null then
    delete from public.investment_allocation_targets where owner_id = target_user_id;
  end if;

  delete from public.investment_transactions where owner_id = target_user_id;
  delete from public.investments where owner_id = target_user_id;
  delete from public.investment_accounts where owner_id = target_user_id;

  delete from public.goal_movements where owner_id = target_user_id or actor_id = target_user_id;
  delete from public.project_movements where owner_id = target_user_id or actor_id = target_user_id;
  delete from public.project_items where owner_id = target_user_id;
  delete from public.goals where owner_id = target_user_id;
  delete from public.projects where owner_id = target_user_id;

  delete from public.transactions where owner_id = target_user_id;
  delete from public.installments where owner_id = target_user_id;
  delete from public.installment_plans where owner_id = target_user_id;
  delete from public.recurring_rules where owner_id = target_user_id;
  delete from public.invoices where owner_id = target_user_id;
  delete from public.credit_cards where owner_id = target_user_id;
  delete from public.categories where owner_id = target_user_id;
  delete from public.accounts where owner_id = target_user_id;

  update public.profiles
  set
    display_name = coalesce(nullif(display_name, ''), split_part(coalesce(email, ''), '@', 1)),
    avatar_url = null,
    updated_at = now()
  where id = target_user_id;
end;
$$;

revoke all on function public._reset_user_data(uuid) from public;

create or replace function public.reset_current_user_data_hard()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  perform public._reset_user_data(current_user_id);
end;
$$;

revoke all on function public.reset_current_user_data_hard() from public;
grant execute on function public.reset_current_user_data_hard() to authenticated;

create or replace function public.reset_user_data_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._reset_user_data(target_user_id);
end;
$$;

revoke all on function public.reset_user_data_admin(uuid) from public;
grant execute on function public.reset_user_data_admin(uuid) to service_role;

notify pgrst, 'reload schema';

commit;
