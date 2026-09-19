export const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
}

export function formatDate(value, options = {}) {
  if (!value) return 'Not reported';
  return new Intl.DateTimeFormat('en-FI', {
    timeZone: 'Europe/Helsinki',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  }).format(new Date(value));
}

export function formatNumber(value) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-FI').format(value);
}

export function startClock(element, includeZone = false) {
  const tick = () => {
    const value = new Intl.DateTimeFormat('en-FI', {
      timeZone: 'Europe/Helsinki',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date());
    element.textContent = includeZone ? `${value} EEST` : value;
  };
  tick();
  return setInterval(tick, 1000);
}

export function relativeTime(value) {
  if (!value) return 'No successful retrieval';
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60]
  ];
  for (const [unit, divisor] of units) {
    if (Math.abs(seconds) >= divisor) return formatter.format(Math.round(seconds / divisor), unit);
  }
  return 'just now';
}

export function countdown(value) {
  const delta = Math.max(0, new Date(value).getTime() - Date.now());
  const totalMinutes = Math.floor(delta / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}
