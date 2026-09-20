import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { districtState, renderDistrictDetail } from '../public/js/district-results.js';

const directory = await mkdtemp(join(tmpdir(), 'vaali-results-'));
process.env.VaaliSeurain_DATA_DIR = directory;
process.env.DASHBOARD_EDIT_TOKEN = 'test-result-token';
const { handler } = await import('../server.mjs');
const { getProject, runtimeDirectory, updateProject, updateProjectFromSources } = await import('../lib/data-store.mjs');
assert.equal(runtimeDirectory, directory, 'Result API tests require process isolation and temporary storage.');
const { refreshResultFeed } = await import('../lib/result-feed.mjs');
after(() => rm(directory, { recursive: true, force: true }));

const slug = '2026-russia-state-duma';
const base = `/api/projects/${slug}`;
const timestamp = '2026-09-20T18:10:00Z';
const sourceUrl = 'https://example.org/official/district/1';
const districtUpdate = (id, changes = {}) => ({
  id, countedPercent: 12.5, ballotsCounted: 400,
  sourceId: 'cec-counter', sourceUrl, reportedAt: timestamp,
  results: [
    { name: 'Candidate B', party: 'Party B', votes: 100, sharePercent: 25 },
    { name: 'Candidate A', party: 'Party A', votes: 300, sharePercent: 75, color: '#123456' }
  ],
  ...changes
});

class Response extends Writable {
  chunks = [];
  writeHead(status, headers) { this.status = status; this.headers = headers; }
  _write(chunk, encoding, callback) { this.chunks.push(chunk.toString()); callback(); }
  get body() { return this.chunks.join(''); }
  get json() { return JSON.parse(this.body); }
}

async function request(path, { method = 'GET', body, token = 'test-result-token', stream = false } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  Object.assign(req, { method, url: path, headers: { host: 'localhost', authorization: `Bearer ${token}` } });
  const res = new Response();
  await handler(req, res);
  if (!stream && !res.writableFinished) await new Promise((resolve) => res.on('finish', resolve));
  return res;
}

test('result read APIs expose every pending district and return useful 404s', async () => {
  const results = await request(`${base}/results`);
  assert.equal(results.status, 200);
  assert.equal(results.json.results.parties.length, 0);
  assert.equal(results.json.constituencyResults.districts.length, 225);
  assert.equal((await request(`${base}/districts`)).json.districts.length, 225);
  assert.equal((await request(`${base}/districts/225`)).json.id, 225);
  assert.equal((await request(`${base}/districts/226`)).status, 404);
  assert.equal((await request('/api/projects/unknown/results')).status, 404);
});

test('authenticated partial results persist, preserve districts and reach the live stream', async () => {
  const stream = await request(`${base}/events`, { stream: true });
  try {
    const response = await request(base, { method: 'PATCH', body: {
      constituencyResults: { districts: [districtUpdate(1)] }
    } });
    assert.equal(response.status, 200);
    const districts = response.json.constituencyResults.districts;
    assert.equal(districts.length, 225);
    assert.equal(districts[0].registeredVoters, 340335);
    assert.ok(districts[0].name);
    assert.equal(districts[0].results[1].votes, 300);
    assert.equal(districts[1].countedPercent, undefined);
    const events = stream.body.split('\n\n').filter(Boolean).map((event) => JSON.parse(event.split('data: ')[1]));
    assert.equal(events.length, 2);
    assert.equal(events[1].constituencyResults.districts[0].ballotsCounted, 400);
    assert.equal(events[1].constituencyResults.districts.length, 225);
    const saved = JSON.parse(await readFile(join(directory, `${slug}.json`), 'utf8'));
    assert.equal(saved.constituencyResults.districts[0].reportedAt, timestamp);
    const read = (await request(`${base}/districts/1`)).json;
    assert.equal(read.results[0].votes, 100);
    const html = renderDistrictDetail(read, response.json.sourceHealth);
    assert.match(html, /300/);
    assert.match(html, /12.5%/);
    assert.match(html, /Leading: <strong>Candidate A/);
    assert.match(html, /CEC results/);
    assert.match(html, /Reported/);
    assert.ok(html.includes(sourceUrl));
    assert.ok(html.indexOf('Candidate A</span>') < html.indexOf('Candidate B</span>') || html.indexOf('Candidate A<small>') < html.indexOf('Candidate B<small>'));
  } finally { stream.destroy(); }
});

test('concurrent district updates and unrelated source refreshes retain every result', async () => {
  await Promise.all([
    updateProject(slug, { constituencyResults: { districts: [districtUpdate(2)] } }),
    updateProject(slug, { constituencyResults: { districts: [districtUpdate(3)] } }),
    updateProjectFromSources(slug, { turnout: { nationalPercent: 51 } })
  ]);
  const project = await getProject(slug);
  assert.equal(project.constituencyResults.districts.length, 225);
  assert.deepEqual(project.constituencyResults.districts.slice(0, 3).map((district) => district.ballotsCounted), [400, 400, 400]);
  assert.equal(project.turnout.nationalPercent, 51);
});

test('invalid, unauthorized and stale result updates leave the stored snapshot intact', async () => {
  const before = await getProject(slug);
  const invalid = [
    { constituencyResults: null },
    { constituencyResults: { districts: {} } },
    { constituencyResults: { districts: [districtUpdate('1')] } },
    { constituencyResults: { districts: [districtUpdate(226)] } },
    { constituencyResults: { districts: [districtUpdate(1), districtUpdate(1)] } },
    { constituencyResults: { districts: [districtUpdate(1, { countedPercent: 101 })] } },
    { constituencyResults: { districts: [districtUpdate(1, { ballotsCounted: -1 })] } },
    { constituencyResults: { districts: [districtUpdate(1, { results: [{ name: 'Bad', votes: '100' }] })] } },
    { constituencyResults: { districts: [districtUpdate(1, { reportedAt: null })] } },
    { constituencyResults: { districts: [districtUpdate(1, { sourceId: 'unknown' })] } },
    { constituencyResults: { districts: [districtUpdate(1, { sourceUrl: 'javascript:alert(1)' })] } },
    { constituencyResults: { districts: [{ id: 1, results: [] }] } },
    { results: { parties: 'bad' } },
    { results: { countedPercent: 10 } }
  ];
  for (const body of invalid) {
    const response = await request(base, { method: 'PATCH', body });
    assert.equal(response.status, 422, response.body);
  }
  assert.equal((await request(base, { method: 'PATCH', token: 'wrong', body: invalid[0] })).status, 401);
  assert.equal((await request(base, { method: 'PATCH', body: '{broken' })).status, 400);
  const stale = await request(base, { method: 'PATCH', body: {
    constituencyResults: { districts: [districtUpdate(1, { reportedAt: '2026-09-20T17:00:00Z' })] }
  } });
  assert.equal(stale.status, 409);
  assert.deepEqual(await getProject(slug), before);
});

test('candidate aliases replace earlier tallies and inherit explicit batch provenance', async () => {
  const response = await request(base, { method: 'PATCH', body: {
    constituencyResults: {
      sourceId: 'cec-counter', sourceUrl, reportedAt: '2026-09-20T18:20:00Z',
      districts: [{ id: 1, countedPercent: 100, status: 'called', winner: 'Candidate B',
        candidates: [{ name: 'Candidate B', votes: 500, sharePercent: 100 }] }]
    }
  } });
  assert.equal(response.status, 200);
  const district = response.json.constituencyResults.districts[0];
  assert.equal(district.results.length, 1);
  assert.equal(district.results[0].votes, 500);
  assert.equal(district.sourceUrl, sourceUrl);
  assert.equal(district.reportedAt, '2026-09-20T18:20:00Z');
  assert.equal(districtState(district).called, true);
});

test('configured JSON result feeds update national and district results; outages keep last good data', async () => {
  const payload = {
    projectSlug: slug,
    results: { countedPercent: 5, reportedAt: timestamp, sourceId: 'cec-counter', sourceUrl,
      parties: [{ name: 'Party A', votes: 3000, sharePercent: 60, seats: null }] },
    constituencyResults: { districts: [districtUpdate(225, { countedPercent: 0, ballotsCounted: 0, results: [{ name: 'Candidate C', votes: 0, sharePercent: 0 }] })] }
  };
  let calls = 0;
  const options = { url: 'https://example.org/results.json', token: 'private-token', fetchImpl: async (url, options) => {
    calls++;
    assert.equal(options.headers.authorization, 'Bearer private-token');
    return { ok: true, text: async () => JSON.stringify(payload) };
  } };
  const imported = await refreshResultFeed(options);
  assert.equal(calls, 1);
  assert.equal(imported.ok, true);
  assert.equal(imported.snapshot.constituencyResults.districts.length, 225);
  assert.equal(imported.snapshot.constituencyResults.districts[224].ballotsCounted, 0);
  assert.equal(imported.snapshot.results.parties[0].votes, 3000);
  assert.equal(imported.snapshot.results.seatsTotal, 450);
  assert.ok(!JSON.stringify(imported.snapshot).includes('private-token'));
  const failed = await refreshResultFeed({ ...options, fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(failed.ok, false);
  assert.equal(failed.snapshot.constituencyResults.feed.status, 'stale');
  assert.deepEqual(failed.snapshot.results, imported.snapshot.results);
  assert.deepEqual(failed.snapshot.constituencyResults.districts, imported.snapshot.constituencyResults.districts);
  for (const text of ['<html>upstream unavailable</html>', JSON.stringify({ ...payload, projectSlug: 'wrong-election' }), JSON.stringify({ ...payload, results: { countedPercent: 200 } })]) {
    const invalid = await refreshResultFeed({ ...options, fetchImpl: async () => ({ ok: true, text: async () => text }) });
    assert.equal(invalid.ok, false);
    assert.deepEqual(invalid.snapshot.results, imported.snapshot.results);
  }
});

test('district display handles pending counts, zero votes, ties, and escaped names', () => {
  assert.equal(districtState({}).reporting, false);
  assert.equal(districtState({ countedPercent: 0 }).reporting, false);
  assert.equal(districtState({ results: [{ name: 'A', votes: 100 }, { name: 'B', votes: 100 }] }).leader, null);
  const html = renderDistrictDetail({ id: 1, name: '<script>bad</script>', countedPercent: 0, ballotsCounted: 0,
    results: [{ name: '<b>Candidate</b>', votes: 0, sharePercent: 0 }] });
  assert.match(html, /0%/);
  assert.match(html, /&lt;b&gt;Candidate&lt;\/b&gt;/);
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('Leading:'));
});
