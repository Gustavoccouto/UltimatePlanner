begin;

create extension if not exists pg_trgm;

create index if not exists categories_owner_name_trgm_idx
  on public.categories
  using gin (owner_id, lower(coalesce(name, '')) gin_trgm_ops);

create index if not exists transactions_owner_description_trgm_idx
  on public.transactions
  using gin (owner_id, lower(coalesce(description, '')) gin_trgm_ops);

create index if not exists project_items_owner_name_trgm_idx
  on public.project_items
  using gin (owner_id, lower(coalesce(name, '')) gin_trgm_ops);

create index if not exists recurring_rules_owner_name_trgm_idx
  on public.recurring_rules
  using gin (owner_id, lower(coalesce(name, '')) gin_trgm_ops);

notify pgrst, 'reload schema';

commit;
