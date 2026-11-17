-- 003_rule_overrides.sql  ·  BLOWN overrides (Part 3)
--
-- Run by Sami in Supabase › SQL Editor, after 001_relational.sql. Claude Code never runs this.
--
-- What it does
--   * Creates rule_overrides: one row each time you type BLOWN to log a manual trade on a
--     blown account, with its timestamp. Analytics shows the count. A row is used by at
--     most one trade (used_by_trade).
--   * Row level security on, with NO policies: only the server (service role) can read or
--     write it.
--
-- What it does NOT do: it touches no other table and moves no data.
-- Safe to run twice. Until it has run, the override is refused (nothing is ever let
-- through without its record) and the app says so.
--
-- Undo (deletes the override history):
--   drop table if exists public.rule_overrides;
--   delete from public.schema_migrations where version = '003_rule_overrides';

begin;

do $$
begin
  if not exists (select 1 from public.schema_migrations where version = '001_relational') then
    raise exception 'run migrations/001_relational.sql first';
  end if;
end $$;

create table if not exists public.rule_overrides (
  user_id       text        not null references public.users(id) on delete cascade,
  id            text        not null,                 -- 'ovr-<ms>-<random>'
  account_id    text        not null,
  run_number    integer     not null,
  created_at    timestamptz not null default now(),   -- when BLOWN was typed
  used_by_trade text,                                 -- the manual trade it let through
  used_at       timestamptz,
  primary key (user_id, id)
);
create index if not exists rule_overrides_account_idx on public.rule_overrides (user_id, account_id);

alter table public.rule_overrides enable row level security;

insert into public.schema_migrations (version) values ('003_rule_overrides') on conflict do nothing;

commit;
