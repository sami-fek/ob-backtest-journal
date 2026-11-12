import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { sqliteAvailable, startLocalServer } from './local-server.js';

const skip = sqliteAvailable() ? false : 'better-sqlite3 not loadable on this Node version (use Node 20)';

// Local mock of Groq's chat completions endpoint — no real AI service is called.
function startMockGroq() {
  const requests = [];
  let nextReply = null;
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      requests.push({ auth: req.headers.authorization, body });
      const reply = nextReply || { status: 200, json: { choices: [{ message: { role: 'assistant', content: '**Main finding**\n- clean entry' } }] } };
      nextReply = null;
      res.writeHead(reply.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply.json));
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}/openai/v1/chat/completions`,
    requests,
    replyOnce(r) { nextReply = r; },
    close: () => new Promise(r => server.close(r))
  })));
}

const msgs = [{ role: 'user', content: 'Review my trade' }];

test('AI proxy: auth, configuration errors, model params, upstream errors', { skip }, async () => {
  const mock = await startMockGroq();
  const srv = await startLocalServer({ GROQ_API_KEY: 'test-key-not-real', GROQ_API_URL: mock.url });
  const noKey = await startLocalServer({ GROQ_API_URL: mock.url });
  try {
    // /api/health reports the key clearly
    assert.equal(srv.health.ai.groq, true);
    assert.match(srv.health.ai.coach, /ready/);
    assert.equal(noKey.health.ai.groq, false);
    assert.match(noKey.health.ai.coach, /GROQ_API_KEY is not set/);
    assert.equal('anthropic' in srv.health.ai, false);

    // Logged out → 401 with a readable message
    let r = await srv.client().call('POST', '/api/ai', { provider: 'groq', model: 'openai/gpt-oss-20b', messages: msgs });
    assert.equal(r.status, 401);
    assert.match(r.body.error, /sign in/i);

    const c = srv.client();
    r = await c.call('POST', '/api/auth/register', { email: 'ai@test.local', password: 'password123' });
    assert.equal(r.status, 201);

    // Text model: payload passed through with GPT-OSS reasoning params
    r = await c.call('POST', '/api/ai', { provider: 'groq', model: 'openai/gpt-oss-20b', messages: msgs });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.choices[0].message.content, 'Main finding\n• clean entry'); // markdown cleaned
    let sent = mock.requests.at(-1);
    assert.equal(sent.auth, 'Bearer test-key-not-real');
    assert.equal(sent.body.model, 'openai/gpt-oss-20b');
    assert.equal(sent.body.reasoning_effort, 'low');
    assert.equal(sent.body.include_reasoning, false);

    // Vision model: qwen3.8 gets reasoning_effort none and no include_reasoning
    r = await c.call('POST', '/api/ai', { provider: 'groq', model: 'qwen/qwen3.8-27b', messages: msgs });
    assert.equal(r.status, 200);
    sent = mock.requests.at(-1);
    assert.equal(sent.body.model, 'qwen/qwen3.8-27b');
    assert.equal(sent.body.reasoning_effort, 'none');
    assert.equal('include_reasoning' in sent.body, false);

    // Removed / unknown provider
    r = await c.call('POST', '/api/ai', { provider: 'anthropic', model: 'x', messages: msgs });
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'AI_UNKNOWN_PROVIDER');

    // Provider configured in code but key missing on server → clear 503
    r = await c.call('POST', '/api/ai', { provider: 'openai', model: 'x', messages: msgs });
    assert.equal(r.status, 503);
    assert.match(r.body.error, /OPENAI_API_KEY is not set/);

    // Upstream: decommissioned model → readable error passed to the UI
    mock.replyOnce({ status: 400, json: { error: { message: 'The model `qwen/qwen3.6-27b` has been decommissioned', type: 'invalid_request_error' } } });
    r = await c.call('POST', '/api/ai', { provider: 'groq', model: 'qwen/qwen3.6-27b', messages: msgs });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /decommissioned/);

    // Upstream: invalid key
    mock.replyOnce({ status: 401, json: { error: { message: 'Invalid API Key' } } });
    r = await c.call('POST', '/api/ai', { provider: 'groq', model: 'openai/gpt-oss-20b', messages: msgs });
    assert.equal(r.status, 502);
    assert.equal(r.body.code, 'AI_KEY_REJECTED');

    // Missing GROQ_API_KEY → clear 503
    const c2 = noKey.client();
    await c2.call('POST', '/api/auth/register', { email: 'ai2@test.local', password: 'password123' });
    r = await c2.call('POST', '/api/ai', { provider: 'groq', model: 'openai/gpt-oss-20b', messages: msgs });
    assert.equal(r.status, 503);
    assert.equal(r.body.code, 'AI_NOT_CONFIGURED');
    assert.match(r.body.error, /GROQ_API_KEY is not set/);
  } finally {
    await srv.stop();
    await noKey.stop();
    await mock.close();
  }
});
