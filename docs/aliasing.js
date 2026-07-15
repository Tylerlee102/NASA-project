(() => {
  'use strict';

  const C = 299792458;
  const PROCESSING_TRACE_COUNT = 64;
  const PROCESSING_DEPTH_BINS = 96;
  const PROCESSING_MAX_DEPTH_KM = 24;
  const LISTEN_GUARD_US = 25;
  const model = {
    altitudeKm: 25,
    velocityKmS: 3.0,
    frequencyMhz: 60,
    targetDepthKm: 6.74,
    iceIndex: 1.78,
    pointCount: 12,
    spreadKm: 60,
    dopplerToleranceHz: 0,
    depthToleranceKm: 0
  };

  const prfSlider = document.getElementById('effective-prf-slider');
  const output = document.getElementById('effective-prf-output');
  const originalPrfText = document.getElementById('original-prf');
  const prfMinLabel = document.getElementById('prf-min-label');
  const prfMaxLabel = document.getElementById('prf-max-label');
  const status = document.getElementById('trace-status');
  const plot = document.getElementById('horizontal-plot');
  const blurPlot = document.getElementById('blur-plot');
  const liveRadargramPlot = document.getElementById('live-radargram-plot');
  const radargramClutterStrength = document.getElementById('radargram-clutter-strength');
  const radargramBlurThickness = document.getElementById('radargram-blur-thickness');
  const radargramContrast = document.getElementById('radargram-contrast');
  const radargramTargetEcho = document.getElementById('radargram-target-echo');
  const traceCheckPlot = document.getElementById('trace-check-plot');
  const dopplerCheckPlot = document.getElementById('doppler-check-plot');
  const radargramPlot = document.getElementById('radargram-plot');
  const fftPlot = document.getElementById('fft-plot');
  const decimatedFftPlot = document.getElementById('decimated-fft-plot');
  const reconstructionPlot = document.getElementById('reconstruction-plot');
  const wavelengthM = C / (model.frequencyMhz * 1e6);
  let processingRendered = false;
  const mod = (value, divisor) => ((value % divisor) + divisor) % divisor;
  const alias = (dopplerHz, prfHz) => mod(dopplerHz + prfHz / 2, prfHz) - prfHz / 2;
  const fmt = (value, digits = 0) => Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
  const signed = (value, digits = 1) => {
    const cleaned = Math.abs(value) < 0.05 ? 0 : value;
    return `${cleaned > 0 ? '+' : ''}${fmt(cleaned, digits)}`;
  };
  const percent = (value) => `${fmt(value * 100, 0)}%`;
  const readSlider = (input, fallback) => (input ? Number(input.value) : fallback);
  const radargramInputs = [
    radargramClutterStrength,
    radargramBlurThickness,
    radargramContrast,
    radargramTargetEcho
  ].filter(Boolean);

  function radargramSettings() {
    return {
      clutterStrength: readSlider(radargramClutterStrength, 1),
      blurThickness: readSlider(radargramBlurThickness, 1),
      contrast: readSlider(radargramContrast, 1.1),
      targetEcho: readSlider(radargramTargetEcho, 0.85)
    };
  }

  function updateRadargramControlOutputs() {
    const settings = radargramSettings();
    const outputs = {
      'radargram-clutter-strength-output': percent(settings.clutterStrength),
      'radargram-blur-thickness-output': percent(settings.blurThickness),
      'radargram-contrast-output': percent(settings.contrast),
      'radargram-target-echo-output': percent(settings.targetEcho)
    };
    Object.entries(outputs).forEach(([id, text]) => {
      const outputEl = document.getElementById(id);
      if (outputEl) outputEl.textContent = text;
    });
  }

  const fixedPoints = Array.from({ length: model.pointCount }, (_, index) => {
    const xKm = -model.spreadKm + (2 * model.spreadKm * index) / (model.pointCount - 1);
    const rangeKm = Math.hypot(model.altitudeKm, xKm);
    return {
      index,
      xKm,
      rangeKm,
      trueDopplerHz: (2 * model.velocityKmS * 1000 / wavelengthM) * (xKm / rangeKm),
      apparentDepthKm: (rangeKm - model.altitudeKm) / model.iceIndex
    };
  });
  const selectedFoldingPoint = [...fixedPoints].sort((a, b) => {
    const depthDelta = Math.abs(a.apparentDepthKm - model.targetDepthKm) - Math.abs(b.apparentDepthKm - model.targetDepthKm);
    if (Math.abs(depthDelta) > 1e-9) return depthDelta;
    return b.xKm - a.xKm;
  })[0];
  const foldingIndexes = new Set([selectedFoldingPoint.index]);
  const originalPrfHz = 4 * Math.abs(selectedFoldingPoint.trueDopplerHz);
  const targetEchoUs = (2 * (model.altitudeKm * 1000 + model.iceIndex * model.targetDepthKm * 1000) / C) * 1e6;
  const basePriUs = 1e6 / originalPrfHz;
  const safePrfMaxHz = 1e6 / (targetEchoUs + LISTEN_GUARD_US);
  model.dopplerToleranceHz = originalPrfHz / PROCESSING_TRACE_COUNT;
  model.depthToleranceKm = PROCESSING_MAX_DEPTH_KM / (PROCESSING_DEPTH_BINS - 1);

  const selectedFoldPrfHz = Math.abs(selectedFoldingPoint.trueDopplerHz);
  const sliderHalfWindowHz = Math.max(28, model.dopplerToleranceHz * 0.55);
  const sliderMinHz = Math.floor(selectedFoldPrfHz - sliderHalfWindowHz);
  const sliderMaxHz = Math.ceil(selectedFoldPrfHz + sliderHalfWindowHz);
  prfSlider.min = String(sliderMinHz);
  prfSlider.max = String(sliderMaxHz);
  prfSlider.value = selectedFoldPrfHz.toFixed(1);
  if (prfMinLabel) prfMinLabel.textContent = `${fmt(sliderMinHz, 0)} Hz`;
  if (prfMaxLabel) prfMaxLabel.textContent = `${fmt(sliderMaxHz, 0)} Hz`;

  document.getElementById('given-altitude').textContent = `${fmt(model.altitudeKm, 0)} km`;
  document.getElementById('given-speed').textContent = `${fmt(model.velocityKmS, 1)} km/s`;
  document.getElementById('given-frequency').textContent = `${fmt(model.frequencyMhz, 0)} MHz`;
  document.getElementById('given-depth').textContent = `${fmt(model.targetDepthKm, 2)} km`;
  document.getElementById('given-index').textContent = fmt(model.iceIndex, 2);

  function apparentDepthForDopplerHz(dopplerHz) {
    const sinTheta = Math.abs(dopplerHz) * wavelengthM / (2 * model.velocityKmS * 1000);
    if (sinTheta <= 0 || sinTheta >= 1) return null;
    const rangeKm = model.altitudeKm / Math.sqrt(1 - sinTheta ** 2);
    return (rangeKm - model.altitudeKm) / model.iceIndex;
  }

  // Search all physically possible alias orders. A continuous surface return
  // lies at zero aliased Doppler when |fD| = order × effectivePRF. The returned
  // band converts the stated ±Doppler tolerance into an apparent-depth span.
  function continuousFoldBand(effectivePrfHz) {
    const maximumDopplerHz = 2 * model.velocityKmS * 1000 / wavelengthM;
    const maximumOrder = Math.floor((maximumDopplerHz * (1 - 1e-9)) / effectivePrfHz);
    const candidates = [];
    for (let order = 1; order <= maximumOrder; order += 1) {
      const centerDopplerHz = order * effectivePrfHz;
      const centerDepthKm = apparentDepthForDopplerHz(centerDopplerHz);
      const toleranceDepths = [
        apparentDepthForDopplerHz(Math.max(0, centerDopplerHz - model.dopplerToleranceHz)),
        apparentDepthForDopplerHz(centerDopplerHz + model.dopplerToleranceHz)
      ].filter(Number.isFinite);
      if (!Number.isFinite(centerDepthKm) || !toleranceDepths.length) continue;
      candidates.push({
        order,
        centerDepthKm,
        minDepthKm: Math.min(centerDepthKm, ...toleranceDepths),
        maxDepthKm: Math.max(centerDepthKm, ...toleranceDepths)
      });
    }
    if (!candidates.length) return null;
    return candidates.reduce((best, candidate) => (
      Math.abs(candidate.centerDepthKm - model.targetDepthKm) < Math.abs(best.centerDepthKm - model.targetDepthKm)
        ? candidate
        : best
    ));
  }

  // Keep one fixed depth scale for the entire slider range. This prevents the
  // fixed target from appearing to move when only the folded clutter moves.
  const foldDepthScaleKm = (() => {
    const edgeBands = [Number(prfSlider.min), Number(prfSlider.max)]
      .map(continuousFoldBand)
      .filter(Boolean);
    const rawMin = Math.min(model.targetDepthKm - model.depthToleranceKm, ...edgeBands.map((band) => band.minDepthKm));
    const rawMax = Math.max(model.targetDepthKm + model.depthToleranceKm, ...edgeBands.map((band) => band.maxDepthKm));
    return {
      min: Math.floor((rawMin - 0.10) * 10) / 10,
      max: Math.ceil((rawMax + 0.10) * 10) / 10
    };
  })();

  function calculate(effectivePrfHz) {
    const points = fixedPoints.map((point) => ({
      ...point,
      aliasedDopplerHz: alias(point.trueDopplerHz, effectivePrfHz)
    }));
    const foldingReturn = points.find((point) => foldingIndexes.has(point.index));
    const selectedOverlaps = Math.abs(foldingReturn.aliasedDopplerHz) <= model.dopplerToleranceHz
      ? [foldingReturn]
      : [];
    return {
      points,
      foldingReturn,
      selectedOverlaps,
      effectivePrfHz,
      foldBand: continuousFoldBand(effectivePrfHz)
    };
  }

  function renderFoldDepthBlock(effectivePrfHz, foldBand, overlapsTarget) {
    const width = 560;
    const height = 350;
    const margin = { left: 68, right: 25, top: 50, bottom: 42 };
    const depthMinKm = foldDepthScaleKm.min;
    const depthMaxKm = foldDepthScaleKm.max;
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * (height - margin.top - margin.bottom);
    const foldIsVisible = Boolean(foldBand);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Folded clutter depth produced by the effective sampling PRF">
      <defs><linearGradient id="blur-block" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b3d3f" stop-opacity=".10"></stop><stop offset=".5" stop-color="#9b3d3f" stop-opacity="${overlapsTarget ? '.50' : '.30'}"></stop><stop offset="1" stop-color="#9b3d3f" stop-opacity=".10"></stop></linearGradient></defs>`;

    svg += `<text class="blur-title-text" x="${margin.left}" y="18">timing-safe trace PRF: ${fmt(originalPrfHz, 1)} Hz</text>`;
    svg += `<text class="blur-title-text" x="${margin.left}" y="35">effective sampling PRF: ${fmt(effectivePrfHz, 1)} Hz</text>`;
    for (let index = 0; index < 6; index += 1) {
      const value = depthMinKm + ((depthMaxKm - depthMinKm) * index) / 5;
      const y = sy(value);
      svg += `<line class="blur-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="blur-label" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${fmt(value, 2)}</text>`;
    }
    svg += `<line class="blur-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<rect class="blur-target-window" x="${margin.left}" y="${sy(model.targetDepthKm - model.depthToleranceKm)}" width="${width - margin.left - margin.right}" height="${sy(model.targetDepthKm + model.depthToleranceKm) - sy(model.targetDepthKm - model.depthToleranceKm)}"></rect>`;
    svg += `<line class="blur-target-depth" x1="${margin.left}" y1="${sy(model.targetDepthKm)}" x2="${width - margin.right}" y2="${sy(model.targetDepthKm)}"></line>`;
    svg += `<text class="blur-title-text" x="${width - margin.right}" y="${sy(model.targetDepthKm) - 7}" text-anchor="end">target ${fmt(model.targetDepthKm, 2)} km ± ${fmt(model.depthToleranceKm, 2)} km</text>`;

    if (foldIsVisible) {
      const bandTop = sy(foldBand.minDepthKm);
      const bandBottom = sy(foldBand.maxDepthKm);
      svg += `<rect class="blur-layer-block" x="${margin.left}" y="${bandTop}" width="${width - margin.left - margin.right}" height="${Math.max(1, bandBottom - bandTop)}"></rect>`;
      svg += `<line class="blur-layer-edge" x1="${margin.left}" y1="${sy(foldBand.centerDepthKm)}" x2="${width - margin.right}" y2="${sy(foldBand.centerDepthKm)}"></line>`;
      svg += `<text class="blur-title-text" x="${margin.left + 10}" y="${bandTop - 8}">order ${foldBand.order}: ${fmt(foldBand.centerDepthKm, 2)} km center</text>`;
    } else {
      svg += `<text class="blur-title-text" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${margin.top + 35}" text-anchor="middle">no zero-Doppler fold order reaches the modeled surface</text>`;
    }

    svg += `<text class="blur-title-text" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth (km, downward)</text>`;
    svg += '</svg>';
    blurPlot.innerHTML = svg;
  }

  function renderLiveRadargram(effectivePrfHz, foldBand, overlapsTarget) {
    const width = 820;
    const height = 315;
    const margin = { left: 70, right: 26, top: 36, bottom: 45 };
    const traceMin = 0;
    const traceMax = 63;
    const depthMinKm = Math.max(0, Math.floor((foldDepthScaleKm.min - 0.45) * 10) / 10);
    const depthMaxKm = Math.ceil((foldDepthScaleKm.max + 0.45) * 10) / 10;
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const sx = (value) => margin.left + ((value - traceMin) / (traceMax - traceMin)) * plotWidth;
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * plotHeight;
    const xTicks = [0, 16, 32, 48, 63];
    const yTicks = Array.from({ length: 5 }, (_, index) => depthMinKm + ((depthMaxKm - depthMinKm) * index) / 4);
    const aliasHz = alias(selectedFoldingPoint.trueDopplerHz, effectivePrfHz);
    const settings = radargramSettings();
    const blurOpacity = Math.min(0.62, (overlapsTarget ? 0.46 : 0.30) * settings.clutterStrength);
    const blurCoreOpacity = Math.min(0.48, 0.18 * settings.clutterStrength);
    const blobOpacity = Math.min(0.55, 0.22 * settings.clutterStrength);
    const targetOpacity = Math.min(1, Math.max(0, settings.targetEcho));
    const textureBrightness = 1.02 - Math.max(0, settings.contrast - 1) * 0.05;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Simplified synthetic radargram showing a folded surface-clutter blur moving with PRF">
      <defs>
        <filter id="alias-radargram-soften" x="-12%" y="-90%" width="124%" height="280%"><feGaussianBlur stdDeviation="${(5.5 * settings.blurThickness).toFixed(2)}"></feGaussianBlur></filter>
        <linearGradient id="alias-radargram-echo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3b3026" stop-opacity="0"></stop>
          <stop offset=".50" stop-color="#211912" stop-opacity="${blurOpacity.toFixed(3)}"></stop>
          <stop offset="1" stop-color="#3b3026" stop-opacity="0"></stop>
        </linearGradient>
        <radialGradient id="alias-target-glow">
          <stop offset="0" stop-color="#285f64" stop-opacity="${(0.26 * targetOpacity).toFixed(3)}"></stop>
          <stop offset=".62" stop-color="#285f64" stop-opacity="${(0.10 * targetOpacity).toFixed(3)}"></stop>
          <stop offset="1" stop-color="#285f64" stop-opacity="0"></stop>
        </radialGradient>
      </defs>`;

    svg += `<image class="matlab-radargram-texture" href="assets/fake_radargram_aliasing_texture.png?v=matlab-radargram-20260714" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" preserveAspectRatio="none" style="filter: contrast(${settings.contrast.toFixed(2)}) brightness(${textureBrightness.toFixed(2)});"></image>`;
    svg += `<rect class="fake-radargram-vignette" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>`;
    xTicks.forEach((value) => {
      const x = sx(value);
      svg += `<line class="fake-radargram-grid" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="fake-radargram-label" x="${x}" y="${height - margin.bottom + 18}" text-anchor="middle">${fmt(value, 0)}</text>`;
    });
    yTicks.forEach((value) => {
      const y = sy(value);
      svg += `<line class="fake-radargram-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="fake-radargram-label" x="${margin.left - 10}" y="${y + 4}" text-anchor="end">${fmt(value, 2)}</text>`;
    });
    if (foldBand) {
      const centerY = sy(foldBand.centerDepthKm);
      const bandPixelHeight = Math.max(18, Math.abs(sy(foldBand.maxDepthKm) - sy(foldBand.minDepthKm)) * 1.7 * settings.blurThickness);
      svg += `<rect class="fake-fold-smear" x="${margin.left + 4}" y="${centerY - bandPixelHeight / 2}" width="${plotWidth - 8}" height="${bandPixelHeight}" filter="url(#alias-radargram-soften)"></rect>`;
      svg += `<rect class="fake-fold-core" x="${margin.left + 4}" y="${centerY - Math.max(5, bandPixelHeight * 0.13)}" width="${plotWidth - 8}" height="${Math.max(10, bandPixelHeight * 0.26)}" opacity="${blurCoreOpacity.toFixed(3)}"></rect>`;
      [18, 32, 46].forEach((trace, index) => {
        const localY = centerY + Math.sin((trace + effectivePrfHz) * 0.08) * 4;
        svg += `<ellipse class="fake-fold-blob" cx="${sx(trace)}" cy="${localY}" rx="${(index === 1 ? 40 : 31) * settings.blurThickness}" ry="${(index === 1 ? 13 : 10) * settings.blurThickness}" opacity="${blobOpacity.toFixed(3)}" filter="url(#alias-radargram-soften)"></ellipse>`;
      });
      svg += `<text class="fake-fold-label" x="${margin.left + 8}" y="${Math.max(18, centerY - bandPixelHeight / 2 - 8)}">folded clutter echo: ${fmt(foldBand.centerDepthKm, 2)} km, alias ${signed(aliasHz, 1)} Hz</text>`;
    }

    const targetY = sy(model.targetDepthKm);
    svg += `<ellipse class="fake-target-glow" cx="${sx(32)}" cy="${targetY}" rx="62" ry="24" opacity="${targetOpacity.toFixed(3)}"></ellipse>`;
    svg += `<line class="fake-target-line" x1="${margin.left}" y1="${targetY}" x2="${width - margin.right}" y2="${targetY}" opacity="${(0.85 * targetOpacity).toFixed(3)}"></line>`;
    svg += `<rect class="fake-target-marker" x="${sx(32) - 6}" y="${targetY - 6}" width="12" height="12" opacity="${targetOpacity.toFixed(3)}" transform="rotate(45 ${sx(32)} ${targetY})"></rect>`;
    svg += `<text class="fake-radargram-title" x="${width - margin.right}" y="${targetY - 8}" text-anchor="end" opacity="${targetOpacity.toFixed(3)}">fixed target ${fmt(model.targetDepthKm, 2)} km</text>`;
    svg += `<rect class="fake-radargram-frame" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>`;
    svg += `<text class="fake-radargram-title" x="${margin.left}" y="17">current PRF ${fmt(effectivePrfHz, 1)} Hz; synthetic repeated-trace radargram</text>`;
    svg += `<text class="fake-radargram-label" x="${margin.left + plotWidth / 2}" y="${height - 7}" text-anchor="middle">trace number</text>`;
    svg += `<text class="fake-radargram-label" transform="translate(18 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">apparent depth (km, downward)</text>`;
    svg += '</svg>';
    liveRadargramPlot.innerHTML = svg;
  }

  // Check 1: compare only the selected clutter trace against the fixed target
  // trace. The clutter curve is solved so it crosses the target at the same
  // apparent depth; PRF decides whether the Doppler cell also matches.
  function renderTraceCheck(foldingReturn, overlapsTarget) {
    const width = 560;
    const height = 350;
    const margin = { left: 62, right: 24, top: 55, bottom: 42 };
    const xMinKm = -model.spreadKm;
    const xMaxKm = model.spreadKm;
    const depthMinKm = 0;
    const depthMaxKm = 12;
    const sx = (value) => margin.left + ((value - xMinKm) / (xMaxKm - xMinKm)) * (width - margin.left - margin.right);
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * (height - margin.top - margin.bottom);
    const pathFor = (depthAtX) => Array.from({ length: 181 }, (_, index) => {
      const xKm = xMinKm + ((xMaxKm - xMinKm) * index) / 180;
      return `${index ? 'L' : 'M'} ${sx(xKm).toFixed(2)} ${sy(depthAtX(xKm)).toFixed(2)}`;
    }).join(' ');
    const clutterTraceDepth = (platformXKm) => {
      const curvatureHeightKm = model.altitudeKm;
      const depthRiseAtCrossingKm = (
        Math.hypot(curvatureHeightKm, foldingReturn.xKm) - curvatureHeightKm
      ) / model.iceIndex;
      const apexDepthKm = model.targetDepthKm - depthRiseAtCrossingKm;
      return apexDepthKm + (
        Math.hypot(curvatureHeightKm, platformXKm - foldingReturn.xKm) - curvatureHeightKm
      ) / model.iceIndex;
    };
    const targetEquivalentRangeKm = model.altitudeKm + model.iceIndex * model.targetDepthKm;
    const targetTraceDepth = (platformXKm) => (
      Math.hypot(targetEquivalentRangeKm, platformXKm) - model.altitudeKm
    ) / model.iceIndex;
    const intersectionX = sx(0);
    const intersectionY = sy(model.targetDepthKm);
    const stateLabel = overlapsTarget ? 'same delay + folded Doppler' : 'same delay; Doppler separated';
    const aliasFraction = Math.max(-1, Math.min(1, foldingReturn.aliasedDopplerHz / (model.dopplerToleranceHz * 1.15)));
    const motionHalfWidthKm = Math.min(Math.abs(foldingReturn.xKm), 24);
    const movingXKm = aliasFraction * motionHalfWidthKm;
    const movingX = sx(movingXKm);
    const movingY = sy(clutterTraceDepth(movingXKm));
    const movingLabelAnchor = movingXKm >= 0 ? 'start' : 'end';
    const movingLabelX = movingX + (movingXKm >= 0 ? 10 : -10);
    const movingLabelY = movingY + (overlapsTarget ? 20 : -9);
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Selected clutter trace and fixed target trace crossing at 6.74 kilometers apparent depth">
      <defs><clipPath id="trace-check-clip"><rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${height - margin.top - margin.bottom}"></rect></clipPath></defs>`;

    svg += `<line class="check-clutter-curve selected" x1="${margin.left}" y1="16" x2="${margin.left + 28}" y2="16"></line>`;
    svg += `<text class="check-title" x="${margin.left + 35}" y="20">surface clutter hyperbola</text>`;
    svg += `<line class="check-target-curve" x1="${margin.left + 230}" y1="16" x2="${margin.left + 258}" y2="16"></line>`;
    svg += `<text class="check-title" x="${margin.left + 265}" y="20">subsurface target hyperbola</text>`;
    svg += `<text class="${overlapsTarget ? 'check-danger' : 'check-title'}" x="${margin.left}" y="40">trace 0: ${stateLabel}</text>`;

    [0, 3, 6, 9, 12].forEach((value) => {
      const y = sy(value);
      svg += `<line class="check-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="check-label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${fmt(value, 0)}</text>`;
    });
    [-60, -30, 0, 30, 60].forEach((value) => {
      const x = sx(value);
      svg += `<line class="check-grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="check-label" x="${x}" y="${height - margin.bottom + 17}" text-anchor="middle">${fmt(value, 0)}</text>`;
    });
    svg += `<rect class="check-target-window" x="${margin.left}" y="${sy(model.targetDepthKm - model.depthToleranceKm)}" width="${width - margin.left - margin.right}" height="${sy(model.targetDepthKm + model.depthToleranceKm) - sy(model.targetDepthKm - model.depthToleranceKm)}"></rect>`;
    svg += `<line class="check-guide" x1="${intersectionX}" y1="${margin.top}" x2="${intersectionX}" y2="${height - margin.bottom}"></line>`;
    svg += `<g clip-path="url(#trace-check-clip)">`;
    svg += `<path class="check-clutter-curve selected" d="${pathFor(clutterTraceDepth)}"><title>Selected clutter ${foldingReturn.index + 1} range trace</title></path>`;
    svg += `<path class="check-target-curve" d="${pathFor(targetTraceDepth)}"><title>Fixed subsurface target range trace</title></path>`;
    svg += '</g>';
    svg += `<line class="check-motion-guide" x1="${intersectionX}" y1="${intersectionY}" x2="${movingX}" y2="${movingY}"></line>`;
    svg += `<rect class="check-trace-target-marker" x="${intersectionX - 5}" y="${intersectionY - 5}" width="10" height="10" transform="rotate(45 ${intersectionX} ${intersectionY})"><title>Fixed subsurface target crossing</title></rect>`;
    svg += `<circle class="check-moving-clutter${overlapsTarget ? ' overlap' : ''}" cx="${movingX}" cy="${movingY}" r="6"><title>Selected clutter ${foldingReturn.index + 1}: ${signed(foldingReturn.aliasedDopplerHz, 1)} Hz folded Doppler</title></circle>`;
    svg += `<text class="${overlapsTarget ? 'check-danger' : 'check-title'}" x="${movingLabelX}" y="${movingLabelY}" text-anchor="${movingLabelAnchor}">moving clutter dot</text>`;
    svg += `<text class="${overlapsTarget ? 'check-danger' : 'check-title'}" x="${intersectionX + 10}" y="${intersectionY - 9}">${fmt(model.targetDepthKm, 2)} km crossing</text>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="check-title" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 5}" text-anchor="middle">along-track position (km)</text>`;
    svg += `<text class="check-title" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth / fast time (km)</text>`;
    svg += '</svg>';
    traceCheckPlot.innerHTML = svg;
  }

  // Check 2: show the target resolution cell in fast-time × Doppler space.
  // The selected clutter ellipse moves horizontally as its true Doppler aliases.
  function renderFastTimeDopplerCheck(effectivePrfHz, foldingReturn, overlapsTarget) {
    const width = 560;
    const height = 350;
    const margin = { left: 68, right: 25, top: 55, bottom: 48 };
    const dopplerMinHz = -60;
    const dopplerMaxHz = 60;
    const depthMinKm = 6.2;
    const depthMaxKm = 7.3;
    const sx = (value) => margin.left + ((value - dopplerMinHz) / (dopplerMaxHz - dopplerMinHz)) * (width - margin.left - margin.right);
    const sy = (value) => margin.top + ((value - depthMinKm) / (depthMaxKm - depthMinKm)) * (height - margin.top - margin.bottom);
    // Each response gets half the combined overlap tolerance. Their visible
    // tails touch exactly when the center-to-center tolerance is reached.
    const tailRadiusX = Math.abs(sx(model.dopplerToleranceHz / 2) - sx(0));
    const tailRadiusY = Math.abs(sy(model.targetDepthKm + model.depthToleranceKm / 2) - sy(model.targetDepthKm));
    const aliasLabel = signed(foldingReturn.aliasedDopplerHz, 1);
    const stateLabel = overlapsTarget ? 'folded tails overlap the target response' : 'folded tails remain separated from the target response';
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Fast-time by aliased Doppler check at ${fmt(effectivePrfHz, 1)} hertz; ${stateLabel}">
      <defs>
        <clipPath id="doppler-check-clip"><rect x="${margin.left}" y="${margin.top}" width="${width - margin.left - margin.right}" height="${height - margin.top - margin.bottom}"></rect></clipPath>
        <radialGradient id="clutter-tail"><stop offset="0" stop-color="#9b3d3f" stop-opacity=".55"></stop><stop offset=".55" stop-color="#d98473" stop-opacity=".25"></stop><stop offset="1" stop-color="#d98473" stop-opacity=".03"></stop></radialGradient>
        <radialGradient id="target-tail"><stop offset="0" stop-color="#2f6f73" stop-opacity=".50"></stop><stop offset=".58" stop-color="#2f6f73" stop-opacity=".20"></stop><stop offset="1" stop-color="#2f6f73" stop-opacity=".03"></stop></radialGradient>
      </defs>`;

    svg += `<text class="check-title" x="${margin.left}" y="18">selected clutter alias: ${aliasLabel} Hz</text>`;
    svg += `<text class="${overlapsTarget ? 'check-danger' : 'check-title'}" x="${margin.left}" y="39">${stateLabel}</text>`;
    [-50, -25, 0, 25, 50].forEach((value) => {
      const x = sx(value);
      svg += `<line class="check-grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="check-label" x="${x}" y="${height - margin.bottom + 17}" text-anchor="middle">${signed(value, 0)}</text>`;
    });
    [6.3, 6.5, 6.7, 6.9, 7.1, 7.3].forEach((value) => {
      const y = sy(value);
      svg += `<line class="check-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="check-label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
    });
    svg += `<g clip-path="url(#doppler-check-clip)">`;
    svg += `<rect class="check-target-window" x="${sx(-model.dopplerToleranceHz)}" y="${sy(model.targetDepthKm - model.depthToleranceKm)}" width="${sx(model.dopplerToleranceHz) - sx(-model.dopplerToleranceHz)}" height="${sy(model.targetDepthKm + model.depthToleranceKm) - sy(model.targetDepthKm - model.depthToleranceKm)}"></rect>`;
    svg += `<line class="check-target-line" x1="${sx(0)}" y1="${margin.top}" x2="${sx(0)}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-target-line" x1="${margin.left}" y1="${sy(model.targetDepthKm)}" x2="${width - margin.right}" y2="${sy(model.targetDepthKm)}"></line>`;
    svg += `<ellipse class="check-target-tail" cx="${sx(0)}" cy="${sy(model.targetDepthKm)}" rx="${tailRadiusX}" ry="${tailRadiusY}"></ellipse>`;
    svg += `<ellipse class="check-clutter-tail" cx="${sx(foldingReturn.aliasedDopplerHz)}" cy="${sy(foldingReturn.apparentDepthKm)}" rx="${tailRadiusX}" ry="${tailRadiusY}"><title>Selected clutter ${foldingReturn.index + 1}: ${aliasLabel} Hz at ${fmt(foldingReturn.apparentDepthKm, 2)} km</title></ellipse>`;
    svg += '</g>';
    svg += `<circle class="check-clutter-center" cx="${sx(foldingReturn.aliasedDopplerHz)}" cy="${sy(foldingReturn.apparentDepthKm)}" r="5"></circle>`;
    svg += `<rect class="check-target-center" x="${sx(0) - 5}" y="${sy(model.targetDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${sx(0)} ${sy(model.targetDepthKm)})"></rect>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="check-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="check-title" x="${margin.left + (width - margin.left - margin.right) / 2}" y="${height - 7}" text-anchor="middle">aliased Doppler (Hz)</text>`;
    svg += `<text class="check-title" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth / fast time (km)</text>`;
    svg += '</svg>';
    dopplerCheckPlot.innerHTML = svg;
  }

  const processingModel = {
    traceCount: PROCESSING_TRACE_COUNT,
    depthBins: PROCESSING_DEPTH_BINS,
    maxDepthKm: PROCESSING_MAX_DEPTH_KM,
    depthSigmaKm: 0.14,
    zoomDepthMinKm: 5.95,
    zoomDepthMaxKm: 7.55,
    zoomDopplerHz: 220
  };

  function fftComplex(input, inverse = false) {
    const n = input.length;
    const outputValues = input.map((value) => ({ re: value.re, im: value.im }));
    for (let i = 1, j = 0; i < n; i += 1) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const temporary = outputValues[i];
        outputValues[i] = outputValues[j];
        outputValues[j] = temporary;
      }
    }
    for (let length = 2; length <= n; length <<= 1) {
      const halfLength = length >> 1;
      const angle = (inverse ? 2 : -2) * Math.PI / length;
      const stepRe = Math.cos(angle);
      const stepIm = Math.sin(angle);
      for (let start = 0; start < n; start += length) {
        let wRe = 1;
        let wIm = 0;
        for (let offset = 0; offset < halfLength; offset += 1) {
          const even = outputValues[start + offset];
          const odd = outputValues[start + offset + halfLength];
          const rotatedRe = odd.re * wRe - odd.im * wIm;
          const rotatedIm = odd.re * wIm + odd.im * wRe;
          outputValues[start + offset] = {
            re: even.re + rotatedRe,
            im: even.im + rotatedIm
          };
          outputValues[start + offset + halfLength] = {
            re: even.re - rotatedRe,
            im: even.im - rotatedIm
          };
          const nextWRe = wRe * stepRe - wIm * stepIm;
          wIm = wRe * stepIm + wIm * stepRe;
          wRe = nextWRe;
        }
      }
    }
    if (inverse) {
      outputValues.forEach((value) => {
        value.re /= n;
        value.im /= n;
      });
    }
    return outputValues;
  }

  function transformRows(matrix, inverse = false) {
    return matrix.map((row) => fftComplex(row, inverse));
  }

  function magnitudeRows(matrix) {
    return matrix.map((row) => row.map((value) => Math.hypot(value.re, value.im)));
  }

  function shiftedSpectrum(specRows, prfHz, xMinHz = -prfHz / 2, xMaxHz = prfHz / 2) {
    const length = specRows[0].length;
    const half = length / 2;
    const shiftedIndexes = Array.from({ length }, (_, index) => (index + half) % length);
    const frequencies = shiftedIndexes.map((sourceIndex, shiftedIndex) => ({
      sourceIndex,
      frequencyHz: (shiftedIndex - half) * prfHz / length
    })).filter((entry) => entry.frequencyHz >= xMinHz && entry.frequencyHz <= xMaxHz);
    return {
      xMinHz,
      xMaxHz,
      data: specRows.map((row) => frequencies.map((entry) => row[entry.sourceIndex])),
      frequencies: frequencies.map((entry) => entry.frequencyHz)
    };
  }

  function surfaceScatterersForProcessing() {
    return fixedPoints.map((point) => {
      const selected = foldingIndexes.has(point.index);
      const mirrorOfSelected = !selected && Math.abs(point.trueDopplerHz + selectedFoldingPoint.trueDopplerHz) < 2;
      const angleWeight = 0.24 + 0.46 * Math.exp(-0.5 * ((Math.abs(point.xKm) - Math.abs(selectedFoldingPoint.xKm)) / 20) ** 2);
      return {
        kind: 'surface',
        label: selected ? `selected surface ${point.index + 1}` : `surface ${point.index + 1}`,
        depthKm: point.apparentDepthKm,
        dopplerHz: point.trueDopplerHz,
        amplitude: selected || mirrorOfSelected ? 1.0 : angleWeight,
        depthSigmaKm: processingModel.depthSigmaKm,
        phase: selected ? 0 : point.index * 0.71
      };
    });
  }

  function buildTraceMatrix(samplePrfHz) {
    const depthStepKm = processingModel.maxDepthKm / (processingModel.depthBins - 1);
    const scatterers = [
      ...surfaceScatterersForProcessing(),
      {
        kind: 'target',
        label: 'fixed subsurface target',
        depthKm: model.targetDepthKm,
        dopplerHz: 0,
        amplitude: 0.32,
        depthSigmaKm: 0.08,
        phase: 0
      }
    ];
    return Array.from({ length: processingModel.depthBins }, (_, depthIndex) => {
      const depthKm = depthIndex * depthStepKm;
      return Array.from({ length: processingModel.traceCount }, (_, traceIndex) => {
        let re = 0;
        let im = 0;
        scatterers.forEach((scatterer) => {
          const envelope = Math.exp(-0.5 * ((depthKm - scatterer.depthKm) / scatterer.depthSigmaKm) ** 2);
          if (envelope < 1e-4) return;
          const phase = 2 * Math.PI * (scatterer.dopplerHz / samplePrfHz) * traceIndex + scatterer.phase;
          const amplitude = scatterer.amplitude * envelope;
          re += amplitude * Math.cos(phase);
          im += amplitude * Math.sin(phase);
        });
        re += 0.012 * Math.sin(0.31 * depthIndex + 0.17 * traceIndex);
        im += 0.012 * Math.cos(0.23 * depthIndex - 0.11 * traceIndex);
        return { re, im };
      });
    });
  }

  function downsampleMatrix(matrix, step) {
    return matrix.map((row) => row.filter((_, traceIndex) => traceIndex % step === 0));
  }

  function zeroDopplerOnly(specRows) {
    return specRows.map((row) => row.map((value, index) => (
      index === 0 ? { re: value.re, im: value.im } : { re: 0, im: 0 }
    )));
  }

  function heatColor(value, maxValue, tint = 'red') {
    const normalized = maxValue > 0 ? Math.log1p(value) / Math.log1p(maxValue) : 0;
    const alpha = Math.max(0.02, Math.min(0.86, 0.04 + normalized * 0.82));
    if (tint === 'teal') return `rgba(47, 111, 115, ${alpha.toFixed(3)})`;
    if (tint === 'copper') return `rgba(184, 135, 52, ${alpha.toFixed(3)})`;
    return `rgba(155, 61, 63, ${alpha.toFixed(3)})`;
  }

  function valuesInDepthRange(data, depthMinKm, depthMaxKm) {
    const depthStepKm = processingModel.maxDepthKm / (processingModel.depthBins - 1);
    return data.map((row, depthIndex) => ({
      row,
      depthKm: depthIndex * depthStepKm
    })).filter((entry) => entry.depthKm >= depthMinKm && entry.depthKm <= depthMaxKm);
  }

  function maxFromPanels(panels) {
    return panels.reduce((currentMax, panel) => Math.max(
      currentMax,
      ...panel.visibleRows.flatMap((entry) => entry.row)
    ), 0);
  }

  function renderSingleProcessingHeatmap(container, options) {
    const width = 560;
    const height = 365;
    const margin = { left: 68, right: 25, top: 48, bottom: 46 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const visibleRows = valuesInDepthRange(options.data, options.depthMinKm, options.depthMaxKm);
    const columnCount = visibleRows[0].row.length;
    const maxValue = Math.max(...visibleRows.flatMap((entry) => entry.row));
    const sx = (value) => margin.left + ((value - options.xMin) / (options.xMax - options.xMin)) * plotWidth;
    const sy = (value) => margin.top + ((value - options.depthMinKm) / (options.depthMaxKm - options.depthMinKm)) * plotHeight;
    const cellWidth = plotWidth / columnCount;
    const cellHeight = plotHeight / visibleRows.length;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${options.ariaLabel}">`;
    svg += `<text class="processing-title" x="${margin.left}" y="18">${options.title}</text>`;
    svg += `<text class="processing-note" x="${margin.left}" y="36">${options.note}</text>`;
    options.yTicks.forEach((value) => {
      const y = sy(value);
      svg += `<line class="processing-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      svg += `<text class="processing-label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
    });
    options.xTicks.forEach((value) => {
      const x = sx(value);
      svg += `<line class="processing-grid-line" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line>`;
      svg += `<text class="processing-label" x="${x}" y="${height - margin.bottom + 17}" text-anchor="middle">${options.formatX(value)}</text>`;
    });
    svg += `<rect class="processing-frame" x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}"></rect>`;
    visibleRows.forEach((entry, rowIndex) => {
      entry.row.forEach((value, columnIndex) => {
        svg += `<rect class="processing-cell" x="${(margin.left + columnIndex * cellWidth).toFixed(2)}" y="${(margin.top + rowIndex * cellHeight).toFixed(2)}" width="${(cellWidth + 0.25).toFixed(2)}" height="${(cellHeight + 0.25).toFixed(2)}" fill="${heatColor(value, maxValue, options.tint)}"></rect>`;
      });
    });
    if (options.showZero) {
      svg += `<line class="processing-zero-line" x1="${sx(0)}" y1="${margin.top}" x2="${sx(0)}" y2="${height - margin.bottom}"></line>`;
    }
    svg += `<rect class="processing-target-window" x="${margin.left}" y="${sy(model.targetDepthKm - model.depthToleranceKm)}" width="${plotWidth}" height="${Math.max(1, sy(model.targetDepthKm + model.depthToleranceKm) - sy(model.targetDepthKm - model.depthToleranceKm))}"></rect>`;
    svg += `<line class="processing-target-line" x1="${margin.left}" y1="${sy(model.targetDepthKm)}" x2="${width - margin.right}" y2="${sy(model.targetDepthKm)}"></line>`;
    if (options.marker) {
      svg += `<circle class="processing-marker" cx="${sx(options.marker.x)}" cy="${sy(options.marker.depthKm)}" r="5"><title>${options.marker.label}</title></circle>`;
    }
    if (options.targetMarker) {
      svg += `<rect class="processing-target-marker" x="${sx(options.targetMarker.x) - 5}" y="${sy(model.targetDepthKm) - 5}" width="10" height="10" transform="rotate(45 ${sx(options.targetMarker.x)} ${sy(model.targetDepthKm)})"><title>subsurface target</title></rect>`;
    }
    svg += `<line class="processing-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="processing-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="processing-title" x="${margin.left + plotWidth / 2}" y="${height - 6}" text-anchor="middle">${options.xLabel}</text>`;
    svg += `<text class="processing-title" transform="translate(17 ${margin.top + plotHeight / 2}) rotate(-90)" text-anchor="middle">apparent depth (km)</text>`;
    svg += '</svg>';
    container.innerHTML = svg;
  }

  function renderStackedProcessingHeatmaps(container, options) {
    const width = 560;
    const height = 430;
    const margin = { left: 66, right: 25, top: 34, bottom: 45 };
    const gap = 10;
    const plotWidth = width - margin.left - margin.right;
    const panelHeight = (height - margin.top - margin.bottom - gap * (options.panels.length - 1)) / options.panels.length;
    const panels = options.panels.map((panel) => ({
      ...panel,
      visibleRows: valuesInDepthRange(panel.data, options.depthMinKm, options.depthMaxKm)
    }));
    const maxValue = maxFromPanels(panels);
    const sx = (value) => margin.left + ((value - options.xMin) / (options.xMax - options.xMin)) * plotWidth;
    const sy = (value, top) => top + ((value - options.depthMinKm) / (options.depthMaxKm - options.depthMinKm)) * panelHeight;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${options.ariaLabel}">`;
    svg += `<text class="processing-title" x="${margin.left}" y="16">${options.title}</text>`;
    panels.forEach((panel, panelIndex) => {
      const top = margin.top + panelIndex * (panelHeight + gap);
      const columnCount = panel.visibleRows[0].row.length;
      const cellWidth = plotWidth / columnCount;
      const cellHeight = panelHeight / panel.visibleRows.length;
      svg += `<text class="${panel.danger ? 'processing-danger' : 'processing-title'}" x="${margin.left + 7}" y="${top + 13}" text-anchor="start">${panel.label}</text>`;
      options.yTicks.forEach((value) => {
        const y = sy(value, top);
        svg += `<line class="processing-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line>`;
      });
      options.xTicks.forEach((value) => {
        const x = sx(value);
        svg += `<line class="processing-grid-line" x1="${x}" y1="${top}" x2="${x}" y2="${top + panelHeight}"></line>`;
      });
      svg += `<rect class="processing-frame" x="${margin.left}" y="${top}" width="${plotWidth}" height="${panelHeight}"></rect>`;
      panel.visibleRows.forEach((entry, rowIndex) => {
        entry.row.forEach((value, columnIndex) => {
          svg += `<rect class="processing-cell" x="${(margin.left + columnIndex * cellWidth).toFixed(2)}" y="${(top + rowIndex * cellHeight).toFixed(2)}" width="${(cellWidth + 0.25).toFixed(2)}" height="${(cellHeight + 0.25).toFixed(2)}" fill="${heatColor(value, maxValue, panel.tint || options.tint)}"></rect>`;
        });
      });
      if (options.showZero) {
        svg += `<line class="processing-zero-line" x1="${sx(0)}" y1="${top}" x2="${sx(0)}" y2="${top + panelHeight}"></line>`;
      }
      svg += `<rect class="processing-target-window" x="${margin.left}" y="${sy(model.targetDepthKm - model.depthToleranceKm, top)}" width="${plotWidth}" height="${Math.max(1, sy(model.targetDepthKm + model.depthToleranceKm, top) - sy(model.targetDepthKm - model.depthToleranceKm, top))}"></rect>`;
      svg += `<line class="processing-target-line" x1="${margin.left}" y1="${sy(model.targetDepthKm, top)}" x2="${width - margin.right}" y2="${sy(model.targetDepthKm, top)}"></line>`;
      if (panel.note) {
        svg += `<text class="${panel.danger ? 'processing-danger' : 'processing-note'}" x="${width - margin.right}" y="${top + 13}" text-anchor="end">${panel.note}</text>`;
      }
    });
    options.xTicks.forEach((value) => {
      const x = sx(value);
      svg += `<text class="processing-label" x="${x}" y="${height - margin.bottom + 17}" text-anchor="middle">${options.formatX(value)}</text>`;
    });
    options.yTicks.forEach((value) => {
      const y = sy(value, margin.top + panelHeight + gap);
      svg += `<text class="processing-label" x="${margin.left - 9}" y="${y + 4}" text-anchor="end">${fmt(value, 1)}</text>`;
    });
    svg += `<line class="processing-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>`;
    svg += `<line class="processing-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>`;
    svg += `<text class="processing-title" x="${margin.left + plotWidth / 2}" y="${height - 6}" text-anchor="middle">${options.xLabel}</text>`;
    svg += `<text class="processing-title" transform="translate(17 ${margin.top + (height - margin.top - margin.bottom) / 2}) rotate(-90)" text-anchor="middle">apparent depth (km)</text>`;
    svg += '</svg>';
    container.innerHTML = svg;
  }

  function processingExperiment() {
    const rawMatrix = buildTraceMatrix(originalPrfHz);
    const nonTunedOriginalPrfHz = originalPrfHz * 0.93;
    const nonTunedMatrix = buildTraceMatrix(nonTunedOriginalPrfHz);
    const cases = [
      { label: 'all', step: 1, prfHz: originalPrfHz, matrix: rawMatrix },
      { label: 'every 2nd', step: 2, prfHz: originalPrfHz / 2, matrix: downsampleMatrix(rawMatrix, 2) },
      { label: '4th tuned', step: 4, prfHz: originalPrfHz / 4, matrix: downsampleMatrix(rawMatrix, 4) },
      { label: '4th non-tuned', step: 4, prfHz: nonTunedOriginalPrfHz / 4, matrix: downsampleMatrix(nonTunedMatrix, 4) }
    ].map((entry) => ({
      ...entry,
      spectrum: transformRows(entry.matrix)
    }));
    return {
      rawMatrix,
      rawMagnitude: magnitudeRows(rawMatrix),
      cases,
      nonTunedOriginalPrfHz
    };
  }

  function renderProcessingExperiment() {
    const experiment = processingExperiment();
    const allCase = experiment.cases[0];
    const fullSpectrum = shiftedSpectrum(allCase.spectrum, allCase.prfHz);
    const selectedAliasEveryFour = alias(selectedFoldingPoint.trueDopplerHz, originalPrfHz / 4);

    renderSingleProcessingHeatmap(radargramPlot, {
      data: experiment.rawMagnitude,
      depthMinKm: 0,
      depthMaxKm: processingModel.maxDepthKm,
      xMin: 0,
      xMax: processingModel.traceCount - 1,
      xTicks: [0, 16, 32, 48, 63],
      yTicks: [0, 6, 12, 18, 24],
      tint: 'teal',
      title: 'synthetic radargram: 64 traces, 12 surface points, one target',
      note: 'selected and mirror surface points are comparable; other points use angle weighting',
      xLabel: 'trace number',
      ariaLabel: 'Generated complex radargram with twelve surface scatterers and one fixed subsurface target',
      formatX: (value) => fmt(value, 0),
      targetMarker: { x: 32 }
    });

    renderSingleProcessingHeatmap(fftPlot, {
      data: magnitudeRows(fullSpectrum.data),
      depthMinKm: 0,
      depthMaxKm: processingModel.maxDepthKm,
      xMin: fullSpectrum.xMinHz,
      xMax: fullSpectrum.xMaxHz,
      xTicks: [-originalPrfHz / 2, -selectedFoldingPoint.trueDopplerHz, 0, selectedFoldingPoint.trueDopplerHz, originalPrfHz / 2],
      yTicks: [0, 6, 12, 18, 24],
      tint: 'copper',
      title: `pre-decimation Doppler image at ${fmt(originalPrfHz, 1)} Hz sampling`,
      note: `selected clutter is at true Doppler ${signed(selectedFoldingPoint.trueDopplerHz, 1)} Hz, not yet at 0 Hz`,
      xLabel: 'Doppler frequency (Hz)',
      ariaLabel: 'Original all-trace along-track FFT before trace deletion',
      formatX: (value) => signed(value, 0),
      showZero: true,
      marker: {
        x: selectedFoldingPoint.trueDopplerHz,
        depthKm: selectedFoldingPoint.apparentDepthKm,
        label: 'selected surface clutter true Doppler'
      },
      targetMarker: { x: 0 }
    });

    renderStackedProcessingHeatmaps(decimatedFftPlot, {
      panels: experiment.cases.map((entry) => {
        const zoomSpectrum = shiftedSpectrum(
          entry.spectrum,
          entry.prfHz,
          -processingModel.zoomDopplerHz,
          processingModel.zoomDopplerHz
        );
        const selectedAliasHz = alias(selectedFoldingPoint.trueDopplerHz, entry.prfHz);
        return {
          label: entry.label,
          data: magnitudeRows(zoomSpectrum.data),
          danger: Math.abs(selectedAliasHz) < 1,
          note: `selected alias ${signed(selectedAliasHz, 1)} Hz`,
          tint: Math.abs(selectedAliasHz) < 1 ? 'red' : 'copper'
        };
      }),
      depthMinKm: processingModel.zoomDepthMinKm,
      depthMaxKm: processingModel.zoomDepthMaxKm,
      xMin: -processingModel.zoomDopplerHz,
      xMax: processingModel.zoomDopplerHz,
      xTicks: [-200, -100, 0, 100, 200],
      yTicks: [6.0, model.targetDepthKm, 7.5],
      tint: 'red',
      title: 'trace decimation FFT: tuned fold plus non-tuned check',
      xLabel: 'aliased Doppler near target cell (Hz)',
      ariaLabel: 'Recalculated FFTs after keeping all traces every second trace and every fourth trace',
      formatX: (value) => signed(value, 0),
      showZero: true
    });

    renderStackedProcessingHeatmaps(reconstructionPlot, {
      panels: experiment.cases.map((entry) => {
        const zeroOnly = zeroDopplerOnly(entry.spectrum);
        const reconstructed = magnitudeRows(transformRows(zeroOnly, true));
        const selectedAliasHz = alias(selectedFoldingPoint.trueDopplerHz, entry.prfHz);
        return {
          label: entry.label,
          data: reconstructed,
          danger: Math.abs(selectedAliasHz) < 1,
          note: Math.abs(selectedAliasHz) < 1
            ? 'folded clutter reconstructs at target depth'
            : 'target only in 0-Hz cell',
          tint: Math.abs(selectedAliasHz) < 1 ? 'red' : 'teal'
        };
      }),
      depthMinKm: processingModel.zoomDepthMinKm,
      depthMaxKm: processingModel.zoomDepthMaxKm,
      xMin: 0,
      xMax: 1,
      xTicks: [0, 0.25, 0.5, 0.75, 1],
      yTicks: [6.0, model.targetDepthKm, 7.5],
      tint: 'teal',
      title: `zero-Doppler reconstruction; tuned every-4 alias = ${signed(selectedAliasEveryFour, 1)} Hz`,
      xLabel: 'normalized along-track aperture',
      ariaLabel: 'Inverse FFT reconstruction of the zero Doppler cell after trace deletion',
      formatX: (value) => `${fmt(value * 100, 0)}%`,
      showZero: false
    });
  }

  function draw(effectivePrfHz) {
    const { points, foldingReturn, selectedOverlaps, foldBand } = calculate(effectivePrfHz);
    const discreteTargetOverlap = selectedOverlaps.some((point) => Math.abs(point.apparentDepthKm - model.targetDepthKm) <= model.depthToleranceKm);
    const continuousBandOverlapsTarget = Boolean(foldBand)
      && foldBand.maxDepthKm >= model.targetDepthKm - model.depthToleranceKm
      && foldBand.minDepthKm <= model.targetDepthKm + model.depthToleranceKm;
    const targetOverlap = discreteTargetOverlap && continuousBandOverlapsTarget;
    const width = 560;
    const height = 350;
    const surfaceY = 138;
    const satelliteX = width / 2;
    const satelliteY = 34;
    const left = 64;
    const right = 38;
    const targetDepthRangeKm = 12;
    const sx = (xKm) => left + ((xKm + model.spreadKm) / (2 * model.spreadKm)) * (width - left - right);
    const depthToY = (depthKm) => surfaceY + (depthKm / targetDepthRangeKm) * 145;
    const targetY = depthToY(model.targetDepthKm);
    const foldIsVisible = Boolean(foldBand) && foldBand.minDepthKm <= targetDepthRangeKm && foldBand.maxDepthKm >= 0;
    const blurTopY = foldIsVisible ? depthToY(Math.max(0, foldBand.minDepthKm)) : null;
    const blurBottomY = foldIsVisible ? depthToY(Math.min(targetDepthRangeKm, foldBand.maxDepthKm)) : null;
    let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Fixed satellite above twelve fixed surface clutter points and one fixed subsurface target; the slider changes only effective sampling PRF">
      <defs>
        <radialGradient id="target-blur"><stop offset="0" stop-color="#9b3d3f" stop-opacity=".44"></stop><stop offset=".45" stop-color="#d98473" stop-opacity=".16"></stop><stop offset="1" stop-color="#d98473" stop-opacity="0"></stop></radialGradient>
        <linearGradient id="fold-band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b3d3f" stop-opacity="0"></stop><stop offset=".5" stop-color="#9b3d3f" stop-opacity=".30"></stop><stop offset="1" stop-color="#9b3d3f" stop-opacity="0"></stop></linearGradient>
        <marker id="velocity-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#17494d"></path></marker>
      </defs>`;
    svg += `<line class="geometry-surface" x1="${left}" y1="${surfaceY}" x2="${width - right}" y2="${surfaceY}"></line>`;
    svg += `<line class="geometry-depth-guide" x1="${satelliteX}" y1="${surfaceY}" x2="${satelliteX}" y2="${targetY}"></line>`;
    svg += `<line class="geometry-nadir" x1="${satelliteX}" y1="${satelliteY + 9}" x2="${satelliteX}" y2="${targetY - 10}"></line>`;
    svg += `<line class="geometry-ray ${targetOverlap ? 'overlap' : ''}" x1="${satelliteX}" y1="${satelliteY + 9}" x2="${sx(foldingReturn.xKm)}" y2="${surfaceY - 7}"></line>`;
    if (foldIsVisible) {
      svg += `<rect class="geometry-fold-band" x="${left}" y="${blurTopY}" width="${width - left - right}" height="${Math.max(1, blurBottomY - blurTopY)}"></rect>`;
      svg += `<line class="geometry-fold-line" x1="${left}" y1="${depthToY(foldBand.centerDepthKm)}" x2="${width - right}" y2="${depthToY(foldBand.centerDepthKm)}"></line>`;
    }
    if (targetOverlap) svg += `<circle class="geometry-blur" cx="${satelliteX}" cy="${targetY}" r="56"></circle>`;
    svg += `<circle class="geometry-satellite" cx="${satelliteX}" cy="${satelliteY}" r="8"></circle>`;
    svg += `<line class="geometry-velocity" x1="${satelliteX + 12}" y1="${satelliteY}" x2="${satelliteX + 82}" y2="${satelliteY}" marker-end="url(#velocity-arrow)"></line>`;
    svg += `<text class="geometry-value" x="${satelliteX + 18}" y="${satelliteY - 13}">satellite and geometry fixed</text>`;
    svg += `<text class="geometry-title" x="${left}" y="${surfaceY - 23}">surface clutter - 12 fixed points</text>`;
    svg += `<text class="geometry-title" x="${satelliteX + 16}" y="${targetY + 33}">one fixed subsurface target</text>`;
    points.forEach((point) => {
      const isFoldingPoint = foldingIndexes.has(point.index);
      const css = isFoldingPoint ? (targetOverlap ? 'overlap' : 'closest') : '';
      svg += `<circle class="geometry-surface-point ${css}" cx="${sx(point.xKm)}" cy="${surfaceY}" r="${isFoldingPoint ? 8 : 6}"><title>Clutter ${point.index + 1}: aliased Doppler ${fmt(point.aliasedDopplerHz, 1)} Hz</title></circle>`;
    });
    svg += `<rect class="geometry-target ${targetOverlap ? 'overlap' : ''}" x="${satelliteX - 8}" y="${targetY - 8}" width="16" height="16" transform="rotate(45 ${satelliteX} ${targetY})"><title>Single fixed subsurface target: 0 Hz at ${fmt(model.targetDepthKm, 2)} km</title></rect>`;
    if (foldIsVisible) {
      svg += `<text class="geometry-value" x="${left + 12}" y="${blurTopY - 8}">continuous fold order ${foldBand.order}: ${fmt(foldBand.minDepthKm, 2)}-${fmt(foldBand.maxDepthKm, 2)} km</text>`;
    } else {
      svg += `<text class="geometry-value" x="${left + 12}" y="${surfaceY + 24}">no zero-Doppler fold in the 0-12 km view</text>`;
    }
    if (targetOverlap) {
      svg += `<text class="geometry-danger" x="${satelliteX}" y="${targetY + 56}" text-anchor="middle">CLUTTER / TARGET OVERLAP</text>`;
    }
    svg += `<text class="geometry-label" x="${satelliteX + 16}" y="${(surfaceY + targetY) / 2}">target depth ${fmt(model.targetDepthKm, 2)} km</text>`;
    svg += '</svg>';
    plot.innerHTML = svg;

    renderFoldDepthBlock(effectivePrfHz, foldBand, targetOverlap);
    renderLiveRadargram(effectivePrfHz, foldBand, targetOverlap);
    renderTraceCheck(foldingReturn, targetOverlap);
    renderFastTimeDopplerCheck(effectivePrfHz, foldingReturn, targetOverlap);
    if (!processingRendered) {
      renderProcessingExperiment();
      processingRendered = true;
    }
    originalPrfText.textContent = `Base trace PRF: ${fmt(originalPrfHz, 1)} Hz; PRI ${fmt(basePriUs, 1)} µs > echo ${fmt(targetEchoUs, 1)} µs + ${fmt(LISTEN_GUARD_US, 0)} µs guard. Max safe PRF ≈ ${fmt(safePrfMaxHz, 0)} Hz.`;
    output.textContent = `${fmt(effectivePrfHz, 1)} Hz`;
    status.className = `prf-status${targetOverlap ? ' is-overlap' : ''}`;
    if (targetOverlap) {
      status.textContent = `Overlap at ${fmt(effectivePrfHz, 1)} Hz: the selected clutter point ${foldingReturn.index + 1} satisfies the Doppler-plus-depth tolerance rule with the fixed target.`;
    } else if (!foldBand) {
      status.textContent = `No overlap at ${fmt(effectivePrfHz, 1)} Hz: no zero-Doppler fold order reaches the modeled surface.`;
    } else {
      status.textContent = `No overlap at ${fmt(effectivePrfHz, 1)} Hz: the order-${foldBand.order} continuous band is ${fmt(foldBand.minDepthKm, 2)}-${fmt(foldBand.maxDepthKm, 2)} km and does not satisfy the complete target-overlap rule.`;
    }
  }

  radargramInputs.forEach((input) => {
    input.addEventListener('input', () => {
      updateRadargramControlOutputs();
      draw(Number(prfSlider.value));
    });
  });
  updateRadargramControlOutputs();
  prfSlider.addEventListener('input', () => draw(Number(prfSlider.value)));
  draw(Number(prfSlider.value));
})();
