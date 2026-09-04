const test = require('node:test');
const assert = require('node:assert/strict');
const subscribe = require('../api/subscribe');

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

test('rejects non-POST requests', async () => {
  const response = createResponse();
  await subscribe({ method: 'GET' }, response);
  assert.equal(response.statusCode, 405);
});

test('rejects invalid email addresses', async () => {
  const response = createResponse();
  await subscribe({ method: 'POST', body: { email: 'not-an-email', startedAt: Date.now() - 2000 } }, response);
  assert.equal(response.statusCode, 400);
});

test('silently accepts honeypot submissions without forwarding', async () => {
  let forwarded = false;
  const originalFetch = global.fetch;
  global.fetch = async () => { forwarded = true; };
  const response = createResponse();
  await subscribe({ method: 'POST', body: { email: 'bot@example.com', company: 'spam', startedAt: Date.now() - 2000 } }, response);
  global.fetch = originalFetch;
  assert.equal(response.statusCode, 200);
  assert.equal(forwarded, false);
});

test('forwards valid signups to the configured email service', async () => {
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ success: 'true' }) };
  };

  const response = createResponse();
  await subscribe({ method: 'POST', body: { email: 'person@example.com', startedAt: Date.now() - 2000 } }, response);
  global.fetch = originalFetch;

  assert.equal(response.statusCode, 200);
  assert.match(request.url, /^https:\/\/formsubmit\.co\/ajax\//);
  assert.equal(JSON.parse(request.options.body).email, 'person@example.com');
});
