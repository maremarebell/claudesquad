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
create policy "you can create your own member row" on public.members
  for insert to authenticated with check (auth.uid() = id);
create policy "you can update your own member row" on public.members
  for update to authenticated using (auth.uid() = id);

create policy "check-ins are visible to signed-in people" on public.checkins
  for select to authenticated using (true);
-- only for yourself, and only for today in New York, so nobody backfills
create policy "you can check yourself in today" on public.checkins
  for insert to authenticated with check (
    auth.uid() = user_id
    and event_date = (now() at time zone 'America/New_York')::date
  );

alter publication supabase_realtime add table public.checkins;
