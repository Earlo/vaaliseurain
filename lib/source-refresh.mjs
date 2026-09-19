import { parseCecTelegram, parsePageMetadata, parsePublicChamber } from './source-adapters.mjs';
import { getProject, updateProjectFromSources } from './data-store.mjs';

const slug = '2026-russia-state-duma';
const defaultInterval = 5 * 60_000;
const timeoutMs = 12_000;

const sources = [
  {
    id: 'cec-counter',
    url: 'https://cikrf.ru/analog/ediny-den-golosovaniya-2026/khod-golosovaniya/khod-golosovaniya.php?ID=2',
    kind: 'probe'
  },
  {
    id: 'cec-video',
    url: 'https://www.cikrf.ru/analog/ediny-den-golosovaniya-2026/informatsionnyy-tsentr-tsik-rossii/',
    kind: 'probe'
  },
  {
    id: 'cec-telegram',
    url: 'https://t.me/s/cikrossii',
    kind: 'cec'
  },
  {
    id: 'federal-deg',
    url: 'https://stat.vybory.gov.ru/',
    kind: 'probe'
  },
  {
    id: 'moscow-observer',
    url: 'https://observer.mos.ru/',
    kind: 'probe'
  },
  {
    id: 'rbc',
    url: 'https://www.rbc.ru/story/57d3fbaa9a794798429622f7',
    kind: 'probe'
  },
  {
    id: 'public-chamber',
    url: 'https://monitoring.oprf.ru/',
    kind: 'public-chamber'
  },
  {
    id: 'novaya',
    url: 'https://novayagazeta.eu/elections2026/online',
    kind: 'metadata',
    reportKind: 'independent live report'
  },
  {
    id: 'meduza',
    url: 'https://meduza.io/en/feature/2026/09/18/russia-s-state-duma-elections-begin-with-record-online-turnout-a-million-votes-in-occupied-donetsk-and-attempts-to-bribe-observers',
    kind: 'metadata',
    reportKind: 'independent report'
  },
  {
    id: 'doxa',
    url: 'https://g3nr6w6k61.execute-api.eu-central-1.amazonaws.com/news/2026-09-18-vybory-gosduma-deg-sboi-nablyudateli',
    kind: 'metadata',
    reportKind: 'independent report'
  },
  {
    id: 'vedomosti',
    url: 'https://www.vedomosti.ru/politics/news/2026/09/19/1230198-yavka-previsila-40',
    kind: 'probe'
  },
  {
    id: 'ria-broadcast',
    url: 'https://pressria.ru/20260920/959377040.html',
    kind: 'probe'
  },
  {
    id: 'ap',
    url: 'https://apnews.com/article/31a304d3156d9a066ff8001cf1338d7e',
    kind: 'probe'
  }
];

function isNewer(candidate, current) {
  if (!candidate) return false;
  if (!current) return true;
  return Date.parse(candidate) > Date.parse(current);
}

function conciseError(error) {
  if (error?.name === 'AbortError') return `Timed out after ${timeoutMs / 1000}s`;
  if (error?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || /timed?\s*out/i.test(error?.cause?.message || '')) {
    return `Timed out after ${timeoutMs / 1000}s`;
  }
  if (error?.cause?.message) return String(error.cause.message).slice(0, 160);
  return String(error?.message || error).slice(0, 160);
}

async function fetchText(source, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(source.url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'VaaliRaivo/0.2 election source monitor'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseRussianTimestamp(value) {
  if (!value) return null;
  const months = {
    января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5,
    июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11
  };
  const match = /^(\d{1,2})\s+([а-я]+)\s+(\d{4}),\s*(\d{2}):(\d{2}):(\d{2})$/iu.exec(value);
  if (!match || months[match[2].toLowerCase()] === undefined) return null;
  return new Date(Date.UTC(
    Number(match[3]), months[match[2].toLowerCase()], Number(match[1]),
    Number(match[4]) - 3, Number(match[5]), Number(match[6])
  )).toISOString();
}

function metadataReport(source, parsed) {
  if (!parsed.title) return null;
  return {
    id: `${source.id}-current`,
    kind: source.reportKind,
    sourceId: source.id,
    publishedAt: parsed.publishedAt,
    headline: parsed.title,
    summary: parsed.description,
    status: 'reported',
    url: parsed.url,
    automated: true
  };
}

function reportTime(report) {
  const value = Date.parse(report.publishedAt || 0);
  return Number.isFinite(value) ? value : 0;
}

function mergeReports(current, incoming) {
  const replacedSources = new Set(incoming.map((report) => report.sourceId));
  const retained = current.filter((report) => !replacedSources.has(report.sourceId));
  return [...incoming, ...retained]
    .filter((report, index, all) => all.findIndex((item) => item.id === report.id) === index)
    .sort((left, right) => reportTime(right) - reportTime(left))
    .slice(0, 12);
}

function updateHealth(current, results, checkedAt) {
  const byId = new Map(results.map((result) => [result.id, result]));
  return current.map((source) => {
    const result = byId.get(source.id);
    if (!result) return source;
    if (result.ok) {
      return {
        ...source,
        status: 'online',
        statusLabel: result.parsed ? 'Automatic feed live' : 'Page reachable',
        lastChecked: checkedAt,
        lastSuccess: checkedAt,
        error: null
      };
    }
    return {
      ...source,
      status: source.lastSuccess ? 'stale' : 'offline',
      statusLabel: source.lastSuccess ? 'Refresh failed · cached' : 'Unavailable from server',
      lastChecked: checkedAt,
      error: result.error
    };
  });
}

export async function refreshDumaSources({ fetchImpl = fetch, persist = true } = {}) {
  const project = await getProject(slug);
  if (!project) throw new Error(`Project ${slug} does not exist`);

  const checkedAt = new Date().toISOString();
  const results = await Promise.all(sources.map(async (source) => {
    try {
      const html = await fetchText(source, fetchImpl);
      if (source.kind === 'cec') return { id: source.id, ok: true, parsed: parseCecTelegram(html) };
      if (source.kind === 'public-chamber') return { id: source.id, ok: true, parsed: parsePublicChamber(html) };
      if (source.kind === 'metadata') return { id: source.id, ok: true, parsed: parsePageMetadata(html, source.url) };
      return { id: source.id, ok: true, parsed: null };
    } catch (error) {
      return { id: source.id, ok: false, error: conciseError(error) };
    }
  }));

  const patch = { sourceHealth: updateHealth(project.sourceHealth, results, checkedAt) };
  const incomingReports = [];
  const cec = results.find((result) => result.id === 'cec-telegram' && result.ok)?.parsed;
  if (cec) {
    incomingReports.push(...cec.reports);
    if (cec.turnout && isNewer(cec.turnout.reportedAt, project.turnout.reportedAt)) {
      patch.turnout = {
        ...project.turnout,
        ...cec.turnout,
        status: 'reported',
        note: 'National turnout as explicitly reported by the CEC; electronic-voting figures are included in the CEC total.'
      };
    }
    if (cec.federalDeg) {
      patch.electronicVoting = project.electronicVoting.map((item) => item.id === 'federal-deg' && isNewer(cec.federalDeg.reportedAt, item.reportedAt)
        ? {
            ...item,
            ...cec.federalDeg,
            status: 'reported',
            statusLabel: cec.federalDeg.approximate ? 'Official approximate count' : 'Official count'
          }
        : item);
    }
  }

  const chamber = results.find((result) => result.id === 'public-chamber' && result.ok)?.parsed;
  if (chamber?.report) {
    chamber.report.publishedAt = parseRussianTimestamp(chamber.timestamp) ?? checkedAt;
    chamber.report.metrics = chamber.metrics;
    incomingReports.push(chamber.report);
  }

  for (const source of sources.filter((item) => item.kind === 'metadata')) {
    const parsed = results.find((result) => result.id === source.id && result.ok)?.parsed;
    const report = parsed && metadataReport(source, parsed);
    if (report) incomingReports.push(report);
  }

  patch.reports = mergeReports(project.reports, incomingReports);
  const snapshot = persist ? await updateProjectFromSources(slug, patch) : { ...project, ...patch };
  return {
    checkedAt,
    sources: results.map(({ id, ok, error, parsed }) => ({ id, ok, error, parsed: Boolean(parsed) })),
    snapshot
  };
}

export function startDumaSourceRefresh({ intervalMs = Number(process.env.SOURCE_REFRESH_INTERVAL_MS) || defaultInterval } = {}) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await refreshDumaSources();
      const successful = result.sources.filter((source) => source.ok).length;
      console.log(`Election sources refreshed: ${successful}/${result.sources.length} reachable`);
    } catch (error) {
      console.error('Election source refresh failed:', error);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, Math.max(60_000, intervalMs));
  timer.unref();
  return () => clearInterval(timer);
}

export const sourceRefreshInternals = { mergeReports, parseRussianTimestamp, updateHealth };
