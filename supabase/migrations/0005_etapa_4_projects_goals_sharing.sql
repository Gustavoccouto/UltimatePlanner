-- Etapa 4: projetos, metas, compartilhamento e histórico.

alter table public.projects add column if not exists is_deleted boolean not null default false;
alter table public.project_items add column if not exists is_deleted boolean not null default false;
alter table public.project_movements add column if not exists is_deleted boolean not null default false;
alter table public.goals add column if not exists is_deleted boolean not null default false;
alter table public.goal_movements add column if not exists is_deleted boolean not null default false;

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

-- Remove políticas antigas e também as novas, para a migration poder ser rodada mais de uma vez.
drop policy if exists "projects_owner_update_delete" on public.projects;
drop policy if exists "projects_owner_delete" on public.projects;
drop policy if exists "projects_owner_or_editor_update" on public.projects;
drop policy if exists "projects_owner_or_editor_delete" on public.projects;

drop policy if exists "project_items_owner_or_shared_all" on public.project_items;
drop policy if exists "project_items_owner_or_editor_all" on public.project_items;
drop policy if exists "project_items_owner_or_shared_select" on public.project_items;
drop policy if exists "project_items_owner_or_editor_insert" on public.project_items;
drop policy if exists "project_items_owner_or_editor_update" on public.project_items;
drop policy if exists "project_items_owner_or_editor_delete" on public.project_items;

drop policy if exists "project_movements_owner_or_shared_all" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_all" on public.project_movements;
drop policy if exists "project_movements_owner_or_shared_select" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_insert" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_update" on public.project_movements;
drop policy if exists "project_movements_owner_or_editor_delete" on public.project_movements;

drop policy if exists "goals_owner_update_delete" on public.goals;
drop policy if exists "goals_owner_delete" on public.goals;
drop policy if exists "goals_owner_or_editor_update" on public.goals;
drop policy if exists "goals_owner_or_editor_delete" on public.goals;

drop policy if exists "goal_movements_owner_or_shared_all" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_all" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_shared_select" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_insert" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_update" on public.goal_movements;
drop policy if exists "goal_movements_owner_or_editor_delete" on public.goal_movements;

drop policy if exists "activity_logs_owner_select" on public.activity_logs;
drop policy if exists "activity_logs_owner_insert" on public.activity_logs;
drop policy if exists "activity_logs_owner_actor_or_shared_select" on public.activity_logs;
drop policy if exists "activity_logs_owner_actor_or_shared_insert" on public.activity_logs;
drop policy if exists "activity_logs_visible_to_related_users" on public.activity_logs;
drop policy if exists "activity_logs_insert_for_actor_or_owner" on public.activity_logs;

create policy "projects_owner_or_editor_update" on public.projects
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', id))
  with check (owner_id = auth.uid() or public.can_edit_shared_item('project', id));
create policy "projects_owner_delete" on public.projects
  for delete to authenticated
  using (owner_id = auth.uid());

create policy "project_items_owner_or_shared_select" on public.project_items
  for select to authenticated
  using (owner_id = auth.uid() or public.can_access_shared_item('project', project_id));
create policy "project_items_owner_or_editor_insert" on public.project_items
  for insert to authenticated
  with check (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));
create policy "project_items_owner_or_editor_update" on public.project_items
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id))
  with check (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));
create policy "project_items_owner_or_editor_delete" on public.project_items
  for delete to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));

create policy "project_movements_owner_or_shared_select" on public.project_movements
  for select to authenticated
  using (owner_id = auth.uid() or public.can_access_shared_item('project', project_id));
create policy "project_movements_owner_or_editor_insert" on public.project_movements
  for insert to authenticated
  with check (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));
create policy "project_movements_owner_or_editor_update" on public.project_movements
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id))
  with check (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));
create policy "project_movements_owner_or_editor_delete" on public.project_movements
  for delete to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('project', project_id));

create policy "goals_owner_or_editor_update" on public.goals
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('goal', id))
  with check (owner_id = auth.uid() or public.can_edit_shared_item('goal', id));
create policy "goals_owner_delete" on public.goals
  for delete to authenticated
  using (owner_id = auth.uid());

create policy "goal_movements_owner_or_shared_select" on public.goal_movements
  for select to authenticated
  using (owner_id = auth.uid() or public.can_access_shared_item('goal', goal_id));
create policy "goal_movements_owner_or_editor_insert" on public.goal_movements
  for insert to authenticated
  with check (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id));
create policy "goal_movements_owner_or_editor_update" on public.goal_movements
  for update to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id))
  with check (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id));
create policy "goal_movements_owner_or_editor_delete" on public.goal_movements
  for delete to authenticated
  using (owner_id = auth.uid() or public.can_edit_shared_item('goal', goal_id));

create policy "activity_logs_visible_to_related_users" on public.activity_logs
  for select to authenticated
  using (
    owner_id = auth.uid()
    or actor_id = auth.uid()
    or (
      entity_type in ('project','project_item','project_movement')
      and (
        public.can_access_shared_item('project', entity_id)
        or public.can_access_shared_item('project', nullif(metadata ->> 'project_id', '')::uuid)
      )
    )
    or (
      entity_type in ('goal','goal_movement')
      and (
        public.can_access_shared_item('goal', entity_id)
        or public.can_access_shared_item('goal', nullif(metadata ->> 'goal_id', '')::uuid)
      )
    )
  );
create policy "activity_logs_insert_for_actor_or_owner" on public.activity_logs
  for insert to authenticated
  with check (owner_id = auth.uid() or actor_id = auth.uid());

create index if not exists idx_projects_owner_deleted on public.projects(owner_id, is_deleted, status);
create index if not exists idx_project_items_project_deleted on public.project_items(project_id, is_deleted, status);
create index if not exists idx_project_movements_project_deleted on public.project_movements(project_id, is_deleted, created_at desc);
create index if not exists idx_goals_owner_deleted on public.goals(owner_id, is_deleted, status);
create index if not exists idx_goal_movements_goal_deleted on public.goal_movements(goal_id, is_deleted, created_at desc);
create index if not exists idx_activity_logs_entity_created on public.activity_logs(entity_type, entity_id, created_at desc);
create index if not exists idx_shared_items_item_role on public.shared_items(item_type, item_id, role);
