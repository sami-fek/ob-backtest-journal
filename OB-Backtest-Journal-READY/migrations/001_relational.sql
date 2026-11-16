-- 001_relational.sql  ·  relational tables for MY Journal (Part 1)
--
-- Run by Sami in Supabase › SQL Editor. Claude Code never runs this.
--
-- What it does
--   * Creates the tables accounts, trades, trade_attachments, news_events,
--     equity_snapshots, account_runs and journal_migrated_users (the per-user switch).
--   * Creates the functions the server uses to save a whole document in one
--     transaction (journal_save_accounts, journal_save_trades) and the marker
--     function the migration calls last (journal_mark_migrated).
--   * Enables row level security on every new table with NO policies: only the
--     server (service role) can read or write them; the browser never can.
--
-- What it does NOT do
--   * It does not touch kv or users, and it moves no data. Data is copied by
--     scripts/migrate-kv.mjs afterwards; kv stays exactly as it is.
--
-- Safe to run twice: everything is "if not exists" / "create or replace".
-- If a table with one of these names already exists from something else, it stops
-- with an error instead of silently keeping a table of a different shape.
--
-- Undo (only before any data was copied; this deletes the new tables):
--   drop function if exists public.journal_save_trades(text, json, json, text);
--   drop function if exists public.journal_save_accounts(text, json, text);
--   drop function if exists public.journal_mark_migrated(text, text);
--   drop table if exists public.trade_attachments, public.trades, public.account_runs,
--     public.equity_snapshots, public.news_events, public.accounts,
--     public.journal_migrated_users, public.schema_migrations;

begin;

create table if not exists public.schema_migrations (
  version    text        primary key,
  applied_at timestamptz not null default now()
);

-- Guard: stop if a table we are about to create already exists but this migration
-- was never recorded (e.g. created by an older saved SQL snippet).
do $$
declare t text;
begin
  if not exists (select 1 from public.schema_migrations where version = '001_relational') then
    foreach t in array array['accounts','trades','trade_attachments','news_events','equity_snapshots','account_runs','journal_migrated_users'] loop
      if to_regclass('public.' || t) is not null then
        raise exception 'Table public.% already exists but migration 001 was never recorded. Stop and send its definition (\d public.%) before going on.', t, t;
      end if;
    end loop;
  end if;
end $$;

-- ── accounts ─────────────────────────────────────────────────────────────────
create table if not exists public.accounts (
  user_id            text        not null references public.users(id) on delete cascade,
  id                 text        not null,                 -- the app's account id, e.g. 'real-1'
  name               text,
  type               text        not null check (type in ('demo','real','funded','backtest')),
  preset             text,                                 -- set in Part 2 (My Rules, FTMO, …)
  starting_balance   numeric,
  current_balance    numeric,
  reset_timezone     text,                                 -- IANA name, e.g. 'Europe/Prague'; never a UTC offset
  status             text        not null default 'active' check (status in ('active','blown','archived')),
  run_number         integer     not null default 1,
  needs_verification boolean     not null default false,   -- starting balance may be a placeholder
  mt5_login          text,                                 -- login number and server only, never a token
  mt5_server         text,
  position           integer     not null default 0,       -- order inside its type in the app
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  extra              json        not null default '{}',    -- remaining app fields, kept exactly
  primary key (user_id, id)
);

-- ── trades ───────────────────────────────────────────────────────────────────
create table if not exists public.trades (
  user_id       text        not null references public.users(id) on delete cascade,
  id            text        not null,                      -- the app's trade id, e.g. 'tr-1794685321742'
  account_id    text,                                      -- null = not assigned to an account yet
  mode          text,                                      -- Backtest / Demo / Real / Funded
  symbol        text,
  direction     text,
  trade_date    date,                                      -- the calendar day the app files the trade under
  open_time     timestamptz,
  close_time    timestamptz,
  pnl           numeric,
  r_multiple    numeric,
  result        text,
  strategy      text,
  timeframe     text,
  regime        text,
  session       text,
  source        text        check (source is null or source in ('manual','mt5')),
  mt5_ticket    text,
  notes         text,
  review_status text,
  post_breach   boolean     not null default false,        -- logged after the account was blown (Part 3)
  position      integer     not null default 0,            -- order of the app's list
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  extra         json        not null default '{}',         -- checklist, tags, feelings, prices… kept exactly
  primary key (user_id, id)
);
create index if not exists trades_account_close_idx on public.trades (user_id, account_id, close_time);
create index if not exists trades_account_date_idx  on public.trades (user_id, account_id, trade_date);
create unique index if not exists trades_mt5_ticket_uq on public.trades (user_id, account_id, mt5_ticket) where mt5_ticket is not null;

-- ── screenshots: files in Supabase Storage, only the path is stored ───────────
create table if not exists public.trade_attachments (
  user_id      text        not null,
  trade_id     text        not null,
  position     integer     not null,                       -- order of the trade's screenshots
  bucket       text        not null default 'trade-screenshots',
  shot_id      text        not null,                       -- '<sha256 prefix>.png'; served at /api/shots/<shot_id>
  storage_path text        not null,                       -- '<user_id>/<shot_id>' inside the bucket
  mime         text,
  bytes        integer,
  created_at   timestamptz not null default now(),
  primary key (user_id, trade_id, position),
  foreign key (user_id, trade_id) references public.trades (user_id, id) on delete cascade
);

-- ── news (filled by the fetch-news function, Part 4) ─────────────────────────
create table if not exists public.news_events (
  id             bigint      generated always as identity primary key,
  title          text        not null,
  currency       text        not null,
  event_time_utc timestamptz not null,
  impact         text        not null,
  event_key      text        not null unique,              -- title + currency + date (the feed has no ids)
  source         text,
  fetched_at     timestamptz not null default now()
);
create index if not exists news_events_time_idx on public.news_events (event_time_utc);

-- ── live equity (Part 8) ─────────────────────────────────────────────────────
create table if not exists public.equity_snapshots (
  id                    bigint      generated always as identity primary key,
  user_id               text        not null,
  account_id            text        not null,
  equity                numeric     not null,
  balance               numeric     not null,
  server_offset_minutes integer,
  taken_at              timestamptz not null,
  foreign key (user_id, account_id) references public.accounts (user_id, id) on delete cascade
);
create index if not exists equity_snapshots_account_time_idx on public.equity_snapshots (user_id, account_id, taken_at);

-- ── account runs (Part 3: blown → "Start new run") ───────────────────────────
create table if not exists public.account_runs (
  id               bigint      generated always as identity primary key,
  user_id          text        not null,
  account_id       text        not null,
  run_number       integer     not null,
  starting_balance numeric     not null,
  started_at       timestamptz not null,
  ended_at         timestamptz,
  end_reason       text        check (end_reason is null or end_reason in ('blown','manual_reset')),
  peak_balance     numeric,
  unique (user_id, account_id, run_number),
  foreign key (user_id, account_id) references public.accounts (user_id, id) on delete cascade
);

-- ── per-user switch: the server reads these tables for a user only after their
--    migration finished (so nobody ever sees an empty journal mid-migration) ────
create table if not exists public.journal_migrated_users (
  user_id     text        primary key references public.users(id) on delete cascade,
  source      text        not null,                        -- 'migrate-kv' or 'new-user'
  migrated_at timestamptz not null default now()
);

-- ── row level security: server (service role) only ───────────────────────────
alter table public.accounts               enable row level security;
alter table public.trades                 enable row level security;
alter table public.trade_attachments      enable row level security;
alter table public.news_events            enable row level security;
alter table public.equity_snapshots       enable row level security;
alter table public.account_runs           enable row level security;
alter table public.journal_migrated_users enable row level security;
alter table public.schema_migrations      enable row level security;

-- ── save functions (one transaction per document) ────────────────────────────
-- p_mode 'replace'        the app saved its whole document: upsert every row, delete
--                         rows that are no longer in it (a trade the user deleted).
-- p_mode 'insert_missing' the migration: insert rows that do not exist yet; never
--                         update and never delete. Safe to run any number of times.

create or replace function public.journal_save_accounts(p_user text, p_rows json, p_mode text)
returns void language plpgsql as $$
begin
  if p_mode not in ('replace','insert_missing') then raise exception 'bad mode %', p_mode; end if;
  if p_mode = 'replace' then
    insert into public.accounts (user_id, id, name, type, preset, starting_balance, current_balance, reset_timezone,
      status, run_number, needs_verification, mt5_login, mt5_server, position, created_at, updated_at, extra)
    select p_user, x.id, x.name, x.type, x.preset, x.starting_balance, x.current_balance, x.reset_timezone,
      coalesce(x.status,'active'), coalesce(x.run_number,1), coalesce(x.needs_verification,false), x.mt5_login, x.mt5_server,
      coalesce(x.position,0), coalesce(x.created_at, now()), now(), coalesce(x.extra,'{}'::json)
    from json_to_recordset(p_rows) as x(id text, name text, type text, preset text, starting_balance numeric, current_balance numeric,
      reset_timezone text, status text, run_number integer, needs_verification boolean, mt5_login text, mt5_server text,
      position integer, created_at timestamptz, extra json)
    on conflict (user_id, id) do update set
      name = excluded.name, type = excluded.type, preset = excluded.preset, starting_balance = excluded.starting_balance,
      current_balance = excluded.current_balance, reset_timezone = excluded.reset_timezone, status = excluded.status,
      run_number = excluded.run_number, needs_verification = excluded.needs_verification, mt5_login = excluded.mt5_login,
      mt5_server = excluded.mt5_server, position = excluded.position, updated_at = now(), extra = excluded.extra;
    delete from public.accounts a where a.user_id = p_user
      and not exists (select 1 from json_array_elements(p_rows) e where e->>'id' = a.id);
  else
    insert into public.accounts (user_id, id, name, type, preset, starting_balance, current_balance, reset_timezone,
      status, run_number, needs_verification, mt5_login, mt5_server, position, created_at, updated_at, extra)
    select p_user, x.id, x.name, x.type, x.preset, x.starting_balance, x.current_balance, x.reset_timezone,
      coalesce(x.status,'active'), coalesce(x.run_number,1), coalesce(x.needs_verification,false), x.mt5_login, x.mt5_server,
      coalesce(x.position,0), coalesce(x.created_at, now()), now(), coalesce(x.extra,'{}'::json)
    from json_to_recordset(p_rows) as x(id text, name text, type text, preset text, starting_balance numeric, current_balance numeric,
      reset_timezone text, status text, run_number integer, needs_verification boolean, mt5_login text, mt5_server text,
      position integer, created_at timestamptz, extra json)
    on conflict (user_id, id) do nothing;
  end if;
end $$;

create or replace function public.journal_save_trades(p_user text, p_rows json, p_attachments json, p_mode text)
returns void language plpgsql as $$
begin
  if p_mode not in ('replace','insert_missing') then raise exception 'bad mode %', p_mode; end if;
  if p_mode = 'replace' then
    insert into public.trades as t (user_id, id, account_id, mode, symbol, direction, trade_date, open_time, close_time, pnl,
      r_multiple, result, strategy, timeframe, regime, session, source, mt5_ticket, notes, review_status, post_breach,
      position, created_at, updated_at, extra)
    select p_user, x.id, x.account_id, x.mode, x.symbol, x.direction, x.trade_date, x.open_time, x.close_time, x.pnl,
      x.r_multiple, x.result, x.strategy, x.timeframe, x.regime, x.session, x.source, x.mt5_ticket, x.notes, x.review_status,
      coalesce(x.post_breach,false), coalesce(x.position,0), coalesce(x.created_at, now()), now(), coalesce(x.extra,'{}'::json)
    from json_to_recordset(p_rows) as x(id text, account_id text, mode text, symbol text, direction text, trade_date date,
      open_time timestamptz, close_time timestamptz, pnl numeric, r_multiple numeric, result text, strategy text, timeframe text,
      regime text, session text, source text, mt5_ticket text, notes text, review_status text, post_breach boolean,
      position integer, created_at timestamptz, extra json)
    on conflict (user_id, id) do update set
      account_id = excluded.account_id, mode = excluded.mode, symbol = excluded.symbol, direction = excluded.direction,
      trade_date = excluded.trade_date, open_time = excluded.open_time, close_time = excluded.close_time, pnl = excluded.pnl,
      r_multiple = excluded.r_multiple, result = excluded.result, strategy = excluded.strategy, timeframe = excluded.timeframe,
      regime = excluded.regime, session = excluded.session, source = excluded.source, mt5_ticket = excluded.mt5_ticket,
      notes = excluded.notes, review_status = excluded.review_status,
      post_breach = t.post_breach or excluded.post_breach,     -- once post-breach, always post-breach
      position = excluded.position, updated_at = now(), extra = excluded.extra;
    delete from public.trades t where t.user_id = p_user
      and not exists (select 1 from json_array_elements(p_rows) e where e->>'id' = t.id);
    delete from public.trade_attachments a where a.user_id = p_user;
    insert into public.trade_attachments (user_id, trade_id, position, bucket, shot_id, storage_path, mime, bytes)
    select p_user, x.trade_id, x.position, coalesce(x.bucket,'trade-screenshots'), x.shot_id, x.storage_path, x.mime, x.bytes
    from json_to_recordset(p_attachments) as x(trade_id text, position integer, bucket text, shot_id text, storage_path text, mime text, bytes integer);
  else
    insert into public.trades (user_id, id, account_id, mode, symbol, direction, trade_date, open_time, close_time, pnl,
      r_multiple, result, strategy, timeframe, regime, session, source, mt5_ticket, notes, review_status, post_breach,
      position, created_at, updated_at, extra)
    select p_user, x.id, x.account_id, x.mode, x.symbol, x.direction, x.trade_date, x.open_time, x.close_time, x.pnl,
      x.r_multiple, x.result, x.strategy, x.timeframe, x.regime, x.session, x.source, x.mt5_ticket, x.notes, x.review_status,
      coalesce(x.post_breach,false), coalesce(x.position,0), coalesce(x.created_at, now()), now(), coalesce(x.extra,'{}'::json)
    from json_to_recordset(p_rows) as x(id text, account_id text, mode text, symbol text, direction text, trade_date date,
      open_time timestamptz, close_time timestamptz, pnl numeric, r_multiple numeric, result text, strategy text, timeframe text,
      regime text, session text, source text, mt5_ticket text, notes text, review_status text, post_breach boolean,
      position integer, created_at timestamptz, extra json)
    on conflict (user_id, id) do nothing;
    insert into public.trade_attachments (user_id, trade_id, position, bucket, shot_id, storage_path, mime, bytes)
    select p_user, x.trade_id, x.position, coalesce(x.bucket,'trade-screenshots'), x.shot_id, x.storage_path, x.mime, x.bytes
    from json_to_recordset(p_attachments) as x(trade_id text, position integer, bucket text, shot_id text, storage_path text, mime text, bytes integer)
    where exists (select 1 from public.trades t where t.user_id = p_user and t.id = x.trade_id)
    on conflict (user_id, trade_id, position) do nothing;
  end if;
end $$;

create or replace function public.journal_mark_migrated(p_user text, p_source text)
returns void language sql as $$
  insert into public.journal_migrated_users (user_id, source) values (p_user, p_source)
  on conflict (user_id) do nothing;
$$;

-- Only the server (service role) may call these.
revoke all on function public.journal_save_accounts(text, json, text)       from public, anon, authenticated;
revoke all on function public.journal_save_trades(text, json, json, text)   from public, anon, authenticated;
revoke all on function public.journal_mark_migrated(text, text)             from public, anon, authenticated;
grant execute on function public.journal_save_accounts(text, json, text)     to service_role;
grant execute on function public.journal_save_trades(text, json, json, text) to service_role;
grant execute on function public.journal_mark_migrated(text, text)           to service_role;

insert into public.schema_migrations (version) values ('001_relational') on conflict do nothing;

commit;
