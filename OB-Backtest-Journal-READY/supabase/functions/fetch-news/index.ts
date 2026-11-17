// fetch-news — called by the external HTTP cron (DEPLOY.md), header x-cron-secret.
// The logic lives in ../_shared/handlers.js (tested in Node: test/edge-*.test.js).
import { handleFetchNews } from '../_shared/handlers.js';
import { connect } from '../_shared/pg.ts';

const db = connect();
Deno.serve(req => handleFetchNews(req, { db, env: (name: string) => Deno.env.get(name), fetchImpl: fetch }));
