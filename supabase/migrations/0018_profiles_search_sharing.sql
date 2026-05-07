begin;

create extension if not exists pg_trgm;

create index if not exists profiles_email_trgm_idx
  on public.profiles
  using gin (lower(coalesce(email, '')) gin_trgm_ops);

create index if not exists profiles_display_name_trgm_idx
  on public.profiles
  using gin (lower(coalesce(display_name, '')) gin_trgm_ops);

create or replace function public.search_profiles_for_sharing(search_text text, requester_id uuid default auth.uid())
returns table (
  id uuid,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
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
  where requester_id is not null
    and p.id <> requester_id
    and length(trim(coalesce(search_text, ''))) >= 2
    and (
      lower(coalesce(p.email, '')) like '%' || lower(trim(search_text)) || '%'
      or lower(coalesce(p.display_name, '')) like '%' || lower(trim(search_text)) || '%'
    )
  order by
    case
      when lower(coalesce(p.email, '')) = lower(trim(search_text)) then 0
      when lower(coalesce(p.display_name, '')) = lower(trim(search_text)) then 1
      when lower(coalesce(p.email, '')) like lower(trim(search_text)) || '%' then 2
      when lower(coalesce(p.display_name, '')) like lower(trim(search_text)) || '%' then 3
      else 4
    end,
    coalesce(p.display_name, p.email, p.id::text)
  limit 20;
$$;

revoke all on function public.search_profiles_for_sharing(text, uuid) from public;
grant execute on function public.search_profiles_for_sharing(text, uuid) to authenticated;

create or replace function public.visible_profiles_for_user()
returns table (
  id uuid,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as user_id
  ),
  visible_ids as (
    select user_id as id from me where user_id is not null

    union

    select si.user_id
    from public.shared_items si
    join me on me.user_id is not null
    where si.owner_id = me.user_id

    union

    select si.owner_id
    from public.shared_items si
    join me on me.user_id is not null
    where si.user_id = me.user_id

    union

    select p.owner_id
    from public.projects p
    join me on me.user_id is not null
    where p.owner_id = me.user_id
       or exists (
        select 1
        from public.shared_items si
        where si.item_type = 'project'
          and si.item_id = p.id
          and si.user_id = me.user_id
       )

    union

    select g.owner_id
    from public.goals g
    join me on me.user_id is not null
    where g.owner_id = me.user_id
       or exists (
        select 1
        from public.shared_items si
        where si.item_type = 'goal'
          and si.item_id = g.id
          and si.user_id = me.user_id
       )
  )
  select distinct
    p.id,
    p.email,
    p.display_name,
    p.avatar_url,
    p.created_at,
    p.updated_at
  from public.profiles p
  join visible_ids v on v.id = p.id
  order by coalesce(p.display_name, p.email, p.id::text);
$$;

revoke all on function public.visible_profiles_for_user() from public;
grant execute on function public.visible_profiles_for_user() to authenticated;

notify pgrst, 'reload schema';

commit;
