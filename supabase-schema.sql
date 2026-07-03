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

create or replace view public.group_rankings
with (security_invoker = true) as
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

grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.groups to authenticated;
grant select, insert, delete on public.group_members to authenticated;
grant select, insert, update on public.rankings to authenticated;
grant select on public.group_rankings to authenticated;

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

drop policy if exists "group memberships are readable by signed in users" on public.group_members;
create policy "group memberships are readable by signed in users"
on public.group_members for select
to authenticated
using (true);

drop policy if exists "users can join groups as themselves" on public.group_members;
create policy "users can join groups as themselves"
on public.group_members for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "users can leave groups themselves" on public.group_members;
create policy "users can leave groups themselves"
on public.group_members for delete
to authenticated
using (user_id = (select auth.uid()));

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


-- Public profile pictures. Uploads remain restricted to each user's own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar images are publicly readable" on storage.objects;
drop policy if exists "users can read own avatar metadata" on storage.objects;
create policy "users can read own avatar metadata"
on storage.objects for select to authenticated
using (bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "users can upload their own avatar" on storage.objects;
create policy "users can upload their own avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "users can update their own avatar" on storage.objects;
create policy "users can update their own avatar"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1])
with check (bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "users can delete their own avatar" on storage.objects;
create policy "users can delete their own avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);


-- Group quote book
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  quote text not null check (char_length(trim(quote)) between 1 and 1000),
  quote_date date not null default current_date,
  context text check (context is null or char_length(context) <= 3000),
  created_at timestamptz not null default now()
);

create index if not exists quotes_group_id_quote_date_idx
on public.quotes (group_id, quote_date desc, created_at desc);

grant select, insert on public.quotes to authenticated;
alter table public.quotes enable row level security;

drop policy if exists "group members can read quotes" on public.quotes;
create policy "group members can read quotes"
on public.quotes for select to authenticated
using (
  exists (
    select 1 from public.group_members gm
    where gm.group_id = quotes.group_id and gm.user_id = (select auth.uid())
  )
);

drop policy if exists "group members can add quotes" on public.quotes;
create policy "group members can add quotes"
on public.quotes for insert to authenticated
with check (
  author_id = (select auth.uid())
  and exists (
    select 1 from public.group_members gm
    where gm.group_id = quotes.group_id and gm.user_id = (select auth.uid())
  )
);


-- Group ideas and member voting
create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  idea text not null check (char_length(trim(idea)) between 1 and 1000),
  context text check (context is null or char_length(context) <= 3000),
  created_at timestamptz not null default now()
);

create table if not exists public.idea_votes (
  idea_id uuid not null references public.ideas(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (idea_id, voter_id)
);

create index if not exists ideas_group_id_created_at_idx on public.ideas (group_id, created_at desc);
create index if not exists idea_votes_voter_id_idx on public.idea_votes (voter_id);

grant select, insert on public.ideas to authenticated;
grant select, insert, update, delete on public.idea_votes to authenticated;
alter table public.ideas enable row level security;
alter table public.idea_votes enable row level security;

drop policy if exists "group members can read ideas" on public.ideas;
create policy "group members can read ideas" on public.ideas for select to authenticated
using (exists (select 1 from public.group_members gm where gm.group_id = ideas.group_id and gm.user_id = (select auth.uid())));

drop policy if exists "group members can add ideas" on public.ideas;
create policy "group members can add ideas" on public.ideas for insert to authenticated
with check (author_id = (select auth.uid()) and exists (select 1 from public.group_members gm where gm.group_id = ideas.group_id and gm.user_id = (select auth.uid())));

drop policy if exists "group members can read idea votes" on public.idea_votes;
create policy "group members can read idea votes" on public.idea_votes for select to authenticated
using (exists (select 1 from public.ideas i join public.group_members gm on gm.group_id = i.group_id where i.id = idea_votes.idea_id and gm.user_id = (select auth.uid())));

drop policy if exists "members can add their own idea vote" on public.idea_votes;
create policy "members can add their own idea vote" on public.idea_votes for insert to authenticated
with check (voter_id = (select auth.uid()) and exists (select 1 from public.ideas i join public.group_members gm on gm.group_id = i.group_id where i.id = idea_votes.idea_id and gm.user_id = (select auth.uid())));

drop policy if exists "members can update their own idea vote" on public.idea_votes;
create policy "members can update their own idea vote" on public.idea_votes for update to authenticated
using (voter_id = (select auth.uid())) with check (voter_id = (select auth.uid()));

drop policy if exists "members can remove their own idea vote" on public.idea_votes;
create policy "members can remove their own idea vote" on public.idea_votes for delete to authenticated
using (voter_id = (select auth.uid()));
