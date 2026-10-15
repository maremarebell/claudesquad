-- Run by the server on every start, so it only ever creates what is missing.

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  login text not null,
  name text,
  avatar_url text,
  github_id bigint unique,
  -- true once GitHub itself confirmed the login (Sign in with GitHub)
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists members_login on members (lower(login));

create table if not exists sessions (
  token_hash text primary key,
  member_id uuid not null references members on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists checkins (
  member_id uuid not null references members on delete cascade,
  event_date date not null,
  created_at timestamptz not null default now(),
  primary key (member_id, event_date)
);

-- What people are working on: a line and an optional link, posted from the site.
create table if not exists posts (
  id bigint generated always as identity primary key,
  member_id uuid not null references members on delete cascade,
  body text not null check (length(body) between 1 and 280),
  link text check (link ~ '^https?://'),
  created_at timestamptz not null default now()
);
create index if not exists posts_created on posts (created_at desc);

-- Locations live an hour, only to match bumps, and are never sent to anyone.
create table if not exists bumps (
  id bigint generated always as identity primary key,
  member_id uuid not null references members on delete cascade,
  lat double precision not null,
  lng double precision not null,
  at timestamptz not null default now()
);
create index if not exists bumps_at on bumps (at);

create or replace function metres_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    sin(radians(lat2 - lat1) / 2) ^ 2
    + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
  ))
$$;
