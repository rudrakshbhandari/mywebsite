/**
 * GitHub contribution calendar renderer.
 *
 * Reads /github_contributions.json (refreshed via
 * scripts/fetch_github_contributions.mjs) and paints a GitHub-style
 * year heatmap into #github-contributions.
 */
(function () {
  'use strict';

  const DATA_URL = '/github_contributions.json';
  const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  function formatCount(n) {
    return Number(n).toLocaleString('en-US');
  }

  function contributionLabel(count, date) {
    const day = new Date(date + 'T12:00:00');
    const pretty = day.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    if (count === 0) return `No contributions on ${pretty}`;
    if (count === 1) return `1 contribution on ${pretty}`;
    return `${formatCount(count)} contributions on ${pretty}`;
  }

  /** Pad leading empty days so the grid starts on Sunday (GitHub style). */
  function padToWeeks(days) {
    if (!days.length) return [];
    const first = new Date(days[0].date + 'T12:00:00');
    const pad = first.getDay(); // 0 = Sunday
    const padded = [];
    for (let i = 0; i < pad; i++) {
      padded.push(null);
    }
    return padded.concat(days);
  }

  function buildMonthSlots(weeks) {
    const slots = new Array(weeks.length).fill('');
    let lastMonth = -1;
    weeks.forEach((week, weekIndex) => {
      const firstReal = week.find(d => d);
      if (!firstReal) return;
      const month = new Date(firstReal.date + 'T12:00:00').getMonth();
      if (month !== lastMonth) {
        slots[weekIndex] = MONTH_LABELS[month];
        lastMonth = month;
      }
    });
    return slots;
  }

  function renderGraph(root, data) {
    const days = Array.isArray(data.contributions) ? data.contributions : [];
    const padded = padToWeeks(days);
    const weeks = [];
    for (let i = 0; i < padded.length; i += 7) {
      weeks.push(padded.slice(i, i + 7));
    }
    while (weeks.length && weeks[weeks.length - 1].every(d => !d)) {
      weeks.pop();
    }

    const year = data.year || new Date().getFullYear();
    const total = data.total ?? 0;
    const profileUrl = `https://github.com/${encodeURIComponent(data.username || 'rudrakshbhandari')}`;

    const totalEl = root.querySelector('[data-contrib-total]');
    if (totalEl) totalEl.textContent = formatCount(total);

    const yearEl = root.querySelector('[data-contrib-year]');
    if (yearEl) yearEl.textContent = String(year);

    const linkEl = root.querySelector('[data-contrib-profile]');
    if (linkEl) linkEl.setAttribute('href', profileUrl);

    const graph = root.querySelector('[data-contrib-graph]');
    if (!graph) return;

    const monthsRow = document.createElement('div');
    monthsRow.className = 'contrib-graph__months';
    monthsRow.setAttribute('aria-hidden', 'true');
    monthsRow.style.gridTemplateColumns = `28px repeat(${weeks.length}, 11px)`;

    const spacer = document.createElement('span');
    spacer.className = 'contrib-graph__month-spacer';
    monthsRow.appendChild(spacer);

    buildMonthSlots(weeks).forEach(label => {
      const span = document.createElement('span');
      span.className = 'contrib-graph__month';
      span.textContent = label;
      monthsRow.appendChild(span);
    });

    const body = document.createElement('div');
    body.className = 'contrib-graph__body';

    const daysCol = document.createElement('div');
    daysCol.className = 'contrib-graph__days';
    daysCol.setAttribute('aria-hidden', 'true');
    DAY_LABELS.forEach(label => {
      const span = document.createElement('span');
      span.className = 'contrib-graph__day-label';
      span.textContent = label;
      daysCol.appendChild(span);
    });

    const grid = document.createElement('div');
    grid.className = 'contrib-graph__weeks';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-readonly', 'true');

    weeks.forEach(week => {
      const col = document.createElement('div');
      col.className = 'contrib-graph__week';
      col.setAttribute('role', 'row');
      for (let d = 0; d < 7; d++) {
        const day = week[d];
        const cell = document.createElement('span');
        cell.className = 'contrib-graph__day';
        cell.setAttribute('role', 'gridcell');
        if (!day) {
          cell.classList.add('contrib-graph__day--empty');
          cell.setAttribute('aria-hidden', 'true');
        } else if (day.future) {
          // Future calendar days stay in the grid (GitHub-style), but must not
          // claim "No contributions" for dates that have not happened yet.
          cell.dataset.level = '0';
          cell.classList.add('contrib-graph__day--future');
          cell.setAttribute('aria-hidden', 'true');
        } else {
          const level = Math.max(0, Math.min(4, Number(day.level) || 0));
          cell.dataset.level = String(level);
          const label = contributionLabel(day.count, day.date);
          cell.title = label;
          cell.setAttribute('aria-label', label);
        }
        col.appendChild(cell);
      }
      grid.appendChild(col);
    });

    body.appendChild(daysCol);
    body.appendChild(grid);
    graph.replaceChildren(monthsRow, body);
    root.hidden = false;
  }

  function init() {
    const root = document.getElementById('github-contributions');
    if (!root) return;

    fetch(DATA_URL, { credentials: 'same-origin' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load contributions');
        return res.json();
      })
      .then(data => renderGraph(root, data))
      .catch(() => {
        root.hidden = true;
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
