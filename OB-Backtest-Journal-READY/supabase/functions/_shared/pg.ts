// pg.ts — the database for the Edge Functions: { query(sql, params) → rows, tx(fn) }.
// Direct Postgres through postgres.js. SUPABASE_DB_URL is provided by Supabase to every
// Edge Function; DB_URL (an Edge Function secret) overrides it, e.g. with the pooler URL.
// The functions connect as the database owner, so row level security does not block them;
// the browser has no way in (no policies, no anon access).
import postgres from 'npm:postgres@3.4.5';

type Rows = Record<string, unknown>[];
export interface Db {
  query(sql: string, params?: unknown[]): Promise<Rows>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

export function connect(): Db {
  const url = Deno.env.get('DB_URL') || Deno.env.get('SUPABASE_DB_URL');
  if (!url) throw new Error('SUPABASE_DB_URL is not available to this function');
  // prepare: false works with Supabase's transaction pooler as well as a direct connection.
  const sql = postgres(url, { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10 });
  // deno-lint-ignore no-explicit-any
  const wrap = (s: any): Db => ({
    query: async (text, params = []) => [...(await s.unsafe(text, params))] as Rows,
    tx: fn => s.begin((t: unknown) => fn(wrap(t))),
  });
  return wrap(sql);
}
