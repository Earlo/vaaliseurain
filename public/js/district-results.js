import { escapeHtml, formatDate, formatNumber, safeUrl } from './shared.js';

const hasNumber = (value) => typeof value === 'number' && Number.isFinite(value);

export function districtState(district) {
  const candidates = [...(district.results || district.candidates || [])];
  const metric = ['votes', 'sharePercent'].find((key) => candidates.every((candidate) => hasNumber(candidate[key])));
  if (metric) candidates.sort((a, b) => b[metric] - a[metric]);
  const called = Boolean(district.winner) || ['final', 'called'].includes(district.status);
  const reporting = called || district.status === 'reporting' || (district.countedPercent ?? 0) > 0 ||
    (district.ballotsCounted ?? 0) > 0 || candidates.some((candidate) => hasNumber(candidate.votes) || hasNumber(candidate.sharePercent));
  const leader = metric && candidates.length && candidates[0][metric] > 0 &&
    (candidates.length === 1 || candidates[0][metric] > candidates[1][metric]) ? candidates[0] : null;
  const winnerName = typeof district.winner === 'string' ? district.winner : district.winner?.name;
  const label = called ? 'Called' : reporting ? 'Reporting' : 'Awaiting results';
  const winner = candidates.find((candidate) => candidate.name === winnerName || candidate.id === district.winner);
  const colorValue = (called ? winner : leader)?.color;
  const color = colorValue && /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(colorValue) ? colorValue : reporting ? '#48b6a0' : '#2b3132';
  return { candidates, called, reporting, leader, winnerName, label, color };
}

export function renderDistrictDetail(district, sources = []) {
  if (!district) return '<div class="district-empty">Select a constituency to inspect its tally.</div>';
  const { candidates, called, reporting, leader, winnerName, label } = districtState(district);
  const source = sources.find((source) => source.id === district.sourceId);
  return `
    <div class="district-detail-heading">
      <div><span>Constituency no. ${district.id} · ${label}</span><h3>${escapeHtml(district.name)}</h3><p>${escapeHtml(district.region)}</p></div>
      <i class="status-dot ${reporting ? 'good' : 'waiting'}"></i>
    </div>
    <div class="district-metrics">
      <div><strong>${formatNumber(district.registeredVoters)}</strong><span>registered voters</span></div>
      <div><strong>${hasNumber(district.countedPercent) ? `${district.countedPercent}%` : '—'}</strong><span>ballots counted</span></div>
      <div><strong>${formatNumber(district.ballotsCounted)}</strong><span>votes tallied</span></div>
    </div>
    ${winnerName || leader ? `<p class="district-leader">${called ? 'Winner' : 'Leading'}: <strong>${escapeHtml(winnerName || leader.name)}</strong></p>` : ''}
    ${candidates.length ? `
      <div class="district-party-list">
        ${candidates.map((candidate) => `
          <div>
            <i style="background:${escapeHtml(candidate.color || '#717674')}"></i>
            <span>${escapeHtml(candidate.name)}<small>${escapeHtml(candidate.partyShort || candidate.party || 'Independent')}</small></span>
            <b>${formatNumber(candidate.votes)}<small>votes</small></b>
            <strong>${hasNumber(candidate.sharePercent) ? `${candidate.sharePercent}%` : '—'}</strong>
          </div>`).join('')}
      </div>` : `
      <div class="district-awaiting">
        <span aria-hidden="true">⌁</span>
        <div><strong>${escapeHtml(district.statusLabel || 'Awaiting constituency count')}</strong><p>Candidate tallies will appear here as sourced results arrive.</p></div>
      </div>`}
    ${district.reportedAt ? `<div class="district-result-source"><a href="${safeUrl(district.sourceUrl || source?.url)}" target="_blank" rel="noreferrer">${escapeHtml(source?.shortName || district.sourceId || 'Result source')} ↗</a><span>Reported ${formatDate(district.reportedAt)}</span></div>` : ''}
    <p class="district-note">${escapeHtml(district.officialName)}</p>`;
}
