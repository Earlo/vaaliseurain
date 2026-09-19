import test from 'node:test';
import assert from 'node:assert/strict';
import { getProject, listProjects, validateUpdate } from '../lib/data-store.mjs';

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
  assert.equal(project.electronicVoting.length, 2);
  assert.notEqual(project.electronicVoting[0].scope, project.electronicVoting[1].scope);
  assert.ok(project.sourceHealth.some((source) => source.id === 'cec-counter'));
  assert.equal(project.turnout.nationalPercent, 40.07);
  assert.equal(project.electronicVoting[0].ballotsReceived, 3_230_000);
});

test('unknown projects return null', async () => {
  assert.equal(await getProject('not-a-project'), null);
});

test('operator update validation rejects unknown top-level fields', () => {
  assert.match(validateUpdate({ surprise: true }), /Unsupported fields/);
  assert.equal(validateUpdate({ turnout: { nationalPercent: 55.2 } }), null);
  assert.match(validateUpdate([]), /JSON object/);
});
