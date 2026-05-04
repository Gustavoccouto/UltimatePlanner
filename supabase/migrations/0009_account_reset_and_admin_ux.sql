create or replace function public.reset_current_user_data()
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
    Reset administrativo do usuário atual.

    Esta função usa filtros por usuário/dono/participante antes de qualquer exclusão.
    O objetivo é remover dados do usuário autenticado sem afetar dados de outros usuários.
    As chamadas usam to_regclass para permitir evolução incremental do schema entre etapas.
  */

  if to_regclass('public.activity_logs') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'activity_logs'
        and column_name = 'owner_id'
    ) then
      delete from public.activity_logs where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'activity_logs'
        and column_name = 'user_id'
    ) then
      delete from public.activity_logs where user_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'activity_logs'
        and column_name = 'actor_id'
    ) then
      delete from public.activity_logs where actor_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.goal_shares') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'goal_shares'
        and column_name = 'owner_id'
    ) then
      delete from public.goal_shares where owner_id = current_user_id;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'goal_shares'
        and column_name = 'user_id'
    ) then
      delete from public.goal_shares where user_id = current_user_id;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'goal_shares'
        and column_name = 'shared_with'
    ) then
      delete from public.goal_shares where shared_with = current_user_id;
    end if;
  end if;

  if to_regclass('public.project_shares') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'project_shares'
        and column_name = 'owner_id'
    ) then
      delete from public.project_shares where owner_id = current_user_id;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'project_shares'
        and column_name = 'user_id'
    ) then
      delete from public.project_shares where user_id = current_user_id;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'project_shares'
        and column_name = 'shared_with'
    ) then
      delete from public.project_shares where shared_with = current_user_id;
    end if;
  end if;

  if to_regclass('public.investment_movements') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'investment_movements'
        and column_name = 'owner_id'
    ) then
      delete from public.investment_movements where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'investment_movements'
        and column_name = 'user_id'
    ) then
      delete from public.investment_movements where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.investment_positions') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'investment_positions'
        and column_name = 'owner_id'
    ) then
      delete from public.investment_positions where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'investment_positions'
        and column_name = 'user_id'
    ) then
      delete from public.investment_positions where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.investment_brokers') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'investment_brokers'
        and column_name = 'owner_id'
    ) then
      delete from public.investment_brokers where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'investment_brokers'
        and column_name = 'user_id'
    ) then
      delete from public.investment_brokers where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.investments') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'investments'
        and column_name = 'owner_id'
    ) then
      delete from public.investments where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'investments'
        and column_name = 'user_id'
    ) then
      delete from public.investments where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.project_items') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'project_items'
        and column_name = 'owner_id'
    ) then
      delete from public.project_items where owner_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.goal_movements') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'goal_movements'
        and column_name = 'owner_id'
    ) then
      delete from public.goal_movements where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'goal_movements'
        and column_name = 'user_id'
    ) then
      delete from public.goal_movements where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.project_cash_movements') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'project_cash_movements'
        and column_name = 'owner_id'
    ) then
      delete from public.project_cash_movements where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'project_cash_movements'
        and column_name = 'user_id'
    ) then
      delete from public.project_cash_movements where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.card_installments') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'card_installments'
        and column_name = 'owner_id'
    ) then
      delete from public.card_installments where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'card_installments'
        and column_name = 'user_id'
    ) then
      delete from public.card_installments where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.debit_installments') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'debit_installments'
        and column_name = 'owner_id'
    ) then
      delete from public.debit_installments where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'debit_installments'
        and column_name = 'user_id'
    ) then
      delete from public.debit_installments where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.recurring_rules') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'recurring_rules'
        and column_name = 'owner_id'
    ) then
      delete from public.recurring_rules where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'recurring_rules'
        and column_name = 'user_id'
    ) then
      delete from public.recurring_rules where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.transactions') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transactions'
        and column_name = 'owner_id'
    ) then
      delete from public.transactions where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'transactions'
        and column_name = 'user_id'
    ) then
      delete from public.transactions where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.invoices') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'invoices'
        and column_name = 'owner_id'
    ) then
      delete from public.invoices where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'invoices'
        and column_name = 'user_id'
    ) then
      delete from public.invoices where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.cards') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'cards'
        and column_name = 'owner_id'
    ) then
      delete from public.cards where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'cards'
        and column_name = 'user_id'
    ) then
      delete from public.cards where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.goals') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'goals'
        and column_name = 'owner_id'
    ) then
      delete from public.goals where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'goals'
        and column_name = 'user_id'
    ) then
      delete from public.goals where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.projects') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'projects'
        and column_name = 'owner_id'
    ) then
      delete from public.projects where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'projects'
        and column_name = 'user_id'
    ) then
      delete from public.projects where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.categories') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'categories'
        and column_name = 'owner_id'
    ) then
      delete from public.categories where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'categories'
        and column_name = 'user_id'
    ) then
      delete from public.categories where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.accounts') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'accounts'
        and column_name = 'owner_id'
    ) then
      delete from public.accounts where owner_id = current_user_id;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'accounts'
        and column_name = 'user_id'
    ) then
      delete from public.accounts where user_id = current_user_id;
    end if;
  end if;

  if to_regclass('public.profiles') is not null then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'id'
    ) then
      update public.profiles
      set
        full_name = null,
        avatar_url = null,
        updated_at = now()
      where id = current_user_id;
    end if;
  end if;
end;
$$;

revoke all on function public.reset_current_user_data() from public;
grant execute on function public.reset_current_user_data() to authenticated;