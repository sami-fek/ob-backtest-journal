-- Run this once in Supabase Dashboard -> SQL Editor.
-- The existing kv table remains the single persistence layer for journal and MT5 data.
-- MT5 documents are stored with these key prefixes:
--   mt5_link:accountId        linked account metadata (token hash only)
--   mt5_state:accountId       latest account and open-position snapshot
--   mt5_history:accountId     deduplicated closed trades by ticket
--   mt5_token_hash:sha256     bridge-token ownership record
create table if not exists public.kv (
  session_id text not null,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (session_id, key)
);
create index if not exists kv_session_id_idx on public.kv (session_id);
create index if not exists kv_key_idx on public.kv (key);
alter table public.kv enable row level security;
