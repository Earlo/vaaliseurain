import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { maxResultPayloadBytes, prepareResultPatch, ResultUpdateError, validateResultPatch } from './result-data.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDirectory = join(root, 'data', 'projects');
export const runtimeDirectory = process.env.VaaliSeurain_DATA_DIR || join(root, 'data', 'runtime');

const clone = (value) => JSON.parse(JSON.stringify(value));
const pendingWrites = new Map();
const updates = new EventEmitter();
updates.setMaxListeners(0);

export function subscribeToProject(slug, listener) {
  updates.on(slug, listener);
  return () => updates.off(slug, listener);
}

export function auditSourceUsage(project) {
  const configured = new Set((project?.sourceHealth || []).map((source) => source.id));
  const referenced = new Set();

  const visit = (value, key = '') => {
    if (typeof value === 'string' && (key === 'sourceId' || key.endsWith('SourceId'))) {
      referenced.add(value);
      return;
    }
    if (Array.isArray(value)) {
      if (key === 'sourceIds' || key.endsWith('SourceIds')) value.forEach((id) => referenced.add(id));
      else value.forEach((item) => visit(item));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [childKey, childValue] of Object.entries(value)) {
      if (childKey === 'sourceHealth') continue;
      visit(childValue, childKey);
    }
  };

  visit(project);
  return {
    referenced: [...referenced].sort(),
    unused: [...configured].filter((id) => !referenced.has(id)).sort(),
    unknown: [...referenced].filter((id) => !configured.has(id)).sort()
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function mergeRecord(base, override, path = '') {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
    if (path === 'constituencyResults' && key === 'districts' && Array.isArray(value)) {
      const incoming = new Map(value.map((district) => [district.id, district]));
      output[key] = (output[key] || []).map((district) => mergeRecord(district, incoming.get(district.id)));
      continue;
    }
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      output[key] && typeof output[key] === 'object' && !Array.isArray(output[key])
    ) {
      output[key] = mergeRecord(output[key], value, path ? `${path}.${key}` : key);
    } else {
      output[key] = value;
    }
  }
  return output;
}

export async function listProjects() {
  const registry = await readJson(join(seedDirectory, 'index.json'));
  return registry.projects;
}

export async function getProject(slug) {
  const projects = await listProjects();
  const summary = projects.find((project) => project.slug === slug);
  if (!summary) return null;

  const seed = await readJson(join(seedDirectory, `${slug}.json`));
  try {
    const override = await readJson(join(runtimeDirectory, `${slug}.json`));
    return mergeRecord(seed, override);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return seed;
  }
}

async function writeProject(slug, patch, updateMode) {
  const current = await getProject(slug);
  if (!current) return null;

  const error = validateUpdate(patch);
  if (error) throw new ResultUpdateError(error);
  const next = mergeRecord(current, prepareResultPatch(current, patch));
  next.meta = {
    ...next.meta,
    lastUpdated: new Date().toISOString(),
    updateMode
  };

  await mkdir(runtimeDirectory, { recursive: true });
  const path = join(runtimeDirectory, `${slug}.json`);
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
  updates.emit(slug, clone(next));
  return next;
}

function persistProject(slug, patch, updateMode) {
  // Serialize read/merge/write so simultaneous district reports cannot lose data
  // or race over the same temporary file.
  const pending = (pendingWrites.get(slug) || Promise.resolve()).catch(() => {})
    .then(() => writeProject(slug, patch, updateMode));
  pendingWrites.set(slug, pending);
  const cleanup = () => { if (pendingWrites.get(slug) === pending) pendingWrites.delete(slug); };
  pending.then(cleanup, cleanup);
  return pending;
}

export async function updateProject(slug, patch) {
  return persistProject(slug, patch, 'operator');
}

export async function updateProjectFromSources(slug, patch) {
  return persistProject(slug, patch, 'automatic source refresh');
}

export function validateUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'The request body must be a JSON object.';
  }

  const allowed = new Set(['meta', 'results', 'constituencyResults', 'turnout', 'electronicVoting', 'timeline', 'reports', 'sourceHealth', 'broadcast']);
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length) return `Unsupported fields: ${unknown.join(', ')}`;

  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized) > maxResultPayloadBytes) return 'The update is too large.';
  return validateResultPatch(body);
}
