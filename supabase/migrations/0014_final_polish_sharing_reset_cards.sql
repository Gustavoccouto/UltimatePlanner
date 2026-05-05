begin;

/* Perfis para compartilhamento: sincroniza usuários já existentes e novos. */
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
    display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
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

/* Permissões tipo Canva: viewer vê; editor altera itens/movimentos e conteúdo; dono gerencia participantes. */
create or replace function public.can_access_shared_item(kind text, target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_items s
    where s.user_id = auth.uid()
      and s.item_type = kind
      and s.item_id = target_id
  );
$$;

create or replace function public.can_edit_shared_item(kind text, target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shared_items s
    where s.user_id = auth.uid()
      and s.item_type = kind
      and s.item_id = target_id
      and s.role = 'editor'
  );
$$;

create or replace function public.owns_shared_item(kind text, target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when kind = 'project' then exists (select 1 from public.projects p where p.id = target_id and p.owner_id = auth.uid())
    when kind = 'goal' then exists (select 1 from public.goals g where g.id = target_id and g.owner_id = auth.uid())
    else false
  end;
$$;

alter table public.shared_items enable row level security;

drop policy if exists "shared_items_owner_or_user_select" on public.shared_items;
drop policy if exists "shared_items_owner_insert" on public.shared_items;
drop policy if exists "shared_items_owner_update" on public.shared_items;
drop policy if exists "shared_items_owner_delete" on public.shared_items;

create policy "shared_items_owner_or_user_select"
on public.shared_items for select to authenticated
using (owner_id = auth.uid() or user_id = auth.uid());

create policy "shared_items_owner_insert"
on public.shared_items for insert to authenticated
with check (owner_id = auth.uid() and public.owns_shared_item(item_type, item_id));

create policy "shared_items_owner_update"
on public.shared_items for update to authenticated
using (owner_id = auth.uid() and public.owns_shared_item(item_type, item_id))
with check (owner_id = auth.uid() and public.owns_shared_item(item_type, item_id));

create policy "shared_items_owner_delete"
on public.shared_items for delete to authenticated
using (owner_id = auth.uid() and public.owns_shared_item(item_type, item_id));

/* Reforça editor em projetos/metas, sem permitir excluir o projeto/meta do dono. */
drop policy if exists "projects_owner_update_delete" on public.projects;
drop policy if exists "projects_owner_delete" on public.projects;
drop policy if exists "projects_owner_or_editor_update" on public.projects;
drop policy if exists "project_items_owner_or_shared_all" on public.project_items;
drop policy if exists "project_items_owner_or_shared_select" on public.project_items;
drop policy if exists "project_items_owner_or_editor_insert" on public.project_items;
drop policy if exists "project_items_owner_or_editor_update" on public.project_items;
drop policy if exists "project_items_owner_or_editor_delete" on public.project_items;
drop policy if exists "project_movements_owner_or_shared_all" on public.project_movements;
drop policy if exists "project_movements_owner_or_shared_select" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_insert" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_update" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_delete" on public.project_movements;

create policy "projects_owner_or_editor_update"
on public.projects for update to authenticated
using (owner_id = auth.uid() or public.can_edit_shared_item('project', id))
with check (owner_id = auth.uid() or public.can_edit_shared_item('project', id));

create policy "projects_owner_delete"
on public.projects for delete to authenticated
using (owner_id = auth.uid());

create policy "project_items_owner_or_shared_select"
on public.project_items for select to authenticated
using (owner_id = auth.uid() or public.can_access_shared_item('project', project_id));

create policy "project_items_owner_or_editor_insert"
on public.project_items for insert to authenticated
with check (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));

create policy "project_items_owner_or_editor_update"
on public.project_items for update to authenticated
using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id))
with check (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));

create policy "project_items_owner_or_editor_delete"
on public.project_items for delete to authenticated
using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));

create policy "project_movements_owner_or_shared_select"
on public.project_movements for select to authenticated
using (owner_id = auth.uid() or public.can_access_shared_item('project', project_id));

create policy "project_movements_owner_or_editor_insert"
on public.project_movements for insert to authenticated
with check (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));

create policy "project_movements_owner_or_editor_update"
on public.project_movements for update to authenticated
using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id))
with check (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));

create policy "project_movements_owner_or_editor_delete"
on public.project_movements for delete to authenticated
using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));

drop policy if exists "goals_owner_update_delete" on public.goals;
drop policy if exists "goals_owner_delete" on public.goals;
drop policy if exists "goals_owner_or_editor_update" on public.goals;
drop policy if exists "goal_movements_owner_or_shared_all" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_shared_select" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_insert" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_update" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_delete" on public.goal_movements;

create policy "goals_owner_or_editor_update"
on public.goals for update to authenticated
using (owner_id = auth.uid() or public.can_edit_shared_item('goal', id))
with check (owner_id = auth.uid() or public.can_edit_shared_item('goal', id));

create policy "goals_owner_delete"
on public.goals for delete to authenticated
using (owner_id = auth.uid());

create policy "goal_movements_owner_or_shared_select"
on public.goal_movements for select to authenticated
using (owner_id = auth.uid() or public.can_access_shared_item('goal', goal_id));

create policy "goal_movements_owner_or_editor_insert"
on public.goal_movements for insert to authenticated
with check (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id));

create policy "goal_movements_owner_or_editor_update"
on public.goal_movements for update to authenticated
using (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id))
with check (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id));

create policy "goal_movements_owner_or_editor_delete"
on public.goal_movements for delete to authenticated
using (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id));

/* Exclusões seguras de cartão/conta e exclusão real da compra parcelada inteira. */
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
  set is_deleted = true,
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

create or replace function public.delete_credit_installment_plan_from_transaction(target_transaction_id uuid)
returns table (card_id uuid, billing_months text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  selected_transaction public.transactions%rowtype;
  target_plan_id uuid;
  target_card_id uuid;
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

  target_plan_id := selected_transaction.installment_plan_id;
  target_card_id := selected_transaction.credit_card_id;

  select coalesce(array_agg(distinct to_char(billing_month, 'YYYY-MM')) filter (where billing_month is not null), array[]::text[])
  into touched_months
  from public.transactions
  where owner_id = current_user_id
    and installment_plan_id = target_plan_id
    and coalesce(is_deleted, false) = false;

  update public.installments
  set transaction_id = null,
      status = 'canceled',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'deleted_with_installment_plan', true,
        'installment_plan_deleted_at', now()
      )
  where owner_id = current_user_id
    and installment_plan_id = target_plan_id;

  delete from public.transactions
  where owner_id = current_user_id
    and installment_plan_id = target_plan_id;

  delete from public.installments
  where owner_id = current_user_id
    and installment_plan_id = target_plan_id;

  delete from public.installment_plans
  where owner_id = current_user_id
    and id = target_plan_id;

  card_id := target_card_id;
  billing_months := touched_months;
  return next;
end;
$$;

revoke all on function public.delete_credit_installment_plan_from_transaction(uuid) from public;
grant execute on function public.delete_credit_installment_plan_from_transaction(uuid) to authenticated;

/* Reset completo do usuário atual. */
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

  if to_regclass('public.ai_chat_messages') is not null then
    delete from public.ai_chat_messages where owner_id = target_user_id;
  end if;

  if to_regclass('public.activity_logs') is not null then
    delete from public.activity_logs where owner_id = target_user_id or actor_id = target_user_id;
  end if;

  if to_regclass('public.shared_items') is not null then
    delete from public.shared_items where owner_id = target_user_id or user_id = target_user_id;
  end if;

  if to_regclass('public.investment_allocation_targets') is not null then
    delete from public.investment_allocation_targets where owner_id = target_user_id;
  end if;

  if to_regclass('public.investment_transactions') is not null then
    delete from public.investment_transactions where owner_id = target_user_id;
  end if;

  if to_regclass('public.investments') is not null then
    delete from public.investments where owner_id = target_user_id;
  end if;

  if to_regclass('public.investment_accounts') is not null then
    delete from public.investment_accounts where owner_id = target_user_id;
  end if;

  if to_regclass('public.goal_movements') is not null then
    delete from public.goal_movements where owner_id = target_user_id or actor_id = target_user_id;
  end if;

  if to_regclass('public.project_movements') is not null then
    delete from public.project_movements where owner_id = target_user_id or actor_id = target_user_id;
  end if;

  if to_regclass('public.project_items') is not null then
    delete from public.project_items where owner_id = target_user_id;
  end if;

  if to_regclass('public.goals') is not null then
    delete from public.goals where owner_id = target_user_id;
  end if;

  if to_regclass('public.projects') is not null then
    delete from public.projects where owner_id = target_user_id;
  end if;

  if to_regclass('public.installments') is not null then
    update public.installments set transaction_id = null where owner_id = target_user_id;
  end if;

  if to_regclass('public.transactions') is not null then
    delete from public.transactions where owner_id = target_user_id;
  end if;

  if to_regclass('public.installments') is not null then
    delete from public.installments where owner_id = target_user_id;
  end if;

  if to_regclass('public.installment_plans') is not null then
    delete from public.installment_plans where owner_id = target_user_id;
  end if;

  if to_regclass('public.recurring_rules') is not null then
    delete from public.recurring_rules where owner_id = target_user_id;
  end if;

  if to_regclass('public.invoices') is not null then
    delete from public.invoices where owner_id = target_user_id;
  end if;

  if to_regclass('public.credit_cards') is not null then
    delete from public.credit_cards where owner_id = target_user_id;
  end if;

  if to_regclass('public.categories') is not null then
    delete from public.categories where owner_id = target_user_id;
  end if;

  if to_regclass('public.accounts') is not null then
    delete from public.accounts where owner_id = target_user_id;
  end if;

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
