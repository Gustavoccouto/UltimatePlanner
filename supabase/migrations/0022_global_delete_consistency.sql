begin;

/*
  Etapa 8 — consistência global de exclusões.

  Objetivo:
  - manter "Excluir" como soft delete seguro;
  - evitar FK quebrando o app;
  - remover itens excluídos de Dashboard/cards/listas;
  - preservar histórico quando necessário;
  - evitar limite/fatura presos por vínculos antigos.
*/

alter table public.project_movements
add column if not exists metadata jsonb not null default '{}'::jsonb;

drop function if exists public.safe_delete_account(uuid);
drop function if exists public.safe_delete_credit_card(uuid);
drop function if exists public.cleanup_financial_consistency();
drop function if exists public.financial_consistency_report();

create or replace function public.safe_delete_account(target_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid;
  target_account public.accounts%rowtype;
  affected_cards integer := 0;
  affected_rules integer := 0;
  affected_movements integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
  into target_account
  from public.accounts
  where id = target_account_id
    and owner_id = current_user_id
    and coalesce(is_deleted, false) = false
  limit 1;

  if target_account.id is null then
    raise exception 'Conta não encontrada.';
  end if;

  update public.credit_cards
  set
    account_id = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'linked_account_deleted', true,
      'deleted_account_id', target_account_id,
      'deleted_account_name', target_account.name,
      'updated_at', now()
    )
  where owner_id = current_user_id
    and account_id = target_account_id
    and coalesce(is_deleted, false) = false;

  get diagnostics affected_cards = row_count;

  update public.recurring_rules
  set
    is_active = false,
    next_occurrence = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'disabled_because_account_deleted', true,
      'deleted_account_id', target_account_id,
      'updated_at', now()
    )
  where owner_id = current_user_id
    and account_id = target_account_id
    and coalesce(is_active, false) = true;

  get diagnostics affected_rules = row_count;

  update public.project_movements
  set
    account_id = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'linked_account_deleted', true,
      'deleted_account_id', target_account_id,
      'updated_at', now()
    )
  where owner_id = current_user_id
    and account_id = target_account_id
    and coalesce(is_deleted, false) = false;

  get diagnostics affected_movements = row_count;

  update public.accounts
  set
    is_deleted = true,
    is_archived = true,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_at', now(),
      'delete_source', 'safe_delete_account',
      'history_preserved', true
    )
  where id = target_account_id
    and owner_id = current_user_id;

  insert into public.activity_logs (
    owner_id,
    actor_id,
    entity_type,
    entity_id,
    action_type,
    metadata
  )
  values (
    current_user_id,
    current_user_id,
    'account',
    target_account_id,
    'account_deleted',
    jsonb_build_object(
      'account_name', target_account.name,
      'affected_cards', affected_cards,
      'affected_recurring_rules', affected_rules,
      'affected_project_movements', affected_movements
    )
  );

  return jsonb_build_object(
    'ok', true,
    'account_id', target_account_id,
    'affected_cards', affected_cards,
    'affected_recurring_rules', affected_rules,
    'affected_project_movements', affected_movements
  );
end;
$$;

create or replace function public.safe_delete_credit_card(target_card_id uuid)
returns table (
  card_id uuid,
  billing_months text[]
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid;
  target_card public.credit_cards%rowtype;
  affected_months text[] := array[]::text[];
  affected_transactions integer := 0;
  affected_installments integer := 0;
  affected_plans integer := 0;
  affected_rules integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select *
  into target_card
  from public.credit_cards
  where id = target_card_id
    and owner_id = current_user_id
    and coalesce(is_deleted, false) = false
  limit 1;

  if target_card.id is null then
    raise exception 'Cartão não encontrado.';
  end if;

  select coalesce(array_agg(distinct billing_month::text), array[]::text[])
  into affected_months
  from public.transactions
  where owner_id = current_user_id
    and credit_card_id = target_card_id
    and billing_month is not null;

  update public.transactions
  set
    credit_card_id = null,
    invoice_id = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'linked_card_deleted', true,
      'deleted_card_id', target_card_id,
      'deleted_card_name', target_card.name,
      'became_detached_debt', true,
      'updated_at', now()
    )
  where owner_id = current_user_id
    and credit_card_id = target_card_id
    and coalesce(is_deleted, false) = false;

  get diagnostics affected_transactions = row_count;

  update public.installments
  set
    credit_card_id = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'linked_card_deleted', true,
      'deleted_card_id', target_card_id,
      'deleted_card_name', target_card.name,
      'became_detached_debt', true,
      'updated_at', now()
    )
  where owner_id = current_user_id
    and credit_card_id = target_card_id;

  get diagnostics affected_installments = row_count;

  update public.installment_plans
  set
    credit_card_id = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'linked_card_deleted', true,
      'deleted_card_id', target_card_id,
      'deleted_card_name', target_card.name,
      'became_detached_debt', true,
      'updated_at', now()
    )
  where owner_id = current_user_id
    and credit_card_id = target_card_id;

  get diagnostics affected_plans = row_count;

  update public.recurring_rules
  set
    is_active = false,
    next_occurrence = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'disabled_because_card_deleted', true,
      'deleted_card_id', target_card_id,
      'updated_at', now()
    )
  where owner_id = current_user_id
    and credit_card_id = target_card_id
    and coalesce(is_active, false) = true;

  get diagnostics affected_rules = row_count;

  update public.invoices
  set
    total_amount = 0,
    paid_amount = 0,
    status = 'open',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'linked_card_deleted', true,
      'deleted_card_id', target_card_id,
      'updated_at', now()
    )
  where owner_id = current_user_id
    and credit_card_id = target_card_id;

  update public.credit_cards
  set
    is_deleted = true,
    is_archived = true,
    account_id = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_at', now(),
      'delete_source', 'safe_delete_credit_card',
      'installments_preserved_as_debt', true,
      'affected_transactions', affected_transactions,
      'affected_installments', affected_installments,
      'affected_plans', affected_plans,
      'affected_recurring_rules', affected_rules
    )
  where id = target_card_id
    and owner_id = current_user_id;

  insert into public.activity_logs (
    owner_id,
    actor_id,
    entity_type,
    entity_id,
    action_type,
    metadata
  )
  values (
    current_user_id,
    current_user_id,
    'credit_card',
    target_card_id,
    'credit_card_deleted',
    jsonb_build_object(
      'card_name', target_card.name,
      'affected_transactions', affected_transactions,
      'affected_installments', affected_installments,
      'affected_plans', affected_plans,
      'affected_recurring_rules', affected_rules,
      'billing_months', affected_months
    )
  );

  return query select target_card_id, affected_months;
end;
$$;

create or replace function public.financial_consistency_report()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid;
  deleted_accounts_linked_cards integer := 0;
  deleted_cards_active_transactions integer := 0;
  card_plans_without_active_items integer := 0;
  project_balance_mismatches integer := 0;
  invoices_with_wrong_total integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select count(*)
  into deleted_accounts_linked_cards
  from public.credit_cards c
  join public.accounts a on a.id = c.account_id
  where c.owner_id = current_user_id
    and coalesce(c.is_deleted, false) = false
    and coalesce(a.is_deleted, false) = true;

  select count(*)
  into deleted_cards_active_transactions
  from public.transactions t
  join public.credit_cards c on c.id = t.credit_card_id
  where t.owner_id = current_user_id
    and coalesce(t.is_deleted, false) = false
    and coalesce(c.is_deleted, false) = true;

  select count(*)
  into card_plans_without_active_items
  from public.installment_plans p
  where p.owner_id = current_user_id
    and p.payment_method = 'credit_card'
    and coalesce(p.status, '') <> 'canceled'
    and not exists (
      select 1
      from public.transactions t
      where t.owner_id = p.owner_id
        and t.installment_plan_id = p.id
        and t.type = 'card_expense'
        and coalesce(t.is_deleted, false) = false
        and coalesce(t.status, '') <> 'canceled'
    )
    and not exists (
      select 1
      from public.installments i
      where i.owner_id = p.owner_id
        and i.installment_plan_id = p.id
        and coalesce(i.status, '') <> 'canceled'
    );

  with balances as (
    select
      p.id,
      round(coalesce(sum(
        case
          when m.type = 'remove' then -abs(coalesce(m.amount, 0))
          else abs(coalesce(m.amount, 0))
        end
      ), 0)::numeric, 2) as calculated_balance,
      round(coalesce(p.current_amount, 0)::numeric, 2) as stored_balance
    from public.projects p
    left join public.project_movements m
      on m.project_id = p.id
      and coalesce(m.is_deleted, false) = false
    where p.owner_id = current_user_id
      and coalesce(p.is_deleted, false) = false
    group by p.id, p.current_amount
  )
  select count(*)
  into project_balance_mismatches
  from balances
  where calculated_balance <> stored_balance;

  with invoice_totals as (
    select
      t.credit_card_id,
      t.billing_month,
      round(coalesce(sum(t.amount), 0)::numeric, 2) as calculated_total
    from public.transactions t
    where t.owner_id = current_user_id
      and t.type = 'card_expense'
      and t.credit_card_id is not null
      and t.billing_month is not null
      and coalesce(t.is_deleted, false) = false
      and coalesce(t.status, '') <> 'canceled'
    group by t.credit_card_id, t.billing_month
  )
  select count(*)
  into invoices_with_wrong_total
  from public.invoices inv
  left join invoice_totals totals
    on totals.credit_card_id = inv.credit_card_id
    and totals.billing_month = inv.billing_month
  where inv.owner_id = current_user_id
    and inv.credit_card_id is not null
    and round(coalesce(inv.total_amount, 0)::numeric, 2) <> round(coalesce(totals.calculated_total, 0)::numeric, 2);

  return jsonb_build_object(
    'deleted_accounts_linked_cards', deleted_accounts_linked_cards,
    'deleted_cards_active_transactions', deleted_cards_active_transactions,
    'card_plans_without_active_items', card_plans_without_active_items,
    'project_balance_mismatches', project_balance_mismatches,
    'invoices_with_wrong_total', invoices_with_wrong_total
  );
end;
$$;

create or replace function public.cleanup_financial_consistency()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid;
  fixed_deleted_accounts_linked_cards integer := 0;
  fixed_deleted_cards_transactions integer := 0;
  fixed_card_plans_without_active_items integer := 0;
  fixed_installments_without_active_transaction integer := 0;
  fixed_project_balances integer := 0;
  fixed_invoice_totals integer := 0;
  zeroed_empty_invoices integer := 0;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  update public.credit_cards c
  set
    account_id = null,
    metadata = coalesce(c.metadata, '{}'::jsonb) || jsonb_build_object(
      'account_unlinked_by_consistency_cleanup', true,
      'updated_at', now()
    )
  from public.accounts a
  where c.owner_id = current_user_id
    and c.account_id = a.id
    and coalesce(c.is_deleted, false) = false
    and coalesce(a.is_deleted, false) = true;

  get diagnostics fixed_deleted_accounts_linked_cards = row_count;

  update public.transactions t
  set
    credit_card_id = null,
    invoice_id = null,
    metadata = coalesce(t.metadata, '{}'::jsonb) || jsonb_build_object(
      'card_unlinked_by_consistency_cleanup', true,
      'updated_at', now()
    )
  from public.credit_cards c
  where t.owner_id = current_user_id
    and t.credit_card_id = c.id
    and coalesce(t.is_deleted, false) = false
    and coalesce(c.is_deleted, false) = true;

  get diagnostics fixed_deleted_cards_transactions = row_count;

  update public.installment_plans p
  set
    status = 'canceled',
    remaining_installments = 0,
    metadata = coalesce(p.metadata, '{}'::jsonb) || jsonb_build_object(
      'canceled_by_consistency_cleanup', true,
      'reason', 'no_active_installments_or_transactions',
      'updated_at', now()
    )
  where p.owner_id = current_user_id
    and p.payment_method = 'credit_card'
    and coalesce(p.status, '') <> 'canceled'
    and not exists (
      select 1
      from public.transactions t
      where t.owner_id = p.owner_id
        and t.installment_plan_id = p.id
        and t.type = 'card_expense'
        and coalesce(t.is_deleted, false) = false
        and coalesce(t.status, '') <> 'canceled'
    )
    and not exists (
      select 1
      from public.installments i
      where i.owner_id = p.owner_id
        and i.installment_plan_id = p.id
        and coalesce(i.status, '') <> 'canceled'
    );

  get diagnostics fixed_card_plans_without_active_items = row_count;

  update public.installments i
  set
    status = 'canceled',
    transaction_id = null,
    metadata = coalesce(i.metadata, '{}'::jsonb) || jsonb_build_object(
      'canceled_by_consistency_cleanup', true,
      'reason', 'linked_transaction_deleted_or_canceled',
      'updated_at', now()
    )
  from public.transactions t
  where i.owner_id = current_user_id
    and i.transaction_id = t.id
    and (
      coalesce(t.is_deleted, false) = true
      or coalesce(t.status, '') = 'canceled'
    )
    and coalesce(i.status, '') <> 'canceled';

  get diagnostics fixed_installments_without_active_transaction = row_count;

  with balances as (
    select
      p.id,
      round(coalesce(sum(
        case
          when m.type = 'remove' then -abs(coalesce(m.amount, 0))
          else abs(coalesce(m.amount, 0))
        end
      ), 0)::numeric, 2) as calculated_balance
    from public.projects p
    left join public.project_movements m
      on m.project_id = p.id
      and coalesce(m.is_deleted, false) = false
    where p.owner_id = current_user_id
      and coalesce(p.is_deleted, false) = false
    group by p.id
  )
  update public.projects p
  set current_amount = balances.calculated_balance
  from balances
  where p.id = balances.id
    and round(coalesce(p.current_amount, 0)::numeric, 2) <> balances.calculated_balance;

  get diagnostics fixed_project_balances = row_count;

  with invoice_totals as (
    select
      t.credit_card_id,
      t.billing_month,
      round(coalesce(sum(t.amount), 0)::numeric, 2) as calculated_total
    from public.transactions t
    where t.owner_id = current_user_id
      and t.type = 'card_expense'
      and t.credit_card_id is not null
      and t.billing_month is not null
      and coalesce(t.is_deleted, false) = false
      and coalesce(t.status, '') <> 'canceled'
    group by t.credit_card_id, t.billing_month
  )
  update public.invoices inv
  set
    total_amount = totals.calculated_total,
    paid_amount = least(coalesce(inv.paid_amount, 0), totals.calculated_total),
    status = case
      when totals.calculated_total > 0 and least(coalesce(inv.paid_amount, 0), totals.calculated_total) >= totals.calculated_total then 'paid'
      else 'open'
    end
  from invoice_totals totals
  where inv.owner_id = current_user_id
    and inv.credit_card_id = totals.credit_card_id
    and inv.billing_month = totals.billing_month
    and round(coalesce(inv.total_amount, 0)::numeric, 2) <> totals.calculated_total;

  get diagnostics fixed_invoice_totals = row_count;

  update public.invoices inv
  set
    total_amount = 0,
    paid_amount = 0,
    status = 'open',
    metadata = coalesce(inv.metadata, '{}'::jsonb) || jsonb_build_object(
      'zeroed_by_consistency_cleanup', true,
      'updated_at', now()
    )
  where inv.owner_id = current_user_id
    and inv.credit_card_id is not null
    and not exists (
      select 1
      from public.transactions t
      where t.owner_id = current_user_id
        and t.credit_card_id = inv.credit_card_id
        and t.billing_month = inv.billing_month
        and t.type = 'card_expense'
        and coalesce(t.is_deleted, false) = false
        and coalesce(t.status, '') <> 'canceled'
    )
    and (
      coalesce(inv.total_amount, 0) <> 0
      or coalesce(inv.paid_amount, 0) <> 0
    );

  get diagnostics zeroed_empty_invoices = row_count;

  return jsonb_build_object(
    'fixed_deleted_accounts_linked_cards', fixed_deleted_accounts_linked_cards,
    'fixed_deleted_cards_transactions', fixed_deleted_cards_transactions,
    'fixed_card_plans_without_active_items', fixed_card_plans_without_active_items,
    'fixed_installments_without_active_transaction', fixed_installments_without_active_transaction,
    'fixed_project_balances', fixed_project_balances,
    'fixed_invoice_totals', fixed_invoice_totals,
    'zeroed_empty_invoices', zeroed_empty_invoices
  );
end;
$$;

revoke all on function public.safe_delete_account(uuid) from public;
revoke all on function public.safe_delete_credit_card(uuid) from public;
revoke all on function public.financial_consistency_report() from public;
revoke all on function public.cleanup_financial_consistency() from public;

grant execute on function public.safe_delete_account(uuid) to authenticated;
grant execute on function public.safe_delete_credit_card(uuid) to authenticated;
grant execute on function public.financial_consistency_report() to authenticated;
grant execute on function public.cleanup_financial_consistency() to authenticated;

notify pgrst, 'reload schema';

commit;
