// Oura public data endpoint
const DATA_URL = '/oura_public.json';

// Status thresholds for scores
const STATUS_THRESHOLDS = {
  sleep: { good: 80, fair: 60 },
  readiness: { good: 80, fair: 60 },
  activity: { good: 80, fair: 60 },
};
const MIN_HEARTBEAT_BPM = 45;
const MAX_HEARTBEAT_BPM = 160;

/**
 * Format relative time (e.g., "12 min ago")
 * @param {string} isoDate - ISO date string
 * @returns {string}
 */
function getRelativeTime(isoDate) {
  if (!isoDate) return 'Unknown';

  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

/**
 * Escape string for use in HTML data attributes
 * @param {string} s
 * @returns {string}
 */
function escapeAttr(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Get status class based on score
 * @param {number} score
 * @param {string} type - 'sleep' or 'readiness'
 * @returns {string}
 */
function getStatusClass(score, type) {
  const thresholds = STATUS_THRESHOLDS[type];
  if (!thresholds) return '';

  if (score >= thresholds.good) return 'good';
  if (score >= thresholds.fair) return 'fair';
  return 'poor';
}

/**
 * Format status label
 * @param {number} score
 * @param {string} type
 * @returns {string}
 */
function getStatusLabel(score, type) {
  const cls = getStatusClass(score, type);
  if (cls === 'good') return 'Good';
  if (cls === 'fair') return 'Fair';
  if (cls === 'poor') return 'Pay Attention';
  return '';
}

/**
 * Update metric display
 * @param {string} id - Element ID
 * @param {number|null} value
 * @param {string} unit - Optional unit label (e.g., 'bpm')
 */
function updateMetric(id, value, unit = '') {
  const el = document.getElementById(id);
  if (!el) return;

  if (value === null || value === undefined) {
    el.textContent = 'No data';
    el.classList.add('null');
  } else {
    el.textContent = `${value}`;
    if (unit) {
      const unitEl = document.createElement('span');
      unitEl.className = 'metric-unit';
      unitEl.textContent = unit;
      el.appendChild(unitEl);
    }
    el.classList.remove('null');
  }
}

/**
 * Update status badge
 * @param {string} id - Status element ID
 * @param {number|null} score
 * @param {string} type
 */
function updateStatus(id, score, type) {
  const el = document.getElementById(id);
  if (!el) return;

  if (score === null || score === undefined) {
    el.classList.add('hidden');
  } else {
    el.textContent = getStatusLabel(score, type);
    el.className = `metric-status ${getStatusClass(score, type)}`;
  }
}

/**
 * Render a contributor item with a progress bar
 * @param {string} label - Display label
 * @param {number|null} value - Score value (0-100)
 * @returns {string} HTML string
 */
function renderContributor(label, value) {
  if (value === null || value === undefined) {
    return `
      <div class="contributor-item">
        <span class="contributor-label">${label}</span>
        <div class="contributor-bar-container">
          <div class="contributor-bar"><div class="contributor-bar-fill" style="width: 0%"></div></div>
          <span class="contributor-value null">--</span>
        </div>
      </div>
    `;
  }

  const cls = getStatusClass(value, 'sleep'); // Use sleep thresholds for all
  return `
    <div class="contributor-item">
      <span class="contributor-label">${label}</span>
      <div class="contributor-bar-container">
        <div class="contributor-bar"><div class="contributor-bar-fill ${cls}" style="width: ${value}%"></div></div>
        <span class="contributor-value">${value}</span>
      </div>
    </div>
  `;
}

/**
 * Render all contributors for a category
 * @param {string} containerId - Element ID to populate
 * @param {Object} contributors - Map of label -> value
 */
function renderContributors(containerId, contributors) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const html = Object.entries(contributors)
    .map(([label, value]) => renderContributor(label, value))
    .join('');

  container.innerHTML = html;
}

/**
 * Show or hide a metric card
 * @param {string} cardId
 * @param {boolean} visible
 */
function setCardVisibility(cardId, visible) {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.classList.toggle('hidden', !visible);
}

/**
 * Update heartbeat indicator speed and label from latest HR
 * @param {number|null} latestBpm
 */
function updateHeartbeatIndicator(latestBpm) {
  const indicator = document.getElementById('heartbeat-indicator');
  const textEl = document.getElementById('heartbeat-text');
  if (!indicator || !textEl) return;

  if (latestBpm === null || latestBpm === undefined || !Number.isFinite(Number(latestBpm))) {
    indicator.classList.add('heartbeat-paused');
    indicator.style.setProperty('--heartbeat-duration', '1s');
    indicator.setAttribute('aria-label', 'Current heart rate unavailable');
    textEl.textContent = '-- bpm';
    return;
  }

  const bpm = Math.round(Number(latestBpm));
  const clampedBpm = Math.max(MIN_HEARTBEAT_BPM, Math.min(MAX_HEARTBEAT_BPM, bpm));
  const durationSeconds = 60 / clampedBpm;

  indicator.classList.remove('heartbeat-paused');
  indicator.style.setProperty('--heartbeat-duration', `${durationSeconds.toFixed(3)}s`);
  indicator.setAttribute('aria-label', `Current heart rate ${bpm} beats per minute`);
  textEl.textContent = `${bpm} bpm`;
}

/**
 * Format seconds to "Xh Ym" display
 * @param {number|null} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  if (seconds == null || seconds <= 0) return '--';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  if (hours === 0) return `${mins}m`;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/**
 * Format seconds to short "X.Yh" display for compact labels
 * @param {number|null} seconds
 * @returns {string}
 */
function formatDurationShort(seconds) {
  if (seconds == null || seconds <= 0) return '--';
  const hours = seconds / 3600;
  if (hours < 1) return `${Math.round(seconds / 60)}m`;
  return `${hours.toFixed(1)}h`;
}

/**
 * Render 7-day trend bars with enhanced sleep duration breakdown
 * @param {Array} byDay - Array of day data objects
 */
function render7DayTrend(byDay) {
  const container = document.getElementById('trend-cards');
  const section = document.getElementById('trend-section');
  if (!container || !byDay || !Array.isArray(byDay) || byDay.length === 0) {
    if (section) section.classList.add('hidden');
    return;
  }

  const hasAnyTrendData = byDay.some(
    d => d.sleepScore != null || d.readinessScore != null || (d.steps != null && d.steps > 0)
  );
  if (!hasAnyTrendData) {
    if (section) section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  const formatDay = dateStr => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
  };

  let html = '';

  // --- Sleep Duration Breakdown (stacked bars) ---
  const hasSleepDurations = byDay.some(d => d.totalSleepDuration != null && d.totalSleepDuration > 0);
  if (hasSleepDurations) {
    const totalDurations = byDay.map(d => d.totalSleepDuration).filter(v => v != null && v > 0);
    const maxDuration = Math.max(...totalDurations);

    html += `
      <div class="trend-card">
        <div class="trend-header">
          <i class="fas fa-moon"></i>
          <span>Sleep Duration</span>
        </div>
        <div class="sleep-legend">
          <div class="sleep-legend-item"><span class="sleep-legend-dot deep"></span>Deep</div>
          <div class="sleep-legend-item"><span class="sleep-legend-dot rem"></span>REM</div>
          <div class="sleep-legend-item"><span class="sleep-legend-dot light"></span>Light</div>
        </div>
        <div class="trend-chart-row">
          <div class="trend-y-axis">
            <span>${formatDurationShort(maxDuration)}</span>
            <span>0h</span>
          </div>
          <div class="trend-bars">
            ${byDay
              .map(d => {
                const total = d.totalSleepDuration || 0;
                const deep = d.deepSleepDuration || 0;
                const rem = d.remSleepDuration || 0;
                const light = d.lightSleepDuration || 0;
                const barPct = total > 0 && maxDuration > 0 ? (total / maxDuration) * 100 : 0;

                const deepPct = total > 0 ? (deep / total) * 100 : 0;
                const remPct = total > 0 ? (rem / total) * 100 : 0;
                const lightPct = total > 0 ? (light / total) * 100 : 0;

                const scoreLabel = d.sleepScore != null ? ` • Score: ${d.sleepScore}` : '';
                const tooltipText =
                  total > 0
                    ? `${formatDay(d.day)}: ${formatDuration(total)}${scoreLabel}\nDeep: ${formatDuration(deep)} • REM: ${formatDuration(rem)} • Light: ${formatDuration(light)}`
                    : `${formatDay(d.day)}: No data`;

                return `
                <div class="trend-day">
                  <div class="trend-day-bar-wrap" data-tooltip="${escapeAttr(tooltipText)}">
                    ${
                      total > 0
                        ? `
                      <div class="sleep-stacked-bar" style="height: ${Math.max(4, barPct)}%">
                        <div class="sleep-segment deep" style="height: ${deepPct}%"></div>
                        <div class="sleep-segment rem" style="height: ${remPct}%"></div>
                        <div class="sleep-segment light" style="height: ${lightPct}%"></div>
                      </div>
                    `
                        : `<div class="trend-bar sleep" style="height: 4%"></div>`
                    }
                  </div>
                  <span class="trend-day-label">${formatDay(d.day)}</span>
                  <span class="trend-day-value ${total === 0 ? 'null' : ''}">${total > 0 ? formatDurationShort(total) : '--'}</span>
                  ${d.sleepScore != null ? `<span class="sleep-detail-label">${d.sleepScore}/100</span>` : ''}
                </div>
              `;
              })
              .join('')}
          </div>
        </div>
      </div>
    `;
  } else {
    // Fallback: show sleep score bars if no duration data
    const sleepScores = byDay.map(d => d.sleepScore).filter(v => v != null);
    if (sleepScores.length > 0) {
      const sleepMin = Math.max(0, Math.min(...sleepScores) - 5);
      const sleepMax = Math.min(100, Math.max(...sleepScores) + 5);
      html += renderSimpleTrendCard(
        byDay,
        {
          label: 'Sleep Score',
          icon: 'fa-moon',
          colorClass: 'sleep',
          getValue: d => d.sleepScore,
          min: sleepMin,
          max: sleepMax,
          format: v => (v != null ? v : '--'),
        },
        formatDay
      );
    }
  }

  // --- Readiness ---
  const readinessScores = byDay.map(d => d.readinessScore).filter(v => v != null);
  if (readinessScores.length > 0) {
    const readinessMin = Math.max(0, Math.min(...readinessScores) - 5);
    const readinessMax = Math.min(100, Math.max(...readinessScores) + 5);
    html += renderSimpleTrendCard(
      byDay,
      {
        label: 'Readiness',
        icon: 'fa-battery-three-quarters',
        colorClass: 'readiness',
        getValue: d => d.readinessScore,
        min: readinessMin,
        max: readinessMax,
        format: v => (v != null ? v : '--'),
      },
      formatDay
    );
  }

  // --- Steps ---
  const stepsValues = byDay.map(d => d.steps).filter(v => v != null && v > 0);
  if (stepsValues.length > 0) {
    const stepsMin = Math.max(0, Math.min(...stepsValues) - 500);
    const stepsMax = Math.max(...stepsValues) + 500;
    html += renderSimpleTrendCard(
      byDay,
      {
        label: 'Steps',
        icon: 'fa-shoe-prints',
        colorClass: 'steps',
        getValue: d => d.steps,
        min: stepsMin,
        max: stepsMax,
        format: v => (v != null ? (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v) : '--'),
        isSteps: true,
      },
      formatDay
    );
  }

  container.innerHTML = html || '';
}

/**
 * Render a simple bar-chart trend card (readiness, steps, etc.)
 */
function renderSimpleTrendCard(byDay, config, formatDay) {
  const yLabels = config.isSteps
    ? [`${(config.min / 1000).toFixed(1)}k`, `${(config.max / 1000).toFixed(1)}k`]
    : [Math.round(config.min), Math.round(config.max)];

  return `
    <div class="trend-card">
      <div class="trend-header">
        <i class="fas ${config.icon}"></i>
        <span>${config.label}</span>
      </div>
      <div class="trend-chart-row">
        <div class="trend-y-axis">
          <span>${yLabels[1]}</span>
          <span>${yLabels[0]}</span>
        </div>
        <div class="trend-bars">
          ${byDay
            .map(d => {
              const val = config.getValue(d);
              const range = config.max - config.min;
              const pct = val != null && range > 0 ? ((val - config.min) / range) * 100 : 0;
              const displayVal = config.format(val);
              const suffix = config.isSteps ? ' steps' : '';
              const tooltipText =
                val != null ? `${formatDay(d.day)}: ${displayVal}${suffix}` : `${formatDay(d.day)}: No data`;
              return `
              <div class="trend-day">
                <div class="trend-day-bar-wrap" data-tooltip="${escapeAttr(tooltipText)}">
                  <div class="trend-bar ${config.colorClass}" style="height: ${Math.max(4, pct)}%"></div>
                </div>
                <span class="trend-day-label">${formatDay(d.day)}</span>
                <span class="trend-day-value ${val == null ? 'null' : ''}">${displayVal}</span>
              </div>
            `;
            })
            .join('')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Format time for tooltip (e.g. "3:15 AM")
 * @param {string} iso
 * @returns {string}
 */
function formatTime(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Render heart-rate time-series with axes and hover tooltip
 * @param {Array<{t:string,bpm:number}>} series
 * @param {Object} data
 */
function renderHeartRateTimeline(series, data) {
  const line = document.getElementById('heart-rate-line');
  const fill = document.getElementById('heart-rate-fill');
  const footer = document.getElementById('heart-rate-timeline-footer');
  const axisY = document.getElementById('hr-axis-y');
  const axisX = document.getElementById('hr-axis-x');
  const gridEl = document.getElementById('hr-grid');
  const hoverArea = document.getElementById('hr-hover-area');
  const tooltip = document.getElementById('hr-tooltip');
  const tooltipTime = document.getElementById('hr-tooltip-time');
  const tooltipValue = document.getElementById('hr-tooltip-value');
  const trackingLine = document.getElementById('hr-tracking-line');
  const trackingDot = document.getElementById('hr-tracking-dot');

  if (!line || !fill || !Array.isArray(series) || series.length < 2) {
    setCardVisibility('heart-rate-timeline-card', false);
    return;
  }

  setCardVisibility('heart-rate-timeline-card', true);

  const marginLeft = 55;
  const marginRight = 15;
  const marginTop = 15;
  const marginBottom = 30;
  const plotWidth = 1060 - marginLeft - marginRight;
  const plotHeight = 220 - marginTop - marginBottom;
  const top = marginTop;
  const bottom = 220 - marginBottom;

  const bpms = series.map(p => Number(p.bpm)).filter(v => Number.isFinite(v));
  if (bpms.length < 2) {
    setCardVisibility('heart-rate-timeline-card', false);
    return;
  }

  const minBpm = Math.min(...bpms);
  const maxBpm = Math.max(...bpms);
  const rangeBpm = Math.max(maxBpm - minBpm, 1);
  const midBpm = Math.round((minBpm + maxBpm) / 2);

  // Position points by actual timestamp so they align with the time-based x-axis
  const timeStart = new Date(series[0].t).getTime();
  const timeEnd = new Date(series[series.length - 1].t).getTime();
  const timeRange = Math.max(timeEnd - timeStart, 1);
  const points = series.map(point => {
    const t = new Date(point.t).getTime();
    const frac = (t - timeStart) / timeRange;
    const x = marginLeft + frac * plotWidth;
    const y = bottom - ((Number(point.bpm) - minBpm) / rangeBpm) * (bottom - top);
    return { x, y, ...point };
  });

  const pointList = points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const linePath = `M ${pointList.split(' ').join(' L ')}`;
  const fillPath = `${linePath} L ${marginLeft + plotWidth},${220} L ${marginLeft},${220} Z`;

  line.setAttribute('d', linePath);
  fill.setAttribute('d', fillPath);

  axisY.innerHTML = `
    <text x="${marginLeft - 8}" y="${bottom}" class="timeline-axis-label" text-anchor="end">${minBpm}</text>
    <text x="${marginLeft - 8}" y="${(top + bottom) / 2}" class="timeline-axis-label" text-anchor="end">${midBpm}</text>
    <text x="${marginLeft - 8}" y="${top}" class="timeline-axis-label" text-anchor="end">${maxBpm}</text>
    <text x="${marginLeft - 35}" y="${(top + bottom) / 2}" class="timeline-axis-label" text-anchor="end" transform="rotate(-90, ${marginLeft - 35}, ${(top + bottom) / 2})">bpm</text>
  `;

  // Generate evenly-spaced x-axis labels based on time range
  const labelCount = Math.min(7, Math.max(4, Math.floor(plotWidth / 130)));
  let xAxisHtml = '';
  for (let i = 0; i < labelCount; i++) {
    const frac = i / (labelCount - 1);
    const xPos = marginLeft + frac * plotWidth;
    const timeAtPos = new Date(timeStart + frac * timeRange);
    const anchor = i === 0 ? 'start' : i === labelCount - 1 ? 'end' : 'middle';
    xAxisHtml += `<text x="${xPos}" y="${220 - 8}" class="timeline-axis-label" text-anchor="${anchor}">${formatTime(timeAtPos.toISOString())}</text>`;
  }
  axisX.innerHTML = xAxisHtml;

  gridEl.innerHTML = `
    <line class="timeline-grid-line" x1="${marginLeft}" y1="${top}" x2="${marginLeft + plotWidth}" y2="${top}"></line>
    <line class="timeline-grid-line" x1="${marginLeft}" y1="${(top + bottom) / 2}" x2="${marginLeft + plotWidth}" y2="${(top + bottom) / 2}"></line>
    <line class="timeline-grid-line" x1="${marginLeft}" y1="${bottom}" x2="${marginLeft + plotWidth}" y2="${bottom}"></line>
  `;

  hoverArea.setAttribute('x', marginLeft);
  hoverArea.setAttribute('y', top);
  hoverArea.setAttribute('width', plotWidth);
  hoverArea.setAttribute('height', plotHeight);
  hoverArea.setAttribute('cursor', 'crosshair');
  hoverArea.style.pointerEvents = 'all';

  function getSvgCoords(clientX, clientY) {
    const svg = document.getElementById('heart-rate-timeline');
    if (!svg) return null;

    const ctm = svg.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      return pt.matrixTransform(ctm.inverse());
    }

    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * 1060,
      y: ((clientY - rect.top) / rect.height) * 220,
    };
  }

  function findNearestAndUpdate(clientX, clientY) {
    const svgPt = getSvgCoords(clientX, clientY);
    if (!svgPt) return;
    if (svgPt.x < marginLeft || svgPt.x > marginLeft + plotWidth || svgPt.y < top || svgPt.y > bottom) return;
    const mouseX = svgPt.x;
    let nearest = points[0];
    let nearestDist = Infinity;
    for (const p of points) {
      const d = Math.abs(p.x - mouseX);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = p;
      }
    }

    // Update tracking line and dot
    trackingLine.setAttribute('x1', nearest.x);
    trackingLine.setAttribute('y1', top);
    trackingLine.setAttribute('x2', nearest.x);
    trackingLine.setAttribute('y2', bottom);
    trackingLine.style.display = '';
    trackingDot.setAttribute('cx', nearest.x);
    trackingDot.setAttribute('cy', nearest.y);
    trackingDot.style.display = '';

    tooltipTime.textContent = formatTime(nearest.t);
    tooltipValue.textContent = `${nearest.bpm} bpm`;
    tooltip.classList.remove('hidden');
    const offsetX = 14;
    const offsetY = -8;
    let tipLeft = clientX + offsetX;
    let tipTop = clientY + offsetY;
    tooltip.style.left = `${tipLeft}px`;
    tooltip.style.top = `${tipTop}px`;
    requestAnimationFrame(() => {
      const tr = tooltip.getBoundingClientRect();
      if (tipLeft + tr.width > window.innerWidth - 8) tipLeft = clientX - tr.width - offsetX;
      else if (tipLeft < 8) tipLeft = 8;
      if (tipTop < 8) tipTop = 8;
      else if (tipTop + tr.height > window.innerHeight - 8) tipTop = clientY - tr.height - offsetY;
      tooltip.style.left = `${tipLeft}px`;
      tooltip.style.top = `${tipTop}px`;
    });
  }

  function hideTracking() {
    tooltip.classList.add('hidden');
    trackingLine.style.display = 'none';
    trackingDot.style.display = 'none';
  }

  const svgEl = document.getElementById('heart-rate-timeline');
  if (svgEl) {
    svgEl.onmousemove = e => findNearestAndUpdate(e.clientX, e.clientY);
    svgEl.onmouseleave = hideTracking;

    // Touch support for mobile
    svgEl.ontouchmove = e => {
      e.preventDefault();
      const touch = e.touches[0];
      findNearestAndUpdate(touch.clientX, touch.clientY);
    };
    svgEl.ontouchend = hideTracking;
  }

  const minEl = document.getElementById('heart-rate-min');
  const avgEl = document.getElementById('heart-rate-avg');
  const maxEl = document.getElementById('heart-rate-max');
  const latestEl = document.getElementById('heart-rate-latest');
  if (minEl) minEl.textContent = data.heartRateMinBpm !== null ? `${data.heartRateMinBpm} bpm` : '--';
  if (avgEl) avgEl.textContent = data.heartRateAvgBpm !== null ? `${data.heartRateAvgBpm} bpm` : '--';
  if (maxEl) maxEl.textContent = data.heartRateMaxBpm !== null ? `${data.heartRateMaxBpm} bpm` : '--';
  if (latestEl) latestEl.textContent = data.heartRateLatestBpm !== null ? `${data.heartRateLatestBpm} bpm` : '--';

  if (footer) {
    const sourceDay = data.heartRateSeriesDay ? `Source day: ${data.heartRateSeriesDay}` : 'Intraday trend';
    footer.textContent = `${sourceDay} • ${series.length} points`;
  }
}

/**
 * Load health data from JSON
 */
async function loadHealthData() {
  const loadingState = document.getElementById('loading-state');
  const errorState = document.getElementById('error-state');
  const metricsContainer = document.getElementById('metrics-container');
  const lastUpdated = document.getElementById('last-updated');

  // Reset states
  loadingState.classList.remove('hidden');
  errorState.classList.add('hidden');
  metricsContainer.classList.add('hidden');

  try {
    const response = await fetch(DATA_URL, {
      cache: 'no-cache',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    // Validate data structure
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data structure');
    }

    // Update main scores
    updateMetric('sleep-score', data.sleepScore);
    updateMetric('readiness-score', data.readinessScore);
    updateMetric('activity-score', data.activityScore);
    updateMetric('resting-hr', data.restingHrBpm, 'bpm');
    updateMetric('hrv', data.hrvMs, 'ms');
    updateMetric('steps', data.steps);
    updateMetric('calories', data.activeCalories, 'kcal');
    updateMetric('spo2', data.spo2Average, '%');
    updateMetric('workout-count', data.workoutCount);

    // Update temperature with special formatting
    const tempEl = document.getElementById('temp-deviation');
    if (tempEl) {
      if (data.tempDeviation !== null && data.tempDeviation !== undefined) {
        const sign = data.tempDeviation > 0 ? '+' : '';
        tempEl.textContent = `${sign}${data.tempDeviation}`;
        const unitEl = document.createElement('span');
        unitEl.className = 'metric-unit';
        unitEl.textContent = '°C';
        tempEl.appendChild(unitEl);
        tempEl.classList.remove('null');
      } else {
        tempEl.textContent = 'No data';
        tempEl.classList.add('null');
      }
    }

    // Update footers with targets if available
    if (data.steps !== null && data.metersToTarget !== null) {
      const stepsFooter = document.getElementById('steps-footer');
      if (stepsFooter) stepsFooter.textContent = `Target: ${data.metersToTarget}m remaining`;
    }
    if (data.activeCalories !== null && data.targetCalories !== null) {
      const calFooter = document.getElementById('calories-footer');
      if (calFooter) calFooter.textContent = `Target: ${data.targetCalories} kcal`;
    }
    const spo2Footer = document.getElementById('spo2-footer');
    if (spo2Footer) {
      if (data.spo2BreathingDisturbance !== null && data.spo2BreathingDisturbance !== undefined) {
        spo2Footer.textContent = `Breathing disturbance index: ${data.spo2BreathingDisturbance}`;
      } else {
        spo2Footer.textContent = 'Average blood oxygen level';
      }
    }
    const workoutFooter = document.getElementById('workout-footer');
    if (workoutFooter) {
      if (
        data.workoutMinutes !== null &&
        data.workoutMinutes !== undefined &&
        data.workoutCalories !== null &&
        data.workoutCalories !== undefined
      ) {
        workoutFooter.textContent = `${data.workoutMinutes} min • ${data.workoutCalories} kcal`;
      } else {
        workoutFooter.textContent = 'Sessions logged';
      }
    }

    // Render sleep contributors
    renderContributors('sleep-contributors', {
      'Deep Sleep': data.sleepDeep,
      'REM Sleep': data.sleepRem,
      Efficiency: data.sleepEfficiency,
      Latency: data.sleepLatency,
      Restfulness: data.sleepRestfulness,
      Timing: data.sleepTiming,
      'Total Sleep': data.sleepTotal,
    });

    // Render readiness contributors
    renderContributors('readiness-contributors', {
      'Activity Balance': data.readinessActivityBalance,
      'Body Temperature': data.readinessBodyTemp,
      'HRV Balance': data.readinessHrvBalance,
      'Sleep Balance': data.readinessSleepBalance,
      'Sleep Regularity': data.readinessSleepRegularity,
      'Recovery Index': data.readinessRecoveryIndex,
      'Resting HR': data.readinessRestingHr,
      'Previous Night': data.readinessPreviousNight,
    });

    // Render activity contributors
    renderContributors('activity-contributors', {
      'Meet Targets': data.activityMeetTargets,
      'Move Hourly': data.activityMoveHour,
      'Stay Active': data.activityStayActive,
      'Recovery Time': data.activityRecoveryTime,
      'Training Freq': data.activityTrainingFreq,
      'Training Vol': data.activityTrainingVol,
    });

    renderHeartRateTimeline(data.heartRateSeries, data);
    updateHeartbeatIndicator(data.heartRateLatestBpm ?? data.restingHrBpm);
    render7DayTrend(data.byDay || []);

    // Update status badges
    updateStatus('sleep-status', data.sleepScore, 'sleep');
    updateStatus('readiness-status', data.readinessScore, 'readiness');
    updateStatus('activity-status', data.activityScore, 'activity');

    // Hide cards with no meaningful data to keep the page clean
    const hasActivityData =
      data.activityScore !== null ||
      data.steps !== null ||
      data.activeCalories !== null ||
      (typeof data.workoutCount === 'number' && data.workoutCount > 0);
    setCardVisibility('activity-card', hasActivityData);
    setCardVisibility('steps-card', data.steps !== null);
    setCardVisibility('calories-card', data.activeCalories !== null);
    setCardVisibility('resting-hr-card', data.restingHrBpm !== null);
    setCardVisibility('hrv-card', data.hrvMs !== null);
    setCardVisibility('spo2-card', data.spo2Average !== null || data.spo2BreathingDisturbance !== null);
    setCardVisibility('workout-card', typeof data.workoutCount === 'number' && data.workoutCount > 0);

    // Update last updated time
    if (data.lastUpdatedIso) {
      lastUpdated.textContent = `Updated ${getRelativeTime(data.lastUpdatedIso)}`;
    } else {
      lastUpdated.textContent = 'Update time unknown';
    }

    // Show metrics
    loadingState.classList.add('hidden');
    metricsContainer.classList.remove('hidden');
  } catch (error) {
    console.error('Failed to load health data:', error);
    updateHeartbeatIndicator(null);

    loadingState.classList.add('hidden');
    errorState.classList.remove('hidden');
    lastUpdated.textContent = 'Failed to load';
  }
}

// Load data and bind retry on page load
document.addEventListener('DOMContentLoaded', () => {
  const retryButton = document.getElementById('retry-btn');
  if (retryButton) {
    retryButton.addEventListener('click', loadHealthData);
  }
  loadHealthData();
  if (typeof window.trackEvent === 'function') {
    window.trackEvent('health_page_view');
  }
});

// Trend tooltip: instant show on hover (replaces native title delay)
(function initTrendTooltip() {
  const section = document.getElementById('trend-section');
  const tooltip = document.getElementById('trend-tooltip');
  if (!section || !tooltip) return;
  section.addEventListener('mouseover', e => {
    const wrap = e.target.closest('.trend-day-bar-wrap[data-tooltip]');
    if (wrap) {
      const text = wrap.getAttribute('data-tooltip');
      if (text) {
        tooltip.textContent = '';
        const lines = text.split('\n');
        lines.forEach((line, index) => {
          if (index > 0) {
            tooltip.appendChild(document.createElement('br'));
          }
          tooltip.appendChild(document.createTextNode(line));
        });
        tooltip.classList.remove('hidden');
        tooltip.setAttribute('aria-hidden', 'false');
        const rect = wrap.getBoundingClientRect();
        const offset = 8;
        // Place tooltip centered above the hovered bar; measure after first paint
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.top = `${rect.top}px`;
        requestAnimationFrame(() => {
          const tr = tooltip.getBoundingClientRect();
          let left = rect.left + rect.width / 2 - tr.width / 2;
          let top = rect.top - tr.height - offset;
          if (left < 8) left = 8;
          if (left + tr.width > window.innerWidth - 8) left = window.innerWidth - tr.width - 8;
          if (top < 8) top = rect.bottom + offset;
          tooltip.style.left = `${left}px`;
          tooltip.style.top = `${top}px`;
        });
      }
    }
  });
  section.addEventListener('mouseout', e => {
    if (
      !e.relatedTarget?.closest?.('.trend-day-bar-wrap[data-tooltip]') &&
      !e.relatedTarget?.closest?.('#trend-tooltip')
    ) {
      tooltip.classList.add('hidden');
      tooltip.setAttribute('aria-hidden', 'true');
    }
  });
})();

// Refresh every 5 minutes while page is open
setInterval(loadHealthData, 5 * 60 * 1000);
