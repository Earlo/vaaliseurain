import { parseCecTelegram, parsePageMetadata, parsePublicChamber, parseRbcElectionFeed } from './source-adapters.mjs';
import { getProject, updateProjectFromSources } from './data-store.mjs';

const slug = '2026-russia-state-duma';
const defaultInterval = 5 * 60_000;
const timeoutMs = 12_000;
const afpUrl = 'https://www.afp.com/en/russians-vote-last-day-parliamentary-elections';
const cecBoardUrl = 'https://rutube.ru/video/ecbcd4d14b222379a609bf90e36c4b19/';
const cecBoardEmbedUrl = 'https://rutube.ru/play/embed/ecbcd4d14b222379a609bf90e36c4b19';
const riaBroadcastUrl = 'https://live-rian.cdnvideo.ru/rian/pressPRESIDENT/playlist.m3u8';

const sources = [
  {
    id: 'cec-counter',
    url: 'https://cikrf.ru/analog/ediny-den-golosovaniya-2026/khod-golosovaniya/khod-golosovaniya.php?ID=2',
    kind: 'probe'
  },
  {
    id: 'cec-video',
    url: cecBoardUrl,
    kind: 'probe',
    integration: 'Embedded RUTUBE player'
  },
  {
    id: 'cec-telegram',
    url: 'https://t.me/s/cikrossii',
    supplementalUrls: ['https://t.me/s/cikrossii?q=%23%D0%94%D0%AD%D0%93'],
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
    url: 'https://rssexport.rbc.ru/rbcnews/news/30/full.rss',
    kind: 'rbc',
    integration: 'Automatic RSS'
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
    url: riaBroadcastUrl,
    kind: 'probe',
    integration: 'Direct HLS master playlist'
  },
  {
    id: 'afp',
    url: afpUrl,
    kind: 'metadata',
    reportKind: 'international context'
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

async function fetchText(url, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'VaaliSeurain/0.2 election source monitor'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSourceText(source, fetchImpl) {
  const primary = await fetchText(source.url, fetchImpl);
  if (!source.supplementalUrls?.length) return primary;

  const supplemental = await Promise.allSettled(
    source.supplementalUrls.map((url) => fetchText(url, fetchImpl))
  );
  return [primary, ...supplemental.filter((result) => result.status === 'fulfilled').map((result) => result.value)].join('\n');
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

function migrateSourceHealth(source) {
  if (source.id !== 'ap') return source;
  return {
    ...source,
    id: 'afp',
    name: 'Agence France-Presse',
    shortName: 'AFP',
    integration: 'Automatic metadata',
    status: 'offline',
    statusLabel: 'Awaiting first refresh',
    lastSuccess: null,
    error: null,
    url: afpUrl
  };
}

function migrateBroadcast(broadcast) {
  if (!broadcast) return broadcast;

  const streams = [broadcast.primary, broadcast.fallback].filter(Boolean);
  const cecStream = streams.find((stream) => stream.sourceId === 'cec-video' || stream.url === cecBoardUrl || stream.url === 'https://vkvideo.ru/@cikrussia');
  const riaStream = streams.find((stream) => stream.sourceId === 'ria-broadcast');
  if (!cecStream) return broadcast;

  return {
    ...broadcast,
    status: 'live',
    statusLabel: 'Live now',
    description: 'Live voting progress and preliminary results from the information board in the CEC hall.',
    primary: {
      ...cecStream,
      name: 'CEC results board · Day 3',
      label: 'Open live stream on RUTUBE',
      url: cecBoardUrl,
      embedUrl: cecBoardEmbedUrl,
      sourceId: 'cec-video',
      status: 'live',
      statusLabel: 'Live now'
    },
    fallback: {
      ...(riaStream || {}),
      name: riaStream?.name || 'RIA Novosti election-night stream',
      label: 'Open direct HLS stream',
      url: riaBroadcastUrl,
      sourceId: 'ria-broadcast',
      integration: 'Direct HLS master playlist',
      status: 'live',
      statusLabel: 'Live now'
    }
  };
}

function updateHealth(current, results, checkedAt) {
  const byId = new Map(results.map((result) => [result.id, result]));
  return current.map(migrateSourceHealth).map((source) => {
    const result = byId.get(source.id);
    if (!result) return source;
    if (result.ok) {
      return {
        ...source,
        url: result.parsed?.url || result.url || source.url,
        integration: result.integration || source.integration,
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
      const html = await fetchSourceText(source, fetchImpl);
      if (source.kind === 'cec') return { id: source.id, ok: true, parsed: parseCecTelegram(html), integration: source.integration, url: source.url };
      if (source.kind === 'rbc') return { id: source.id, ok: true, parsed: parseRbcElectionFeed(html), integration: source.integration, url: source.url };
      if (source.kind === 'public-chamber') return { id: source.id, ok: true, parsed: parsePublicChamber(html), integration: source.integration, url: source.url };
      if (source.kind === 'metadata') return { id: source.id, ok: true, parsed: parsePageMetadata(html, source.url), integration: source.integration, url: source.url };
      return { id: source.id, ok: true, parsed: null, integration: source.integration, url: source.url };
    } catch (error) {
      return { id: source.id, ok: false, error: conciseError(error), url: source.url };
    }
  }));

  const patch = {
    sourceHealth: updateHealth(project.sourceHealth, results, checkedAt),
    broadcast: migrateBroadcast(project.broadcast)
  };
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

  const rbc = results.find((result) => result.id === 'rbc' && result.ok)?.parsed;
  if (rbc) {
    const currentTurnout = patch.turnout || project.turnout;
    if (rbc.turnout && isNewer(rbc.turnout.reportedAt, currentTurnout.reportedAt)) {
      patch.turnout = {
        ...currentTurnout,
        ...rbc.turnout,
        status: 'reported',
        note: 'National turnout attributed by RBC to the CEC; electronic voting is included in the reported total.'
      };
    }
    patch.electronicVoting = (patch.electronicVoting || project.electronicVoting).map((item) => {
      const incoming = item.id === 'federal-deg' ? rbc.federalDeg : item.id === 'moscow-deg' ? rbc.moscowDeg : null;
      if (!incoming || (item.reportedAt && Date.parse(incoming.reportedAt) < Date.parse(item.reportedAt))) return item;
      return {
        ...item,
        ...incoming,
        status: 'reported',
        statusLabel: 'RBC live report · attributed figures'
      };
    });
    if (rbc.report) incomingReports.push(rbc.report);
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

  const currentReports = project.reports.filter((report) => report.sourceId !== 'ap');
  patch.reports = mergeReports(currentReports, incomingReports);
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

export const sourceRefreshInternals = { mergeReports, migrateBroadcast, parseRussianTimestamp, updateHealth };
