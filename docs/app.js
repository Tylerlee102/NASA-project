(function () {
  const data = window.V19_RESULTS;
  const colors = ['#087c89', '#bd642b', '#7659a6', '#4f7d55', '#a44949', '#2f5d83', '#8b6f2e', '#48515a'];
  const tooltip = document.getElementById('chart-tooltip');

  if (!data) {
    document.body.innerHTML = '<main><h1>Site data did not load.</h1></main>';
    return;
  }

  function formatValue(value, digits = 2) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    const abs = Math.abs(value);
    if (abs >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: digits });
    if (abs >= 100) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    if (abs >= 10) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (abs >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }

  function formatAxisValue(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value !== 'number') return String(value);
    const abs = Math.abs(value);
    if (abs >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return formatValue(value, 1);
  }

  function metricValue(row) {
    const unit = row.unit ? `<span class="metric-unit">${row.unit}</span>` : '';
    return `<p class="metric-value"><span class="metric-number">${formatValue(row.value)}</span>${unit}</p>`;
  }

  function makeMetric(row) {
    return `
      <article class="metric">
        <p class="metric-label">${escapeHtml(row.label)}</p>
        ${metricValue(row)}
        <p class="metric-note">${escapeHtml(row.meaning || '')}</p>
      </article>
    `;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function renderTable(targetId, rows, columns, limit) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const shown = limit ? rows.slice(0, limit) : rows;
    const head = columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join('');
    const body = shown.map((row) => {
      const cells = columns.map((col) => {
        const raw = row[col.key];
        const value = col.format ? col.format(raw, row) : formatValue(raw);
        const className = col.className ? ` class="${col.className(raw, row)}"` : '';
        return `<td${className}>${escapeHtml(value)}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    target.innerHTML = `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function statusClass(value) {
    const text = String(value ?? '').toLowerCase();
    if (text.includes('ok') || text.includes('pass')) return 'status-ok';
    if (text.includes('below') || text.includes('review') || text.includes('check')) return 'status-warn';
    return '';
  }

  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const sections = document.querySelectorAll('.page-section');
    const validTargets = new Set(Array.from(sections).map((section) => section.id));
    function setActive(target, updateHash) {
      const next = validTargets.has(target) ? target : 'overview';
      tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.target === next));
      sections.forEach((section) => section.classList.toggle('is-active', section.id === next));
      if (updateHash) history.replaceState(null, '', `#${next}`);
    }
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        setActive(tab.dataset.target, true);
      });
    });
    setActive(window.location.hash.replace('#', ''), false);
    if (window.location.hash) {
      window.requestAnimationFrame(() => window.scrollTo(0, 0));
      window.setTimeout(() => window.scrollTo(0, 0), 100);
      window.setTimeout(() => window.scrollTo(0, 0), 350);
    }
  }

  function renderOverview() {
    document.getElementById('source-note').textContent = `Source: ${data.source.workbook}`;
    document.getElementById('caveat').textContent = data.overview.caveat;
    const summaryPicks = [
      'Flat apparent depth at mid-pass',
      'Topo apparent depth at mid-pass',
      'Depth change from topography',
      'Simple minimum PRF with topo',
      'Average bottom depth',
      'Best ocean echo margin',
      'Likely visible ocean samples',
      'Mean raw slant error',
    ];
    const allRows = [...data.summary, ...data.subsurface, ...data.doppler];
    const picked = summaryPicks.map((label) => allRows.find((row) => row.label === label)).filter(Boolean);
    document.getElementById('metric-grid').innerHTML = picked.map(makeMetric).join('');
    renderTable('prf-table', data.prf, [
      { key: 'prfHz', label: 'PRF (Hz)' },
      { key: 'pulseIntervalMs', label: 'Pulse interval (ms)' },
      { key: 'spacingM', label: 'Spacing (m)' },
      { key: 'unambiguousRangeKm', label: 'Range (km)' },
      { key: 'status', label: 'Status', className: statusClass },
    ]);
    renderTable('realism-table', data.realism, [
      { key: 'score', label: 'Score' },
      { key: 'value', label: 'Value' },
      { key: 'meaning', label: 'Meaning' },
      { key: 'improveBy', label: 'Improve by' },
    ]);
  }

  function renderDetails() {
    renderTable('subsurface-summary', data.subsurface, [
      { key: 'label', label: 'Output' },
      { key: 'value', label: 'Value' },
      { key: 'unit', label: 'Unit' },
      { key: 'meaning', label: 'What it means' },
    ]);
    renderTable('doppler-table', data.doppler, [
      { key: 'label', label: 'Output' },
      { key: 'value', label: 'Value' },
      { key: 'unit', label: 'Unit' },
    ]);
    renderTable('doppler-input-table', data.dopplerInputs, [
      { key: 'label', label: 'Input' },
      { key: 'value', label: 'Value' },
      { key: 'unit', label: 'Unit' },
    ]);
    renderTable('input-table', data.inputs, [
      { key: 'parameter', label: 'Parameter' },
      { key: 'value', label: 'Value' },
      { key: 'unit', label: 'Unit' },
    ], 24);
    renderTable('sub-input-table', data.subsurfaceInputs, [
      { key: 'section', label: 'Section' },
      { key: 'parameter', label: 'Parameter' },
      { key: 'value', label: 'Value' },
      { key: 'unit', label: 'Unit' },
    ], 24);
    renderTable('checks-table', [...data.checks, ...data.subsurfaceChecks], [
      { key: 'check', label: 'Check' },
      { key: 'status', label: 'Status', className: statusClass },
      { key: 'formula', label: 'Formula / reason', format: (v, row) => v || row.why || '' },
    ]);
  }

  function renderCharts(section, targetId) {
    const target = document.getElementById(targetId);
    const charts = data.charts.filter((chart) => chart.section === section);
    target.innerHTML = charts.map((chart) => `
      <article class="chart-card">
        <div class="chart-title-row">
          <div>
            <h3>${escapeHtml(chart.title)}</h3>
            <p class="chart-note">${escapeHtml(chart.note)}</p>
          </div>
          <span class="chart-source">${escapeHtml(chart.sourceSheet)}</span>
        </div>
        <div class="chart-frame" id="${chart.id}"></div>
        <div class="legend">${chart.series.map((series, index) => `
          <span class="legend-item"><span class="legend-swatch" style="background:${colors[index % colors.length]}"></span>${escapeHtml(series.name)}</span>
        `).join('')}</div>
      </article>
    `).join('');
    charts.forEach((chart) => drawChart(document.getElementById(chart.id), chart));
  }

  function finitePoints(chart) {
    const points = [];
    chart.series.forEach((series, seriesIndex) => {
      series.points.forEach((point) => {
        const x = point[0];
        const y = point[1];
        if (Number.isFinite(x) && Number.isFinite(y)) {
          points.push({ x, y, seriesIndex, seriesName: series.name });
        }
      });
    });
    return points;
  }

  function extent(values) {
    let min = Infinity;
    let max = -Infinity;
    values.forEach((value) => {
      if (Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    if (min === max) return [min - 1, max + 1];
    const pad = (max - min) * 0.08;
    return [min - pad, max + pad];
  }

  function ticks(min, max, count) {
    const span = max - min || 1;
    const step = span / (count - 1);
    return Array.from({ length: count }, (_, index) => min + step * index);
  }

  function drawChart(container, chart) {
    if (!container) return;
    const width = 760;
    const height = 420;
    const margin = { top: 20, right: 26, bottom: 54, left: 70 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const points = finitePoints(chart);
    const [xMin, xMax] = extent(points.map((p) => p.x));
    const [yMin, yMax] = extent(points.map((p) => p.y));
    const sx = (x) => margin.left + ((x - xMin) / (xMax - xMin || 1)) * plotWidth;
    const sy = (y) => margin.top + plotHeight - ((y - yMin) / (yMax - yMin || 1)) * plotHeight;

    const xTicks = ticks(xMin, xMax, 6);
    const yTicks = ticks(yMin, yMax, 5);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(chart.title)}">`;
    yTicks.forEach((tick) => {
      const y = sy(tick);
      svg += `<line class="grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="axis" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${formatAxisValue(tick)}</text>`;
    });
    xTicks.forEach((tick) => {
      const x = sx(tick);
      svg += `<line class="grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="axis" x="${x}" y="${height - margin.bottom + 22}" text-anchor="middle">${formatAxisValue(tick)}</text>`;
    });
    svg += `<line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="axis-label" x="${margin.left + plotWidth / 2}" y="${height - 12}" text-anchor="middle">${escapeHtml(chart.xLabel)}</text>`;
    svg += `<text class="axis-label" transform="translate(16 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">${escapeHtml(chart.yLabel)}</text>`;

    if (chart.kind === 'bar') {
      svg += drawBars(chart, sx, sy, yMin, height - margin.bottom, plotWidth, margin.left);
    } else {
      chart.series.forEach((series, index) => {
        const path = linePath(series.points, sx, sy);
        if (path) {
          svg += `<path d="${path}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>`;
        }
      });
    }
    svg += `<rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="transparent" data-hit="true"></rect>`;
    svg += '</svg>';
    container.innerHTML = svg;
    const hit = container.querySelector('[data-hit="true"]');
    hit.addEventListener('mousemove', (event) => showTooltip(event, chart, points, sx, sy));
    hit.addEventListener('mouseleave', hideTooltip);
  }

  function drawBars(chart, sx, sy, yMin, baseY, plotWidth, left) {
    const series = chart.series[0];
    const pts = series.points.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
    const width = Math.max(16, Math.min(48, plotWidth / Math.max(pts.length * 1.8, 1)));
    return pts.map((point, index) => {
      const x = sx(point[0]) - width / 2;
      const y = sy(Math.max(point[1], yMin));
      const h = Math.max(1, Math.abs(baseY - y));
      return `<rect x="${x}" y="${Math.min(y, baseY)}" width="${width}" height="${h}" fill="${colors[index % colors.length]}"></rect>`;
    }).join('');
  }

  function linePath(points, sx, sy) {
    let path = '';
    let active = false;
    points.forEach((point) => {
      const x = point[0];
      const y = point[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        active = false;
        return;
      }
      path += `${active ? 'L' : 'M'}${sx(x).toFixed(2)} ${sy(y).toFixed(2)} `;
      active = true;
    });
    return path.trim();
  }

  function showTooltip(event, chart, points, sx, sy) {
    if (!points.length) return;
    const rect = event.currentTarget.ownerSVGElement.getBoundingClientRect();
    const scaleX = 760 / rect.width;
    const scaleY = 420 / rect.height;
    const localX = (event.clientX - rect.left) * scaleX;
    const localY = (event.clientY - rect.top) * scaleY;
    let best = points[0];
    let bestDist = Infinity;
    points.forEach((point) => {
      const dx = sx(point.x) - localX;
      const dy = sy(point.y) - localY;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = point;
      }
    });
    tooltip.innerHTML = `
      <p class="tooltip-title">${escapeHtml(best.seriesName)}</p>
      <p class="tooltip-line">x: ${formatValue(best.x, 3)}</p>
      <p class="tooltip-line">y: ${formatValue(best.y, 3)}</p>
    `;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(window.innerWidth - 300, event.clientX + 14)}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
  }

  function hideTooltip() {
    tooltip.hidden = true;
  }

  initTabs();
  renderOverview();
  renderDetails();
  renderCharts('Surface and motion', 'surface-charts');
  renderCharts('Subsurface model', 'subsurface-charts');
  renderCharts('Doppler depth correction', 'doppler-charts');
})();
