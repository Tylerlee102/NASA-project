(() => {
  'use strict';

  const C = 299792458;
  const fcHz = 60e6;
  const wavelengthM = C / fcHz;
  const model = {
    altitudeKm: 25,
    velocityKmS: 3.0,
    iceIndex: 1.78,
    targetDepthKm: 2.10,
    targetToleranceKm: 0.08,
    distanceKm: 41.73,
    depthMaxKm: 3.15
  };
  const image = {
    href: 'assets/oib_20110329_01_033_1echo.jpg',
    width: 1501,
    height: 1126,
    plotLeft: 195,
    plotRight: 1358,
    plotTop: 85,
    plotBottom: 1001
  };
  const fixedPrfHz = prfForDepth(model.targetDepthKm);
  const staggeredPrfsHz = [
    fixedPrfHz - 60,
    fixedPrfHz - 20,
    fixedPrfHz + 20,
    fixedPrfHz + 60
  ];
  const blockCount = 24;
  const prfMinHz = 500;
  const prfMaxHz = 680;
  const depthMinKm = 1.35;
  const depthMaxKm = 2.90;
  const visualBlurHalfKm = model.targetToleranceKm * 2.4;

  const overlay = document.getElementById('radargram-overlay');
  const prfPlot = document.getElementById('prf-schedule-plot');
  const foldPlot = document.getElementById('fold-depth-plot');
  const cellPlot = document.getElementById('current-cell-plot');
  const fixedButton = document.getElementById('fixed-case');
  const staggeredButton = document.getElementById('staggered-case');
  const traceSlider = document.getElementById('trace-position');
  const traceOutput = document.getElementById('trace-position-output');
  const caseSummary = document.getElementById('case-summary');
  const initialCase = new URLSearchParams(window.location.search).get('case');
  let mode = initialCase === 'four' || initialCase === 'staggered' ? 'staggered' : 'fixed';

  const fmt = (value, digits = 1) => Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });

  function prfForDepth(depthKm) {
    const rangeKm = model.altitudeKm + model.iceIndex * depthKm;
    const xKm = Math.sqrt(Math.max(0, rangeKm ** 2 - model.altitudeKm ** 2));
    return (2 * model.velocityKmS * 1000 / wavelengthM) * (xKm / rangeKm);
  }

  function foldDepthForPrf(prfHz) {
    const sinTheta = Math.abs(prfHz) * wavelengthM / (2 * model.velocityKmS * 1000);
    if (sinTheta <= 0 || sinTheta >= 1) return NaN;
    const rangeKm = model.altitudeKm / Math.sqrt(1 - sinTheta ** 2);
    return (rangeKm - model.altitudeKm) / model.iceIndex;
  }

  function xFromDistance(distanceKm) {
    return image.plotLeft + (distanceKm / model.distanceKm) * (image.plotRight - image.plotLeft);
  }

  function yFromDepth(depthKm) {
    return image.plotTop + (depthKm / model.depthMaxKm) * (image.plotBottom - image.plotTop);
  }

  function blockForDistance(distanceKm) {
    return Math.max(0, Math.min(blockCount - 1, Math.floor((distanceKm / model.distanceKm) * blockCount)));
  }

  function activePrfForDistance(distanceKm) {
    if (mode === 'fixed') return fixedPrfHz;
    return staggeredPrfsHz[blockForDistance(distanceKm) % staggeredPrfsHz.length];
  }

  function currentState() {
    const distanceKm = Number(traceSlider.value);
    const prfHz = activePrfForDistance(distanceKm);
    const foldDepthKm = foldDepthForPrf(prfHz);
    const overlaps = Math.abs(foldDepthKm - model.targetDepthKm) <= model.targetToleranceKm;
    return { distanceKm, prfHz, foldDepthKm, overlaps };
  }

  function renderRadargram(state) {
    const targetY = yFromDepth(model.targetDepthKm);
    const windowTop = yFromDepth(model.targetDepthKm - model.targetToleranceKm);
    const windowBottom = yFromDepth(model.targetDepthKm + model.targetToleranceKm);
    const currentX = xFromDistance(state.distanceKm);
    const currentY = yFromDepth(state.foldDepthKm);
    let svg = `<svg viewBox="0 0 ${image.width} ${image.height}" role="img" aria-label="Operation IceBridge radargram with synthetic PRF fold overlay">
      <defs>
        <filter id="rg-layer-blur" x="-8%" y="-140%" width="116%" height="380%">
          <feGaussianBlur stdDeviation="13"></feGaussianBlur>
        </filter>
        <filter id="rg-blob-blur" x="-90%" y="-160%" width="280%" height="420%">
          <feGaussianBlur stdDeviation="10"></feGaussianBlur>
        </filter>
        <linearGradient id="rg-fixed-blur-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#9b3d3f" stop-opacity="0"></stop>
          <stop offset=".36" stop-color="#9b3d3f" stop-opacity=".28"></stop>
          <stop offset=".50" stop-color="#9b3d3f" stop-opacity=".42"></stop>
          <stop offset=".64" stop-color="#9b3d3f" stop-opacity=".28"></stop>
          <stop offset="1" stop-color="#9b3d3f" stop-opacity="0"></stop>
        </linearGradient>
        <radialGradient id="rg-blob-fill">
          <stop offset="0" stop-color="#9b3d3f" stop-opacity=".50"></stop>
          <stop offset=".44" stop-color="#9b3d3f" stop-opacity=".25"></stop>
          <stop offset="1" stop-color="#9b3d3f" stop-opacity="0"></stop>
        </radialGradient>
      </defs>
      <image href="${image.href}" x="0" y="0" width="${image.width}" height="${image.height}"></image>
      <rect class="rg-target-window" x="${image.plotLeft}" y="${windowTop}" width="${image.plotRight - image.plotLeft}" height="${windowBottom - windowTop}"></rect>
      <line class="rg-target-line" x1="${image.plotLeft}" y1="${targetY}" x2="${image.plotRight}" y2="${targetY}"></line>
      <text class="rg-title" x="${image.plotRight - 18}" y="${targetY - 12}" text-anchor="end">teaching target cell: ${fmt(model.targetDepthKm, 2)} km</text>`;

    if (mode === 'fixed') {
      const blurTop = yFromDepth(state.foldDepthKm - visualBlurHalfKm);
      const blurBottom = yFromDepth(state.foldDepthKm + visualBlurHalfKm);
      const coreTop = yFromDepth(state.foldDepthKm - model.targetToleranceKm * 0.7);
      const coreBottom = yFromDepth(state.foldDepthKm + model.targetToleranceKm * 0.7);
      svg += `<rect class="rg-bad-band-soft" x="${image.plotLeft}" y="${blurTop}" width="${image.plotRight - image.plotLeft}" height="${blurBottom - blurTop}"></rect>`;
      svg += `<rect class="rg-bad-band-core" x="${image.plotLeft}" y="${coreTop}" width="${image.plotRight - image.plotLeft}" height="${coreBottom - coreTop}"></rect>`;
      svg += `<text class="rg-danger" x="${image.plotLeft + 18}" y="${blurTop - 10}">fixed bad PRF: folded clutter smears into one blurry layer</text>`;
    } else {
      for (let block = 0; block < blockCount; block += 1) {
        const startKm = (block / blockCount) * model.distanceKm;
        const endKm = ((block + 1) / blockCount) * model.distanceKm;
        const prfHz = staggeredPrfsHz[block % staggeredPrfsHz.length];
        const foldDepthKm = foldDepthForPrf(prfHz);
        const x1 = xFromDistance(startKm);
        const x2 = xFromDistance(endKm);
        const cx = (x1 + x2) / 2;
        const cy = yFromDepth(foldDepthKm);
        const rx = Math.max(24, (x2 - x1) * 0.82);
        const ry = Math.abs(yFromDepth(foldDepthKm + visualBlurHalfKm * 0.72) - cy);
        svg += `<ellipse class="rg-blur-blob" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"></ellipse>`;
        svg += `<ellipse class="rg-blur-blob-core" cx="${cx}" cy="${cy}" rx="${rx * 0.42}" ry="${ry * 0.38}"></ellipse>`;
      }
      svg += `<text class="rg-danger" x="${image.plotLeft + 18}" y="${image.plotTop + 34}">four PRFs: folded clutter appears as moving blurred dots, not one layer</text>`;
    }

    svg += `<line class="rg-current-line" x1="${currentX}" y1="${image.plotTop}" x2="${currentX}" y2="${image.plotBottom}"></line>`;
    svg += `<circle class="rg-current-dot" cx="${currentX}" cy="${currentY}" r="11"><title>Current folded clutter at ${fmt(state.foldDepthKm, 2)} km</title></circle>`;
    svg += `<rect class="rg-target-dot" x="${currentX - 9}" y="${targetY - 9}" width="18" height="18" transform="rotate(45 ${currentX} ${targetY})"><title>Target depth cell</title></rect>`;
    svg += `<text class="${state.overlaps ? 'rg-danger' : 'rg-title'}" x="${currentX + 16}" y="${Math.min(image.plotBottom - 20, currentY + 6)}">current folded clutter dot</text>`;
    svg += '</svg>';
    overlay.innerHTML = svg;
  }

  function renderPrfSchedule(state) {
    const width = 560;
    const height = 330;
    const margin = { left: 62, right: 24, top: 44, bottom: 44 };
    const sx = (value) => margin.left + (value / model.distanceKm) * (width - margin.left - margin.right);
    const sy = (value) => margin.top + ((prfMaxHz - value) / (prfMaxHz - prfMinHz)) * (height - margin.top - margin.bottom);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="PRF schedule through the straight flyby">`;
    [520, 560, 600, 640, 680].forEach((tick) => {
      const y = sy(tick);
      svg += `<line class="rg-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="rg-label" x="${margin.left - 8}" y="${y + 4}" text-anchor="end">${fmt(tick, 0)}</text>`;
    });
    [0, 10, 20, 30, 40].forEach((tick) => {
      const x = sx(tick);
      svg += `<line class="rg-grid" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="rg-label" x="${x}" y="${height - margin.bottom + 18}" text-anchor="middle">${fmt(tick, 0)}</text>`;
    });
    if (mode === 'fixed') {
      svg += `<line class="rg-schedule-line" x1="${sx(0)}" y1="${sy(fixedPrfHz)}" x2="${sx(model.distanceKm)}" y2="${sy(fixedPrfHz)}"></line>`;
    } else {
      for (let block = 0; block < blockCount; block += 1) {
        const x1 = sx((block / blockCount) * model.distanceKm);
        const x2 = sx(((block + 1) / blockCount) * model.distanceKm);
        const y = sy(staggeredPrfsHz[block % staggeredPrfsHz.length]);
        svg += `<line class="rg-step-segment" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"></line>`;
      }
    }
    svg += `<line class="rg-current-line" x1="${sx(state.distanceKm)}" y1="${margin.top}" x2="${sx(state.distanceKm)}" y2="${height - margin.bottom}"></line>`;
    svg += `<circle class="rg-current-dot" cx="${sx(state.distanceKm)}" cy="${sy(state.prfHz)}" r="7"></circle>`;
    svg += `<text class="rg-title" x="${margin.left}" y="20">current PRF ${fmt(state.prfHz, 1)} Hz</text>`;
    svg += `<line class="rg-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="rg-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="rg-title" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 7}" text-anchor="middle">along-track distance (km)</text>`;
    svg += `<text class="rg-title" transform="translate(18 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">effective PRF (Hz)</text>`;
    svg += '</svg>';
    prfPlot.innerHTML = svg;
  }

  function renderFoldDepth(state) {
    const width = 560;
    const height = 330;
    const margin = { left: 68, right: 24, top: 44, bottom: 44 };
    const sx = (value) => margin.left + (value / model.distanceKm) * (width - margin.left - margin.right);
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * (height - margin.top - margin.bottom);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Folded clutter depth through the flyby">`;
    [1.5, 2.0, 2.5].forEach((tick) => {
      const y = sy(tick);
      svg += `<line class="rg-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="rg-label" x="${margin.left - 8}" y="${y + 4}" text-anchor="end">${fmt(tick, 1)}</text>`;
    });
    [0, 10, 20, 30, 40].forEach((tick) => {
      const x = sx(tick);
      svg += `<line class="rg-grid" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="rg-label" x="${x}" y="${height - margin.bottom + 18}" text-anchor="middle">${fmt(tick, 0)}</text>`;
    });
    svg += `<rect class="rg-target-window" x="${margin.left}" y="${sy(model.targetDepthKm - model.targetToleranceKm)}" width="${width - margin.left - margin.right}" height="${sy(model.targetDepthKm + model.targetToleranceKm) - sy(model.targetDepthKm - model.targetToleranceKm)}"></rect>`;
    svg += `<line class="rg-target-line" x1="${margin.left}" y1="${sy(model.targetDepthKm)}" x2="${width - margin.right}" y2="${sy(model.targetDepthKm)}"></line>`;
    if (mode === 'fixed') {
      svg += `<line class="rg-depth-line" x1="${sx(0)}" y1="${sy(state.foldDepthKm)}" x2="${sx(model.distanceKm)}" y2="${sy(state.foldDepthKm)}"></line>`;
    } else {
      for (let block = 0; block < blockCount; block += 1) {
        const x1 = sx((block / blockCount) * model.distanceKm);
        const x2 = sx(((block + 1) / blockCount) * model.distanceKm);
        const y = sy(foldDepthForPrf(staggeredPrfsHz[block % staggeredPrfsHz.length]));
        svg += `<line class="rg-step-segment" x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"></line>`;
      }
    }
    svg += `<line class="rg-current-line" x1="${sx(state.distanceKm)}" y1="${margin.top}" x2="${sx(state.distanceKm)}" y2="${height - margin.bottom}"></line>`;
    svg += `<circle class="rg-current-dot" cx="${sx(state.distanceKm)}" cy="${sy(state.foldDepthKm)}" r="7"></circle>`;
    svg += `<text class="${state.overlaps ? 'rg-danger' : 'rg-title'}" x="${margin.left}" y="20">fold depth ${fmt(state.foldDepthKm, 2)} km ${state.overlaps ? '(in target cell)' : '(away from target)'}</text>`;
    svg += `<line class="rg-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="rg-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="rg-title" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 7}" text-anchor="middle">along-track distance (km)</text>`;
    svg += `<text class="rg-title" transform="translate(18 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth (km)</text>`;
    svg += '</svg>';
    foldPlot.innerHTML = svg;
  }

  function renderCurrentCell(state) {
    const width = 560;
    const height = 330;
    const margin = { left: 88, right: 52, top: 38, bottom: 40 };
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * (height - margin.top - margin.bottom);
    const cx = margin.left + (width - margin.left - margin.right) / 2;
    const profileWidth = 190;
    const targetY = sy(model.targetDepthKm);
    const foldY = sy(state.foldDepthKm);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Current trace depth cell comparison">`;
    [1.5, 2.0, 2.5].forEach((tick) => {
      const y = sy(tick);
      svg += `<line class="rg-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="rg-label" x="${margin.left - 8}" y="${y + 4}" text-anchor="end">${fmt(tick, 1)} km</text>`;
    });
    svg += `<rect class="rg-target-window" x="${cx - profileWidth / 2}" y="${sy(model.targetDepthKm - model.targetToleranceKm)}" width="${profileWidth}" height="${sy(model.targetDepthKm + model.targetToleranceKm) - sy(model.targetDepthKm - model.targetToleranceKm)}"></rect>`;
    svg += `<line class="rg-target-line" x1="${cx - profileWidth / 2}" y1="${targetY}" x2="${cx + profileWidth / 2}" y2="${targetY}"></line>`;
    svg += `<ellipse class="rg-profile" cx="${cx}" cy="${foldY}" rx="86" ry="16"></ellipse>`;
    svg += `<circle class="rg-current-dot" cx="${cx}" cy="${foldY}" r="8"></circle>`;
    svg += `<rect class="rg-target-dot" x="${cx - 7}" y="${targetY - 7}" width="14" height="14" transform="rotate(45 ${cx} ${targetY})"></rect>`;
    svg += `<text class="${state.overlaps ? 'rg-danger' : 'rg-title'}" x="${margin.left}" y="20">${mode === 'fixed' ? 'one fixed PRF' : 'four-PRF block'} at ${fmt(state.distanceKm, 1)} km</text>`;
    svg += `<text class="rg-danger" x="${cx + profileWidth / 2 + 14}" y="${foldY + 4}">clutter dot</text>`;
    svg += `<text class="rg-title" x="${cx + profileWidth / 2 + 14}" y="${targetY - 9}">target</text>`;
    svg += `<line class="rg-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="rg-title" transform="translate(20 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth (km)</text>`;
    svg += '</svg>';
    cellPlot.innerHTML = svg;
  }

  function syncButtons() {
    fixedButton.classList.toggle('is-active', mode === 'fixed');
    staggeredButton.classList.toggle('is-active', mode === 'staggered');
    fixedButton.setAttribute('aria-pressed', mode === 'fixed' ? 'true' : 'false');
    staggeredButton.setAttribute('aria-pressed', mode === 'staggered' ? 'true' : 'false');
    caseSummary.textContent = mode === 'fixed'
      ? 'One wrong PRF is used for the whole straight-line pass, so the same fold depth repeats and looks like a continuous blur layer.'
      : 'Four nearby PRFs cycle by trace block, so the folded clutter appears as separated blobs at different apparent depths.';
  }

  function renderAll() {
    const state = currentState();
    traceOutput.textContent = `${fmt(state.distanceKm, 1)} km`;
    syncButtons();
    renderRadargram(state);
    renderPrfSchedule(state);
    renderFoldDepth(state);
    renderCurrentCell(state);
  }

  fixedButton.addEventListener('click', () => {
    mode = 'fixed';
    renderAll();
  });
  staggeredButton.addEventListener('click', () => {
    mode = 'staggered';
    renderAll();
  });
  traceSlider.addEventListener('input', renderAll);
  renderAll();
})();
