const SVG_NS = 'http://www.w3.org/2000/svg';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HEATMAP_GAP = 2;
const HEATMAP_CELL_MIN = 9;
const HEATMAP_CELL_MAX = 14;
const HEATMAP_CELL_IDEAL = 11;
const HEATMAP_MAX_STRETCH = 1.15; // <= 15% extra width vs square cells
const HEATMAP_WEEKS_MIN = 12;
const HEATMAP_WEEKS_MAX = 20;
const HEATMAP_START_OFFSET_MONTHS = 1; // start one month prior by default
function toDayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
function parseDateKey(dateKey) {
  if (!dateKey || typeof dateKey !== 'string') return null;
  const parts = dateKey.split('-');
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const parsed = new Date(year, month, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function normalizeDailyLog(dailyLog) {
  const safeLog = dailyLog && typeof dailyLog === 'object' ? dailyLog : {};
  const map = new Map();
  for (const [key, value] of Object.entries(safeLog)) {
    const parsed = parseDateKey(key);
    if (!parsed || !value || typeof value !== 'object') continue;
    map.set(toDayKey(parsed), {
      count: Number(value.count) || 0,
      words: Number(value.words) || 0,
      duration: Number(value.duration) || 0,
      languages: Array.isArray(value.languages) ? value.languages : [],
    });
  }
  return map;
}
function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}
function formatDateShort(date) {
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}
function createSvgIcon(pathCommands) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const command of pathCommands) {
    const node = document.createElementNS(SVG_NS, command.type);
    for (const [attr, val] of Object.entries(command.attrs)) {
      node.setAttribute(attr, val);
    }
    svg.appendChild(node);
  }
  return svg;
}
function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
function createStatCard(label, value, iconSvg) {
  const card = document.createElement('div');
  card.className = 'stat-card';
  const iconWrap = document.createElement('div');
  iconWrap.className = 'stat-card-icon';
  iconWrap.appendChild(iconSvg);
  const valueEl = document.createElement('div');
  valueEl.className = 'stat-card-value';
  valueEl.textContent = value;
  const labelEl = document.createElement('div');
  labelEl.className = 'stat-card-label';
  labelEl.textContent = label;
  card.appendChild(iconWrap);
  card.appendChild(valueEl);
  card.appendChild(labelEl);
  return card;
}
function getThemePalette() {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const read = (name, fallback) => (styles.getPropertyValue(name) || fallback).trim();
  const palette = [
    read('--heat-0', '#1a1a1a'),
    read('--heat-1', '#2a2a2a'),
    read('--heat-2', '#3a3a3a'),
    read('--heat-3', '#4a4a4a'),
    read('--heat-4', '#ff6b6b'),
  ];
  return palette;
}
function getHeatColor(count) {
  const palette = getThemePalette();
  if (count <= 0) return palette[0];
  if (count <= 2) return palette[1];
  if (count <= 5) return palette[2];
  if (count <= 9) return palette[3];
  return palette[4];
}
let heatmapOffsetMonths = 0;

function renderHeatmapSection(dailyMap) {
  const section = document.createElement('section');
  section.className = 'dashboard-section dashboard-activity';
  const heading = document.createElement('div');
  heading.className = 'dashboard-section-header';

  const title = document.createElement('h3');
  title.className = 'dashboard-section-title';
  title.textContent = 'Activity';
  const subtitle = document.createElement('p');
  subtitle.className = 'dashboard-section-subtitle';
  heading.appendChild(title);
  heading.appendChild(subtitle);

  const nav = document.createElement('div');
  nav.className = 'heatmap-nav';
  nav.tabIndex = 0; // make focusable for arrow-key handling
  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'heatmap-nav-btn';
  prevBtn.textContent = '←';
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'heatmap-nav-btn';
  nextBtn.textContent = '→';
  const navLabel = document.createElement('span');
  navLabel.className = 'heatmap-nav-label';
  nav.appendChild(prevBtn);
  nav.appendChild(navLabel);
  nav.appendChild(nextBtn);
  heading.appendChild(nav);

  const chartWrap = document.createElement('div');
  chartWrap.className = 'heatmap-wrap';

  const leftLabels = document.createElement('div');
  leftLabels.className = 'heatmap-day-labels';
  leftLabels.appendChild(document.createElement('span')).textContent = 'M';
  leftLabels.appendChild(document.createElement('span')).textContent = 'W';
  leftLabels.appendChild(document.createElement('span')).textContent = 'F';

  const content = document.createElement('div');
  content.className = 'heatmap-content';

  const monthLabels = document.createElement('div');
  monthLabels.className = 'heatmap-month-labels';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.classList.add('activity-heatmap');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Daily activity heatmap');

  content.appendChild(monthLabels);
  content.appendChild(svg);
  chartWrap.appendChild(leftLabels);
  chartWrap.appendChild(content);
  section.appendChild(heading);
  section.appendChild(chartWrap);

  // State and render helpers
  let cells = [];
  let monthSpans = [];
  let currentWeeks = HEATMAP_WEEKS_MIN;
  let currentCellSize = HEATMAP_CELL_IDEAL;

  const computeLayout = () => {
    const width = content.clientWidth || 600;
    const ideal = Math.min(HEATMAP_CELL_MAX, Math.max(HEATMAP_CELL_MIN, HEATMAP_CELL_IDEAL));

    const minUnit = ideal + HEATMAP_GAP;
    const weeksFit = Math.min(
      HEATMAP_WEEKS_MAX,
      Math.max(HEATMAP_WEEKS_MIN, Math.floor((width + HEATMAP_GAP) / minUnit)),
    );

    // Compute cell size that fits weeksFit, but cap stretching to 15%.
    const cellFit = (width - (weeksFit - 1) * HEATMAP_GAP) / weeksFit;
    const cellCapped = Math.min(ideal * HEATMAP_MAX_STRETCH, cellFit);
    const cell = Math.min(HEATMAP_CELL_MAX, Math.max(HEATMAP_CELL_MIN, cellCapped));
    return { weeksFit, cell };
  };

  const buildRange = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Determine the visible window end based on offset, but always include today
    const visibleEnd = new Date(today);
    visibleEnd.setMonth(visibleEnd.getMonth() - heatmapOffsetMonths);
    visibleEnd.setDate(1); // start of month for alignment
    visibleEnd.setDate(0); // last day of previous month

    // Compute weeksFit and cell size
    const { weeksFit, cell } = computeLayout();

    // Build a range that fills the available width:
    // alignedEnd = visibleEnd, alignedStart = (weeksFit*7-1) days earlier, aligned to Monday.
    const totalDays = weeksFit * 7;
    const startCandidate = new Date(visibleEnd.getTime() - (totalDays - 1) * MS_PER_DAY);
    const startDay = (startCandidate.getDay() + 6) % 7;
    const alignedStart = new Date(startCandidate.getTime() - startDay * MS_PER_DAY);

    // For nav label, show the month containing alignedStart
    const navStartMonth = new Date(alignedStart);
    navStartMonth.setDate(1);
    const navEndMonth = new Date(visibleEnd);
    navEndMonth.setDate(1);

    // Ensure today is always in the visible range by extending if needed
    let adjustedEnd = new Date(visibleEnd);
    let adjustedStart = new Date(alignedStart);
    if (today > adjustedEnd) {
      // Extend forward to include today
      const daysToAdd = Math.ceil((today.getTime() - adjustedEnd.getTime()) / MS_PER_DAY);
      const weeksToAdd = Math.ceil(daysToAdd / 7);
      adjustedEnd = new Date(adjustedEnd.getTime() + weeksToAdd * 7 * MS_PER_DAY);
      adjustedStart = new Date(adjustedEnd.getTime() - (weeksFit * 7 - 1) * MS_PER_DAY);
      const startDayAdj = (adjustedStart.getDay() + 6) % 7;
      adjustedStart = new Date(adjustedStart.getTime() - startDayAdj * MS_PER_DAY);
    }

    return {
      alignedStart: adjustedStart,
      endDate: adjustedEnd,
      weeks: weeksFit,
      totalDays: weeksFit * 7,
      navStartMonth,
      navEndMonth,
      cell,
    };
  };

  const applyRangeToUI = ({ alignedStart, endDate, navStartMonth, navEndMonth }) => {
    subtitle.textContent = `${formatDateShort(alignedStart)} - ${formatDateShort(endDate)}`;
    navLabel.textContent = `${navStartMonth.toLocaleDateString([], { month: 'short', year: 'numeric' })} – ${navEndMonth.toLocaleDateString([], { month: 'short', year: 'numeric' })}`;
    nextBtn.disabled = heatmapOffsetMonths === 0;
  };

  const applyThemeToCells = () => {
    for (const { node, count } of cells) {
      node.setAttribute('fill', getHeatColor(count));
    }
  };

  const rebuildHeatmap = () => {
    console.log('[heatmap] rebuildHeatmap start, offsetMonths', heatmapOffsetMonths);
    console.log('[heatmap] dailyMap size', dailyMap.size);
    if (dailyMap.size > 0) {
      const sample = Array.from(dailyMap.entries()).slice(0, 3);
      console.log('[heatmap] dailyMap sample', sample);
    }
    // Clear prior cells/labels
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    while (monthLabels.firstChild) monthLabels.removeChild(monthLabels.firstChild);
    cells = [];
    monthSpans = [];

    const { alignedStart, endDate, weeks, totalDays, navStartMonth, navEndMonth, cell } = buildRange();
    currentWeeks = weeks;
    currentCellSize = cell;
    applyRangeToUI({ alignedStart, endDate, navStartMonth, navEndMonth });
    console.log('[heatmap] visible range', formatDateShort(alignedStart), 'to', formatDateShort(endDate));

    // Cache palette for this render
    const palette = getThemePalette();
    console.log('[heatmap] theme palette', palette);

    let previousMonth = '';
    for (let index = 0; index < totalDays; index++) {
      const currentDate = new Date(alignedStart.getTime() + index * MS_PER_DAY);
      const day = (currentDate.getDay() + 6) % 7; // Monday=0
      const week = Math.floor(index / 7);
      const dateKey = toDayKey(currentDate);
      const count = dailyMap.get(dateKey)?.count || 0;

      // Month label on the first day of each month (not just Monday)
      if (currentDate.getDate() === 1) {
        const month = currentDate.toLocaleDateString([], { month: 'short' });
        if (month !== previousMonth) {
          const monthLabel = document.createElement('span');
          monthLabel.className = 'heatmap-month-label';
          monthLabel.textContent = month;
          monthLabels.appendChild(monthLabel);
          monthSpans.push({ span: monthLabel, weekIndex: week });
          previousMonth = month;
        }
      }

      const cell = document.createElementNS(SVG_NS, 'rect');
      cell.setAttribute('rx', '2');
      cell.setAttribute('ry', '2');
      cell.classList.add('heatmap-cell');
      cell.setAttribute('fill', (() => {
        if (count <= 0) return palette[0];
        if (count <= 2) return palette[1];
        if (count <= 5) return palette[2];
        if (count <= 9) return palette[3];
        return palette[4];
      })());
      cell.setAttribute('data-date', dateKey);
      cell.setAttribute('data-count', String(count));
      const tooltip = document.createElementNS(SVG_NS, 'title');
      tooltip.textContent = `${count} transcription${count !== 1 ? 's' : ''} on ${dateKey}`;
      cell.appendChild(tooltip);
      svg.appendChild(cell);
      cells.push({ node: cell, week, day, weeks, count, dateKey });
    }

    layoutHeatmap();
    requestAnimationFrame(layoutHeatmap);

    // Custom tooltip hover card
    let tooltip = null;
    const showTooltip = (e, dateKey, count) => {
      hideTooltip();
      tooltip = document.createElement('div');
      tooltip.className = 'heatmap-tooltip';
      tooltip.innerHTML = `<strong>${count}</strong> transcription${count !== 1 ? 's' : ''} on ${dateKey}`;
      document.body.appendChild(tooltip);
      const rect = e.target.getBoundingClientRect();
      tooltip.style.left = `${rect.left + rect.width / 2}px`;
      tooltip.style.top = `${rect.bottom + 6}px`;
      tooltip.style.transform = 'translateX(-50%)';
    };
    const hideTooltip = () => {
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
    };
    for (const { node, dateKey, count } of cells) {
      node.addEventListener('mouseenter', (e) => showTooltip(e, dateKey, count));
      node.addEventListener('mouseleave', hideTooltip);
    }
  };

  // Responsive layout: recompute cell sizes based on container width
  const layoutHeatmap = () => {
    const weeks = currentWeeks || HEATMAP_WEEKS_MIN;
    const cell = currentCellSize || HEATMAP_CELL_IDEAL;
    const svgWidth = weeks * (cell + HEATMAP_GAP) - HEATMAP_GAP;
    const svgHeight = 7 * (cell + HEATMAP_GAP) - HEATMAP_GAP;

    svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
    svg.setAttribute('width', String(svgWidth));
    svg.setAttribute('height', String(svgHeight));
    svg.style.width = `${svgWidth}px`;
    svg.style.maxWidth = '100%';
    svg.style.height = `${svgHeight}px`;

    for (const { node, week, day } of cells) {
      const x = week * (cell + HEATMAP_GAP);
      const y = day * (cell + HEATMAP_GAP);
      node.setAttribute('x', String(x));
      node.setAttribute('y', String(y));
      node.setAttribute('width', String(cell));
      node.setAttribute('height', String(cell));
    }

    for (const { span, weekIndex } of monthSpans) {
      const x = weekIndex * (cell + HEATMAP_GAP) + cell / 2;
      span.style.left = `${x}px`;
      span.style.transform = 'translateX(-50%)';
    }
  };

  const goPrev = () => {
    heatmapOffsetMonths += 1;
    console.log('[heatmap] goPrev, offset now', heatmapOffsetMonths);
    rebuildHeatmap();
  };

  const goNext = () => {
    if (heatmapOffsetMonths === 0) return;
    heatmapOffsetMonths -= 1;
    console.log('[heatmap] goNext, offset now', heatmapOffsetMonths);
    rebuildHeatmap();
  };

  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', goNext);

  const handleNavKey = (e) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goPrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goNext();
    }
  };

  nav.addEventListener('keydown', handleNavKey);
  const resizeObserver = new ResizeObserver(layoutHeatmap);
  resizeObserver.observe(content);

  const themeObserver = new MutationObserver(() => {
    applyThemeToCells();
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });

  rebuildHeatmap();
  return section;
}
function renderDailyBarSection(dailyMap) {
  const section = document.createElement('section');
  section.className = 'dashboard-section dashboard-daily-chart';
  const title = document.createElement('h3');
  title.className = 'dashboard-section-title';
  title.textContent = 'Daily Activity';
  section.appendChild(title);
  const bars = document.createElement('div');
  bars.className = 'daily-bars';

  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) {
    const day = new Date(today.getTime() - i * MS_PER_DAY);
    const dateKey = toDayKey(day);
    const count = dailyMap.get(dateKey)?.count || 0;
    days.push({ date: day, count });
  }
  const maxCount = Math.max(1, ...days.map(day => day.count));
  for (const day of days) {
    const item = document.createElement('div');
    item.className = 'daily-bar-item';
    const countEl = document.createElement('div');
    countEl.className = 'daily-bar-count';
    countEl.textContent = String(day.count);
    const track = document.createElement('div');
    track.className = 'daily-bar-track';
    const bar = document.createElement('div');
    bar.className = 'daily-bar-fill';
    bar.style.height = `${Math.max(4, Math.round((day.count / maxCount) * 100))}%`;
    bar.title = `${day.count} transcriptions on ${toDayKey(day.date)}`;
    track.appendChild(bar);
    const label = document.createElement('div');
    label.className = 'daily-bar-label';
    label.textContent = day.date.toLocaleDateString([], { weekday: 'short' });
    item.appendChild(countEl);
    item.appendChild(track);
    item.appendChild(label);
    bars.appendChild(item);
  }
  section.appendChild(bars);
  return section;
}
function renderLanguagesSection(dailyMap) {
  const section = document.createElement('section');
  section.className = 'dashboard-section dashboard-language-chart';
  const title = document.createElement('h3');
  title.className = 'dashboard-section-title';
  title.textContent = 'Languages';
  section.appendChild(title);
  const counts = new Map();
  for (const day of dailyMap.values()) {
    for (const rawLang of day.languages) {
      const lang = String(rawLang || '').trim().toLowerCase();
      if (!lang) continue;
      counts.set(lang, (counts.get(lang) || 0) + 1);
    }
  }
  const rows = document.createElement('div');
  rows.className = 'language-bars';

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const max = sorted.length > 0 ? sorted[0][1] : 0;
  const total = sorted.reduce((sum, item) => sum + item[1], 0);
  if (sorted.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'dashboard-empty-state';
    empty.textContent = 'No language activity yet.';
    section.appendChild(empty);
    return section;
  }
  for (const [lang, count] of sorted) {
    const row = document.createElement('div');
    row.className = 'language-bar-row';
    const label = document.createElement('div');
    label.className = 'language-bar-label';
    label.textContent = lang.toUpperCase();
    const track = document.createElement('div');
    track.className = 'language-bar-track';
    const fill = document.createElement('div');
    fill.className = 'language-bar-fill';
    fill.style.width = `${Math.max(3, Math.round((count / max) * 100))}%`;
    track.appendChild(fill);
    const value = document.createElement('div');
    value.className = 'language-bar-value';
    const percent = total > 0 ? Math.round((count / total) * 100) : 0;
    value.textContent = `${count} (${percent}%)`;
    row.appendChild(label);
    row.appendChild(track);
    row.appendChild(value);
    rows.appendChild(row);
  }
  section.appendChild(rows);
  return section;
}
export function renderDashboard(container, rewardsData) {
  if (!container) return;
  container.innerHTML = '';
  if (!rewardsData || typeof rewardsData !== 'object') {
    const empty = document.createElement('div');
    empty.className = 'dashboard-empty-state';
    empty.textContent = 'No data yet. Start transcribing to see your stats!';
    container.appendChild(empty);
    return;
  }
  const dailyMap = normalizeDailyLog(rewardsData.daily_log);
  const dashboard = document.createElement('div');
  dashboard.className = 'dashboard-content';
  const stats = document.createElement('section');
  stats.className = 'dashboard-stats-grid';
  const micIcon = createSvgIcon([
    { type: 'path', attrs: { d: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z' } },
    { type: 'path', attrs: { d: 'M19 10a7 7 0 0 1-14 0' } },
    { type: 'path', attrs: { d: 'M12 17v4' } },
    { type: 'path', attrs: { d: 'M8 21h8' } },
  ]);
  const textIcon = createSvgIcon([
    { type: 'path', attrs: { d: 'M4 6h16' } },
    { type: 'path', attrs: { d: 'M4 12h16' } },
    { type: 'path', attrs: { d: 'M4 18h10' } },
  ]);
  const clockIcon = createSvgIcon([
    { type: 'circle', attrs: { cx: '12', cy: '12', r: '8' } },
    { type: 'path', attrs: { d: 'M12 8v5l3 2' } },
  ]);
  const calendarIcon = createSvgIcon([
    { type: 'rect', attrs: { x: '3.5', y: '5', width: '17', height: '15', rx: '2' } },
    { type: 'path', attrs: { d: 'M7 3v4M17 3v4M3.5 10h17' } },
  ]);
  const statCards = [
    createStatCard('Transcriptions', formatNumber(rewardsData.total_transcriptions), micIcon),
    createStatCard('Words', formatNumber(rewardsData.total_words), textIcon),
    createStatCard('Duration', formatDuration(rewardsData.total_duration), clockIcon),
    createStatCard('Active Days', formatNumber(rewardsData.total_active_days), calendarIcon),
  ];
  for (const card of statCards) {
    stats.appendChild(card);
  }

  dashboard.appendChild(stats);
  dashboard.appendChild(renderHeatmapSection(dailyMap));
  dashboard.appendChild(renderDailyBarSection(dailyMap));
  dashboard.appendChild(renderLanguagesSection(dailyMap));
  container.appendChild(dashboard);
}
