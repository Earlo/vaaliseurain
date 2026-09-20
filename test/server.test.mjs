import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { handler } from '../server.mjs';

class MockRequest extends Readable {
  constructor({ method = 'GET', url = '/', headers = {}, body = '' } = {}) {
    super();
    this.method = method;
    this.url = url;
    this.headers = { host: 'localhost', ...headers };
    this.body = body;
  }

  _read() {
    if (this.body) this.push(this.body);
    this.body = '';
    this.push(null);
  }
}

class MockResponse extends Writable {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    this.headers = headers;
    return this;
  }

  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }

  get body() {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

async function invoke(options) {
  const request = new MockRequest(options);
  const response = new MockResponse();
  const finished = new Promise((resolve, reject) => {
    response.on('finish', resolve);
    response.on('error', reject);
  });
  await handler(request, response);
  await finished;
  return response;
}

test('health endpoint reports readiness', async () => {
  const response = await invoke({ url: '/api/health' });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.ok(Date.parse(body.time));
});

test('project API returns a complete snapshot', async () => {
  const response = await invoke({ url: '/api/projects/2026-russia-state-duma' });
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.meta.title, 'State Duma 2026');
  assert.equal(body.sourceHealth.length, 13);
  assert.equal(body.constituencyResults.districts.length, 225);
});

test('project route serves the dashboard shell', async () => {
  const response = await invoke({ url: '/projects/2026-russia-state-duma' });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /text\/html/);
  assert.match(response.body, /id="dashboard"/);
});

test('serves the 2026 constituency boundary map', async () => {
  const response = await invoke({ url: '/maps/2026-russia-state-duma-constituencies.svg' });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /image\/svg\+xml/);
  assert.match(response.body, /225 constituencies established for the 2026/);
});

test('operator endpoint is closed when no token is configured', async () => {
  const response = await invoke({
    method: 'PATCH',
    url: '/api/projects/2026-russia-state-duma',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ turnout: { nationalPercent: 50 } })
  });
  assert.equal(response.statusCode, 503);
});
