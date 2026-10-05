-- Run once in the Supabase SQL editor. Auth: enable the GitHub provider.

create table public.members (
  id uuid primary key references auth.users on delete cascade,
  login text not null,
  name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.checkins (
  user_id uuid not null references public.members on delete cascade,
  event_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, event_date)
);

alter table public.members enable row level security;
alter table public.checkins enable row level security;

create policy "members are visible to signed-in people" on public.members
  for select to authenticated using (true);
-- login and avatar must be the ones GitHub signed into the token, so nobody
-- shows up on the leaderboard as someone else or with an image from anywhere
create policy "you can create your own member row" on public.members
  for insert to authenticated with check (
    auth.uid() = id
    and login = auth.jwt() -> 'user_metadata' ->> 'user_name'
    and avatar_url like 'https://avatars.githubusercontent.com/%'
  );
create policy "you can update your own member row" on public.members
  for update to authenticated using (auth.uid() = id) with check (
    auth.uid() = id
    and login = auth.jwt() -> 'user_metadata' ->> 'user_name'
    and avatar_url like 'https://avatars.githubusercontent.com/%'
  );

create policy "check-ins are visible to signed-in people" on public.checkins
  for select to authenticated using (true);
-- only for yourself, and only for today in New York, so nobody backfills.
-- Being at the meetup is not checked here: the shake happens in the browser,
-- so someone at home could call the API directly. Fine for a friend group.
create policy "you can check yourself in today" on public.checkins
  for insert to authenticated with check (
    auth.uid() = user_id
    and event_date = (now() at time zone 'America/New_York')::date
  );

alter publication supabase_realtime add table public.checkins;
