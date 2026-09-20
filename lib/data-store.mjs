import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const seedDirectory = join(root, 'data', 'projects');
const runtimeDirectory = process.env.VAALIRAIVO_DATA_DIR || join(root, 'data', 'runtime');

const clone = (value) => JSON.parse(JSON.stringify(value));

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

function mergeRecord(base, override) {
  if (!override || typeof override !== 'object' || Array.isArray(override)) return base;
  const output = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      output[key] && typeof output[key] === 'object' && !Array.isArray(output[key])
    ) {
      output[key] = mergeRecord(output[key], value);
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

async function persistProject(slug, patch, updateMode) {
  const current = await getProject(slug);
  if (!current) return null;

  const next = mergeRecord(current, clone(patch));
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
  return next;
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
  if (serialized.length > 250_000) return 'The update is too large.';
  return null;
}
