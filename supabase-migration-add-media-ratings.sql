alter table public.groups drop constraint if exists groups_enabled_features_check;

alter table public.groups
alter column enabled_features set default array['quotes','hangouts','ideas','media']::text[];

update public.groups
set enabled_features = array(
  select distinct feature
  from unnest(enabled_features || array['media']::text[]) as feature
  where feature = any(array['quotes','hangouts','ideas','media']::text[])
)
where not ('media' = any(enabled_features));

alter table public.groups
add constraint groups_enabled_features_check
check (enabled_features <@ array['quotes','hangouts','ideas','media']::text[]);

create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
  cover_url text check (cover_url is null or char_length(cover_url) <= 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.media_ratings (
  media_id uuid not null references public.media_items(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 10),
  context text check (context is null or char_length(context) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (media_id, rater_id)
);

create index if not exists media_items_group_created_at_idx on public.media_items (group_id, created_at desc);
create index if not exists media_ratings_rater_id_idx on public.media_ratings (rater_id);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_group_owner(target_group_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
    where g.id = target_group_id and g.created_by = (select auth.uid())
  );
$$;
revoke all on function private.is_group_owner(uuid) from public;
grant execute on function private.is_group_owner(uuid) to authenticated;

grant select, insert, delete on public.media_items to authenticated;
grant select, insert, update, delete on public.media_ratings to authenticated;
alter table public.media_items enable row level security;
alter table public.media_ratings enable row level security;

drop policy if exists "group members can read media items" on public.media_items;
create policy "group members can read media items" on public.media_items for select to authenticated
using (exists (select 1 from public.group_members gm where gm.group_id = media_items.group_id and gm.user_id = (select auth.uid())));

drop policy if exists "group members can add media items" on public.media_items;
create policy "group members can add media items" on public.media_items for insert to authenticated
with check (author_id = (select auth.uid()) and exists (select 1 from public.group_members gm where gm.group_id = media_items.group_id and gm.user_id = (select auth.uid())));

drop policy if exists "authors and owners can delete media items" on public.media_items;
create policy "authors and owners can delete media items" on public.media_items for delete to authenticated
using (author_id = (select auth.uid()) or private.is_group_owner(group_id));

drop policy if exists "group members can read media ratings" on public.media_ratings;
create policy "group members can read media ratings" on public.media_ratings for select to authenticated
using (exists (select 1 from public.media_items mi join public.group_members gm on gm.group_id = mi.group_id where mi.id = media_ratings.media_id and gm.user_id = (select auth.uid())));

drop policy if exists "members can add their own media rating" on public.media_ratings;
create policy "members can add their own media rating" on public.media_ratings for insert to authenticated
with check (rater_id = (select auth.uid()) and exists (select 1 from public.media_items mi join public.group_members gm on gm.group_id = mi.group_id where mi.id = media_ratings.media_id and gm.user_id = (select auth.uid())));

drop policy if exists "members can update their own media rating" on public.media_ratings;
create policy "members can update their own media rating" on public.media_ratings for update to authenticated
using (rater_id = (select auth.uid()))
with check (rater_id = (select auth.uid()));

drop policy if exists "members can remove their own media rating" on public.media_ratings;
create policy "members can remove their own media rating" on public.media_ratings for delete to authenticated
using (rater_id = (select auth.uid()));
