-- Run this once in Supabase Dashboard -> SQL Editor.
-- The kv table is the single persistence layer for journal and MT5 data.
-- The users table stores hashed credentials for multi-user auth.
--
-- MT5 KV key prefixes:
--   mt5_link:accountId        linked account metadata (token hash only)
--   mt5_state:accountId       latest account and open-position snapshot
--   mt5_history:accountId     deduplicated closed trades by ticket
--   mt5_token_hash:sha256     bridge-token ownership record

-- ── Users ─────────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id            text        primary key,
  email         text        not null unique,
  password_hash text,
  created_at    timestamptz not null default now()
);
create index if not exists users_email_idx on public.users (email);
alter table public.users enable row level security;
-- Service role bypasses RLS; no anonymous access policy is needed.

-- ── KV store ──────────────────────────────────────────────────────────────────
create table if not exists public.kv (
  session_id text        not null,
  key        text        not null,
  value      text        not null,
  updated_at timestamptz not null default now(),
  primary key (session_id, key)
);
create index if not exists kv_session_id_idx on public.kv (session_id);
create index if not exists kv_key_idx        on public.kv (key);
alter table public.kv enable row level security;
