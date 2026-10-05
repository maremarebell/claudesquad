-- Members and check-ins. Applied by `supabase db push` (or `supabase start`
-- locally). Safe to run again: it replaces policies, functions and the trigger
-- rather than stacking new ones on top.

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
-- Nobody inserts a check-in directly. They come only from public.bump(),
-- which needs two people shaking at the same place at the same time.

-- Bump: like the old Bump app. Each shake records who, where and when. Two
-- members whose shakes land within 20 seconds and 250 metres of each other
-- are both checked in for today (New York date, the same zone nyToday() in
-- src/js/checkin.js uses). Someone already in can shake again to bring a
-- newcomer in. Locations are deleted after an hour and nobody can read them.
create table if not exists public.bumps (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.members on delete cascade,
  lat double precision not null,
  lng double precision not null,
  at timestamptz not null default now()
);
alter table public.bumps enable row level security;
create index if not exists bumps_at on public.bumps (at);

create or replace function public.metres_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2
    + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
  ))
$$;

create or replace function public.bump(at_lat double precision, at_lng double precision)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  today date := (now() at time zone 'America/New_York')::date;
  partners uuid[];
begin
  if me is null then
    raise exception 'sign in first';
  end if;
  if not exists (select 1 from public.members where id = me) then
    raise exception 'no member row yet, reload the page';
  end if;
  if at_lat is null or at_lng is null or abs(at_lat) > 90 or abs(at_lng) > 180 then
    raise exception 'a location is needed to bump';
  end if;

  -- One bump at a time. Two phones bumping in the same instant would each
  -- look for the other before either row was committed, and both miss.
  perform pg_advisory_xact_lock(hashtext('public.bump'));

  delete from public.bumps where at < now() - interval '1 hour';
  insert into public.bumps (user_id, lat, lng) values (me, at_lat, at_lng);

  select array_agg(distinct b.user_id) into partners
  from public.bumps b
  where b.user_id <> me
    and b.at > now() - interval '20 seconds'
    and public.metres_between(at_lat, at_lng, b.lat, b.lng) < 250;

  if partners is null then
    return jsonb_build_object('matched', false);
  end if;

  insert into public.checkins (user_id, event_date)
  select u, today from unnest(partners || me) as u
  on conflict do nothing;

  return jsonb_build_object(
    'matched', true,
    'with', (select jsonb_agg(coalesce(m.name, m.login) order by m.name) from public.members m where m.id = any(partners))
  );
end;
$$;

revoke all on function public.bump(double precision, double precision) from public, anon;
grant execute on function public.bump(double precision, double precision) to authenticated;

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
