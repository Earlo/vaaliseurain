import { countdown, escapeHtml, formatDate, formatNumber, relativeTime, safeUrl, startClock } from './shared.js';
import { districtPathIds } from './district-paths.js';

const shell = document.querySelector('#dashboard');
const errorBanner = document.querySelector('#dashboard-error');
const connectionDot = document.querySelector('#connection-dot');
const headerStatus = document.querySelector('#header-status');
const sourceDrawer = document.querySelector('#source-drawer');
const sourceList = document.querySelector('#source-list');
const slug = location.pathname.split('/').filter(Boolean).at(-1);
let snapshot = null;
let eventStream;
let lastPayload = '';
let activeDistrictId = null;
let mapMarkupPromise;
let expandedStreamKey = null;

startClock(document.querySelector('#local-clock'));

const sourceById = (id) => snapshot?.sourceHealth.find((source) => source.id === id);

function sourceTag(id) {
  const source = sourceById(id);
  if (!source) return '';
  return `<a class="source-tag" href="${safeUrl(source.url)}" target="_blank" rel="noreferrer"><span></span>${escapeHtml(source.shortName)}</a>`;
}

function sourceStamp(ids, reportedAt) {
  const sourceIds = [...new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean))];
  return `<div class="source-lockup"><div class="source-tags">${sourceIds.map(sourceTag).join('')}</div><small>${reportedAt ? `Reported ${formatDate(reportedAt, { day: undefined, month: undefined })}` : 'No report yet'}</small></div>`;
}

function formatQualifiedNumber(value, qualifier = '') {
  const formatted = formatNumber(value);
  return formatted === '—' ? formatted : `${escapeHtml(qualifier)}${formatted}`;
}

function statusClass(status) {
  return ['online', 'verified', 'ready', 'reported', 'voting', 'live'].includes(status) ? 'good'
    : ['stale', 'offline', 'disputed'].includes(status) ? 'bad'
      : 'waiting';
}

function renderResults(results) {
  if (!results.parties?.length) {
    return `
      <div class="result-waiting">
        <div class="waiting-gauge" aria-hidden="true"><span>${results.seatsTotal}</span><small>seats</small></div>
        <div>
          <p class="kicker">225 list · 225 district</p>
          <h3>${escapeHtml(results.statusLabel)}</h3>
          <p>No party totals are displayed until a CEC result can be retrieved and timestamped.</p>
        </div>
      </div>
      <div class="seat-composition">
        <div><span>Party list</span><strong>${results.listSeats}</strong></div>
        <div class="composition-rule"><i></i><b style="left:${(results.majoritySeats / results.seatsTotal) * 100}%"></b></div>
        <div><span>Single-member</span><strong>${results.districtSeats}</strong></div>
      </div>`;
  }

  const maxSeats = Math.max(...results.parties.map((party) => party.seats || 0), 1);
  return `
    <div class="result-summary">
      <div><strong>${results.countedPercent ?? '—'}${results.countedPercent !== null ? '%' : ''}</strong><span>ballots counted</span></div>
      <div><strong>${escapeHtml(results.leadingParty || '—')}</strong><span>current leader</span></div>
      <div><strong>${results.majoritySeats}</strong><span>majority</span></div>
    </div>
    <div class="party-results">
      ${results.parties.map((party) => `
        <div class="party-row">
          <span class="party-swatch" style="background:${escapeHtml(party.color || '#aaa')}"></span>
          <strong>${escapeHtml(party.shortName || party.name)}</strong>
          <div class="party-bar"><i style="width:${Math.max(2, ((party.seats || 0) / maxSeats) * 100)}%;background:${escapeHtml(party.color || '#aaa')}"></i></div>
          <span>${party.sharePercent ?? '—'}${party.sharePercent !== null ? '%' : ''}</span>
          <b>${party.seats ?? '—'}</b>
        </div>`).join('')}
    </div>`;
}

function renderTurnout(turnout) {
  const value = turnout.nationalPercent;
  const dash = value === null ? 0 : Math.min(100, Math.max(0, value));
  const remainder = 100 - dash;
  return `
    <div class="turnout-visual">
      <svg viewBox="0 0 120 70" role="img" aria-label="National turnout ${value === null ? 'not yet reported' : `${value} percent`}">
        <path class="gauge-base" d="M12 60a48 48 0 0 1 96 0" pathLength="100"/>
        <path class="gauge-value" d="M12 60a48 48 0 0 1 96 0" pathLength="100" stroke-dasharray="${dash} ${remainder}"/>
      </svg>
      <div><strong>${value === null ? '—' : `${value}%`}</strong><span>National turnout</span></div>
    </div>
    <dl class="metric-list">
      <div><dt>Ballots cast</dt><dd>${formatNumber(turnout.ballotsCast)}</dd></div>
      <div><dt>Eligible voters</dt><dd>${formatNumber(turnout.eligibleVoters)}</dd></div>
      <div><dt>Reported</dt><dd>${turnout.reportedAt ? formatDate(turnout.reportedAt, { day: undefined, month: undefined }) : 'Pending'}</dd></div>
    </dl>
    <p class="panel-note">${escapeHtml(turnout.note)}</p>`;
}

function renderDistrictDetail(district) {
  if (!district) return '<div class="district-empty">Select a constituency to inspect its tally.</div>';

  const hasCount = district.countedPercent !== null && district.countedPercent !== undefined;
  const candidates = district.results || district.candidates || [];
  return `
    <div class="district-detail-heading">
      <div><span>Constituency no. ${district.id}</span><h3>${escapeHtml(district.name)}</h3><p>${escapeHtml(district.region)}</p></div>
      <i class="status-dot ${hasCount ? 'good' : 'waiting'}"></i>
    </div>
    <div class="district-metrics">
      <div><strong>${formatNumber(district.registeredVoters)}</strong><span>registered voters</span></div>
      <div><strong>${hasCount ? `${district.countedPercent}%` : '—'}</strong><span>ballots counted</span></div>
      <div><strong>${formatNumber(district.ballotsCounted)}</strong><span>votes tallied</span></div>
    </div>
    ${candidates.length ? `
      <div class="district-party-list">
        ${candidates.map((candidate) => `
          <div>
            <i style="background:${escapeHtml(candidate.color || '#717674')}"></i>
            <span>${escapeHtml(candidate.name)}</span>
            <b>${escapeHtml(candidate.partyShort || candidate.party || 'Independent')}</b>
            <strong>${candidate.sharePercent === null || candidate.sharePercent === undefined ? '—' : `${candidate.sharePercent}%`}</strong>
          </div>`).join('')}
      </div>` : `
      <div class="district-awaiting">
        <span aria-hidden="true">⌁</span>
        <div><strong>${escapeHtml(district.statusLabel || 'Awaiting constituency count')}</strong><p>Candidate tallies will appear here as verified results arrive.</p></div>
      </div>`}
    <p class="district-note">${escapeHtml(district.officialName)}</p>`;
}

function renderDistrictMap(districtResults) {
  const districts = districtResults.districts || [];
  if (!activeDistrictId || !districts.some((district) => district.id === activeDistrictId)) {
    activeDistrictId = districts[0]?.id || null;
  }
  const selected = districts.find((district) => district.id === activeDistrictId);
  const districtsReporting = districts.filter((district) => district.countedPercent !== null && district.countedPercent !== undefined).length;
  const seatsCalled = districts.filter((district) => district.winner || district.status === 'final' || district.status === 'called').length;

  return `
    <article class="panel district-map-panel span-full">
      <div class="district-map-topline">
        <header class="panel-header">
          <div><p class="kicker">225 single-member seats</p><h2>Constituency map</h2></div>
          ${sourceStamp(districtResults.sourceId, districtResults.reportedAt)}
        </header>
        <div class="district-map-summary">
          <div><strong>${districtsReporting} / ${districts.length}</strong><span>constituencies reporting</span></div>
          <div><strong>${seatsCalled} / ${districtResults.districtCount || '—'}</strong><span>seats called</span></div>
          <p>${escapeHtml(districtResults.statusLabel)}</p>
        </div>
      </div>
      <div class="district-map-layout">
        <figure class="constituency-map-figure">
          <div id="constituency-map-stage" class="constituency-map-stage" aria-label="Interactive map of the 225 single-member State Duma constituencies">
            <div id="constituency-map" class="constituency-map"><span class="map-loading">Loading constituency map…</span></div>
            <div id="map-tooltip" class="map-tooltip" role="tooltip" hidden></div>
          </div>
          <figcaption><span>Hover a district to identify it. Click to open its tally.</span><span>Moscow and Saint Petersburg are enlarged in the map insets.</span></figcaption>
        </figure>
        <aside class="constituency-browser">
          <div id="district-detail" class="district-detail" aria-live="polite">${renderDistrictDetail(selected)}</div>
          <label class="district-search-label" for="district-search">Find a constituency</label>
          <input id="district-search" class="district-search" type="search" placeholder="Number, name, or region" autocomplete="off" />
          <div class="district-list-head"><span id="district-match-count">${districts.length} constituencies</span><small>2025 scheme</small></div>
          <div class="district-selector" aria-label="Choose a constituency">
            ${districts.map((district) => `<button type="button" data-district-id="${district.id}" data-search="${escapeHtml(`${district.id} ${district.name} ${district.region}`.toLocaleLowerCase('ru'))}" class="constituency-option${district.id === activeDistrictId ? ' is-active' : ''}"><b>${district.id}</b><span>${escapeHtml(district.name)}<small>${escapeHtml(district.region)}</small></span></button>`).join('')}
          </div>
        </aside>
      </div>
      <p class="map-method-note">${escapeHtml(districtResults.note)} <a href="https://publication.pravo.gov.ru/document/0001202505230011" target="_blank" rel="noreferrer">Federal Law No. 107-FZ ↗</a> · <a href="https://commons.wikimedia.org/wiki/File:2026_Russian_legislative_election_map_by_constituencies.svg" target="_blank" rel="noreferrer">Boundary map: TagMorgan, CC BY-SA 4.0 ↗</a></p>
    </article>`;
}

function setActiveDistrict(id) {
  const districtId = Number(id);
  const district = snapshot?.constituencyResults?.districts?.find((item) => item.id === districtId);
  if (!district) return;
  activeDistrictId = districtId;
  document.querySelectorAll('[data-district-id]').forEach((element) => {
    const isActive = Number(element.dataset.districtId) === districtId;
    element.classList.toggle('is-active', isActive);
    element.setAttribute('aria-pressed', String(isActive));
  });
  const detail = document.querySelector('#district-detail');
  if (detail) detail.innerHTML = renderDistrictDetail(district);
}

function highlightDistrict(id, highlighted) {
  document.querySelectorAll(`.constituency-map [data-district-id="${Number(id)}"]`).forEach((path) => {
    path.classList.toggle('is-hovered', highlighted);
  });
}

function positionMapTooltip(event) {
  const stage = document.querySelector('#constituency-map-stage');
  const tooltip = document.querySelector('#map-tooltip');
  if (!stage || !tooltip || tooltip.hidden) return;
  const bounds = stage.getBoundingClientRect();
  const gap = 14;
  const x = Math.min(Math.max(event.clientX - bounds.left + gap, 12), bounds.width - tooltip.offsetWidth - 12);
  const y = Math.min(Math.max(event.clientY - bounds.top + gap, 12), bounds.height - tooltip.offsetHeight - 12);
  tooltip.style.transform = `translate(${x}px, ${y}px)`;
}

function showMapTooltip(event, district) {
  const tooltip = document.querySelector('#map-tooltip');
  if (!tooltip) return;
  tooltip.innerHTML = `<span>Constituency ${district.id}</span><strong>${escapeHtml(district.name)}</strong><small>${escapeHtml(district.region)}</small>`;
  tooltip.hidden = false;
  positionMapTooltip(event);
}

function hideMapTooltip() {
  const tooltip = document.querySelector('#map-tooltip');
  if (tooltip) tooltip.hidden = true;
}

async function hydrateDistrictMap() {
  const container = document.querySelector('#constituency-map');
  if (!container || !snapshot?.constituencyResults?.districts) return;
  const expectedContainer = container;

  try {
    mapMarkupPromise ||= fetch('/maps/2026-russia-state-duma-constituencies.svg').then((response) => {
      if (!response.ok) throw new Error('Map could not be loaded.');
      return response.text();
    });
    const markup = await mapMarkupPromise;
    if (!expectedContainer.isConnected) return;
    container.innerHTML = markup;
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('Map could not be loaded.');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', '2026 State Duma single-member constituencies');

    const districts = new Map(snapshot.constituencyResults.districts.map((district) => [district.id, district]));
    Object.entries(districtPathIds).forEach(([districtId, pathIds]) => {
      const district = districts.get(Number(districtId));
      if (!district) return;
      pathIds.forEach((pathId) => {
        const path = svg.querySelector(`#${CSS.escape(pathId)}`);
        if (!path) return;
        path.dataset.districtId = districtId;
        path.classList.add('constituency-path');
        path.setAttribute('aria-label', `Constituency ${district.id}: ${district.name}, ${district.region}`);
        path.addEventListener('pointerenter', (event) => {
          highlightDistrict(districtId, true);
          showMapTooltip(event, district);
        });
        path.addEventListener('pointermove', positionMapTooltip);
        path.addEventListener('pointerleave', () => {
          highlightDistrict(districtId, false);
          hideMapTooltip();
        });
        path.addEventListener('click', () => setActiveDistrict(districtId));
      });
    });
    setActiveDistrict(activeDistrictId);
  } catch (error) {
    if (expectedContainer.isConnected) container.innerHTML = `<span class="map-loading map-error">${escapeHtml(error.message)}</span>`;
  }
}

function bindDistrictMap() {
  document.querySelectorAll('.constituency-option[data-district-id]').forEach((element) => {
    element.addEventListener('click', () => setActiveDistrict(element.dataset.districtId));
    element.addEventListener('pointerenter', () => highlightDistrict(element.dataset.districtId, true));
    element.addEventListener('pointerleave', () => highlightDistrict(element.dataset.districtId, false));
    element.addEventListener('focus', () => highlightDistrict(element.dataset.districtId, true));
    element.addEventListener('blur', () => highlightDistrict(element.dataset.districtId, false));
  });
  const search = document.querySelector('#district-search');
  const count = document.querySelector('#district-match-count');
  search?.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase('ru');
    let matches = 0;
    document.querySelectorAll('.constituency-option').forEach((option) => {
      const visible = !query || option.dataset.search.includes(query);
      option.hidden = !visible;
      if (visible) matches += 1;
    });
    if (count) count.textContent = `${matches} ${matches === 1 ? 'constituency' : 'constituencies'}`;
  });
  hydrateDistrictMap();
}

function renderElectronicVoting(items) {
  return items.map((item) => `
    <article class="evote-card">
      <div class="evote-top"><div><span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.scope)}</small></div><i class="status-dot ${statusClass(item.status)}"></i></div>
      <div class="evote-value"><strong>${item.participationPercent === null ? '—' : `${item.participationPercent}%`}</strong><span>${escapeHtml(item.statusLabel)}</span></div>
      <div class="evote-metrics"><span>${escapeHtml(item.ballotsIssuedLabel || 'Issued')} <b>${formatQualifiedNumber(item.ballotsIssued, item.ballotsIssuedQualifier)}</b></span><span>${escapeHtml(item.ballotsReceivedLabel || 'Received')} <b>${formatQualifiedNumber(item.ballotsReceived, item.ballotsReceivedQualifier)}</b></span></div>
      ${sourceStamp([item.sourceId, item.monitorSourceId], item.reportedAt)}
    </article>`).join('');
}

function renderReports(reports) {
  return reports.map((report) => `
    <article class="report-item">
      <div class="report-feed"><i class="${statusClass(report.status)}"></i><span>${escapeHtml(report.time || (report.publishedAt ? formatDate(report.publishedAt, { day: undefined, month: undefined }) : '—'))}</span></div>
      <div class="report-content">
        <div class="report-meta"><span class="report-kind">${escapeHtml(report.kind)}</span>${sourceTag(report.sourceId)}</div>
        <h3><a href="${safeUrl(report.url)}" target="_blank" rel="noreferrer">${escapeHtml(report.headline)}</a></h3>
        ${report.summary ? `<p>${escapeHtml(report.summary)}</p>` : ''}
      </div>
    </article>`).join('');
}

function renderTimeline(items) {
  return items.map((item) => `
    <li class="timeline-item timeline-${escapeHtml(item.state)}">
      <time>${escapeHtml(item.time)}</time>
      <i></i>
      <div><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail)}</span></div>
    </li>`).join('');
}

function renderSourceSummary(sources) {
  const groups = sources.reduce((output, source) => {
    output[statusClass(source.status)] = (output[statusClass(source.status)] || 0) + 1;
    return output;
  }, {});
  return `
    <button id="open-sources" class="source-summary" type="button">
      <span class="source-stack">${sources.slice(0, 4).map((source, index) => `<i style="--index:${index}">${escapeHtml(source.shortName.slice(0, 1))}</i>`).join('')}</span>
      <span><strong>${sources.length} sources monitored</strong><small>${groups.good || 0} live · ${groups.waiting || 0} awaiting checks · ${groups.bad || 0} unavailable</small></span>
      <b>View all →</b>
    </button>`;
}

function getBroadcastStreams(broadcast) {
  if (Array.isArray(broadcast.streams) && broadcast.streams.length) return broadcast.streams;
  return [broadcast.primary, broadcast.fallback].filter(Boolean);
}

function renderBroadcast(broadcast) {
  const streams = getBroadcastStreams(broadcast);
  return `
    <section class="live-zone" data-live-zone style="--side-stream-count:${Math.max(1, streams.length - 1)}">
      ${streams.map((stream, index) => {
        const key = stream.id || stream.sourceId || `stream-${index + 1}`;
        const isPrimary = index === 0;
        const status = stream.status || broadcast.status;
        const embedUrl = stream.embedUrl ? safeUrl(stream.embedUrl) : '';
        const description = stream.description || (isPrimary
          ? broadcast.description
          : 'Keep this backup feed ready if the main programme is interrupted.');
        return `
          <article class="panel stream-card${isPrimary ? ' is-primary' : ''}" data-stream-key="${escapeHtml(key)}">
            <div class="stream-card-bar">
              <div class="stream-copy">
                <span class="stream-role">Live · ${isPrimary ? 'Main stream' : `Stream ${index + 1}`}</span>
                <h3>${escapeHtml(stream.name)}</h3>
                <p>${escapeHtml(description)}</p>
              </div>
              <div class="stream-card-meta">
                <span class="stream-state"><i class="status-dot ${statusClass(status)}"></i>${escapeHtml(stream.statusLabel || broadcast.statusLabel || 'Source ready')}</span>
                <div class="broadcast-sources">${sourceTag(stream.sourceId)}</div>
              </div>
            </div>
            <div class="stream-preview${embedUrl ? ' has-player' : ''}">
              ${embedUrl ? `<iframe class="stream-player" src="${embedUrl}" title="${escapeHtml(stream.name)}" loading="lazy" allow="clipboard-write; autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>` : ''}
              <div class="stream-signal" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
            </div>
            <div class="stream-actions">
              <a class="watch-stream-button" href="${safeUrl(stream.url)}" target="_blank" rel="noreferrer">${escapeHtml(stream.label || `Open ${stream.name}`)} <span>↗</span></a>
              <div class="stream-view-actions">
                <button class="expand-stream-button" type="button" data-expand-stream="${escapeHtml(key)}" aria-pressed="false" aria-label="Show ${escapeHtml(stream.name)} in theater layout">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM15 5v14"/></svg>
                  <span>Theater</span>
                </button>
                <button class="fullscreen-stream-button" type="button" data-fullscreen-stream="${escapeHtml(key)}" aria-pressed="false" aria-label="Show ${escapeHtml(stream.name)} full screen">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5m13 5h5v-5"/></svg>
                  <span>Full screen</span>
                </button>
              </div>
            </div>
          </article>`;
      }).join('')}
    </section>`;
}

function applyStreamExpansion() {
  const zone = document.querySelector('[data-live-zone]');
  if (!zone) return;
  const cards = [...zone.querySelectorAll('[data-stream-key]')];
  const activeCard = expandedStreamKey && cards.find((card) => card.dataset.streamKey === expandedStreamKey);
  if (expandedStreamKey && !activeCard) expandedStreamKey = null;
  const isExpanded = Boolean(expandedStreamKey);

  zone.classList.toggle('is-theater-mode', isExpanded);
  cards.forEach((card) => card.classList.toggle('is-theater-selected', card.dataset.streamKey === expandedStreamKey));
  zone.querySelectorAll('[data-expand-stream]').forEach((button) => {
    const selected = button.dataset.expandStream === expandedStreamKey;
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('span').textContent = selected ? 'Restore' : 'Theater';
  });
}

function closeStreamExpansion() {
  expandedStreamKey = null;
  applyStreamExpansion();
}

function updateFullscreenButtons() {
  document.querySelectorAll('[data-fullscreen-stream]').forEach((button) => {
    const selected = document.fullscreenElement?.dataset.streamKey === button.dataset.fullscreenStream;
    button.setAttribute('aria-pressed', String(selected));
    button.querySelector('span').textContent = selected ? 'Exit full screen' : 'Full screen';
  });
}

function bindBroadcastControls() {
  document.querySelectorAll('[data-expand-stream]').forEach((button) => {
    button.addEventListener('click', () => {
      expandedStreamKey = expandedStreamKey === button.dataset.expandStream ? null : button.dataset.expandStream;
      applyStreamExpansion();
    });
  });
  document.querySelectorAll('[data-fullscreen-stream]').forEach((button) => {
    button.addEventListener('click', async () => {
      const card = button.closest('[data-stream-key]');
      if (document.fullscreenElement === card) await document.exitFullscreen();
      else if (card?.requestFullscreen) await card.requestFullscreen();
    });
  });
  applyStreamExpansion();
  updateFullscreenButtons();
}

function renderDrawer(sources) {
  sourceList.innerHTML = sources.map((source) => `
    <article class="source-row">
      <i class="status-dot ${statusClass(source.status)}"></i>
      <div class="source-row-main">
        <div><strong>${escapeHtml(source.name)}</strong><span class="priority priority-${escapeHtml(source.priority)}">${escapeHtml(source.priority)}</span></div>
        <small>${escapeHtml(source.category)} · ${escapeHtml(source.integration)}</small>
      </div>
      <div class="source-row-status"><strong>${escapeHtml(source.statusLabel)}</strong><small>${source.error ? escapeHtml(source.error) : source.lastSuccess ? `Updated ${relativeTime(source.lastSuccess)}` : escapeHtml(source.latency)}</small></div>
      <a href="${safeUrl(source.url)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(source.name)}">↗</a>
    </article>`).join('');
}

function render(data) {
  const serialized = JSON.stringify(data);
  if (serialized === lastPayload) return;
  lastPayload = serialized;
  snapshot = data;
  document.title = `${data.meta.title} · VaaliRaivo`;
  document.querySelector('#desk-title').textContent = data.meta.title;
  document.querySelector('#desk-eyebrow').textContent = data.meta.eyebrow;
  headerStatus.innerHTML = `
    <div class="header-stat header-phase"><span class="status-dot ${statusClass(data.meta.phase)}"></span><div><small>Phase</small><strong>${escapeHtml(data.meta.phaseLabel)}</strong></div></div>
    <div class="header-stat header-next"><small>Next · ${escapeHtml(data.meta.nextMilestone.label)}</small><strong data-live-countdown>${countdown(data.meta.nextMilestone.at)}</strong></div>
    <div class="header-stat header-updated"><small>Updated</small><strong>${formatDate(data.meta.lastUpdated)} <span>· ${escapeHtml(data.meta.updateMode)}</span></strong></div>
    ${renderSourceSummary(data.sourceHealth)}`;
  shell.setAttribute('aria-busy', 'false');
  shell.innerHTML = `
    <section class="dashboard-grid">
      ${renderBroadcast(data.broadcast)}

      <article class="panel results-panel">
        <header class="panel-header"><div><p class="kicker">Official count</p><h2>Seats &amp; party vote</h2></div>${sourceStamp(data.results.sourceId, data.results.reportedAt)}</header>
        ${renderResults(data.results)}
      </article>

      <article class="panel turnout-panel">
        <header class="panel-header"><div><p class="kicker">Participation</p><h2>Turnout</h2></div>${sourceStamp(data.turnout.sourceId, data.turnout.reportedAt)}</header>
        ${renderTurnout(data.turnout)}
      </article>

      ${data.constituencyResults ? renderDistrictMap(data.constituencyResults) : ''}

      <article class="panel reports-panel">
        <header class="panel-header"><div><p class="kicker">Reporting feed</p><h2>What we know</h2></div><span class="panel-meta">Latest first</span></header>
        <div class="reports-list">${renderReports(data.reports)}</div>
      </article>

      <article class="panel timeline-panel">
        <header class="panel-header"><div><p class="kicker">EEST · UTC+3</p><h2>Night timeline</h2></div><span class="panel-meta">20 Sep</span></header>
        <ol class="timeline-list">${renderTimeline(data.timeline)}</ol>
      </article>

      <article class="panel evoting-panel">
        <header class="panel-header"><div><p class="kicker">Separate systems</p><h2>Electronic voting</h2></div><span class="panel-meta">Never combined</span></header>
        <div class="evoting-grid">${renderElectronicVoting(data.electronicVoting)}</div>
      </article>
    </section>

    <footer class="dashboard-footer">
      <span>Figures are provisional unless marked final.</span>
      <span>Every live value should carry a source and retrieval time.</span>
      <a href="/">All election desks →</a>
    </footer>`;

  renderDrawer(data.sourceHealth);
  document.querySelector('#open-sources').addEventListener('click', openDrawer);
  bindBroadcastControls();
  bindDistrictMap();
}

function openDrawer() {
  sourceDrawer.classList.add('is-open');
  sourceDrawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('drawer-open');
}

function closeDrawer() {
  sourceDrawer.classList.remove('is-open');
  sourceDrawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open');
}

async function loadSnapshot() {
  const response = await fetch(`/api/projects/${encodeURIComponent(slug)}`);
  if (!response.ok) throw new Error(response.status === 404 ? 'Election desk not found.' : 'Election desk is unavailable.');
  render(await response.json());
}

function connect() {
  eventStream?.close();
  eventStream = new EventSource(`/api/projects/${encodeURIComponent(slug)}/events`);
  eventStream.addEventListener('snapshot', (event) => {
    connectionDot.classList.add('is-connected');
    errorBanner.hidden = true;
    render(JSON.parse(event.data));
  });
  eventStream.onerror = () => {
    connectionDot.classList.remove('is-connected');
    errorBanner.textContent = 'Live connection interrupted. The last received snapshot remains on screen while we reconnect.';
    errorBanner.hidden = false;
  };
}

document.querySelectorAll('[data-close-drawer]').forEach((button) => button.addEventListener('click', closeDrawer));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeStreamExpansion();
    closeDrawer();
  }
});
document.addEventListener('fullscreenchange', updateFullscreenButtons);
document.querySelector('#fullscreen-button').addEventListener('click', async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
});

setInterval(() => {
  const element = document.querySelector('[data-live-countdown]');
  if (element && snapshot) element.textContent = countdown(snapshot.meta.nextMilestone.at);
}, 30_000);

try {
  await loadSnapshot();
  connect();
} catch (error) {
  shell.setAttribute('aria-busy', 'false');
  shell.innerHTML = `<section class="fatal-state"><span>!</span><h1>${escapeHtml(error.message)}</h1><p>Return to the project overview or try again.</p><a href="/">Back to election desks</a></section>`;
}
