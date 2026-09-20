const entities = {
  amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»'
};

function decodeHtml(value = '') {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const radix = entity[1]?.toLowerCase() === 'x' ? 16 : 10;
      const digits = radix === 16 ? entity.slice(2) : entity.slice(1);
      const codePoint = Number.parseInt(digits, radix);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return entities[entity.toLowerCase()] ?? match;
  });
}

function textFromHtml(value = '') {
  return decodeHtml(value)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function firstMatch(value, pattern) {
  return pattern.exec(value)?.[1] ?? null;
}

function numberFromRussian(value) {
  if (!value) return null;
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) return null;
  if (/млрд/i.test(value)) return Math.round(amount * 1_000_000_000);
  if (/млн/i.test(value)) return Math.round(amount * 1_000_000);
  if (/тыс/i.test(value)) return Math.round(amount * 1_000);
  return Math.round(amount);
}

function xmlValue(block, tag) {
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const value = firstMatch(block, new RegExp(`<${escapedTag}[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, 'i')) ?? '';
  return textFromHtml(value.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, ''));
}

function headlineAndSummary(text) {
  const paragraphs = text.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  const headline = paragraphs[0] || 'Source update';
  const body = paragraphs.slice(1).join(' ');
  const summary = body.length > 280 ? `${body.slice(0, 277).trimEnd()}…` : body;
  return { headline, summary };
}

export function parseTelegramChannel(html, { channel = 'cikrossii' } = {}) {
  const starts = [...html.matchAll(/<div class="tgme_widget_message_wrap\b/g)].map((match) => match.index);
  const messages = [];

  for (let index = 0; index < starts.length; index += 1) {
    const block = html.slice(starts[index], starts[index + 1] ?? html.length);
    const post = firstMatch(block, /data-post="([^"]+)"/);
    const publishedAt = firstMatch(block, /<time[^>]+datetime="([^"]+)"/);
    const textStart = block.indexOf('tgme_widget_message_text js-message_text');
    const footerStart = block.indexOf('tgme_widget_message_footer', textStart);
    if (!post || !publishedAt || textStart === -1 || footerStart === -1) continue;

    const contentStart = block.indexOf('>', textStart) + 1;
    const text = textFromHtml(block.slice(contentStart, footerStart));
    if (!text) continue;
    messages.push({
      id: post.replace('/', '-'),
      post,
      publishedAt,
      url: `https://t.me/${post}`,
      text,
      ...headlineAndSummary(text),
      channel
    });
  }

  return messages;
}

function findLatestParsed(messages, parser) {
  return messages
    .map(parser)
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.reportedAt) - Date.parse(left.reportedAt))[0] ?? null;
}

function parseExplicitTimestamp(text, publishedAt) {
  const match = /(?:по состоянию на|as of)\s*(\d{1,2})[:.]([0-5]\d)(?:\s+(\d{1,2})\s+([а-я]+)\s+(\d{4})\s+года)?/iu.exec(text);
  if (!match) return publishedAt;

  const base = new Date(publishedAt);
  const months = {
    января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5,
    июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11
  };
  const year = match[5] ? Number(match[5]) : base.getUTCFullYear();
  const month = match[4] ? months[match[4].toLowerCase()] : base.getUTCMonth();
  const day = match[3] ? Number(match[3]) : base.getUTCDate();
  if (month === undefined) return publishedAt;
  return new Date(Date.UTC(year, month, day, Number(match[1]) - 3, Number(match[2]))).toISOString();
}

export function parseCecTelegram(html) {
  const messages = parseTelegramChannel(html)
    .filter((message, index, all) => all.findIndex((item) => item.post === message.post) === index);
  const relevant = messages.filter((message) => /#(?:Госдума9|ЕДГ2026)|Государственн[а-яё]* дум|выбор[а-яё]*|голосован/iu.test(message.text));
  const reports = relevant
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, 4)
    .map((message) => ({
      id: `cec-${message.id}`,
      kind: 'official update',
      sourceId: 'cec-telegram',
      publishedAt: message.publishedAt,
      headline: message.headline,
      summary: message.summary,
      status: 'reported',
      url: message.url,
      automated: true
    }));

  const federalDeg = findLatestParsed(relevant, (message) => {
    if (!/(?:#ДЭГ|дистанционн[а-яё]* электронн[а-яё]* голосован)/iu.test(message.text)) return null;
    const receivedText = firstMatch(message.text, /(?:Более\s+)?(\d+(?:[,.]\d+)?\s*(?:млн|тыс)?)[^\n.]{0,45}(?:проголосовал|голос)/iu);
    const issuedText = firstMatch(message.text, /(?:заявлен[а-яё]*[^\d]{0,80}|зарегистрир[а-яё]*[^\d]{0,80})(?:более\s+)?(\d+(?:[,.]\d+)?\s*(?:млн|тыс)?)/iu);
    const ballotsReceived = numberFromRussian(receivedText);
    const ballotsIssued = numberFromRussian(issuedText);
    if (!ballotsReceived) return null;
    return {
      ballotsReceived,
      ballotsIssued,
      participationPercent: ballotsIssued ? Number(((ballotsReceived / ballotsIssued) * 100).toFixed(1)) : null,
      reportedAt: parseExplicitTimestamp(message.text, message.publishedAt),
      sourceId: 'cec-telegram',
      sourceUrl: message.url,
      approximate: /более/iu.test(message.text)
    };
  });

  const turnout = findLatestParsed(relevant, (message) => {
    if (!/(?:общая|федеральн[а-яё]*|на выборах[^\n]{0,30})\s+явк/iu.test(message.text) || /#ДЭГ|электронн/iu.test(message.text)) return null;
    const value = firstMatch(message.text, /явк[а-яё]*[^\d]{0,35}(\d{1,3}(?:[,.]\d+)?)\s*%/iu);
    if (!value) return null;
    return {
      nationalPercent: Number(value.replace(',', '.')),
      reportedAt: parseExplicitTimestamp(message.text, message.publishedAt),
      sourceId: 'cec-telegram',
      sourceUrl: message.url
    };
  });

  return { messages, reports, federalDeg, turnout };
}

export function parseRbcElectionFeed(xml) {
  const electionItems = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map((match) => match[1])
    .filter((block) => /(?:Как (?:проходят|прошли) выборы в Госдуму|Главное о выборах в Госдуму|Как идет онлайн-голосование на выборах в Госдуму)/iu.test(xmlValue(block, 'title')));
  const item = electionItems.find((block) => /(?:Как (?:проходят|прошли) выборы в Госдуму|Главное о выборах в Госдуму)/iu.test(xmlValue(block, 'title')))
    ?? electionItems[0];
  if (!item) return null;

  const title = xmlValue(item, 'title');
  const url = xmlValue(item, 'link');
  const description = xmlValue(item, 'description');
  const fullText = xmlValue(item, 'rbc_news:full-text');
  const rawPublishedAt = xmlValue(item, 'rbc_news:newsModifDate') || xmlValue(item, 'pubDate');
  const parsedDate = Date.parse(rawPublishedAt);
  const publishedAt = Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : null;

  const turnoutText = firstMatch(fullText, /(?:общая|национальн[а-яё]*)\s+явк[а-яё]*[^\d]{0,35}(\d{1,3}(?:[,.]\d+)?)\s*%/iu);
  const federalCurrentMatch = /(?:С помощью федеральн[а-яё]* систем[а-яё]* дистанционн[а-яё]* электронн[а-яё]* голосован[а-яё]*\s*\(ДЭГ\)|На федеральн[а-яё]* платформ[а-яё]* ДЭГ)[^.]{0,160}?проголосовал[а-яё]*\s+(более\s+)?(\d+(?:[,.]\d+)?\s*(?:млрд|млн|тыс)?)[^.]{0,80}?\s+из\s+(\d+(?:[,.]\d+)?\s*(?:млрд|млн|тыс)?)\s+зарегистрир[а-яё]*(?:[^.]{0,50}?или\s+(\d{1,3}(?:[,.]\d+)?)\s*%)?/iu.exec(fullText);
  const federalRegisteredText = federalCurrentMatch?.[3]
    ?? firstMatch(fullText, /зарегистрировал[а-яё]*\s+(?:чуть\s+)?(?:более\s+)?(\d+(?:[,.]\d+)?\s*(?:млрд|млн|тыс)?)/iu);
  const federalVotedText = federalCurrentMatch?.[2]
    ?? firstMatch(fullText, /Из них проголосовал[а-яё]*\s+(?:чуть\s+)?(?:более\s+)?(\d+(?:[,.]\d+)?\s*(?:млрд|млн|тыс)?)/iu);
  const moscowCurrentMatch = /В Москве[^.]{0,220}?по федеральн[а-яё]* избирательн[а-яё]* округ[а-яё]* выдан[а-яё]*\s+(\d+(?:[,.]\d+)?\s*(?:млрд|млн|тыс)?)[^.]{0,80}?получен[а-яё]*\s+(\d+(?:[,.]\d+)?\s*(?:млрд|млн|тыс)?)/iu.exec(fullText);
  const moscowLegacyMatch = /примерно\s+(\d+(?:[,.]\d+)?\s*(?:млрд|млн|тыс)?)\s+из\s+(\d+(?:[,.]\d+)?\s*(?:млрд|млн|тыс)?)/iu.exec(fullText);
  const federalRegistered = numberFromRussian(federalRegisteredText);
  const federalVoted = numberFromRussian(federalVotedText);
  const moscowIssued = numberFromRussian(moscowCurrentMatch?.[1] ?? moscowLegacyMatch?.[2]);
  const moscowReceived = numberFromRussian(moscowCurrentMatch?.[2] ?? moscowLegacyMatch?.[1]);
  const federalParticipation = federalCurrentMatch?.[4]
    ? Number(federalCurrentMatch[4].replace(',', '.'))
    : null;
  const moscowParticipation = moscowCurrentMatch && moscowIssued && moscowReceived
    ? Number(((moscowReceived / moscowIssued) * 100).toFixed(1))
    : null;

  return {
    title,
    url,
    description,
    publishedAt,
    turnout: turnoutText ? {
      nationalPercent: Number(turnoutText.replace(',', '.')),
      reportedAt: publishedAt,
      sourceId: 'rbc',
      sourceUrl: url
    } : null,
    federalDeg: federalRegistered || federalVoted ? {
      ballotsIssuedLabel: 'Registered',
      ballotsReceivedLabel: 'Voted',
      ballotsIssued: federalRegistered,
      ballotsReceived: federalVoted,
      ballotsIssuedQualifier: federalCurrentMatch ? '' : (federalRegistered ? '>' : ''),
      ballotsReceivedQualifier: federalCurrentMatch?.[1] || (!federalCurrentMatch && federalVoted) ? '>' : '',
      participationPercent: federalParticipation,
      reportedAt: publishedAt,
      sourceId: 'rbc',
      monitorSourceId: 'federal-deg'
    } : null,
    moscowDeg: moscowIssued || moscowReceived ? {
      ballotsIssuedLabel: moscowCurrentMatch ? 'Electronic ballots issued' : 'Eligible voters',
      ballotsReceivedLabel: moscowCurrentMatch ? 'Electronic ballots received' : 'Voted',
      ballotsIssued: moscowIssued,
      ballotsReceived: moscowReceived,
      ballotsIssuedQualifier: moscowCurrentMatch ? '' : (moscowIssued ? '≈' : ''),
      ballotsReceivedQualifier: moscowCurrentMatch ? '' : (moscowReceived ? '≈' : ''),
      participationPercent: moscowParticipation,
      reportedAt: publishedAt,
      sourceId: 'rbc',
      monitorSourceId: 'moscow-observer'
    } : null,
    report: title && url ? {
      id: 'rbc-election-live',
      kind: 'election live report',
      sourceId: 'rbc',
      publishedAt,
      headline: title,
      summary: description,
      status: 'reported',
      url,
      automated: true
    } : null
  };
}

const publicChamberCounters = [
  ['calls', 'Calls from the call centre'],
  ['hotlineAppeals', 'Hotline appeals'],
  ['deviationsReported', 'Reported Gold Standard deviations'],
  ['deviationsConfirmed', 'Confirmed deviations'],
  ['deviationsRejected', 'Unconfirmed deviations'],
  ['problemsResolved', 'Resolved problems'],
  ['reportsOpen', 'Reports under review'],
  ['stationsViewed', 'Polling stations viewed']
];

export function parsePublicChamber(html) {
  const timestamp = firstMatch(html, /Информация с участков[\s\S]*?(\d{1,2}\s+[а-я]+\s+\d{4},\s*\d{2}:\d{2}:\d{2})/iu);
  const values = [...html.matchAll(/\$\('#clock\d+'\)\.FlipClock\((\d+)/g)].map((match) => Number(match[1]));
  const metrics = Object.fromEntries(publicChamberCounters.map(([key], index) => [key, values[index] ?? null]));
  const headlines = [...html.matchAll(/<span class="item-date">([^<]+)<\/span>\s*<span class="item-text">([\s\S]*?)<\/span>/g)]
    .map((match, index) => ({
      id: `public-chamber-${match[1].trim().replace(/\D/g, '')}-${index}`,
      date: match[1].trim(),
      headline: textFromHtml(match[2]),
      url: 'https://monitoring.oprf.ru/',
      sourceId: 'public-chamber'
    }));

  const compact = [
    `${metrics.hotlineAppeals ?? '—'} hotline appeals`,
    `${metrics.deviationsReported ?? '—'} deviations reported`,
    `${metrics.deviationsConfirmed ?? '—'} confirmed`,
    `${metrics.deviationsRejected ?? '—'} unconfirmed`,
    `${metrics.problemsResolved ?? '—'} resolved`,
    `${metrics.reportsOpen ?? '—'} under review`
  ].join(' · ');

  return {
    timestamp,
    metrics,
    headlines,
    report: headlines[0] ? {
      id: 'public-chamber-current',
      kind: 'official-aligned monitor',
      sourceId: 'public-chamber',
      publishedAt: null,
      headline: headlines[0].headline,
      summary: compact,
      status: 'reported',
      url: headlines[0].url,
      automated: true
    } : null
  };
}

export function parsePageMetadata(html, fallbackUrl) {
  const property = (name) => firstMatch(html, new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
    ?? firstMatch(html, new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i'));
  const title = property('og:title') ?? textFromHtml(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? '');
  const rawDescription = property('og:description') ?? property('description') ?? '';
  const description = /^[.\s]*$/.test(rawDescription) ? '' : rawDescription;
  const publishedAt = property('article:published_time')
    ?? firstMatch(html, /"datePublished"\s*:\s*"([^"]+)"/i)
    ?? firstMatch(html, /<time[^>]+datetime="([^"]+)"[^>]+(?:itemprop="datePublished"|data-public-date)/i)
    ?? property('article:modified_time');
  const url = property('og:url') ?? fallbackUrl;
  return {
    title: decodeHtml(title).trim(),
    description: decodeHtml(description).trim(),
    publishedAt,
    url
  };
}

export const sourceAdapterInternals = { decodeHtml, numberFromRussian, textFromHtml };
