(() => {
  'use strict';

  const C = 299792458;
  const model = {
    altitudeKm: 25,
    velocityKmS: 4.6,
    frequencyMhz: 60,
    targetDepthKm: 6.74,
    iceIndex: 1.78,
    pointCount: 12,
    spreadKm: 60,
    dopplerToleranceHz: 25,
    depthToleranceKm: 0.15
  };

  const prfSlider = document.getElementById('effective-prf-slider');
  const output = document.getElementById('effective-prf-output');
  const originalPrfText = document.getElementById('original-prf');
  const status = document.getElementById('trace-status');
  const plot = document.getElementById('horizontal-plot');
  const blurPlot = document.getElementById('blur-plot');
  const traceCheckPlot = document.getElementById('trace-check-plot');
  const dopplerCheckPlot = document.getElementById('doppler-check-plot');
  const wavelengthM = C / (model.frequencyMhz * 1e6);
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

    svg += `<text class="blur-title-text" x="${margin.left}" y="18">original trace PRF fixed: ${fmt(originalPrfHz, 1)} Hz</text>`;
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
    svg += `<text class="check-title" x="${margin.left + 35}" y="20">selected clutter ${foldingReturn.index + 1}</text>`;
    svg += `<line class="check-target-curve" x1="${margin.left + 230}" y1="16" x2="${margin.left + 258}" y2="16"></line>`;
    svg += `<text class="check-title" x="${margin.left + 265}" y="20">subsurface target</text>`;
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
    renderTraceCheck(foldingReturn, targetOverlap);
    renderFastTimeDopplerCheck(effectivePrfHz, foldingReturn, targetOverlap);
    originalPrfText.textContent = `Fixed transmitted/trace PRF: ${fmt(originalPrfHz, 1)} Hz. Only the effective Doppler sampling rate moves.`;
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

  prfSlider.addEventListener('input', () => draw(Number(prfSlider.value)));
  draw(Number(prfSlider.value));
})();
