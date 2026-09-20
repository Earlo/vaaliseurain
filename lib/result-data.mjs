const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const maxResultPayloadBytes = 2_000_000;
const hasValue = (value) => value !== null && value !== undefined;
const isTimestamp = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const isHttpUrl = (value) => {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
};

export class ResultUpdateError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

function validateNumbers(record, path, counts, percentages) {
  for (const key of counts) {
    if (hasValue(record[key]) && (!Number.isSafeInteger(record[key]) || record[key] < 0)) return `${path}.${key} must be a non-negative integer or null.`;
  }
  for (const key of percentages) {
    if (hasValue(record[key]) && (typeof record[key] !== 'number' || !Number.isFinite(record[key]) || record[key] < 0 || record[key] > 100)) return `${path}.${key} must be a number from 0 to 100 or null.`;
  }
  if (hasValue(record.reportedAt) && !isTimestamp(record.reportedAt)) return `${path}.reportedAt must be an ISO timestamp with a timezone.`;
  if (hasValue(record.sourceUrl) && !isHttpUrl(record.sourceUrl)) return `${path}.sourceUrl must be an HTTP(S) URL.`;
  if (hasValue(record.sourceId) && (typeof record.sourceId !== 'string' || !record.sourceId)) return `${path}.sourceId must be a non-empty string.`;
  return null;
}

function validateTallies(items, path) {
  if (!Array.isArray(items)) return `${path} must be an array.`;
  for (const item of items) {
    if (!isRecord(item) || typeof item.name !== 'string' || !item.name.trim()) return `${path} entries must have a name.`;
    const error = validateNumbers(item, path, ['votes', 'seats'], ['sharePercent']);
    if (error) return error;
  }
  return null;
}

export function validateResultPatch(patch) {
  for (const key of ['results', 'constituencyResults']) {
    if (!(key in patch)) continue;
    const section = patch[key];
    if (!isRecord(section)) return `${key} must be an object.`;
    const error = validateNumbers(section, key, ['seatsTotal', 'majoritySeats', 'listSeats', 'districtSeats', 'districtCount'], ['countedPercent']);
    if (error) return error;
    if ('parties' in section) {
      const error = validateTallies(section.parties, `${key}.parties`);
      if (error) return error;
    }
  }
  const section = patch.constituencyResults;
  if (!section || !('districts' in section)) return null;
  if (!Array.isArray(section.districts)) return 'constituencyResults.districts must be an array.';
  const ids = new Set();
  for (const district of section.districts) {
    if (!isRecord(district) || !Number.isSafeInteger(district.id) || district.id < 1) return 'Each district must have a positive integer id.';
    if (ids.has(district.id)) return `Duplicate district id: ${district.id}.`;
    ids.add(district.id);
    const path = `District ${district.id}`;
    const error = validateNumbers(district, path, ['registeredVoters', 'ballotsCounted'], ['countedPercent', 'turnoutPercent']);
    if (error) return error;
    if ('results' in district && 'candidates' in district) return `${path}: use results or candidates, not both.`;
    for (const key of ['results', 'candidates']) {
      if (!(key in district)) continue;
      const error = validateTallies(district[key], `${path}.${key}`);
      if (error) return error;
    }
  }
  return null;
}

function hasTally(record) {
  return ['countedPercent', 'ballotsCounted'].some((key) => hasValue(record[key])) ||
    ['results', 'candidates', 'parties'].some((key) => record[key]?.length) ||
    Boolean(record.winner) || ['called', 'final'].includes(record.status);
}

function stampResult(incoming, current, defaults, sources, label) {
  const result = { ...incoming };
  const changesTally = ['countedPercent', 'ballotsCounted', 'results', 'candidates', 'parties', 'winner', 'status']
    .some((key) => key in incoming);
  if (hasTally(incoming) || (hasTally(current) && changesTally)) {
    result.reportedAt = incoming.reportedAt ?? defaults.reportedAt;
    result.sourceId = incoming.sourceId ?? defaults.sourceId ?? current.sourceId;
    result.sourceUrl = incoming.sourceUrl ?? defaults.sourceUrl ?? current.sourceUrl;
    if (!isTimestamp(result.reportedAt)) throw new ResultUpdateError(`${label} requires reportedAt with a timezone.`);
    if (!sources.has(result.sourceId)) throw new ResultUpdateError(`${label} requires a configured sourceId.`);
    if (!isHttpUrl(result.sourceUrl)) throw new ResultUpdateError(`${label} requires a direct HTTP(S) sourceUrl.`);
  }
  if (result.sourceId && !sources.has(result.sourceId)) throw new ResultUpdateError(`${label} references an unknown sourceId.`);
  if (result.reportedAt && current.reportedAt && Date.parse(result.reportedAt) < Date.parse(current.reportedAt)) {
    throw new ResultUpdateError(`${label} is older than the stored result.`, 409);
  }
  if (hasTally(incoming) && !('status' in incoming)) {
    result.status = 'reporting';
    result.statusLabel = 'Preliminary results';
  }
  return result;
}

// District arrays are partial updates keyed by the stable constituency number.
// Candidate arrays within a district replace that district's previous tally.
export function prepareResultPatch(project, patch) {
  const error = validateResultPatch(patch);
  if (error) throw new ResultUpdateError(error);
  const next = structuredClone(patch);
  const sources = new Set(project.sourceHealth.map((source) => source.id));
  if (next.results) next.results = stampResult(next.results, project.results, {}, sources, 'National results');
  if (!next.constituencyResults) return next;
  const section = next.constituencyResults;
  const current = project.constituencyResults;
  if (section.sourceId && !sources.has(section.sourceId)) throw new ResultUpdateError('Constituency results reference an unknown sourceId.');
  if (!section.districts) return next;
  const byId = new Map(current.districts.map((district) => [district.id, district]));
  for (const district of section.districts) {
    if (!byId.has(district.id)) throw new ResultUpdateError(`Unknown district id: ${district.id}.`);
    const previous = byId.get(district.id);
    const update = stampResult(district, previous, { ...section, sourceId: section.sourceId ?? current.sourceId }, sources, `District ${district.id}`);
    if ('candidates' in update) {
      update.results = update.candidates;
      delete update.candidates;
    }
    const merged = { ...previous, ...update };
    delete merged.candidates;
    byId.set(district.id, merged);
  }
  section.districts = current.districts.map((district) => byId.get(district.id));
  const latest = section.districts.map((district) => district.reportedAt).filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  if (latest) {
    section.reportedAt = latest;
    const complete = section.districts.every((district) => ['final', 'called'].includes(district.status));
    section.status = complete ? 'final' : 'reporting';
    section.statusLabel = complete ? 'All constituencies called' : 'Preliminary constituency results';
  }
  return next;
}
