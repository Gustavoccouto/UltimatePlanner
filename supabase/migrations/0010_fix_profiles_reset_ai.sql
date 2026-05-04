begin;

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
    )
  order by
    case
      when lower(coalesce(p.email, '')) = lower(trim(search_text)) then 0
      when lower(coalesce(p.email, '')) like lower(trim(search_text)) || '%' then 1
      when lower(coalesce(p.display_name, '')) like lower(trim(search_text)) || '%' then 2
      else 3
    end,
    p.display_name nulls last,
    p.email nulls last
  limit 20;
$$;

grant execute on function public.search_profiles_for_sharing(text, uuid) to authenticated;
grant execute on function public.search_profiles_for_sharing(text, uuid) to service_role;

create or replace function public.reset_user_data_admin(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_user_id is null then
    raise exception 'Usuário inválido.';
  end if;

  delete from public.ai_chat_messages
  where owner_id = target_user_id;

  delete from public.activity_logs
  where owner_id = target_user_id
     or actor_id = target_user_id;

  delete from public.shared_items
  where owner_id = target_user_id
     or user_id = target_user_id;

  if to_regclass('public.investment_allocation_targets') is not null then
    delete from public.investment_allocation_targets
    where owner_id = target_user_id;
  end if;

  delete from public.investment_transactions
  where owner_id = target_user_id;

  delete from public.investments
  where owner_id = target_user_id;

  delete from public.investment_accounts
  where owner_id = target_user_id;

  delete from public.goal_movements
  where owner_id = target_user_id
     or actor_id = target_user_id;

  delete from public.project_movements
  where owner_id = target_user_id
     or actor_id = target_user_id;

  delete from public.project_items
  where owner_id = target_user_id;

  delete from public.goals
  where owner_id = target_user_id;

  delete from public.projects
  where owner_id = target_user_id;

  update public.installments
  set transaction_id = null
  where owner_id = target_user_id;

  delete from public.transactions
  where owner_id = target_user_id;

  delete from public.installments
  where owner_id = target_user_id;

  delete from public.installment_plans
  where owner_id = target_user_id;

  delete from public.recurring_rules
  where owner_id = target_user_id;

  delete from public.invoices
  where owner_id = target_user_id;

  delete from public.credit_cards
  where owner_id = target_user_id;

  delete from public.categories
  where owner_id = target_user_id;

  delete from public.accounts
  where owner_id = target_user_id;

  update public.profiles
  set
    display_name = coalesce(nullif(display_name, ''), split_part(coalesce(email, ''), '@', 1)),
    avatar_url = null,
    updated_at = now()
  where id = target_user_id;
end;
$$;

revoke all on function public.reset_user_data_admin(uuid) from public;
grant execute on function public.reset_user_data_admin(uuid) to service_role;

notify pgrst, 'reload schema';

commit;