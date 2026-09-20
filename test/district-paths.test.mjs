import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { districtPathIds } from '../public/js/district-paths.js';

test('the constituency map has one unique SVG path for every district', async () => {
  const entries = Object.entries(districtPathIds);
  const assignedPaths = entries.flatMap(([, pathIds]) => pathIds);
  const svg = await readFile(
    new URL('../public/maps/2026-russia-state-duma-constituencies.svg', import.meta.url),
    'utf8',
  );

  assert.equal(entries.length, 225);
  assert.deepEqual(entries.map(([districtId]) => Number(districtId)), Array.from({ length: 225 }, (_, index) => index + 1));
  assert.ok(entries.every(([, pathIds]) => pathIds.length === 1));
  assert.equal(new Set(assignedPaths).size, 225);

  assignedPaths.forEach((pathId) => {
    assert.match(svg, new RegExp(`\\bid=["']${pathId}["']`));
  });
});
