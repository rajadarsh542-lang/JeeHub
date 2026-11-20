const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const ts = require('typescript');

// Run the production route and its imports in this isolated test process.
require.extensions['.ts'] = (module, filename) => {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.example.test';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
process.env.OPENAI_API_KEY = 'test-backend-key';

const { POST } = require('../app/api/questions/[id]/tutor/route.ts');
const questionId = '108f2c1e-b927-4b4e-90f7-437381912aa0';
const testUser = { id: '77f873c2-51a9-4e83-b582-608ef0804758', role: 'authenticated', is_anonymous: false };
const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = [encoded({ alg: 'HS256' }), encoded({ sub: testUser.id, role: 'authenticated' }), 'testsignature'].join('.');
const verified = { question_revision: 2, answer_md: 'B', solution_md: 'Use F = ma.\n\nDivide 12 N by 3 kg to get 4 m/s².' };
const question = {
  id: questionId, is_published: true, content_revision: 2,
  stem_md: 'A force of 12 N acts on a mass of 3 kg. Find its acceleration.',
  options: [{ id: 'A', content_md: '1 m/s²' }, { id: 'B', content_md: '4 m/s²' }],
  verified_solutions: [verified],
};
const answer = { disposition: 'answer', reply: 'Divide the force by the mass.', citations: ['solution-1'] };
const completion = (result) => ({
  choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(result) } }],
});
const json = (body, status = 200) => Response.json(body, { status });

function network(t, overrides = {}) {
  const calls = [];
  const responses = {
    '/auth/v1/user': () => json(testUser),
    '/rest/v1/questions': () => json([question]),
    '/rest/v1/rpc/consume_tutor_request': () => json(true),
    '/v1/chat/completions': () => json(completion(answer)),
    ...overrides,
  };
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const req = new Request(input, init);
    const url = new URL(req.url);
    calls.push({ req, url });
    assert.equal(url.origin, url.pathname === '/v1/chat/completions'
      ? 'https://api.openai.com' : 'https://project.example.test');
    assert.ok(responses[url.pathname], 'Unexpected request path ' + url.pathname);
    return responses[url.pathname](req);
  });
  return calls;
}

function submit(options = {}) {
  const id = options.id ?? questionId;
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, ...options.headers };
  const body = options.raw ?? JSON.stringify(options.body ?? { message: 'Is step mein divide kyun kiya?' });
  const req = new Request('http://localhost/api/questions/' + id + '/tutor', { method: 'POST', headers, body });
  return POST(req, { params: { id } });
}

function paths(calls) {
  return calls.map(({ url }) => url.pathname);
}

test('an authenticated Hinglish doubt uses the current verified solution and returns its citation', async (t) => {
  const calls = network(t);
  const res = await submit();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.questionId, questionId);
  assert.equal(data.questionRevision, 2);
  assert.equal(data.disposition, 'answer');
  assert.equal(data.reply, answer.reply);
  assert.deepEqual(data.citations, ['solution-1']);
  assert.match(res.headers.get('cache-control'), /no-store/i);
  assert.deepEqual(paths(calls), ['/auth/v1/user', '/rest/v1/questions', '/rest/v1/rpc/consume_tutor_request', '/v1/chat/completions']);
  const { req, url } = calls[1];
  assert.equal(req.headers.get('authorization'), 'Bearer ' + token);
  assert.equal(req.headers.get('apikey'), 'sb_publishable_test');
  assert.equal(url.searchParams.get('id'), 'eq.' + questionId);
  assert.equal(url.searchParams.get('is_published'), 'eq.true');
  assert.ok(url.searchParams.get('select').includes('verified_solutions'));
  assert.ok(!url.searchParams.get('select').includes('source_answer_key'));
  assert.equal(calls[2].req.method, 'POST');
  const modelRequest = await calls[3].req.json();
  assert.equal(modelRequest.model, 'gpt-4o-mini');
  assert.equal(modelRequest.response_format.json_schema.strict, true);
  assert.equal(modelRequest.store, false);
  const messages = JSON.stringify(modelRequest.messages);
  assert.ok(messages.includes('Divide 12 N by 3 kg'));
  assert.ok(messages.includes('Is step mein divide kyun kiya?'));
  assert.ok(!messages.includes(token));
});

for (const [label, options, status] of [
  ['missing bearer token', { headers: { Authorization: '' } }, 401],
  ['malformed question ID', { id: 'incorrect-id' }, 400],
  ['wrong content type', { headers: { 'Content-Type': 'text/plain' } }, 415],
  ['malformed JSON', { raw: '{' }, 400],
  ['client-supplied solution', { body: { message: 'Why?', solution: 'untrusted' } }, 400],
  ['blank doubt', { body: { message: '    ' } }, 400],
  ['oversized request', { body: { message: 'a'.repeat(8300) } }, 413],
]) {
  test(label + ' is rejected before contacting any provider', async (t) => {
    const calls = network(t);
    assert.equal((await submit(options)).status, status);
    assert.deepEqual(calls, []);
  });
}

for (const [label, result] of [
  ['expired session', () => json({ error: 'invalid' }, 401)],
  ['anonymous Supabase user', () => json({ ...testUser, is_anonymous: true })],
]) {
  test(label + ' cannot use the paid tutor', async (t) => {
    const calls = network(t, { '/auth/v1/user': result });
    assert.equal((await submit()).status, 401);
    assert.deepEqual(paths(calls), ['/auth/v1/user']);
  });
}

for (const [label, rows, status] of [
  ['absent or RLS-hidden question', [], 404],
  ['question without verified solution', [{ ...question, verified_solutions: [] }], 409],
  ['superseded verified solution', [{ ...question, verified_solutions: [{ ...verified, question_revision: 1 }] }], 409],
  ['question requiring an external diagram', [{ ...question, stem_md: 'Find x. ![Circuit](https://media.example.test/q.png)' }], 422],
]) {
  test(label + ' does not consume quota or invoke OpenAI', async (t) => {
    const calls = network(t, { '/rest/v1/questions': () => json(rows) });
    assert.equal((await submit()).status, status);
    assert.deepEqual(paths(calls), ['/auth/v1/user', '/rest/v1/questions']);
  });
}

test('at the daily limit the provider is never called', async (t) => {
  const calls = network(t, { '/rest/v1/rpc/consume_tutor_request': () => json(false) });
  assert.equal((await submit()).status, 429);
  assert.deepEqual(paths(calls), ['/auth/v1/user', '/rest/v1/questions', '/rest/v1/rpc/consume_tutor_request']);
});

test('a quota service outage fails closed', async (t) => {
  const calls = network(t, { '/rest/v1/rpc/consume_tutor_request': () => json({}, 503) });
  assert.equal((await submit()).status, 503);
  assert.ok(!paths(calls).includes('/v1/chat/completions'));
});

test('an off-topic classification returns the fixed refusal and discards the generated prose', async (t) => {
  const generated = 'This unrelated material must be discarded.';
  network(t, { '/v1/chat/completions': () => json(completion({ disposition: 'off_topic', reply: generated, citations: [] })) });
  const res = await submit({ body: { message: 'What is the capital of France?' } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.disposition, 'off_topic');
  assert.deepEqual(data.citations, []);
  assert.ok(data.reply && !data.reply.includes(generated));
});

test('an answer with an unknown citation cannot be shown to a student', async (t) => {
  network(t, { '/v1/chat/completions': () => json(completion({ ...answer, citations: ['missing-step'] })) });
  const res = await submit();
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.disposition, 'insufficient');
  assert.deepEqual(data.citations, []);
  assert.ok(!data.reply.includes(answer.reply));
});

test('a provider failure returns a sanitized, uncached error', async (t) => {
  network(t, { '/v1/chat/completions': () => json({ error: { message: 'do not expose provider diagnostics' } }, 500) });
  const res = await submit();
  assert.equal(res.status, 502);
  assert.match(res.headers.get('cache-control'), /no-store/i);
  assert.ok(!(await res.text()).includes('do not expose provider diagnostics'));
});
