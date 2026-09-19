import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCecTelegram, parsePageMetadata, parsePublicChamber } from '../lib/source-adapters.mjs';
import { sourceRefreshInternals } from '../lib/source-refresh.mjs';

test('CEC Telegram adapter extracts attributed reports and explicit DEG figures', () => {
  const html = `
    <div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="cikrossii/99">
      <div class="tgme_widget_message_text js-message_text"><b>ДЭГ: новый отчет</b><br>3,23 млн человек проголосовали посредством #ДЭГ.<br>Заявления подали 4,04 млн человек.<br>*По состоянию на 17:15 19 сентября 2026 года<br>#Госдума9</div>
      <div class="tgme_widget_message_footer"><time datetime="2026-09-19T14:16:00+00:00">14:16</time></div>
    </div></div>`;

  const result = parseCecTelegram(html);
  assert.equal(result.messages.length, 1);
  assert.equal(result.reports[0].url, 'https://t.me/cikrossii/99');
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
