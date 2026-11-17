-- 004_edge_functions.sql  ·  tables for the Supabase Edge Functions (Part 4)
--
-- Run by Sami in Supabase › SQL Editor, after 001. Claude Code never runs this.
--
-- What it does
--   * ea_keys          one row per EA key: only its SHA-256 hash is stored, never the key.
--                      mt5-ingest finds the account from the hash.
--   * news_fetches     one row per fetch-news attempt (ok or failed): the "at most once per
--                      25 minutes" guard and the dashboard's "news data stale" check read it.
--   * function_errors  errors the Edge Functions hit (Supabase Free keeps logs for one day).
--   * Row level security on all three with NO policies: only the functions and the server
--     (service role / database owner) can read or write them; the browser never can.
--
-- What it does NOT do: it changes no existing table and moves no data.
--
-- Safe to run twice: everything is "if not exists".
--
-- Undo (deletes the three tables; EA keys then have to be issued again):
--   drop table if exists public.function_errors, public.news_fetches, public.ea_keys;
--   delete from public.schema_migrations where version = '004_edge_functions';

begin;

do $$
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception 'Run migrations/001_relational.sql first.';
  end if;
  if not exists (select 1 from public.schema_migrations where version = '001_relational') then
    raise exception 'Run migrations/001_relational.sql first.';
  end if;
end $$;

-- ── EA keys (mt5-ingest) ──────────────────────────────────────────────────────
create table if not exists public.ea_keys (
  key_hash                   text        primary key,       -- sha256 hex of the key; the key is shown once and never stored
  user_id                    text        not null,
  account_id                 text        not null,
  key_hint                   text,                          -- last 4 characters, so the app can tell keys apart
  mt5_login                  text,                          -- when set, the EA must report this login
  mt5_server                 text,
  created_at                 timestamptz not null default now(),
  revoked_at                 timestamptz,                   -- a revoked key is refused (401)
  last_used_at               timestamptz,
  last_server_offset_minutes integer,                       -- broker server time minus UTC, as the EA reported it
  foreign key (user_id, account_id) references public.accounts (user_id, id) on delete cascade
);
create index if not exists ea_keys_account_idx on public.ea_keys (user_id, account_id);

-- ── news fetch log (fetch-news) ───────────────────────────────────────────────
create table if not exists public.news_fetches (
  id          bigint      generated always as identity primary key,
  source      text        not null,                         -- the feed URL
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text        not null default 'running' check (status in ('running','ok','failed')),
  http_status integer,
  events_seen integer,                                      -- events in the feed
  events_kept integer,                                      -- USD/GBP/EUR high impact, stored
  error       text
);
create index if not exists news_fetches_source_time_idx on public.news_fetches (source, started_at desc);

-- ── function errors ───────────────────────────────────────────────────────────
create table if not exists public.function_errors (
  id      bigint      generated always as identity primary key,
  fn      text        not null,                             -- 'mt5-ingest', 'fetch-news', 'risk-check'
  at      timestamptz not null default now(),
  message text        not null,
  detail  json
);
create index if not exists function_errors_at_idx on public.function_errors (at desc);

alter table public.ea_keys         enable row level security;
alter table public.news_fetches    enable row level security;
alter table public.function_errors enable row level security;

insert into public.schema_migrations (version) values ('004_edge_functions') on conflict do nothing;

commit;
