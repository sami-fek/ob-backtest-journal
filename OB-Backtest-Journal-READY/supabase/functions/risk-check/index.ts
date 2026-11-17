// risk-check — called by the on demand or a cron, header x-cron-secret.
// The logic lives in ../_shared/handlers.js (tested in Node: test/edge-*.test.js).
import { handleRiskCheck } from '../_shared/handlers.js';
import { connect } from '../_shared/pg.ts';

const db = connect();
Deno.serve(req => handleRiskCheck(req, { db, env: (name: string) => Deno.env.get(name), fetchImpl: fetch }));
