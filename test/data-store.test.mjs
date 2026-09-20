import test from 'node:test';
import assert from 'node:assert/strict';
import { auditSourceUsage, getProject, listProjects, validateUpdate } from '../lib/data-store.mjs';

test('project registry exposes the Duma election desk', async () => {
  const projects = await listProjects();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].slug, '2026-russia-state-duma');
  assert.equal(projects[0].sourceCount, 13);
});

test('Duma project preserves the source-aware dashboard model', async () => {
  const project = await getProject('2026-russia-state-duma');
  assert.equal(project.results.seatsTotal, 450);
  assert.equal(project.results.majoritySeats, 226);
  assert.equal(project.constituencyResults.districtCount, 225);
  assert.equal(project.constituencyResults.districts.length, 225);
  assert.equal(project.constituencyResults.districts[0].id, 1);
  assert.equal(project.constituencyResults.districts.at(-1).id, 225);
  assert.ok(project.constituencyResults.districts.every((district) => district.registeredVoters > 0));
  assert.ok(project.constituencyResults.districts.every((district) => district.region && district.name && district.officialName.includes('одномандатный')));
  assert.equal(project.electronicVoting.length, 2);
  assert.notEqual(project.electronicVoting[0].scope, project.electronicVoting[1].scope);
  assert.ok(project.sourceHealth.some((source) => source.id === 'cec-counter'));
  assert.ok(project.turnout.nationalPercent > 0 && project.turnout.nationalPercent <= 100);
  assert.ok(project.electronicVoting.every((item) => item.ballotsReceived > 0));
  assert.equal(project.broadcast.status, 'live');
  assert.equal(project.broadcast.primary.sourceId, 'cec-video');
  assert.match(project.broadcast.primary.embedUrl, /^https:\/\/rutube\.ru\/play\/embed\//);
  assert.deepEqual(auditSourceUsage(project).unused, []);
  assert.deepEqual(auditSourceUsage(project).unknown, []);
  assert.ok(project.reports.every((report) => report.sourceId && report.publishedAt && report.url));
  assert.ok(!/\b(mock|dummy|placeholder|sample)\b/i.test(JSON.stringify(project)));
});

test('unknown projects return null', async () => {
  assert.equal(await getProject('not-a-project'), null);
});

test('operator update validation rejects unknown top-level fields', () => {
  assert.match(validateUpdate({ surprise: true }), /Unsupported fields/);
  assert.equal(validateUpdate({ turnout: { nationalPercent: 55.2 } }), null);
  assert.equal(validateUpdate({ constituencyResults: { status: 'reporting' } }), null);
  assert.match(validateUpdate([]), /JSON object/);
});
