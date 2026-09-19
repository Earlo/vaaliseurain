import { countdown, escapeHtml, formatDate, safeUrl, startClock } from './shared.js';

startClock(document.querySelector('#local-clock'), true);

const grid = document.querySelector('#project-grid');

function projectCard(project) {
  const href = `/projects/${encodeURIComponent(project.slug)}`;
  return `
    <article class="project-card" style="--project-accent:${escapeHtml(project.accent)}">
      <a class="project-card-link" href="${href}" aria-label="Open ${escapeHtml(project.name)}"></a>
      <div class="project-card-top">
        <div class="project-country"><span>RU</span><i></i><i></i><i></i></div>
        <span class="status-pill status-${escapeHtml(project.status)}"><i></i>${escapeHtml(project.statusLabel)}</span>
      </div>
      <div class="project-card-body">
        <p>${escapeHtml(project.eyebrow)} · ${escapeHtml(project.location)}</p>
        <h3>${escapeHtml(project.name)}</h3>
        <p class="project-description">${escapeHtml(project.description)}</p>
      </div>
      <div class="project-card-progress">
        <div class="project-timer">
          <span>Next desk milestone</span>
          <strong data-countdown="${escapeHtml(project.eventDate)}">${countdown(project.eventDate)}</strong>
        </div>
        <div class="progress-track"><i></i></div>
      </div>
      <div class="project-card-footer">
        <span>${escapeHtml(project.watchWindow)}</span>
        <span>${project.sourceCount} sources <b>↗</b></span>
      </div>
    </article>`;
}

async function loadProjects() {
  try {
    const response = await fetch('/api/projects');
    if (!response.ok) throw new Error('Project list unavailable');
    const { projects } = await response.json();
    grid.innerHTML = projects.length
      ? projects.map(projectCard).join('')
      : '<div class="empty-projects"><h3>No active desks</h3><p>Election projects will appear here when configured.</p></div>';
    setInterval(() => {
      document.querySelectorAll('[data-countdown]').forEach((element) => {
        element.textContent = countdown(element.dataset.countdown);
      });
    }, 30_000);
  } catch (error) {
    grid.innerHTML = `<div class="empty-projects"><h3>Could not load election desks</h3><p>${escapeHtml(error.message)}. Try refreshing the page.</p></div>`;
  }
}

loadProjects();
