begin;

create or replace function public._ultimateplanner_has_column(
  _table_name text,
  _column_name text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = _table_name
      and column_name = _column_name
  );
$$;

revoke all on function public._ultimateplanner_has_column(text, text) from public;

create or replace function public._ultimateplanner_delete_user_rows(
  _table_name text,
  _column_name text,
  _user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.' || _table_name) is null then
    return;
  end if;

  if not public._ultimateplanner_has_column(_table_name, _column_name) then
    return;
  end if;

  execute format('delete from public.%I where %I = $1', _table_name, _column_name)
  using _user_id;
end;
$$;

revoke all on function public._ultimateplanner_delete_user_rows(text, text, uuid) from public;

create or replace function public._ultimateplanner_soft_delete_user_rows(
  _table_name text,
  _owner_column text,
  _user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.' || _table_name) is null then
    return;
  end if;

  if not public._ultimateplanner_has_column(_table_name, _owner_column) then
    return;
  end if;

  if public._ultimateplanner_has_column(_table_name, 'is_deleted') then
    execute format('update public.%I set is_deleted = true where %I = $1', _table_name, _owner_column)
    using _user_id;
  else
    execute format('delete from public.%I where %I = $1', _table_name, _owner_column)
    using _user_id;
  end if;
end;
$$;

revoke all on function public._ultimateplanner_soft_delete_user_rows(text, text, uuid) from public;

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

  /*
    Reset forte do usuário atual.

    Importante:
    - usa auth.uid(), portanto não aceita id vindo do cliente;
    - remove somente linhas ligadas ao usuário autenticado;
    - apaga dados em ordem segura para evitar erro de FK;
    - preserva o registro auth.users.
  */

  perform public._ultimateplanner_delete_user_rows('ai_chat_messages', 'owner_id', current_user_id);

  perform public._ultimateplanner_delete_user_rows('activity_logs', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('activity_logs', 'actor_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('logs', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('logs', 'actor_id', current_user_id);

  perform public._ultimateplanner_delete_user_rows('shared_items', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('shared_items', 'user_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('shared_items', 'shared_with', current_user_id);

  perform public._ultimateplanner_delete_user_rows('project_shares', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('project_shares', 'user_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('project_shares', 'shared_with', current_user_id);

  perform public._ultimateplanner_delete_user_rows('goal_shares', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('goal_shares', 'user_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('goal_shares', 'shared_with', current_user_id);

  perform public._ultimateplanner_delete_user_rows('investment_allocation_targets', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('investment_transactions', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('investment_movements', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('investment_positions', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('investments', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('investment_accounts', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('investment_brokers', 'owner_id', current_user_id);

  perform public._ultimateplanner_delete_user_rows('goal_movements', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('goal_movements', 'actor_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('project_movements', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('project_movements', 'actor_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('project_cash_movements', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('project_items', 'owner_id', current_user_id);

  perform public._ultimateplanner_delete_user_rows('goals', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('projects', 'owner_id', current_user_id);

  if to_regclass('public.installments') is not null
     and public._ultimateplanner_has_column('installments', 'owner_id')
     and public._ultimateplanner_has_column('installments', 'transaction_id') then
    execute 'update public.installments set transaction_id = null where owner_id = $1'
    using current_user_id;
  end if;

  perform public._ultimateplanner_delete_user_rows('transactions', 'owner_id', current_user_id);

  perform public._ultimateplanner_delete_user_rows('installments', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('installment_plans', 'owner_id', current_user_id);

  perform public._ultimateplanner_delete_user_rows('recurring_instances', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('recurring_rules', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('recurrences', 'owner_id', current_user_id);

  perform public._ultimateplanner_delete_user_rows('invoices', 'owner_id', current_user_id);

  perform public._ultimateplanner_delete_user_rows('cards', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('credit_cards', 'owner_id', current_user_id);

  perform public._ultimateplanner_delete_user_rows('categories', 'owner_id', current_user_id);
  perform public._ultimateplanner_delete_user_rows('accounts', 'owner_id', current_user_id);

  /*
    Não apaga auth.users.
    Apenas limpa campos opcionais do perfil, quando existirem.
  */
  if to_regclass('public.profiles') is not null
     and public._ultimateplanner_has_column('profiles', 'id') then

    if public._ultimateplanner_has_column('profiles', 'avatar_url') then
      execute 'update public.profiles set avatar_url = null where id = $1'
      using current_user_id;
    end if;

    if public._ultimateplanner_has_column('profiles', 'updated_at') then
      execute 'update public.profiles set updated_at = now() where id = $1'
      using current_user_id;
    end if;
  end if;
end;
$$;

revoke all on function public.reset_current_user_data_hard() from public;
grant execute on function public.reset_current_user_data_hard() to authenticated;

create or replace function public.reset_current_user_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reset_current_user_data_hard();
end;
$$;

revoke all on function public.reset_current_user_data() from public;
grant execute on function public.reset_current_user_data() to authenticated;

notify pgrst, 'reload schema';

commit;
