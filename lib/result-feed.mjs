import { getProject, updateProjectFromSources, validateUpdate } from './data-store.mjs';
import { maxResultPayloadBytes, prepareResultPatch } from './result-data.mjs';

// This is the dashboard's JSON import contract, not an assumed CEC API format.
export async function refreshResultFeed({
  slug = '2026-russia-state-duma',
  url = process.env.RESULTS_FEED_URL,
  token = process.env.RESULTS_FEED_TOKEN,
  fetchImpl = fetch,
  persist = true,
  project
} = {}) {
  project ||= await getProject(slug);
  if (!url) return { configured: false, snapshot: project };
  const checkedAt = new Date().toISOString();
  let patch;
  try {
    const endpoint = new URL(url);
    if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Result feed must use HTTP(S).');
    const response = await fetchImpl(endpoint.href, {
      signal: AbortSignal.timeout(12_000),
      redirect: 'error',
      headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }
    });
    if (!response.ok) throw new Error(`Result feed returned HTTP ${response.status}.`);
    const text = await response.text();
    if (Buffer.byteLength(text) > maxResultPayloadBytes) throw new Error('Result feed is too large.');
    let payload;
    try { payload = JSON.parse(text); } catch { throw new Error('Result feed did not return valid JSON.'); }
    if (payload?.projectSlug !== slug) throw new Error('Result feed projectSlug does not match this election.');
    const { projectSlug, ...data } = payload;
    if (!Object.keys(data).length || Object.keys(data).some((key) => !['results', 'constituencyResults'].includes(key))) {
      throw new Error('Result feed must contain results and/or constituencyResults.');
    }
    const error = validateUpdate(data);
    if (error) throw new Error(error);
    // Check semantics here as well as at persistence time; dry runs validate too.
    prepareResultPatch(project, data);
    patch = {
      ...data,
      constituencyResults: {
        ...data.constituencyResults,
        feed: { status: 'online', lastChecked: checkedAt, lastSuccess: checkedAt, error: null }
      }
    };
    const prepared = prepareResultPatch(project, patch);
    const snapshot = persist ? await updateProjectFromSources(slug, patch) : {
      ...project,
      ...prepared,
      results: { ...project.results, ...patch.results },
      constituencyResults: { ...project.constituencyResults, ...prepared.constituencyResults }
    };
    return { configured: true, ok: true, snapshot };
  } catch (error) {
    const lastSuccess = project.constituencyResults.feed?.lastSuccess ?? null;
    // Avoid exposing feed URLs, credentials, or response bodies in the public API.
    const message = error.name === 'TimeoutError' ? 'Result feed timed out after 12s.'
      : error.message === 'fetch failed' ? 'Result feed could not be reached.'
        : error.message.slice(0, 200);
    patch = { constituencyResults: { feed: {
      status: lastSuccess ? 'stale' : 'offline', lastChecked: checkedAt, lastSuccess, error: message
    } } };
    const snapshot = persist ? await updateProjectFromSources(slug, patch) : {
      ...project, constituencyResults: { ...project.constituencyResults, ...patch.constituencyResults }
    };
    return { configured: true, ok: false, error: message, snapshot };
  }
}
