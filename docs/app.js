(function () {
  const sourceData = window.V19_RESULTS;
  const v30Data = window.V30_RESULTS;
  const liveModel = window.V19_LIVE_MODEL;
  const v30Model = window.V30_LIVE_MODEL;
  let liveParams = liveModel ? { ...liveModel.defaults } : {};
  let data = liveModel ? liveModel.compute(liveParams) : sourceData;
  let v30Params = v30Model ? { ...v30Model.defaults } : {};
  let v30ViewData = v30Model && v30Data ? v30Model.compute(v30Params, v30Data) : v30Data;
  const colors = ['#1f6b70', '#9b4e2f', '#5f4f8f', '#3f7a55', '#9b3d3f', '#315f88', '#7a641f', '#59615d'];
  const tooltip = document.getElementById('chart-tooltip');

  if (!sourceData) {
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

  function humanizeId(value) {
    return String(value || 'data')
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function renderTable(targetId, rows, columns, limit) {
    const target = document.getElementById(targetId);
    if (!target) return;
    const label = humanizeId(targetId);
    const shown = limit ? rows.slice(0, limit) : rows;
    const head = columns.map((col) => `<th scope="col">${escapeHtml(col.label)}</th>`).join('');
    const body = shown.map((row) => {
      const cells = columns.map((col) => {
        const raw = row[col.key];
        const value = col.format ? col.format(raw, row) : formatValue(raw);
        const className = col.className ? ` class="${col.className(raw, row)}"` : '';
        return `<td${className}>${escapeHtml(value)}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    target.innerHTML = `<div class="table-wrap" tabindex="0" role="region" aria-label="${escapeHtml(label)} table"><table><caption class="sr-only">${escapeHtml(label)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function statusClass(value) {
    const text = String(value ?? '').toLowerCase();
    if (text.includes('ok') || text.includes('pass')) return 'status-ok';
    if (text.includes('below') || text.includes('review') || text.includes('check')) return 'status-warn';
    return '';
  }

  function controlGroup(key) {
    if (['z0', 'y', 'deltaZEdge', 'topographyOn', 'terrainSeed', 'ridgeHeight', 'craterDepth'].includes(key)) return 'Geometry';
    if (['nominalIceShell', 'lensMeanDepth', 'boundaryUncertainty', 'dirtyIceLevel', 'surfaceClutterLevel'].includes(key)) return 'Subsurface';
    if (['falseLayerEnabled', 'falseLayerCount', 'falseLayerDepthFraction', 'falseLayerStrength', 'receiverAmbiguityDb'].includes(key)) return 'False layer';
    if (['attenuation', 'detectionThreshold', 'iceIndex', 'alongTrackSpacingM', 'pulseLengthUs', 'windowLossDb', 'baseReflectivityDb', 'frequencySlopeDbPerOctave', 'referenceFrequencyMhz'].includes(key)) return 'Radar signal';
    return 'Model';
  }

  function controlMarkup(control, value, dataKey) {
    const dataAttr = dataKey === 'v30' ? 'data-v30-key' : 'data-live-key';
    if (control.type === 'checkbox') {
      return `
        <label class="control control-toggle">
          <span>${escapeHtml(control.label)}</span>
          <input type="checkbox" ${dataAttr}="${control.key}" ${value ? 'checked' : ''}>
        </label>
      `;
    }
    return `
      <label class="control">
        <span>${escapeHtml(control.label)}</span>
        <input type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${value}" ${dataAttr}="${control.key}">
        <output>${formatValue(value)}${control.unit ? ` ${escapeHtml(control.unit)}` : ''}</output>
      </label>
    `;
  }

  function groupedControls(controls, params, dataKey) {
    const groups = [];
    controls.forEach((control) => {
      const group = controlGroup(control.key);
      let target = groups.find((item) => item.group === group);
      if (!target) {
        target = { group, controls: [] };
        groups.push(target);
      }
      target.controls.push(control);
    });
    return groups.map((group) => `
      <fieldset class="control-group">
        <legend>${escapeHtml(group.group)}</legend>
        <div class="control-group-grid">
          ${group.controls.map((control) => controlMarkup(control, params[control.key], dataKey)).join('')}
        </div>
      </fieldset>
    `).join('');
  }

  function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const sections = document.querySelectorAll('.page-section');
    const validTargets = new Set(Array.from(sections).map((section) => section.id));
    function setActive(target, updateHash) {
      const next = validTargets.has(target) ? target : 'overview';
      tabs.forEach((t) => {
        const active = t.dataset.target === next;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
        t.setAttribute('tabindex', active ? '0' : '-1');
      });
      sections.forEach((section) => {
        const active = section.id === next;
        section.classList.toggle('is-active', active);
        section.setAttribute('role', 'tabpanel');
        section.hidden = !active;
      });
      if (updateHash) history.replaceState(null, '', `#${next}`);
    }
    tabs.forEach((tab, index) => {
      tab.setAttribute('role', 'tab');
      tab.id = `tab-${tab.dataset.target}`;
      const panel = document.getElementById(tab.dataset.target);
      if (panel) {
        tab.setAttribute('aria-controls', panel.id);
        panel.setAttribute('aria-labelledby', tab.id);
      }
      tab.addEventListener('click', () => {
        setActive(tab.dataset.target, true);
      });
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabs.length - 1;
        tabs[nextIndex].focus();
        setActive(tabs[nextIndex].dataset.target, true);
      });
    });
    document.querySelectorAll('[data-tab-jump]').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        setActive(link.dataset.tabJump, true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
    setActive(window.location.hash.replace('#', ''), false);
    if (window.location.hash) {
      window.requestAnimationFrame(() => window.scrollTo(0, 0));
      window.setTimeout(() => window.scrollTo(0, 0), 100);
      window.setTimeout(() => window.scrollTo(0, 0), 350);
    }
  }

  function renderLiveControls() {
    const target = document.getElementById('live-controls');
    if (!target || !liveModel) return;
    target.innerHTML = groupedControls(liveModel.controls, liveParams, 'live');
    target.querySelectorAll('[data-live-key]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.liveKey;
        liveParams[key] = input.type === 'checkbox' ? input.checked : Number(input.value);
        const output = input.parentElement.querySelector('output');
        const def = liveModel.controls.find((item) => item.key === key);
        if (output) output.textContent = `${formatValue(liveParams[key])}${def && def.unit ? ` ${def.unit}` : ''}`;
        updateLiveData();
      });
    });
    const reset = document.getElementById('reset-live-model');
    if (reset && !reset.dataset.bound) {
      reset.dataset.bound = 'true';
      reset.addEventListener('click', () => {
        liveParams = { ...liveModel.defaults };
        data = liveModel.compute(liveParams);
        renderLiveControls();
        renderLiveSections();
      });
    }
  }

  function renderV30Controls() {
    const target = document.getElementById('v30-controls');
    if (!target || !v30Model) return;
    target.innerHTML = groupedControls(v30Model.controls, v30Params, 'v30');
    target.querySelectorAll('[data-v30-key]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.v30Key;
        v30Params[key] = input.type === 'checkbox' ? input.checked : Number(input.value);
        const output = input.parentElement.querySelector('output');
        const def = v30Model.controls.find((item) => item.key === key);
        if (output) output.textContent = `${formatValue(v30Params[key])}${def && def.unit ? ` ${def.unit}` : ''}`;
        updateV30Data();
      });
    });
    const reset = document.getElementById('reset-v30-model');
    if (reset && !reset.dataset.bound) {
      reset.dataset.bound = 'true';
      reset.addEventListener('click', () => {
        v30Params = { ...v30Model.defaults };
        v30ViewData = v30Model.compute(v30Params, v30Data);
        renderV30Controls();
        renderV30();
      });
    }
  }

  function updateLiveData() {
    if (!liveModel) return;
    data = liveModel.compute(liveParams);
    renderLiveSections();
  }

  function updateV30Data() {
    if (!v30Model || !v30Data) return;
    v30ViewData = v30Model.compute(v30Params, v30Data);
    renderV30();
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
      'False-boundary selected',
      'Mean raw slant error',
    ];
    const allRows = [...data.summary, ...data.subsurface, ...data.doppler];
    const picked = summaryPicks.map((label) => allRows.find((row) => row.label === label)).filter(Boolean);
    document.getElementById('metric-grid').innerHTML = picked.map(makeMetric).join('');
    renderDecisionLadder();
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

  function responseValue(label) {
    const row = (data.falseResponse || []).find((item) => item.label === label);
    return row ? row.value : 0;
  }

  function renderDecisionLadder() {
    const target = document.getElementById('decision-ladder');
    if (!target || !data.falseResponse) return;
    const decision = data.falseResponse[0] || {};
    const score = responseValue('Mid-pass heuristic score');
    const outcomes = [
      ['Ocean-boundary likely', responseValue('Ocean-boundary likely')],
      ['Ambiguous double return', responseValue('Ambiguous double return')],
      ['False-boundary selected', responseValue('False-boundary selected')],
      ['Weak/no deep detection', responseValue('Weak/no deep detection')]
    ];
    target.innerHTML = `
      <div class="decision-status">
        <span>Mid-pass classification</span>
        <strong>${escapeHtml(decision.value || 'Unavailable')}</strong>
        <p>${escapeHtml(decision.meaning || '')}</p>
        <small>Heuristic score: ${escapeHtml(formatValue(score))}%</small>
      </div>
      <div class="decision-bars" aria-label="Receiver outcome shares">
        ${outcomes.map(([label, value]) => `
          <div class="decision-bar">
            <span>${escapeHtml(label)}</span>
            <div><i style="width:${Math.max(0, Math.min(100, Number(value) || 0))}%"></i></div>
            <b>${escapeHtml(formatValue(value))}%</b>
          </div>
        `).join('')}
      </div>
    `;
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
    renderTable('false-response-summary', data.falseResponse, [
      { key: 'label', label: 'Output' },
      { key: 'value', label: 'Value' },
      { key: 'unit', label: 'Unit' },
      { key: 'meaning', label: 'What it means' },
    ]);
    renderTable('false-response-steps', data.falseSteps, [
      { key: 'step', label: 'Step' },
      { key: 'satelliteResponse', label: 'Satellite response' },
      { key: 'result', label: 'Result' },
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
    const checkRows = [...data.checks, ...data.subsurfaceChecks];
    const checkColumns = [
      { key: 'check', label: 'Check' },
      { key: 'status', label: 'Status', className: statusClass },
      { key: 'formula', label: 'Formula / reason', format: (v, row) => v || row.why || '' },
    ];
    renderTable('checks-table', checkRows, checkColumns);
    renderTable('checks-table-full', checkRows, checkColumns);
  }

  function renderV30() {
    if (!v30ViewData) return;
    renderChartSet(v30ViewData.charts, 'v30-charts');
    renderAudit();
  }

  function renderCharts(section, targetId) {
    const target = document.getElementById(targetId);
    const charts = data.charts.filter((chart) => chart.section === section);
    renderChartSet(charts, targetId, target);
  }

  function chartPointValues(chart) {
    const values = [];
    chart.series.forEach((series) => {
      series.points.forEach((point) => {
        if (Number.isFinite(point[1])) values.push(point[1]);
      });
    });
    return values;
  }

  function seriesSignature(series) {
    return series.points.map((point) => point.map((value) => value == null ? 'null' : String(value)).join(':')).join('|');
  }

  function validateChart(chart) {
    const findings = [];
    const required = ['id', 'title', 'xLabel', 'yLabel', 'sourceSheet', 'note'];
    required.forEach((key) => {
      if (!chart[key]) findings.push({ level: 'serious', message: `Missing ${key}` });
    });
    if (!chart.series || !chart.series.length) findings.push({ level: 'serious', message: 'No plotted series' });

    const seenSeries = new Map();
    (chart.series || []).forEach((series) => {
      const points = series.points || [];
      if (!series.name) findings.push({ level: 'serious', message: 'Series is missing a label' });
      if (!points.length) findings.push({ level: 'warning', message: `${series.name || 'Series'} has no points` });
      if (/!\$?[A-Z]+\$?\d+/i.test(series.name || '')) findings.push({ level: 'warning', message: `${series.name} looks like a raw workbook range` });
      const finiteCount = points.filter((point) => Number.isFinite(point[1])).length;
      const nullCount = points.filter((point) => point[1] === null).length;
      if (finiteCount === 0 && nullCount === 0) findings.push({ level: 'serious', message: `${series.name || 'Series'} has no numeric y-values` });
      points.forEach((point) => {
        const x = point[0];
        const y = point[1];
        const xOk = typeof x === 'string' || Number.isFinite(x);
        const yOk = y === null || Number.isFinite(y);
        if (!xOk || !yOk) findings.push({ level: 'serious', message: `${series.name || 'Series'} contains a non-finite point` });
      });
      const signature = seriesSignature(series);
      if (seenSeries.has(signature)) {
        findings.push({ level: 'serious', message: `${series.name || 'Series'} duplicates ${seenSeries.get(signature)}` });
      } else {
        seenSeries.set(signature, series.name || 'another series');
      }
      if ((chart.kind || 'line') === 'line' && finiteCount === 1) {
        findings.push({ level: 'info', message: `${series.name || 'Series'} is rendered as a marker` });
      }
      if (nullCount && /radargram|lens/i.test(chart.title)) {
        findings.push({ level: 'info', message: 'Null lens-return gaps are treated as intentional' });
      }
    });

    const values = chartPointValues(chart);
    const labelText = `${chart.title || ''} ${chart.yLabel || ''} ${(chart.series || []).map((series) => series.name).join(' ')}`.toLowerCase();
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (values.length && /percent|%|score|support/.test(labelText) && max <= 1.05 && min >= 0) {
      findings.push({ level: 'serious', message: 'Percent-style chart appears to use 0-1 shares' });
    }
    const yLabelText = String(chart.yLabel || '').toLowerCase();
    if (values.length && /\(us\)|delay/.test(yLabelText) && /depth/.test(labelText)) {
      findings.push({ level: 'serious', message: 'Delay chart text still references depth values' });
    }
    if ((chart.kind || 'line') === 'bar' && chart.xLabel && /scenario|material|instrument|interface/i.test(chart.xLabel)) {
      const firstSeries = chart.series && chart.series[0];
      const numericCategories = firstSeries && firstSeries.points.every((point) => Number.isFinite(point[0]));
      if (numericCategories) findings.push({ level: 'warning', message: 'Categorical bar chart uses numeric category indices' });
    }
    return findings;
  }

  function validateChartSet(label, charts) {
    const titleCounts = new Map();
    (charts || []).forEach((chart) => {
      titleCounts.set(chart.title, (titleCounts.get(chart.title) || 0) + 1);
    });
    const rows = [];
    let serious = 0;
    let warnings = 0;
    (charts || []).forEach((chart) => {
      const findings = validateChart(chart);
      if (titleCounts.get(chart.title) > 1) findings.push({ level: 'serious', message: 'Duplicate chart title in this dataset' });
      findings.forEach((finding) => {
        if (finding.level === 'serious') serious += 1;
        if (finding.level === 'warning') warnings += 1;
      });
      const visibleFindings = findings.filter((finding) => finding.level !== 'info');
      rows.push({
        chart: chart.title,
        scope: label,
        status: visibleFindings.length ? 'Review' : 'OK',
        notes: visibleFindings.length ? visibleFindings.map((finding) => finding.message).join('; ') : 'Metadata, units, series, and values look consistent.'
      });
    });
    return { label, rows, serious, warnings };
  }

  function renderAudit() {
    const sets = [
      validateChartSet('Baseline live model', data.charts || []),
      validateChartSet('Advanced sensitivity model', (v30ViewData && v30ViewData.charts) || [])
    ];
    const serious = sets.reduce((sum, item) => sum + item.serious, 0);
    const warnings = sets.reduce((sum, item) => sum + item.warnings, 0);
    const rows = sets.flatMap((item) => item.rows);
    const summary = `
      <div class="audit-score-grid">
        <article class="audit-score ${serious ? 'is-warn' : 'is-ok'}">
          <span>${serious ? 'Review' : 'Clean'}</span>
          <strong>${serious}</strong>
          <p>serious chart issues</p>
        </article>
        <article class="audit-score">
          <span>Warnings</span>
          <strong>${warnings}</strong>
          <p>non-blocking items</p>
        </article>
        <article class="audit-score">
          <span>Charts</span>
          <strong>${rows.length}</strong>
          <p>rendered and checked</p>
        </article>
      </div>
    `;
    const columns = [
      { key: 'scope', label: 'Scope' },
      { key: 'chart', label: 'Chart' },
      { key: 'status', label: 'Status', className: statusClass },
      { key: 'notes', label: 'Audit note' }
    ];
    const overview = document.getElementById('graph-audit');
    if (overview) {
      const reviewRows = rows.filter((row) => row.status !== 'OK');
      overview.innerHTML = summary + (reviewRows.length ? '<div id="graph-audit-table-inline"></div>' : '') + `<p class="audit-note">${serious ? 'Open the Audit tab for details.' : 'No serious chart issues detected after live recalculation.'}</p>`;
      if (reviewRows.length) renderTable('graph-audit-table-inline', reviewRows, columns, 5);
    }
    const full = document.getElementById('graph-audit-full');
    if (full) {
      full.innerHTML = summary + '<div id="graph-audit-table-full"></div>';
      renderTable('graph-audit-table-full', rows, columns);
    }
  }

  function chartBadges(chart) {
    return validateChart(chart).filter((finding) => finding.level !== 'info');
  }

  function chartHint(chart) {
    const text = `${chart.title} ${chart.yLabel}`.toLowerCase();
    if (text.includes('decision code')) return 'Decision code: 0 means weak/no lock, 1 means ocean likely, 2 means ambiguous, and 3 means the false layer is selected.';
    if (text.includes('false layer') || text.includes('picked boundary')) return 'Use this to see whether the receiver follows the true ocean boundary or gets pulled to an internal false reflector.';
    if (text.includes('delay')) return 'Read as round-trip timing: larger values mean longer extra path or deeper in-ice travel time.';
    if (text.includes('doppler')) return 'Compare angle or depth curves; residual error is expected because the live correction includes a small deterministic angle offset.';
    if (text.includes('margin') || text.includes('threshold')) return 'Values above the zero reference are easier to detect in this simplified threshold model.';
    if (text.includes('percent') || text.includes('support') || text.includes('confidence')) return 'Percent-style series are scaled 0-100 so scenario bars can be compared directly.';
    if (text.includes('surface') || text.includes('terrain')) return 'Use this to compare the target terrain path against the nadir reference used by the range equations.';
    return 'Use the axes and legend to compare each modeled series under the current live assumptions.';
  }

  function chartTextSummary(chart) {
    const values = chartPointValues(chart);
    const series = (chart.series || []).map((item) => item.name).join(', ');
    if (!values.length) return `Series: ${series || 'none'}. No numeric values are available.`;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return `Series: ${series}. Value range: ${formatValue(min)} to ${formatValue(max)} ${axisUnit(chart.yLabel) || axisName(chart.yLabel)}.`;
  }

  function renderChartSet(charts, targetId, knownTarget) {
    const target = knownTarget || document.getElementById(targetId);
    if (!target) return;
    target.innerHTML = charts.map((chart) => {
      const badges = chartBadges(chart);
      return `
      <article class="chart-card ${badges.length ? 'has-warning' : ''}">
        <div class="chart-title-row">
          <div>
            <h3>${escapeHtml(chart.title)}</h3>
            <p class="chart-note">${escapeHtml(chart.note)}</p>
          </div>
          <span class="chart-source">${escapeHtml(chart.sourceSheet)}</span>
        </div>
        ${badges.length ? `<div class="chart-badges">${badges.map((badge) => `<span>${escapeHtml(badge.message)}</span>`).join('')}</div>` : ''}
        <div class="chart-frame" id="${chart.id}"></div>
        <p class="chart-explainer">${escapeHtml(chartHint(chart))}</p>
        <details class="chart-data-summary">
          <summary>Text summary</summary>
          <p>${escapeHtml(chartTextSummary(chart))}</p>
        </details>
        ${chart.formulaNote ? `<p class="formula-note">${escapeHtml(chart.formulaNote)}</p>` : ''}
        <div class="legend">${chart.series.map((series, index) => `
          <span class="legend-item"><span class="legend-swatch" style="background:${colors[index % colors.length]}"></span>${escapeHtml(series.name)}</span>
        `).join('')}</div>
      </article>
    `;
    }).join('');
    charts.forEach((chart) => drawChart(document.getElementById(chart.id), chart));
  }

  function finitePoints(chart) {
    const points = [];
    chart.series.forEach((series, seriesIndex) => {
      series.points.forEach((point) => {
        const x = point[0];
        const y = point[1];
        const label = point[2] ?? point[0];
        if (Number.isFinite(x) && Number.isFinite(y)) {
          points.push({ x, y, label, seriesIndex, seriesName: series.name });
        }
      });
    });
    return points;
  }

  function normalizeChart(chart) {
    const labels = [];
    const labelToIndex = new Map();
    const hasCategory = chart.series.some((series) => series.points.some((point) => typeof point[0] === 'string'));
    if (!hasCategory) return { ...chart, categories: null };
    const series = chart.series.map((item) => ({
      ...item,
      points: item.points.map((point) => {
        const raw = String(point[0]);
        if (!labelToIndex.has(raw)) {
          labels.push(raw);
          labelToIndex.set(raw, labels.length);
        }
        return [labelToIndex.get(raw), point[1], raw];
      }),
    }));
    return { ...chart, series, categories: labels };
  }

  function extent(values, options) {
    const config = options || {};
    let min = Infinity;
    let max = -Infinity;
    values.forEach((value) => {
      if (Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    if (config.percentScale) {
      min = Math.min(0, min);
      max = Math.max(100, max);
    }
    if (config.includeZero) {
      min = Math.min(0, min);
      max = Math.max(0, max);
    }
    if (min === max) return [min - 1, max + 1];
    const pad = (max - min) * 0.08;
    return [min - pad, max + pad];
  }

  function ticks(min, max, count) {
    const span = max - min || 1;
    const rawStep = span / Math.max(count - 1, 1);
    const magnitude = 10 ** Math.floor(Math.log10(Math.abs(rawStep) || 1));
    const residual = rawStep / magnitude;
    const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
    const step = niceResidual * magnitude;
    const start = Math.ceil(min / step) * step;
    const out = [];
    for (let value = start; value <= max + step * 0.5; value += step) {
      out.push(Number(value.toFixed(10)));
    }
    if (!out.length) return [min, max];
    return out;
  }

  function chartUsesPercent(chart) {
    const text = `${chart.title || ''} ${chart.yLabel || ''}`.toLowerCase();
    const values = chartPointValues(chart);
    const max = Math.max(...values);
    return /percent|%|support|score/.test(text) && max <= 105 && max >= 0;
  }

  function drawChart(container, chart) {
    if (!container) return;
    const prepared = normalizeChart(chart);
    const width = 760;
    const height = 420;
    const rotateLabels = prepared.categories && prepared.categories.some((label) => String(label).length > 12);
    const margin = { top: 24, right: 30, bottom: prepared.categories ? (rotateLabels ? 92 : 68) : 58, left: 82 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const points = finitePoints(prepared);
    const [xMin, xMax] = extent(points.map((p) => p.x));
    const yValues = points.map((p) => p.y);
    const [rawYMin, rawYMax] = extent(yValues);
    const [yMin, yMax] = extent(yValues, {
      includeZero: prepared.kind === 'bar' || rawYMin < 0 && rawYMax > 0 || /margin|error|residual/i.test(prepared.yLabel),
      percentScale: chartUsesPercent(prepared)
    });
    const sx = (x) => margin.left + ((x - xMin) / (xMax - xMin || 1)) * plotWidth;
    const sy = (y) => margin.top + plotHeight - ((y - yMin) / (yMax - yMin || 1)) * plotHeight;

    const xTicks = prepared.categories
      ? categoryTicks(prepared.categories.length)
      : ticks(xMin, xMax, 6);
    const yTicks = ticks(yMin, yMax, 5);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(prepared.title)}">`;
    yTicks.forEach((tick) => {
      const y = sy(tick);
      svg += `<line class="grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="axis" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${formatAxisValue(tick)}</text>`;
    });
    xTicks.forEach((tick) => {
      const x = sx(tick);
      svg += `<line class="grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      const label = prepared.categories ? shortenAxisLabel(prepared.categories[Math.round(tick) - 1] || '') : formatAxisValue(tick);
      if (rotateLabels) {
        svg += `<text class="axis" x="${x - 4}" y="${height - margin.bottom + 22}" text-anchor="end" transform="rotate(-28 ${x - 4} ${height - margin.bottom + 22})">${escapeHtml(label)}</text>`;
      } else {
        svg += `<text class="axis" x="${x}" y="${height - margin.bottom + 22}" text-anchor="middle">${escapeHtml(label)}</text>`;
      }
    });
    svg += `<line class="axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="axis-line" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="axis-label" x="${margin.left + plotWidth / 2}" y="${height - 12}" text-anchor="middle">${escapeHtml(prepared.xLabel)}</text>`;
    svg += `<text class="axis-label" transform="translate(16 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">${escapeHtml(prepared.yLabel)}</text>`;
    if (yMin < 0 && yMax > 0) {
      const zeroY = sy(0);
      const zeroLabel = /db|margin|threshold/i.test(prepared.yLabel) ? '0 dB' : '0';
      svg += `<line class="reference-line" x1="${margin.left}" y1="${zeroY}" x2="${width - margin.right}" y2="${zeroY}"></line>`;
      svg += `<text class="reference-label" x="${width - margin.right}" y="${zeroY - 6}" text-anchor="end">${zeroLabel}</text>`;
    }

    if (prepared.kind === 'bar') {
      svg += drawBars(prepared, sx, sy, yMin, height - margin.bottom, plotWidth, margin.left);
    } else {
      prepared.series.forEach((series, index) => {
        const path = linePath(series.points, sx, sy);
        if (path) {
          svg += `<path d="${path}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>`;
        }
        const finiteSeriesPoints = series.points.filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
        const markerSeries = finiteSeriesPoints.length <= 20 || /selected|setting|residual/i.test(series.name);
        if (markerSeries) {
          finiteSeriesPoints.forEach((point) => {
            svg += `<circle class="series-marker" cx="${sx(point[0])}" cy="${sy(point[1])}" r="4" fill="${colors[index % colors.length]}"></circle>`;
          });
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

  function categoryTicks(count) {
    if (count <= 8) return Array.from({ length: count }, (_, index) => index + 1);
    const step = Math.ceil(count / 6);
    const ticksOut = [];
    for (let i = 1; i <= count; i += step) ticksOut.push(i);
    if (ticksOut[ticksOut.length - 1] !== count) ticksOut.push(count);
    return ticksOut;
  }

  function shortenAxisLabel(value) {
    const text = String(value);
    return text.length > 20 ? `${text.slice(0, 18)}...` : text;
  }

  function drawBars(chart, sx, sy, yMin, baseY, plotWidth, left) {
    const categoryCount = chart.categories ? chart.categories.length : Math.max(...chart.series.map((series) => series.points.length));
    const groupWidth = Math.max(18, Math.min(58, plotWidth / Math.max(categoryCount * 1.5, 1)));
    const barWidth = Math.max(3, groupWidth / Math.max(chart.series.length, 1));
    const zeroY = sy(0);
    const baseline = yMin < 0 ? zeroY : baseY;
    let rects = '';
    chart.series.forEach((series, seriesIndex) => {
      series.points.forEach((point) => {
        if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
        const x = sx(point[0]) - groupWidth / 2 + seriesIndex * barWidth;
        const y = sy(point[1]);
        const h = Math.max(1, Math.abs(baseline - y));
        rects += `<rect x="${x}" y="${Math.min(y, baseline)}" width="${Math.max(2, barWidth - 1)}" height="${h}" fill="${colors[seriesIndex % colors.length]}"></rect>`;
      });
    });
    return rects;
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

  function axisName(label) {
    return String(label || '').replace(/\s*\([^)]*\)/g, '').trim() || 'Value';
  }

  function axisUnit(label) {
    const match = String(label || '').match(/\(([^)]+)\)/);
    if (match) return match[1];
    if (String(label || '').includes('%')) return '%';
    return '';
  }

  function formatWithAxis(value, label, digits) {
    const unit = axisUnit(label);
    const formatted = typeof value === 'number' ? formatValue(value, digits) : String(value);
    if (!unit) return formatted;
    return `${formatted} ${unit}`;
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
      <p class="tooltip-line">${escapeHtml(axisName(chart.xLabel))}: ${escapeHtml(formatWithAxis(best.label, chart.xLabel, 3))}</p>
      <p class="tooltip-line">${escapeHtml(axisName(chart.yLabel))}: ${escapeHtml(formatWithAxis(best.y, chart.yLabel, 3))}</p>
    `;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.min(window.innerWidth - 300, event.clientX + 14)}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
  }

  function hideTooltip() {
    tooltip.hidden = true;
  }

  function renderLiveSections() {
    renderOverview();
    renderDetails();
    renderCharts('Surface and motion', 'surface-charts');
    renderCharts('Subsurface model', 'subsurface-charts');
    renderCharts('False-layer response', 'false-layer-charts');
    renderCharts('Doppler depth correction', 'doppler-charts');
    renderAudit();
  }

  function renderAll() {
    renderLiveSections();
    renderV30();
  }

  initTabs();
  renderLiveControls();
  renderV30Controls();
  renderAll();
})();
