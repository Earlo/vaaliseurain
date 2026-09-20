import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProject, listProjects, subscribeToProject, updateProject, validateUpdate } from './lib/data-store.mjs';
import { maxResultPayloadBytes, ResultUpdateError } from './lib/result-data.mjs';
import { startDumaSourceRefresh } from './lib/source-refresh.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const publicDirectory = join(root, 'public');
const hlsRuntimePath = join(root, 'node_modules', 'hls.js', 'dist', 'hls.min.js');
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const editToken = process.env.DASHBOARD_EDIT_TOKEN || '';

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function json(response, status, payload, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxResultPayloadBytes) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function hasValidToken(request) {
  if (!editToken) return false;
  const authorization = request.headers.authorization || '';
  return authorization === `Bearer ${editToken}`;
}

async function serveStatic(pathname, response) {
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  if (pathname.startsWith('/projects/')) relativePath = '/dashboard.html';
  const cleanPath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(publicDirectory, cleanPath);

  if (!filePath.startsWith(publicDirectory)) return false;
  try {
    const details = await stat(filePath);
    if (!details.isFile()) return false;
    response.writeHead(200, {
      'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream',
      'cache-control': process.env.NODE_ENV === 'production' ? 'public, max-age=300' : 'no-cache',
      'x-content-type-options': 'nosniff'
    });
    createReadStream(filePath).pipe(response);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function serveHlsRuntime(response) {
  const details = await stat(hlsRuntimePath);
  response.writeHead(200, {
    'content-type': 'text/javascript; charset=utf-8',
    'cache-control': process.env.NODE_ENV === 'production' ? 'public, max-age=86400' : 'no-cache',
    'x-content-type-options': 'nosniff'
  });
  createReadStream(hlsRuntimePath).pipe(response);
}

export async function handler(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const projectMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)$/);
  const eventsMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/events$/);
  const resultsMatch = url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)\/(results|districts)(?:\/(\d+))?$/);

  try {
    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json(response, 200, { ok: true, time: new Date().toISOString() });
    }

    if (request.method === 'GET' && url.pathname === '/api/projects') {
      return json(response, 200, { projects: await listProjects() });
    }

    if (request.method === 'GET' && projectMatch) {
      const project = await getProject(projectMatch[1]);
      return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
    }

    if (request.method === 'GET' && resultsMatch) {
      const [, slug, resource, districtId] = resultsMatch;
      const project = await getProject(slug);
      if (!project) return json(response, 404, { error: 'Project not found' });
      if (resource === 'results' && !districtId) {
        return json(response, 200, { results: project.results, constituencyResults: project.constituencyResults });
      }
      if (resource === 'districts') {
        if (!districtId) return json(response, 200, project.constituencyResults);
        const district = project.constituencyResults?.districts.find((item) => item.id === Number(districtId));
        return district ? json(response, 200, district) : json(response, 404, { error: 'District not found' });
      }
    }

    if (request.method === 'PATCH' && projectMatch) {
      if (!editToken) return json(response, 503, { error: 'Operator updates are not enabled.' });
      if (!hasValidToken(request)) return json(response, 401, { error: 'A valid bearer token is required.' });
      let body;
      try {
        body = await readBody(request);
      } catch (error) {
        const status = error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
        return json(response, status, { error: status === 413 ? 'Payload too large.' : 'Invalid JSON body.' });
      }
      const validationError = validateUpdate(body);
      if (validationError) return json(response, 422, { error: validationError });
      const project = await updateProject(projectMatch[1], body);
      return project ? json(response, 200, project) : json(response, 404, { error: 'Project not found' });
    }

    if (request.method === 'GET' && eventsMatch) {
      const project = await getProject(eventsMatch[1]);
      if (!project) return json(response, 404, { error: 'Project not found' });
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no'
      });
      const send = (data) => {
        if (response.destroyed || response.writableEnded) return;
        response.write(`event: snapshot\ndata: ${JSON.stringify(data)}\n\n`);
      };
      let revision = 0;
      const unsubscribe = subscribeToProject(eventsMatch[1], (data) => { revision += 1; send(data); });
      send(project);
      const interval = setInterval(() => {
        const expectedRevision = revision;
        getProject(eventsMatch[1]).then((data) => {
          if (revision === expectedRevision) send(data);
        }).catch(() => response.end());
      }, 15_000);
      response.on('close', () => { clearInterval(interval); unsubscribe(); });
      return;
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/vendor/hls.min.js') {
      return serveHlsRuntime(response);
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      if (await serveStatic(url.pathname, response)) return;
    }

    return json(response, 404, { error: 'Not found' });
  } catch (error) {
    if (error instanceof ResultUpdateError) return json(response, error.status, { error: error.message });
    console.error(error);
    return json(response, 500, { error: 'Internal server error' });
  }
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1]);

if (isEntrypoint) {
  const { createServer } = await import('node:http');
  if (process.env.SOURCE_REFRESH_ENABLED !== 'false') startDumaSourceRefresh();
  createServer(handler).listen(port, host, () => {
    console.log(`VaaliSeurain is running at http://${host}:${port}`);
  });
}
