import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCecTelegram, parsePageMetadata, parsePublicChamber, parseRbcElectionFeed } from '../lib/source-adapters.mjs';
import { sourceRefreshInternals } from '../lib/source-refresh.mjs';

test('CEC Telegram adapter extracts attributed reports and explicit DEG figures', () => {
  const html = `
    <div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="cikrossii/99">
      <div class="tgme_widget_message_text js-message_text"><b>ДЭГ: новый отчет</b><br>3,23 млн человек проголосовали посредством #ДЭГ.<br>Заявления подали 4,04 млн человек.<br>*По состоянию на 17:15 19 сентября 2026 года<br>#Госдума9</div>
      <div class="tgme_widget_message_footer"><time datetime="2026-09-19T14:16:00+00:00">14:16</time></div>
    </div></div>
    <div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="cikrossii/100">
      <div class="tgme_widget_message_text js-message_text">Доступ к дистанционному электронному голосованию обеспечен через спутниковую связь.<br>#Госдума9</div>
      <div class="tgme_widget_message_footer"><time datetime="2026-09-20T08:43:48+00:00">08:43</time></div>
    </div></div>`;

  const result = parseCecTelegram(html);
  assert.equal(result.messages.length, 2);
  assert.equal(result.reports[0].url, 'https://t.me/cikrossii/100');
  assert.equal(result.federalDeg.ballotsReceived, 3_230_000);
  assert.equal(result.federalDeg.ballotsIssued, 4_040_000);
  assert.equal(result.federalDeg.participationPercent, 80);
  assert.equal(result.federalDeg.reportedAt, '2026-09-19T14:15:00.000Z');
});

test('Public Chamber adapter extracts all eight counters and its latest claim', () => {
  const html = `
    <h2>Информация с участков <div>19 сентября 2026, 19:27:18</div></h2>
    <span class="item-date">19.09.2026</span> <span class="item-text">Грубых нарушений не зафиксировано</span>
    <script>
      $('#clock1').FlipClock(11279, {}); $('#clock2').FlipClock(296, {});
      $('#clock3').FlipClock(238, {}); $('#clock4').FlipClock(2, {});
      $('#clock5').FlipClock(129, {}); $('#clock6').FlipClock(9, {});
      $('#clock7').FlipClock(98, {}); $('#clock8').FlipClock(8380, {});
    </script>`;

  const result = parsePublicChamber(html);
  assert.equal(result.metrics.deviationsConfirmed, 2);
  assert.equal(result.metrics.stationsViewed, 8380);
  assert.match(result.report.summary, /238 deviations reported/);
  assert.equal(result.report.headline, 'Грубых нарушений не зафиксировано');
});

test('RBC RSS adapter keeps qualifiers and separates federal from Moscow DEG', () => {
  const xml = `<rss><channel><item>
    <title><![CDATA[Как идет онлайн-голосование на выборах в Госдуму. Интерактивная карта]]></title>
    <link>https://www.rbc.ru/politics/18/09/2026/example</link>
    <pubDate>Sat, 19 Sep 2026 22:51:19 +0300</pubDate>
    <description><![CDATA[Последние данные по явке&nbsp;— в инфографике РБК]]></description>
    <rbc_news:newsModifDate>Sat, 19 Sep 2026 22:51:22 +0300</rbc_news:newsModifDate>
    <rbc_news:full-text><![CDATA[
      Для участия в ДЭГ зарегистрировались чуть более 4 млн человек. Из них проголосовали более 3,3 млн.
      В Москве заранее подавать заявку было не нужно: примерно 2,8 млн из 7,8 млн человек.
    ]]></rbc_news:full-text>
  </item></channel></rss>`;

  const result = parseRbcElectionFeed(xml);
  assert.equal(result.publishedAt, '2026-09-19T19:51:22.000Z');
  assert.equal(result.federalDeg.ballotsIssued, 4_000_000);
  assert.equal(result.federalDeg.ballotsReceived, 3_300_000);
  assert.equal(result.federalDeg.ballotsReceivedQualifier, '>');
  assert.equal(result.moscowDeg.ballotsIssued, 7_800_000);
  assert.equal(result.moscowDeg.ballotsReceived, 2_800_000);
  assert.equal(result.moscowDeg.ballotsReceivedQualifier, '≈');
  assert.equal(result.report.url, 'https://www.rbc.ru/politics/18/09/2026/example');
});

test('RBC RSS adapter reads the current election live report, turnout and exact Moscow counters', () => {
  const xml = `<rss><channel><item>
    <title><![CDATA[Как проходят выборы в Госдуму. Главное]]></title>
    <link>https://www.rbc.ru/politics/18/09/2026/current</link>
    <pubDate>Sun, 20 Sep 2026 12:15:23 +0300</pubDate>
    <description><![CDATA[Главное о ходе голосования&nbsp;— в материале РБК]]></description>
    <rbc_news:newsModifDate>Sun, 20 Sep 2026 12:15:37 +0300</rbc_news:newsModifDate>
    <rbc_news:full-text><![CDATA[
      По данным ЦИК примерно на 12:00 мск 20 сентября, общая явка составляет 48,27%.
      С помощью федеральной системы дистанционного электронного голосования (ДЭГ) к 12:00 мск проголосовали более 3,4 млн избирателей из 4,03 млн зарегистрированных участников, или 86,77%.
      В Москве к 12:00 мск по федеральному избирательному округу выдано 2,99 млн электронных бюллетеней, получено 2,9 млн.
    ]]></rbc_news:full-text>
  </item></channel></rss>`;

  const result = parseRbcElectionFeed(xml);
  assert.equal(result.publishedAt, '2026-09-20T09:15:37.000Z');
  assert.equal(result.turnout.nationalPercent, 48.27);
  assert.equal(result.federalDeg.ballotsIssued, 4_030_000);
  assert.equal(result.federalDeg.ballotsReceived, 3_400_000);
  assert.equal(result.federalDeg.ballotsIssuedQualifier, '');
  assert.equal(result.federalDeg.ballotsReceivedQualifier, '>');
  assert.equal(result.federalDeg.participationPercent, 86.77);
  assert.equal(result.moscowDeg.ballotsIssued, 2_990_000);
  assert.equal(result.moscowDeg.ballotsReceived, 2_900_000);
  assert.equal(result.moscowDeg.ballotsIssuedLabel, 'Electronic ballots issued');
  assert.equal(result.moscowDeg.ballotsReceivedLabel, 'Electronic ballots received');
  assert.equal(result.moscowDeg.participationPercent, 97);
  assert.equal(result.report.id, 'rbc-election-live');
});

test('metadata adapter uses Open Graph values without copying article bodies', () => {
  const html = `<html><head>
    <meta property="og:title" content="Election update &amp; context">
    <meta property="og:description" content="Short source description">
    <meta property="article:published_time" content="2026-09-19T12:00:00Z">
    <meta property="og:url" content="https://example.test/story">
  </head><body>Full copyrighted article body</body></html>`;
  assert.deepEqual(parsePageMetadata(html, 'https://fallback.test'), {
    title: 'Election update & context',
    description: 'Short source description',
    publishedAt: '2026-09-19T12:00:00Z',
    url: 'https://example.test/story'
  });
});

test('metadata adapter falls back to structured publication dates and drops empty descriptions', () => {
  const html = `<meta property="og:title" content="Current report"><meta name="description" content=".">
    <script type="application/ld+json">{"datePublished":"2026-09-18T15:02:29Z","description":"Full body is deliberately ignored"}</script>`;
  assert.deepEqual(parsePageMetadata(html, 'https://example.test/report'), {
    title: 'Current report',
    description: '',
    publishedAt: '2026-09-18T15:02:29Z',
    url: 'https://example.test/report'
  });
});

test('automatic reports replace prior entries from that source and retain other editorial snapshots', () => {
  const current = [
    { id: 'old-auto', sourceId: 'cec-telegram', automated: true, publishedAt: '2026-09-19T10:00:00Z' },
    { id: 'old-curated', sourceId: 'cec-telegram', publishedAt: '2026-09-19T10:30:00Z' },
    { id: 'editorial', sourceId: 'ap', publishedAt: '2026-09-19T11:00:00Z' }
  ];
  const incoming = [{ id: 'new-auto', sourceId: 'cec-telegram', automated: true, publishedAt: '2026-09-19T12:00:00Z' }];
  assert.deepEqual(sourceRefreshInternals.mergeReports(current, incoming).map((report) => report.id), ['new-auto', 'editorial']);
});

test('source health migration replaces the blocked AP probe with AFP metadata', () => {
  const [source] = sourceRefreshInternals.updateHealth(
    [{ id: 'ap', name: 'Associated Press', shortName: 'AP', status: 'stale', lastSuccess: '2026-09-19T12:00:00Z' }],
    [{ id: 'afp', ok: true, parsed: { url: 'https://www.afp.com/en/report' }, integration: 'Automatic metadata' }],
    '2026-09-20T10:00:00Z'
  );
  assert.equal(source.id, 'afp');
  assert.equal(source.name, 'Agence France-Presse');
  assert.equal(source.status, 'online');
  assert.equal(source.url, 'https://www.afp.com/en/report');
});

test('broadcast migration promotes CEC and replaces the RIA page with its HLS master playlist', () => {
  const broadcast = sourceRefreshInternals.migrateBroadcast({
    primary: { url: 'https://pressria.ru/current', sourceId: 'ria-broadcast' },
    fallback: { name: 'CEC on VK Video', url: 'https://vkvideo.ru/@cikrussia', sourceId: 'cec-video' }
  });
  assert.equal(broadcast.status, 'live');
  assert.equal(broadcast.primary.name, 'CEC results board · Day 3');
  assert.equal(broadcast.primary.url, 'https://rutube.ru/video/ecbcd4d14b222379a609bf90e36c4b19/');
  assert.equal(broadcast.primary.embedUrl, 'https://rutube.ru/play/embed/ecbcd4d14b222379a609bf90e36c4b19');
  assert.equal(broadcast.primary.sourceId, 'cec-video');
  assert.equal(broadcast.primary.status, 'live');
  assert.equal(broadcast.fallback.url, 'https://live-rian.cdnvideo.ru/rian/pressPRESIDENT/playlist.m3u8');
  assert.equal(broadcast.fallback.sourceId, 'ria-broadcast');
  assert.equal(broadcast.fallback.integration, 'Direct HLS master playlist');
  assert.equal(broadcast.fallback.status, 'live');
  assert.equal(broadcast.fallback.statusLabel, 'Live now');
});

test('source health follows the resolved live-player URL', () => {
  const [source] = sourceRefreshInternals.updateHealth(
    [{ id: 'cec-video', url: 'https://www.cikrf.ru/vid/', integration: 'Link/embed' }],
    [{ id: 'cec-video', ok: true, parsed: null, url: 'https://rutube.ru/video/current/', integration: 'Embedded RUTUBE player' }],
    '2026-09-20T12:30:00Z'
  );
  assert.equal(source.status, 'online');
  assert.equal(source.url, 'https://rutube.ru/video/current/');
  assert.equal(source.integration, 'Embedded RUTUBE player');
});
