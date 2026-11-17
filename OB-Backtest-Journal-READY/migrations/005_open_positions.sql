-- 005_open_positions.sql  ·  open MT5 positions (Part 7)
--
-- Run by Sami in Supabase › SQL Editor, after 004. Claude Code never runs this.
--
-- What it does
--   * mt5_positions: the positions open right now on each MT5 account, as MYJournalLogger
--     last reported them (the set is replaced on every report). They are NOT journal
--     entries: they never enter trades, expectancy or win rate. When a position closes, the
--     EA sends the closed position, it becomes one trades row (deduplicated on the ticket),
--     and it leaves this table.
--   * Row level security on, with no policies (server and functions only).
--
-- What it does NOT do: it changes no existing table and moves no data.
--
-- Safe to run twice.
--
-- Undo:
--   drop table if exists public.mt5_positions;
--   delete from public.schema_migrations where version = '005_open_positions';

begin;

do $$
begin
  if to_regclass('public.ea_keys') is null then
    raise exception 'Run migrations/004_edge_functions.sql first.';
  end if;
end $$;

create table if not exists public.mt5_positions (
  user_id       text        not null,
  account_id    text        not null,
  ticket        text        not null,                 -- MT5 position ticket (the closed trade's dedup key later)
  symbol        text,
  direction     text,                                 -- Buy / Sell
  volume        numeric,
  open_time     timestamptz,
  open_price    numeric,
  current_price numeric,
  sl            numeric,
  tp            numeric,
  profit        numeric,                              -- floating P/L
  swap          numeric,
  magic         text,
  comment       text,
  updated_at    timestamptz not null,                 -- when the EA last reported it
  primary key (user_id, account_id, ticket),
  foreign key (user_id, account_id) references public.accounts (user_id, id) on delete cascade
);

alter table public.mt5_positions enable row level security;

insert into public.schema_migrations (version) values ('005_open_positions') on conflict do nothing;

commit;
