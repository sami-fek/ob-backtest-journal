// mt5-ingest — called by the MYJournalLogger (mt5/README.md), header x-ea-key.
// The logic lives in ../_shared/handlers.js (tested in Node: test/edge-*.test.js).
import { handleIngest } from '../_shared/handlers.js';
import { connect } from '../_shared/pg.ts';

const db = connect();
Deno.serve(req => handleIngest(req, { db, env: (name: string) => Deno.env.get(name), fetchImpl: fetch }));
