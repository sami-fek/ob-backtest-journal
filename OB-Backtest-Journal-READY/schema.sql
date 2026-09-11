-- Run this once in Supabase Dashboard -> SQL Editor.
create table if not exists public.kv (
  session_id text not null,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (session_id, key)
);
create index if not exists kv_session_id_idx on public.kv (session_id);
alter table public.kv enable row level security;
