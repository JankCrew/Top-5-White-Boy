create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nickname text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.rankings (
  group_id uuid not null references public.groups(id) on delete cascade,
  ranker_id uuid not null references public.profiles(id) on delete cascade,
  ranked_user_id uuid not null references public.profiles(id) on delete cascade,
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (group_id, ranker_id, ranked_user_id)
);

create or replace view public.group_rankings as
select
  r.group_id,
  p.id,
  p.nickname,
  p.avatar_url,
  avg(r.position)::numeric(10, 2) as average_position,
  count(*)::integer as vote_count
from public.rankings r
join public.profiles p on p.id = r.ranked_user_id
group by r.group_id, p.id, p.nickname, p.avatar_url;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.rankings enable row level security;

drop policy if exists "profiles are readable by signed in users" on public.profiles;
create policy "profiles are readable by signed in users"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "users can insert own profile" on public.profiles;
create policy "users can insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "groups can be read by signed in users" on public.groups;
create policy "groups can be read by signed in users"
on public.groups for select
to authenticated
using (true);

drop policy if exists "users can create groups" on public.groups;
create policy "users can create groups"
on public.groups for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "members can read group members" on public.group_members;
create policy "members can read group members"
on public.group_members for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.group_members mine
    where mine.group_id = group_members.group_id and mine.user_id = auth.uid()
  )
);

drop policy if exists "users can join groups as themselves" on public.group_members;
create policy "users can join groups as themselves"
on public.group_members for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "members can read rankings in their groups" on public.rankings;
create policy "members can read rankings in their groups"
on public.rankings for select
to authenticated
using (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = rankings.group_id and gm.user_id = auth.uid()
  )
);

drop policy if exists "users can write their own rankings" on public.rankings;
create policy "users can write their own rankings"
on public.rankings for insert
to authenticated
with check (
  ranker_id = auth.uid()
  and exists (
    select 1 from public.group_members gm
    where gm.group_id = rankings.group_id and gm.user_id = auth.uid()
  )
);

drop policy if exists "users can update their own rankings" on public.rankings;
create policy "users can update their own rankings"
on public.rankings for update
to authenticated
using (ranker_id = auth.uid())
with check (ranker_id = auth.uid());
