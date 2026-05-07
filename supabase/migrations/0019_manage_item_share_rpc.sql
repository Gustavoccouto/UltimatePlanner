
begin;

create or replace function public.manage_item_share(
  target_item_type text,
  target_item_id uuid,
  target_user_id uuid,
  target_role text default 'editor',
  target_action text default 'add'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid;
  item_owner_id uuid;
  item_name text;
  normalized_item_type text;
  normalized_role text;
  normalized_action text;
  target_profile public.profiles%rowtype;
  target_auth_user auth.users%rowtype;
  share_row public.shared_items%rowtype;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  normalized_item_type := lower(trim(coalesce(target_item_type, '')));
  normalized_role := lower(trim(coalesce(target_role, 'editor')));
  normalized_action := lower(trim(coalesce(target_action, 'add')));

  if normalized_item_type not in ('project', 'goal') then
    raise exception 'Tipo de compartilhamento inválido.';
  end if;

  if normalized_role not in ('viewer', 'editor') then
    raise exception 'Permissão inválida.';
  end if;

  if normalized_action not in ('add', 'remove') then
    raise exception 'Ação inválida.';
  end if;

  if target_user_id = current_user_id then
    raise exception 'Você já é o dono deste item.';
  end if;

  if normalized_item_type = 'project' then
    select p.owner_id, p.name
    into item_owner_id, item_name
    from public.projects p
    where p.id = target_item_id
      and coalesce(p.is_deleted, false) = false;
  else
    select g.owner_id, g.name
    into item_owner_id, item_name
    from public.goals g
    where g.id = target_item_id
      and coalesce(g.is_deleted, false) = false;
  end if;

  if item_owner_id is null then
    raise exception 'Item não encontrado.';
  end if;

  if item_owner_id <> current_user_id then
    raise exception 'Somente o dono pode gerenciar participantes deste item.';
  end if;

  select *
  into target_profile
  from public.profiles p
  where p.id = target_user_id
  limit 1;

  if target_profile.id is null then
    select *
    into target_auth_user
    from auth.users u
    where u.id = target_user_id
    limit 1;

    if target_auth_user.id is null then
      raise exception 'Usuário não encontrado.';
    end if;

    insert into public.profiles (
      id,
      email,
      display_name,
      avatar_url,
      created_at,
      updated_at
    )
    values (
      target_auth_user.id,
      target_auth_user.email,
      coalesce(
        target_auth_user.raw_user_meta_data ->> 'display_name',
        target_auth_user.raw_user_meta_data ->> 'full_name',
        split_part(coalesce(target_auth_user.email, 'usuario'), '@', 1),
        'Usuário'
      ),
      target_auth_user.raw_user_meta_data ->> 'avatar_url',
      now(),
      now()
    )
    on conflict (id) do update
    set
      email = coalesce(public.profiles.email, excluded.email),
      display_name = coalesce(public.profiles.display_name, excluded.display_name),
      avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
      updated_at = now()
    returning *
    into target_profile;
  end if;

  if normalized_action = 'remove' then
    delete from public.shared_items
    where owner_id = current_user_id
      and user_id = target_user_id
      and item_type = normalized_item_type
      and item_id = target_item_id
    returning *
    into share_row;

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
      normalized_item_type,
      target_item_id,
      normalized_item_type || '_share_removed',
      jsonb_build_object(
        'item_type', normalized_item_type,
        'item_id', target_item_id,
        'user_id', target_user_id,
        'item_name', item_name
      )
    );

    return jsonb_build_object(
      'ok', true,
      'action', 'removed',
      'shared_item', to_jsonb(share_row),
      'profile', to_jsonb(target_profile)
    );
  end if;

  insert into public.shared_items (
    owner_id,
    user_id,
    item_type,
    item_id,
    role
  )
  values (
    current_user_id,
    target_user_id,
    normalized_item_type,
    target_item_id,
    normalized_role
  )
  on conflict (user_id, item_type, item_id) do update
  set
    role = excluded.role,
    owner_id = excluded.owner_id
  returning *
  into share_row;

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
    normalized_item_type,
    target_item_id,
    normalized_item_type || '_share_added',
    jsonb_build_object(
      'item_type', normalized_item_type,
      'item_id', target_item_id,
      'user_id', target_user_id,
      'role', normalized_role,
      'item_name', item_name
    )
  );

  return jsonb_build_object(
    'ok', true,
    'action', 'added',
    'shared_item', to_jsonb(share_row),
    'profile', to_jsonb(target_profile)
  );
end;
$$;

revoke all on function public.manage_item_share(text, uuid, uuid, text, text) from public;
grant execute on function public.manage_item_share(text, uuid, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
