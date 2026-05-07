begin;

alter table public.project_movements
add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists project_movements_project_item_completion_idx
on public.project_movements ((metadata ->> 'project_item_id'))
where metadata ->> 'source' = 'project_item_completion';

notify pgrst, 'reload schema';

commit;
