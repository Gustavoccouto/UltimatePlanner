-- Etapa 3: recorrências + parcelamento no débito.
-- O schema base já possui recurring_rules, installment_plans, installments e transactions.
-- Esta migration adiciona índices de segurança/performance usados pela materialização incremental.

create unique index if not exists idx_transactions_owner_recurrence_key_active
  on public.transactions(owner_id, recurrence_key)
  where recurrence_key is not null and is_deleted = false;

create index if not exists idx_recurring_rules_owner_active_next
  on public.recurring_rules(owner_id, is_active, next_occurrence);

create index if not exists idx_transactions_owner_recurring_date
  on public.transactions(owner_id, recurring_rule_id, date)
  where recurring_rule_id is not null;

create index if not exists idx_installment_plans_owner_method_status
  on public.installment_plans(owner_id, payment_method, status);

create index if not exists idx_installments_owner_debit_due
  on public.installments(owner_id, due_date)
  where credit_card_id is null;
