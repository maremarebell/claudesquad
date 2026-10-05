-- Run in the Supabase SQL editor. Safe to run again: it replaces the policies
-- and trigger rather than stacking new ones on top. Auth: enable GitHub.

create table if not exists public.members (
  id uuid primary key references auth.users on delete cascade,
  login text not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.checkins (
  user_id uuid not null references public.members on delete cascade,
  event_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, event_date)
);

alter table public.members enable row level security;
alter table public.checkins enable row level security;

-- login and avatar come from the GitHub identity, never from the client.
-- user_metadata can't be trusted for this: a user can rewrite their own with
-- auth.updateUser. auth.identities holds what GitHub sent and only Supabase
-- writes it, so the trigger copies from there over whatever the client sent.
create or replace function public.members_from_github()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gh jsonb;
begin
  select identity_data into gh
  from auth.identities
  where user_id = new.id and provider = 'github'
  limit 1;
  if gh is null then
    raise exception 'members rows need a GitHub sign-in';
  end if;
  new.login := gh ->> 'user_name';
  new.avatar_url := gh ->> 'avatar_url';
  return new;
end;
$$;

drop trigger if exists members_from_github on public.members;
create trigger members_from_github
  before insert or update on public.members
  for each row execute function public.members_from_github();

drop policy if exists "members are visible to signed-in people" on public.members;
drop policy if exists "you can create your own member row" on public.members;
drop policy if exists "you can update your own member row" on public.members;

create policy "members are visible to signed-in people" on public.members
  for select to authenticated using (true);
create policy "you can create your own member row" on public.members
  for insert to authenticated with check (auth.uid() = id);
create policy "you can update your own member row" on public.members
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "check-ins are visible to signed-in people" on public.checkins;
drop policy if exists "you can check yourself in today" on public.checkins;

create policy "check-ins are visible to signed-in people" on public.checkins
  for select to authenticated using (true);
-- Only for yourself, and only for today in New York, so nobody backfills.
-- Moves together with nyToday() in src/js/checkin.js, which uses the same zone.
-- Being at the meetup is not checked here: the shake happens in the browser,
-- so someone at home could call the API directly. Fine for a friend group.
create policy "you can check yourself in today" on public.checkins
  for insert to authenticated with check (
    auth.uid() = user_id
    and event_date = (now() at time zone 'America/New_York')::date
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'checkins'
  ) then
    alter publication supabase_realtime add table public.checkins;
  end if;
end;
$$;
