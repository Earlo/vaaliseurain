import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { districtPathIds } from '../public/js/district-paths.js';

test('the constituency map assigns every district polygon exactly once', async () => {
  const entries = Object.entries(districtPathIds);
  const assignedPaths = entries.flatMap(([, pathIds]) => pathIds);
  const svg = await readFile(
    new URL('../public/maps/2026-russia-state-duma-constituencies.svg', import.meta.url),
    'utf8',
  );
  const svgPathIds = [...svg.matchAll(/<path\b[^>]*\bid=["']([^"']+)["'][^>]*>/g)]
    .map(([, pathId]) => pathId);
  const nonDistrictPathIds = ['path37', 'path40', 'path58', 'path4920', 'path6568'];

  assert.equal(entries.length, 225);
  assert.deepEqual(entries.map(([districtId]) => Number(districtId)), Array.from({ length: 225 }, (_, index) => index + 1));
  assert.ok(entries.every(([, pathIds]) => pathIds.length === 1));
  assert.equal(new Set(assignedPaths).size, 225);
  assert.equal(new Set(svgPathIds).size, svgPathIds.length);
  assert.deepEqual(
    svgPathIds.filter((pathId) => !assignedPaths.includes(pathId)).sort(),
    nonDistrictPathIds.sort(),
  );

  assignedPaths.forEach((pathId) => {
    assert.match(svg, new RegExp(`\\bid=["']${pathId}["']`));
  });

  assert.deepEqual(districtPathIds[28], ['path6676']);
  assert.deepEqual(districtPathIds[164], ['path6680']);
  assert.deepEqual(districtPathIds[165], ['path4573']);
  assert.deepEqual(districtPathIds[166], ['path4570']);
  assert.deepEqual(districtPathIds[167], ['path4576']);
});
